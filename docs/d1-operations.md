# D1 environments, migrations, and backups

## Environment boundary

- The app binds D1 as `DB`. `wrangler dev` uses the project-local database in
  `dist/server/.wrangler/state/`; it does not point at production.
- The generated preview binding uses an unset placeholder ID. `wrangler dev
  --remote` therefore fails until a separate preview D1 database is configured,
  instead of silently using production.
- The production database ID is patched into the generated Wrangler config from
  `HANSUNG_D1_DATABASE_ID`. Never commit that config or the identifier.
- Every D1 helper requires an explicit `--local` or `--remote` mode.

## Versioned migrations

Both `drizzle/0000_academic_accounts.sql` and
`drizzle/0001_public_snapshots.sql` are registered in Drizzle's migration
journal and are idempotent so an existing table is preserved. Wrangler's D1
migration config points to `drizzle/`.

After `npm run build`, apply locally with `npm run d1:migrate:local`. Remote
migrations use `npm run d1:migrate:remote`, require
`HANSUNG_D1_DATABASE_ID`, and are owner-only. Review the pending SQL and take a
backup before running that command against production.

## Backup and restore rehearsal

`npm run d1:backup:local` exports the local database. For an owner-approved
production backup, set `HANSUNG_D1_DATABASE_ID` and run
`npm run d1:backup:remote`. Exports are written under `.d1-backups/`, which is
gitignored because account rows contain private academic data. Keep that folder
on an access-controlled disk and out of shared logs or repositories.

To rehearse restoring an export without touching the active local or remote
database:

```powershell
npm run d1:restore:rehearsal -- .d1-backups/remote-<timestamp>.sql
```

The rehearsal imports into a fresh, isolated local D1 store and runs
`PRAGMA integrity_check`. It leaves that store and the export in the ignored
backup directory for inspection. This repository change does not run a
production export, migration, or restore; those operations stay owner-only.
