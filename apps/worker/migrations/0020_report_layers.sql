CREATE TABLE mission_reports_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  transport_id TEXT,
  summary TEXT NOT NULL,
  stats TEXT NOT NULL,
  share_token TEXT NOT NULL UNIQUE,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO mission_reports_new (id, session_id, transport_id, summary, stats, share_token, delivered_at, created_at, updated_at)
  SELECT id, session_id, NULL, summary, stats, share_token, delivered_at, created_at, updated_at FROM mission_reports;

DROP TABLE mission_reports;

ALTER TABLE mission_reports_new RENAME TO mission_reports;

CREATE INDEX idx_reports_share ON mission_reports (share_token);
CREATE UNIQUE INDEX idx_reports_digest ON mission_reports (session_id) WHERE transport_id IS NULL;
CREATE UNIQUE INDEX idx_reports_transport ON mission_reports (session_id, transport_id) WHERE transport_id IS NOT NULL;
