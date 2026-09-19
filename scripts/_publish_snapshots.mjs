// lib/data/*.json → D1 public_snapshots 게시.
// 재배포 없이 공개 스냅샷을 갱신한다 (API는 D1 우선, 번들 폴백).
// D1 문장 크기 제한 때문에 페이로드를 part 청크로 나눠 저장한다.
// 사용: node scripts/_publish_snapshots.mjs [--local]
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const deploy = join(repo, 'published-personal');
const local = process.argv.includes('--local');

const CHUNK = 60_000; // D1 단일 문장 크기 제한 여유치

const KINDS = {
  courses: 'catalog-2026-2.json',
  activities: 'activities.json',
  schedule: 'schedule.json',
  'dept-rules': 'dept-rules.json',
};
// kind별 최소 형식 가드 — 형식이 다른 파일이 올라가지 않게 차단
const SHAPE = {
  courses: (j) => Array.isArray(j.sections) && typeof j.semester === 'string',
  activities: (j) => Array.isArray(j.items),
  schedule: (j) => Array.isArray(j.items),
  'dept-rules': (j) => Array.isArray(j.items),
};

const esc = (s) => s.replace(/'/g, "''");
const stmts = [
  // 내용은 항상 전량 재게시되므로 스키마 변경 대비 DROP 후 재생성
  `DROP TABLE IF EXISTS public_snapshots;`,
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
for (const [kind, file] of Object.entries(KINDS)) {
  const raw = readFileSync(join(repo, 'lib/data', file), 'utf-8');
  const json = JSON.parse(raw); // 파싱 실패 시 즉시 중단 — 깨진 파일 게시 방지
  if (!SHAPE[kind](json)) throw new Error(`${file}: 예상 형식이 아닙니다`);
  const fetchedAt = json.fetchedAt ?? json.generatedAt ?? '';
  stmts.push(`DELETE FROM public_snapshots WHERE kind = '${kind}';`);
  const parts = Math.ceil(raw.length / CHUNK);
  for (let p = 0; p < parts; p++) {
    const chunk = raw.slice(p * CHUNK, (p + 1) * CHUNK);
    stmts.push(
      `INSERT INTO public_snapshots (kind, part, payload, fetched_at, updated_at)` +
        ` VALUES ('${kind}', ${p}, '${esc(chunk)}', '${fetchedAt}', ${now});`,
    );
  }
  console.log(
    `${kind}: ${file} (${raw.length}B → ${parts} part, fetched ${fetchedAt})`,
  );
}

const sqlFile = join(tmpdir(), 'hansung-snapshots.sql');
writeFileSync(sqlFile, stmts.join('\n'));
const wranglerJs = join(deploy, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const r = spawnSync(
  process.execPath,
  [
    wranglerJs,
    'd1',
    'execute',
    'site-creator-d1',
    local ? '--local' : '--remote',
    '--config',
    'dist/server/wrangler.json',
    '--file',
    sqlFile,
    '--json',
  ],
  { cwd: deploy, encoding: 'utf-8' },
);
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
unlinkSync(sqlFile);
process.exit(r.status ?? 1);
