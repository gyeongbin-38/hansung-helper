/** Synthetic browser QA for settings. Start the demo dev server; no school account or D1 is used. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const driver = process.env.FRONTEND_QA_DRIVER;
const { default: puppeteer } = await import(
  driver ? pathToFileURL(path.resolve(driver)).href : 'puppeteer-core'
);
const base = process.env.FRONTEND_QA_URL || 'http://127.0.0.1:4339';
const output = path.resolve('outputs/settings-qa');
await mkdir(output, { recursive: true });
const now = Date.parse('2026-11-08T14:30:00Z');
const profile = {
  name: '설정 검증',
  dept: '컴퓨터공학부',
  year: '2024',
  credits: '12',
  points: '',
  saved: [],
  planned: [],
  completed: [
    { code: 'manual', name: '직접 입력 과목', category: '전선', credits: 3 },
  ],
  prefs: [],
  readIds: [],
  ruleOverrides: {},
  events: [],
  consent: false,
};
const infoData = {
  source: 'info-hansung',
  fetchedAt: new Date(now).toISOString(),
  completed: [
    { code: 'school', name: '학교 이수 과목', category: '전선', credits: 3 },
  ],
  credits: 24,
  diag: { menu: [], pages: [{ slot: 'audit', path: '/', ok: false }] },
};
const lmsData = {
  source: 'cosmos-lms',
  fetchedAt: new Date(now - 2 * 86400000).toISOString(),
  courses: [
    { id: 'qa', title: '검증 과목', vods: [], assigns: [], quizzes: [] },
  ],
};
const activities = {
  source: 'hsportal',
  sourceUrl: 'https://hsportal.hansung.ac.kr/',
  fetchedAt: new Date(now).toISOString(),
  itemCount: 0,
  items: [],
};
const schedule = {
  source: 'hansung-homepage',
  sourceUrl: 'https://www.hansung.ac.kr/',
  fetchedAt: new Date(now).toISOString(),
  eventCount: 0,
  items: [],
};
const results = [],
  errors = [];
const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
try {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateTimezone('America/Los_Angeles');
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.evaluateOnNewDocument(
    (profile, now) => {
      Date.now = () => now;
      if (!localStorage.getItem('settings-qa-seeded')) {
        localStorage.setItem(
          'hansung-demo-v1',
          JSON.stringify({ ...profile, name: '별도 체험' }),
        );
        localStorage.setItem('hsu-side-collapsed', '1');
        localStorage.setItem('settings-qa-seeded', '1');
      }
    },
    profile,
    now,
  );
  let signedIn = true,
    publicFailure = true,
    deleteFailure = true;
  let deleteRequests = 0,
    logoutRequests = 0,
    publicRequests = 0;
  let snapshot = {
    portal: 'connected',
    lms: 'connected',
    courses: [],
    checkedAt: new Date(now).toISOString(),
    courseScope: 'fixture',
    infoData,
    lmsData,
  };
  let dialogAccept = false;
  page.on(
    'dialog',
    (dialog) => void (dialogAccept ? dialog.accept() : dialog.dismiss()),
  );
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    const reply = (status, data) =>
      request.respond({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200
            ? { ok: true, data }
            : { ok: false, error: { code: 'FIXTURE', message: '검증용 응답' } },
        ),
      });
    if (pathname === '/api/account' && request.method() === 'GET') {
      void reply(signedIn ? 200 : 401, {
        profile,
        snapshot,
        onboarded: true,
        studentMask: '검증용 계정',
      });
    } else if (pathname === '/api/account' && request.method() === 'DELETE') {
      deleteRequests++;
      setTimeout(() => {
        if (!deleteFailure) signedIn = false;
        void reply(deleteFailure ? 503 : 200, { deleted: true });
      }, 500);
    } else if (pathname === '/api/account/logout') {
      logoutRequests++;
      signedIn = false;
      void reply(200, {});
    } else if (pathname === '/api/activities') {
      publicRequests++;
      void reply(publicFailure ? 503 : 200, activities);
    } else if (pathname === '/api/schedule') {
      void reply(200, schedule);
    } else void request.continue();
  });
  let visit = 0;
  async function visitSettings() {
    await page.goto(base + `/?settingsQa=${++visit}#settings`, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    await page.waitForSelector('.settings');
    await page.evaluate(() =>
      document.querySelector('.cookie button')?.click(),
    );
  }
  async function click(text, scope = '.settings button') {
    assert.ok(
      await page.evaluate(
        (text, scope) => {
          const button = [...document.querySelectorAll(scope)].find(
            (el) => el.textContent.trim() === text,
          );
          if (!button) return false;
          button.click();
          return true;
        },
        text,
        scope,
      ),
      `missing action: ${text}`,
    );
  }
  await visitSettings();
  const cardText = () =>
    page.$$eval('.connection-card', (cards) =>
      cards.map((card) => card.textContent),
    );
  let cards = await cardText();
  assert.ok(cards[0].includes('일부 항목 확인 필요'));
  assert.ok(cards[0].includes('확인 필요: 졸업가사정표'));
  assert.ok(cards[1].includes('현재 정보 재확인 필요'));
  assert.ok(cards[0].includes('23:30 KST'));
  results.push('부분 수집·오래된 수업·한국 수집 시각 구분');
  publicFailure = false;
  const requested = publicRequests;
  await click('비교과 다시 불러오기');
  await page.waitForFunction(() =>
    document
      .querySelectorAll('.connection-card')[2]
      .textContent.includes('수집본 있음'),
  );
  assert.ok(publicRequests > requested);
  results.push('공개 자료 API 실패 후 다시 불러오기');

  await page.click('.settings-storage > details > summary');
  const text = await page.$eval('.settings-storage', (el) => el.textContent);
  assert.ok(text.includes('직접 입력한 이수 과목'));
  assert.ok(text.includes('학교에서 수집한 이수 과목'));
  assert.ok(text.includes('수정 가능한 프로필'));
  assert.ok(text.includes('학교에서 빈칸을 채운 값'));
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewport({ width, height: 1100 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${width}px overflow`,
    );
    await page.screenshot({
      path: path.join(output, `settings-${width}.png`),
      fullPage: true,
    });
  }
  assert.equal(
    await page.$$eval(
      '.settings button a, .settings a button',
      (items) => items.length,
    ),
    0,
  );
  results.push(
    '학교·직접 입력·계산 정보와 보관 위치 구분, 320~1440px 넘침 없음',
  );

  await click('수업 확인·다시 가져오기');
  await page.waitForFunction(() => location.hash === '#lms');
  await page.waitForSelector('.lms-band');
  results.push('설정에서 실제 수업 현황으로 이동');

  snapshot = { ...snapshot, infoData: undefined, lmsData: undefined };
  await visitSettings();
  cards = await cardText();
  assert.ok(cards[0].includes('가져온 정보 없음'));
  assert.ok(cards[1].includes('가져온 정보 없음'));
  snapshot = {
    ...snapshot,
    infoPending: true,
    lmsPending: true,
    checkedAt: new Date(now - 180000).toISOString(),
  };
  await visitSettings();
  cards = await cardText();
  assert.ok(cards[0].includes('수집 상태 확인 필요'));
  assert.ok(cards[1].includes('수집 상태 확인 필요'));
  snapshot = {
    ...snapshot,
    infoPending: false,
    lmsPending: false,
    infoFailedAt: new Date(now).toISOString(),
    lmsFailedAt: new Date(now).toISOString(),
    infoData,
    lmsData,
  };
  await visitSettings();
  cards = await cardText();
  assert.ok(
    cards[0].includes('최근 수집 실패') &&
      cards[0].includes('기존에 가져온 정보'),
  );
  results.push('인증만 된 상태·지연·실패와 기존 수집본을 구분');

  await click('내 계정 자료 삭제');
  assert.equal(deleteRequests, 0);
  assert.ok(await page.$('.settings'));
  dialogAccept = true;
  await click('체험 데이터 초기화');
  await page.waitForFunction(
    () => localStorage.getItem('hansung-demo-v1') === null,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('hsu-side-collapsed')),
    '1',
  );
  assert.equal(deleteRequests, 0);
  assert.ok(await page.$('.settings'));
  results.push('계정 삭제 취소·체험 초기화가 계정과 화면 설정을 보존');

  await page.evaluate(() => {
    const button = [...document.querySelectorAll('.settings button')].find(
      (el) => el.textContent.trim() === '내 계정 자료 삭제',
    );
    button.click();
    button.click();
  });
  await page.waitForSelector('.settings-removal button:disabled');
  assert.ok(await page.$eval('.settings-removal button', (el) => el.disabled));
  await page.waitForFunction(() =>
    document.body.textContent.includes('삭제하지 못했습니다.'),
  );
  assert.ok(await page.$('.settings'));
  await page.waitForFunction(
    () => !document.querySelector('.settings-removal button').disabled,
  );
  assert.equal(deleteRequests, 1);
  results.push('삭제 실패 시 화면 유지·요청 중 중복 조작 차단·재시도 가능');

  await page.evaluate(
    (profile) =>
      localStorage.setItem('hansung-demo-v1', JSON.stringify(profile)),
    profile,
  );
  deleteFailure = false;
  await click('내 계정 자료 삭제');
  await page.waitForSelector('.auth-panel');
  assert.ok(await page.evaluate(() => localStorage.getItem('hansung-demo-v1')));
  assert.equal(deleteRequests, 2);
  results.push('계정 삭제 성공 시 로그인 화면으로 이동·별도 체험 기록 보존');

  signedIn = true;
  await visitSettings();
  const previousDeletes = deleteRequests;
  await click('이 브라우저에서 로그아웃');
  await page.waitForSelector('.auth-panel');
  assert.equal(logoutRequests, 1);
  assert.equal(deleteRequests, previousDeletes);
  assert.ok(await page.evaluate(() => localStorage.getItem('hansung-demo-v1')));
  results.push('로그아웃은 계정 삭제 요청 없이 종료·체험 기록 유지');
  await click('연결 없이 둘러보기', 'button');
  await page.evaluate(() => {
    location.hash = 'settings';
  });
  await page.waitForSelector('.settings');
  assert.ok(
    (await page.$eval('.settings-storage', (el) => el.textContent)).includes(
      '이 브라우저 · 체험 모드',
    ),
  );
  assert.equal(
    await page.$$('.settings-removal > .between').then((items) => items.length),
    0,
  );
  results.push('체험 모드에서 보관 위치 안내·계정 삭제 조작 미노출');

  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, 'result.json'),
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ passed: results.length, results, errors }, null, 2),
  );
} finally {
  await browser.close();
}
