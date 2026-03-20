-- ============================================================================
-- GigShield AI — Wallet & Payment Enhancements Migration
-- ============================================================================

-- Worker Wallets
CREATE TABLE IF NOT EXISTS worker_wallets (
  id              SERIAL PRIMARY KEY,
  worker_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance         DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_credited  DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_debited   DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(3) DEFAULT 'INR',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_worker_wallet UNIQUE (worker_id)
);

-- Wallet Transactions (audit log)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              SERIAL PRIMARY KEY,
  worker_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id      UUID REFERENCES payments(id),
  amount          DECIMAL(12,2) NOT NULL,
  type            VARCHAR(30) NOT NULL,
  balance_after   DECIMAL(12,2),
  description     TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add payout tracking columns to claims if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claims' AND column_name = 'payout_transaction_ref'
  ) THEN
    ALTER TABLE claims ADD COLUMN payout_transaction_ref VARCHAR(50);
  END IF;
END $$;

-- Add beneficiary UPI to payments if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'beneficiary_upi_id'
  ) THEN
    ALTER TABLE payments ADD COLUMN beneficiary_upi_id VARCHAR(100);
  END IF;
END $$;

-- Add direction column to payments if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'direction'
  ) THEN
    ALTER TABLE payments ADD COLUMN direction VARCHAR(10) DEFAULT 'inbound';
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_worker ON worker_wallets(worker_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_worker ON wallet_transactions(worker_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_created ON wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_direction ON payments(direction);
CREATE INDEX IF NOT EXISTS idx_payments_claim ON payments(claim_id);
