CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  previous_token_hash TEXT,
  created_at TEXT NOT NULL,
  rotated_at TEXT,
  revoked_at TEXT,
  last_seen_at TEXT
);

CREATE TABLE device_sessions (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (device_id, session_id)
);

CREATE INDEX idx_devices_user ON devices (user_id, revoked_at);
CREATE INDEX idx_device_sessions_session ON device_sessions (session_id);
