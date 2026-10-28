CREATE TABLE kit_runs (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  ok INTEGER NOT NULL,
  detail TEXT NOT NULL,
  ran_at TEXT NOT NULL
);

CREATE INDEX idx_kit_runs_listing ON kit_runs (listing_id, ran_at);
