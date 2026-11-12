import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await readFile('drizzle/0000_academic_accounts.sql', 'utf8'));
sqlite.prepare('INSERT INTO academic_accounts VALUES (?, ?, ?, ?, 0, 1, 1)')
  .run('old', 'fixture', '{}', JSON.stringify({ checkedAt: 'baseline', courses: ['baseline'] }));
sqlite.prepare('INSERT INTO academic_sessions VALUES (?, ?, ?)').run('active', 'old', Date.now() + 60000);
const db = {
  prepare(sql) { return { bind(...args) { return {
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
    first: async () => sqlite.prepare(sql).get(...args),
  }; } }; },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      sqlite.exec('COMMIT');
      return result;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
async function load(path, modules) {
  const source = await readFile(path, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: name => modules[name], console, Date, JSON, Object, Array, Math });
  return exports;
}
const realAccount = await load('lib/server/account.ts', { 'cloudflare:workers': { env: { DB: db } } });
const account = {
  ...realAccount,
  authenticated: async () => sqlite.prepare('SELECT a.*, s.token_hash AS session_hash FROM academic_accounts a JOIN academic_sessions s ON s.account_id = a.id WHERE s.token_hash = ? AND s.expires_at > ?').get('active', Date.now()),
  validOrigin: () => true,
  readTextLimited: async () => JSON.stringify({ studentId: '123456', password: 'fixture' }),
  studentAccountId: async () => 'new', hash: async () => 'old', limited: async () => false,
  json: (body, status = 200) => ({ body, status }),
};
let finishSchool;
const route = await load('app/api/account/lms-refresh/route.ts', {
  'cloudflare:workers': { waitUntil() {} },
  '@/lib/server/account': account,
  '@/lib/server/school': { SchoolError: class extends Error {}, connectSchool: () => new Promise(resolve => { finishSchool = resolve; }) },
  '@/lib/data/info': { mergeInfoSnapshot() {} },
  '@/lib/server/lms-write': { writeCollectedLms() {} },
  '@/lib/data/notifs': { infoChanges() {} },
});
const pending = route.POST({});
while (!finishSchool) await new Promise(resolve => setImmediate(resolve));
await realAccount.migrateLegacyStudentAccount('new', 'old');
sqlite.prepare('UPDATE academic_accounts SET snapshot = ? WHERE id = ?')
  .run(JSON.stringify({ checkedAt: 'newer', courses: ['newer'] }), 'new');
finishSchool({ checkedAt: 'older', courses: ['older'] });
assert.equal((await pending).status, 409);
assert.equal(JSON.parse(sqlite.prepare('SELECT snapshot FROM academic_accounts WHERE id = ?').get('new').snapshot).checkedAt, 'newer');
assert.equal(sqlite.prepare('SELECT account_id FROM academic_sessions WHERE token_hash = ?').get('active').account_id, 'new');
assert.equal(sqlite.prepare('SELECT id FROM academic_accounts WHERE id = ?').get('old'), undefined);
console.log('legacy refresh: concurrent migration cannot overwrite a newer collection');
