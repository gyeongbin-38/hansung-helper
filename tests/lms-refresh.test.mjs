import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile('app/api/account/lms-refresh/route.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

for (const outcome of ['success', 'empty', 'failure', 'revoked', 'revoked-in-connect']) {
  const snapshot = { checkedAt: 'current', infoData: { value: 'old' } };
  const rows = new Map([['legacy', { id: 'legacy', snapshot: JSON.stringify(snapshot), session_hash: 'valid-token' }]]);
  let sessionActive = true;
  let resolveDeferred;
  const gate = new Promise((resolve) => { resolveDeferred = resolve; });
  const deferred = [];
  const db = {
    prepare(sql) {
      return { bind(...args) { return {
        async run() {
          const [data, id, checkedAt] = args;
          const row = rows.get(id);
          if (!row || !sessionActive) return { meta: { changes: 0 } };
          assert.match(sql, /EXISTS \(SELECT 1 FROM academic_sessions/);
          if (sql.includes('json_patch')) {
            const current = JSON.parse(row.snapshot);
            if (current.checkedAt !== checkedAt) return { meta: { changes: 0 } };
            for (const [key, value] of Object.entries(JSON.parse(data))) {
              if (value === null) delete current[key];
              else current[key] = value;
            }
            row.snapshot = JSON.stringify(current);
          } else row.snapshot = data;
          return { meta: { changes: 1 } };
        },
        async first() { return rows.get(args[0]); },
      }; } };
    },
  };
  const account = {
    authenticated: async () => rows.get('legacy'), database: () => db,
    validOrigin: () => true, readTextLimited: async () => JSON.stringify({ studentId: '123456', password: 'password' }),
    studentAccountId: async () => 'hmac', hash: async () => 'legacy', limited: async () => false,
    migrateLegacyStudentAccount: async () => { const row = rows.get('legacy'); rows.delete('legacy'); rows.set('hmac', { ...row, id: 'hmac' }); },
    accountView: (row) => row, json: (body, status = 200) => ({ body, status }),
    PayloadTooLargeError: class extends Error {},
  };
  const modules = {
    'cloudflare:workers': { waitUntil: (p) => deferred.push(p) },
    '@/lib/server/account': account,
    '@/lib/server/school': { SchoolError: class extends Error {}, connectSchool: async (_id, _password, options) => {
      if (outcome === 'revoked-in-connect') sessionActive = false;
      options.deferInfo(async () => {
        if (outcome === 'revoked') { await gate; return { value: 'new' }; }
        if (outcome === 'failure') throw new Error('failed');
        return outcome === 'success' ? { value: 'new' } : null;
      });
      return { checkedAt: 'current' };
    } },
    '@/lib/data/info': { mergeInfoSnapshot: (_old, current) => current },
    '@/lib/data/lms': { mergeLmsSnapshot: (_old, current) => current },
    '@/lib/data/notifs': { infoChanges: () => [] },
  };
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => modules[name], console, Date });
  const response = await exports.POST({});
  if (outcome === 'revoked-in-connect') {
    assert.equal(response.status, 401);
    assert.equal(JSON.parse(rows.get('hmac').snapshot).infoData.value, 'old');
    continue;
  }
  assert.equal(response.status, 200);
  if (outcome === 'revoked') { sessionActive = false; resolveDeferred(); }
  await Promise.all(deferred);
  assert.equal(rows.has('legacy'), false);
  const result = JSON.parse(rows.get('hmac').snapshot);
  if (outcome === 'revoked') {
    assert.equal(result.infoData.value, 'old');
    assert.equal(result.infoPending, true);
    continue;
  }
  assert.equal(result.infoPending, undefined, outcome);
  if (outcome === 'success') assert.equal(result.infoData.value, 'new');
  else {
    assert.equal(result.infoData.value, 'old');
    assert.ok(result.infoFailedAt, outcome);
  }
}
console.log('lms-refresh.test: legacy account info success and failures passed');
