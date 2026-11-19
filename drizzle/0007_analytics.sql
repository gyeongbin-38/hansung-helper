CREATE TABLE IF NOT EXISTS site_visitors (
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 1,
  ref TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (day, visitor)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS site_visitors_day ON site_visitors(day);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS site_views (
  day TEXT NOT NULL,
  section TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, section)
);
