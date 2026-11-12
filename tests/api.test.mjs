import assert from 'node:assert/strict';
import { apiData, apiFetch, ApiRequestError, setAccountContext } from '../lib/data/api.ts';

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
}

console.log('api.test: envelope, auth error, invalid response, and timeout passed');
