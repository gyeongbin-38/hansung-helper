import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile('app/api/account/profile/route.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
let profile = {};
const modules = {
  '@/lib/server/account': {
    authenticated: async () => ({ id: 'a', profile: JSON.stringify(profile), onboarded: 0 }),
    database: () => ({ prepare: () => ({ bind: (json, _onboarded, _id, expected) => ({ run: async () => {
      if ((profile.rev ?? 0) !== expected) return { meta: { changes: 0 } };
      profile = JSON.parse(json); return { meta: { changes: 1 } };
    } }) }) }),
    json: (body, status = 200) => ({ body, status }),
    validOrigin: () => true,
    readTextLimited: async (request) => request.body,
    PayloadTooLargeError: class extends Error {},
  },
  '@/lib/data/lms': { validateLms: (v) => v },
};
const exports = {};
vm.runInNewContext(js, { exports, require: (name) => modules[name], JSON, Number, Array, Object, String, SyntaxError });
const input = { saved: [], planned: [], prefs: [], events: [], completed: [], rev: 0, name: '처음' };
assert.equal((await exports.PUT({ body: '{' })).status, 400);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: undefined }) })).status, 400);
assert.equal((await exports.PUT({ body: JSON.stringify(input) })).status, 200);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, name: '오래된 탭' }) })).status, 409);
assert.equal(profile.name, '처음');
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 1, name: '새 저장' }) })).status, 200);
assert.equal(profile.name, '새 저장');
console.log('profile-route.test: invalid JSON, missing revision and stale writes rejected');
