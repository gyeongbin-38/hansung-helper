/** Home brief browser regression with synthetic data only. Uses the same driver/base env as qa-frontend.mjs. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const driver = process.env.FRONTEND_QA_DRIVER;
const { default: puppeteer } = await import(driver ? pathToFileURL(path.resolve(driver)).href : 'puppeteer-core');
const base = process.env.FRONTEND_QA_URL || 'http://127.0.0.1:4339';
const output = path.resolve('outputs/home-brief-qa');
await mkdir(output, { recursive: true });
const now = Date.parse('2026-11-08T14:30:00Z');
const profile = {
  name: '홈 검증', dept: '컴퓨터공학부', year: '2024', credits: '', points: '',
  saved: ['saved'], planned: [], completed: [], prefs: [], readIds: [], ruleOverrides: {}, events: [], consent: false,
  setupHistory: 'later', recommendationsSeen: true,
  lms: {
    source: 'cosmos-lms', fetchedAt: new Date(now).toISOString(), courses: [{
      id: 'qa-home-course', title: '검증용 자료구조', vods: [], quizzes: [],
      assigns: [
        { title: '기한이 지난 과제', due: '2026-11-07 12:00', submitted: false },
        ...Array.from({ length: 6 }, (_, i) => ({ title: `내일 과제 ${i + 1}`, due: '2026-11-09 10:00', submitted: false, url: 'https://learn.hansung.ac.kr/mod/assign/view.php?id=1' })),
        { title: '마감 없는 과제', due: null, submitted: false },
        { title: '완료한 과제', due: '2026-11-09 10:00', submitted: true },
      ],
    }],
  },
};
const activities = {
  source: 'hsportal', sourceUrl: 'https://hsportal.hansung.ac.kr/', fetchedAt: new Date(now).toISOString(), itemCount: 1,
  items: [{ id: 'saved', key: 'saved', title: '저장한 활동', dept: '학교', status: 'open', statusLabel: '접수중', applyStart: null, applyEnd: '2026-11-09T18:00:00+09:00', runStart: null, runEnd: null, dday: null, points: null, team: null, applicants: null, capacity: null, certified: false, url: 'https://hsportal.hansung.ac.kr/', cover: null }],
};
const schedule = {
  source: 'hansung-homepage', sourceUrl: 'https://www.hansung.ac.kr/', fetchedAt: new Date(now).toISOString(), eventCount: 1,
  items: [{ id: 'period', title: '트랙 신청', start: '2026-11-01', end: '2026-11-09' }],
};
const results = [];
const errors = [];
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateTimezone('America/Los_Angeles');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((profile, now) => {
    Date.now = () => now;
    localStorage.setItem('hansung-demo-v1', JSON.stringify(profile));
  }, profile, now);
  let failActivities = false;
  let activityRequests = 0;
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/activities') {
      activityRequests++;
      void request.respond({ status: failActivities ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failActivities ? { ok: false, error: { code: 'TEST', message: '검증용 오류' } } : { ok: true, data: activities }) });
    } else if (pathname === '/api/schedule') {
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: schedule }) });
    } else void request.continue();
  });
  let visit = 0;
  async function enterDemo() {
    await page.goto(base + `/?homeQa=${++visit}#home`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('.auth-panel, .home-brief');
    if (await page.$('.auth-panel')) await page.evaluate(() => [...document.querySelectorAll('button')].find((el) => el.textContent.includes('연결 없이 둘러보기')).click());
    await page.waitForSelector('.home-brief');
    await page.waitForFunction(() => document.querySelector('.brief-sources').textContent.includes('마지막 수집'));
    await page.evaluate(() => document.querySelector('.cookie button')?.click());
  }
  await enterDemo();
  let text = await page.$eval('.home-brief', (el) => el.textContent);
  assert.ok(text.includes('내일'));
  assert.ok(!text.includes('완료한 과제'));
  assert.equal(await page.$$eval('#home-deadlines > li', (items) => items.length), 5);
  await page.click('.brief-more');
  assert.equal(await page.$$eval('#home-deadlines > li', (items) => items.length), 9);
  assert.ok((await page.$eval('#home-deadlines', (el) => el.textContent)).includes('기한 지남'));
  assert.ok((await page.$eval('#home-deadlines > li', (el) => el.textContent)).includes('내일 과제'));
  results.push('LA 시간대에서도 KST 내일 표시·지난 기한 분리·완료 제외·전체 일정 펼치기');

  await page.click('.brief-checks summary');
  assert.ok(await page.$eval('.brief-checks', (el) => el.open));
  assert.ok((await page.$eval('.brief-checks', (el) => el.textContent)).includes('마감 없는 과제'));
  assert.equal(await page.$$eval('.home-brief button a, .home-brief a button', (items) => items.length), 0);
  const link = await page.$eval('.home-brief .brief-content a', (el) => ({ url: el.href, target: el.target }));
  assert.equal(link.target, '_blank');
  assert.ok(link.url.startsWith('https://learn.hansung.ac.kr/'));
  results.push('마감 미기재 확인·중첩 조작 요소 없음·COSMOS 원문 링크');

  await page.click('.brief-sources summary');
  assert.ok((await page.$eval('.brief-sources', (el) => el.textContent)).includes('KST'));
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewport({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px page overflow`);
    await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true });
  }
  results.push('320·375·768·1440px 가로 넘침 없음·수집 시각 표시');

  await page.click('.brief-detail');
  await page.waitForFunction(() => location.hash.includes('lms/qa-home-course'));
  await page.waitForSelector('.lms-course');
  results.push('수업 상세로 이동');

  activities.fetchedAt = '2026-11-01T00:00:00Z';
  await enterDemo();
  await page.click('.brief-more');
  assert.ok(!(await page.$eval('#home-deadlines', (el) => el.textContent)).includes('저장한 활동'));
  assert.ok((await page.$eval('.brief-checks', (el) => el.textContent)).includes('현재 접수 여부 확인 필요'));
  results.push('오래된 활동은 긴급 마감에서 원문 확인 목록으로 이동');

  failActivities = true;
  await enterDemo();
  await page.click('.brief-sources summary');
  await page.waitForFunction(() => document.querySelector('.brief-sources').textContent.includes('불러오기 실패'));
  const previous = activityRequests;
  failActivities = false;
  await page.evaluate(() => [...document.querySelectorAll('.brief-sources button')].find((el) => el.textContent.includes('다시 불러오기')).click());
  await page.waitForFunction(() => !document.querySelector('.brief-sources').textContent.includes('불러오기 실패'));
  assert.ok(activityRequests > previous);
  results.push('공개 API 실패 후 홈에서 재요청·복구');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ passed: results.length, results, errors }, null, 2));
} finally {
  await browser.close();
}
