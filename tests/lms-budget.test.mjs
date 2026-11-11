import assert from 'node:assert/strict';
import { collectLms } from '../lib/server/lms.ts';
import { mergeLmsSnapshot } from '../lib/data/lms.ts';
import { SchoolSession } from '../lib/server/school.ts';

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

let requests = 0;
const manyCourses = Array.from({ length: 15 }, (_, i) => ({ id: String(i + 1), name: 'fixture' }));
const bounded = await collectLms({ request: async (url) => {
  requests++;
  if (url.includes('user_progress')) return auth(emptyProgress);
  return auth('<table class="generaltable"><tbody></tbody></table>');
} }, manyCourses);
assert.ok(requests <= 40, 'request budget must limit actual school calls');
assert.ok(bounded.courses.some((course) => course.errors.includes('budget')), 'unstarted courses must report budget exhaustion');

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
