import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const source = ts.transpileModule(await readFile('lib/server/account.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, { exports, require: () => ({ env: {} }), Uint8Array, TextDecoder, setTimeout, clearTimeout });
const read = exports.readTextLimited;
const request = (body, signal) => new Request('https://app.test/api/account/login', { method: 'POST', body, signal, duplex: 'half' });
assert.equal(await read(request('한글'), 6), '한글');
await assert.rejects(read(request('한글'), 5), error => error.status === 413);
let cancelled = false;
const slow = new ReadableStream({ cancel() { cancelled = true; } });
await assert.rejects(read(request(slow), 100, 10), error => error.status === 408);
assert(cancelled);
let interval;
const drip = new ReadableStream({
  start(controller) { interval = setInterval(() => controller.enqueue(new Uint8Array([65])), 2); },
  cancel() { clearInterval(interval); },
});
await assert.rejects(read(request(drip), 10000, 15), error => error.status === 408, 'dripping does not reset the total deadline');
const controllers = Array.from({ length: 32 }, () => new AbortController());
const pending = controllers.map(controller => read(request(new ReadableStream(), controller.signal), 100, 1000));
await assert.rejects(read(request(new ReadableStream()), 100), error => error.status === 429);
for (const controller of controllers) controller.abort();
const results = await Promise.allSettled(pending);
assert(results.every(result => result.status === 'rejected' && result.reason.status === 408));
assert.equal(await read(request('ok'), 10), 'ok', 'aborted reads release capacity');
console.log('request body budgets: bytes, total deadline, slow drip, cancellation and 32-reader cap passed');
