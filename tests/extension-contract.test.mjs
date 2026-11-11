import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const backgroundSource = await readFile('extension/background.js', 'utf8');
const bridgeSource = await readFile('extension/app-bridge.js', 'utf8');
const contentSource = await readFile('extension/content.js', 'utf8');
const payload = {
  source: 'cosmos-lms',
  fetchedAt: '2026-10-26T00:00:00.000Z',
  courses: [{ id: '1', title: '테스트', vods: [], assigns: [], quizzes: [] }],
};

async function backgroundHarness(scriptResult) {
  const storage = {};
  const warnings = [];
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
        return [{ result: await (typeof scriptResult === 'function' ? scriptResult() : scriptResult) }];
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
    console: { warn(...args) { warnings.push(args); } },
    setTimeout: (fn) => globalThis.setTimeout(fn, 0),
    clearTimeout,
  });
  const send = (message) =>
    new Promise((resolve) => messageListener(message, {}, resolve));
  return { send, storage, warnings, scriptStarted };
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

const privateErrorWorker = await backgroundHarness({ error: 'student=private&cookie=secret' });
const privateError = await privateErrorWorker.send({ type: 'hsu-refresh', force: true });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(privateError.error, 'collect-failed');
assert.equal(privateErrorWorker.storage.hsuLmsErr?.error, 'collect-failed');
assert.ok(!JSON.stringify(privateErrorWorker.storage).includes('secret'));
assert.ok(!JSON.stringify(privateErrorWorker.warnings).includes('secret'));

const thrownErrorWorker = await backgroundHarness(() => { throw new Error('student=private&cookie=secret'); });
assert.equal((await thrownErrorWorker.send({ type: 'hsu-refresh', force: true })).error, 'collect-failed');

// The manual collection button also runs on school pages. Its diagnostic error
// includes the page path; it must not print that path or other exception data.
let manualButton;
const manualErrors = [];
const manualDocument = {
  readyState: 'complete',
  body: { appendChild: (button) => { manualButton = button; } },
  getElementById: () => null,
  createElement: () => ({ style: {} }),
  querySelectorAll: () => [],
};
vm.runInNewContext(contentSource, {
  window: {}, document: manualDocument, location: { pathname: '/private-student' },
  DOMParser: class {}, console: { error: (...args) => manualErrors.push(args) },
  setTimeout: () => 1,
});
await manualButton.onclick();
assert.ok(!JSON.stringify(manualErrors).includes('private-student'));
assert.match(manualButton.textContent, /과목 인식 실패/);

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

// An old completion must neither satisfy a new request nor clear the new in-flight job.
let finishOld, finishNew;
const oldResult = new Promise((resolve) => (finishOld = resolve));
const newResult = new Promise((resolve) => (finishNew = resolve));
let calls = 0;
const isolated = await backgroundHarness(() => (++calls === 1 ? oldResult : newResult));
const oldRequest = isolated.send({ type: 'hsu-refresh', force: true });
await isolated.scriptStarted;
await isolated.send({ type: 'hsu-clear-cache' });
const newRequest = isolated.send({ type: 'hsu-refresh', force: true });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(calls, 2);
finishOld({ payload });
assert.equal((await oldRequest).error, 'cache-cleared');
const sharedNewRequest = isolated.send({ type: 'hsu-refresh', force: true });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(calls, 2);
const newPayload = { ...payload, courses: [{ id: 'new-account' }] };
finishNew({ payload: newPayload });
assert.deepEqual(JSON.parse(JSON.stringify((await newRequest).payload)), newPayload);
assert.deepEqual(JSON.parse(JSON.stringify((await sharedNewRequest).payload)), newPayload);
assert.deepEqual(JSON.parse(JSON.stringify(isolated.storage.hsuLms)), newPayload);

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
