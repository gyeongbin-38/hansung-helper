/**
 * 학부 학사일정 스냅샷 — www.hansung.ac.kr 학사일정 페이지를 수집한
 * 정규화 데이터. OFFICIAL_CRAWLED 출처. 사용자 요청 경로에서 학교
 * 사이트를 실시간 조회하지 않는다 — scripts/crawl-schedule.mts가
 * 주기적으로 스냅샷을 갱신한다.
 */

export type ScheduleEvent = {
  /** 'sch-2026-03-03-xxxxx' — start+end+title 해시 기반 안정 id */
  id: string;
  title: string;
  /** ISO 'YYYY-MM-DD' */
  start: string;
  /** 기간 일정의 종료일. 단일일이면 null */
  end: string | null;
};

export type ScheduleSnapshot = {
  source: 'hansung-homepage';
  sourceUrl: string;
  fetchedAt: string;
  eventCount: number;
  items: ScheduleEvent[];
};

const text = (s: string) =>
  s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const DATE = /(\d{4})\.(\d{1,2})\.(\d{1,2})/g;
const iso = (y: string, m: string, d: string) =>
  `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * 학사일정 월별 페이지 HTML → 일정 배열.
 * 행 구조: <tr><td|th>2026.03.03(화) ~ 2026.03.09(월)</td><td>일정명</td></tr>
 */
export function parseScheduleMonth(html: string): ScheduleEvent[] {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const events: ScheduleEvent[] = [];
  for (const row of clean.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(
      (c) => c[1],
    );
    if (cells.length < 2) continue;
    const dates = [...cells[0].matchAll(DATE)];
    if (!dates.length) continue;
    const title = text(cells[cells.length - 1]);
    if (!title) continue;
    const start = iso(dates[0][1], dates[0][2], dates[0][3]);
    const end = dates[1]
      ? iso(dates[1][1], dates[1][2], dates[1][3])
      : null;
    events.push({
      id: `sch-${start}-${fnv(title + (end ?? ''))}`,
      title,
      start,
      end,
    });
  }
  return events;
}

/** 수집 이상 감지 — 직전 스냅샷 대비 급감하면 의심. */
export function isScheduleAnomalous(
  next: ScheduleSnapshot,
  prev: ScheduleSnapshot | null,
): string | null {
  if (!next.items.length) return 'collected 0 events';
  if (!prev || !prev.eventCount) return null;
  if (next.eventCount < Math.floor(prev.eventCount * 0.5))
    return `event count dropped ${prev.eventCount} -> ${next.eventCount}`;
  return null;
}
