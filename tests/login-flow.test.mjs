import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real login, session, profile and logout handlers with SQLite.
// Only the external school authentication is replaced; no school account is used.
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
sql.exec(await readFile('drizzle/0000_academic_accounts.sql', 'utf8'));
sql.exec(await readFile('drizzle/0002_school_session_vault.sql', 'utf8'));
sql.exec(await readFile('drizzle/0003_school_session_vault_owner.sql', 'utf8'));
const d1 = {
  prepare(query) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() { return sql.prepare(query).get(...args) ?? null; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
    };
    return statement;
  },
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      sql.exec('COMMIT');
      return result;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB: d1 };
const diagnosticLogs = [];
const testConsole = { ...console, error: (...args) => diagnosticLogs.push(args) };
async function load(file, imports) {
  const source = await readFile(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require(name) {
      if (!(name in imports)) throw new Error(`unexpected import: ${name}`);
      return imports[name];
    },
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Response, URL, Date, Math,
    JSON, Object, Array, Number, String, SyntaxError, console: testConsole,
  }, { filename: file });
  return exports;
}
const account = await load('lib/server/account.ts', { 'cloudflare:workers': { env } });
let schoolCalls = 0;
let rejectCredentials = false;
let rejectUpstream = false;
class SchoolError extends Error { constructor(code) { super(code); this.code = code; } }
const imports = {
  '@/lib/server/account': account,
  '@/lib/server/session-vault': {
    cleanupExpiredSchoolSessions: async () => {},
    saveSchoolSession: async (id, _cookies, options) => {
      // 볼트 FK와 세션 가드가 성립한 뒤에만 저장을 시도해야 한다.
      assert.ok(sql.prepare('SELECT 1 FROM academic_accounts WHERE id = ?').get(id));
      assert.ok(sql.prepare('SELECT 1 FROM academic_sessions WHERE token_hash = ? AND account_id = ?').get(options.sessionHash, id));
      return true;
    },
    deleteSchoolSession: async () => {},
  },
};
const login = await load('app/api/account/login/route.ts', {
  ...imports,
  'cloudflare:workers': { waitUntil() { throw new Error('unexpected background collection'); } },
  '@/lib/server/school': {
    SchoolError,
    SchoolSession: class {
      hasCookies() { return true; }
      exportCookies() { return { 'info.hansung.ac.kr': { JSESSIONID: 'fixture' } }; }
    },
    async connectSchool() {
      schoolCalls += 1;
      if (rejectCredentials) throw new SchoolError('credentials');
      if (rejectUpstream) throw new SchoolError('upstream');
      return { portal: 'connected', lms: 'unavailable', courses: [], checkedAt: new Date().toISOString() };
    },
  },
  '@/lib/server/lms-write': {}, '@/lib/data/info': {}, '@/lib/data/notifs': {},
});
const current = await load('app/api/account/route.ts', imports);
const profile = await load('app/api/account/profile/route.ts', {
  ...imports, '@/lib/data/lms': { validateLms: value => value },
});
const logout = await load('app/api/account/logout/route.ts', imports);
const health = await load('app/api/health/route.ts', imports);
const base = 'https://app.test';
function request(path, method = 'GET', body, cookie, context) {
  return new Request(base + path, {
    method,
    headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie,
      'X-Hansung-Session-Context': context ?? createHash('sha256').update(cookie.split('=')[1]).digest('hex') } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const input = { studentId: '00000000', password: 'fixture-password', agreed: true };

// The actual release failure: public endpoints and an anonymous 401 can be
// healthy even when the missing account key prevents every login.
assert.equal(await account.authenticated(request('/api/account')), null);
assert.equal((await login.POST(request('/api/account/login', 'POST', input))).status, 503);
assert.deepEqual(diagnosticLogs.pop(), ['[login] failed', 'account-setup', 'internal']);
assert.equal(schoolCalls, 0);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM academic_login_limits').get().n, 0);
let response = await health.GET();
assert.equal(response.status, 503);
assert.equal((await response.json()).checks.accountAuth, false);
env.ACCOUNT_INDEX_HMAC_KEY = 'short';
assert.equal(account.accountAuthConfigured(), false);
env.ACCOUNT_INDEX_HMAC_KEY = 'fixture-stable-account-key-32-bytes-minimum';
assert.equal(account.accountAuthConfigured(), true);
response = await health.GET();
assert.equal(response.status, 200);
assert.equal(response.headers.get('Cache-Control'), 'no-store');
rejectUpstream = true;
assert.equal((await login.POST(request('/api/account/login', 'POST', input))).status, 503);
assert.deepEqual(diagnosticLogs.pop(), ['[login] failed', 'school', 'school-upstream']);
rejectUpstream = false;

// Existing accounts retain profile and sessions when adopting the HMAC ID.
const legacy = await account.hash('hansung:' + input.studentId);
sql.prepare('INSERT INTO academic_accounts VALUES (?, ?, ?, ?, 1, 1, 1)').run(
  legacy, 'fixture', JSON.stringify({ name: '기존 프로필', rev: 3 }), '{}',
);
sql.prepare('INSERT INTO academic_sessions VALUES (?, ?, ?)').run('legacy-session', legacy, Date.now() + 60000);
response = await login.POST(request('/api/account/login', 'POST', input));
assert.equal(response.status, 200);
const loggedIn = (await response.json()).data;
assert.equal(loggedIn.profile.name, '기존 프로필');
assert.equal(loggedIn.profile.rev, 3);
assert.equal(loggedIn.onboarded, true);
const cookieHeader = response.headers.get('Set-Cookie');
assert.match(cookieHeader, /__Host-hansung_session=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Lax/);
const cookie = cookieHeader.split(';')[0];
const id = await account.studentAccountId(input.studentId);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM academic_accounts WHERE id=?').get(legacy).n, 0);
assert.equal(sql.prepare('SELECT account_id FROM academic_sessions WHERE token_hash=?').get('legacy-session').account_id, id);
assert.equal((await current.GET(request('/api/account', 'GET', undefined, cookie))).status, 200);

// A stale tab still carrying A's state must not read, modify, delete or log out B.
response = await login.POST(request('/api/account/login', 'POST', { ...input, studentId: '00000002' }));
assert.equal(response.status, 200);
const bCookie = response.headers.get('Set-Cookie').split(';')[0];
const aContext = loggedIn.sessionContext;
const bBefore = (await (await current.GET(request('/api/account', 'GET', undefined, bCookie))).json()).data;
assert.equal((await current.GET(request('/api/account', 'GET', undefined, bCookie, aContext))).status, 401);
const staleProfile = { ...loggedIn.profile, rev: 0, saved: [], planned: [], prefs: [], events: [], completed: [] };
assert.equal((await profile.PUT(request('/api/account/profile', 'PUT', staleProfile, bCookie, aContext))).status, 401);
assert.equal((await current.DELETE(request('/api/account', 'DELETE', {}, bCookie, aContext))).status, 401);
assert.equal((await logout.POST(request('/api/account/logout', 'POST', {}, bCookie, aContext))).status, 409);
assert.deepEqual((await (await current.GET(request('/api/account', 'GET', undefined, bCookie))).json()).data.profile, bBefore.profile);

const changes = {
  name: '저장한 프로필', saved: ['activity-1'], planned: [], prefs: ['실습'],
  events: [{ title: '테스트 일정', date: '2026-11-12' }], completed: [], rev: 3,
  planSemester: '2027-1',
  semesterPlans: { '2027-1': { sourceSemester: '2026-2', planned: ['W080010-N'], plans: {} } },
};
response = await profile.PUT(request('/api/account/profile', 'PUT', changes, cookie));
assert.equal(response.status, 200);
assert.equal((await response.json()).data.rev, 4);
const saved = (await (await current.GET(request('/api/account', 'GET', undefined, cookie))).json()).data;
assert.equal(saved.profile.name, changes.name);
assert.deepEqual(saved.profile.semesterPlans, changes.semesterPlans);
assert.equal(saved.profile.events[0].title, '테스트 일정');
assert.equal((await profile.PUT(request('/api/account/profile', 'PUT', changes, cookie))).status, 409);
assert.equal((await logout.POST(request('/api/account/logout', 'POST', {}, cookie))).status, 200);
assert.equal((await current.GET(request('/api/account', 'GET', undefined, cookie))).status, 401);

rejectCredentials = true;
assert.equal((await login.POST(request('/api/account/login', 'POST', { ...input, studentId: '00000001' }))).status, 401);
const oldDatabase = env.DB;
env.DB = { prepare() { throw new Error('fixture database failure'); } };
response = await health.GET();
assert.equal(response.status, 503);
assert.deepEqual((await response.json()).checks, { accountAuth: true, accountDatabase: false });
env.DB = oldDatabase;
sql.close();
console.log('login-flow: missing key fails readiness; login, legacy migration, cookie, profile/plan/event persistence, stale writes and logout passed');
