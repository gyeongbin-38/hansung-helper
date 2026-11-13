import test from 'node:test';
import assert from 'node:assert/strict';
import { targetProgress, creditDistribution, activityStageCounts, requirementSegments, categoryBreakdown, semesterBreakdown, categoryLabel } from '../lib/data/visual-progress.ts';

test('requirement segments split earned, planned, remaining without exceeding the target', () => {
  assert.equal(requirementSegments(50, 0, null), null);
  assert.equal(requirementSegments(50, 0, 0), null);
  assert.equal(requirementSegments(NaN, 0, 130), null);
  assert.deepEqual(requirementSegments(50, 12, 130), { done: 50, plan: 12, rest: 68, over: 0, donePct: 38.5, planPct: 9.2, restPct: 52.3 });
  assert.deepEqual(requirementSegments(125, 12, 130), { done: 125, plan: 5, rest: 0, over: 0, donePct: 96.2, planPct: 3.8, restPct: 0 });
  assert.deepEqual(requirementSegments(900, 0, 800), { done: 800, plan: 0, rest: 0, over: 100, donePct: 100, planPct: 0, restPct: 0 });
  assert.equal(requirementSegments(10, -3, 20).plan, 0);
});
test('category breakdown groups credits by school category with readable labels', () => {
  const rows = categoryBreakdown([
    { category: '전선', credits: 3 }, { category: '교필', credits: 2 }, { category: '전선', credits: 3 },
    { category: '전필', credits: 3 }, { category: '알수없음', credits: 1 }, { category: '일교', credits: -1 },
  ]);
  assert.deepEqual(rows.map(r => [r.label, r.credits, r.count]), [['전공선택', 6, 2], ['전공필수', 3, 1], ['교양필수', 2, 1], ['알수없음', 1, 1]]);
  assert.equal(categoryLabel('선필교'), '선택필수교양');
  assert.deepEqual(categoryBreakdown([]), []);
});
test('semester breakdown orders terms and keeps undated credits separate', () => {
  const result = semesterBreakdown([
    { semester: '2025-2', credits: 3 }, { semester: '2025-1', credits: 3 }, { semester: '2025-1', credits: 2 },
    { credits: 3 }, { semester: '2025-여름', credits: 1 },
  ]);
  assert.deepEqual(result.items, [{ semester: '2025-1', credits: 5, count: 2 }, { semester: '2025-2', credits: 3, count: 1 }]);
  assert.equal(result.undated, 4);
  assert.equal(result.max, 5);
  assert.deepEqual(semesterBreakdown([]), { items: [], undated: 0, max: 0 });
});

test('unknown requirements are not represented as zero percent; actual zero and exceeded goals remain valid', () => {
  assert.equal(targetProgress(50, null), null);
  assert.equal(targetProgress(null, 130), null);
  assert.equal(targetProgress(20, 0), null);
  assert.equal(targetProgress(NaN, 130), null);
  assert.equal(targetProgress(-1, 130), null);
  assert.deepEqual(targetProgress(0, 800), { percent: 0, remaining: 800 });
  assert.deepEqual(targetProgress(50, 130), { percent: 38, remaining: 80 });
  assert.deepEqual(targetProgress(796, 800), { percent: 99, remaining: 4 });
  assert.deepEqual(targetProgress(800, 800), { percent: 100, remaining: 0 });
  assert.deepEqual(targetProgress(900, 800), { percent: 100, remaining: 0 });
});
test('partial course detail leaves credit difference unclassified, and inconsistent totals are flagged', () => {
  assert.deepEqual(creditDistribution(50, 18, 23, 0), { values: [18, 23, 0, 9], size: 50, inconsistent: false });
  assert.deepEqual(creditDistribution(null, 18, 23, 3), { values: [18, 23, 3, 0], size: 44, inconsistent: false });
  const inconsistent = creditDistribution(30, 18, 23, 0);
  assert.equal(inconsistent.inconsistent, true);
  assert.equal(inconsistent.size, 41);
  assert.equal(inconsistent.values[3], 0);
  assert.equal(creditDistribution(null, 0, 0, 0).size, 0);
});
test('activity progress deduplicates tracked IDs and counts only explicit user stages', () => {
  const stages = activityStageCounts(['a', 'b', 'c'], [{ id: 'd' }, { id: 'a' }], { a: 'applied', b: 'done', d: 'credited', e: 'invalid' });
  assert.deepEqual(stages, { total: 5, counts: [1, 0, 1, 1], pending: 2 });
  assert.deepEqual(activityStageCounts([], [], {}), { total: 0, counts: [0, 0, 0, 0], pending: 0 });
});
