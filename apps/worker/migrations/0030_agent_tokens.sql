CREATE TABLE agent_tokens (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX idx_agent_tokens_listing ON agent_tokens (listing_id);

CREATE TABLE job_tokens (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_job_tokens_task ON job_tokens (task_id);
