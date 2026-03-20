// ============================================================================
// GigShield AI — Helper Utilities
// ============================================================================

const { v4: uuidv4 } = require('uuid');

/**
 * Generate a human-readable policy number
 * Format: GS-2026-W12-XXXXX
 */
const generatePolicyNumber = () => {
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `GS-${year}-W${String(week).padStart(2, '0')}-${rand}`;
};

/**
 * Generate a human-readable claim number
 * Format: GS-CLM-2026-XXXXX
 */
const generateClaimNumber = () => {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `GS-CLM-${year}-${rand}`;
};

/**
 * Generate a payment transaction reference
 * Format: GS-PAY-XXXXXXXXXX
 */
const generateTransactionRef = () => {
  const rand = Math.random().toString(36).substring(2, 12).toUpperCase();
  return `GS-PAY-${rand}`;
};

/**
 * Get the ISO week number for a date
 */
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
};

/**
 * Get the start (Monday) and end (Sunday) of the current week
 */
const getCurrentWeekRange = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    weekStart: weekStart.toISOString().split('T')[0],
    weekEnd: weekEnd.toISOString().split('T')[0],
  };
};

/**
 * Get next week's date range (for advance purchasing)
 */
const getNextWeekRange = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToNextMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    weekStart: weekStart.toISOString().split('T')[0],
    weekEnd: weekEnd.toISOString().split('T')[0],
  };
};

/**
 * Calculate payout amount based on coverage tier
 */
const getPayoutAmount = (coverageTier) => {
  const tiers = {
    basic: 500,
    standard: 1000,
    premium: 2000,
  };
  return tiers[coverageTier] || 500;
};

/**
 * Sanitize user input string
 */
const sanitize = (str) => {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
};

module.exports = {
  generatePolicyNumber,
  generateClaimNumber,
  generateTransactionRef,
  getWeekNumber,
  getCurrentWeekRange,
  getNextWeekRange,
  getPayoutAmount,
  sanitize,
};
