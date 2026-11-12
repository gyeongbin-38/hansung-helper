// Restore an export into a fresh, isolated local D1 store and check required tables.
// Usage: node scripts/_d1_restore_rehearsal.mjs .d1-backups/remote-....sql
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const backups = resolve(repo, '.d1-backups');
const backup = resolve(process.argv[2] ?? '');
if (!backup.startsWith(backups + sep) || !existsSync(backup))
  throw new Error('provide an existing export inside .d1-backups');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const persistTo = join(backups, `restore-rehearsal-${stamp}`);
mkdirSync(persistTo, { recursive: true });
const configPath = join(repo, 'dist', 'server', 'wrangler.json');
const wranglerJs = join(repo, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function run(args) {
  const result = spawnSync(process.execPath, [wranglerJs, ...args], {
    cwd: repo,
    encoding: 'utf-8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'D1 restore rehearsal failed\n');
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? '';
}

run([
  'd1', 'execute', 'site-creator-d1', '--local', '--persist-to', persistTo,
  '--config', configPath, '--file', backup, '--json',
]);
const check = run([
  'd1', 'execute', 'site-creator-d1', '--local', '--persist-to', persistTo,
  '--config', configPath, '--command',
  'SELECT (SELECT count(*) FROM academic_accounts) AS accounts, ' +
    '(SELECT count(*) FROM academic_sessions) AS sessions, ' +
    '(SELECT count(*) FROM academic_login_limits) AS limits, ' +
    '(SELECT count(*) FROM public_snapshots) AS snapshots;', '--json',
]);
const row = JSON.parse(check)?.[0]?.results?.[0];
if (!row || !['accounts', 'sessions', 'limits', 'snapshots'].every(
  (key) => Number.isInteger(row[key]) && row[key] >= 0,
)) throw new Error('restore imported, but required tables could not be verified');
const foreignKeys = JSON.parse(run([
  'd1', 'execute', 'site-creator-d1', '--local', '--persist-to', persistTo,
  '--config', configPath, '--command', 'PRAGMA foreign_key_check;', '--json',
]));
if (!Array.isArray(foreignKeys) || foreignKeys.length !== 1 ||
    foreignKeys[0].success !== true || !Array.isArray(foreignKeys[0].results) ||
    foreignKeys[0].results.length !== 0)
  throw new Error('restore imported, but foreign-key integrity could not be verified');
console.log(`Restore rehearsal passed in isolated local D1 store: ${persistTo}`);
