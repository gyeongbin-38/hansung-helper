/**
 * 비교과 프로그램 스냅샷 — hsportal(스마트자기관리시스템) 공개 목록을
 * 수집한 정규화 데이터. OFFICIAL_CRAWLED 출처. 사용자 요청 경로에서
 * 학교 사이트를 실시간 조회하지 않는다 — scripts/crawl-activities.mts가
 * 주기적으로 스냅샷을 갱신한다.
 */

export type ActivityStatus =
  | 'upcoming' // 접수예정
  | 'open' // 접수중
  | 'closing' // 마감임박(접수중)
  | 'running' // 운영중
  | 'closed' // 마감
  | 'unknown';

export type Activity = {
  /** 'hs-14041' — source_system + source_key 조합 id */
  id: string;
  /** hsportal 프로그램 id (view/{key}) */
  key: string;
  title: string;
  /** 운영기관 (학과·행정부서) */
  dept: string;
  status: ActivityStatus;
  statusLabel: string;
  /** 신청 기간 ISO (없으면 null) */
  applyStart: string | null;
  applyEnd: string | null;
  runStart: string | null;
  runEnd: string | null;
  /** 'D-3' 같은 표시용 마감 카운트 */
  dday: string | null;
  /** 비교과 포인트 (인재인증 p40 등). 없으면 null */
  points: number | null;
  /** 개인/팀 구분 */
  team: '개인' | '팀' | null;
  applicants: number | null;
  /** 정원. null = 무제한/미표기 */
  capacity: number | null;
  /** 인재인증 배지 */
  certified: boolean;
  /** hsportal 상세 페이지 */
  url: string;
  cover: string | null;
};

export type ActivitySnapshot = {
  source: 'hsportal';
  sourceUrl: string;
  fetchedAt: string;
  itemCount: number;
  items: Activity[];
};

const HOST = 'https://hsportal.hansung.ac.kr';
const STATUS_MAP: Record<string, [ActivityStatus, string]> = {
  APPROACHING: ['upcoming', '접수예정'],
  OPEN: ['open', '접수중'],
  APPROACH_CLOSING: ['closing', '마감임박'],
  RUNNING: ['running', '운영중'],
  CLOSED: ['closed', '마감'],
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

/**
 * hsportal /ko/program/all 리스트 HTML → 카드 배열.
 * 카드 단위: <div data-module="eco" data-role="item" class="{STATUS}">…</li>
 */
export function parseProgramList(html: string): {
  items: Activity[];
  pageTotal: number;
} {
  const items: Activity[] = [];
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const blocks = clean
    .split(/<div data-module="eco" data-role="item"/)
    .slice(1);
  for (const raw of blocks) {
    const end = raw.indexOf('</li>');
    const block = end >= 0 ? raw.slice(0, end) : raw;
    const head = block.match(
      /class="([A-Z_]+)"[\s\S]*?href="(\/ko\/program\/all\/view\/(\d+))"/,
    );
    if (!head) continue;
    const statusRaw = head[1];
    const [status, statusLabel] = STATUS_MAP[statusRaw] ?? [
      'unknown' as const,
      '확인 필요',
    ];
    const key = head[3];

    // 카드에는 date_layer 밖에도 <time>이 있다(헤더 운영시각·content 중복).
    // 라벨로만 구분한다 — 순서/개수를 가정하면 신청↔운영이 뒤바뀐다.
    let applyStart: string | null = null,
      applyEnd: string | null = null,
      runStart: string | null = null,
      runEnd: string | null = null;
    for (const layer of block.matchAll(
      /<small class="date_layer">[\s\S]*?<span class="date_title">([\s\S]*?)<\/span>([\s\S]*?)<\/small>/g,
    )) {
      const times = [...layer[2].matchAll(/<time datetime="([^"]+)"/g)].map(
        (m) => m[1],
      );
      if (layer[1].includes('신청')) [applyStart, applyEnd] = [times[0] ?? null, times[1] ?? null];
      else if (layer[1].includes('운영')) [runStart, runEnd] = [times[0] ?? null, times[1] ?? null];
    }

    const title = block.match(/<b class="title">([\s\S]*?)<\/b>/);
    const dept = block.match(
      /<div class="detail">[\s\S]*?<label>([\s\S]*?)<\/label>/,
    );
    const dday = block.match(/<b class="lh_38"[^>]*>([\s\S]*?)<\/b>/);
    const points = block.match(/<i class="point">p<\/i>\s*(\d+)/);
    const team = block.match(/<div class="type">\s*([\s\S]*?)\s*<\/div>/);
    const progress = block.match(
      /<div class="progress">\s*<b>(\d+)<\/b>\s*\/\s*([\s\S]*?)<\/div>/,
    );
    const cover = block.match(
      /class="cover"[^>]*background-image:url\(([^)]+)\)/,
    );

    const capRaw = progress ? text(progress[2]) : '';
    const capacity = /^\d+$/.test(capRaw) ? parseInt(capRaw, 10) : null;
    const teamText = team ? text(team[1]) : '';

    items.push({
      id: 'hs-' + key,
      key,
      title: title ? text(title[1]) : '',
      dept: dept ? text(dept[1]) : '',
      status,
      statusLabel,
      applyStart,
      applyEnd,
      runStart,
      runEnd,
      dday: dday ? text(dday[1]) : null,
      points: points ? parseInt(points[1], 10) : null,
      team: teamText === '개인' ? '개인' : teamText === '팀' ? '팀' : null,
      applicants: progress ? parseInt(progress[1], 10) : null,
      capacity,
      certified: /class="excellent">인재인증/.test(block),
      url: HOST + '/ko/program/all/view/' + key,
      cover: cover ? new URL(cover[1], HOST).href : null,
    });
  }
  const total = html.match(/data-role="pagination"[^>]*data-total="(\d+)"/);
  return { items, pageTotal: total ? parseInt(total[1], 10) : 1 };
}

const DAY_MS = 86400000;
const dayStart = (ts: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const parseTs = (s: string | null) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? null : t;
};

export type LiveStatus = {
  status: ActivityStatus;
  label: string;
  /** '오늘 마감' | 'D-n' | '마감' | null — 신청 마감 기준 캘린더 일수 */
  dday: string | null;
};

/**
 * 수집 시점에 굳은 status/statusLabel/dday 대신 신청 기간과 현재 시각으로
 * 재계산한 상태 — 스냅샷이 오래돼도 마감 표시가 실제 날짜와 어긋나지 않게 한다.
 * 신청 기간이 없으면 스냅샷 값을 그대로 쓴다(추측하지 않음).
 * - 신청 시작 전 → 접수예정
 * - 신청 기간 중 → 접수중, 마감 캘린더 7일 이내면 마감임박 + D-n/오늘 마감
 * - 신청 마감 경과 → 마감
 */
export function liveStatus(a: Activity, now: number): LiveStatus {
  const start = parseTs(a.applyStart);
  const end = parseTs(a.applyEnd);
  if (start === null && end === null)
    return { status: a.status, label: a.statusLabel, dday: a.dday };
  if (end !== null && now > end)
    return { status: 'closed', label: '마감', dday: '마감' };
  if (start !== null && now < start)
    return { status: 'upcoming', label: '접수예정', dday: null };
  const dd =
    end !== null ? Math.round((dayStart(end) - dayStart(now)) / DAY_MS) : null;
  const dday = dd === null ? null : dd <= 0 ? '오늘 마감' : `D-${dd}`;
  return dd !== null && dd <= 7
    ? { status: 'closing', label: '마감임박', dday }
    : { status: 'open', label: '접수중', dday };
}

/** 수집 이상 감지 — 직전 스냅샷 대비 급감하면 의심. */
export function isAnomalous(
  next: ActivitySnapshot,
  prev: ActivitySnapshot | null,
): string | null {
  if (!next.items.length) return 'collected 0 items';
  if (!prev || !prev.itemCount) return null;
  if (next.itemCount < Math.floor(prev.itemCount * 0.5))
    return `item count dropped ${prev.itemCount} -> ${next.itemCount}`;
  return null;
}

export function activityMatch(
  a: Activity,
  q: string,
  match: (text: string, q: string) => boolean,
) {
  return match(`${a.title} ${a.dept} ${a.statusLabel}`, q);
}
