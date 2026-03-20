// ============================================================================
// GigShield AI — Payment Model
// ============================================================================

const { query } = require('../config/db');
const { generateTransactionRef } = require('../utils/helpers');

const PaymentModel = {
  /**
   * Create a premium payment record
   */
  async createPremiumPayment({ worker_id, policy_id, amount, payment_method = 'upi' }) {
    const transactionRef = generateTransactionRef();

    const sql = `
      INSERT INTO payments
        (transaction_ref, worker_id, policy_id, payment_type, payment_method,
         amount, currency, status, direction)
      VALUES ($1, $2, $3, 'premium_collection', $4, $5, 'INR', 'initiated', 'inbound')
      RETURNING *
    `;
    const result = await query(sql, [transactionRef, worker_id, policy_id, payment_method, amount]);
    return result.rows[0];
  },

  /**
   * Create a payout payment record
   */
  async createPayout({ worker_id, claim_id, amount, upi_id }) {
    const transactionRef = generateTransactionRef();

    const sql = `
      INSERT INTO payments
        (transaction_ref, worker_id, claim_id, payment_type,
         amount, currency, status, direction, beneficiary_upi_id)
      VALUES ($1, $2, $3, 'payout_disbursement', $4, 'INR', 'initiated', 'outbound', $5)
      RETURNING *
    `;
    const result = await query(sql, [transactionRef, worker_id, claim_id, amount, upi_id]);
    return result.rows[0];
  },

  /**
   * Update payment status (webhook callback)
   */
  async updateStatus(paymentId, status, gatewayData = {}) {
    const timestampField = status === 'captured' ? 'captured_at' : 'failed_at';

    const sql = `
      UPDATE payments
      SET status = $1, gateway_response = $2, ${timestampField} = NOW()
      WHERE id = $3
      RETURNING *
    `;
    const result = await query(sql, [status, JSON.stringify(gatewayData), paymentId]);
    return result.rows[0];
  },

  /**
   * Simulate Razorpay payment capture (sandbox mode)
   */
  async simulateCapture(paymentId) {
    const sql = `
      UPDATE payments
      SET status = 'captured',
          captured_at = NOW(),
          razorpay_payment_id = 'pay_sim_' || substr(md5(random()::text), 0, 16),
          gateway_response = '{"status": "captured", "method": "upi", "simulated": true}'::jsonb
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sql, [paymentId]);
    return result.rows[0];
  },

  /**
   * Get worker's payment history
   */
  async findByWorker(workerId, { page = 1, limit = 10, direction }) {
    let sql = `
      SELECT p.*, pol.policy_number, c.claim_number
      FROM payments p
      LEFT JOIN policies pol ON p.policy_id = pol.id
      LEFT JOIN claims c ON p.claim_id = c.id
      WHERE p.worker_id = $1
    `;
    const values = [workerId];
    let paramIndex = 2;

    if (direction) {
      sql += ` AND p.direction = $${paramIndex}`;
      values.push(direction);
      paramIndex++;
    }

    sql += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, (page - 1) * limit);

    const result = await query(sql, values);
    return { payments: result.rows, page, limit };
  },

  /**
   * Get revenue analytics (admin)
   */
  async getRevenueStats(period = 'month') {
    const interval = period === 'week' ? '7 days' : '30 days';

    const sql = `
      SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM payments
         WHERE payment_type = 'premium_collection' AND status = 'captured'
         AND created_at >= NOW() - INTERVAL '${interval}') as total_premiums,
        (SELECT COALESCE(SUM(amount), 0) FROM payments
         WHERE payment_type = 'payout_disbursement' AND status = 'captured'
         AND created_at >= NOW() - INTERVAL '${interval}') as total_payouts,
        (SELECT COUNT(*) FROM payments
         WHERE payment_type = 'premium_collection' AND status = 'captured'
         AND created_at >= NOW() - INTERVAL '${interval}') as premium_count,
        (SELECT COUNT(*) FROM payments
         WHERE payment_type = 'payout_disbursement' AND status = 'captured'
         AND created_at >= NOW() - INTERVAL '${interval}') as payout_count
    `;
    const result = await query(sql);
    const row = result.rows[0];

    return {
      ...row,
      loss_ratio: parseFloat(row.total_premiums) > 0
        ? (parseFloat(row.total_payouts) / parseFloat(row.total_premiums) * 100).toFixed(2) + '%'
        : '0%',
    };
  },
};

module.exports = PaymentModel;
