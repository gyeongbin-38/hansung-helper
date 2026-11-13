CREATE TABLE IF NOT EXISTS collect_queue (
  account_id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  status TEXT NOT NULL,
  heartbeat INTEGER NOT NULL,
  finished_at INTEGER
);
--> statement-breakpoint
