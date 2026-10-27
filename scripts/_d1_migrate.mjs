// Apply versioned D1 migrations in an explicit local or remote environment.
// Usage: node scripts/_d1_migrate.mjs --local|--remote
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const local = process.argv.includes('--local');
const remote = process.argv.includes('--remote');
if (local === remote) throw new Error('choose exactly one mode: --local or --remote');

const configPath = join(repo, 'dist', 'server', 'wrangler.json');
if (remote) {
  const databaseId = process.env.HANSUNG_D1_DATABASE_ID ?? '';
  if (!/^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/.test(databaseId))
    throw new Error('set HANSUNG_D1_DATABASE_ID before applying remote migrations');
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
    'migrations',
    'apply',
    'site-creator-d1',
    local ? '--local' : '--remote',
    '--config',
    configPath,
    '--yes',
  ],
  { cwd: repo, encoding: 'utf-8' },
);
if (result.error) throw result.error;
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
