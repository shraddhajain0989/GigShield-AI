// ============================================================================
// GigShield AI — Auth Routes
// ============================================================================

const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');

// POST /api/v1/auth/register
router.post(
  '/register',
  validateBody(['phone', 'name', 'password', 'platform']),
  AuthController.register
);

// POST /api/v1/auth/login
router.post(
  '/login',
  validateBody(['phone', 'password']),
  AuthController.login
);

// POST /api/v1/auth/refresh
router.post(
  '/refresh',
  validateBody(['refreshToken']),
  AuthController.refresh
);

// GET /api/v1/auth/me — requires authentication
router.get('/me', authenticate, AuthController.me);

module.exports = router;
