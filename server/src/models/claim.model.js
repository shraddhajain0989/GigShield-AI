// ============================================================================
// GigShield AI — Claim Model (Database Queries)
// ============================================================================

const { query, getClient } = require('../config/db');
const { generateClaimNumber, generateTransactionRef } = require('../utils/helpers');

const ClaimModel = {
  /**
   * Create an auto-triggered claim
   */
  async create({ policy_id, worker_id, trigger_id, zone_id, disruption_type, claim_amount, evidence }) {
    const claimNumber = generateClaimNumber();

    const sql = `
      INSERT INTO claims
        (claim_number, policy_id, worker_id, trigger_id, zone_id,
         disruption_type, claim_amount, fraud_score, status, auto_triggered, evidence)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0.000, 'auto_approved', TRUE, $8)
      RETURNING *
    `;
    const result = await query(sql, [
      claimNumber, policy_id, worker_id, trigger_id, zone_id,
      disruption_type, claim_amount, JSON.stringify(evidence || {}),
    ]);
    return result.rows[0];
  },

  /**
   * Find claim by ID
   */
  async findById(claimId) {
    const sql = `
      SELECT c.*,
             p.policy_number, p.coverage_tier,
             u.name as worker_name, u.phone as worker_phone, u.upi_id,
             l.zone_name, l.city,
             dt.measured_value as trigger_value, dt.ml_confidence
      FROM claims c
      JOIN policies p ON c.policy_id = p.id
      JOIN users u ON c.worker_id = u.id
      JOIN locations l ON c.zone_id = l.id
      LEFT JOIN disruption_triggers dt ON c.trigger_id = dt.id
      WHERE c.id = $1
    `;
    const result = await query(sql, [claimId]);
    return result.rows[0] || null;
  },

  /**
   * Get worker's claim history
   */
  async findByWorker(workerId, { page = 1, limit = 10 }) {
    const sql = `
      SELECT c.id, c.claim_number, c.disruption_type, c.claim_amount,
             c.fraud_score, c.status, c.auto_triggered, c.created_at,
             p.policy_number, p.coverage_tier,
             l.zone_name, l.city
      FROM claims c
      JOIN policies p ON c.policy_id = p.id
      JOIN locations l ON c.zone_id = l.id
      WHERE c.worker_id = $1
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await query(sql, [workerId, limit, (page - 1) * limit]);

    const countResult = await query(
      'SELECT COUNT(*) FROM claims WHERE worker_id = $1', [workerId]
    );

    return {
      claims: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    };
  },

  /**
   * Update claim status (admin review)
   */
  async updateStatus(claimId, status, reviewedBy, reviewNotes = null) {
    const sql = `
      UPDATE claims
      SET status = $1, reviewed_by = $2, review_notes = $3, reviewed_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    const result = await query(sql, [status, reviewedBy, reviewNotes, claimId]);
    return result.rows[0];
  },

  /**
   * Update fraud score and flags on a claim
   */
  async updateFraudScore(claimId, fraudScore, fraudFlags) {
    let status = 'auto_approved';
    if (fraudScore >= 0.7) status = 'blocked';
    else if (fraudScore >= 0.3) status = 'under_review';

    const sql = `
      UPDATE claims
      SET fraud_score = $1, fraud_flags = $2, status = $3
      WHERE id = $4
      RETURNING *
    `;
    const result = await query(sql, [
      fraudScore, JSON.stringify(fraudFlags), status, claimId,
    ]);
    return result.rows[0];
  },

  /**
   * Count claims for a policy this week (enforce max claims per week)
   */
  async countClaimsThisWeek(policyId) {
    const sql = `
      SELECT COUNT(*) FROM claims
      WHERE policy_id = $1
        AND status NOT IN ('rejected', 'blocked')
        AND created_at >= DATE_TRUNC('week', CURRENT_DATE)
    `;
    const result = await query(sql, [policyId]);
    return parseInt(result.rows[0].count);
  },

  /**
   * Get all claims (admin) with filters
   */
  async findAll({ page = 1, limit = 20, status, disruption_type, zone_id }) {
    let sql = `
      SELECT c.*, u.name as worker_name, u.phone as worker_phone,
             p.policy_number, l.zone_name, l.city
      FROM claims c
      JOIN users u ON c.worker_id = u.id
      JOIN policies p ON c.policy_id = p.id
      JOIN locations l ON c.zone_id = l.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND c.status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }
    if (disruption_type) {
      sql += ` AND c.disruption_type = $${paramIndex}`;
      values.push(disruption_type);
      paramIndex++;
    }
    if (zone_id) {
      sql += ` AND c.zone_id = $${paramIndex}`;
      values.push(zone_id);
      paramIndex++;
    }

    sql += ` ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, (page - 1) * limit);

    const result = await query(sql, values);
    return { claims: result.rows, page, limit };
  },

  /**
   * Get claims pending review (admin fraud queue)
   */
  async getPendingReview({ page = 1, limit = 20 }) {
    const sql = `
      SELECT c.*, u.name as worker_name, u.phone as worker_phone, u.fraud_score as worker_fraud_score,
             p.policy_number, p.coverage_tier, l.zone_name, l.city
      FROM claims c
      JOIN users u ON c.worker_id = u.id
      JOIN policies p ON c.policy_id = p.id
      JOIN locations l ON c.zone_id = l.id
      WHERE c.status = 'under_review'
      ORDER BY c.fraud_score DESC, c.created_at ASC
      LIMIT $1 OFFSET $2
    `;
    const result = await query(sql, [limit, (page - 1) * limit]);

    const countResult = await query(
      "SELECT COUNT(*) FROM claims WHERE status = 'under_review'"
    );

    return {
      claims: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    };
  },

  /**
   * Create a payout record for an approved claim
   */
  async createPayout(claimId, workerId, amount) {
    const transactionRef = generateTransactionRef();

    const sql = `
      INSERT INTO payouts (claim_id, worker_id, amount, status, created_at)
      VALUES ($1, $2, $3, 'pending', NOW())
      RETURNING *
    `;
    const result = await query(sql, [claimId, workerId, amount]);
    return result.rows[0];
  },
};

module.exports = ClaimModel;
