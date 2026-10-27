CREATE TABLE onboarding_stages (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES agent_listings(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  at TEXT NOT NULL,
  UNIQUE(listing_id, stage)
);
CREATE INDEX idx_onboarding_stages_listing ON onboarding_stages (listing_id, stage);
