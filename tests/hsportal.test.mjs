// hsportal(비교과 포털) 브리지·파서 테스트 — node --experimental-transform-types tests/hsportal.test.mjs
import assert from 'node:assert/strict';
import { parsePortalPoints, fillPortalPoints } from '../lib/server/hsportal.ts';

let pass = 0,
  fail = 0;
const t = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL:', name);
  }
};

// ── 픽스처 ────────────────────────────────────────────────
const WALL_HTML = `<html><body>
<div data-role="context" data-type="module" data-module="mileage"
  data-base-url="/ko/mypage/point" data-context="point" data-logged="0">
  <h1>회원 로그인이 필요합니다.</h1>
</div></body></html>`;

const POINTS_HTML = `<html><body>
<div data-role="context" data-type="module" data-module="mileage"
  data-base-url="/ko/mypage/point" data-context="point" data-logged="1">
  <table><tr><th>구분</th><th>포인트</th></tr>
  <tr><td>봉사활동</td><td>30</td></tr>
  <tr><th>합계</th><td>85</td></tr></table>
</div></body></html>`;

const BARE_SINGLE_HTML = `<div data-module="mileage" data-logged="1">
  <p>현재 마일리지 120 포인트</p></div>`;

const AMBIGUOUS_HTML = `<div data-module="mileage" data-logged="1">
  <ul><li>3 포인트 적립</li><li>5 포인트 적립</li><li>2 포인트 차감</li></ul></div>`;

const NO_MODULE_HTML = `<html><body><p>그냥 페이지</p></body></html>`;

// ── parsePortalPoints ─────────────────────────────────────
t('parse: 로그인 벽 감지', parsePortalPoints(WALL_HTML) === 'wall');
t('parse: 합계 라벨 총점', parsePortalPoints(POINTS_HTML) === 85);
t('parse: 단일 무라벨 숫자', parsePortalPoints(BARE_SINGLE_HTML) === 120);
t('parse: 모호한 다수 숫자는 거부', parsePortalPoints(AMBIGUOUS_HTML) === null);
t('parse: 마일리지 섹션 없음', parsePortalPoints(NO_MODULE_HTML) === null);
t(
  'parse: 섹션 밖 숫자는 무시',
  parsePortalPoints(`<p>9999 포인트</p>` + NO_MODULE_HTML) === null,
);

// ── fake 세션 ─────────────────────────────────────────────
// routes: { 'path-substring': html | (url, init) => html }
// 반환값이 string이면 그대로, object면 JSON 응답.
const fakeSession = (routes) => ({
  request: async (url, init) => {
    const u = new URL(url);
    const path = u.pathname + u.search;
    for (const [key, val] of Object.entries(routes))
      if (path.includes(key)) {
        const out = typeof val === 'function' ? val(url, init) : val;
        if (out === null || out === undefined) throw new Error('404: ' + path);
        return new Response(typeof out === 'string' ? out : JSON.stringify(out));
      }
    throw new Error('404: ' + path);
  },
  follow: async (res) => res,
});

const baseSnap = () => ({
  source: 'info-hansung',
  fetchedAt: new Date().toISOString(),
  completed: [],
  diag: { menu: [], pages: [] },
});

// ── fillPortalPoints ──────────────────────────────────────
{
  // 이미 points가 있으면 시도하지 않는다
  const snap = { ...baseSnap(), points: 40 };
  const tried = await fillPortalPoints(fakeSession({}), snap);
  t('fill: 기존 points 보존·미시도', tried === false && snap.points === 40);
  t('fill: 기존 points일 때 diag 추가 없음', snap.diag.pages.length === 0);
}

{
  // 포털 세션이 이미 살아 있으면 바로 파싱
  const snap = baseSnap();
  const tried = await fillPortalPoints(
    fakeSession({ '/ko/mypage/point': POINTS_HTML }),
    snap,
  );
  t(
    'fill: 직접 로그인 상태 수집',
    tried === true &&
      snap.points === 85 &&
      snap.diag.pages.some((p) => p.slot === 'points' && p.ok),
  );
}

{
  // 로그인 벽 → LMS 브리지로 토큰 획득 → 포털 로그인 → 수집
  let loggedIn = false;
  const snap = baseSnap();
  await fillPortalPoints(
    fakeSession({
      '/ko/mypage/point': () => (loggedIn ? POINTS_HTML : WALL_HTML),
      getCoursemosUrl: {
        success: true,
        url: 'https://learn.hansung.ac.kr/local/imodule/syncSession.php',
      },
      'syncSession.php': { success: true, token: 'tok-abc' },
      syncCoursemosLmsLogin: () => {
        loggedIn = true;
        return { success: true };
      },
    }),
    snap,
  );
  t(
    'fill: 브리지 토큰 흐름 수집',
    loggedIn === true &&
      snap.points === 85 &&
      snap.diag.pages.some((p) => p.ok && p.path === 'hsportal:mypage/point'),
  );
}

{
  // 실제 LMS sync 엔드포인트는 JSONP(cb({...}))로 응답한다 — 래핑을 벗겨 토큰 추출
  let loggedIn = false;
  const snap = baseSnap();
  await fillPortalPoints(
    fakeSession({
      '/ko/mypage/point': () => (loggedIn ? POINTS_HTML : WALL_HTML),
      // syncCoursemosLmsLogin 키가 먼저 와야 login 요청이 lms 라우트에 잡히지 않는다
      syncCoursemosLmsLogin: () => {
        loggedIn = true;
        return { success: true };
      },
      syncCoursemosLms: {
        success: true,
        url: 'https://learn.hansung.ac.kr/local/imodule/lmsSync.php',
      },
      'lmsSync.php': 'hssync({"success":true,"token":"tok-jsonp"});',
    }),
    snap,
  );
  t(
    'fill: JSONP 래핑 토큰 추출',
    loggedIn === true &&
      snap.points === 85 &&
      snap.diag.pages.some((p) => p.ok && p.path === 'hsportal:mypage/point'),
  );
}

{
  // LMS 쪽이 INVAILED_TOKEN을 돌려주면 session-expired로 분류
  const snap = baseSnap();
  await fillPortalPoints(
    fakeSession({
      '/ko/mypage/point': WALL_HTML,
      getCoursemosUrl: {
        success: true,
        url: 'https://learn.hansung.ac.kr/local/imodule/syncSession.php',
      },
      'syncSession.php': { success: false, message: 'INVAILED_TOKEN' },
      syncCoursemosLms: { success: false },
    }),
    snap,
  );
  const page = snap.diag.pages.find((p) => p.slot === 'points');
  t(
    'fill: 토큰 실패는 session-expired',
    snap.points === undefined && page?.ok === false && page.reason === 'session-expired',
  );
}

{
  // 모든 요청이 실패하면 upstream
  const snap = baseSnap();
  await fillPortalPoints(fakeSession({}), snap);
  const page = snap.diag.pages.find((p) => p.slot === 'points');
  t(
    'fill: 전체 통신 실패는 upstream',
    snap.points === undefined && page?.ok === false && page.reason === 'upstream',
  );
}

{
  // 페이지는 오지만 파싱할 수 없으면 structure — 0점으로 기록하지 않는다
  const snap = baseSnap();
  await fillPortalPoints(
    fakeSession({ '/ko/mypage/point': NO_MODULE_HTML }),
    snap,
  );
  const page = snap.diag.pages.find((p) => p.slot === 'points');
  t(
    'fill: 구조 불명은 structure·값 미설정',
    snap.points === undefined && page?.ok === false && page.reason === 'structure',
  );
}

{
  // 브리지 후에도 벽이면 session-expired
  const snap = baseSnap();
  await fillPortalPoints(
    fakeSession({
      '/ko/mypage/point': WALL_HTML,
      getCoursemosUrl: {
        success: true,
        url: 'https://learn.hansung.ac.kr/local/imodule/syncSession.php',
      },
      'syncSession.php': { success: true, token: 'tok-abc' },
      syncCoursemosLmsLogin: { success: true },
    }),
    snap,
  );
  const page = snap.diag.pages.find((p) => p.slot === 'points');
  t(
    'fill: 로그인 후에도 벽이면 session-expired',
    snap.points === undefined && page?.ok === false && page.reason === 'session-expired',
  );
}

{
  // 비밀번호 수집 경로: 자격으로 포털 직접 로그인 → 포인트 페이지 수집
  const snap = baseSnap();
  let loggedIn = false;
  await fillPortalPoints(
    fakeSession({
      '/ko/mypage/point': () => (loggedIn ? POINTS_HTML : WALL_HTML),
      '/ko/process/coursemos/login': (_url, init) => {
        if (init?.method === 'POST') {
          loggedIn = true;
          return { success: true };
        }
        return { success: false };
      },
    }),
    snap,
    { id: '2199999', pw: 'pw' },
  );
  t('fill: 포털 직접 로그인 수집', loggedIn === true && snap.points === 85);
}

{
  // 포털 로그인 거부 → 브리지 단계로 계속, 최종 reason은 세션 계열
  const snap = baseSnap();
  await fillPortalPoints(
    fakeSession({
      '/ko/mypage/point': WALL_HTML,
      '/ko/process/coursemos/login': { success: false, message: 'bad' },
      syncCoursemosLms: { success: false },
      getCoursemosUrl: { success: false },
    }),
    snap,
    { id: 'x', pw: 'y' },
  );
  const page = snap.diag.pages.find((p) => p.slot === 'points');
  t(
    'fill: 포털 로그인 거부 후 브리지 폴백',
    snap.points === undefined && page?.reason === 'session-expired',
  );
}

{
  // 자격 없으면(볼트 갱신) 포털 로그인을 시도하지 않는다
  const snap = baseSnap();
  let tried = false;
  await fillPortalPoints(
    fakeSession({
      '/ko/mypage/point': WALL_HTML,
      '/ko/process/coursemos/login': () => {
        tried = true;
        return { success: true };
      },
      syncCoursemosLms: { success: false },
      getCoursemosUrl: { success: false },
    }),
    snap,
  );
  t('fill: 자격 없으면 직접 로그인 미시도', tried === false);
}

console.log(`hsportal: ${pass} pass, ${fail} fail`);
assert.equal(fail, 0);
