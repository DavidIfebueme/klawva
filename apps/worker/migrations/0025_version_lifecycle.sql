ALTER TABLE listing_versions ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE listing_versions ADD COLUMN price_minor INTEGER;

UPDATE listing_versions
SET price_minor = (SELECT price_minor FROM agent_listings WHERE agent_listings.id = listing_versions.listing_id);
ALTER TABLE listing_versions ADD COLUMN published_at TEXT;
ALTER TABLE listing_versions ADD COLUMN superseded_at TEXT;

UPDATE listing_versions
SET status = (SELECT status FROM agent_listings WHERE agent_listings.id = listing_versions.listing_id),
    published_at = CASE
      WHEN listing_versions.version = (SELECT current_version FROM agent_listings WHERE agent_listings.id = listing_versions.listing_id)
       AND (SELECT status FROM agent_listings WHERE agent_listings.id = listing_versions.listing_id) = 'published'
      THEN listing_versions.created_at
      ELSE NULL
    END
WHERE listing_versions.version = (SELECT current_version FROM agent_listings WHERE agent_listings.id = listing_versions.listing_id);

UPDATE listing_versions
SET status = 'superseded',
    superseded_at = listing_versions.created_at
WHERE listing_versions.version < (SELECT current_version FROM agent_listings WHERE agent_listings.id = listing_versions.listing_id);
