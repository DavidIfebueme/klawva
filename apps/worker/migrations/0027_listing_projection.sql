ALTER TABLE agent_listings ADD COLUMN author_display TEXT;

-- never copy a profile row that was auto-filled with the signup email.
UPDATE agent_listings
SET author_display = CASE
  WHEN owner_id = 'system' THEN 'klawva'
  ELSE COALESCE(
    (SELECT CASE
       WHEN p.display_name IS NULL THEN NULL
       WHEN instr(p.display_name, '@') > 0 THEN NULL
       ELSE p.display_name
     END
     FROM author_profiles p WHERE p.user_id = agent_listings.owner_id),
    'author'
  )
END;
