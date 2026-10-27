ALTER TABLE session_tasks ADD COLUMN ignored_cancels INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session_tasks ADD COLUMN cancel_delivered_at TEXT;
ALTER TABLE session_tasks ADD COLUMN last_poll_state TEXT;
