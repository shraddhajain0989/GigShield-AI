// ============================================================================
// GigShield AI — Payment Controller
// ============================================================================
// Handles premium collection, payout processing, wallet operations,
// payment history, and Razorpay webhook simulation.
// ============================================================================

const PaymentModel = require('../models/payment.model');
const RazorpayService = require('../services/razorpay.service');
const { query } = require('../config/db');
const logger = require('../utils/logger');

const PaymentController = {
  // ──────────────────────────────────────────────────────────────────
  // Premium Collection (Worker pays for policy)
  // POST /api/v1/payments/collect-premium
  // ──────────────────────────────────────────────────────────────────
  async collectPremium(req, res, next) {
    try {
      const { policy_id, payment_method = 'upi' } = req.body;
      const workerId = req.user.id;

      // Get the policy
      const { rows: policies } = await query(
        `SELECT * FROM policies WHERE id = $1 AND worker_id = $2`,
        [policy_id, workerId]
      );

      if (!policies.length) {
        return res.status(404).json({ success: false, message: 'Policy not found' });
      }
      const policy = policies[0];

      // Create payment record
      const payment = await PaymentModel.createPremiumPayment({
        worker_id: workerId,
        policy_id: policy.id,
        amount: policy.premium_amount,
        payment_method,
      });

      // Create Razorpay order
      const order = await RazorpayService.createOrder({
        amount: parseFloat(policy.premium_amount),
        receipt: payment.transaction_ref,
        notes: { policy_id: policy.id, worker_id: workerId },
      });

      // Simulate capture (in sandbox mode)
      const capture = await RazorpayService.capturePayment({
        paymentId: order.id,
        amount: parseFloat(policy.premium_amount),
      });

      if (capture.status === 'captured') {
        // Update payment as captured
        await PaymentModel.updateStatus(payment.id, 'captured', capture);

        // Activate the policy
        await query(
          `UPDATE policies SET status = 'active', paid = TRUE, updated_at = NOW() WHERE id = $1`,
          [policy.id]
        );

        // Update wallet balance (debit premium)
        await _updateWallet(workerId, -parseFloat(policy.premium_amount), 'premium_debit', payment.id);

        logger.info(`💰 Premium collected: ₹${policy.premium_amount} from Worker#${workerId}`);
      } else {
        await PaymentModel.updateStatus(payment.id, 'failed', capture);
      }

      res.status(200).json({
        success: true,
        message: capture.status === 'captured' ? 'Premium payment successful' : 'Payment failed',
        data: {
          payment: {
            id: payment.id,
            transaction_ref: payment.transaction_ref,
            amount: policy.premium_amount,
            status: capture.status,
            razorpay_order_id: order.id,
            razorpay_payment_id: capture.id,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // Verify Premium (After Razorpay Checkout success)
  // POST /api/v1/payments/verify-premium
  // ──────────────────────────────────────────────────────────────────
  async verifyPremium(req, res, next) {
    try {
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature, policy_id } = req.body;
      
      const isValid = RazorpayService.verifyPaymentSignature({
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        signature: razorpay_signature
      });

      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Invalid payment signature' });
      }

      // Find the payment record associated with this order
      const { rows } = await query(`SELECT id, amount, worker_id FROM payments WHERE razorpay_order_id = $1`, [razorpay_order_id]);
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      const payment = rows[0];

      // Mark payment as captured
      await PaymentModel.updateStatus(payment.id, 'captured', {
        id: razorpay_payment_id,
        status: 'captured',
        method: 'card/upi'
      });

      // Activate the policy
      const PolicyModel = require('../models/policy.model');
      await query(
        `UPDATE policies SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [policy_id]
      );

      // Debit from worker's virtual wallet/ledger
      await _updateWallet(payment.worker_id, -parseFloat(payment.amount), 'premium_debit', payment.id);

      logger.info(`💳 Payment verified and policy activated: ${policy_id}`);
      res.json({ success: true, message: 'Payment verified and policy activated.' });
    } catch (err) {
      next(err);
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // Process Payout (Claim approved → Pay worker)
  // POST /api/v1/payments/process-payout
  // ──────────────────────────────────────────────────────────────────
  async processPayout(req, res, next) {
    try {
      const { claim_id } = req.body;

      // Get claim + policy + worker
      const { rows: claims } = await query(
        `SELECT c.*, p.payout_amount, p.coverage_tier, u.name as worker_name,
                u.upi_id, u.phone
         FROM claims c
         JOIN policies p ON c.policy_id = p.id
         JOIN users u ON c.worker_id = u.id
         WHERE c.id = $1 AND (c.status = 'auto_approved' OR c.status = 'approved')`,
        [claim_id]
      );

      if (!claims.length) {
        return res.status(404).json({ success: false, message: 'Approved claim not found' });
      }
      const claim = claims[0];

      // Check if payout already processed for this claim
      const { rows: existing } = await query(
        `SELECT id FROM payments WHERE claim_id = $1 AND payment_type = 'payout_disbursement' AND status = 'captured'`,
        [claim_id]
      );
      if (existing.length) {
        return res.status(409).json({ success: false, message: 'Payout already processed for this claim' });
      }

      // Create payment record
      const payment = await PaymentModel.createPayout({
        worker_id: claim.worker_id,
        claim_id: claim.id,
        amount: claim.payout_amount,
        upi_id: claim.upi_id,
      });

      // Process via Razorpay
      const payout = await RazorpayService.createPayout({
        amount: parseFloat(claim.payout_amount),
        upiId: claim.upi_id || `worker${claim.worker_id}@upi`,
        workerId: claim.worker_id,
        claimId: claim.id,
        narration: `GigShield Payout — ${claim.disruption_type?.replace('_', ' ')}`,
      });

      if (payout.status === 'processed') {
        // Payment captured
        await PaymentModel.updateStatus(payment.id, 'captured', {
          ...payout,
          utr: payout.utr,
          mode: payout.mode,
        });

        // Update claim status to paid
        await query(
          `UPDATE claims SET status = 'paid', payout_transaction_ref = $2, updated_at = NOW()
           WHERE id = $1`,
          [claim.id, payment.transaction_ref]
        );

        // Credit worker wallet
        await _updateWallet(claim.worker_id, parseFloat(claim.payout_amount), 'payout_credit', payment.id);

        logger.info(`💸 Payout sent: ₹${claim.payout_amount} → Worker ${claim.worker_name} (${claim.upi_id})`);
      } else {
        await PaymentModel.updateStatus(payment.id, 'failed', payout);
      }

      res.status(200).json({
        success: true,
        message: payout.status === 'processed' ? 'Payout processed successfully' : 'Payout failed',
        data: {
          payout: {
            id: payment.id,
            transaction_ref: payment.transaction_ref,
            amount: claim.payout_amount,
            status: payout.status,
            utr: payout.utr,
            razorpay_payout_id: payout.id,
            beneficiary_upi: claim.upi_id,
            worker_name: claim.worker_name,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // Get Wallet Balance
  // GET /api/v1/payments/wallet
  // ──────────────────────────────────────────────────────────────────
  async getWallet(req, res, next) {
    try {
      const workerId = req.user.id;
      const wallet = await _getOrCreateWallet(workerId);

      // Get recent transactions
      const { rows: txns } = await query(
        `SELECT * FROM wallet_transactions
         WHERE worker_id = $1
         ORDER BY created_at DESC LIMIT 10`,
        [workerId]
      );

      res.json({
        success: true,
        data: {
          wallet: {
            balance: wallet.balance,
            total_credited: wallet.total_credited,
            total_debited: wallet.total_debited,
            currency: 'INR',
          },
          recent_transactions: txns,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // Get Payment History
  // GET /api/v1/payments/history
  // ──────────────────────────────────────────────────────────────────
  async getHistory(req, res, next) {
    try {
      const workerId = req.user.id;
      const { page = 1, limit = 10, direction } = req.query;

      const result = await PaymentModel.findByWorker(workerId, {
        page: parseInt(page),
        limit: parseInt(limit),
        direction,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // Get Revenue Stats (Admin)
  // GET /api/v1/payments/revenue
  // ──────────────────────────────────────────────────────────────────
  async getRevenue(req, res, next) {
    try {
      const { period = 'month' } = req.query;
      const stats = await PaymentModel.getRevenueStats(period);

      res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // Razorpay Webhook Handler (Simulated)
  // POST /api/v1/payments/webhook
  // ──────────────────────────────────────────────────────────────────
  async handleWebhook(req, res, next) {
    try {
      const { event, payload } = req.body;

      // Verify signature (always passes in sandbox)
      const isValid = RazorpayService.verifyWebhookSignature({
        body: JSON.stringify(req.body),
        signature: req.headers['x-razorpay-signature'] || 'sandbox',
        secret: process.env.RAZORPAY_WEBHOOK_SECRET || 'sandbox_secret',
      });

      if (!isValid) {
        return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
      }

      logger.info(`🔔 Razorpay Webhook: ${event}`);

      switch (event) {
        case 'payment.captured': {
          const paymentData = payload?.payment?.entity;
          if (paymentData?.receipt) {
            const { rows } = await query(
              `SELECT id FROM payments WHERE transaction_ref = $1`,
              [paymentData.receipt]
            );
            if (rows.length) {
              await PaymentModel.updateStatus(rows[0].id, 'captured', paymentData);
            }
          }
          break;
        }

        case 'payment.failed': {
          const paymentData = payload?.payment?.entity;
          if (paymentData?.receipt) {
            const { rows } = await query(
              `SELECT id FROM payments WHERE transaction_ref = $1`,
              [paymentData.receipt]
            );
            if (rows.length) {
              await PaymentModel.updateStatus(rows[0].id, 'failed', paymentData);
            }
          }
          break;
        }

        case 'payout.processed':
        case 'payout.failed':
          logger.info(`Payout event: ${event}`);
          break;

        default:
          logger.warn(`Unhandled webhook event: ${event}`);
      }

      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  },
};

// ══════════════════════════════════════════════════════════════════════
// WALLET HELPERS
// ══════════════════════════════════════════════════════════════════════

async function _getOrCreateWallet(workerId) {
  // Try to get existing wallet
  let { rows } = await query(
    `SELECT * FROM worker_wallets WHERE worker_id = $1`, [workerId]
  );

  if (rows.length) return rows[0];

  // Create wallet if doesn't exist
  const result = await query(
    `INSERT INTO worker_wallets (worker_id, balance, total_credited, total_debited)
     VALUES ($1, 0, 0, 0) RETURNING *`,
    [workerId]
  );
  return result.rows[0];
}

async function _updateWallet(workerId, amount, type, paymentId) {
  const wallet = await _getOrCreateWallet(workerId);

  // Update balance
  if (amount > 0) {
    await query(
      `UPDATE worker_wallets
       SET balance = balance + $2, total_credited = total_credited + $2, updated_at = NOW()
       WHERE worker_id = $1`,
      [workerId, amount]
    );
  } else {
    await query(
      `UPDATE worker_wallets
       SET balance = balance + $2, total_debited = total_debited + $3, updated_at = NOW()
       WHERE worker_id = $1`,
      [workerId, amount, Math.abs(amount)]
    );
  }

  // Log transaction
  await query(
    `INSERT INTO wallet_transactions (worker_id, payment_id, amount, type, balance_after)
     VALUES ($1, $2, $3, $4, (SELECT balance FROM worker_wallets WHERE worker_id = $1))`,
    [workerId, paymentId, amount, type]
  );
}

module.exports = PaymentController;
