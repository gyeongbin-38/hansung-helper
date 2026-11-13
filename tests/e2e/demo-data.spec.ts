import { expect, test } from '@playwright/test';
import { trackPageErrors } from './helpers';

const DEMO_KEY = 'hansung-demo-v1';

test('체험 데이터가 브라우저에 저장되고 재진입 시 복원된다', async ({
  page,
}) => {
  const errors = trackPageErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: '연결 없이 둘러보기' }).click();
  await page.getByRole('button', { name: '나중에 할게요' }).click();
  await expect(page.getByText('체험 모드').first()).toBeVisible();

  const stored = await page.evaluate((key) => localStorage.getItem(key), DEMO_KEY);
  expect(stored).toBeTruthy();
  expect(stored).toContain('"surveyStatus":"skipped"');

  // 새로고침하면 체험 모드는 해제되지만 저장 데이터는 남는다
  await page.reload();
  await page.getByRole('button', { name: '연결 없이 둘러보기' }).click();
  await expect(page.getByText('체험 모드').first()).toBeVisible();
  // 이미 건너뛴 설문이 아니라 홈으로 들어간다
  await expect(
    page.getByRole('complementary').locator('nav [aria-current="page"]'),
  ).toHaveAttribute('aria-label', '홈');

  expect(errors).toEqual([]);
});
