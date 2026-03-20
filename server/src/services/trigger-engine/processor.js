// ============================================================================
// GigShield AI — Claim Processing Pipeline
// ============================================================================
// When a trigger fires, this pipeline:
//   1. Finds all active policies in the affected zone
//   2. Creates claims for matching disruption types
//   3. Sends each claim to the Fraud Detection AI
//   4. Auto-approves clean claims or queues flagged ones
//   5. Triggers payout simulation for approved claims
// ============================================================================

const { query, withTransaction } = require('../../config/db');
const logger = require('../../utils/logger');
const { generateClaimNumber, generateTransactionRef, getPayoutAmount } = require('../../utils/helpers');

const FRAUD_SERVICE_URL = process.env.FRAUD_API_URL || 'http://localhost:8002';

const ClaimProcessor = {
  /**
   * Process a triggered disruption for a zone.
   *
   * @param {Object} triggerResult - The trigger detection result
   * @param {Object} zone - The affected zone
   * @param {Object} envData - Raw environmental snapshot
   * @returns {Object} Processing summary
   */
  async process(triggerResult, zone, envData) {
    const {
      disruption_type, severity, confidence: mlConfidence,
      measured_value, threshold_value, evidence,
    } = triggerResult;

    logger.info(`
    ⚡ TRIGGER FIRED
    Zone:       ${zone.zone_name} (${zone.city})
    Type:       ${disruption_type}
    Severity:   ${severity}
    Confidence: ${mlConfidence}
    Measured:   ${measured_value} (threshold: ${threshold_value})
    `);

    const results = {
      zone_id: zone.id,
      zone_name: zone.zone_name,
      disruption_type,
      severity,
      trigger_confidence: mlConfidence,
      claims_created: 0,
      claims_skipped: 0,
      claims_auto_approved: 0,
      claims_flagged: 0,
      payouts_initiated: 0,
      total_payout_amount: 0,
      errors: [],
    };

    try {
      // ── Step 1: Record the disruption trigger in DB ──
      const trigger = await _recordTrigger(zone.id, triggerResult, envData);

      // ── Step 2: Find active policies matching this disruption ──
      const policies = await _findMatchingPolicies(zone.id, disruption_type);

      if (policies.length === 0) {
        logger.info(`   No active policies for ${disruption_type} in ${zone.zone_name}`);
        return results;
      }

      logger.info(`   Found ${policies.length} matching active policies`);

      // ── Step 3: Process each policy ──
      for (const policy of policies) {
        try {
          // Check weekly claim limit
          const weeklyClaimCount = await _getWeeklyClaimCount(policy.id);
          if (weeklyClaimCount >= (policy.max_claims_per_week || 2)) {
            results.claims_skipped++;
            continue;
          }

          // Create claim
          const claim = await _createClaim(policy, trigger.id, triggerResult, zone);
          results.claims_created++;

          // ── Step 4: Fraud check ──
          const fraudResult = await _checkFraud(claim, policy, zone, envData);

          // Update claim with fraud score
          await _updateClaimFraudScore(claim.id, fraudResult);

          if (fraudResult.fraud_score >= 0.8) {
            // BLOCKED: high fraud risk
            await _updateClaimStatus(claim.id, 'blocked');
            results.claims_flagged++;
            logger.warn(`   ⛔ Claim blocked (fraud: ${fraudResult.fraud_score}): ${claim.claim_number}`);

          } else if (fraudResult.fraud_score >= 0.3) {
            // REVIEW: moderate fraud risk
            await _updateClaimStatus(claim.id, 'under_review');
            results.claims_flagged++;
            logger.info(`   🔍 Claim queued for review (fraud: ${fraudResult.fraud_score}): ${claim.claim_number}`);

          } else {
            // ── Step 5: Auto-approve + payout ──
            await _updateClaimStatus(claim.id, 'auto_approved');
            const payout = await _processPayout(claim, policy);
            results.claims_auto_approved++;
            results.payouts_initiated++;
            results.total_payout_amount += parseFloat(policy.payout_amount);
            logger.info(`   ✅ Auto-approved + payout ₹${policy.payout_amount}: ${claim.claim_number}`);
          }

        } catch (policyErr) {
          results.errors.push({
            policy_id: policy.id,
            error: policyErr.message,
          });
          logger.error(`   Error processing policy ${policy.id}: ${policyErr.message}`);
        }
      }

      // ── Update trigger status ──
      await query(
        `UPDATE disruption_triggers SET status = 'confirmed'
         WHERE id = $1`,
        [trigger.id]
      );

    } catch (err) {
      logger.error(`Claim processing failed for ${zone.zone_name}: ${err.message}`);
      results.errors.push({ error: err.message });
    }

    // ── Summary log ──
    logger.info(`
    📊 TRIGGER RESULTS — ${zone.zone_name}
    Claims Created:      ${results.claims_created}
    Auto-Approved:       ${results.claims_auto_approved}
    Flagged:             ${results.claims_flagged}
    Skipped (limit):     ${results.claims_skipped}
    Payouts Initiated:   ${results.payouts_initiated}
    Total Payout:        ₹${results.total_payout_amount}
    Errors:              ${results.errors.length}
    `);

    return results;
  },
};

// ══════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ══════════════════════════════════════════════════════════════════════

async function _recordTrigger(zoneId, triggerResult, envData) {
  const { rows } = await query(
    `INSERT INTO disruption_triggers
       (zone_id, disruption_type, measured_value, threshold_value,
        ml_confidence, status, severity, source_data)
     VALUES ($1, $2, $3, $4, $5, 'detected', $6, $7)
     RETURNING *`,
    [
      zoneId,
      triggerResult.disruption_type,
      triggerResult.measured_value,
      triggerResult.threshold_value,
      triggerResult.confidence,
      triggerResult.severity,
      JSON.stringify({ evidence: triggerResult.evidence, env_snapshot: envData }),
    ]
  );
  return rows[0];
}

async function _findMatchingPolicies(zoneId, disruptionType) {
  const { rows } = await query(
    `SELECT p.*, u.name as worker_name, u.upi_id, u.phone
     FROM policies p
     JOIN users u ON p.worker_id = u.id
     WHERE p.zone_id = $1
       AND p.disruption_type = $2
       AND p.status = 'active'
       AND CURRENT_DATE BETWEEN p.week_start AND p.week_end`,
    [zoneId, disruptionType]
  );
  return rows;
}

async function _getWeeklyClaimCount(policyId) {
  const { rows } = await query(
    `SELECT COUNT(*) as count FROM claims
     WHERE policy_id = $1
       AND created_at >= NOW() - INTERVAL '7 days'`,
    [policyId]
  );
  return parseInt(rows[0].count);
}

async function _createClaim(policy, triggerId, triggerResult, zone) {
  const claimNumber = generateClaimNumber();
  const { rows } = await query(
    `INSERT INTO claims
       (policy_id, worker_id, trigger_id, zone_id, claim_number,
        disruption_type, claim_amount, status, evidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'under_review', $8)
     RETURNING *`,
    [
      policy.id,
      policy.worker_id,
      triggerId,
      zone.id,
      claimNumber,
      triggerResult.disruption_type,
      policy.payout_amount,
      JSON.stringify({
        trigger: triggerResult.evidence,
        measured_value: triggerResult.measured_value,
        threshold_value: triggerResult.threshold_value,
        severity: triggerResult.severity,
        ml_confidence: triggerResult.confidence,
      }),
    ]
  );
  return rows[0];
}

async function _checkFraud(claim, policy, zone, envData) {
  try {
    // Call Fraud Detection AI microservice
    const response = await fetch(`${FRAUD_SERVICE_URL}/api/v1/detect-fraud`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: claim.worker_id,
        claim_id: claim.id,
        policy_id: policy.id,
        registered_zone_lat: zone.latitude || 0,
        registered_zone_lng: zone.longitude || 0,
        claim_location_lat: zone.latitude || 0,
        claim_location_lng: zone.longitude || 0,
        device_id: 'trigger-engine',
        ip_address: '127.0.0.1',
        claim_amount: parseFloat(claim.claim_amount),
        disruption_type: claim.disruption_type,
        claim_timestamp: new Date().toISOString(),
        total_claims_30d: 1,
        total_policies_30d: 1,
        policy_cancel_count_30d: 0,
        avg_claim_interval_hours: 168,
        unique_devices_30d: 1,
        unique_ips_30d: 1,
        account_age_days: 30,
        previous_fraud_flags: 0,
        deliveries_last_7d: 20,
        avg_daily_active_hours: 8,
        platform: policy.platform || 'other',
      }),
    });

    if (response.ok) {
      return await response.json();
    }

    // If fraud service unavailable, use simplified check
    return _fallbackFraudCheck();

  } catch (err) {
    logger.warn(`Fraud API unavailable, using fallback: ${err.message}`);
    return _fallbackFraudCheck();
  }
}

function _fallbackFraudCheck() {
  // Simple random scoring when AI service is unavailable
  const score = Math.random() * 0.3; // low fraud bias for auto-triggered claims
  return {
    fraud_score: Math.round(score * 1000) / 1000,
    recommendation: score > 0.8 ? 'auto_block' : score > 0.3 ? 'manual_review' : 'auto_approve',
    risk_level: score > 0.8 ? 'critical' : score > 0.3 ? 'medium' : 'low',
    flags: [],
  };
}

async function _updateClaimFraudScore(claimId, fraudResult) {
  await query(
    `UPDATE claims SET fraud_score = $2, fraud_flags = $3, updated_at = NOW()
     WHERE id = $1`,
    [claimId, fraudResult.fraud_score, JSON.stringify(fraudResult.flags || [])]
  );
}

async function _updateClaimStatus(claimId, status) {
  await query(
    `UPDATE claims SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, claimId]
  );
}

async function _processPayout(claim, policy) {
  const txnRef = generateTransactionRef();

  // Create payment record for payout
  const { rows } = await query(
    `INSERT INTO payments
       (worker_id, policy_id, amount, payment_type, status, transaction_ref,
        razorpay_payment_id, razorpay_order_id)
     VALUES ($1, $2, $3, 'payout', 'captured', $4, $5, $6)
     RETURNING *`,
    [
      policy.worker_id,
      policy.id,
      policy.payout_amount,
      txnRef,
      `pay_sim_${Date.now()}`,
      `order_sim_${Date.now()}`,
    ]
  );

  // Mark policy as claimed
  await query(
    `UPDATE policies SET status = 'claimed', updated_at = NOW() WHERE id = $1`,
    [policy.id]
  );

  return rows[0];
}

module.exports = ClaimProcessor;
