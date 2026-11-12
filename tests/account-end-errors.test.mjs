import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const cookie = '__Host-hansung_session=' + 'a'.repeat(64);
const request = { headers: new Headers({ cookie, 'x-hansung-session-context': 'hashed' }) };
let authenticated = async () => ({ id: 'fixture', session_hash: 'token' });
let dbFailure = false;
let changes = 1;
const account = {
  validOrigin: () => true,
  authenticated: (...args) => authenticated(...args),
  accountView: (v) => v,
  database: () => ({
    prepare: () => ({ bind: () => ({ run: async () => {
      if (dbFailure) throw new Error('private database detail');
      return { meta: { changes } };
    } }) }),
    batch: async () => {
      if (dbFailure) throw new Error('private database detail');
      return [{ meta: { changes } }];
    },
  }),
  hash: async () => 'hashed',
  json: (body, status = 200, headers = {}) => ({ body, status, headers }),
};
async function load(path) {
  const source = await readFile(path, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: () => account, Date });
  return exports;
}
const { DELETE } = await load('app/api/account/route.ts');
const { POST } = await load('app/api/account/logout/route.ts');
assert.equal((await DELETE(request)).status, 200);
assert.equal((await DELETE(request)).headers['Set-Cookie'], undefined);
assert.equal((await POST(request)).headers['Set-Cookie'], undefined);
changes = 0;
assert.equal((await DELETE(request)).status, 401);
changes = 1;
dbFailure = true;
for (const response of [await DELETE(request), await POST(request)]) {
  assert.equal(response.status, 503);
  assert.equal(response.headers['Set-Cookie'], undefined, 'do not report a cleared cookie on uncertain failure');
  assert.ok(!JSON.stringify(response).includes('private database detail'));
}
dbFailure = false;
authenticated = async () => { throw new Error('private lookup detail'); };
const failedLookup = await DELETE(request);
assert.equal(failedLookup.status, 503);
assert.ok(!JSON.stringify(failedLookup).includes('private lookup detail'));
console.log('account termination: success and failure responses cannot overwrite a newer session cookie');
