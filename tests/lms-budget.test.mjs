import assert from 'node:assert/strict';
import { collectLms } from '../lib/server/lms.ts';
import { mergeLmsSnapshot } from '../lib/data/lms.ts';
import { SchoolError, SchoolSession } from '../lib/server/school.ts';
import { retrySchoolRead } from '../lib/server/school-retry.ts';

const auth = (html) => new Response(html + '<a href="/login/logout.php">logout</a>');
const emptyProgress = '<table class="user_progress_table"><thead><tr><th>주차</th><th>콘텐츠</th><th>시간</th><th>출석</th><th>주차 출석</th></tr></thead><tbody></tbody></table>';
const assignment = '<table class="generaltable"><tbody><tr><td class="cell c1"><a href="/mod/assign/view.php?id=1">fixture</a></td><td class="cell c2">-</td><td class="cell c3">제출 완료</td></tr></tbody></table>';
const waitForAbort = (signal) => new Promise((_, reject) => {
  const timer = setTimeout(() => reject(new Error('request was not cancelled')), 2000);
  const abort = () => { clearTimeout(timer); reject(new DOMException('cancelled', 'AbortError')); };
  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
});
let calls = 0;
const start = Date.now();
const slowHeaders = await collectLms({ request: async (_url, init) => { calls++; assert.ok(init.signal); return waitForAbort(init.signal); } }, [
  { id: '1', name: 'fixture' }, { id: '2', name: 'fixture' },
], { budgetMs: 200 });
assert.ok(Date.now() - start < 1500, 'header timeout must bound collection');
assert.equal(calls, 1, 'no new network request starts after deadline');
assert.ok(slowHeaders.courses[0].errors.includes('timeout-partial'));
assert.deepEqual(slowHeaders.courses[1].errors, ['timeout']);

const bodySession = { request: async (url, init) => {
  if (url.includes('user_progress')) return auth(emptyProgress);
  if (url.includes('mod/assign')) return auth(assignment);
  if (url.includes('mod/quiz')) {
    const signal = init.signal;
    return new Response(new ReadableStream({ start(controller) {
      const timer = setTimeout(() => controller.error(new Error('body was not cancelled')), 2000);
      signal.addEventListener('abort', () => { clearTimeout(timer); controller.error(new DOMException('cancelled', 'AbortError')); }, { once: true });
    } }));
  }
  return auth('');
} };
const partial = await collectLms(bodySession, [{ id: '1', name: 'fixture' }], { budgetMs: 200 });
assert.equal(partial.courses[0].assigns[0].submitted, true);
assert.ok(partial.courses[0].errors.includes('quiz'));
assert.ok(partial.courses[0].errors.includes('timeout-partial'));
const prior = { source: 'cosmos-lms', fetchedAt: '2026-09-01T00:00:00Z', courses: [{ id: '1', title: 'fixture', vods: [], assigns: [{ title: 'old', submitted: false }], quizzes: [{ title: 'old quiz', submitted: true }] }] };
const merged = mergeLmsSnapshot(prior, partial);
assert.equal(merged.courses[0].assigns[0].title, 'fixture', 'successful assignment survives partial timeout');
assert.equal(merged.courses[0].quizzes[0].title, 'old quiz', 'failed quiz keeps previous data');

const rangePrior = { source: 'cosmos-lms', fetchedAt: '2026-09-01T00:00:00Z', courses: [{ id: 'range', title: 'fixture',
  vods: [{ title: 'lecture', attended: false, range: '2026-09-01 ~ 2026-09-10', url: 'https://learn.hansung.ac.kr/mod/vod/view.php?id=1' }], assigns: [], quizzes: [] }] };
const rangePartial = await collectLms({ request: async (url) => {
  if (url.includes('course/view.php')) throw new Error('temporary range failure');
  if (url.includes('user_progress')) return auth('<table class="user_progress_table"><thead><tr><th>주차</th><th>콘텐츠</th><th>시간</th><th>출석</th><th>주차 출석</th></tr></thead><tbody><tr><td>1</td><td>lecture</td><td></td><td>O</td><td></td></tr></tbody></table>');
  return auth('<table class="generaltable"><tbody></tbody></table>');
} }, [{ id: 'range', name: 'fixture' }]);
assert.ok(rangePartial.courses[0].errors.includes('vod-range'), 'range-page failure must be visible');
// Test the merge separately with an unambiguous same-title item and new attendance.
rangePartial.courses[0].vods = [{ title: 'lecture', attended: true }];
const retainedRange = mergeLmsSnapshot(rangePrior, rangePartial).courses[0].vods[0];
assert.equal(retainedRange.attended, true, 'new attendance is kept');
assert.equal(retainedRange.range, '2026-09-01 ~ 2026-09-10', 'prior range is retained');
assert.equal(retainedRange.rangeRetainedAt, rangePrior.fetchedAt);
const ambiguous = structuredClone(rangePrior);
ambiguous.courses[0].vods.push({ ...ambiguous.courses[0].vods[0] });
assert.equal(mergeLmsSnapshot(ambiguous, rangePartial).courses[0].vods[0].range, undefined, 'duplicate titles must not be matched');

let requests = 0;
const manyCourses = Array.from({ length: 15 }, (_, i) => ({ id: String(i + 1), name: 'fixture' }));
const bounded = await collectLms({ request: async (url) => {
  requests++;
  if (url.includes('user_progress')) return auth(emptyProgress);
  return auth('<table class="generaltable"><tbody></tbody></table>');
} }, manyCourses);
assert.ok(requests <= 40, 'request budget must limit actual school calls');
assert.ok(bounded.courses.some((course) => course.errors.includes('budget')), 'unstarted courses must report budget exhaustion');

let assignCalls = 0;
const retryRecovered = await collectLms({ request: async (url) => {
  if (url.includes('user_progress')) return auth(emptyProgress);
  if (url.includes('mod/assign')) {
    if (++assignCalls === 1) throw new TypeError('fetch failed');
    return auth(assignment);
  }
  return auth('<table class="generaltable"><tbody></tbody></table>');
} }, [{ id: '1', name: 'fixture' }]);
assert.equal(assignCalls, 2, 'one transient GET failure is retried once');
assert.equal(retryRecovered.courses[0].assigns[0].submitted, true);
assert.ok(!retryRecovered.courses[0].errors.includes('assign'));

let limitedCalls = 0;
const rateLimited = await collectLms({ request: async (url) => {
  if (url.includes('user_progress')) return auth(emptyProgress);
  if (url.includes('mod/assign')) { limitedCalls++; throw new SchoolError('upstream', 429); }
  return auth('<table class="generaltable"><tbody></tbody></table>');
} }, [{ id: '1', name: 'fixture' }]);
assert.equal(limitedCalls, 1, '429 must not be retried');
assert.ok(rateLimited.courses[0].errors.includes('assign'));

const callsByCourse = new Map();
let totalRetriesTestCalls = 0;
const retryLimited = await collectLms({ request: async (url) => {
  totalRetriesTestCalls++;
  if (url.includes('user_progress')) return auth(emptyProgress);
  if (url.includes('mod/assign')) {
    const id = new URL(url).searchParams.get('id');
    const attempts = (callsByCourse.get(id) ?? 0) + 1;
    callsByCourse.set(id, attempts);
    if (attempts === 1) throw new SchoolError('upstream', 503);
    return auth(assignment);
  }
  return auth('<table class="generaltable"><tbody></tbody></table>');
} }, Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1), name: 'fixture' })));
assert.deepEqual([...callsByCourse.values()], [2, 2, 2, 1, 1], 'collection has at most three additional retries');
assert.ok(totalRetriesTestCalls <= 40);
assert.ok(retryLimited.courses[3].errors.includes('assign'));

const retryAbort = new AbortController();
let retryAttempts = 0;
const abortingRetry = retrySchoolRead(async () => { retryAttempts++; throw new TypeError('fetch failed'); }, () => true, retryAbort.signal);
setTimeout(() => retryAbort.abort(), 20);
await assert.rejects(abortingRetry);
assert.equal(retryAttempts, 1, 'cancellation prevents another attempt');

const originalFetch = globalThis.fetch;
try {
  const caller = new AbortController();
  let seen;
  globalThis.fetch = async (_url, init) => { seen = init.signal; return auth(''); };
  const session = new SchoolSession();
  await session.request('https://learn.hansung.ac.kr/', { signal: caller.signal });
  assert.equal(seen.aborted, false);
  caller.abort();
  assert.equal(seen.aborted, true, 'school fetch must honor caller cancellation');
  const bodyController = new AbortController();
  globalThis.fetch = async (_url, init) => new Response(new ReadableStream({ start(stream) {
    init.signal.addEventListener('abort', () => stream.error(new DOMException('cancelled', 'AbortError')), { once: true });
  } }));
  const response = await session.request('https://learn.hansung.ac.kr/', { signal: bodyController.signal });
  const body = response.text();
  bodyController.abort();
  await assert.rejects(body, /cancelled/);
  const redirectController = new AbortController();
  globalThis.fetch = async (_url, init) => waitForAbort(init.signal);
  const redirect = session.follow(new Response(null, { status: 302, headers: { Location: '/next' } }), 'https://learn.hansung.ac.kr/', redirectController.signal);
  setTimeout(() => redirectController.abort(), 20);
  await assert.rejects(redirect, /cancelled/);
} finally { globalThis.fetch = originalFetch; }
console.log('lms budget: header/body cancellation, unstarted courses and partial preservation passed');
