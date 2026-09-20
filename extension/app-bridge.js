/**
 * 한성 학사 도우미 — 앱 페이지 브리지 (ISOLATED world)
 *
 * 앱 페이지(hansung-helper.workers.dev, 로컬 8787)에서 실행된다.
 * 1) storage의 마지막 수집 스냅샷을 즉시 페이지로 전달하고,
 * 2) 백그라운드에 'hsu-refresh'를 보내 LMS 탭에서 새 수집을 트리거한다.
 * 페이지와의 통신은 window.postMessage — 앱은 'hsu-lms-import' 타입만 받는다.
 */
(() => {
  const post = (type, extra) =>
    window.postMessage({ type, ...extra }, location.origin);

  // 마지막 저장 스냅샷 — 새 수집이 오기 전 즉시 표시용.
  // React 리스너 등록을 기다려 약간 지연 후 전송.
  chrome.storage.local.get(['hsuLms'], (r) => {
    if (r.hsuLms)
      setTimeout(() => post('hsu-lms-import', { payload: r.hsuLms }), 1200);
  });

  chrome.runtime.sendMessage({ type: 'hsu-refresh' }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.payload) post('hsu-lms-import', { payload: res.payload });
    else if (res?.error) post('hsu-lms-status', { error: res.error });
  });
})();
