// Export a D1 backup to the ignored .d1-backups directory.
// Usage: node scripts/_d1_export.mjs --local|--remote
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const local = process.argv.includes('--local');
const remote = process.argv.includes('--remote');
if (local === remote) throw new Error('choose exactly one mode: --local or --remote');

const configPath = join(repo, 'dist', 'server', 'wrangler.json');
const backupDir = resolve(repo, '.d1-backups');
const requested = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve(requested ?? join(backupDir, `${local ? 'local' : 'remote'}-${stamp}.sql`));
if (!output.startsWith(backupDir + sep))
  throw new Error('backup output must stay inside the ignored .d1-backups directory');
mkdirSync(dirname(output), { recursive: true });

if (remote) {
  const databaseId = process.env.HANSUNG_D1_DATABASE_ID ?? '';
  if (!/^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/.test(databaseId))
    throw new Error('set HANSUNG_D1_DATABASE_ID before exporting remote D1');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const binding = config.d1_databases?.find((db) => db.database_name === 'site-creator-d1');
  if (!binding) throw new Error('no site-creator-d1 binding in generated Wrangler config');
  binding.database_id = databaseId;
  writeFileSync(configPath, JSON.stringify(config));
}

const wranglerJs = join(repo, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const result = spawnSync(
  process.execPath,
  [
    wranglerJs,
    'd1',
    'export',
    'site-creator-d1',
    local ? '--local' : '--remote',
    '--output',
    output,
    '--config',
    configPath,
    '--skip-confirmation',
  ],
  { cwd: repo, encoding: 'utf-8' },
);
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? 'D1 export failed\n');
  process.exit(result.status ?? 1);
}
console.log(`D1 export saved to ${output}`);
