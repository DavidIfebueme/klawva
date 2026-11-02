ALTER TABLE session_transports ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session_transports ADD COLUMN retry_after TEXT;
ALTER TABLE session_transports ADD COLUMN dialing_at TEXT;

UPDATE listing_versions
SET brief_fields = CASE
  WHEN json_array_length(brief_fields) = 0 THEN '["phone"]'
  ELSE '["phone",' || substr(brief_fields, 2)
END
WHERE listing_id IN (
  SELECT id FROM agent_listings
  WHERE slug IN ('appointmentsetter', 'followupcaller', 'checkincaller')
)
AND json_extract(brief_fields, '$[0]') IS NOT 'phone';
