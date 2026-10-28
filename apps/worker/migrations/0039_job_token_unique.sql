DELETE FROM job_tokens
WHERE rowid NOT IN (SELECT MAX(rowid) FROM job_tokens GROUP BY task_id);

CREATE UNIQUE INDEX idx_job_tokens_task_unique ON job_tokens (task_id);
