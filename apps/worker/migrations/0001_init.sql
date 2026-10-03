CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE agent_listings (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  price_minor INTEGER NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE listing_versions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES agent_listings(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  manifest_hash TEXT NOT NULL,
  soul TEXT NOT NULL,
  brief_fields TEXT NOT NULL,
  tool_allowlist TEXT NOT NULL,
  model TEXT NOT NULL,
  score REAL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (listing_id, version)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  listing_version INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  brief TEXT NOT NULL,
  state TEXT NOT NULL,
  customer_email TEXT,
  window_start TEXT,
  window_end TEXT,
  budget_minor INTEGER NOT NULL DEFAULT 0,
  spent_minor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_listing ON sessions (listing_id, state);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_messages_session ON messages (session_id, created_at);

CREATE TABLE channel_links (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_channel_links_chat ON channel_links (channel, chat_id);

CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX idx_activity_session ON activity_events (session_id, occurred_at);
