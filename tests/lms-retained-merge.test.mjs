import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLmsSnapshot, combineLmsSnapshots } from '../lib/data/lms.ts';

const snap = (day, submitted, errors = [], extra = {}) => ({
  source: 'cosmos-lms', fetchedAt: `2026-09-${day}T00:00:00Z`, courses: [{
    id: '1', title: 'course', vods: [], quizzes: [],
    assigns: submitted === null ? [] : [{ title: 'assignment', submitted }], errors, ...extra,
  }],
});
const day19 = snap('19', false);
const day20 = snap('20', true);
const failed21 = snap('21', null, ['assign']);

test('re-merging an already retained newer result does not roll it back', () => {
  const retained = mergeLmsSnapshot(day20, failed21);
  const again = mergeLmsSnapshot(day19, retained);
  assert.equal(again.courses[0].assigns[0].submitted, true);
  assert.equal(again.courses[0].retainedAtByKind.assign, day20.fetchedAt);
  assert.deepEqual(mergeLmsSnapshot(again, retained).courses[0].assigns, again.courses[0].assigns);
  assert.equal(combineLmsSnapshots(day19, retained).courses[0].assigns[0].submitted, true);
});

test('successive failures preserve the newest known successful list', () => {
  const retained = mergeLmsSnapshot(day20, failed21);
  const failed22 = snap('22', null, ['assign']);
  const result = mergeLmsSnapshot(mergeLmsSnapshot(day19, retained), failed22);
  assert.equal(result.courses[0].assigns[0].submitted, true);
  assert.equal(result.courses[0].retainedAtByKind.assign, day20.fetchedAt);
});

test('legacy retainedAt is respected, and a successful empty list stays empty', () => {
  const legacy = snap('21', true, ['assign'], { retainedAt: day20.fetchedAt });
  assert.equal(mergeLmsSnapshot(day19, legacy).courses[0].assigns[0].submitted, true);
  const empty = snap('20', null);
  const retainedEmpty = mergeLmsSnapshot(empty, failed21);
  assert.deepEqual(mergeLmsSnapshot(day19, retainedEmpty).courses[0].assigns, []);
});

test('unverified failed lists do not gain a false success time', () => {
  const unknown = snap('20', null, ['assign']);
  const result = mergeLmsSnapshot(unknown, failed21);
  assert.equal(result.courses[0].retainedAtByKind?.assign, undefined);
});

test('retained attendance and quiz values also survive re-merging', () => {
  const older = snap('19', false, [], { vods: [{ title: 'old', attended: false }], quizzes: [{ title: 'quiz', submitted: false }] });
  const newer = snap('20', true, [], { vods: [{ title: 'new', attended: true }], quizzes: [{ title: 'quiz', submitted: true }] });
  const failed = snap('21', null, ['vod', 'quiz']);
  const result = mergeLmsSnapshot(older, mergeLmsSnapshot(newer, failed));
  assert.equal(result.courses[0].vods[0].title, 'new');
  assert.equal(result.courses[0].quizzes[0].submitted, true);
  assert.equal(result.courses[0].retainedAtByKind.vod, newer.fetchedAt);
  assert.equal(result.courses[0].retainedAtByKind.quiz, newer.fetchedAt);
});

test('re-merging uncertain item status keeps the newer retained value and time', () => {
  const uncertain = snap('21', false, ['quiz-check'], { quizzes: [{ title: 'quiz', submitted: false, uncertain: true }] });
  const newer = snap('20', true, [], { quizzes: [{ title: 'quiz', submitted: true }] });
  const older = snap('19', false, [], { quizzes: [{ title: 'quiz', submitted: false }] });
  const result = mergeLmsSnapshot(older, mergeLmsSnapshot(newer, uncertain));
  assert.equal(result.courses[0].quizzes[0].submitted, true);
  assert.equal(result.courses[0].quizzes[0].uncertain, true);
  assert.equal(result.courses[0].retainedAtByKind.quiz, newer.fetchedAt);
});
