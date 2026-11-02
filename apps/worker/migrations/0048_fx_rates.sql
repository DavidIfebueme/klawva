CREATE TABLE IF NOT EXISTS fx_rates (
  currency TEXT PRIMARY KEY,
  per_ngn REAL NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO fx_rates (currency, per_ngn, updated_at) VALUES
  ('USD', 0.000743, '2026-11-01T00:00:00Z'),
  ('INR', 0.070312, '2026-11-01T00:00:00Z');
