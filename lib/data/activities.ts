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

    const times = [...block.matchAll(/<time datetime="([^"]+)"/g)].map(
      (m) => m[1],
    );
    // date_layer 순서: 신청(2개) → 운영(2개). 없으면 길이가 짧다.
    const [applyStart, applyEnd, runStart, runEnd] = [
      times[0] ?? null,
      times[1] ?? null,
      times[2] ?? null,
      times[3] ?? null,
    ];

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
