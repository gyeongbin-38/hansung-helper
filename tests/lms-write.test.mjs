import assert from 'node:assert/strict';
import { writeCollectedLms } from '../lib/server/lms-write.ts';

const snapshot = (date, value, errors = []) => ({ source: 'cosmos-lms', fetchedAt: `2026-09-${date}T00:00:00Z`, courses: [{ id: '1', title: 'course', vods: [], assigns: [{ title: value, submitted: true }], quizzes: [], errors }] });
const old = snapshot('19', 'server-old');
const extension = snapshot('20', 'extension-new');
const collected = snapshot('21', 'unreliable', ['assign']);
let profile = JSON.stringify({ lms: old });
let stored = { checkedAt: 'check', lmsData: old, lmsPending: true };
let active = true, race = true;
const db = { prepare(sql) { return { bind(...args) { return {
  first: async () => ({ profile, snapshot: JSON.stringify(stored) }),
  run: async () => {
    assert.match(sql, /EXISTS \(SELECT 1 FROM academic_sessions/);
    if (race) { profile = JSON.stringify({ lms: extension }); race = false; }
    if (!active || profile !== args[3] || JSON.stringify(stored) !== args[4]) return { meta: { changes: 0 } };
    stored = { ...stored, ...JSON.parse(args[0]) };
    return { meta: { changes: 1 } };
  },
}; } }; } };
await writeCollectedLms(db, 'id', 'check', 'hash', collected);
assert.equal(stored.lmsData.courses[0].assigns[0].title, 'extension-new');
assert.equal(stored.lmsData.courses[0].retainedAtByKind.assign, extension.fetchedAt);
assert.equal(stored.lmsPending, null);
profile = JSON.stringify({ lms: old });
const retained = stored.lmsData;
stored = { checkedAt: 'check', lmsData: retained, lmsPending: true };
await writeCollectedLms(db, 'id', 'check', 'hash', snapshot('22', 'missing', ['assign']));
assert.equal(stored.lmsData.courses[0].assigns[0].title, 'extension-new');
assert.equal(stored.lmsData.courses[0].retainedAtByKind.assign, extension.fetchedAt);
const falseFuture = { ...snapshot('20', 'untrusted-future'), fetchedAt: new Date(Date.now() + 86400000).toISOString() };
profile = JSON.stringify({ lms: falseFuture });
stored = { checkedAt: 'check', lmsData: extension, lmsPending: true };
await writeCollectedLms(db, 'id', 'check', 'hash', snapshot('22', 'missing', ['assign']));
assert.equal(stored.lmsData.courses[0].assigns[0].title, 'extension-new', 'future profile must not override real successful data');
active = false;
const prior = JSON.stringify(stored);
await assert.rejects(writeCollectedLms(db, 'id', 'check', 'hash', collected));
assert.equal(JSON.stringify(stored), prior);
console.log('lms-write: profile race retried, newest successful list preserved, revoked session blocked');
