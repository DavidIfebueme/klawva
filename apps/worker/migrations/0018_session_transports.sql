CREATE TABLE session_transports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  state TEXT NOT NULL,
  carrier TEXT,
  carrier_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_session_transports_session ON session_transports (session_id, state);

CREATE UNIQUE INDEX idx_session_transports_capability ON session_transports (session_id, type) WHERE carrier_ref IS NULL;
