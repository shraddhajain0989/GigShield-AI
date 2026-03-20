// ============================================================================
// GigShield AI — Auth Controller
// ============================================================================

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const UserModel = require('../models/user.model');
const logger = require('../utils/logger');
const { sanitize } = require('../utils/helpers');

const AuthController = {
  /**
   * POST /api/v1/auth/register
   * Register a new worker
   */
  async register(req, res, next) {
    try {
      const { phone, name, password, platform, language } = req.body;

      // Check if user already exists
      const existing = await UserModel.findByPhone(sanitize(phone));
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'A user with this phone number already exists.',
        });
      }

      // Create user
      const user = await UserModel.create({
        phone: sanitize(phone),
        name: sanitize(name),
        password,
        platform,
        language: language || 'en',
      });

      // Generate tokens
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      logger.info(`New worker registered: ${user.phone} (${user.platform})`);

      res.status(201).json({
        success: true,
        message: 'Registration successful.',
        data: {
          user: {
            id: user.id,
            phone: user.phone,
            name: user.name,
            platform: user.platform,
            role: user.role,
            kyc_status: user.kyc_status,
          },
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: config.jwt.expiresIn,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/auth/login
   * Login with phone + password
   */
  async login(req, res, next) {
    try {
      const { phone, password } = req.body;

      const user = await UserModel.findByPhone(sanitize(phone));
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid phone number or password.',
        });
      }

      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated. Contact support.',
        });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid phone number or password.',
        });
      }

      // Update last login
      await UserModel.updateLastLogin(user.id);

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      logger.info(`User login: ${user.phone}`);

      res.json({
        success: true,
        message: 'Login successful.',
        data: {
          user: {
            id: user.id,
            phone: user.phone,
            name: user.name,
            platform: user.platform,
            role: user.role,
            zone_id: user.zone_id,
            kyc_status: user.kyc_status,
          },
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: config.jwt.expiresIn,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/auth/refresh
   * Refresh access token
   */
  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required.',
        });
      }

      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);

      const user = await UserModel.findById(decoded.id);
      if (!user || !user.is_active) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token.',
        });
      }

      const newAccessToken = generateAccessToken(user);

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          expiresIn: config.jwt.expiresIn,
        },
      });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Refresh token expired. Please log in again.',
        });
      }
      next(err);
    }
  },

  /**
   * GET /api/v1/auth/me
   * Get current user from token
   */
  async me(req, res, next) {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found.',
        });
      }

      // Remove sensitive fields
      delete user.password_hash;
      delete user.aadhaar_hash;

      res.json({
        success: true,
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  },
};

// ── Helper functions ──

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, phone: user.phone, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
}

module.exports = AuthController;
