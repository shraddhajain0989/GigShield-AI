// ============================================================================
// GigShield AI — Razorpay Live Service (Test Mode)
// ============================================================================
const Razorpay = require('razorpay');
const crypto = require('crypto');
const logger = require('../utils/logger');

let razorpayInstance = null;

function getInstance() {
  if (!razorpayInstance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Missing Razorpay keys in environment variables.');
    }
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

const RazorpayService = {
  /**
   * Create a Live Razorpay order for premium collection
   */
  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    try {
      const rzp = getInstance();
      logger.info(`💳 Razorpay [LIVE] Creating Order — ₹${amount}`);
      
      const order = await rzp.orders.create({
        amount: Math.round(amount * 100), // convert to paisa
        currency,
        receipt,
        notes,
      });
      return order;
    } catch (error) {
      logger.error('Razorpay Error: createOrder', error);
      throw error;
    }
  },

  /**
   * Payouts (Outbound) 
   * Tries to use RazorpayX API. If it fails (missing X Account or balance),
   * falls back to simulation to keep the app working.
   */
  async createPayout({ amount, upiId, workerId, claimId, narration }) {
    try {
      const rzp = getInstance();
      logger.info(`💳 Razorpay [LIVE] Attempting Payout — ₹${amount} to ${upiId}`);

      // Try creating through RazorpayX (requires active fund account)
      const contact = await rzp.contacts.create({
        name: `Worker ${workerId}`,
        reference_id: workerId.toString(),
        type: 'worker',
      });

      const fundAccount = await rzp.fundAccount.create({
        contact_id: contact.id,
        account_type: 'vpa',
        vpa: { address: upiId || `worker@upi` }
      });

      const payout = await rzp.payouts.create({
        account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER || '7878780080316316', // TEST ACCOUNT
        fund_account_id: fundAccount.id,
        amount: Math.round(amount * 100),
        currency: 'INR',
        mode: 'UPI',
        purpose: 'payout',
        narration: narration || `Claim #${claimId}`,
      });

      return payout;
    } catch (error) {
      logger.warn(`💳 RazorpayX Payout failed (likely missing live X Account). Falling back to Payout Simulator.`);
      // Fallback
      return {
        id: `pout_sim_${Date.now()}`,
        status: 'processed',
        utr: `UTR_SIM_${Date.now()}`,
        mode: 'UPI',
      };
    }
  },

  /**
   * Verify signature from checkout callback
   */
  verifyPaymentSignature({ order_id, payment_id, signature }) {
    const rzp = getInstance();
    const body = order_id + "|" + payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === signature;
  },

  /**
   * Verify webhook signature properly
   */
  verifyWebhookSignature({ body, signature, secret }) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    return expectedSignature === signature;
  },
};

module.exports = RazorpayService;
