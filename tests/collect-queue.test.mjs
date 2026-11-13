import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await readFile('drizzle/0004_collect_queue.sql', 'utf8'));

const db = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async run() {
        return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } };
      },
    };
  },
};

const source = await readFile('lib/server/collect-queue.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const queue = {};
vm.runInNewContext(js, {
  exports: queue,
  require(name) {
    if (name === './account') return { database: () => db };
    throw new Error(`unexpected import: ${name}`);
  },
  Date, console,
});

const LIMIT = queue.COLLECT_CONCURRENCY;
const accounts = Array.from({ length: LIMIT + 3 }, (_, i) => `acc-${i}`);

// 슬롯 수만큼 admitted, 나머지는 queued + 오름차순 위치
const tickets = [];
for (const account of accounts) tickets.push(await queue.enterCollectQueue(account));
assert.equal(tickets.filter(t => t.state === 'admitted').length, LIMIT);
assert.deepEqual(
  tickets.slice(LIMIT).map(t => t.state),
  ['queued', 'queued', 'queued'],
);
assert.equal(tickets[LIMIT].position, 1);
assert.equal(tickets[LIMIT + 1].position, 2);
assert.equal(tickets[LIMIT + 2].position, 3);

// queuePosition — 슬롯이 가득이면 waiting, 앞에 슬롯이 비면 ready로 바뀐다
const state = (s) => `${s?.status}:${s?.position}`;
assert.equal(state(await queue.queuePosition(accounts[LIMIT])), 'waiting:1');
assert.equal(state(await queue.queuePosition(accounts[LIMIT + 1])), 'waiting:2');
await queue.leaveCollectQueue(accounts[0]);
assert.equal(state(await queue.queuePosition(accounts[LIMIT])), 'ready:1');
assert.equal(state(await queue.queuePosition(accounts[LIMIT + 1])), 'waiting:2');

// 해제된 슬롯으로 다음 순번이 승인됨 — enterCollectQueue 재호출 시 admitted
assert.equal((await queue.enterCollectQueue(accounts[LIMIT])).state, 'admitted');
// 여전히 가득 — 다음 계정은 queued 유지
assert.equal((await queue.enterCollectQueue(accounts[LIMIT + 1])).state, 'queued');

// running 상태에서 동일 계정 재요청 → 중복 수집 대신 'running'
const dup = await queue.enterCollectQueue(accounts[LIMIT]);
assert.equal(dup.state, 'running');

// stale running은 슬롯을 영구 점유하지 않는다 — sweep이 회수
const runningNow = Date.now() - 200_000;
sqlite.prepare("UPDATE collect_queue SET heartbeat = ? WHERE status = 'running'").run(runningNow);
const next = await queue.enterCollectQueue(accounts[LIMIT + 1]);
assert.equal(next.state, 'admitted');

// 완료 후 cooldown — 동일 계정 즉시 재수집은 cooldown
for (const a of accounts) await queue.abandonCollectQueue(a);
await queue.enterCollectQueue('cool');
await queue.leaveCollectQueue('cool');
const again = await queue.enterCollectQueue('cool');
assert.equal(again.state, 'cooldown');
assert.ok(again.retryAfterMs > 0);

// 쿨다운이 지나면 다시 admitted
sqlite.prepare("UPDATE collect_queue SET finished_at = ? WHERE account_id = 'cool'").run(Date.now() - 61_000);
assert.equal((await queue.enterCollectQueue('cool')).state, 'admitted');
await queue.abandonCollectQueue('cool');

// abandon은 cooldown을 남기지 않는다 — 세션 만료로 수집이 안 된 경우 재시도 가능
await queue.enterCollectQueue('abandoned');
await queue.abandonCollectQueue('abandoned');
assert.equal((await queue.enterCollectQueue('abandoned')).state, 'admitted');
await queue.abandonCollectQueue('abandoned');

// 죽은 대기자는 줄을 막지 않는다 — waiting heartbeat이 오래되면 sweep이 지우고 뒤가 진출
for (let i = 0; i < LIMIT; i++) await queue.enterCollectQueue(`fill-${i}`);
assert.equal((await queue.enterCollectQueue('dead-head')).state, 'queued');
assert.equal((await queue.enterCollectQueue('behind')).state, 'queued');
sqlite.prepare("UPDATE collect_queue SET heartbeat = ? WHERE account_id = 'dead-head'").run(Date.now() - 130_000);
await queue.leaveCollectQueue('fill-0');
const behind = await queue.enterCollectQueue('behind');
assert.equal(behind.state, 'admitted', 'dead head should not block the line');

console.log('collect-queue.test: concurrency limit, fairness, stale sweep, cooldown and abandon passed');
