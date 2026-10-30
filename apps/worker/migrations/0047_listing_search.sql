CREATE VIRTUAL TABLE IF NOT EXISTS listing_fts USING fts5(
  listing_id UNINDEXED,
  name,
  tagline,
  category,
  body,
  tokenize = 'porter unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS listing_embeddings (
  listing_id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  dims INTEGER NOT NULL,
  vector TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
