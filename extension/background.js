/**
 * 한성 학사 도우미 — 백그라운드 서비스 워커
 *
 * 앱(hansung-helper)이 열리면 app-bridge가 'hsu-refresh' 메시지를 보낸다.
 * 열려 있는 LMS 탭을 찾거나(없으면 비활성 탭으로 생성) 그 탭의
 * MAIN world에 심어진 window.__hsCollect를 실행해 스냅샷을 받는다.
 * 결과는 chrome.storage.local에도 남겨 다음 앱 오픈 때 즉시 표시한다.
 * COSMOS 로그인 세션은 사용자 브라우저의 것을 그대로 쓴다.
 */
const LMS = 'https://learn.hansung.ac.kr';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const findLmsTab = async () =>
  (await chrome.tabs.query({ url: `${LMS}/*` }))[0] ?? null;

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

/** LMS 탭에서 수집 실행. createTab이면 탭이 없을 때 비활성 탭 생성. */
async function collectLms({ createTab }) {
  let tab = await findLmsTab();
  if (!tab) {
    if (!createTab) return { error: 'no-lms-tab' };
    tab = await chrome.tabs.create({ url: `${LMS}/my/`, active: false });
  }
  try {
    await waitComplete(tab.id);
  } catch {
    return { error: 'tab-load-timeout' };
  }
  for (let i = 0; i < 12; i++) {
    const r = await runCollect(tab.id);
    if (r.payload) {
      await chrome.storage.local.set({
        hsuLms: r.payload,
        hsuLmsAt: Date.now(),
      });
      return { payload: r.payload };
    }
    if (r.error === 'collector-missing') {
      await sleep(1000);
      continue; // content.js 주입 대기
    }
    // 대시보드가 아닌 페이지(홈/로그인 통과 후 다른 화면)면 /my/로 이동
    if (
      r.error?.includes('수강 과목을 찾지') &&
      !tab.url?.includes('/my/')
    ) {
      await chrome.tabs.update(tab.id, { url: `${LMS}/my/` });
      try {
        await waitComplete(tab.id);
      } catch {
        return { error: 'tab-load-timeout' };
      }
      continue;
    }
    return { error: r.error };
  }
  return { error: 'collector-timeout' };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'hsu-refresh') {
    collectLms({ createTab: true })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: String(e?.message ?? e) }));
    return true; // 비동기 sendResponse
  }
});

// 브라우저가 켜져 있는 동안 4시간마다 조용히 수집 — 열려 있는 LMS 탭만
// 사용(새 탭은 띄우지 않음). 결과는 storage에 쌓여 다음 앱 오픈에 반영.
chrome.alarms.create('hsu-poll', { periodInMinutes: 240 });
chrome.alarms.onAlarm.addListener(() => {
  void collectLms({ createTab: false });
});
