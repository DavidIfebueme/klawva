CREATE TABLE inbound_lines (
  number TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES agent_listings(id),
  agent_slug TEXT NOT NULL,
  bolna_agent_id TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '{}',
  owner_user_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_inbound_lines_active ON inbound_lines (active);

CREATE UNIQUE INDEX idx_session_transports_carrier_ref ON session_transports (carrier_ref) WHERE carrier_ref IS NOT NULL;
