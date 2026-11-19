CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS push_subscriptions_account ON push_subscriptions(account_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS push_notified (
  account_id TEXT NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
  notif_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, notif_id)
);
