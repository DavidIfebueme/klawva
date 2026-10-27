ALTER TABLE agent_listings ADD COLUMN author_display TEXT;

UPDATE agent_listings
SET author_display = CASE
  WHEN owner_id = 'system' THEN 'klawva'
  ELSE COALESCE(
    (SELECT display_name FROM author_profiles WHERE author_profiles.user_id = agent_listings.owner_id),
    'author'
  )
END;
