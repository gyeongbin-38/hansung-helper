CREATE TABLE public_snapshots (
 kind TEXT NOT NULL,
 part INTEGER NOT NULL,
 payload TEXT NOT NULL,
 fetched_at TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL,
 PRIMARY KEY (kind, part)
);
