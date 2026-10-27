CREATE TABLE canary_runs (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  latency_ms INTEGER,
  detail TEXT,
  ran_at TEXT NOT NULL
);
