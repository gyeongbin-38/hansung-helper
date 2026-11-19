/** 방문 핑 — 익명(IP+UA+날짜 HMAC)으로 일별 방문자·섹션 조회수를 기록한다.
 *  실패는 무시 — 분석이 앱 동작을 막지 않는다. */
let refSent = false;
export function pingAnalytics(section: string) {
  if (typeof window === 'undefined') return;
  let ref = '';
  if (!refSent) {
    refSent = true;
    try {
      const host = document.referrer && new URL(document.referrer).host;
      // 같은 사이트 내부 이동은 유입으로 세지 않는다.
      if (host && host !== location.host) ref = host;
    } catch {
      ref = '';
    }
  }
  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ p: section, ref }),
    keepalive: true,
  }).catch(() => {});
}
