// lib/data/*.json → D1 public_snapshots 게시.
// 재배포 없이 공개 스냅샷을 갱신한다 (API는 D1 우선, 번들 폴백).
// D1 문장 크기 제한 때문에 페이로드를 part 청크로 나눠 저장한다.
// 사용: node scripts/_publish_snapshots.mjs --local|--remote
import { readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const local = process.argv.includes('--local');
const remote = process.argv.includes('--remote');
if (local === remote)
  throw new Error('choose exactly one mode: --local or --remote');
const configPath = join(repo, 'dist', 'server', 'wrangler.json');

const CHUNK = 60_000; // D1 단일 문장 크기 제한 여유치

const courseFiles = readdirSync(join(repo, 'lib/data')).filter((name) => /^catalog-20\d{2}-[12]\.json$/.test(name)).sort();
if (!courseFiles.length) throw new Error('no course catalog found');
const KINDS = {
  courses: courseFiles.at(-1),
  ...Object.fromEntries(courseFiles.map((file) => [`courses:${file.slice(8, -5)}`, file])),
  activities: 'activities.json',
  schedule: 'schedule.json',
  'dept-rules': 'dept-rules.json',
};
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const excludeArg = process.argv.find((arg) => arg.startsWith('--exclude='));
const onlyKind = onlyArg?.slice('--only='.length);
const excludedKind = excludeArg?.slice('--exclude='.length);
if ((onlyArg && (!onlyKind || !(onlyKind in KINDS))) ||
    (excludeArg && (!excludedKind || !(excludedKind in KINDS))) ||
    (onlyKind && onlyKind === excludedKind))
  throw new Error('unknown or conflicting snapshot kind filter');
// kind별 최소 형식 가드 — 형식이 다른 파일이 올라가지 않게 차단
const SHAPE = {
  courses: (j) => Array.isArray(j.sections) && typeof j.semester === 'string',
  activities: (j) => Array.isArray(j.items),
  schedule: (j) => Array.isArray(j.items),
  'dept-rules': (j) => Array.isArray(j.items),
};

const esc = (s) => s.replace(/'/g, "''");
const stmts = [
  // Schema migration is managed in drizzle. Never drop production snapshots here.
  `CREATE TABLE IF NOT EXISTS public_snapshots (
   kind TEXT NOT NULL,
   part INTEGER NOT NULL,
   payload TEXT NOT NULL,
   fetched_at TEXT NOT NULL DEFAULT '',
   updated_at INTEGER NOT NULL,
   PRIMARY KEY (kind, part)
 );`,
];
const now = Date.now();
const generation = randomUUID();
for (const [kind, file] of Object.entries(KINDS)) {
  if ((onlyKind && kind !== onlyKind) || kind === excludedKind) continue;
  const raw = readFileSync(join(repo, 'lib/data', file), 'utf-8');
  const json = JSON.parse(raw); // 파싱 실패 시 즉시 중단 — 깨진 파일 게시 방지
  const shape = kind.startsWith('courses:') ? SHAPE.courses : SHAPE[kind];
  if (!shape(json)) throw new Error(`${file}: 예상 형식이 아닙니다`);
  if (kind.startsWith('courses') && json.semester !== file.slice(8, -5))
    throw new Error(`${file}: semester does not match filename`);
  const fetchedAt = json.fetchedAt ?? json.generatedAt ?? '';
  if (!fetchedAt || Number.isNaN(Date.parse(fetchedAt)))
    throw new Error(`${file}: fetchedAt/generatedAt이 없거나 올바르지 않습니다`);
  if ((kind === 'activities' || kind === 'schedule' || kind === 'dept-rules') && json.items.length === 0)
    throw new Error(`${file}: 비어 있는 스냅샷은 게시하지 않습니다`);
  const parts = Math.ceil(raw.length / CHUNK);
  const stagedKind = `${kind}@${generation}`;
  for (let p = 0; p < parts; p++) {
    const chunk = raw.slice(p * CHUNK, (p + 1) * CHUNK);
    stmts.push(
      `INSERT INTO public_snapshots (kind, part, payload, fetched_at, updated_at)` +
        ` VALUES ('${stagedKind}', ${p}, '${esc(chunk)}', '${fetchedAt}', ${now})` +
        ` ON CONFLICT(kind, part) DO UPDATE SET payload = excluded.payload,` +
        ` fetched_at = excluded.fetched_at, updated_at = excluded.updated_at;`,
    );
  }
  // 포인터 한 행만 교체한다. 청크가 빠졌다면 이전 포인터를 그대로 둔다.
  const manifest = esc(JSON.stringify({ kind: stagedKind, parts }));
  stmts.push(
    `INSERT INTO public_snapshots (kind, part, payload, fetched_at, updated_at) ` +
    `SELECT '${kind}@active', -1, '${manifest}', '${esc(fetchedAt)}', ${now} ` +
    `WHERE (SELECT COUNT(*) FROM public_snapshots WHERE kind = '${stagedKind}' AND part >= 0 AND part < ${parts}) = ${parts} ` +
    `ON CONFLICT(kind, part) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at, updated_at = excluded.updated_at;`,
  );
  console.log(
    `${kind}: ${file} (${raw.length}B → ${parts} part, fetched ${fetchedAt})`,
  );
}

const sqlFile = join(tmpdir(), 'hansung-snapshots.sql');
writeFileSync(sqlFile, stmts.join('\n'));
const wranglerJs = join(repo, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
if (!local) {
  const databaseId = process.env.HANSUNG_D1_DATABASE_ID ?? '';
  if (!/^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/.test(databaseId)) {
    unlinkSync(sqlFile);
    throw new Error('set HANSUNG_D1_DATABASE_ID before publishing remote snapshots');
  }
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const binding = config.d1_databases?.find(
    (db) => db.database_name === 'site-creator-d1',
  );
  if (!binding) {
    unlinkSync(sqlFile);
    throw new Error('no site-creator-d1 binding in generated Wrangler config');
  }
  binding.database_id = databaseId;
  writeFileSync(configPath, JSON.stringify(config));
}
const r = spawnSync(
  process.execPath,
  [
    wranglerJs,
    'd1',
    'execute',
    'site-creator-d1',
    local ? '--local' : '--remote',
    '--config',
    configPath,
    '--file',
    sqlFile,
    '--json',
  ],
  { cwd: repo, encoding: 'utf-8' },
);
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
unlinkSync(sqlFile);
process.exit(r.status ?? 1);
