// ============================================================================
// GigShield AI — Admin Routes
// ============================================================================

const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { validateBody } = require('../middleware/validate');

// All admin routes require admin authentication
router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

// GET /api/v1/admin/overview — Platform KPIs
router.get('/overview', AdminController.getOverview);

// GET /api/v1/admin/workers — List all workers
router.get('/workers', AdminController.listWorkers);

// GET /api/v1/admin/policies — List all policies
router.get('/policies', AdminController.listPolicies);

// GET /api/v1/admin/claims — List all claims
router.get('/claims', AdminController.listClaims);

// GET /api/v1/admin/risk-analytics — Risk & disruption analytics
router.get('/risk-analytics', AdminController.riskAnalytics);

// GET /api/v1/admin/zones — List all zones (for map)
router.get('/zones', AdminController.listZones);

// POST /api/v1/admin/zones — Create a new zone
router.post(
  '/zones',
  validateBody(['zone_name', 'city', 'state', 'latitude', 'longitude']),
  AdminController.createZone
);

// POST /api/v1/admin/trigger-scan — Force trigger scan
router.post('/trigger-scan', AdminController.triggerScan);

module.exports = router;
