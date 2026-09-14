CREATE TABLE academic_accounts (
 id TEXT PRIMARY KEY NOT NULL,
 student_mask TEXT NOT NULL,
 profile TEXT NOT NULL DEFAULT '{}',
 snapshot TEXT NOT NULL DEFAULT '{}',
 onboarded INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 consent_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE academic_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_academic_sessions_account ON academic_sessions(account_id);
--> statement-breakpoint
CREATE TABLE academic_login_limits (
 key TEXT PRIMARY KEY NOT NULL,
 attempts INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_academic_sessions_expiry ON academic_sessions(expires_at);
--> statement-breakpoint
CREATE INDEX idx_academic_login_limits_expiry ON academic_login_limits(expires_at);
