import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRecommendationCandidates } from '../lib/data/recommendation.ts';

function section(id, credits, slots, extra = {}) {
  return {
    id,
    code: id,
    section: 'A',
    name: id,
    dept: '컴퓨터공학부',
    deptCode: 'CSE',
    category: '전선',
    credits,
    year: '2',
    professor: '',
    room: '',
    cross: false,
    online: false,
    slots,
    ...extra,
  };
}

const mon = section('mon', 3, [{ d: 0, s: 540, e: 615 }]);
const tueThu = section('tue-thu', 3, [
  { d: 1, s: 540, e: 615 },
  { d: 3, s: 540, e: 615 },
]);
const untimed = section('untimed', 2, [], { online: true, untimed: true });
const candidates = [mon, tueThu, untimed].map((s) => ({
  section: s,
  score: 1,
  reasons: [],
}));

test('조건을 지정하지 않으면 기존 추천 순서와 후보를 유지한다', () => {
  assert.deepEqual(
    filterRecommendationCandidates(candidates, [], {}).map((x) => x.section.id),
    ['mon', 'tue-thu', 'untimed'],
  );
});

test('피할 요일이 포함된 과목을 제외한다', () => {
  assert.deepEqual(
    filterRecommendationCandidates(candidates, [], { avoidedDays: [0] }).map(
      (x) => x.section.id,
    ),
    ['tue-thu', 'untimed'],
  );
});

test('다중 슬롯 과목은 하나라도 피할 요일이면 제외한다', () => {
  assert.deepEqual(
    filterRecommendationCandidates(candidates, [], { avoidedDays: [3] }).map(
      (x) => x.section.id,
    ),
    ['mon', 'untimed'],
  );
});

test('계획 학점과 후보 학점의 합이 상한을 넘으면 제외한다', () => {
  const planned = [section('planned', 16, [])];
  assert.deepEqual(
    filterRecommendationCandidates(candidates, planned, { maxCredits: 18 }).map(
      (x) => x.section.id,
    ),
    ['untimed'],
  );
});

test('시간 미정 과목은 피할 요일을 검증할 수 없어 후보에 남겨 둔다', () => {
  assert.deepEqual(
    filterRecommendationCandidates(candidates, [], {
      avoidedDays: [0, 1, 2, 3, 4],
    }).map((x) => x.section.id),
    ['untimed'],
  );
});

test('계획 학점이 이미 상한이면 추가 추천을 모두 제외한다', () => {
  const planned = [section('planned', 19, [])];
  assert.equal(
    filterRecommendationCandidates(candidates, planned, { maxCredits: 18 })
      .length,
    0,
  );
});
