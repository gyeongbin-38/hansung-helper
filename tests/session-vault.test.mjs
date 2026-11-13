import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as cryptoModule from '../lib/server/school-session-crypto.ts';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
sqlite.exec(await readFile('drizzle/0000_academic_accounts.sql', 'utf8'));
sqlite.exec(await readFile('drizzle/0002_school_session_vault.sql', 'utf8'));
sqlite.prepare('INSERT INTO academic_accounts VALUES (?, ?, ?, ?, 0, 1, 1)')
  .run('account', 'fixture', '{}', '{}');
sqlite.prepare('INSERT INTO academic_sessions VALUES (?, ?, ?)')
  .run('old-session', 'account', Date.now() + 60_000);
sqlite.prepare('INSERT INTO academic_sessions VALUES (?, ?, ?)')
  .run('new-session', 'account', Date.now() + 60_000);

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
const env = { SCHOOL_SESSION_KEY: 'v'.repeat(64) };
const source = await readFile('lib/server/session-vault.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const vault = {};
vm.runInNewContext(js, {
  exports: vault,
  require(name) {
    if (name === 'cloudflare:workers') return { env };
    if (name === './account.ts') return { database: () => db };
    if (name === './school-session-crypto.ts') return cryptoModule;
    throw new Error(`unexpected import: ${name}`);
  },
  crypto: webcrypto, TextEncoder, Date, console,
});

const cookies = { 'info.hansung.ac.kr': { JSESSIONID: 'old' } };
const now = Date.now();
assert.equal(await vault.saveSchoolSession('account', cookies, {
  sessionHash: 'new-session', issuedAt: now,
}), true);
let row = sqlite.prepare('SELECT * FROM school_session_vault WHERE account_id = ?').get('account');
assert.equal(row.app_session_hash, 'new-session');
assert.equal(row.expires_at, now + 2 * 60 * 60 * 1000);

// 늦게 끝난 이전 요청은 최신 쿠키와 고정 만료 시각을 덮거나 늘리지 못한다.
assert.equal(await vault.saveSchoolSession('account', {
  'info.hansung.ac.kr': { JSESSIONID: 'stale' },
}, { sessionHash: 'old-session', issuedAt: now - 1_000 }), false);
row = sqlite.prepare('SELECT * FROM school_session_vault WHERE account_id = ?').get('account');
assert.equal(row.app_session_hash, 'new-session');
assert.equal(row.expires_at, now + 2 * 60 * 60 * 1000);

const loaded = await vault.loadSchoolSession('account', 'new-session');
assert.equal(loaded.cookies['info.hansung.ac.kr'].JSESSIONID, 'old');
assert.equal(loaded.revision.expiresAt, row.expires_at);
assert.equal((await vault.schoolSessionStatus('account')).expiresAt, row.expires_at);
assert.equal(
  sqlite.prepare('SELECT expires_at FROM school_session_vault WHERE account_id = ?').get('account').expires_at,
  now + 2 * 60 * 60 * 1000,
);

// 이전 로그아웃과 이전 읽기의 만료 삭제는 새 세대를 지우지 않는다.
await vault.deleteSchoolSession('account', 'old-session');
assert.ok(sqlite.prepare('SELECT 1 FROM school_session_vault WHERE account_id = ?').get('account'));
assert.equal(await vault.saveSchoolSession('account', {
  'info.hansung.ac.kr': { JSESSIONID: 'new' },
}, { sessionHash: 'new-session', issuedAt: now + 1_000 }), true);
await vault.deleteSchoolSessionRevision('account', loaded.revision, 'new-session');
row = sqlite.prepare('SELECT * FROM school_session_vault WHERE account_id = ?').get('account');
assert.equal(row.created_at, now + 1_000);

// 취소된 앱 세션으로는 새 볼트 행을 만들 수 없다.
sqlite.prepare('DELETE FROM school_session_vault WHERE account_id = ?').run('account');
sqlite.prepare('DELETE FROM academic_sessions WHERE token_hash = ?').run('old-session');
assert.equal(await vault.saveSchoolSession('account', cookies, {
  sessionHash: 'old-session', issuedAt: now + 2_000,
}), false);
assert.equal(sqlite.prepare('SELECT 1 FROM school_session_vault').get(), undefined);

// 새 계정은 FK 대상 계정과 앱 세션이 모두 저장된 뒤 실제 볼트 저장이 된다.
assert.equal(await vault.saveSchoolSession('fresh', cookies, {
  sessionHash: 'fresh-session', issuedAt: now + 3_000,
}), false);
sqlite.prepare('INSERT INTO academic_accounts VALUES (?, ?, ?, ?, 0, 1, 1)')
  .run('fresh', 'fixture', '{}', '{}');
sqlite.prepare('INSERT INTO academic_sessions VALUES (?, ?, ?)')
  .run('fresh-session', 'fresh', Date.now() + 60_000);
assert.equal(await vault.saveSchoolSession('fresh', cookies, {
  sessionHash: 'fresh-session', issuedAt: now + 3_000,
}), true);
assert.ok(sqlite.prepare('SELECT 1 FROM school_session_vault WHERE account_id = ?').get('fresh'));

delete env.SCHOOL_SESSION_KEY;
const disabled = await vault.schoolSessionStatus('account');
assert.equal(disabled.configured, false);
assert.equal(disabled.available, false);
assert.equal(disabled.expiresAt, null);
console.log('session-vault.test: FK ordering, fixed TTL, active-session guards and stale save/delete races passed');
