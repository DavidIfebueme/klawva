ALTER TABLE bundle_revocations ADD COLUMN sha256 TEXT;
CREATE INDEX idx_bundle_revocations_hash ON bundle_revocations (bundle_id, sha256);
