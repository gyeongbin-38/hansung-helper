import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchTextWithRetry, writeSnapshotAtomic } from '../scripts/crawl-utils.mts';

test('retries transient responses and returns the successful body', async () => {
  let calls = 0;
  const fetcher = async () => ++calls < 3 ? new Response('', { status: 503 }) : new Response('ok');
  assert.equal(await fetchTextWithRetry('https://example.test', {}, { fetcher, delayMs: 0 }), 'ok');
  assert.equal(calls, 3);
});

test('retries an HTTP 408 timeout', async () => {
  let calls = 0;
  const fetcher = async () => ++calls === 1 ? new Response('', { status: 408 }) : new Response('ok');
  assert.equal(await fetchTextWithRetry('https://example.test', {}, { fetcher, delayMs: 0 }), 'ok');
  assert.equal(calls, 2);
});

test('does not retry permanent errors and stops after bounded transient errors', async () => {
  let calls = 0;
  await assert.rejects(fetchTextWithRetry('https://example.test', {}, { delayMs: 0, fetcher: async () => { calls++; return new Response('', { status: 404 }); } }), /404/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(fetchTextWithRetry('https://example.test', {}, { delayMs: 0, fetcher: async () => { calls++; throw new Error('network'); } }), /network/);
  assert.equal(calls, 3);
});

test('snapshot replacement preserves previous file on serialization failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hansung-crawl-'));
  try {
    const path = join(dir, 'snapshot.json');
    await writeFile(path, 'previous');
    const cyclic = {}; cyclic.self = cyclic;
    await assert.rejects(writeSnapshotAtomic(pathToFileURL(path), cyclic));
    assert.equal(await readFile(path, 'utf8'), 'previous');
    await writeSnapshotAtomic(pathToFileURL(path), { value: 1 });
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { value: 1 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
