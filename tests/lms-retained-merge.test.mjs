import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLmsSnapshot, combineLmsSnapshots, validateLms, pendingTasks, dueSoon, bingeQueue } from '../lib/data/lms.ts';
import { collectCalItems } from '../lib/data/calendar.ts';
import { reminderTargets } from '../lib/data/notifs.ts';
import { isUpcomingUrgent } from '../lib/data/home-deadlines.ts';
import { lmsTaskSearch } from '../lib/data/search.ts';

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

test('retained lecture ranges survive re-merges and subsequent failures without inventing check times', () => {
  const lecture = (range, url = 'https://learn.hansung.ac.kr/mod/vod/view.php?id=1') =>
    [{ title: 'lecture', attended: true, ...(range ? { range, url } : {}) }];
  const older = snap('19', null, [], { vods: lecture('old range') });
  const newer = snap('20', null, [], { vods: lecture('new range') });
  const failed = snap('21', null, ['vod-range'], { vods: lecture(null) });
  const retained = mergeLmsSnapshot(newer, failed);
  const again = mergeLmsSnapshot(older, retained);
  assert.equal(again.courses[0].vods[0].range, 'new range');
  assert.equal(again.courses[0].vods[0].rangeRetainedAt, newer.fetchedAt);
  assert.equal(combineLmsSnapshots(older, retained).courses[0].vods[0].range, 'new range');
  const failedAgain = mergeLmsSnapshot(again, snap('22', null, ['vod-range'], { vods: lecture(null) }));
  assert.equal(failedAgain.courses[0].vods[0].range, 'new range');
  assert.equal(failedAgain.courses[0].vods[0].rangeRetainedAt, newer.fetchedAt);
  const listFailed = mergeLmsSnapshot(retained, snap('22', null, ['vod'], { vods: [] }));
  const afterListFailure = mergeLmsSnapshot(listFailed, snap('23', null, ['vod-range'], { vods: lecture(null) }));
  assert.equal(afterListFailure.courses[0].vods[0].rangeRetainedAt, newer.fetchedAt);
  const newerPrior = mergeLmsSnapshot(newer, mergeLmsSnapshot(older, failed));
  assert.equal(newerPrior.courses[0].vods[0].range, 'new range');
  assert.equal(newerPrior.courses[0].vods[0].rangeRetainedAt, newer.fetchedAt);
  const unknown = snap('21', null, ['vod-range'], { vods: lecture('unknown-age range') });
  const unknownList = mergeLmsSnapshot(unknown, snap('22', null, ['vod'], { vods: [] }));
  assert.ok(unknownList.courses[0].errors.includes('vod-range'));
  assert.equal(pendingTasks({ ...unknownList, courses: [{ ...unknownList.courses[0], vods: [{ ...unknownList.courses[0].vods[0], attended: false }] }] })[0].rangeRetainedAt, undefined);
  const unknownAgain = mergeLmsSnapshot(unknownList, snap('23', null, ['vod-range'], { vods: lecture(null) }));
  assert.equal(unknownAgain.courses[0].vods[0].rangeRetainedAt, undefined);
  const combinedFailures = mergeLmsSnapshot(unknown, snap('22', null, ['vod', 'vod-range'], { vods: [] }));
  assert.equal(combinedFailures.courses[0].errors.filter(error => error === 'vod-range').length, 1);
});

test('retained lecture deadlines are labelled separately from attendance across consumers', () => {
  const before = snap('20', null, [], { vods: [{ title: 'lecture', attended: false, range: '2026-09-22 23:59' }] });
  const failed = snap('21', null, ['vod-range'], { vods: [{ title: 'lecture', attended: false }] });
  const retained = mergeLmsSnapshot(before, failed);
  const now = Date.parse('2026-09-21T03:00:00Z');
  const task = pendingTasks(retained)[0];
  assert.equal(task.rangeUncertain, true);
  assert.equal(task.rangeRetainedAt, before.fetchedAt);
  assert.equal(task.uncertain, undefined, 'attendance remains independently confirmed');
  assert.equal(bingeQueue(retained)[0].rangeUncertain, true);
  const due = dueSoon(retained, now)[0];
  assert.equal(isUpcomingUrgent(due, now), false);
  assert.match(collectCalItems({ lms: retained })[0].meta, /기간 재확인/);
  assert.match(reminderTargets(retained, now)[0].body, /기간 재확인/);
  assert.match(lmsTaskSearch(retained.courses, '강의')[0].sub, /기간 재확인/);
  for (const failure of ['vod', 'timeout', 'budget']) {
    const listFailure = mergeLmsSnapshot(before, snap('21', null, [failure]));
    const listTask = pendingTasks(listFailure)[0];
    assert.equal(listTask.rangeUncertain, true, failure);
    assert.equal(listTask.rangeRetainedAt, before.fetchedAt, failure);
    assert.equal(isUpcomingUrgent(dueSoon(listFailure, now)[0], now), false, failure);
    assert.match(collectCalItems({ lms: listFailure })[0].meta, /기간 재확인/, failure);
  }
});

test('fresh task list remains newer when only one submission status was retained', () => {
  const old = snap('20', true);
  const partial = snap('21', null, [], { assigns: [
    { title: 'assignment', submitted: false, uncertain: true },
    { title: 'new assignment', submitted: false },
  ] });
  const withRetainedStatus = mergeLmsSnapshot(old, partial);
  assert.equal(withRetainedStatus.courses[0].retainedAtByKind.assign, old.fetchedAt);
  assert.equal(withRetainedStatus.courses[0].assigns[0].statusRetainedAt, old.fetchedAt);
  const nextFailure = mergeLmsSnapshot(withRetainedStatus, snap('22', null, ['assign']));
  assert.equal(nextFailure.courses[0].retainedAtByKind.assign, partial.fetchedAt);
  assert.equal(nextFailure.courses[0].assigns[0].statusRetainedAt, old.fetchedAt);
  assert.equal(validateLms(nextFailure).courses[0].assigns[0].statusRetainedAt, old.fetchedAt);
  const competing = { ...snap('20', false), fetchedAt: '2026-09-20T12:00:00Z' };
  const result = mergeLmsSnapshot(competing, nextFailure);
  assert.equal(result.courses[0].assigns.length, 2);
  assert.equal(result.courses[0].assigns[1].title, 'new assignment');
  const renewedPartial = mergeLmsSnapshot(nextFailure, snap('23', null, [], { assigns: [
    { title: 'assignment', submitted: false, uncertain: true },
    { title: 'new assignment', submitted: false },
  ] }));
  assert.equal(renewedPartial.courses[0].assigns[0].submitted, true);
  assert.equal(renewedPartial.courses[0].assigns[0].statusRetainedAt, old.fetchedAt);
});
