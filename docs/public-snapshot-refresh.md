# Public snapshot refresh

`.github/workflows/refresh-public-snapshots.yml` refreshes the school activity
and academic schedule snapshots every day at 03:30 KST. It also supports a
manual run from GitHub Actions.

Before enabling the workflow, add these repository Actions secrets:

- `CLOUDFLARE_API_TOKEN`: token with D1 edit access for the production account.
- `CLOUDFLARE_ACCOUNT_ID`: production Cloudflare account ID.
- `HANSUNG_D1_DATABASE_ID`: production `site-creator-d1` database ID.

The job stops if collection fails, refuses empty or malformed snapshots, upserts
the snapshot rows without dropping the D1 table, and checks that both public
APIs return non-empty data collected within the last 36 hours. A failed job is
visible in the workflow run and should be covered by repository Actions
failure notifications.

The app source has no Worker `triggers.crons` entry. This refresh is scheduled
by GitHub Actions because it runs the existing Node crawlers and Wrangler D1
publisher; it is not a Cloudflare Worker Cron handler.
