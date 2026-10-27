// Restore an export into a fresh, isolated local D1 store and check integrity.
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
    process.stderr.write(result.stderr ?? 'D1 restore rehearsal failed\n');
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
  '--config', configPath, '--command', 'PRAGMA integrity_check;', '--json',
]);
if (!/"ok"|\bok\b/i.test(check))
  throw new Error('restore imported, but SQLite integrity_check did not return ok');
console.log(`Restore rehearsal passed in isolated local D1 store: ${persistTo}`);
