// ============================================================================
// GigShield AI — Payment Routes
// ============================================================================

const router = require('express').Router();
const PaymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

// ── Worker Routes (authenticated) ──
router.post('/collect-premium', authenticate, PaymentController.collectPremium);
router.post('/verify-premium',  authenticate, PaymentController.verifyPremium);
router.get('/wallet',           authenticate, PaymentController.getWallet);
router.get('/history',          authenticate, PaymentController.getHistory);

// ── Admin Routes ──
router.post('/process-payout',  authenticate, authorize('admin', 'super_admin'), PaymentController.processPayout);
router.get('/revenue',          authenticate, authorize('admin', 'super_admin'), PaymentController.getRevenue);

// ── Razorpay Webhook (no auth — verified via signature) ──
router.post('/webhook', PaymentController.handleWebhook);

module.exports = router;
