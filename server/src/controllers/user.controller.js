// ============================================================================
// GigShield AI — User Controller
// ============================================================================

const UserModel = require('../models/user.model');
const LocationModel = require('../models/location.model');
const logger = require('../utils/logger');
const { sanitize } = require('../utils/helpers');
const { query } = require('../config/db');

const UserController = {
  /**
   * GET /api/v1/users/profile
   * Get current worker's profile
   */
  async getProfile(req, res, next) {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      delete user.password_hash;
      delete user.aadhaar_hash;

      res.json({ success: true, data: { user } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /api/v1/users/profile
   * Update worker profile
   */
  async updateProfile(req, res, next) {
    try {
      const { name, upi_id, language, platform, device_fingerprint } = req.body;

      const updated = await UserModel.updateProfile(req.user.id, {
        name: name ? sanitize(name) : undefined,
        upi_id, language, platform, device_fingerprint,
      });

      if (!updated) {
        return res.status(400).json({ success: false, message: 'No valid fields to update.' });
      }

      logger.info(`Profile updated: ${req.user.phone}`);
      res.json({ success: true, message: 'Profile updated.', data: { user: updated } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/users/zone
   * Select / assign work zone
   */
  async selectZone(req, res, next) {
    try {
      const { zone_id, latitude, longitude } = req.body;

      let zone;

      if (zone_id) {
        // Direct zone selection
        zone = await LocationModel.findById(zone_id);
        if (!zone) {
          return res.status(404).json({ success: false, message: 'Zone not found.' });
        }
      } else if (latitude && longitude) {
        // Auto-detect nearest zone
        zone = await LocationModel.findNearest(latitude, longitude);
        if (!zone) {
          return res.status(404).json({ success: false, message: 'No zones available in your area.' });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Provide either zone_id or latitude+longitude.',
        });
      }

      const updated = await UserModel.assignZone(req.user.id, zone.id);

      logger.info(`Zone assigned: ${req.user.phone} → ${zone.zone_name || zone.city}`);

      res.json({
        success: true,
        message: 'Zone assigned successfully.',
        data: {
          user: updated,
          zone: {
            id: zone.id,
            zone_name: zone.zone_name,
            city: zone.city,
            risk_tier: zone.risk_tier,
            risk_score: zone.risk_score,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/users/kyc
   * Submit KYC documents
   */
  async submitKyc(req, res, next) {
    try {
      const { aadhaar_number, documents } = req.body;

      // In production, verify via Aadhaar DigiLocker API
      // For now, mark as submitted
      const updated = await UserModel.updateKyc(req.user.id, 'submitted', documents || []);

      logger.info(`KYC submitted: ${req.user.phone}`);

      res.json({
        success: true,
        message: 'KYC documents submitted. Verification in progress.',
        data: { kyc_status: updated.kyc_status },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/users/zones
   * List all available zones
   */
  async listZones(req, res, next) {
    try {
      const { city } = req.query;

      let zones;
      if (city) {
        zones = await LocationModel.findByCity(city);
      } else {
        zones = await LocationModel.findAll();
      }

      res.json({ success: true, data: { zones, total: zones.length } });
    } catch (err) {
      next(err);
    }
  },
  /**
   * GET /api/v1/users/analytics
   * Get worker-specific analytics (trends, risk)
   */
  async getWorkerAnalytics(req, res, next) {
    try {
      const workerId = req.user.id;
      const { zone_id } = await UserModel.findById(workerId);

      const [riskTrend, earningsTrend] = await Promise.all([
        // Daily risk level in assigned zone (last 7 days)
        query(`
          SELECT
            DATE_TRUNC('day', triggered_at) as day,
            MAX(ml_confidence) as risk_level
          FROM disruption_triggers
          WHERE zone_id = $1 AND triggered_at >= NOW() - INTERVAL '7 days'
          GROUP BY day
          ORDER BY day ASC
        `, [zone_id]),

        // Daily earnings from claims (last 30 days)
        query(`
          SELECT
            DATE_TRUNC('day', created_at) as day,
            COALESCE(SUM(claim_amount), 0) as amount
          FROM claims
          WHERE worker_id = $1 AND status IN ('auto_approved', 'approved', 'paid')
            AND created_at >= NOW() - INTERVAL '30 days'
          GROUP BY day
          ORDER BY day ASC
        `, [workerId]),
      ]);

      res.json({
        success: true,
        data: {
          risk_trend: riskTrend.rows,
          earnings_trend: earningsTrend.rows,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = UserController;
