CREATE TABLE data_deletions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_data_deletions_listing ON data_deletions (listing_id, status);
