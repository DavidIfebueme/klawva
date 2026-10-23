CREATE TABLE phone_numbers (
  number TEXT PRIMARY KEY,
  consent_source TEXT,
  consented_at TEXT,
  dnc INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_phone_numbers_dnc ON phone_numbers (dnc);
