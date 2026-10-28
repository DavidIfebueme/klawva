CREATE TABLE payout_instructions (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  period TEXT NOT NULL,
  psp TEXT NOT NULL,
  subaccount TEXT NOT NULL,
  gross_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  fx_rate REAL,
  commission_minor INTEGER NOT NULL,
  vat_minor INTEGER NOT NULL,
  wht_minor INTEGER NOT NULL,
  net_minor INTEGER NOT NULL,
  psp_transfer_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reversal_ref TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(author_id, period, subaccount)
);
