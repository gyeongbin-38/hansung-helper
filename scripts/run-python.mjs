import { spawnSync } from 'node:child_process';

const script = process.argv[2];
if (!script) {
  console.error('Usage: node scripts/run-python.mjs <script.py> [arguments]');
  process.exit(1);
}

const candidates = process.platform === 'win32'
  ? [['py', ['-3']], ['python', []], ['python3', []]]
  : [['python3', []], ['python', []]];

for (const [command, prefix] of candidates) {
  const probe = spawnSync(command, [
    ...prefix,
    '-c',
    'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)',
  ], { stdio: 'ignore' });
  if (probe.error || probe.status !== 0) continue;

  const result = spawnSync(command, [...prefix, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, PYTHONUTF8: '1' },
  });
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
}

console.error('Python 3.10+ is required. Install Python and reopen your terminal.');
process.exit(1);
