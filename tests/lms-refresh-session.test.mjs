import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile('app/api/account/lms-refresh-session/route.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

let signedIn = true;
let configured = true;
let loaded = {
  cookies: { 'info.hansung.ac.kr': { JSESSIONID: 'fixture' } },
  revision: { appSessionHash: 'token', createdAt: Date.now(), expiresAt: Date.now() + 60_000 },
};
let resumeOutcome = 'success';
let deleted = 0;
let statusRevokesSession = false;
let vaultReadFails = false;
let ticket = { state: 'admitted' };
const accountRow = {
  id: 'account', snapshot: JSON.stringify({ checkedAt: 'old' }), session_hash: 'token',
};
class SchoolError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const db = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async run() {
        assert.match(sql, /EXISTS \(SELECT 1 FROM academic_sessions/);
        accountRow.snapshot = args[0];
        return { meta: { changes: 1 } };
      },
      async first() { return accountRow; },
    };
  },
};
const vault = {
  sessionVaultConfigured: () => configured,
  schoolSessionStatus: async () => {
    if (statusRevokesSession) signedIn = false;
    return {
      configured, available: configured && Boolean(loaded),
      expiresAt: loaded?.revision.expiresAt ?? null,
    };
  },
  loadSchoolSession: async (_id, sessionHash) => {
    assert.equal(sessionHash, 'token');
    if (vaultReadFails) throw new TypeError('storage unavailable');
    return loaded;
  },
  deleteSchoolSessionRevision: async (_id, revision, sessionHash) => {
    assert.equal(revision, loaded.revision);
    assert.equal(sessionHash, 'token');
    deleted += 1;
  },
};
const modules = {
  'cloudflare:workers': { waitUntil() {} },
  '@/lib/server/account': {
    authenticated: async () => signedIn ? accountRow : null,
    database: () => db,
    validOrigin: () => true,
    readTextLimited: async () => '', limited: async () => false,
    accountView: row => row,
    json: (body, status = 200, headers = {}) => ({ body, status, headers: new Headers(headers) }),
  },
  '@/lib/server/school': {
    SchoolError,
    SchoolSession: class { constructor(cookies) { assert.ok(cookies); } },
    resumeSchool: async () => {
      if (resumeOutcome === 'session') throw new SchoolError('session');
      if (resumeOutcome === 'upstream') throw new SchoolError('upstream');
      return { checkedAt: 'new', lms: 'connected', portal: 'connected', courses: [], courseScope: 'fixture' };
    },
  },
  '@/lib/server/session-vault': vault,
  '@/lib/server/lms-write': { writeCollectedLms: async () => {} },
  '@/lib/data/info': { mergeInfoSnapshot: (_old, current) => current },
  '@/lib/data/notifs': { infoChanges: () => [] },
  '@/lib/server/collect-queue': {
    enterCollectQueue: async () => ticket,
    queuePosition: async () => null,
    heartbeatCollectQueue: async () => {},
    leaveCollectQueue: async () => {},
    abandonCollectQueue: async () => {},
  },
};
const route = {};
vm.runInNewContext(js, {
  exports: route,
  require(name) { return modules[name]; },
  Headers, Date, JSON, console,
});

let response = await route.GET({});
assert.equal(response.status, 200);
assert.equal(response.body.configured, true);
assert.equal(response.body.available, true);
assert.equal('cookies' in response.body, false);

signedIn = false;
response = await route.GET({});
assert.equal(response.status, 401);
assert.equal(response.headers.get('X-Hansung-Session-Invalid'), '1');
signedIn = true;

statusRevokesSession = true;
response = await route.GET({});
assert.equal(response.status, 401);
assert.equal(response.headers.get('X-Hansung-Session-Invalid'), '1');
statusRevokesSession = false;
signedIn = true;

configured = false;
response = await route.POST({});
assert.equal(response.status, 503);
assert.equal(response.headers.get('X-Hansung-School-Session'), 'unavailable');
configured = true;

vaultReadFails = true;
response = await route.POST({});
assert.equal(response.status, 503);
assert.equal(response.headers.get('X-Hansung-School-Session'), 'unavailable');
vaultReadFails = false;

loaded = null;
response = await route.POST({});
assert.equal(response.status, 401);
assert.equal(response.headers.get('X-Hansung-School-Session'), 'expired');
loaded = {
  cookies: { 'info.hansung.ac.kr': { JSESSIONID: 'fixture' } },
  revision: { appSessionHash: 'token', createdAt: Date.now(), expiresAt: Date.now() + 60_000 },
};

resumeOutcome = 'upstream';
response = await route.POST({});
assert.equal(response.status, 503);
assert.equal(response.headers.get('X-Hansung-School-Session'), 'unavailable');
assert.equal(deleted, 0);

resumeOutcome = 'session';
response = await route.POST({});
assert.equal(response.status, 401);
assert.equal(response.headers.get('X-Hansung-School-Session'), 'expired');
assert.equal(deleted, 1);

resumeOutcome = 'success';
response = await route.POST({});
assert.equal(response.status, 200);
assert.equal(deleted, 1);

// 대기열이 승인하지 않으면 수집 없이 위치만 돌려준다
ticket = { state: 'queued', position: 3 };
response = await route.POST({});
assert.equal(response.body.queued, true);
assert.equal(response.body.running, false);
assert.equal(response.body.position, 3);

// 같은 계정의 수집이 다른 요청에서 진행 중이면 running으로 알린다
ticket = { state: 'running' };
response = await route.POST({});
assert.equal(response.body.queued, true);
assert.equal(response.body.running, true);

// cooldown이면 새 수집 없이 직전 계정 뷰를 돌려준다
ticket = { state: 'cooldown', retryAfterMs: 1000 };
response = await route.POST({});
assert.equal(response.status, 200);
assert.equal(response.body.collectCooldown, true);
ticket = { state: 'admitted' };
console.log('lms-refresh-session.test: status, app/session expiry, queue and transient upstream handling passed');
