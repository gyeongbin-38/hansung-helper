import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await readFile('drizzle/0000_academic_accounts.sql', 'utf8'));
const db = { prepare(query) { let args; return {
  bind(...values) { args = values; return this; },
  async first() { return sqlite.prepare(query).get(...args) ?? null; },
  async run() { return { meta: { changes: Number(sqlite.prepare(query).run(...args).changes) } }; },
}; } };
let now = Date.now();
class Clock extends Date { static now() { return now; } }
const js = ts.transpileModule(await readFile('lib/server/work-capacity.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function instance() {
  const exports = {};
  vm.runInNewContext(js, { exports, require: () => ({ database: () => db }), crypto: webcrypto, Date: Clock });
  return exports;
}
const a = instance(), b = instance();
const burst = await Promise.all(Array.from({ length: 50 }, (_, i) => (i % 2 ? a : b).acquireWork('advisor', `account-${i}`)));
const accepted = burst.filter(Boolean);
assert.equal(accepted.length, 3, '50 simultaneous attempts across instances admit only three');
for (const lease of accepted) await a.releaseWork(lease);
const old = await a.acquireWork('advisor', 'same');
assert.equal(await b.acquireWork('advisor', 'same'), null, 'same account cannot acquire twice');
now += 60001;
const replacement = await b.acquireWork('advisor', 'same');
assert(replacement);
await a.releaseWork(old);
assert.equal(await a.acquireWork('advisor', 'same'), null, 'late completion cannot release replacement lease');
await b.releaseWork(replacement);
for (let i = 0; i < 3; i++) await a.advisorTransportFailed();
assert.equal(await b.acquireWork('advisor', 'outage'), null);
await b.advisorTransportRecovered();
assert.equal(await a.acquireWork('advisor', 'stale-success'), null, 'old success cannot clear open breaker');
now += 30001;
const probe = await a.acquireWork('advisor', 'probe');
assert(probe);
assert.equal(await b.acquireWork('advisor', 'second-probe'), null, 'only one half-open probe');
await a.advisorTransportFailed();
await a.releaseWork(probe);
assert.equal(await b.acquireWork('advisor', 'still-outage'), null, 'failed probe reopens circuit');
now += 30001;
const recovered = await b.acquireWork('advisor', 'recovered');
await b.advisorTransportRecovered();
await b.releaseWork(recovered);
assert(await a.acquireWork('advisor', 'normal'));
const logins = await Promise.all(Array.from({ length: 10 }, (_, i) => b.acquireWork('school-login', `login-${i}`)));
assert.equal(logins.filter(Boolean).length, 3, 'school logins have a separate bounded pool');
sqlite.close();
console.log('shared work budgets: concurrent admission, per-account cap, expiry, fencing and circuit recovery passed');
