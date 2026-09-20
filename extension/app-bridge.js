// 학사도우미 앱 ↔ 확장 브리지
// 앱 도메인(프로덕션 + localhost)에서만 로드됨. 메시지 계약:
//   → 앱: hsu-extension-ready {version}, hsu-lms-status {status|error},
//         hsu-lms-import {payload}
//   ← 앱: hsu-extension-ping, hsu-lms-refresh-request {force}
// postMessage는 location.origin으로 제한(앱 자신만 수신), 외부 유입 없음.
(() => {
  const post = (type, extra) =>
    window.postMessage({ type, ...extra }, location.origin);

  const ready = () =>
    post('hsu-extension-ready', {
      version: chrome.runtime.getManifest().version,
    });
  ready();
  // React 리스너가 늦게 붙는 경우 대비 한 번 더 통지
  setTimeout(ready, 2000);

  // 앱에서 시작/완료를 추적할 수 있게 수집 상태를 그대로 전달
  const trigger = (force) => {
    post('hsu-lms-status', { status: 'syncing' });
    chrome.runtime.sendMessage({ type: 'hsu-refresh', force }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.ok && res.payload) {
        post('hsu-lms-status', { status: 'success' });
        post('hsu-lms-import', { payload: res.payload });
      } else {
        post('hsu-lms-status', {
          status: 'failed',
          error: res?.error || 'refresh-failed',
        });
      }
    });
  };

  // 저장된 스냅샷을 먼저 보내고, 최근 수집이 오래됐으면 백그라운드 수집
  const FRESH_MS = 30 * 60 * 1000;
  chrome.storage.local.get(['hsuLms', 'hsuLmsAt'], (r) => {
    if (r.hsuLms) post('hsu-lms-import', { payload: r.hsuLms });
    if (r.hsuLmsAt && Date.now() - r.hsuLmsAt < FRESH_MS) return;
    setTimeout(() => trigger(false), 1200);
  });

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (e.data?.type === 'hsu-extension-ping') ready();
    if (e.data?.type === 'hsu-lms-refresh-request')
      trigger(e.data.force === true);
  });
})();
