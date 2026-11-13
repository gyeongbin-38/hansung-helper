import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPETENCY_GOALS, isCompetencyGoalId, recommendActivities } from '../lib/data/activity-recommend.ts';

const now = Date.parse('2026-11-12T01:00:00Z');
const day = 86400000;
const program = (id, days, extra = {}) => ({
  id, key: id.slice(3), title: `활동 ${id}`, dept: '학생지원팀',
  applyStart: new Date(now - day).toISOString(), applyEnd: new Date(now + days * day).toISOString(),
  runStart: null, runEnd: null, points: 30, status: 'open', statusLabel: '접수중',
  dday: null, team: '개인', applicants: null, capacity: null, certified: false,
  url: `https://hsportal.hansung.ac.kr/ko/program/all/view/${id.slice(3)}`, cover: null, ...extra,
});

const contest = program('hs-c1', 5, { title: 'SW 아이디어 공모전', dept: 'SW중심대학사업단', points: 20 });
const mentor = program('hs-c2', 10, { title: '전공 멘토링', dept: '학습지원센터', points: 0 });
const points = program('hs-c3', 20, { title: '비교과 포인트 특강', points: 100 });
const closed = program('hs-c4', -1, { title: '마감 지난 공모전' });
const done = program('hs-c5', 15, { title: '이미 수료한 공모전', points: 50 });
const items = [contest, mentor, points, closed, done];

test('competency goals have unique ids and labels', () => {
  const ids = COMPETENCY_GOALS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(isCompetencyGoalId('career'));
  assert.ok(!isCompetencyGoalId('not-a-goal'));
  for (const g of COMPETENCY_GOALS) {
    assert.ok(g.label.length > 0 && g.hint.length > 0);
  }
});

test('explore case recommends open activities without conditions', () => {
  const result = recommendActivities(items, { now });
  assert.equal(result.case, 'explore');
  assert.equal(result.deficit, null);
  assert.ok(result.results.every((r) => r.activity.id !== 'hs-c4'), '마감 활동은 제외');
  assert.ok(result.results.some((r) => r.activity.id === 'hs-c5'), '단계 정보가 없으면 수료 활동도 포함');
});

test('points case prefers activities that cover the deficit', () => {
  const result = recommendActivities(items, { now, points: 30, requiredPoints: 100 });
  assert.equal(result.case, 'points');
  assert.equal(result.deficit, 70);
  assert.equal(result.results[0].activity.id, 'hs-c3');
  assert.ok(result.results[0].reasons.some((r) => r.includes('포인트')));
  assert.ok(result.results.every((r) => (r.activity.points ?? 0) > 0));
});

test('competency case only returns goal-matching activities', () => {
  const result = recommendActivities(items, { now, goals: ['creative'] });
  assert.equal(result.case, 'competency');
  assert.equal(result.results[0].activity.id, 'hs-c1');
  assert.ok(result.results[0].reasons.includes('창의·도전'));
  assert.ok(result.results.every((r) => /공모|대회|아이디어|해커톤/.test(`${r.activity.title} ${r.activity.dept}`)));
});

test('balance case combines points deficit and goals', () => {
  const result = recommendActivities(items, { now, points: 30, requiredPoints: 100, goals: ['comm'] });
  assert.equal(result.case, 'balance');
  const ids = result.results.map((r) => r.activity.id);
  assert.ok(ids.includes('hs-c2'), '역량 매칭 활동 포함');
  assert.ok(ids.includes('hs-c3'), '포인트 활동 포함');
});

test('credited and done stages are excluded; invalid goals ignored', () => {
  const result = recommendActivities(items, {
    now, stages: { 'hs-c5': 'credited', 'hs-c3': 'done' }, goals: ['bogus-id'],
  });
  const ids = result.results.map((r) => r.activity.id);
  assert.ok(!ids.includes('hs-c5'));
  assert.ok(!ids.includes('hs-c3'));
  assert.equal(result.case, 'explore');
});

test('full points with goals becomes competency case', () => {
  const result = recommendActivities(items, { now, points: 100, requiredPoints: 100, goals: ['comm'] });
  assert.equal(result.case, 'competency');
  assert.equal(result.results[0].activity.id, 'hs-c2');
});

test('results are bounded by limit and sorted by score', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    program(`hs-x${i}`, 30, { title: `공모전 ${i}`, points: 10 + i }));
  const result = recommendActivities(many, { now, limit: 5 });
  assert.equal(result.results.length, 5);
  const scores = result.results.map((r) => r.score);
  assert.deepEqual([...scores].sort((a, b) => b - a), scores);
  assert.ok(result.matched >= 5);
});
