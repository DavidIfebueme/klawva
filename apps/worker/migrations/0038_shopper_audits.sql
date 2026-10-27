CREATE TABLE shopper_audits (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  verdict TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_shopper_audits_listing ON shopper_audits (listing_id, created_at);
ALTER TABLE shopper_audits ADD COLUMN price_minor INTEGER NOT NULL DEFAULT 0;
