// ============================================================================
// GigShield AI — Claim Routes
// ============================================================================

const express = require('express');
const router = express.Router();
const ClaimController = require('../controllers/claim.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { validateBody, validateUUID } = require('../middleware/validate');

// POST /api/v1/claims/auto-trigger — Internal (admin/automation)
router.post(
  '/auto-trigger',
  authenticate,
  authorize('admin', 'super_admin'),
  validateBody(['zone_id', 'disruption_type', 'trigger_id', 'measured_value', 'threshold_value']),
  ClaimController.autoTrigger
);

// GET /api/v1/claims/pending-review — Admin fraud queue
router.get(
  '/pending-review',
  authenticate,
  authorize('admin', 'super_admin'),
  ClaimController.pendingReview
);

// All remaining routes require authentication
router.use(authenticate);

// GET /api/v1/claims — Worker's claim history
router.get('/', ClaimController.list);

// GET /api/v1/claims/:id — Claim details
router.get('/:id', validateUUID('id'), ClaimController.getById);

// PUT /api/v1/claims/:id/review — Admin review
router.put(
  '/:id/review',
  authorize('admin', 'super_admin'),
  validateUUID('id'),
  validateBody(['status']),
  ClaimController.review
);

module.exports = router;
