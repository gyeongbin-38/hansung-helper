import { collectLms } from './lms.ts';
import type { LmsSnapshot } from '../data/lms.ts';

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
  lmsError?: 'auth' | 'landing' | 'upstream';
  checkedAt: string;
  courseScope: string;
};

export class SchoolError extends Error {
  constructor(public code: 'credentials' | 'upstream') {
    super(code);
  }
}

// Each login gets its own cookie jar. Neither credentials nor school cookies persist.
class SchoolSession {
  private cookies = new Map<string, Map<string, string>>();
  async request(url: string, init: RequestInit = {}) {
    const target = new URL(url);
    if (
      !['info.hansung.ac.kr', 'learn.hansung.ac.kr'].includes(target.hostname)
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
      signal: AbortSignal.timeout(15000),
      headers,
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const index = pair.indexOf('=');
      if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    this.cookies.set(target.hostname, jar);
    if (response.status >= 400) throw new SchoolError('upstream');
    return response;
  }
  async follow(response: Response, base: string) {
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
      response = await this.request(base);
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
    const url = new URL(
      match[1].replace(/&amp;/g, '&'),
      'https://learn.hansung.ac.kr',
    );
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

export async function connectSchool(
  studentId: string,
  password: string,
  opts?: {
    /** 지정하면 상세 수집을 즉시 실행하지 않고 수집 클로저를 넘긴다
     * (응답 후 waitUntil에서 실행해 로그인 지연을 줄이는 용도) */
    deferLms?: (collect: () => Promise<LmsSnapshot>) => void;
  },
): Promise<SchoolSnapshot> {
  const session = new SchoolSession();
  await (await session.request('https://info.hansung.ac.kr/')).arrayBuffer();
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
    throw new SchoolError('credentials');
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
    throw new SchoolError('credentials');
  const snapshot: SchoolSnapshot = {
    portal: 'connected',
    lms: 'unavailable',
    courses: [],
    checkedAt: new Date().toISOString(),
    courseScope:
      '코스모스 로그인 첫 화면에 표시된 강의 · 전체 개설 과목이나 이수 내역 아님',
  };
  // COSMOS 로그인 — 성공이면 과목 목록 HTML, 실패면 원인 분류를 돌려준다.
  // 로그인 직후 동의·비밀번호 변경·중복 로그인 등 중간 페이지에 멈춘 경우를
  // 세션 무효와 구분하기 위해 /my/로 세션 유효성을 한 번 더 확인한다.
  const lmsLogin = async (): Promise<{
    html?: string;
    err?: 'auth' | 'landing' | 'upstream';
  }> => {
    try {
      await (
        await session.request('https://learn.hansung.ac.kr/login.php')
      ).arrayBuffer();
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
      const title =
        html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
      console.log(
        '[lms] landing w/o session:',
        home.url,
        'errorcode',
        code ?? '-',
        'title',
        title.slice(0, 80),
        'len',
        html.length,
      );
      if (code === '3') return { err: 'auth' };
      // 세션이 열렸는데 중간 안내 페이지에 멈춘 경우 — /my/는 로그인 상태로
      // 렌더되므로 여기서 세션 유효성을 재확인한다.
      try {
        const probe = await session.follow(
          await session.request('https://learn.hansung.ac.kr/my/'),
          'https://learn.hansung.ac.kr/my/',
        );
        const probeHtml = await probe.text();
        if (/\/login\/logout\.php/.test(probeHtml)) {
          console.log('[lms] session valid via /my/ — interstitial bypassed');
          return { html: probeHtml };
        }
      } catch {
        /* probe 실패는 아래 err 결과로 처리 */
      }
      return { err: code ? 'auth' : 'landing' };
    } catch (e) {
      console.log(
        '[lms] login request failed:',
        e instanceof Error ? e.message : String(e),
      );
      return { err: 'upstream' };
    }
  };
  try {
    let res = await lmsLogin();
    if (res.err === 'upstream') {
      // 순간 네트워크 오류는 1회 재시도 — 자격 거부는 재시도하지 않는다
      await new Promise((r) => setTimeout(r, 1500));
      res = await lmsLogin();
    }
    if (res.err) snapshot.lmsError = res.err;
    else {
      snapshot.lms = 'connected';
      snapshot.courses = parseCourses(res.html!);
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
  } catch (e) {
    console.log(
      '[lms] connect failed:',
      e instanceof Error ? e.message : String(e),
    );
    /* Portal authentication remains valid when LMS is temporarily unavailable. */
  }
  return snapshot;
}
