import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile('app/api/account/profile/route.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
let profile = {};
let active = true;
const modules = {
  '@/lib/server/account': {
    authenticated: async () => active ? ({ id: 'a', profile: JSON.stringify(profile), onboarded: 0, session_hash: 'token-hash' }) : null,
    database: () => ({ prepare: (sql) => ({ bind: (json, _onboarded, _id, expected, tokenHash) => ({ run: async () => {
      assert.match(sql, /EXISTS \(SELECT 1 FROM academic_sessions/);
      assert.equal(tokenHash, 'token-hash');
      if (!active || (profile.rev ?? 0) !== expected) return { meta: { changes: 0 } };
      profile = JSON.parse(json); return { meta: { changes: 1 } };
    } }) }) }),
    json: (body, status = 200) => ({ body, status }),
    validOrigin: () => true,
    readTextLimited: async (request) => { if (request.revoke) active = false; return request.body; },
    PayloadTooLargeError: class extends Error {},
  },
  '@/lib/data/lms': { validateLms: (v) => v },
};
const exports = {};
vm.runInNewContext(js, { exports, require: (name) => modules[name], JSON, Number, Array, Object, String, SyntaxError });
const input = { saved: [], planned: [], prefs: [], events: [], completed: [], rev: 0, name: '처음' };
assert.equal((await exports.PUT({ body: '{' })).status, 400);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: undefined }) })).status, 400);
for (const invalid of [
  { readIds: 'invalid' }, { reqChecks: [null] }, { actPrefs: {} },
  { ruleOverrides: [] }, { actStatus: null }, { lmsMatch: [] },
  { plans: 'invalid' }, { extActivities: 'invalid' }, { onboardingStep: 9 },
  { rev: Number.MAX_SAFE_INTEGER },
  { admissionType: 'guessed-freshman' }, { admissionType: null }, { admissionType: {} },
]) {
  assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, ...invalid }) })).status, 400);
  assert.equal(Object.keys(profile).length, 0, 'invalid input must not save');
}
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, admissionType: 'freshman' }) })).status, 200);
assert.equal(profile.admissionType, 'freshman');
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, name: '오래된 탭' }) })).status, 409);
assert.equal(profile.name, '처음');
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 1, name: '새 저장' }) })).status, 200);
assert.equal(profile.name, '새 저장');
assert.equal(profile.admissionType, 'freshman', 'older clients preserve the admission selection');
const semesterPlans = { '2027-1': { sourceSemester: '2026-2', planned: ['course-1'], plans: { A: ['course-1'] } }, '2027-2': { sourceSemester: '2026-2', planned: ['course-2'], plans: {} } };
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 2, planSemester: '2027-1', semesterPlans, setupHistory: 'later', recommendationsSeen: true }) })).status, 200);
assert.equal(JSON.stringify(profile.semesterPlans), JSON.stringify(semesterPlans));
assert.equal(profile.setupHistory, 'later');
assert.equal(profile.recommendationsSeen, true);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 3, setupHistory: 'invalid' }) })).status, 400);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 3, semesterPlans: { '2027-1': { sourceSemester: 'invalid', planned: [], plans: {} } } }) })).status, 400);
assert.equal(JSON.stringify(profile.semesterPlans), JSON.stringify(semesterPlans));
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 3, notifEnabled: true, notifiedIds: ['deadline-1'] }) })).status, 200);
assert.equal(profile.notifEnabled, true);
assert.deepEqual(profile.notifiedIds, ['deadline-1']);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 4, notifEnabled: 'true' }) })).status, 400);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 4, notifiedIds: [null] }) })).status, 400);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 4 }) })).status, 200);
assert.equal(profile.notifEnabled, true, 'older client must not erase the setting');
assert.deepEqual(profile.notifiedIds, ['deadline-1'], 'older client must not erase delivery history');
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 5, notifEnabled: false, notifiedIds: [] }) })).status, 200);
assert.equal(profile.notifEnabled, false, 'explicit opt-out must be saved');
assert.deepEqual(profile.notifiedIds, []);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 6, mascotEnabled: false, mascotGuideSeen: true }) })).status, 200);
assert.equal(profile.mascotEnabled, false);
assert.equal(profile.mascotGuideSeen, true);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 7, mascotEnabled: 'off' }) })).status, 400);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 7, mascotGuideSeen: 1 }) })).status, 400);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 7 }) })).status, 200);
assert.equal(profile.mascotEnabled, false, 'older client must not erase the mascot setting');
assert.equal(profile.mascotGuideSeen, true, 'older client must not erase guide history');
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 8, mascotEnabled: true, mascotGuideSeen: false }) })).status, 200);
assert.equal(profile.mascotEnabled, true);
assert.equal(profile.mascotGuideSeen, false);
assert.equal((await exports.PUT({ body: JSON.stringify({ ...input, rev: 9, name: '로그아웃 후 요청' }), revoke: true })).status, 401);
assert.equal(profile.name, '처음');
console.log('profile-route.test: invalid JSON, missing revision and stale writes rejected');
