import { expect, test } from '@playwright/test';
import { trackPageErrors } from './helpers';

test('첫 방문: 브랜드와 로그인·체험 진입이 보인다', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto('/');

  await expect(page.getByText('학사부기').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: '동의하고 시작하기' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '이미 가입했어요' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '연결 없이 둘러보기' }),
  ).toBeVisible();

  expect(errors).toEqual([]);
});
