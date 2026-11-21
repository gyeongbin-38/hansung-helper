CREATE TABLE IF NOT EXISTS community_blocks (
  account_id TEXT NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, blocked_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_community_blocks_blocked ON community_blocks(blocked_id);
