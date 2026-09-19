import { collectLms } from './lms.ts';
import type { LmsSnapshot } from '../data/lms.ts';

export type SchoolCourse = { id: string; name: string; url: string };
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
    if (/\/login\/logout\.php/.test(html)) {
      snapshot.lms = 'connected';
      snapshot.courses = parseCourses(html);
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
