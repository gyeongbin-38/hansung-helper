CREATE TABLE IF NOT EXISTS community_aliases (
 account_id TEXT PRIMARY KEY NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
 alias TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS community_posts (
 id TEXT PRIMARY KEY NOT NULL,
 author_id TEXT NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
 category TEXT NOT NULL DEFAULT '자유',
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 deleted INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 updated_at INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(deleted, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_community_posts_author ON community_posts(author_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS community_comments (
 id TEXT PRIMARY KEY NOT NULL,
 post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
 author_id TEXT NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
 parent_id TEXT,
 body TEXT NOT NULL,
 deleted INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 updated_at INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_community_comments_author ON community_comments(author_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS community_post_likes (
 post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 PRIMARY KEY (post_id, account_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_community_post_likes_post ON community_post_likes(post_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS community_reports (
 id TEXT PRIMARY KEY NOT NULL,
 target_type TEXT NOT NULL,
 target_id TEXT NOT NULL,
 post_id TEXT NOT NULL,
 reporter_id TEXT NOT NULL REFERENCES academic_accounts(id) ON DELETE CASCADE,
 reason TEXT NOT NULL,
 detail TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 UNIQUE (target_type, target_id, reporter_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_community_reports_target ON community_reports(target_type, target_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_community_reports_created ON community_reports(created_at DESC);
