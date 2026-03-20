// ============================================================================
// GigShield AI — JWT Authentication Middleware
// ============================================================================

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { query } = require('../config/db');

/**
 * Authenticate requests using JWT Bearer token
 * Attaches req.user = { id, phone, role }
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, config.jwt.secret);

    // Verify user still exists and is active
    const result = await query(
      'SELECT id, phone, name, role, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Token invalid.',
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Contact support.',
      });
    }

    req.user = {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please log in again.',
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
    }
    next(err);
  }
};

module.exports = { authenticate };
