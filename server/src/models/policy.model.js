// ============================================================================
// GigShield AI — Policy Model (Database Queries)
// ============================================================================

const { query } = require('../config/db');
const { generatePolicyNumber, getPayoutAmount } = require('../utils/helpers');

const PolicyModel = {
  /**
   * Create a new weekly policy
   */
  async create({ worker_id, zone_id, coverage_tier, disruption_type, premium_amount, week_start, week_end, pricing_factors }) {
    const policyNumber = generatePolicyNumber();
    const payoutAmount = getPayoutAmount(coverage_tier);

    const sql = `
      INSERT INTO policies
        (policy_number, worker_id, zone_id, coverage_tier, disruption_type,
         premium_amount, payout_amount, week_start, week_end, status, pricing_factors)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_payment', $10)
      RETURNING *
    `;
    const result = await query(sql, [
      policyNumber, worker_id, zone_id, coverage_tier, disruption_type,
      premium_amount, payoutAmount, week_start, week_end,
      JSON.stringify(pricing_factors || {}),
    ]);
    return result.rows[0];
  },

  /**
   * Activate a policy after payment
   */
  async activate(policyId) {
    const sql = `
      UPDATE policies
      SET status = 'active', activated_at = NOW()
      WHERE id = $1 AND status = 'pending_payment'
      RETURNING *
    `;
    const result = await query(sql, [policyId]);
    return result.rows[0];
  },

  /**
   * Cancel a policy
   */
  async cancel(policyId, reason = null) {
    const sql = `
      UPDATE policies
      SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $2
      WHERE id = $1 AND status IN ('active', 'pending_payment')
      RETURNING *
    `;
    const result = await query(sql, [policyId, reason]);
    return result.rows[0];
  },

  /**
   * Find policy by ID
   */
  async findById(policyId) {
    const sql = `
      SELECT p.*,
             u.name as worker_name, u.phone as worker_phone, u.platform,
             l.zone_name, l.city, l.risk_tier
      FROM policies p
      JOIN users u ON p.worker_id = u.id
      JOIN locations l ON p.zone_id = l.id
      WHERE p.id = $1
    `;
    const result = await query(sql, [policyId]);
    return result.rows[0] || null;
  },

  /**
   * Get worker's policies with pagination
   */
  async findByWorker(workerId, { page = 1, limit = 10, status }) {
    let sql = `
      SELECT p.*, l.zone_name, l.city, l.risk_tier
      FROM policies p
      JOIN locations l ON p.zone_id = l.id
      WHERE p.worker_id = $1
    `;
    const values = [workerId];
    let paramIndex = 2;

    if (status) {
      sql += ` AND p.status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    sql += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, (page - 1) * limit);

    const result = await query(sql, values);

    const countResult = await query(
      'SELECT COUNT(*) FROM policies WHERE worker_id = $1' + (status ? ' AND status = $2' : ''),
      status ? [workerId, status] : [workerId]
    );

    return {
      policies: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    };
  },

  /**
   * Get worker's active policies for the current week
   */
  async getActiveByWorker(workerId) {
    const sql = `
      SELECT p.*, l.zone_name, l.city, l.risk_tier
      FROM policies p
      JOIN locations l ON p.zone_id = l.id
      WHERE p.worker_id = $1
        AND p.status = 'active'
        AND CURRENT_DATE BETWEEN p.week_start AND p.week_end
      ORDER BY p.created_at DESC
    `;
    const result = await query(sql, [workerId]);
    return result.rows;
  },

  /**
   * Find all active policies in a zone for a disruption type
   * Used by the auto-trigger system
   */
  async findActiveByZoneAndType(zoneId, disruptionType) {
    const sql = `
      SELECT p.*, u.name as worker_name, u.phone as worker_phone,
             u.upi_id, u.fraud_score as worker_fraud_score
      FROM policies p
      JOIN users u ON p.worker_id = u.id
      WHERE p.zone_id = $1
        AND (p.disruption_type = $2 OR p.disruption_type = 'bundle')
        AND p.status = 'active'
        AND CURRENT_DATE BETWEEN p.week_start AND p.week_end
    `;
    const result = await query(sql, [zoneId, disruptionType]);
    return result.rows;
  },

  /**
   * Mark policy as claimed
   */
  async markClaimed(policyId) {
    const sql = `
      UPDATE policies SET status = 'claimed' WHERE id = $1 RETURNING *
    `;
    const result = await query(sql, [policyId]);
    return result.rows[0];
  },

  /**
   * Expire old policies (cron job)
   */
  async expireOldPolicies() {
    const sql = `
      UPDATE policies
      SET status = 'expired'
      WHERE status = 'active' AND week_end < CURRENT_DATE
      RETURNING id, policy_number
    `;
    const result = await query(sql);
    return result.rows;
  },

  /**
   * Get all policies (admin) with pagination
   */
  async findAll({ page = 1, limit = 20, status, disruption_type, zone_id }) {
    let sql = `
      SELECT p.*, u.name as worker_name, u.phone as worker_phone, u.platform,
             l.zone_name, l.city
      FROM policies p
      JOIN users u ON p.worker_id = u.id
      JOIN locations l ON p.zone_id = l.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND p.status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }
    if (disruption_type) {
      sql += ` AND p.disruption_type = $${paramIndex}`;
      values.push(disruption_type);
      paramIndex++;
    }
    if (zone_id) {
      sql += ` AND p.zone_id = $${paramIndex}`;
      values.push(zone_id);
      paramIndex++;
    }

    sql += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, (page - 1) * limit);

    const result = await query(sql, values);

    return {
      policies: result.rows,
      page,
      limit,
    };
  },

  /**
   * Check if worker already has an active policy for this disruption type this week
   */
  async checkDuplicate(workerId, disruptionType, weekStart, weekEnd) {
    const sql = `
      SELECT id FROM policies
      WHERE worker_id = $1
        AND disruption_type = $2
        AND week_start = $3
        AND week_end = $4
        AND status IN ('active', 'pending_payment')
      LIMIT 1
    `;
    const result = await query(sql, [workerId, disruptionType, weekStart, weekEnd]);
    return result.rows[0] || null;
  },
};

module.exports = PolicyModel;
