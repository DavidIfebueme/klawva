CREATE TABLE IF NOT EXISTS evidence_checks (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  url TEXT NOT NULL,
  status INTEGER NOT NULL,
  resolved_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_checks_report ON evidence_checks (report_id);
