import { expect, test } from '@playwright/test';
import { trackPageErrors } from './helpers';

// 사이드바 메뉴 순서(app/sections/data.ts menus)와 동일하게 순회한다.
const SECTIONS = [
  ['home', '홈'],
  ['lms', '수업·과제'],
  ['graduation', '졸업 요건'],
  ['semester-plan', '학기별 계획'],
  ['timetable', '시간표 짜기'],
  ['courses', '과목 추천'],
  ['activities', '비교과·대외활동'],
  ['calendar', '학사일정'],
  ['advisor', 'AI 학사 도우미'],
  ['survey', '설문조사'],
] as const;

test('체험 모드로 전체 메뉴를 순회한다', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: '연결 없이 둘러보기' }).click();

  // 첫 체험은 시작 설문으로 이동한다
  await expect(
    page.getByRole('button', { name: '설문 시작하기' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '나중에 할게요' }).click();
  await expect(page.getByText('체험 모드').first()).toBeVisible();

  // 섹션 안에 보조 nav가 또 있는 화면이 있어 사이드바로 범위를 한정한다.
  const sidebarNav = page.getByRole('complementary').locator('nav');
  for (const [hash, label] of SECTIONS) {
    await sidebarNav.getByRole('button', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${hash}$`));
    await expect(
      sidebarNav.locator('[aria-current="page"]'),
      `${label} 화면이 활성 메뉴로 표시돼야 한다`,
    ).toHaveAttribute('aria-label', label);
  }

  // 설정 화면 — 체험 데이터 보관 안내가 보인다
  await page.goto('/#settings');
  await expect(
    page.getByRole('heading', { name: '이 브라우저의 체험 데이터' }),
  ).toBeVisible();

  expect(errors).toEqual([]);
});
