import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await readFile('drizzle/0000_academic_accounts.sql', 'utf8'));
sqlite.prepare('INSERT INTO academic_accounts VALUES (?, ?, ?, ?, 0, 1, 1)')
  .run('account', 'fixture', '{}', JSON.stringify({ checkedAt: 'old' }));
sqlite.prepare('INSERT INTO academic_sessions VALUES (?, ?, ?)')
  .run('token', 'account', Date.now() + 60000);
const db = { prepare(sql) { return { bind(...args) { return {
  run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
  first: async () => sqlite.prepare(sql).get(...args),
}; } }; } };
const pending = [];
const account = {
  authenticated: async () => {
    const row = sqlite.prepare('SELECT * FROM academic_accounts WHERE id = ?').get('account');
    const session = sqlite.prepare('SELECT * FROM academic_sessions WHERE token_hash = ? AND expires_at > ?').get('token', Date.now());
    return row && session ? { ...row, session_hash: 'token' } : null;
  },
  database: () => db, validOrigin: () => true,
  readTextLimited: async () => JSON.stringify({ studentId: '123456', password: 'fixture' }),
  studentAccountId: async () => 'account', hash: async () => 'legacy', limited: async () => false,
  migrateLegacyStudentAccount: async () => {}, accountView: (row) => row,
  json: (body, status = 200) => ({ body, status }), PayloadTooLargeError: class extends Error {},
};
const modules = {
  'cloudflare:workers': { waitUntil() {} },
  '@/lib/server/account': account,
  '@/lib/server/school': { SchoolError: class extends Error {},
    SchoolSession: class { hasCookies() { return false; } exportCookies() { return {}; } },
    connectSchool: async () => new Promise((resolve) => pending.push(resolve)) },
  '@/lib/data/info': { mergeInfoSnapshot() {} },
  '@/lib/server/lms-write': { writeCollectedLms() {} },
  '@/lib/server/session-vault': { saveSchoolSession: async () => true },
  '@/lib/data/notifs': { infoChanges() {} },
  '@/lib/server/collect-queue': {
    enterCollectQueue: async () => ({ state: 'admitted' }),
    queuePosition: async () => null,
    heartbeatCollectQueue: async () => {},
    leaveCollectQueue: async () => {},
    abandonCollectQueue: async () => {},
  },
};
const source = await readFile('app/api/account/lms-refresh/route.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(js, { exports, require: (name) => modules[name], console, Date });
const first = exports.POST({});
const second = exports.POST({});
while (pending.length < 2) await new Promise((resolve) => setImmediate(resolve));
pending[1]({ checkedAt: 'newer', courses: ['newer'] });
assert.equal((await second).status, 200);
pending[0]({ checkedAt: 'older', courses: ['older'] });
assert.equal((await first).status, 409);
const result = JSON.parse(sqlite.prepare('SELECT snapshot FROM academic_accounts WHERE id = ?').get('account').snapshot);
assert.equal(result.checkedAt, 'newer');
assert.equal(result.courses[0], 'newer');
const revoked = exports.POST({});
while (pending.length < 3) await new Promise((resolve) => setImmediate(resolve));
sqlite.prepare('DELETE FROM academic_sessions WHERE token_hash = ?').run('token');
pending[2]({ checkedAt: 'revoked', courses: ['revoked'] });
assert.equal((await revoked).status, 401);
assert.equal(JSON.parse(sqlite.prepare('SELECT snapshot FROM academic_accounts WHERE id = ?').get('account').snapshot).checkedAt, 'newer');
console.log('lms refresh: concurrent current-account request cannot overwrite newer snapshot');
