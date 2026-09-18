// wrangler d1 execute --remote 래퍼 — 셸 인용 문제 우회 (node로 wrangler 직접 실행).
// 사용: node scripts/_d1q.mjs "SQL"
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sql = process.argv.slice(2).join(' ').replace(/"/g, '');
if (!sql) {
  console.error('usage: node _d1q.mjs "SQL"');
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const wranglerJs = join(
  here,
  '..',
  'published-personal',
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
);
const r = spawnSync(
  process.execPath,
  [
    wranglerJs,
    'd1', 'execute', 'site-creator-d1', '--remote',
    '--config', 'dist/server/wrangler.json',
    '--command', sql,
    '--json',
  ],
  { cwd: join(here, '..', 'published-personal'), encoding: 'utf-8' },
);
if (r.error) console.error('spawn error:', r.error.message);
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
process.exit(r.status ?? 1);
