import { collectLms } from './lms.ts';
import { collectInfo } from './info.ts';
import { fillPortalPoints } from './hsportal.ts';
import type { LmsSnapshot } from '../data/lms.ts';
import type { InfoSnapshot } from '../data/info.ts';
import { retrySchoolRead } from './school-retry.ts';
import type { SchoolCookieJar } from './school-session-crypto.ts';

export type SchoolCourse = {
  id: string;
  name: string;
  url: string;
  /** .course_label_ec 커뮤니티 과목 — 출석부 URL 변형 선택에 사용 */
  community?: boolean;
};
export type SchoolSnapshot = {
  portal: 'connected';
  lms: 'connected' | 'unavailable';
  courses: SchoolCourse[];
  /** 로그인 시 서버가 수집한 LMS 상세 스냅샷 (부분 실패는 course.errors) */
  lmsData?: LmsSnapshot;
  /** waitUntil 지연 수집 진행 중 — 완료(lmsData 도착) 또는 실패 시 해제 */
  lmsPending?: boolean;
  /** 지연 수집 실패 시각 — 실패 상태 표시용 */
  lmsFailedAt?: string;
  /** COSMOS 로그인 단계 실패 원인 — 'auth' 자격 거부 / 'landing' 중간
   *  안내 페이지에서 세션 미확인 / 'upstream' 네트워크·HTTP 오류 */
  lmsError?: 'auth' | 'landing' | 'session' | 'upstream';
  /** 종합정보 수집 스냅샷 (이수 내역·비교과 포인트·졸업가사정표·학적) */
  infoData?: InfoSnapshot;
  /** 종합정보 지연 수집 진행 중 */
  infoPending?: boolean;
  /** 종합정보 수집 실패 시각 */
  infoFailedAt?: string;
  checkedAt: string;
  courseScope: string;
};

export class SchoolError extends Error {
  constructor(
    public code: 'credentials' | 'upstream' | 'session',
    public status?: number,
  ) {
    super(code);
  }
}

export function transientSchoolRead(error: unknown): boolean {
  return error instanceof TypeError ||
    (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) ||
    (error instanceof SchoolError && [502, 503, 504].includes(error.status ?? 0));
}

// Each school operation gets its own cookie jar. Credentials are never retained;
// callers may export only the allowlisted school cookies into the encrypted vault.
export class SchoolSession {
  private cookies = new Map<string, Map<string, string>>();
  constructor(initial?: SchoolCookieJar) {
    if (initial) {
      for (const [host, jar] of Object.entries(initial)) {
        const map = new Map<string, string>();
        for (const [name, value] of Object.entries(jar)) map.set(name, value);
        if (map.size) this.cookies.set(host, map);
      }
    }
  }
  exportCookies(): SchoolCookieJar {
    const out: SchoolCookieJar = {};
    for (const [host, jar] of this.cookies)
      out[host] = Object.fromEntries(jar);
    return out;
  }
  hasCookies(): boolean {
    return this.cookies.size > 0;
  }
  async request(url: string, init: RequestInit = {}) {
    const target = new URL(url);
    if (
      ![
        'info.hansung.ac.kr',
        'learn.hansung.ac.kr',
        'hsportal.hansung.ac.kr',
      ].includes(target.hostname)
    )
      throw new SchoolError('upstream');
    // The legacy portal emits an HTTP redirect. Upgrade before sending any cookie.
    target.protocol = 'https:';
    target.port = '';
    const jar = this.cookies.get(target.hostname) ?? new Map<string, string>();
    const headers = new Headers(init.headers);
    headers.set('User-Agent', 'Mozilla/5.0');
    headers.set(
      'Cookie',
      [...jar].map(([key, value]) => `${key}=${value}`).join('; '),
    );
    const response = await fetch(target, {
      ...init,
      redirect: 'manual',
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
      headers,
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const index = pair.indexOf('=');
      if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    this.cookies.set(target.hostname, jar);
    if (response.status >= 400) {
      await response.body?.cancel().catch(() => {});
      throw new SchoolError('upstream', response.status);
    }
    return response;
  }
  async follow(response: Response, base: string, signal?: AbortSignal) {
    for (
      let n = 0;
      n < 6 && response.status >= 300 && response.status < 400;
      n++
    ) {
      const location = response.headers.get('location');
      await response.arrayBuffer();
      if (!location) throw new SchoolError('upstream');
      const target = new URL(location, base);
      base = target.href;
      response = await this.request(base, { signal });
    }
    if (response.status !== 200) throw new SchoolError('upstream');
    return response;
  }
}

export function plainText(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
export function parseCourses(html: string): SchoolCourse[] {
  // 커뮤니티 과목(course_label_ec) id 집합 — 같은 <li> 블록 안의
  // course 링크 id를 매칭. 브라우저 셀렉터 .course_label_ec와 동일 계약.
  const communityIds = new Set<string>();
  for (const li of html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)) {
    if (!li[0].includes('course_label_ec')) continue;
    const idm = li[0].match(/course\/view\.php\?[^"'<]*\bid=(\d+)/);
    if (idm) communityIds.add(idm[1]);
  }
  const found = new Map<string, SchoolCourse>();
  for (const match of html.matchAll(
    /<a\b[^>]*href=["']([^"']*\/course\/view\.php\?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    let url: URL;
    try {
      url = new URL(match[1].replace(/&amp;/g, '&'), 'https://learn.hansung.ac.kr');
    } catch {
      continue;
    }
    if (
      url.hostname !== 'learn.hansung.ac.kr' ||
      url.pathname !== '/course/view.php'
    )
      continue;
    const id = url.searchParams.get('id');
    const name = plainText(match[2]);
    if (id && /^\d+$/.test(id) && name && !found.has(id)) {
      found.set(id, {
        id,
        name: name.slice(0, 200),
        url: `https://learn.hansung.ac.kr/course/view.php?id=${id}`,
        ...(communityIds.has(id) ? { community: true } : {}),
      });
    }
  }
  return [...found.values()].slice(0, 100);
}

/** /my/courses.php의 페이지네이션 링크(?page=N) 번호 목록 */
function coursePageNumbers(html: string): number[] {
  const pages = new Set<number>();
  for (const m of html.matchAll(
    /href=["']([^"']*\/my\/courses\.php[^"']*)["']/gi,
  )) {
    const p = m[1].replace(/&amp;/g, '&').match(/[?&]page=(\d+)/)?.[1];
    if (p) pages.add(parseInt(p, 10));
  }
  return [...pages].sort((a, b) => a - b);
}

/**
 * 대시보드 첫 화면에는 최근·고정 과목 카드만 나와 숨겨진/밀린 강좌가 빠진다.
 * '내 강좌' 목록 페이지(/my/courses.php)를 읽어 수강 중인 강좌 전체를 찾는다.
 * Moodle의 분류 필터(classification=all)를 먼저 시도해 진행 중뿐 아니라
 * 전체 수강 강좌를 잡고, 페이지네이션을 상한 내에서 따라간다.
 * 실패하면 빈 배열 — 호출자가 대시보드 파싱 결과로 폴백한다.
 */
export async function discoverCourses(
  session: SchoolSession,
  readPage: (url: string) => Promise<Response>,
): Promise<SchoolCourse[]> {
  const found = new Map<string, SchoolCourse>();
  for (const classification of ['all', 'inprogress']) {
    const visited = new Set<number>();
    for (let page = 0; page <= 8; page++) {
      if (visited.has(page)) continue;
      visited.add(page);
      const url = `https://learn.hansung.ac.kr/my/courses.php?classification=${classification}${page ? `&page=${page}` : ''}`;
      let html: string;
      try {
        const res = await session.follow(await readPage(url), url);
        html = await res.text();
      } catch {
        break;
      }
      // 세션 만료·로그인 벽이면 목록 파싱은 의미가 없다.
      if (!/\/login\/logout\.php/.test(html)) return [...found.values()];
      for (const c of parseCourses(html)) if (!found.has(c.id)) found.set(c.id, c);
      const pages = coursePageNumbers(html);
      if (!pages.some((p) => p > page)) break;
    }
    // 첫 분류에서 강좌를 찾았으면 다른 분류는 생략한다.
    if (found.size) break;
  }
  return [...found.values()];
}

/** 목록 페이지 결과와 대시보드 결과를 병합 — 커뮤니티 표시 등 대시보드
 *  측 정보도 유지한다. */
export function mergeCourses(primary: SchoolCourse[], fallback: SchoolCourse[]) {
  const found = new Map<string, SchoolCourse>();
  for (const c of [...fallback, ...primary])
    found.set(c.id, { ...c, ...(found.get(c.id)?.community ? { community: true } : {}) });
  return [...found.values()];
}

export async function connectSchool(
  studentId: string,
  password: string,
  opts?: {
    /** 지정하면 상세 수집을 즉시 실행하지 않고 수집 클로저를 넘긴다
     * (응답 후 waitUntil에서 실행해 로그인 지연을 줄이는 용도) */
    deferLms?: (collect: () => Promise<LmsSnapshot>) => void;
    /** 종합정보 수집을 응답 후 waitUntil로 미루는 클로저 채널 */
    deferInfo?: (collect: () => Promise<InfoSnapshot | null>) => void;
    /** 재사용할 세션 — 지정하면 호출자가 만든 쿠키 jar를 쓴다.
     * (로그인 후 세션 볼트에 쿠키를 저장할 때 사용) */
    session?: SchoolSession;
  },
): Promise<SchoolSnapshot> {
  const session = opts?.session ?? new SchoolSession();
  // Only retry idempotent page reads. Never automatically repeat a password POST:
  // a lost response can occur after the school already accepted the login.
  const readPage = (url: string) => retrySchoolRead(() => session.request(url), transientSchoolRead);
  await (await readPage('https://info.hansung.ac.kr/')).arrayBuffer();
  const response = await session.request(
    'https://info.hansung.ac.kr/servlet/s_gong.gong_login_ssl',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://info.hansung.ac.kr',
        Referer: 'https://info.hansung.ac.kr/',
      },
      body: new URLSearchParams({
        id: studentId,
        passwd: password,
        changePass: '',
        return_url: 'null',
      }),
    },
  );
  const redirect = response.headers.get('location');
  const path = redirect
    ? new URL(redirect, 'https://info.hansung.ac.kr').pathname
    : '';
  if (response.status !== 302 || path !== '/h_dae/dae_main.html') {
    await response.arrayBuffer();
    const rejected = redirect && new URL(redirect, 'https://info.hansung.ac.kr').searchParams.get('pwrechk') === 'N';
    throw new SchoolError(rejected ? 'credentials' : 'upstream');
  }
  const main = await session.follow(response, 'https://info.hansung.ac.kr/');
  const mainHtml = new TextDecoder('euc-kr').decode(await main.arrayBuffer());
  if (!mainHtml.includes('infohaksamain_portal.jsp'))
    throw new SchoolError('upstream');
  const protectedMenu = await session.request(
    'https://info.hansung.ac.kr/servlet/s_dae.dae_top_menu',
  );
  const menuHtml = new TextDecoder('euc-kr').decode(
    await protectedMenu.arrayBuffer(),
  );
  if (!menuHtml.includes('head_bt_logout.gif'))
    throw new SchoolError('upstream');
  const snapshot: SchoolSnapshot = {
    portal: 'connected',
    lms: 'unavailable',
    courses: [],
    checkedAt: new Date().toISOString(),
    courseScope:
      '수강 중인 강좌 전체(내 강좌 페이지 기준) · 지난 학기나 숨긴 강좌는 제외될 수 있음',
  };
  // COSMOS 로그인 — 성공이면 과목 목록 HTML, 실패면 원인 분류를 돌려준다.
  // 로그인 직후 동의·비밀번호 변경·중복 로그인 등 중간 페이지에 멈춘 경우를
  // 세션 무효와 구분하기 위해 /my/로 세션 유효성을 한 번 더 확인한다.
  const lmsLogin = async (): Promise<{
    html?: string;
    err?: 'auth' | 'landing' | 'upstream';
  }> => {
    let loginStarted = false;
    const probeSession = async () => {
      try {
        const probe = await session.follow(
          await readPage('https://learn.hansung.ac.kr/my/'),
          'https://learn.hansung.ac.kr/my/',
        );
        const html = await probe.text();
        return /\/login\/logout\.php/.test(html) ? html : null;
      } catch {
        return null;
      }
    };
    try {
      await (
        await readPage('https://learn.hansung.ac.kr/login.php')
      ).arrayBuffer();
      loginStarted = true;
      const login = await session.request(
        'https://learn.hansung.ac.kr/login/index.php',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: 'https://learn.hansung.ac.kr',
            Referer: 'https://learn.hansung.ac.kr/login.php',
          },
          body: new URLSearchParams({
            username: studentId,
            password,
            loginbutton: '로그인',
          }),
        },
      );
      const home = await session.follow(
        login,
        'https://learn.hansung.ac.kr/login/index.php',
      );
      const html = await home.text();
      if (/\/login\/logout\.php/.test(html)) return { html };
      const code = (home.url + '\n' + html.slice(0, 4000)).match(
        /errorcode=(\d+)/,
      )?.[1];
      console.log(
        '[lms] landing w/o session:',
        'errorcode',
        code ?? '-',
        'len',
        html.length,
      );
      if (code === '3') return { err: 'auth' };
      // 세션이 열렸는데 중간 안내 페이지에 멈춘 경우 — /my/는 로그인 상태로
      // 렌더되므로 여기서 세션 유효성을 재확인한다.
      const probeHtml = await probeSession();
      if (probeHtml) {
        console.log('[lms] session valid via /my/ — interstitial bypassed');
        return { html: probeHtml };
      }
      return { err: code ? 'auth' : 'landing' };
    } catch {
      console.log('[lms] login request failed: upstream');
      if (loginStarted) {
        const probeHtml = await probeSession();
        if (probeHtml) return { html: probeHtml };
      }
      return { err: 'upstream' };
    }
  };
  try {
    const res = await lmsLogin();
    if (res.err) snapshot.lmsError = res.err;
    else {
      snapshot.lms = 'connected';
      // 대시보드 파싱 후 '내 강좌' 목록으로 전체 수강 강좌를 보강한다.
      const discovered = await discoverCourses(session, readPage);
      snapshot.courses = mergeCourses(discovered, parseCourses(res.html!));
      if (opts?.deferLms)
        opts.deferLms(() => collectLms(session, snapshot.courses));
      else
        try {
          snapshot.lmsData = await collectLms(session, snapshot.courses);
        } catch {
          // 수집 실패해도 로그인 자체는 유지 — 실패 상태는 표시한다
          snapshot.lmsFailedAt = new Date().toISOString();
        }
    }
  } catch {
    console.log('[lms] connect failed');
    /* Portal authentication remains valid when LMS is temporarily unavailable. */
  }
  // 종합정보 수집 — LMS 결과와 무관하게 info 세션으로 진행한다.
  // deferInfo가 있으면 응답 후 waitUntil에서 실행, 없으면 여기서 수집한다.
  const runInfo = async () => {
    const info = await collectInfo(session, { menuHtml, mainHtml, studentId });
    // 종합정보에 포인트 페이지가 없으면 hsportal 브리지로 보충한다 —
    // 실패해도 진단 reason만 남고 기존 값은 유지된다.
    // 비밀번호 수집 경로는 자격을 넘겨 포털 직접 로그인도 시도한다.
    await fillPortalPoints(session, info, {
      id: studentId,
      pw: password,
    }).catch(() => false);
    return info;
  };
  if (opts?.deferInfo) {
    opts.deferInfo(() => runInfo().catch(() => null));
  } else {
    try {
      snapshot.infoData = await runInfo();
    } catch {
      snapshot.infoFailedAt = new Date().toISOString();
    }
  }
  return snapshot;
}

/** 저장된 학교 세션 쿠키로 비밀번호 없이 수집을 재개한다.
 *  종합정보와 COSMOS를 각각 프로브해 유효한 쪽만 수집하고, 양쪽 모두
 *  무효하면 SchoolError('session')을 던진다. 로그인 POST는 수행하지 않는다. */
export async function resumeSchool(
  session: SchoolSession,
  studentId: string,
  opts?: {
    deferLms?: (collect: () => Promise<LmsSnapshot>) => void;
    deferInfo?: (collect: () => Promise<InfoSnapshot | null>) => void;
  },
): Promise<SchoolSnapshot> {
  const snapshot: SchoolSnapshot = {
    portal: 'connected',
    lms: 'unavailable',
    courses: [],
    checkedAt: new Date().toISOString(),
    courseScope:
      '수강 중인 강좌 전체(내 강좌 페이지 기준) · 지난 학기나 숨긴 강좌는 제외될 수 있음',
  };
  let infoOk = false;
  let lmsOk = false;
  let infoProbeError: unknown;
  let lmsProbeError: unknown;
  // 프로브는 멱등 GET이므로 연결 오류만 재시도한다. 로그인 POST는 없다.
  const readPage = (url: string) =>
    retrySchoolRead(() => session.request(url), transientSchoolRead);

  // 종합정보 세션 확인 — 세션 만료면 로그인 프레임셋이 돌아와 판정에 실패한다.
  try {
    const main = await session.follow(
      await readPage('https://info.hansung.ac.kr/h_dae/dae_main.html'),
      'https://info.hansung.ac.kr/h_dae/dae_main.html',
    );
    const mainHtml = new TextDecoder('euc-kr').decode(await main.arrayBuffer());
    if (mainHtml.includes('infohaksamain_portal.jsp')) {
      const protectedMenu = await readPage(
        'https://info.hansung.ac.kr/servlet/s_dae.dae_top_menu',
      );
      const menuHtml = new TextDecoder('euc-kr').decode(
        await protectedMenu.arrayBuffer(),
      );
      if (menuHtml.includes('head_bt_logout.gif')) {
        infoOk = true;
        const runInfo = async () => {
          const info = await collectInfo(session, {
            menuHtml,
            mainHtml,
            studentId,
          });
          await fillPortalPoints(session, info).catch(() => false);
          return info;
        };
        if (opts?.deferInfo) opts.deferInfo(() => runInfo().catch(() => null));
        else
          try {
            snapshot.infoData = await runInfo();
          } catch {
            snapshot.infoFailedAt = new Date().toISOString();
          }
      }
    }
  } catch (error) {
    // 예외는 세션 만료의 증거가 아니다. 네트워크/학교 서버 오류를 별도로
    // 보존해 호출자가 유효한 볼트 쿠키를 지우지 않게 한다.
    infoProbeError = error;
  }
  if (!infoOk) snapshot.infoFailedAt = new Date().toISOString();

  // COSMOS 세션 확인 — 대시보드에 로그아웃 링크가 보이면 세션이 유효하다.
  try {
    const home = await session.follow(
      await readPage('https://learn.hansung.ac.kr/'),
      'https://learn.hansung.ac.kr/',
    );
    const html = await home.text();
    if (/\/login\/logout\.php/.test(html)) {
      lmsOk = true;
      snapshot.lms = 'connected';
      // 대시보드 파싱 후 '내 강좌' 목록으로 전체 수강 강좌를 보강한다.
      const discovered = await discoverCourses(session, readPage);
      snapshot.courses = mergeCourses(discovered, parseCourses(html));
      if (opts?.deferLms)
        opts.deferLms(() => collectLms(session, snapshot.courses));
      else
        try {
          snapshot.lmsData = await collectLms(session, snapshot.courses);
        } catch {
          snapshot.lmsFailedAt = new Date().toISOString();
        }
    }
  } catch (error) {
    lmsProbeError = error;
  }
  if (!lmsOk) snapshot.lmsError = lmsProbeError ? 'upstream' : 'session';

  if (!infoOk && !lmsOk) {
    const upstream = infoProbeError ?? lmsProbeError;
    if (upstream instanceof SchoolError && upstream.code === 'upstream')
      throw upstream;
    if (upstream) throw new SchoolError('upstream');
    throw new SchoolError('session');
  }
  return snapshot;
}
