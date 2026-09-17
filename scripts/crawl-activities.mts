/**
 * hsportal 비교과 프로그램 공개 목록 수집 → lib/data/activities.json
 *
 * 수동/주기 실행용 (node --experimental-strip-types scripts/crawl-activities.mts).
 * 사용자 요청 경로에서 실행되지 않는다. 이상 감지 시 기존 스냅샷 유지.
 */
import { readFile, writeFile } from 'node:fs/promises';
import {
  isAnomalous,
  parseProgramList,
  type Activity,
  type ActivitySnapshot,
} from '../lib/data/activities.ts';

const BASE = 'https://hsportal.hansung.ac.kr/ko/program/all/list/all/1';
const OUT = new URL('../lib/data/activities.json', import.meta.url);
const UA = 'hansung-campus-helper/1.0 (+snapshot; contact: site admin)';
const DELAY_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(page: number): Promise<string> {
  const url = page === 1 ? BASE : `${BASE}/${page}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`);
  return res.text();
}

const seen = new Map<string, Activity>();
const first = await fetchPage(1);
const { items, pageTotal } = parseProgramList(first);
for (const it of items) seen.set(it.key, it);
console.log(`page 1/${pageTotal}: ${items.length} items`);

for (let p = 2; p <= pageTotal; p++) {
  await sleep(DELAY_MS);
  const { items: more } = await parseProgramList(await fetchPage(p));
  for (const it of more) seen.set(it.key, it);
  console.log(`page ${p}/${pageTotal}: ${more.length} items`);
}

const prev: ActivitySnapshot | null = await readFile(OUT, 'utf-8')
  .then((t) => JSON.parse(t))
  .catch(() => null);

const next: ActivitySnapshot = {
  source: 'hsportal',
  sourceUrl: BASE,
  fetchedAt: new Date().toISOString(),
  itemCount: seen.size,
  items: [...seen.values()],
};

const anomaly = isAnomalous(next, prev);
if (anomaly) {
  console.error(`ANOMALY: ${anomaly} — keeping previous snapshot`);
  process.exit(2);
}

await writeFile(OUT, JSON.stringify(next, null, 2) + '\n');
console.log(`wrote ${seen.size} items -> lib/data/activities.json`);
