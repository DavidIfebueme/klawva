ALTER TABLE refund_reserve ADD COLUMN platform_funded_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE refund_reserve ADD COLUMN window_commission_minor INTEGER NOT NULL DEFAULT 0;

CREATE TABLE refund_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  effective_at TEXT NOT NULL,
  guarantee_hours INTEGER NOT NULL
);
INSERT INTO refund_policy (id, effective_at, guarantee_hours)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 72);
