/** Optional UI checks. Set FRONTEND_QA_DRIVER to the existing puppeteer-core entry. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { default: puppeteer } = await import(
  process.env.FRONTEND_QA_DRIVER
    ? pathToFileURL(path.resolve(process.env.FRONTEND_QA_DRIVER)).href
    : 'puppeteer-core'
);
const base = process.env.FRONTEND_QA_URL || 'http://127.0.0.1:4341';
const output = 'outputs/lms-page3';
await mkdir(output, { recursive: true });
const now = Date.now();
const day = Math.floor((now + 9 * 3600e3) / 86400e3);
const due = (offset, time = '23:59') =>
  new Date((day + offset) * 86400e3).toISOString().slice(0, 10) + ' ' + time;
const snapshot = {
  source: 'cosmos-lms',
  fetchedAt: new Date(now).toISOString(),
  courses: Array.from({ length: 7 }, (_, i) => ({
    id: String(101 + i),
    title: `[${String.fromCharCode(65 + i)}] ${['타이포그래피 NEW', '인류문명과 지구환경', '영상디자인', '일본 사회문화의 이해', '데이터베이스', '웹 프로그래밍', '컴퓨터 구조'][i]}`,
    prof: '테스트 교수',
    vods: [
      {
        title: '온라인 강의 1',
        attended: true,
        range: due(-3) + ' ~ ' + due(1),
      },
      {
        title: '온라인 강의 2',
        attended: false,
        range: due(-1) + ' ~ ' + due(3),
        url: 'https://learn.hansung.ac.kr/mod/vod/view.php?id=' + i,
      },
    ],
    assigns: [
      {
        title: [
          '한글폰트 포스터 디자인',
          'PBL 보고서 05',
          '영상 콘텐츠 제작',
          '문화 비교 보고서',
          '쿼리 과제',
          '웹페이지 과제',
          '구조 분석 과제',
        ][i],
        due: due(
          i === 0 ? 0 : i === 1 ? -1 : i === 3 ? -9 : i === 4 ? -2 : i - 1,
        ),
        submitted: i === 3 || i === 4,
        uncertain: i === 4 || undefined,
        url: 'https://learn.hansung.ac.kr/mod/assign/view.php?id=' + i,
      },
    ],
    quizzes: i === 0 ? [{ title: '날짜 없는 퀴즈', submitted: false }] : [],
  })),
};
snapshot.courses.push({
  id: '108',
  title: '지난 학기 수업',
  prof: '테스트 교수',
  vods: [],
  assigns: [
    { title: '지난 학기 과제', due: '2020-06-01 23:59', submitted: true },
  ],
  quizzes: [],
});
snapshot.courses[0].assigns.push({
  title: '미리 제출한 과제',
  due: due(0),
  submitted: true,
  url: 'https://learn.hansung.ac.kr/mod/assign/view.php?id=999',
});
snapshot.courses[2].vods[1].range = due(-1) + ' ~ ' + due(0);
const profile = {
  name: '디자인 검증',
  dept: 'AI응용학과',
  year: '2024',
  credits: '',
  points: '',
  saved: [],
  planned: [],
  completed: [],
  prefs: [],
  readIds: [],
  ruleOverrides: {},
  events: [],
  consent: false,
  lms: snapshot,
};
const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const checks = [];
const errors = [];
const page = await browser.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', (e) => errors.push(e.message));
await page.evaluateOnNewDocument(
  (p) => localStorage.setItem('hansung-demo-v1', JSON.stringify(p)),
  profile,
);
const clickText = async (text, selector = 'button') => {
  assert.ok(
    await page.evaluate(
      (text, selector) => {
        const el = [...document.querySelectorAll(selector)].find(
          (e) => e.textContent.trim() === text,
        );
        el?.click();
        return !!el;
      },
      text,
      selector,
    ),
    'Missing ' + text,
  );
};
try {
  await page.setViewport({ width: 1600, height: 1000 });
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 60000 });
  await clickText('연결 없이 둘러보기');
  await page.evaluate(() => {
    location.hash = 'lms';
    document.querySelector('.cookie button')?.click();
  });
  await page.waitForSelector('.study-overview');
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((e) => e.textContent.trim() === '확인')
      ?.click(),
  );
  assert.equal(await page.$$eval('.study-metrics > .card', (e) => e.length), 4);
  assert.equal(
    await page.$eval(
      '.study-metrics > :nth-child(3) strong',
      (e) => e.textContent,
    ),
    '1건',
    'today assignment count excludes completed tasks and lectures',
  );
  assert.equal(await page.$$eval('.study-course', (e) => e.length), 5);
  await page.click('.study-course-toggle');
  await page.waitForSelector('.study-course-detail');
  assert.ok(
    await page.$('.study-course-detail a[href*="learn.hansung.ac.kr"]'),
  );
  await page.click('.study-course-toggle');
  await clickText('전체 과목 보기 (7)');
  assert.equal(await page.$$eval('.study-course', (e) => e.length), 7);
  await clickText('간단히 보기');
  checks.push('수업 지표·펼치기·상세 링크·전체 과목');
  await page.evaluate(() => {
    location.hash = 'lms/107';
  });
  await page.waitForSelector('#study-course-107 .study-course-detail');
  await page.evaluate(() => {
    location.hash = 'lms/108';
  });
  await page.waitForSelector('.study-archive[open] #lms-c-108');
  await page.evaluate(() => {
    location.hash = 'lms';
  });
  await page.waitForSelector('.study-overview');
  checks.push('검색 과목 직접 진입·지난 학기 상세');
  await page.screenshot({
    path: `${output}/overview-desktop.png`,
    fullPage: true,
  });
  await clickText('과제 모아보기', '.study-view-nav a');
  await page.waitForSelector('.lms-task-page');
  assert.equal(
    await page.$eval('.page-heading h1', (e) => e.textContent),
    '과제 모아보기',
  );
  const rowCount = () =>
    page.$$eval(
      '.lms-task-page__list > .lms-task-page__group .lms-task-page__row',
      (e) => e.length,
    );
  assert.equal(await rowCount(), 9);
  assert.equal(
    await page.$$eval('.lms-task-page__row.is-complete', (rows) => rows.length),
    3,
    'current and archived complete rows remain accessible',
  );
  assert.ok(
    await page.$$eval('.lms-task-page__group', (groups) =>
      groups.some(
        (g) =>
          g.querySelector('h3')?.textContent === '이전 마감 · 완료' &&
          g.textContent.includes('문화 비교 보고서'),
      ),
    ),
  );
  assert.ok(
    await page.$$eval('.lms-task-page__group', (groups) =>
      groups.some(
        (g) =>
          g.querySelector('h3')?.textContent === '확인 필요' &&
          g.textContent.includes('쿼리 과제') &&
          !g.textContent.includes('지연'),
      ),
    ),
  );
  await clickText('완료', '.lms-task-page__filters button');
  assert.equal(
    await rowCount(),
    2,
    'uncertain submitted item must not be complete',
  );
  await clickText('확인 필요 1', '.lms-task-page__filters button');
  assert.equal(await rowCount(), 1);
  await clickText('오늘', '.lms-task-page__filters button');
  assert.equal(await rowCount(), 1);
  await clickText('전체', '.lms-task-page__filters button');
  const month = await page.$eval(
    '.lms-task-page__calendar',
    (e) => e.textContent,
  );
  await page.click('button[aria-label="다음 달"]');
  assert.notEqual(
    await page.$eval('.lms-task-page__calendar', (e) => e.textContent),
    month,
  );
  await page.click('button[aria-label="이전 달"]');
  await page.click('.lms-task-page__calendar-grid button.has-due');
  await page.waitForSelector('.lms-task-page__date-filter');
  assert.ok((await rowCount()) > 0);
  await clickText('날짜 해제');
  checks.push('과제 필터·확인 불가 상태·달력 이동·날짜 선택');
  await page.screenshot({
    path: `${output}/tasks-desktop.png`,
    fullPage: true,
  });
  for (const width of [1280, 768, 375, 320]) {
    await page.setViewport({ width, height: 950 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `tasks overflow ${width}`,
    );
    if (width === 375)
      await page.screenshot({
        path: `${output}/tasks-mobile.png`,
        fullPage: true,
      });
    await clickText('수업 현황', '.study-view-nav a');
    await page.waitForSelector('.study-overview');
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `overview overflow ${width}`,
    );
    if (width === 375)
      await page.screenshot({
        path: `${output}/overview-mobile.png`,
        fullPage: true,
      });
    await clickText('과제 모아보기', '.study-view-nav a');
    await page.waitForSelector('.lms-task-page');
    checks.push(`${width}px 가로 넘침 없음`);
  }
  await clickText('몰아듣기', '.study-view-nav button');
  await page.waitForSelector('.study-binge');
  assert.ok(await page.$('.study-binge .lms-task'));
  checks.push('기존 몰아듣기 유지');
  for (const state of ['empty', 'stale']) {
    const context = await browser.createBrowserContext();
    const statePage = await context.newPage();
    statePage.on('pageerror', (e) => errors.push(e.message));
    const stateProfile = {
      ...profile,
      lms:
        state === 'empty'
          ? undefined
          : {
              ...snapshot,
              fetchedAt: new Date(now - 3 * 86400e3).toISOString(),
            },
    };
    await statePage.evaluateOnNewDocument(
      (p) => localStorage.setItem('hansung-demo-v1', JSON.stringify(p)),
      stateProfile,
    );
    await statePage.goto(base, { waitUntil: 'networkidle0', timeout: 60000 });
    await statePage.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((e) => e.textContent.trim() === '연결 없이 둘러보기')
        ?.click(),
    );
    await statePage.evaluate(() => {
      location.hash = 'lms';
    });
    await statePage.waitForSelector(
      state === 'empty' ? '.lms-guide-head' : '.study-sync.needs-attention',
    );
    if (state === 'stale')
      assert.equal(
        await statePage.$eval('.study-sync h2', (e) => e.textContent),
        '업데이트 필요',
      );
    await context.close();
  }
  checks.push('데이터 없음·오래된 수집값 안내');
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/result.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (e) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error('Completed:', checks, 'Runtime:', errors);
  throw e;
} finally {
  await browser.close();
}
