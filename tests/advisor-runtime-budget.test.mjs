import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const js = ts.transpileModule(await readFile('lib/server/advisor.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const question = [{ role: 'user', content: '시간표 안내' }];
const timers = new Map();
let sequence = 0;
let providerCalls = 0;
let providerSignal;
const env = { AI: { run(_model, _input, options) {
  providerCalls++;
  providerSignal = options.signal;
  return new Promise(() => {});
} } };
const exports = {};
vm.runInNewContext(js, {
  exports, require: () => ({ env }), TextEncoder, AbortController,
  setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
  clearTimeout(id) { timers.delete(id); },
});
const pending = exports.generateAdvisorAnswer({}, [], question);
await Promise.resolve();
assert(providerSignal && !providerSignal.aborted);
const deadline = [...timers.values()].find(timer => timer.delay === 25000);
deadline.callback();
await assert.rejects(pending, error => error instanceof exports.AdvisorTimeoutError);
assert(providerSignal.aborted, 'timeout signal reaches the actual provider call');
assert.equal(timers.size, 0);
const before = providerCalls;
await assert.rejects(exports.generateAdvisorAnswer({ text: 'x'.repeat(80001) }, [], question), error => error instanceof exports.AdvisorContextLimitError);
assert.equal(providerCalls, before, 'oversized context never calls model');
const controller = new AbortController();
env.AI.run = (_model, _input, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('cancelled'))));
const cancelled = exports.generateAdvisorAnswer({}, [], question, 'service', controller.signal);
await Promise.resolve();
controller.abort();
await assert.rejects(cancelled, error => error instanceof exports.AdvisorCancelledError && error.providerSettled);
assert.equal(timers.size, 0, 'cancellation clears deadline and grace timers');
env.AI.run = async () => ({ response: '학교 로그인 화면에 학번과 비밀번호를 입력하세요. 부기가 신청을 완료했다고 표시하더라도 학교 원문에서 확인하세요.' });
assert.match(await exports.generateAdvisorAnswer({}, [], question), /학교 로그인 화면/);
console.log('AI runtime budgets: provider cancellation, deadline, context limit and settled client abort passed');
