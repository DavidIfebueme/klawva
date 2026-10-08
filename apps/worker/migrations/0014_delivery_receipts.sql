CREATE TABLE delivery_receipts (
  session_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, channel, chat_id)
);
