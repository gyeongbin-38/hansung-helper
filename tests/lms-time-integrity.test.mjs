import assert from 'node:assert/strict';
import { combineLmsSnapshots, mergeLmsSnapshot, validateLms } from '../lib/data/lms.ts';

const snapshot = (day, submitted, extra = {}) => ({
  source: 'cosmos-lms', fetchedAt: `2026-09-${day}T00:00:00Z`, courses: [{
    id: '1', title: 'fixture', vods: [], quizzes: [],
    assigns: [{ title: 'assignment', submitted }], ...extra,
  }],
});
const known = snapshot('19', true);
const invalidRetained = snapshot('21', false, { errors: ['assign'], retainedAtByKind: { assign: '2099-01-01T00:00:00Z' } });
const merged = mergeLmsSnapshot(known, invalidRetained);
assert.equal(merged.courses[0].assigns[0].submitted, true, 'future retained timestamp must not replace known result');
assert.equal(merged.courses[0].retainedAtByKind.assign, known.fetchedAt);
const mixed = snapshot('21', false, { errors: ['assign', 'vod'], retainedAt: '2026-09-20T00:00:00Z', retainedAtByKind: { vod: '2026-09-20T00:00:00Z', assign: '2099-01-01T00:00:00Z' } });
const mixedMerged = combineLmsSnapshots(known, mixed);
assert.equal(mixedMerged.courses[0].assigns[0].submitted, true, 'a different list legacy timestamp cannot authenticate a malformed assignment time');
const future = { ...snapshot('20', false), fetchedAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
const combined = combineLmsSnapshots(known, future);
assert.equal(combined.courses[0].assigns[0].submitted, true, 'far-future snapshot must not override current data');
const suspect = snapshot('21', false, { assigns: [{ title: 'assignment', submitted: false, uncertain: true, statusRetainedAt: '2099-01-01T00:00:00Z' }] });
assert.equal(validateLms(suspect).courses[0].assigns[0].statusRetainedAt, undefined, 'future per-item time must not be treated as confirmed');
const olderOffset = { ...known, fetchedAt: '2026-09-20T00:30:00+09:00' };
const newerUtc = { ...snapshot('20', false), fetchedAt: '2026-09-19T16:00:00Z' };
assert.equal(combineLmsSnapshots(newerUtc, olderOffset).courses[0].assigns[0].submitted, false, 'offset timestamps must compare as instants across KST midnight');
const validRetained = snapshot('21', false, { errors: ['assign'], retainedAtByKind: { assign: '2026-09-20T09:00:00+09:00' } });
assert.equal(validateLms(validRetained).courses[0].retainedAtByKind.assign, '2026-09-20T09:00:00+09:00');
console.log('LMS check times: future snapshots and future retained timestamps are not trusted');
