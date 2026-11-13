import type { InfoPageFailure, InfoSnapshot } from '../data/info.ts';

/** hsportal(비교과 통합관리) 수집 — 종합정보(info)에 포인트 페이지가 없을 때의
 *  보조 경로. 공개 스크립트가 제공하는 LMS↔포털 세션 연동(syncCoursemosLms)을
 *  이용해 기존 LMS 로그인 세션으로 포털 로그인을 시도한다.
 *  어떤 단계가 실패해도 예외를 던지지 않고 진단 reason만 반환한다 —
 *  기존 스냅샷의 다른 데이터는 그대로 유지된다. */

const PORTAL = 'https://hsportal.hansung.ac.kr';
const POINT_PATH = '/ko/mypage/point';
const PROCESS = `${PORTAL}/ko/process/coursemos`;

/** 외부 호출 상한 — 브리지(3) + 포인트 페이지(최대 2) + 여유. */
const BUDGET = 6;

export interface PortalSession {
  request(url: string, init?: RequestInit): Promise<Response>;
  follow(response: Response, base: string): Promise<Response>;
}

export type PortalPageDiag = {
  slot: 'points';
  path: string;
  ok: boolean;
  reason?: InfoPageFailure;
};

/** 로그인 벽·비로그인 마커 — 빈 목록이 아니라 인증 부재로 분류한다. */
const isPortalLoginWall = (html: string) =>
  /회원\s*로그인이\s*필요|data-logged=["']?0|로그인\s*후\s*이용/.test(html);

/** 마일리지 모듈 섹션만 잘라낸다 — 섹션 밖 숫자(날짜·게시글 번호)를
 *  총점으로 오인하지 않기 위함. */
function mileageSection(html: string): string | null {
  const start = html.indexOf('data-module="mileage"');
  if (start < 0) return null;
  const rest = html.slice(start);
  const next = rest.indexOf('data-module=', 20);
  return next > 0 ? rest.slice(0, next) : rest;
}

/** 포인트 페이지에서 총점을 보수적으로 추출한다.
 *  반환: number(총점) | 'wall'(로그인 필요) | null(구조 불명). */
export function parsePortalPoints(html: string): number | 'wall' | null {
  if (isPortalLoginWall(html)) return 'wall';
  const section = mileageSection(html);
  if (!section) return null;
  const text = section
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  // 합계·총점 라벨에 붙은 숫자를 우선한다.
  const labeled = text.match(
    /(?:합계|총\s*점|누적|총\s*포인트|마일리지)\s*[:：]?\s*(\d[\d,]*)/,
  );
  if (labeled) return Number(labeled[1].replace(/,/g, ''));
  // 라벨 없이 "N 포인트/점/P" 형태 하나뿐이면 그것을 쓴다 — 여러 개면
  // 어떤 게 총점인지 알 수 없어서 포기한다(0점으로 오보하는 게 더 나쁨).
  const bare = [
    ...text.matchAll(/(\d[\d,]*)\s*(?:포인트|점|P)(?!\d)/g),
  ].map((m) => Number(m[1].replace(/,/g, '')));
  const distinct = [...new Set(bare)];
  if (distinct.length === 1) return distinct[0];
  return null;
}

async function postForm(
  session: PortalSession,
  url: string,
  body: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const send = async (useGet: boolean) => {
    const init: RequestInit = useGet
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(body).toString(),
        };
    const sep = useGet ? (url.includes('?') ? '&' : '?') : '';
    const res = await session.request(url + sep + (useGet ? new URLSearchParams(body) : ''), init);
    return session.follow(res, url);
  };
  for (const useGet of [false, true]) {
    try {
      const res = await send(useGet);
      if (!res.ok) continue;
      const text = await res.text();
      const json = JSON.parse(text);
      if (json && typeof json === 'object') return json as Record<string, unknown>;
      return null;
    } catch {
      /* POST 실패 시 GET 시도 */
    }
  }
  return null;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** 포털 process 응답에서 URL/토큰을 관대하게 찾는다 — 필드명이
 *  gourl/url/syncUrl 등 버전별로 다를 수 있다. */
function pickField(json: Record<string, unknown>, kind: 'url' | 'token') {
  for (const [k, v] of Object.entries(json)) {
    const s = str(v);
    if (!s) continue;
    if (kind === 'url' && /^https?:\/\//.test(s)) return s;
    if (kind === 'token' && /token/i.test(k) && s.length > 3) return s;
  }
  return undefined;
}

type BridgeResult = {
  html: string | null;
  sawWall: boolean;
  /** 실패한 단계 — direct/token/login/fetch. 진단 로그용. */
  stage: 'direct' | 'token' | 'login' | 'fetch';
};

/** LMS 세션으로 포털 로그인을 연동하고 포인트 페이지를 가져온다.
 *  성공 시 해당 HTML, 실패 시 null을 반환한다(진단은 호출자가 기록).
 *  sawWall은 마지막으로 확인한 상태가 로그인 벽이었는지를 뜻한다. */
async function bridgeAndFetch(session: PortalSession): Promise<BridgeResult> {
  let budget = BUDGET;
  const get = async (url: string): Promise<string | null> => {
    if (budget-- <= 0) return null;
    try {
      const res = await session.follow(await session.request(url), url);
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  };
  const post = async (url: string, body: Record<string, string>) => {
    if (budget-- <= 0) return null;
    return postForm(session, url, body);
  };

  // ① 이미 포털 로그인이 살아 있으면 브리지 불필요
  const direct = await get(PORTAL + POINT_PATH);
  const sawWall = !!direct && isPortalLoginWall(direct);
  if (direct && !sawWall) return { html: direct, sawWall, stage: 'direct' };

  // ② 연동 토큰 획득 — getCoursemosUrl(type=session) 또는
  //    syncCoursemosLms가 LMS 동기화 URL을 돌려준다.
  let syncUrl: string | undefined;
  let token: string | undefined;
  for (const action of ['getCoursemosUrl', 'syncCoursemosLms']) {
    const json = await post(`${PROCESS}/${action}`, { type: 'session' });
    if (!json || json.success !== true) continue;
    token = pickField(json, 'token');
    syncUrl = pickField(json, 'url');
    if (token || syncUrl) break;
  }
  // ③ LMS 쪽 동기화 URL에 세션 토큰을 요청한다 — LMS 쿠키가 붙어 있어야
  //    유효 토큰이 나온다(비로그인 시 INVAILED_TOKEN).
  if (!token && syncUrl) {
    const sep = syncUrl.includes('?') ? '&' : '?';
    const res = await get(`${syncUrl}${sep}lmsSync=true`);
    if (res) {
      try {
        const json = JSON.parse(res) as Record<string, unknown>;
        if (json.success === true) token = pickField(json, 'token') ?? str(json.token);
      } catch {
        /* JSON이 아니면 토큰 없음 */
      }
    }
  }
  if (!token) return { html: null, sawWall, stage: 'token' };
  // ④ 토큰으로 포털 세션 수립 후 포인트 페이지를 다시 가져온다.
  const login = await post(`${PROCESS}/syncCoursemosLmsLogin`, { token });
  if (!login || login.success !== true) return { html: null, sawWall, stage: 'login' };
  const html = await get(PORTAL + POINT_PATH);
  return {
    html,
    sawWall: sawWall || (!!html && isPortalLoginWall(html)),
    stage: 'fetch',
  };
}

/** 종합정보 스냅샷에 포털 포인트를 병합한다.
 *  - 성공: snap.points 설정 + diag.pages에 ok 항목 추가
 *  - 실패: diag.pages에 reason 항목만 추가 — 다른 슬롯·기존 값 불변
 *  반환값은 "포털 시도를 했는가". */
export async function fillPortalPoints(
  session: PortalSession,
  snap: InfoSnapshot,
): Promise<boolean> {
  if (snap.points !== undefined) return false;
  snap.diag ??= { menu: [], pages: [] };
  snap.diag.pages ??= [];
  let result: BridgeResult;
  try {
    result = await bridgeAndFetch(session);
  } catch {
    result = { html: null, sawWall: false, stage: 'direct' };
  }
  const html = result.html;
  const points = html ? parsePortalPoints(html) : null;
  console.log(
    '[info] portal-points:',
    JSON.stringify({
      stage: result.stage,
      wall: result.sawWall || points === 'wall',
      points: typeof points === 'number' ? points : 'none',
    }),
  );
  if (!html) {
    snap.diag.pages.push({
      slot: 'points',
      path: 'hsportal:mypage/point',
      ok: false,
      // 로그인 벽까지 확인된 실패는 세션 문제, 그 외는 통신 실패로 분류
      reason: result.sawWall ? 'session-expired' : 'upstream',
    });
    return true;
  }
  if (points === 'wall') {
    snap.diag.pages.push({
      slot: 'points',
      path: 'hsportal:mypage/point',
      ok: false,
      reason: 'session-expired',
    });
  } else if (points === null) {
    snap.diag.pages.push({
      slot: 'points',
      path: 'hsportal:mypage/point',
      ok: false,
      reason: 'structure',
    });
  } else {
    snap.points = points;
    snap.diag.pages.push({
      slot: 'points',
      path: 'hsportal:mypage/point',
      ok: true,
    });
  }
  return true;
}
