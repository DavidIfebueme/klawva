CREATE TABLE mission_reports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  stats TEXT NOT NULL,
  share_token TEXT NOT NULL UNIQUE,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_reports_share ON mission_reports (share_token);
