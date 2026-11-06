/**
 * 학부 학사일정 공개 페이지 수집 → lib/data/schedule.json
 *
 * 수동/주기 실행용 (node --experimental-strip-types scripts/crawl-schedule.mts).
 * 사용자 요청 경로에서 실행되지 않는다. 이상 감지 시 기존 스냅샷 유지.
 *
 * 대상: www.hansung.ac.kr/hansung/6096/subview.do — month/year2 POST 폼으로
 * 학년도(3월~다음해 2월) 전체를 순차 수집.
 */
import { readFile } from 'node:fs/promises';
import { fetchTextWithRetry, writeSnapshotAtomic } from './crawl-utils.mts';
import {
  isScheduleAnomalous,
  parseScheduleMonth,
  type ScheduleEvent,
  type ScheduleSnapshot,
} from '../lib/data/schedule.ts';

const URL_ = 'https://www.hansung.ac.kr/hansung/6096/subview.do';
const OUT = new URL('../lib/data/schedule.json', import.meta.url);
const UA = 'hansung-campus-helper/1.0 (+snapshot; contact: site admin)';
const DELAY_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 현재 시점 기준 학년도: 3월~2월. 2026-09 → 2026-03 ~ 2027-02
const now = new Date(Date.now() + 9 * 3600_000);
const year = now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const months: [number, number][] = [];
for (let m = 3; m <= 12; m++) months.push([year, m]);
for (let m = 1; m <= 2; m++) months.push([year + 1, m]);

async function fetchMonth(y: number, m: number): Promise<string> {
  return fetchTextWithRetry(URL_, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      month: String(m),
      year2: String(y),
      schdulType: 'MONTH',
      siteId: 'hansung',
      fnctNo: '39',
    }).toString(),
  });
}

const prev: ScheduleSnapshot | null = await readFile(OUT, 'utf-8')
  .then((t) => JSON.parse(t))
  .catch(() => null);
const seen = new Map<string, ScheduleEvent>();
for (const [y, m] of months) {
  const html = await fetchMonth(y, m);
  if (!new RegExp(`<caption[^>]*>\\s*${m}월\\s*학사일정`).test(html))
    throw new Error(`${y}-${m}: unexpected schedule page`);
  const events = parseScheduleMonth(html);
  const month = `${y}-${String(m).padStart(2, '0')}`;
  if (!events.length && prev?.items.some((event) => event.start.startsWith(month)))
    throw new Error(`${month}: previously populated month returned no events`);
  for (const e of events) seen.set(`${e.start}|${e.end}|${e.title}`, e);
  console.log(`${y}-${String(m).padStart(2, '0')}: ${events.length} events`);
  await sleep(DELAY_MS);
}

const next: ScheduleSnapshot = {
  source: 'hansung-homepage',
  sourceUrl: URL_,
  fetchedAt: new Date().toISOString(),
  eventCount: seen.size,
  items: [...seen.values()].sort((a, b) => a.start.localeCompare(b.start)),
};

const anomaly = isScheduleAnomalous(next, prev);
if (anomaly) {
  console.error(`ANOMALY: ${anomaly} — keeping previous snapshot`);
  process.exit(2);
}

await writeSnapshotAtomic(OUT, next);
console.log(`wrote ${seen.size} events -> lib/data/schedule.json`);
