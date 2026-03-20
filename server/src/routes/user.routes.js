// ============================================================================
// GigShield AI — User Routes
// ============================================================================

const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

// All user routes require authentication
router.use(authenticate);

// GET /api/v1/users/profile
router.get('/profile', UserController.getProfile);

// PUT /api/v1/users/profile
router.put('/profile', UserController.updateProfile);

// POST /api/v1/users/zone — Select work zone
router.post('/zone', authorize('worker'), UserController.selectZone);

// POST /api/v1/users/kyc — Submit KYC
router.post('/kyc', authorize('worker'), UserController.submitKyc);

// GET /api/v1/users/zones — List available zones
router.get('/zones', UserController.listZones);

// GET /api/v1/users/analytics — Worker specific trends
router.get('/analytics', UserController.getWorkerAnalytics);

module.exports = router;
