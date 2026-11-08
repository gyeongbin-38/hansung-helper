import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

const db = new DatabaseSync(':memory:');
db.exec(await readFile('drizzle/0000_academic_accounts.sql', 'utf8'));
const d1 = {
  prepare(sql) { return { bind(...args) { return {
    first: async () => db.prepare(sql).get(...args),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  }; } }; },
  async batch(statements) {
    db.exec('BEGIN');
    try { const result = []; for (const s of statements) result.push(await s.run()); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};
const source = await readFile('lib/server/account.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(js, { exports, require: (name) => name === 'cloudflare:workers' ? { env: { DB: d1 } } : undefined, Date, JSON, Object, Array, Math });
const insert = (id, profile) => db.prepare("INSERT INTO academic_accounts VALUES (?, 'fixture', ?, '{}', 0, 1, 1)").run(id, JSON.stringify({ name: profile }));
const session = (hash, id, expiry) => db.prepare('INSERT INTO academic_sessions VALUES (?, ?, ?)').run(hash, id, expiry);
const get = id => db.prepare('SELECT profile FROM academic_accounts WHERE id = ?').get(id);

// Both IDs exist: an expired session must not overwrite the current account,
// move other sessions or delete the legacy account.
insert('old', 'old'); insert('new', 'current');
session('expired', 'old', 1); session('other', 'old', Date.now() + 60000);
await exports.migrateLegacyStudentAccount('new', 'old', { hash: 'expired', accountId: 'old' });
assert.equal(JSON.parse(get('new').profile).name, 'current');
assert.ok(get('old'));
assert.equal(db.prepare("SELECT account_id FROM academic_sessions WHERE token_hash='other'").get().account_id, 'old');
// A valid session permits the complete migration and moves both sessions.
await exports.migrateLegacyStudentAccount('new', 'old', { hash: 'other', accountId: 'old' });
assert.equal(get('old'), undefined);
assert.equal(db.prepare("SELECT account_id FROM academic_sessions WHERE token_hash='other'").get().account_id, 'new');
// Without a valid session, a missing destination must not be recreated.
insert('old2', 'old2');
await exports.migrateLegacyStudentAccount('new2', 'old2', { hash: 'revoked', accountId: 'old2' });
assert.ok(get('old2')); assert.equal(get('new2'), undefined);
// Login has independently verified school credentials and keeps the existing migration path.
await exports.migrateLegacyStudentAccount('new2', 'old2');
assert.equal(get('old2'), undefined); assert.ok(get('new2'));
console.log('account migration: expired/revoked sessions cannot write; valid session and login migrate');
