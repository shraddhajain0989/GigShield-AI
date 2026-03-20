// ============================================================================
// GigShield AI — Claim Controller
// ============================================================================

const ClaimModel = require('../models/claim.model');
const PolicyModel = require('../models/policy.model');
const PaymentModel = require('../models/payment.model');
const logger = require('../utils/logger');

const ClaimController = {
  /**
   * POST /api/v1/claims/auto-trigger
   * Internal: Automation engine creates claims for all affected policies
   * Called when a disruption trigger fires
   */
  async autoTrigger(req, res, next) {
    try {
      const { zone_id, disruption_type, trigger_id, measured_value, threshold_value, ml_confidence } = req.body;

      // Find all active policies in this zone for this disruption type
      const affectedPolicies = await PolicyModel.findActiveByZoneAndType(zone_id, disruption_type);

      if (affectedPolicies.length === 0) {
        return res.json({
          success: true,
          message: 'Trigger processed. No active policies found in this zone.',
          data: { claims_created: 0 },
        });
      }

      const createdClaims = [];
      const skippedPolicies = [];

      for (const policy of affectedPolicies) {
        // Check weekly claim limit (max 2 per policy per week)
        const weeklyCount = await ClaimModel.countClaimsThisWeek(policy.id);
        if (weeklyCount >= policy.max_claims_per_week) {
          skippedPolicies.push({
            policy_id: policy.id,
            reason: 'Weekly claim limit reached',
          });
          continue;
        }

        // Create claim
        const claim = await ClaimModel.create({
          policy_id: policy.id,
          worker_id: policy.worker_id,
          trigger_id,
          zone_id,
          disruption_type,
          claim_amount: parseFloat(policy.payout_amount),
          evidence: {
            measured_value,
            threshold_value,
            ml_confidence,
            trigger_id,
            triggered_at: new Date().toISOString(),
          },
        });

        // Simulate fraud score (in production, call Fraud AI service)
        const fraudScore = simulateFraudCheck(policy);
        const fraudFlags = [];

        if (fraudScore > 0.3) {
          fraudFlags.push({
            flag_type: 'timing_anomaly',
            confidence: fraudScore,
            details: 'Elevated fraud score from simulation',
          });
        }

        // Update claim with fraud score (determines auto_approved / under_review / blocked)
        const updatedClaim = await ClaimModel.updateFraudScore(claim.id, fraudScore, fraudFlags);

        // If auto-approved, process payout
        if (updatedClaim.status === 'auto_approved') {
          const payout = await PaymentModel.createPayout({
            worker_id: policy.worker_id,
            claim_id: claim.id,
            amount: parseFloat(policy.payout_amount),
            upi_id: policy.upi_id,
          });

          // Simulate payout disbursement
          await PaymentModel.simulateCapture(payout.id);

          // Mark policy as claimed
          await PolicyModel.markClaimed(policy.id);
        }

        createdClaims.push({
          claim_id: updatedClaim.id,
          claim_number: claim.claim_number,
          worker_name: policy.worker_name,
          amount: updatedClaim.claim_amount,
          status: updatedClaim.status,
          fraud_score: fraudScore,
        });
      }

      logger.info(
        `Auto-trigger processed: ${createdClaims.length} claims created, ${skippedPolicies.length} skipped`
      );

      res.status(201).json({
        success: true,
        message: `Trigger processed. ${createdClaims.length} claims created.`,
        data: {
          claims_created: createdClaims.length,
          claims_skipped: skippedPolicies.length,
          claims: createdClaims,
          skipped: skippedPolicies,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/claims
   * Get worker's claim history
   */
  async list(req, res, next) {
    try {
      const { page = 1, limit = 10 } = req.query;

      const result = await ClaimModel.findByWorker(req.user.id, {
        page: parseInt(page),
        limit: parseInt(limit),
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/claims/:id
   * Get claim details
   */
  async getById(req, res, next) {
    try {
      const claim = await ClaimModel.findById(req.params.id);
      if (!claim) {
        return res.status(404).json({ success: false, message: 'Claim not found.' });
      }

      // Workers can only view their own claims
      if (req.user.role === 'worker' && claim.worker_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      res.json({ success: true, data: { claim } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/v1/claims/:id/review (Admin)
   * Review a flagged claim
   */
  async review(req, res, next) {
    try {
      const { status, review_notes } = req.body;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status must be "approved" or "rejected".',
        });
      }

      const claim = await ClaimModel.findById(req.params.id);
      if (!claim) {
        return res.status(404).json({ success: false, message: 'Claim not found.' });
      }

      if (claim.status !== 'under_review') {
        return res.status(400).json({
          success: false,
          message: `Cannot review a claim with status: ${claim.status}`,
        });
      }

      const updated = await ClaimModel.updateStatus(
        req.params.id, status, req.user.id, review_notes
      );

      // If approved, process payout
      if (status === 'approved') {
        const payout = await PaymentModel.createPayout({
          worker_id: claim.worker_id,
          claim_id: claim.id,
          amount: parseFloat(claim.claim_amount),
          upi_id: claim.upi_id,
        });
        await PaymentModel.simulateCapture(payout.id);

        // Mark policy as claimed
        await PolicyModel.markClaimed(claim.policy_id);

        logger.info(`Claim approved by admin: ${claim.claim_number} — ₹${claim.claim_amount}`);
      } else {
        logger.info(`Claim rejected by admin: ${claim.claim_number}`);
      }

      res.json({
        success: true,
        message: `Claim ${status}.`,
        data: { claim: updated },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/claims/pending-review (Admin)
   * Get claims pending fraud review
   */
  async pendingReview(req, res, next) {
    try {
      const { page = 1, limit = 20 } = req.query;

      const result = await ClaimModel.getPendingReview({
        page: parseInt(page),
        limit: parseInt(limit),
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};

// ── Simplified fraud check (placeholder for AI service) ──

function simulateFraudCheck(policy) {
  // Simulate a score: mostly low, occasionally medium
  const baseScore = Math.random() * 0.3;
  const workerRisk = policy.worker_fraud_score || 0;
  return Math.min(1.0, parseFloat((baseScore + workerRisk * 0.5).toFixed(3)));
}

module.exports = ClaimController;
