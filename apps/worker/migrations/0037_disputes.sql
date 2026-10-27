CREATE TABLE disputes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_id TEXT,
  brief_hash TEXT,
  artifact_hash TEXT,
  opened_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  state TEXT NOT NULL,
  refund_ref TEXT,
  rerun_session_id TEXT,
  audit_ref TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_disputes_session ON disputes (session_id);
CREATE INDEX idx_disputes_state ON disputes (state);
