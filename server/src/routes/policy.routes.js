// ============================================================================
// GigShield AI — Policy Routes
// ============================================================================

const express = require('express');
const router = express.Router();
const PolicyController = require('../controllers/policy.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { validateBody, validateEnum, validateUUID } = require('../middleware/validate');

// All policy routes require authentication
router.use(authenticate);

// POST /api/v1/policies — Create a new policy
router.post(
  '/',
  authorize('worker'),
  validateBody(['coverage_tier', 'disruption_type']),
  validateEnum('coverage_tier', ['basic', 'standard', 'premium']),
  validateEnum('disruption_type', ['extreme_rain', 'extreme_heat', 'air_pollution', 'flood', 'curfew']),
  PolicyController.create
);

// POST /api/v1/policies/quote — Get a premium quote
router.post(
  '/quote',
  authorize('worker'),
  validateBody(['coverage_tier', 'disruption_type']),
  PolicyController.getQuote
);

// GET /api/v1/policies/active — Get active policies
router.get('/active', authorize('worker'), PolicyController.getActive);

// GET /api/v1/policies — List all user policies
router.get('/', PolicyController.list);

// GET /api/v1/policies/:id — Get policy by ID
router.get('/:id', validateUUID('id'), PolicyController.getById);

// DELETE /api/v1/policies/:id — Cancel policy
router.delete('/:id', validateUUID('id'), PolicyController.cancel);

module.exports = router;
