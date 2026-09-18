/**
 * 서버 측 COSMOS LMS 수집 — 로그인 시 열린 SchoolSession으로 과목별
 * 과제/퀴즈/온라인 출석부/수강 기간을 수집해 LmsSnapshot을 만든다.
 * 브라우저 수집기(public/lms-collect.js)와 동일한 셀렉터 계약을
 * Workers DOM 없이 정규식으로 구현 (dotbugi 구조 기반).
 */
import { plainText } from './school.ts';
import type {
  LmsCourse,
  LmsSnapshot,
  LmsTask,
  LmsVod,
} from '../data/lms.ts';

const BASE = 'https://learn.hansung.ac.kr';
const NOT_SUBMITTED = ['미제출', 'Not submitted', '提出なし', '没有作业'];
const BULK_APPROVED = ['일괄출석인정', 'Batch attendance'];
const COL_WEEKLY_ATTENDANCE = ['주차 출석', 'Week attendance'];
const COL_ATTENDANCE = ['출석', 'Attendance'];
const COL_REQUIRED_TIME = ['출석인정 요구시간', 'Required'];
const COLLECT_BUDGET_MS = 60000;

export interface LmsSession {
  request(url: string, init?: RequestInit): Promise<Response>;
}

const clsRe = (cls: string) => `class="[^"]*\\b${cls}\\b[^"]*"`;

function tableRows(html: string, tableClass: string): string[] {
  const t = html.match(
    new RegExp(
      `<table[^>]*${clsRe(tableClass)}[^>]*>([\\s\\S]*?)</table>`,
      'i',
    ),
  );
  if (!t) return [];
  const tbody = t[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? t[1];
  return [...tbody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(
    (m) => m[1],
  );
}

function cellText(row: string, cellClass: string): string {
  const m = row.match(
    new RegExp(`<td[^>]*${clsRe(cellClass)}[^>]*>([\\s\\S]*?)</td>`, 'i'),
  );
  return m ? plainText(m[1]) : '';
}

function cellAnchor(row: string, cellClass: string) {
  const m = row.match(
    new RegExp(`<td[^>]*${clsRe(cellClass)}[^>]*>([\\s\\S]*?)</td>`, 'i'),
  );
  const a = m?.[1].match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (!a) return null;
  return { href: a[1], title: plainText(a[2]) };
}

function normDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const m = s.match(
    /(\d{4})\s*[년年]\s*(\d{1,2})\s*[월月]\s*(\d{1,2})[일日]?[^\d]*(\d{1,2}:\d{2})/,
  );
  return m
    ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')} ${m[4].padStart(5, '0')}`
    : s;
}

const abs = (h: string) => (h.startsWith('http') ? h : BASE + h);

/** 과제 목록 — mod/assign/index.php generaltable */
export function parseAssigns(html: string): LmsTask[] {
  return tableRows(html, 'generaltable').flatMap((row) => {
    const a = cellAnchor(row, 'cell c1');
    if (!a?.title || !a.href) return [];
    const dueRaw = cellText(row, 'cell c2');
    const status = cellText(row, 'cell c3');
    return {
      title: a.title,
      url: abs(a.href),
      due: dueRaw && dueRaw !== '-' ? normDate(dueRaw) : null,
      submitted: !NOT_SUBMITTED.some((k) => status.includes(k)),
    };
  });
}

/** 퀴즈 목록 — mod/quiz/index.php generaltable (제출 여부는 상세 페이지 판정) */
export function parseQuizList(html: string): Omit<LmsTask, 'submitted'>[] {
  return tableRows(html, 'generaltable').flatMap((row) => {
    const a = cellAnchor(row, 'cell c1');
    if (!a?.title || !a.href) return [];
    const dueRaw = cellText(row, 'cell c2');
    return {
      title: a.title,
      url: a.href.startsWith('http') ? a.href : `${BASE}/mod/quiz/${a.href}`,
      due: dueRaw && dueRaw !== '-' ? normDate(dueRaw) : null,
    };
  });
}

/** 퀴즈 상세 — quizattemptsummary tbody 행 존재 = 응시 이력 있음 */
export function hasQuizAttempt(html: string): boolean {
  const t = html.match(
    new RegExp(
      `<table[^>]*${clsRe('quizattemptsummary')}[^>]*>([\\s\\S]*?)</table>`,
      'i',
    ),
  );
  if (!t) return false;
  const tbody = t[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? '';
  return /<tr\b/i.test(tbody);
}

/** 온라인 출석부 — thead 동적 컬럼 매칭 + rowspan/colspan 평탄화 */
export function parseProgress(html: string): LmsVod[] {
  const thead = html.match(
    new RegExp(
      `${clsRe('user_progress_table')}[^>]*>[\\s\\S]*?<thead[^>]*>([\\s\\S]*?)</thead>`,
      'i',
    ),
  );
  if (!thead) return [];
  const headers = [...thead[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(
    (m) => plainText(m[1]),
  );
  if (headers.length < 5) return [];
  let att = -1,
    weekAtt = -1;
  const matched = new Set<number>();
  headers.forEach((t, i) => {
    if (COL_WEEKLY_ATTENDANCE.some((k) => t.includes(k))) {
      weekAtt = i;
      matched.add(i);
    } else if (COL_REQUIRED_TIME.some((k) => t.includes(k))) {
      // '출석인정 요구시간'도 '출석'을 포함 — 일반 출석 컬럼 매칭에서 제외해야 함
      matched.add(i);
    }
  });
  headers.forEach((t, i) => {
    if (att === -1 && !matched.has(i) && COL_ATTENDANCE.some((k) => t.includes(k)))
      att = i;
  });
  if (att === -1 || weekAtt === -1) return [];

  const tbody = html.match(
    new RegExp(
      `${clsRe('user_progress_table')}[^>]*>[\\s\\S]*?<tbody[^>]*>([\\s\\S]*?)</tbody>`,
      'i',
    ),
  );
  if (!tbody) return [];
  const trs = [...tbody[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(
    (m) => m[1],
  );

  const pending: number[] = [];
  const spanVal: (string | null)[] = [];
  const flatten = (row: string): (string | null)[] => {
    const cells = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
    const out: (string | null)[] = [];
    let col = 0;
    const consume = () => {
      while (pending[col] > 0) {
        out.push(spanVal[col] ?? null);
        pending[col] -= 1;
        col++;
      }
    };
    consume();
    for (const c of cells) {
      consume();
      const rs = +(c[1].match(/rowspan="(\d+)"/i)?.[1] ?? 1);
      const cs = +(c[1].match(/colspan="(\d+)"/i)?.[1] ?? 1);
      const v = plainText(c[2]);
      for (let i = 0; i < cs; i++) {
        out.push(v);
        if (rs > 1) {
          pending[col] = rs - 1;
          spanVal[col] = v;
        } else spanVal[col] = null;
        col++;
      }
    }
    while (col < pending.length) {
      if (pending[col] > 0) {
        out.push(spanVal[col] ?? null);
        pending[col] -= 1;
      } else out.push(null);
      col++;
    }
    return out;
  };

  let curWeek = 0,
    lastWeekly = '';
  return trs.flatMap((row) => {
    const cells = flatten(row);
    const title = cells[1] ?? '';
    const status = cells[att] ?? '';
    let weekly = cells[weekAtt] ?? '';
    if (weekly) lastWeekly = weekly;
    else weekly = lastWeekly;
    if (BULK_APPROVED.some((k) => (weekly ?? '').includes(k))) weekly = 'O';
    const w = parseInt(cells[0] ?? '', 10);
    if (!Number.isNaN(w)) curWeek = w;
    if (!title || !status) return [];
    return {
      title,
      week: curWeek,
      status,
      attended: /^[Oo]$/.test(status) || status.includes('출석'),
      weeklyStatus: weekly || undefined,
    };
  });
}

/** 강좌 페이지 — modtype_vod(비활성 dimmed 제외) 링크의 제목/기간/URL */
export function parseVodRanges(
  html: string,
): Record<string, { range?: string; url?: string }> {
  const cleaned = html.replace(
    /<span[^>]*class="[^"]*accesshide[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    '',
  );
  const out: Record<string, { range?: string; url?: string }> = {};
  // <li 여는 태그에 modtype_vod를 요구 — 바깥 li가 안쪽 vod li의 여는 태그를
  // 삼키는 중첩 매칭 문제 방지 (vod li 안에는 li가 중첩되지 않음)
  for (const li of cleaned.matchAll(
    /<li\b([^>]*modtype_vod[^>]*)>([\s\S]*?)<\/li>/gi,
  )) {
    const cls = li[1].match(/class="([^"]*)"/i)?.[1] ?? '';
    if (/\bdimmed\b/.test(cls)) continue;
    const frag = li[2];
    if (!new RegExp(clsRe('activityinstance'), 'i').test(frag)) continue;
    const name = frag.match(
      new RegExp(`${clsRe('instancename')}[^>]*>([\\s\\S]*?)</span>`, 'i'),
    );
    const title = name ? plainText(name[1]) : '';
    if (!title) continue;
    const range = frag.match(
      new RegExp(`${clsRe('text-ubstrap')}[^>]*>([\\s\\S]*?)</span>`, 'i'),
    );
    const href = frag.match(/<a\b[^>]*href="([^"]+)"/i);
    out[title] = {
      range: range ? plainText(range[1]).replace(/\s+/g, ' ') : undefined,
      url: href ? abs(href[1]) : undefined,
    };
  }
  return out;
}

/** 과목별 4개 페이지 수집 → LmsSnapshot. 부분 실패는 errors[]로 보존. */
export async function collectLms(
  session: LmsSession,
  courses: { id: string; name: string }[],
): Promise<LmsSnapshot> {
  const deadline = Date.now() + COLLECT_BUDGET_MS;
  // 세션 만료·리다이렉트(303→로그인) 시 본문이 비거나 로그인 폼이 온다.
  // 이를 빈 결과로 삼키지 않고 throw해 errors[]에 남긴다.
  const html = async (url: string) => {
    const r = await session.request(url);
    const h = await r.text();
    if (r.status !== 200 || !/\/login\/logout\.php/.test(h)) {
      console.log(
        '[lms] fetch',
        url.replace(BASE, ''),
        '→',
        r.status,
        'len',
        h.length,
        'loginForm',
        /name="password"|login\/index\.php/.test(h),
      );
      throw new Error(`lms:${r.status}`);
    }
    return h;
  };

  const fetchVods = async (id: string) => {
    const urls = [
      `${BASE}/report/ubcompletion/user_progress_a.php?id=${id}`,
      `${BASE}/report/ubcompletion/user_progress.php?id=${id}`,
    ];
    let lastErr: unknown;
    for (const u of urls) {
      try {
        const h = await html(u);
        if (h.includes('user_progress_table')) return parseProgress(h);
      } catch (e) {
        lastErr = e; /* 다음 URL 시도 */
      }
    }
    // 두 URL 모두 요청 실패(세션/HTTP)면 'vod' 오류로 표면화,
    // 페이지는 왔지만 표가 없는 경우만 정상 빈 결과.
    if (lastErr) throw lastErr;
    return [];
  };
  const fetchAssigns = async (id: string) =>
    parseAssigns(await html(`${BASE}/mod/assign/index.php?id=${id}`));
  const fetchQuizzes = async (id: string) => {
    const items = parseQuizList(
      await html(`${BASE}/mod/quiz/index.php?id=${id}`),
    );
    const out: LmsTask[] = [];
    for (const it of items) {
      const submitted = await html(it.url!)
        .then(hasQuizAttempt)
        .catch(() => false);
      out.push({ ...it, submitted });
    }
    return out;
  };
  const fetchRanges = async (id: string) =>
    parseVodRanges(await html(`${BASE}/course/view.php?id=${id}`));

  const out: LmsCourse[] = [];
  for (const c of courses) {
    if (Date.now() > deadline) {
      out.push({
        id: c.id,
        title: c.name,
        vods: [],
        assigns: [],
        quizzes: [],
        errors: ['timeout'],
      });
      continue;
    }
    // Moodle PHP 세션은 요청당 잠금이 걸려 병렬 요청이 서버에서 직렬화된다.
    // 같은 세션의 동시 요청을 아예 순차로 보내 불필요한 대기·실패를 줄인다.
    const settle = <T>(p: Promise<T>) =>
      p.then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason) => ({ status: 'rejected' as const, reason }),
      );
    const vods = await settle(fetchVods(c.id));
    const assigns = await settle(fetchAssigns(c.id));
    const quizzes = await settle(fetchQuizzes(c.id));
    const ranges = await settle(fetchRanges(c.id));
    const rangeMap = ranges.status === 'fulfilled' ? ranges.value : {};
    out.push({
      id: c.id,
      title: c.name,
      vods: (vods.status === 'fulfilled' ? vods.value : []).map((v) => ({
        ...v,
        range: rangeMap[v.title]?.range,
        url: rangeMap[v.title]?.url,
      })),
      assigns: assigns.status === 'fulfilled' ? assigns.value : [],
      quizzes: quizzes.status === 'fulfilled' ? quizzes.value : [],
      errors: [
        vods.status === 'rejected' && 'vod',
        assigns.status === 'rejected' && 'assign',
        quizzes.status === 'rejected' && 'quiz',
      ].filter((e): e is string => !!e),
    });
  }
  return {
    source: 'cosmos-lms',
    fetchedAt: new Date().toISOString(),
    courses: out,
  };
}
