CREATE TABLE IF NOT EXISTS native_push_tokens (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS native_push_tokens_account ON native_push_tokens(account_id);
