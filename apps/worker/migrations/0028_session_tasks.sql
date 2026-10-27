CREATE TABLE session_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  listing_version INTEGER NOT NULL,
  carrier TEXT NOT NULL,
  state TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  dispatched_at TEXT,
  accepted_at TEXT,
  first_byte_at TEXT,
  last_event_at TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  bytes_in INTEGER NOT NULL DEFAULT 0,
  artifact_hash TEXT,
  artifact_bytes INTEGER,
  cancel_requested_at TEXT,
  cancel_acked_at TEXT,
  failure_reason TEXT,
  brief_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(session_id)
);

CREATE INDEX idx_session_tasks_watchdog ON session_tasks (state, last_event_at);
CREATE INDEX idx_session_tasks_listing ON session_tasks (listing_id, created_at);

CREATE TABLE task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE(task_id, seq)
);
