// ============================================================================
// GigShield AI — Admin Controller
// ============================================================================

const { query } = require('../config/db');
const UserModel = require('../models/user.model');
const PolicyModel = require('../models/policy.model');
const ClaimModel = require('../models/claim.model');
const PaymentModel = require('../models/payment.model');
const LocationModel = require('../models/location.model');
const TriggerEngine = require('../services/trigger-engine/index');
const logger = require('../utils/logger');

const AdminController = {
  /**
   * GET /api/v1/admin/overview
   * Platform-wide KPI dashboard
   */
  async getOverview(req, res, next) {
    try {
      const [workers, policies, claims, payments, zones] = await Promise.all([
        query(`
          SELECT
            COUNT(*) FILTER (WHERE is_active = TRUE AND role = 'worker') as total_active_workers,
            COUNT(*) FILTER (WHERE kyc_status = 'verified' AND role = 'worker') as verified_workers,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND role = 'worker') as new_workers_this_week
          FROM users
        `),
        query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'active' AND CURRENT_DATE BETWEEN week_start AND week_end) as active_policies,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as policies_this_week,
            COALESCE(SUM(premium_amount) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0) as weekly_premium_revenue,
            COALESCE(SUM(premium_amount) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) as monthly_premium_revenue
          FROM policies
          WHERE status IN ('active', 'claimed', 'expired')
        `),
        query(`
          SELECT
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as claims_this_week,
            COUNT(*) FILTER (WHERE status = 'under_review') as pending_review,
            COUNT(*) FILTER (WHERE status = 'auto_approved' AND created_at >= NOW() - INTERVAL '7 days') as auto_approved_this_week,
            COUNT(*) FILTER (WHERE status = 'blocked') as blocked_total,
            COALESCE(SUM(claim_amount) FILTER (WHERE status IN ('auto_approved', 'approved') AND created_at >= NOW() - INTERVAL '7 days'), 0) as weekly_payout_amount
          FROM claims
        `),
        PaymentModel.getRevenueStats('month'),
        LocationModel.getRiskStats(),
      ]);

      res.json({
        success: true,
        data: {
          workers: workers.rows[0],
          policies: policies.rows[0],
          claims: claims.rows[0],
          financials: payments,
          zone_risk_distribution: zones,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/admin/workers
   * List all workers with filters
   */
  async listWorkers(req, res, next) {
    try {
      const { page = 1, limit = 20, platform, kycStatus } = req.query;

      const result = await UserModel.findAll({
        page: parseInt(page),
        limit: parseInt(limit),
        platform,
        kycStatus,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/admin/policies
   * List all policies with filters
   */
  async listPolicies(req, res, next) {
    try {
      const { page = 1, limit = 20, status, disruption_type, zone_id } = req.query;

      const result = await PolicyModel.findAll({
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        disruption_type,
        zone_id,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/admin/claims
   * List all claims with filters
   */
  async listClaims(req, res, next) {
    try {
      const { page = 1, limit = 20, status, disruption_type, zone_id } = req.query;

      const result = await ClaimModel.findAll({
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        disruption_type,
        zone_id,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/admin/risk-analytics
   * Risk and disruption analytics
   */
  async riskAnalytics(req, res, next) {
    try {
      const [byDisruption, byZone, triggerTrends, topPayoutZones, claimsTrend] = await Promise.all([
        // Claims by disruption type
        query(`
          SELECT disruption_type,
                 COUNT(*) as total_claims,
                 COALESCE(SUM(claim_amount), 0) as total_amount,
                 ROUND(AVG(fraud_score)::numeric, 3) as avg_fraud_score
          FROM claims
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY disruption_type
          ORDER BY total_claims DESC
        `),

        // Zone risk overview
        query(`
          SELECT l.zone_name, l.city, l.risk_tier, l.risk_score,
                 COUNT(DISTINCT p.id) as active_policies,
                 COUNT(DISTINCT c.id) as recent_claims
          FROM locations l
          LEFT JOIN policies p ON l.id = p.zone_id AND p.status = 'active'
          LEFT JOIN claims c ON l.id = c.zone_id AND c.created_at >= NOW() - INTERVAL '30 days'
          WHERE l.is_active = TRUE
          GROUP BY l.id, l.zone_name, l.city, l.risk_tier, l.risk_score
          ORDER BY l.risk_score DESC
          LIMIT 20
        `),

        // Trigger event trends (last 30 days)
        query(`
          SELECT
            DATE_TRUNC('day', triggered_at) as day,
            disruption_type,
            COUNT(*) as trigger_count
          FROM disruption_triggers
          WHERE triggered_at >= NOW() - INTERVAL '30 days'
          GROUP BY day, disruption_type
          ORDER BY day ASC
        `),

        // Top payout zones
        query(`
          SELECT l.zone_name, l.city,
                 COUNT(c.id) as claim_count,
                 COALESCE(SUM(c.claim_amount), 0) as total_payouts
          FROM claims c
          JOIN locations l ON c.zone_id = l.id
          WHERE c.status IN ('auto_approved', 'approved')
            AND c.created_at >= NOW() - INTERVAL '30 days'
          GROUP BY l.id, l.zone_name, l.city
          ORDER BY total_payouts DESC
          LIMIT 10
        `),

        // Daily claims & fraud trend
        query(`
          SELECT
            DATE_TRUNC('day', created_at) as day,
            COUNT(*) as total_claims,
            COUNT(*) FILTER (WHERE fraud_score >= 0.7) as fraud_flags
          FROM claims
          WHERE created_at >= NOW() - INTERVAL '7 days'
          GROUP BY day
          ORDER BY day ASC
        `),
      ]);

      res.json({
        success: true,
        data: {
          claims_by_disruption: byDisruption.rows,
          zone_risk_overview: byZone.rows,
          trigger_trends: triggerTrends.rows,
          top_payout_zones: topPayoutZones.rows,
          claims_trend: claimsTrend.rows,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/admin/zones
   * List all zones with risk data for map visualization
   */
  async listZones(req, res, next) {
    try {
      const zones = await LocationModel.findAll();
      const riskStats = await LocationModel.getRiskStats();

      res.json({
        success: true,
        data: { zones, risk_summary: riskStats },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/admin/zones
   * Create a new zone (admin)
   */
  async createZone(req, res, next) {
    try {
      const zone = await LocationModel.create(req.body);
      logger.info(`Zone created: ${zone.zone_name} (${zone.city})`);

      res.status(201).json({
        success: true,
        message: 'Zone created.',
        data: { zone },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/admin/trigger-scan
   * Force manual execution of the Trigger Engine (Testing Tool)
   */
  async triggerScan(req, res, next) {
    try {
      logger.info('Admin initiated manual Trigger Engine scan...');
      const engine = new TriggerEngine();
      await engine.runEnvironmentalScan();
      res.json({ success: true, message: 'Environmental scan completed successfully.' });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = AdminController;
