CREATE TABLE IF NOT EXISTS school_session_vault (
 account_id TEXT PRIMARY KEY NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
 ciphertext TEXT NOT NULL,
 key_version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 last_used_at INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_school_session_vault_expiry ON school_session_vault(expires_at);
