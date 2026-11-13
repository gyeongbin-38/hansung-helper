import type { Page } from '@playwright/test';

/**
 * 페이지 에러·콘솔 에러·실패한 요청·비정상 응답을 수집한다.
 * 스펙 끝에서 expect(errors).toEqual([])로 사용자에게 보이지 않는
 * 런타임 오류까지 잡아낸다.
 *
 * 비로그인 상태에서 /api/account 계열이 401을 받는 것은 앱의 정상
 * 동작(로그인 여부 확인)이므로 허용 목록에 둔다. 그 외 4xx/5xx —
 * 예를 들어 정적 에셋 404 — 는 URL과 함께 기록된다.
 */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // 리소스 로드 실패 메시지는 URL을 담지 않으므로 response 리스너가
    // 대신 기록한다 — 여기서 중복 집계하면 예상된 401도 걸린다.
    if (message.text().startsWith('Failed to load resource')) return;
    errors.push(`console.error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    // 화면 이동으로 취소된 요청(ERR_ABORTED)은 앱의 정상 abort 패턴이다.
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    errors.push(
      `requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`,
    );
  });
  page.on('response', (response) => {
    const { pathname } = new URL(response.url());
    const status = response.status();
    if (status < 400) return;
    if (status === 401 && pathname.startsWith('/api/account')) return;
    errors.push(`response ${status}: ${pathname}`);
  });
  return errors;
}
