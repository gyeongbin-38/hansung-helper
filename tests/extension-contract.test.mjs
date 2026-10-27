import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const backgroundSource = await readFile('extension/background.js', 'utf8');
const bridgeSource = await readFile('extension/app-bridge.js', 'utf8');
const payload = {
  source: 'cosmos-lms',
  fetchedAt: '2026-10-26T00:00:00.000Z',
  courses: [{ id: '1', title: '테스트', vods: [], assigns: [], quizzes: [] }],
};

async function backgroundHarness(scriptResult) {
  const storage = {};
  let messageListener;
  let markScriptStarted;
  const scriptStarted = new Promise((resolve) => (markScriptStarted = resolve));
  const chrome = {
    runtime: { onMessage: { addListener: (listener) => (messageListener = listener) } },
    tabs: {
      query: async () => [],
      create: async () => ({ id: 7, url: 'https://learn.hansung.ac.kr/my/' }),
      get: async () => ({ status: 'complete' }),
      remove: async () => {},
    },
    scripting: {
      executeScript: async () => {
        markScriptStarted();
        return [{ result: await scriptResult }];
      },
    },
    storage: {
      session: {
        get: async (keys) => Object.fromEntries(keys.map((key) => [key, storage[key]])),
        set: async (values) => Object.assign(storage, values),
        remove: async (keys) => keys.forEach((key) => delete storage[key]),
      },
    },
    alarms: {
      get: (_name, callback) => callback(null),
      create: () => {},
      onAlarm: { addListener: () => {} },
    },
  };
  vm.runInNewContext(backgroundSource, {
    chrome,
    URL,
    Date,
    Promise,
    console: { warn() {} },
    setTimeout: (fn) => globalThis.setTimeout(fn, 0),
    clearTimeout,
  });
  const send = (message) =>
    new Promise((resolve) => messageListener(message, {}, resolve));
  return { send, storage, scriptStarted };
}

const successWorker = await backgroundHarness({ payload });
const success = await successWorker.send({ type: 'hsu-refresh', force: true });
assert.equal(success.ok, true);
assert.deepEqual(JSON.parse(JSON.stringify(success.payload)), payload);
assert.deepEqual(JSON.parse(JSON.stringify(successWorker.storage.hsuLms)), payload);

const failureWorker = await backgroundHarness({ error: 'cosmos-login-required' });
const failure = await failureWorker.send({ type: 'hsu-refresh', force: true });
assert.deepEqual(JSON.parse(JSON.stringify(failure)), {
  ok: false,
  error: 'cosmos-login-required',
});

const cleared = await successWorker.send({ type: 'hsu-clear-cache' });
assert.equal(cleared.ok, true);
assert.equal(successWorker.storage.hsuLms, undefined);
assert.equal(successWorker.storage.hsuLmsAt, undefined);

let finishLateCollection;
const pendingCollection = new Promise((resolve) => (finishLateCollection = resolve));
const switchingWorker = await backgroundHarness(pendingCollection);
const oldCollection = switchingWorker.send({ type: 'hsu-refresh', force: true });
await switchingWorker.scriptStarted;
await switchingWorker.send({ type: 'hsu-clear-cache' });
finishLateCollection({ payload });
assert.deepEqual(JSON.parse(JSON.stringify(await oldCollection)), {
  ok: false,
  error: 'cache-cleared',
});
assert.equal(switchingWorker.storage.hsuLms, undefined);

async function bridgeHarness(refreshResult) {
  const messages = [];
  let listener;
  const window = {
    postMessage: (message) => messages.push(message),
    addEventListener: (_name, callback) => (listener = callback),
  };
  const chrome = {
    runtime: {
      getManifest: () => ({ version: 'test' }),
      lastError: null,
      sendMessage(message, callback) {
        if (message.type === 'hsu-get-cache') callback({ payload: null, at: null });
        else callback(refreshResult);
      },
    },
  };
  vm.runInNewContext(bridgeSource, {
    window,
    chrome,
    location: { origin: 'https://hansung-helper.example' },
    setTimeout: () => 1,
    clearTimeout() {},
  });
  listener({
    source: window,
    origin: 'https://hansung-helper.example',
    data: { type: 'hsu-lms-refresh-request', force: true },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return messages;
}

const forwarded = await bridgeHarness({ ok: true, payload });
assert.ok(forwarded.some((message) => message.type === 'hsu-lms-import'));
const rejected = await bridgeHarness({ ok: false, error: 'cosmos-login-required' });
assert.ok(
  rejected.some(
    (message) =>
      message.type === 'hsu-lms-status' &&
      message.status === 'failed' &&
      message.error === 'cosmos-login-required',
  ),
);

console.log('extension-contract.test: collection, storage, bridge, failure, and cache clear passed');
