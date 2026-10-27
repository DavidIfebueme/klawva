CREATE TABLE refund_reserve (
  period TEXT PRIMARY KEY,
  gross_minor INTEGER NOT NULL,
  commission_minor INTEGER NOT NULL,
  reserve_rate REAL NOT NULL,
  reserved_minor INTEGER NOT NULL,
  held_until TEXT NOT NULL,
  released_at TEXT,
  tripwire_reached INTEGER NOT NULL DEFAULT 0
);
