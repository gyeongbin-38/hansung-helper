/** Optional browser regression checks. Start `npm run dev -- --hostname 127.0.0.1 --port 4339` first.
 * Install puppeteer-core locally, or set FRONTEND_QA_DRIVER to its ESM entry file.
 * Evidence is written under ignored outputs/frontend-qa/. No school account is used.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const driver = process.env.FRONTEND_QA_DRIVER;
const { default: puppeteer } = await import(
  driver ? pathToFileURL(path.resolve(driver)).href : 'puppeteer-core'
);
const base = process.env.FRONTEND_QA_URL || 'http://127.0.0.1:4339';
const output = path.resolve('outputs/frontend-qa');
await mkdir(output, { recursive: true });
const catalog = JSON.parse(await readFile('lib/data/catalog-2026-2.json', 'utf8'));
const course = catalog.sections.find((s) =>
  !s.untimed && s.slots.length > 1 &&
  s.slots.every((slot) => slot.d < 6 && slot.s >= 540 && slot.e <= 1350),
);
assert.ok(course, 'catalog must contain a timed course');
const profile = {
  name: '프론트 검증', dept: course.dept, year: '2024', credits: '', points: '',
  saved: [], planned: [], completed: [], prefs: [], readIds: [],
  ruleOverrides: {}, events: [], consent: false,
};
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome'),
});
const results = [];
const errors = [];
let page;
try {
  page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1100 });
  await page.evaluateOnNewDocument((dept) => {
    localStorage.setItem('hansung-demo-v1', JSON.stringify({
      name: '프론트 검증', dept, year: '2024', credits: '', points: '',
      saved: [], planned: [], completed: [], prefs: [], readIds: [],
      ruleOverrides: {}, events: [], consent: false,
    }));
  }, course.dept);
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('.auth-panel');
  assert.equal(await page.evaluate(() => document.body.innerText.includes('01 · 학교 계정 연결')), false);
  results.push('로그인 번호 문구 제거');

  async function clickText(text, scope = 'button, a') {
    const found = await page.evaluate((text, scope) => {
      const target = [...document.querySelectorAll(scope)].find((el) =>
        el.textContent?.includes(text),
      );
      if (!target) return false;
      target.click();
      return true;
    }, text, scope);
    assert.ok(found, `missing action: ${text}`);
  }
  async function waitForCount(selector, count) {
    await page.waitForFunction((selector, count) =>
      document.querySelectorAll(selector).length === count,
    { timeout: 10000 }, selector, count);
  }
  await clickText('연결 없이 둘러보기');
  await page.evaluate(() => { location.hash = 'timetable'; });
  await page.waitForSelector('.builder');
  await page.evaluate(() => document.querySelector('.cookie button')?.click());
  await page.select('select[aria-label="학과 필터"]', '전체');
  await page.type('input[aria-label="과목 검색"]', course.code);
  const rowSelector = `.cat-row[data-section-id="${course.id}"]`;
  await page.waitForSelector(rowSelector);
  assert.equal(await page.$eval('.plan-comparison', (el) => el.open), false);

  async function beginDrag() {
    const row = await page.$(rowSelector);
    await row.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const grip = await row.$('.cat-grip');
    const from = await grip.boundingBox();
    const grid = await page.$eval('.tt-body', (el) => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width };
    });
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(grid.x + grid.width / 2, Math.max(100, grid.y + 120), { steps: 16 });
    await page.waitForSelector('.drag-card');
  }
  await beginDrag();
  await waitForCount('.tt-preview', course.slots.length);
  const slots = await page.$$eval('.tt-preview', (els) => els.map((el) => Number.parseFloat(el.style.top)));
  assert.deepEqual(slots.sort((a, b) => a - b), course.slots.map((slot) => (slot.s - 540) * 0.9).sort((a, b) => a - b));
  await page.screenshot({ path: path.join(output, 'drag-preview.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await waitForCount('.tt-preview', 0);
  await waitForCount('.drag-card', 0);
  await waitForCount('.tt-block', 0);
  results.push('실제 개설 시간 미리보기·Escape 취소');

  await beginDrag();
  await page.mouse.up();
  await waitForCount('.tt-block', course.slots.length);
  results.push('목록에서 시간표 드롭으로 추가');
  const block = await page.$('.tt-block-select');
  await block.hover();
  assert.equal(await page.$eval('.tt-block-remove', (el) => getComputedStyle(el).opacity), '1');
  await page.click('.tt-block-remove');
  await waitForCount('.tt-block', 0);
  await page.waitForSelector('.tt-undo');
  results.push('호버 후 × 삭제·동일 과목의 모든 시간 제거');
  await page.click('.tt-undo .link');
  await waitForCount('.tt-block', course.slots.length);
  await waitForCount('.tt-undo', 0);
  await page.click(`${rowSelector} .cat-side button`);
  await waitForCount('.tt-block', 0);
  results.push('삭제 실행 취소로 같은 분반의 모든 시간 복구');

  await page.click(`${rowSelector} .cat-side button`);
  await waitForCount('.tt-block', course.slots.length);
  await page.click('.tt-block-select');
  assert.equal(await page.$eval('.tt-block', (el) => el.classList.contains('selected')), true);
  await page.click('.tt-block-remove');
  await waitForCount('.tt-block', 0);
  results.push('추가 버튼·클릭 선택 후 × 삭제');

  await clickText('수업 선호 설문', '.builder-recs button');
  await page.waitForSelector('dialog[open]');
  assert.match(await page.$eval('dialog[open]', (el) => el.textContent), /수업 선호/);
  await page.click('button[aria-label="설문 닫기"]');
  await page.evaluate(() => { location.hash = 'activities'; });
  await page.waitForSelector('input[aria-label="활동명 검색"]');
  await clickText('비교과 설문');
  await page.waitForSelector('dialog[open]');
  assert.match(await page.$eval('dialog[open]', (el) => el.textContent), /비교과 선호/);
  await page.click('button[aria-label="설문 닫기"]');
  results.push('수업·비교과 설문 진입');

  await page.evaluate(() => { location.hash = 'timetable'; });
  await page.waitForSelector('.builder');
  await page.select('select[aria-label="학과 필터"]', '전체');
  await page.type('input[aria-label="과목 검색"]', course.code);
  await page.waitForSelector(rowSelector);
  await page.click(`${rowSelector} .cat-side button`);
  await waitForCount('.tt-block', course.slots.length);
  await page.click('.plan-comparison summary');
  await clickText('현재 안 저장', '.plan-slot:nth-child(2) button');
  await page.waitForSelector('button[aria-label="안 A 삭제"]');
  await page.click('.plan-comparison summary');
  await page.click(`${rowSelector} .cat-side button`);
  await waitForCount('.tt-block', 0);
  await page.click('.plan-comparison summary');
  await clickText('불러오기', '.plan-slot:nth-child(2) button');
  await waitForCount('.tt-block', course.slots.length);
  await page.click('.plan-comparison summary');
  results.push('A안 저장·비교 접기·계획 제거 후 불러오기');
  for (const width of [320, 375, 768, 1100, 1440]) {
    await page.setViewport({ width, height: 1100 });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    const geometry = await page.evaluate(() => {
      const cols = document.querySelector('.builder-cols').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        right: cols.right,
        children: [...document.querySelector('.builder-cols').children].map((el) => {
          const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, right: r.right };
        }),
      };
    });
    assert.ok(geometry.overflow <= 1, `${width}px: page overflow ${geometry.overflow}`);
    assert.ok(geometry.children.every((child) => child.right <= geometry.right + 1), `${width}px: panel overflow`);
    await page.screenshot({ path: path.join(output, `timetable-${width}.png`), fullPage: true });
    results.push(`${width}px 화면 넘침 없음`);
  }
  await page.click(`${rowSelector} .cat-side button`);
  await page.waitForSelector('.tt-undo');
  await page.select('select[aria-label="계획 학기"]', '2027-1');
  await page.waitForFunction(() =>
    document.querySelector('select[aria-label="계획 학기"]').value === '2027-1' && !document.querySelector('.tt-undo'),
  );
  results.push('다른 학기로 전환하면 이전 삭제 실행 취소 초기화');

  const accountContext = await browser.createBrowserContext();
  page = await accountContext.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1100 });
  await page.setRequestInterception(true);
  let saveRequests = 0;
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/account') {
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {
        profile: { ...profile, planned: [course.id] }, onboarded: true, studentMask: '테스트 계정',
        snapshot: { portal: 'connected', lms: 'unavailable', courses: [], checkedAt: new Date().toISOString(), courseScope: 'test' },
      } }) });
    } else if (pathname === '/api/account/profile') {
      saveRequests += 1;
      setTimeout(() => {
        void request.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'TEST_SAVE_FAILED', message: '테스트 저장 실패' } }) });
      }, 600);
    } else void request.continue();
  });
  await page.goto(base + '/#timetable', { waitUntil: 'networkidle0', timeout: 30000 });
  await waitForCount('.tt-block', course.slots.length);
  await page.click('.tt-block-select');
  await page.click('.tt-block-remove');
  await page.waitForSelector('.builder-cols[aria-busy="true"]');
  assert.ok(await page.$eval('.tt-block-remove', (el) => el.disabled));
  await page.select('select[aria-label="계획 학기"]', '2027-1');
  assert.equal(saveRequests, 1);
  await page.waitForSelector('.builder-cols[aria-busy="false"]');
  await waitForCount('.tt-undo', 0);
  await waitForCount('.tt-block', course.slots.length);
  assert.equal(saveRequests, 1);
  results.push('저장 중 중복 삭제 차단·저장 실패 시 성공 안내와 실행 취소를 표시하지 않음');
  await accountContext.close();

  const touchContext = await browser.createBrowserContext();
  page = await touchContext.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 375, height: 1000, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((profile) => localStorage.setItem('hansung-demo-v1', JSON.stringify(profile)), { ...profile, planned: [course.id] });
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('.auth-panel');
  await clickText('연결 없이 둘러보기');
  await page.evaluate(() => { location.hash = 'timetable'; });
  await page.waitForSelector('.tt-day-nav');
  await page.evaluate(() => document.querySelector('.cookie button')?.click());
  await page.tap('button[aria-label="금요일 시간표로 이동"]');
  await page.waitForFunction(() => document.querySelector('.builder-grid').scrollLeft > 0);
  const dayNavVisible = await page.$eval('.tt-day-nav', (el) => {
    const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth;
  });
  assert.ok(dayNavVisible, '요일 버튼은 가로 이동 후에도 화면 안에 남아야 함');
  assert.ok(await page.$eval('.tt-hours', (el) => {
    const grid = document.querySelector('.builder-grid').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.left >= grid.left - 1 && r.right <= grid.right;
  }), '가로 이동 후에도 시간 축이 보여야 함');
  await page.tap('button[aria-label="화요일 시간표로 이동"]');
  await page.tap('.tt-block-select');
  await page.tap('.tt-block-remove');
  await waitForCount('.tt-block', 0);
  await page.waitForSelector('.tt-undo .link', { visible: true });
  await page.tap('.tt-undo .link');
  await waitForCount('.tt-block', course.slots.length);
  results.push('375px 실제 터치: 요일 이동·수업 선택·삭제·실행 취소');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: path.join(output, 'timetable-touch.png'), fullPage: true });
  await touchContext.close();
  page = null;
  assert.deepEqual(errors, [], 'browser runtime errors');
  console.log(JSON.stringify({ passed: results, runtimeErrors: errors }, null, 2));
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: results, runtimeErrors: errors }, null, 2));
} catch (error) {
  console.error('Completed before failure:', results);
  if (page) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    console.error('Browser state:', await page.evaluate(() => ({ hash: location.hash, scroll: scrollY, errors: document.querySelector('.toast-stack')?.textContent })));
  }
  throw error;
} finally {
  await browser.close();
}
