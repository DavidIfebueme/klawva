CREATE TABLE session_members (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL,
  UNIQUE (session_id, email)
);

CREATE INDEX idx_session_members_session ON session_members (session_id);
