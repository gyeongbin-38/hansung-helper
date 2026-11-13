import { expect, test } from '@playwright/test';

test('공개 데이터 API가 envelope로 응답한다', async ({ request }) => {
  for (const path of [
    '/api/activities',
    '/api/schedule',
    '/api/dept-rules',
    '/api/graduation-reference',
    '/api/courses?semester=2026-2',
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const body = await response.json();
    expect(body.ok, path).toBe(true);
    expect(body.data, path).toBeTruthy();
  }
});

test('헬스 체크가 계정 의존성 준비 상태를 보고한다', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    ok: true,
    checks: { accountAuth: true, accountDatabase: true },
  });
});

test('비로그인 계정 조회는 401이다', async ({ request }) => {
  const response = await request.get('/api/account');
  expect(response.status()).toBe(401);
});
