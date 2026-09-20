/**
 * 한성 학사 도우미 — 백그라운드 서비스 워커
 *
 * 앱(hansung-helper)이 열리면 app-bridge가 'hsu-refresh' 메시지를 보낸다.
 * 대시보드(/my/ 또는 /)에 있는 LMS 탭을 재사용하거나, 없으면 비활성 탭을
 * 직접 만들어(수집 후 닫는다) 그 탭의 MAIN world에 심어진
 * window.__hsCollect를 실행해 스냅샷을 받는다.
 * - 사용자가 보고 있는 LMS 탭은 절대 이동시키지 않는다.
 * - 진행 중 수집은 중복 실행하지 않고, 최근 성공 수집은 캐시로 응답한다.
 * - 결과는 chrome.storage.local에 남겨 다음 앱 오픈 때 즉시 표시한다.
 * COSMOS 로그인 세션은 사용자 브라우저의 것을 그대로 쓴다.
 */
const LMS = 'https://learn.hansung.ac.kr';
const RECENT_MS = 5 * 60e3; // 백그라운드 단기 캐시 — 5분 이내 성공분 재사용
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isDashboard = (u) => {
  try {
    const p = new URL(u).pathname;
    return p === '/my/' || p === '/my' || p === '/';
  } catch {
    return false;
  }
};

const findLmsTab = async () =>
  (await chrome.tabs.query({ url: `${LMS}/*` }))
    .find((t) => isDashboard(t.url)) ?? null;

async function waitComplete(tabId, timeout = 20000) {
  for (let i = 0; i < timeout / 500; i++) {
    const t = await chrome.tabs.get(tabId);
    if (t.status === 'complete') return t;
    await sleep(500);
  }
  throw new Error('tab-load-timeout');
}

async function runCollect(tabId) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async () => {
      if (
        location.pathname.startsWith('/login') ||
        document.querySelector(
          'form[action*="login"], #page-login-index, .login-form',
        )
      )
        return { error: 'cosmos-login-required' };
      if (typeof window.__hsCollect !== 'function')
        return { error: 'collector-missing' };
      try {
        return { payload: await window.__hsCollect() };
      } catch (e) {
        return { error: String(e?.message ?? e) };
      }
    },
  });
  return res?.result ?? { error: 'no-result' };
}

/** LMS 탭에서 수집 실행. createTab이면 탭이 없을 때 비활성 탭 생성.
 *  우리가 만든 탭은 성공·실패 무관하게 닫는다. */
async function collectLms({ createTab }) {
  let tab = await findLmsTab();
  let ours = false;
  if (!tab) {
    if (!createTab) return { error: 'no-lms-tab' };
    tab = await chrome.tabs.create({ url: `${LMS}/my/`, active: false });
    ours = true;
  }
  try {
    await waitComplete(tab.id);
    for (let i = 0; i < 12; i++) {
      let r;
      try {
        r = await runCollect(tab.id);
      } catch (e) {
        // 탭 소실·권한 밖 도메인 리다이렉트(SSO 로그인) 등 — 재시도 의미 없음
        return { error: String(e?.message ?? e) };
      }
      if (r.payload) {
        await chrome.storage.local.set({
          hsuLms: r.payload,
          hsuLmsAt: Date.now(),
        });
        return { payload: r.payload };
      }
      if (r.error === 'collector-missing') {
        // 확장 설치 전에 열린 탭 등 — content.js를 직접 주입해 복구
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            files: ['content.js'],
          });
        } catch {
          /* 다음 재시도에서 판정 */
        }
        await sleep(1000);
        continue;
      }
      return { error: r.error };
    }
    return { error: 'collector-timeout' };
  } finally {
    if (ours) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// 진행 중 수집 공유 + 단기 캐시 — 앱 탭 여러 개/빠른 재방문이 LMS를
// 중복으로 두드리지 않게 한다. 실패는 hsuLmsErr로 남겨 콘솔·진단에 쓴다.
let inflight = null;
async function requestCollect(opts) {
  const { hsuLmsAt, hsuLms } = await chrome.storage.local.get([
    'hsuLmsAt',
    'hsuLms',
  ]);
  // force=true(앱의 명시적 새로고침·주기 갱신)면 단기 캐시를 건너뛰되
  // 진행 중 수집은 그대로 공유한다.
  if (!opts.force && hsuLmsAt && Date.now() - hsuLmsAt < RECENT_MS && hsuLms)
    return { payload: hsuLms, cached: true };
  // 'known': 과거 성공 수집이 있는(COSMOS 사용자인) 경우에만 탭 생성 —
  // 한 번도 수집한 적 없는 브라우저에 무작위 탭을 띄우지 않기 위함.
  const createTab =
    opts.createTab === 'known' ? !!hsuLmsAt : opts.createTab;
  if (!inflight)
    inflight = collectLms({ createTab }).finally(() => {
      inflight = null;
    });
  const res = await inflight;
  if (res.error) {
    console.warn('[학사도우미] 수집 실패:', res.error);
    void chrome.storage.local.set({
      hsuLmsErr: { error: res.error, at: Date.now() },
    });
  }
  return res;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'hsu-refresh') {
    requestCollect({ createTab: true, force: msg.force === true })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: String(e?.message ?? e) }));
    return true; // 비동기 sendResponse
  }
});

// 브라우저가 켜져 있는 동안 4시간마다 조용히 수집 — 대시보드에 열려 있는
// LMS 탭을 재사용하고, 없으면 과거 수집 이력이 있는 경우에만 비활성 탭을
// 만들어 갱신 공백을 막는다(수집 후 탭은 닫힘). 워커가 깰 때마다 create를
// 다시 부르면 카운트다운이 리셋되므로 없을 때만 만든다.
chrome.alarms.get('hsu-poll', (a) => {
  if (!a) chrome.alarms.create('hsu-poll', { periodInMinutes: 240 });
});
chrome.alarms.onAlarm.addListener(() => {
  void requestCollect({ createTab: 'known' });
});
