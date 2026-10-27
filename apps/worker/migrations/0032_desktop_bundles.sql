ALTER TABLE author_profiles ADD COLUMN public_key TEXT;

CREATE TABLE desktop_bundles (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  latest_version TEXT NOT NULL,
  min_supported TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE bundle_versions (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL,
  version TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  signature TEXT NOT NULL,
  countersignature TEXT,
  capabilities TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE(bundle_id, version)
);

CREATE TABLE bundle_revocations (
  bundle_id TEXT NOT NULL,
  version TEXT NOT NULL,
  reason TEXT NOT NULL,
  revoked_at TEXT NOT NULL,
  PRIMARY KEY (bundle_id, version)
);

CREATE TABLE bundle_grants (
  device_id TEXT NOT NULL,
  bundle_id TEXT NOT NULL,
  version TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (device_id, bundle_id)
);
