ALTER TABLE sessions ADD COLUMN user_id TEXT;

CREATE INDEX idx_sessions_user ON sessions (user_id, created_at);

DROP INDEX IF EXISTS idx_channel_links_chat;
CREATE TABLE channel_links_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (channel, chat_id, session_id)
);
INSERT INTO channel_links_new (id, session_id, channel, chat_id, status, created_at, updated_at)
  SELECT id, session_id, channel, chat_id, status, created_at, updated_at FROM channel_links;
DROP TABLE channel_links;
ALTER TABLE channel_links_new RENAME TO channel_links;
CREATE INDEX idx_channel_links_chat ON channel_links (channel, chat_id);

CREATE TABLE chat_active_session (
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (channel, chat_id)
);

CREATE TABLE claim_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  email TEXT NOT NULL,
  used_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_claim_tokens_session ON claim_tokens (session_id);
