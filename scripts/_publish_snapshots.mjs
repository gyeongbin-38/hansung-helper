// lib/data/*.json → D1 public_snapshots 게시.
// 재배포 없이 공개 스냅샷을 갱신한다 (API는 D1 우선, 번들 폴백).
// D1 문장 크기 제한 때문에 페이로드를 part 청크로 나눠 저장한다.
// 사용: node scripts/_publish_snapshots.mjs --local|--remote
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
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

const CHUNK_BYTES = 80_000; // 로컬/원격 D1 문장 한도(~100KB) 여유치 — UTF-8 바이트 기준

// SQL 문장 바이트 한도에 맞춰 페이로드를 나눈다. 코드 포인트 단위로 잘라
// 서로게이트 쌍이 깨지지 않게 한다.
function* chunksOf(raw) {
  let buf = '';
  let bytes = 0;
  for (const ch of raw) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > CHUNK_BYTES && buf) {
      yield buf;
      buf = '';
      bytes = 0;
    }
    buf += ch;
    bytes += b;
  }
  if (buf) yield buf;
}

const courseFiles = readdirSync(join(repo, 'lib/data')).filter((name) => /^catalog-20\d{2}-[1-4]\.json$/.test(name)).sort();
if (!courseFiles.length) throw new Error('no course catalog found');
// 과거 학기 카탈로그·교육과정은 번들에 넣지 않고 D1으로만 게시 (번들 크기 한도)
// 디렉터리가 없으면(신규 체크아웃) 이력 kind 없이 진행한다
const historyDir = join(repo, 'lib/data/history');
const historyFiles = existsSync(historyDir) ? readdirSync(historyDir) : [];
const historyCatalogs = historyFiles
  .filter((name) => /^catalog-20\d{2}-[1-4]\.json$/.test(name))
  .sort();
const curriculumFiles = historyFiles
  .filter((name) => /^curriculum-20\d{2}-[1-4]\.json$/.test(name))
  .sort();
const KINDS = {
  courses: courseFiles.at(-1),
  ...Object.fromEntries(courseFiles.map((file) => [`courses:${file.slice(8, -5)}`, file])),
  ...Object.fromEntries(historyCatalogs.map((file) => [`courses:${file.slice(8, -5)}`, `history/${file}`])),
  ...Object.fromEntries(curriculumFiles.map((file) => [`curriculum:${file.slice(11, -5)}`, `history/${file}`])),
  'curriculum-index': 'curriculum-index.json',
  activities: 'activities.json',
  schedule: 'schedule.json',
  'dept-rules': 'dept-rules.json',
  'dept-pages': 'dept-pages.json',
  equivalents: 'equivalents.json',
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
  curriculum: (j) => j.majors && typeof j.majors === 'object' && typeof j.semester === 'string',
  'curriculum-index': (j) => j.semesters && typeof j.semesters === 'object',
  activities: (j) => Array.isArray(j.items),
  schedule: (j) => Array.isArray(j.items),
  'dept-rules': (j) => Array.isArray(j.items),
  'dept-pages': (j) => Array.isArray(j.pages),
  equivalents: (j) => j.groups && typeof j.groups === 'object' && !Array.isArray(j.groups) && typeof j.rowCount === 'number',
};

const esc = (s) => s.replace(/'/g, "''");
// 이력 데이터까지 포함한 SQL 파일이 커지면(수십 MB) 실행이 불안정하므로
// kind 경계 단위로 파일을 나눠 순서대로 실행한다.
// 포인터 문장의 카운트 가드가 각 kind의 원자성을 지킨다.
const BATCH_BYTES = 8 * 1024 * 1024;
const header =
  // Schema migration is managed in drizzle. Never drop production snapshots here.
  `CREATE TABLE IF NOT EXISTS public_snapshots (
   kind TEXT NOT NULL,
   part INTEGER NOT NULL,
   payload TEXT NOT NULL,
   fetched_at TEXT NOT NULL DEFAULT '',
   updated_at INTEGER NOT NULL,
   PRIMARY KEY (kind, part)
 );`;
const batches = [[header]];
let batchBytes = header.length;
const now = Date.now();
const generation = randomUUID();
for (const [kind, file] of Object.entries(KINDS)) {
  if ((onlyKind && kind !== onlyKind) || kind === excludedKind) continue;
  const raw = readFileSync(join(repo, 'lib/data', file), 'utf-8');
  const json = JSON.parse(raw); // 파싱 실패 시 즉시 중단 — 깨진 파일 게시 방지
  const shape = kind.startsWith('courses:')
    ? SHAPE.courses
    : kind.startsWith('curriculum:')
      ? SHAPE.curriculum
      : SHAPE[kind];
  if (!shape(json)) throw new Error(`${file}: 예상 형식이 아닙니다`);
  if (kind.startsWith('courses') && json.semester !== file.slice(file.lastIndexOf('catalog-') + 8, -5))
    throw new Error(`${file}: semester does not match filename`);
  if (kind.startsWith('curriculum:') && json.semester !== file.slice(file.lastIndexOf('curriculum-') + 11, -5))
    throw new Error(`${file}: semester does not match filename`);
  const fetchedAt = json.fetchedAt ?? json.generatedAt ?? '';
  if (!fetchedAt || Number.isNaN(Date.parse(fetchedAt)))
    throw new Error(`${file}: fetchedAt/generatedAt이 없거나 올바르지 않습니다`);
  if ((kind === 'activities' || kind === 'schedule' || kind === 'dept-rules' || kind === 'dept-pages') && (json.items ?? json.pages ?? []).length === 0)
    throw new Error(`${file}: 비어 있는 스냅샷은 게시하지 않습니다`);
  if (kind === 'equivalents' && Object.keys(json.groups ?? {}).length === 0)
    throw new Error(`${file}: 비어 있는 스냅샷은 게시하지 않습니다`);
  const chunkList = [...chunksOf(raw)];
  const parts = chunkList.length;
  const stagedKind = `${kind}@${generation}`;
  const kindStmts = [];
  for (let p = 0; p < parts; p++) {
    const chunk = chunkList[p];
    kindStmts.push(
      `INSERT INTO public_snapshots (kind, part, payload, fetched_at, updated_at)` +
        ` VALUES ('${stagedKind}', ${p}, '${esc(chunk)}', '${esc(fetchedAt)}', ${now})` +
        ` ON CONFLICT(kind, part) DO UPDATE SET payload = excluded.payload,` +
        ` fetched_at = excluded.fetched_at, updated_at = excluded.updated_at;`,
    );
  }
  // 포인터 한 행만 교체한다. 청크가 빠졌다면 이전 포인터를 그대로 둔다.
  const manifest = esc(JSON.stringify({ kind: stagedKind, parts }));
  kindStmts.push(
    `INSERT INTO public_snapshots (kind, part, payload, fetched_at, updated_at) ` +
    `SELECT '${kind}@active', -1, '${manifest}', '${esc(fetchedAt)}', ${now} ` +
    `WHERE (SELECT COUNT(*) FROM public_snapshots WHERE kind = '${stagedKind}' AND part >= 0 AND part < ${parts}) = ${parts} ` +
    `ON CONFLICT(kind, part) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at, updated_at = excluded.updated_at;`,
  );
  const size = Buffer.byteLength(kindStmts.join('\n'));
  if (size > BATCH_BYTES)
    throw new Error(`${file}: 단일 kind가 배치 한도(${BATCH_BYTES}B)를 넘습니다`);
  if (batchBytes + size > BATCH_BYTES) {
    batches.push([]);
    batchBytes = 0;
  }
  batches.at(-1).push(...kindStmts);
  batchBytes += size;
  console.log(
    `${kind}: ${file} (${raw.length}B → ${parts} part, fetched ${fetchedAt})`,
  );
}

// Private, unique directory per invocation prevents shared-name collisions and
// pre-created links. Exclusive creation also refuses an existing batch file.
const sqlDir = mkdtempSync(join(tmpdir(), 'hansung-snapshots-'));
let status = 0;
try {
  const sqlFiles = batches.map((b, i) => {
    const f = join(sqlDir, `batch-${i}.sql`);
    writeFileSync(f, b.join('\n'), { flag: 'wx', mode: 0o600 });
    return f;
  });
  const wranglerJs = join(repo, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!local) {
    const databaseId = process.env.HANSUNG_D1_DATABASE_ID ?? '';
    if (!/^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/.test(databaseId)) {
      throw new Error('set HANSUNG_D1_DATABASE_ID before publishing remote snapshots');
    }
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const binding = config.d1_databases?.find(
      (db) => db.database_name === 'site-creator-d1',
    );
    if (!binding) {
      throw new Error('no site-creator-d1 binding in generated Wrangler config');
    }
    binding.database_id = databaseId;
    writeFileSync(configPath, JSON.stringify(config));
  }
  if (sqlFiles.length > 1)
    console.log(`${sqlFiles.length}개 배치 파일로 나눠 실행합니다`);
  for (const sqlFile of sqlFiles) {
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
    if (r.status !== 0) {
      console.error(`배치 ${sqlFiles.indexOf(sqlFile) + 1}/${sqlFiles.length} 실패 — 이후 배치는 건너뜁니다`);
      status = r.status ?? 1;
      break;
    }
  }
} finally {
  rmSync(sqlDir, { recursive: true, force: true });
}
process.exit(status);
