// lib/data/catalog-*.json + lib/data/history/catalog-*.json →
// lib/data/history/course-history.json (과목 코드별 개설 학기 패턴).
// 출력 형식은 lib/data/course-history.ts의 CourseHistory 타입과 같아야 한다.
// _publish_snapshots.mjs가 history 카탈로그가 있을 때 자동으로 실행한다.
// 단독 실행: node scripts/build-course-history.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'lib', 'data');
const historyDir = join(dataDir, 'history');

const catalogFiles = [
  ...readdirSync(dataDir)
    .filter((name) => /^catalog-20\d{2}-[1-4]\.json$/.test(name))
    .map((name) => join(dataDir, name)),
  ...(existsSync(historyDir)
    ? readdirSync(historyDir)
        .filter((name) => /^catalog-20\d{2}-[1-4]\.json$/.test(name))
        .map((name) => join(historyDir, name))
    : []),
].sort();
if (!catalogFiles.length) throw new Error('no course catalog found');

const courses = new Map();
let semesterCount = 0;
for (const file of catalogFiles) {
  const cat = JSON.parse(readFileSync(file, 'utf-8'));
  if (!/^20\d{2}-[1-4]$/.test(cat.semester)) continue;
  semesterCount++;
  const term = cat.semester.slice(5);
  for (const s of cat.sections ?? []) {
    const code = s.code?.trim();
    if (!code) continue;
    let e = courses.get(code);
    if (!e) {
      e = { name: '', terms: new Set(), last: cat.semester };
      courses.set(code, e);
    }
    e.terms.add(term);
    e.last = cat.semester;
    if ((s.name ?? '').length > e.name.length) e.name = s.name;
  }
}
const out = {
  generatedAt: new Date().toISOString(),
  semesterCount,
  courses: Object.fromEntries(
    [...courses.entries()].map(([code, e]) => [
      code,
      { name: e.name, terms: [...e.terms].sort().join(''), last: e.last },
    ]),
  ),
};
mkdirSync(historyDir, { recursive: true });
const target = join(historyDir, 'course-history.json');
writeFileSync(target, JSON.stringify(out));
console.log(
  `course-history.json: ${catalogFiles.length}개 카탈로그 → ${Object.keys(out.courses).length}개 과목`,
);
