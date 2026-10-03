CREATE TABLE breet_addresses (
  address TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_breet_session ON breet_addresses (session_id);
