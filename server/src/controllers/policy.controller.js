// ============================================================================
// GigShield AI — Policy Controller
// ============================================================================

const PolicyModel = require('../models/policy.model');
const PaymentModel = require('../models/payment.model');
const UserModel = require('../models/user.model');
const RazorpayService = require('../services/razorpay.service');
const { query } = require('../config/db');
const logger = require('../utils/logger');
const { getCurrentWeekRange, getNextWeekRange, getPayoutAmount } = require('../utils/helpers');

const PolicyController = {
  /**
   * POST /api/v1/policies
   * Create a new weekly insurance policy
   */
  async create(req, res, next) {
    try {
      const { coverage_tier, disruption_type, week = 'current' } = req.body;
      const workerId = req.user.id;

      // Get worker's zone
      const worker = await UserModel.findById(workerId);
      if (!worker.zone_id) {
        return res.status(400).json({
          success: false,
          message: 'Please select a work zone before purchasing a policy.',
        });
      }

      // Determine week range
      const weekRange = week === 'next' ? getNextWeekRange() : getCurrentWeekRange();

      // Check for duplicate policy
      const existing = await PolicyModel.checkDuplicate(
        workerId, disruption_type, weekRange.weekStart, weekRange.weekEnd
      );
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `You already have an active ${disruption_type} policy for this week.`,
        });
      }

      // Calculate premium (simplified — in production, call AI service)
      const premiumAmount = calculateSimplePremium(coverage_tier, disruption_type, worker.risk_tier);

      // Create policy
      const policy = await PolicyModel.create({
        worker_id: workerId,
        zone_id: worker.zone_id,
        coverage_tier,
        disruption_type,
        premium_amount: premiumAmount,
        week_start: weekRange.weekStart,
        week_end: weekRange.weekEnd,
        pricing_factors: {
          zone_risk_tier: worker.risk_tier,
          coverage_tier,
          disruption_type,
          base_premium: premiumAmount,
          model_version: 'v1.0-simple',
        },
      });

      // Create payment record
      const payment = await PaymentModel.createPremiumPayment({
        worker_id: workerId,
        policy_id: policy.id,
        amount: premiumAmount,
      });

      // Generate Live Razorpay Order
      const order = await RazorpayService.createOrder({
        amount: premiumAmount,
        receipt: payment.transaction_ref,
        notes: { policy_id: policy.id, worker_id: workerId }
      });

      // Link Razorpay order ID to payment record
      await query(`UPDATE payments SET razorpay_order_id = $1 WHERE id = $2`, [order.id, payment.id]);

      logger.info(`Policy pending payment: ${policy.policy_number} — ₹${premiumAmount} (${disruption_type})`);

      res.status(201).json({
        success: true,
        message: 'Policy created. Proceed to payment.',
        data: {
          policy,
          payment: {
            id: payment.id,
            transaction_ref: payment.transaction_ref,
            amount: payment.amount,
          },
          razorpay_order_id: order.id,
          amount: premiumAmount,
          currency: 'INR',
          key_id: process.env.RAZORPAY_KEY_ID
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/policies
   * List worker's policies
   */
  async list(req, res, next) {
    try {
      const { page = 1, limit = 10, status } = req.query;

      const result = await PolicyModel.findByWorker(req.user.id, {
        page: parseInt(page),
        limit: parseInt(limit),
        status,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/policies/active
   * Get worker's currently active policies
   */
  async getActive(req, res, next) {
    try {
      const policies = await PolicyModel.getActiveByWorker(req.user.id);

      res.json({
        success: true,
        data: {
          policies,
          total: policies.length,
          week: getCurrentWeekRange(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/policies/:id
   * Get policy details
   */
  async getById(req, res, next) {
    try {
      const policy = await PolicyModel.findById(req.params.id);
      if (!policy) {
        return res.status(404).json({ success: false, message: 'Policy not found.' });
      }

      // Workers can only view their own policies
      if (req.user.role === 'worker' && policy.worker_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      res.json({ success: true, data: { policy } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/v1/policies/:id
   * Cancel a policy
   */
  async cancel(req, res, next) {
    try {
      const { reason } = req.body;
      const policy = await PolicyModel.findById(req.params.id);

      if (!policy) {
        return res.status(404).json({ success: false, message: 'Policy not found.' });
      }

      if (req.user.role === 'worker' && policy.worker_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      if (!['active', 'pending_payment'].includes(policy.status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot cancel a policy with status: ${policy.status}`,
        });
      }

      const cancelled = await PolicyModel.cancel(req.params.id, reason);

      logger.info(`Policy cancelled: ${policy.policy_number}`);

      res.json({
        success: true,
        message: 'Policy cancelled successfully.',
        data: { policy: cancelled },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/policies/quote
   * Get a premium quote without purchasing
   */
  async getQuote(req, res, next) {
    try {
      const { coverage_tier, disruption_type } = req.body;
      const worker = await UserModel.findById(req.user.id);

      if (!worker.zone_id) {
        return res.status(400).json({
          success: false,
          message: 'Select a work zone first to get a quote.',
        });
      }

      const premiumAmount = calculateSimplePremium(coverage_tier, disruption_type, worker.risk_tier);
      const payoutAmount = getPayoutAmount(coverage_tier);

      res.json({
        success: true,
        data: {
          quote: {
            coverage_tier,
            disruption_type,
            premium_amount: premiumAmount,
            payout_amount: payoutAmount,
            week: getCurrentWeekRange(),
            zone: {
              name: worker.zone_name,
              city: worker.city,
              risk_tier: worker.risk_tier,
            },
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
};

// ── Simplified premium calculator (placeholder for AI service) ──

function calculateSimplePremium(coverageTier, disruptionType, riskTier) {
  const basePremiums = {
    basic: 35,
    standard: 60,
    premium: 95,
  };

  const disruptionMultipliers = {
    extreme_rain: 1.0,
    extreme_heat: 0.8,
    air_pollution: 0.9,
    flood: 1.3,
    curfew: 1.1,
  };

  const riskMultipliers = {
    low: 0.8,
    medium: 1.0,
    high: 1.2,
    critical: 1.5,
  };

  let premium = basePremiums[coverageTier] || 60;
  premium *= disruptionMultipliers[disruptionType] || 1.0;
  premium *= riskMultipliers[riskTier] || 1.0;

  // Enforce guardrails: ₹30–₹120
  return Math.max(30, Math.min(120, Math.round(premium * 100) / 100));
}

module.exports = PolicyController;
