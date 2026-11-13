import test from 'node:test';
import assert from 'node:assert/strict';
import { activityDigest, activityBrief, activityWorkspaceItems } from '../lib/data/activity-assistant.ts';
import { activityReminderTargets } from '../lib/data/notifs.ts';
import { advisorContext, guideReply } from '../lib/data/advisor.ts';

const now = Date.parse('2026-11-12T01:00:00Z');
const day = 86400000;
const program = (id, days, extra = {}) => ({ id, key: id.slice(3), title: `활동 ${id}`, dept: '학생지원팀',
  applyStart: new Date(now - day).toISOString(), applyEnd: new Date(now + days * day).toISOString(),
  runStart: null, runEnd: null, points: 30, status: 'open', statusLabel: '접수중',
  dday: null, team: '개인', applicants: null, capacity: null, certified: false,
  url: `https://hsportal.hansung.ac.kr/ko/program/all/view/${id.slice(3)}`, cover: null, ...extra });
const items = [program('hs-1', 1), program('hs-2', 3), program('hs-3', -1), program('hs-4', 9)];
const snapshot = { source: 'hsportal', sourceUrl: '', fetchedAt: new Date(now - 1000).toISOString(), itemCount: items.length, items };
const data = { year: '2024', admissionType: 'freshman', saved: ['hs-1', 'hs-3'], points: '20',
  info: { points: 432 }, actStatus: { 'hs-1': 'joined', 'hs-3': 'done' } };

test('digest keeps real school totals separate from uncredited activity awards and input memo', () => {
  const result = activityDigest(data, snapshot, now);
  assert.equal(result.points, 432);
  assert.equal(result.remainingPoints, 368);
  assert.equal(result.saved, 2);
  assert.equal(result.closing, 0);
  assert.equal(result.participating, 1);
  assert.equal(result.awaitingPoints, 1);
  assert.equal(result.picks[0].id, 'hs-2');
  assert.ok(!result.picks.some(a => a.id === 'hs-3'));
  assert.equal(activityDigest({ ...data, admissionType: undefined }, snapshot, now).requiredPoints, null);
  assert.equal(activityDigest({ ...data, admissionType: 'general-transfer' }, snapshot, now).remainingPoints, 0);
  assert.equal(activityDigest({ ...data, info: { points: 0 } }, snapshot, now).points, 0);
});
test('only fresh saved future deadlines schedule browser reminders', () => {
  const reminders = activityReminderTargets(snapshot, ['hs-1', 'hs-3', 'hs-4'], now);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].fireAt, now);
  assert.match(reminders[0].id, /hs-1/);
  assert.deepEqual(activityReminderTargets(snapshot, [], now), []);
  assert.deepEqual(activityReminderTargets(snapshot, ['hs-1'], now, { 'hs-1': 'applied' }), []);
  assert.deepEqual(activityReminderTargets({ ...snapshot, fetchedAt: new Date(now - 2 * day).toISOString() }, ['hs-1'], now), []);
  assert.deepEqual(activityReminderTargets({ ...snapshot, fetchedAt: new Date(now + day).toISOString() }, ['hs-1'], now), []);
});
test('selected program is grounded with no inferred eligibility or identity leakage', () => {
  const publicData = { catalog: null, activities: snapshot, schedule: null };
  const brief = activityBrief(items[0], snapshot.fetchedAt, now);
  assert.match(brief.eligibility, /확인 필요/);
  assert.match(brief.application, /확인되지 않음/);
  assert.equal(activityBrief(items[0], undefined, now).needsVerification, true);
  const privateData = { ...data, name: 'NEVER_SEND', studentId: 'NEVER_SEND', password: 'NEVER_SEND', info: undefined };
  const context = advisorContext(privateData, publicData, now, 'hs-1');
  assert.equal(context.publicFacts.selectedActivity.id, 'hs-1');
  assert.equal(advisorContext(null, publicData, now, 'hs-1').personalFacts, null);
  assert.doesNotMatch(JSON.stringify(context), /NEVER_SEND/);
  const reply = guideReply('신청 준비', null, publicData, now, 'hs-1');
  assert.match(reply.answer, /활동 hs-1/);
  assert.match(reply.answer, /접수는 이루어지지 않았어요/);
  assert.ok(reply.sources.some(s => s.route === 'activities/hs-1'));
});

test('workspace finder searches, filters and orders only loaded activity facts', () => {
  const saved = new Set(['hs-2']);
  assert.deepEqual(activityWorkspaceItems(items, { filter: 'saved', saved, now }).map(a => a.id), ['hs-2']);
  assert.deepEqual(activityWorkspaceItems(items, { filter: 'available', saved, now }).map(a => a.id), ['hs-2', 'hs-1', 'hs-4']);
  assert.deepEqual(activityWorkspaceItems(items, { filter: 'all', query: '학생지원', saved, now }).map(a => a.id), ['hs-2', 'hs-3', 'hs-1', 'hs-4']);
  assert.deepEqual(activityWorkspaceItems(items, { filter: 'all', query: '없는 활동', saved, now }), []);
});
