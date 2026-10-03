ALTER TABLE sessions ADD COLUMN session_token TEXT;

CREATE INDEX idx_sessions_token ON sessions (session_token);
CREATE INDEX idx_sessions_email ON sessions (customer_email);
CREATE INDEX idx_listings_status ON agent_listings (status);
CREATE INDEX idx_session_members_order ON session_members (session_id, created_at);

CREATE TABLE used_tokens (
  token_hash TEXT PRIMARY KEY,
  used_at TEXT NOT NULL
);
