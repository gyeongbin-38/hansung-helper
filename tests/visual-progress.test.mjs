import test from 'node:test';
import assert from 'node:assert/strict';
import { targetProgress, creditDistribution, activityStageCounts } from '../lib/data/visual-progress.ts';

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
