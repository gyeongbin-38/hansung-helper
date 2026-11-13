import assert from 'node:assert/strict';
import { apiData, apiFetch, ApiRequestError, setAccountContext, shouldResetSession } from '../lib/data/api.ts';

const data = { value: 42 };
assert.deepEqual(await apiData(new Response(JSON.stringify({ ok: true, data }))), data);

await assert.rejects(
  apiData(
    new Response(
      JSON.stringify({
        ok: false,
        error: { code: 'AUTH_REQUIRED', message: '다시 로그인해 주세요.' },
      }),
      { status: 401 },
    ),
  ),
  (error) =>
    error instanceof ApiRequestError &&
    error.code === 'AUTH_REQUIRED' &&
    error.status === 401,
);

await assert.rejects(
  apiData(new Response('not json')),
  (error) => error instanceof ApiRequestError && error.code === 'INVALID_RESPONSE',
);
const abortedBody = new Response(new ReadableStream({ start(controller) { controller.error(new DOMException('aborted', 'AbortError')); } }));
await assert.rejects(apiData(abortedBody), (error) => error instanceof ApiRequestError && error.code === 'TIMEOUT');
await assert.rejects(
  apiData(
    new Response(JSON.stringify({ ok: true, data }), { status: 503 }),
  ),
  (error) => error instanceof ApiRequestError && error.status === 503,
);

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
try {
  let headers;
  globalThis.fetch = async (_input, init) => { headers = init.headers; return new Response(); };
  setAccountContext('fixture-context');
  await apiFetch('/api/account/profile', { method: 'PUT' });
  assert.equal(headers.get('X-Hansung-Session-Context'), 'fixture-context');
  await apiFetch('/api/account/login', { method: 'POST' });
  assert.equal(headers.get('X-Hansung-Session-Context'), null);
  await apiFetch('/api/activities');
  assert.equal(headers.get('X-Hansung-Session-Context'), null);
  setAccountContext(null);
  await apiFetch('/api/account/profile', { method: 'PUT' });
  assert.equal(headers.get('X-Hansung-Session-Context'), null);
  const browser = new EventTarget();
  globalThis.window = browser;
  let invalidations = 0;
  browser.addEventListener('hansung-session-invalid', () => { invalidations += 1; });
  setAccountContext('session-a');
  globalThis.fetch = async () => new Response(null, { status: 401 });
  await apiFetch('/api/account/lms-refresh', { method: 'POST' });
  assert.equal(invalidations, 0, 'school credential rejection does not end the app session');
  globalThis.fetch = async () => new Response(null, { status: 401, headers: { 'X-Hansung-Session-Invalid': '1' } });
  await apiFetch('/api/account/lms-refresh', { method: 'POST' });
  assert.equal(invalidations, 1, 'refresh can identify an invalid app session separately');
  globalThis.fetch = async () => new Response(null, { status: 401 });
  await apiFetch('/api/account/profile', { method: 'PUT' });
  assert.equal(invalidations, 2, 'rejected app session requires recovery');
  let finish;
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  const oldRequest = apiFetch('/api/account/profile', { method: 'PUT' });
  setAccountContext('session-b');
  finish(new Response(null, { status: 401 }));
  await oldRequest;
  assert.equal(invalidations, 2, 'late rejection from an older session does not clear the new one');
  globalThis.fetch = async () => new Response(null, { status: 401, headers: { 'X-Hansung-School-Session': 'expired' } });
  await apiFetch('/api/account/lms-refresh-session', { method: 'POST' });
  assert.equal(invalidations, 2, 'expired school vault keeps the application session');
  globalThis.fetch = async () => new Response(null, { status: 401, headers: { 'X-Hansung-Session-Invalid': '1' } });
  await apiFetch('/api/account/lms-refresh-session');
  assert.equal(invalidations, 3, 'vault status rejects an expired application session explicitly');
  assert.equal(shouldResetSession('session-ended', 'session-a', 'session-b'), false);
  assert.equal(shouldResetSession('session-ended', 'session-b', 'session-b'), true);
  assert.equal(shouldResetSession('session-ended', undefined, 'session-b'), true);
  assert.equal(shouldResetSession('session-changed', 'session-a', 'session-b'), true);
  assert.equal(shouldResetSession('session-changed', 'session-b', 'session-b'), false);
  globalThis.fetch = async () => {
    throw new DOMException('timed out', 'TimeoutError');
  };
  await assert.rejects(
    apiFetch('/api/test'),
    (error) => error instanceof ApiRequestError && error.code === 'TIMEOUT',
  );
} finally {
  setAccountContext(null);
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

console.log('api.test: envelope, auth error, invalid response, and timeout passed');
