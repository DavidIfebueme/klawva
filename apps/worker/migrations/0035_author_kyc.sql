ALTER TABLE author_profiles ADD COLUMN country TEXT;
ALTER TABLE author_profiles ADD COLUMN tin TEXT;
ALTER TABLE author_profiles ADD COLUMN kyc_tier INTEGER NOT NULL DEFAULT 0;
ALTER TABLE author_profiles ADD COLUMN payout_account_id TEXT;
