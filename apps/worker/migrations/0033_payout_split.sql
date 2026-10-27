ALTER TABLE payments ADD COLUMN refund_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN refunded_at TEXT;
ALTER TABLE payments ADD COLUMN refund_source TEXT;
ALTER TABLE payments ADD COLUMN refund_psp_id TEXT;
ALTER TABLE payments ADD COLUMN refund_task_id TEXT;
ALTER TABLE payments ADD COLUMN refund_reason TEXT;
ALTER TABLE payments ADD COLUMN settlement_status TEXT;

CREATE UNIQUE INDEX idx_payments_refund_psp ON payments (refund_psp_id) WHERE refund_psp_id IS NOT NULL;

CREATE TABLE payout_accounts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  psp TEXT NOT NULL,
  subaccount TEXT NOT NULL,
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE(author_id, psp)
);

CREATE TABLE payment_splits (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  gross_minor INTEGER NOT NULL,
  commission_minor INTEGER NOT NULL,
  net_minor INTEGER NOT NULL,
  commission_rate REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(payment_id)
);

CREATE INDEX idx_payment_splits_author ON payment_splits (author_id, created_at);
