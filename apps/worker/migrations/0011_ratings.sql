CREATE TABLE session_feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  listing_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  report TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_feedback_listing ON session_feedback (listing_id);
