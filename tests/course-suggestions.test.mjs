import test from 'node:test';
import assert from 'node:assert/strict';
import { courseSuggestion } from '../lib/data/course-suggestions.ts';

const course = { code: 'M1', dept: '컴퓨터학과', category: '전필', slots: [{ d: 1, s: 600, e: 675 }] };
const input = { matchedDept: '컴퓨터학과', completedCodes: ['M2'], plannedCodes: [], prefs: ['졸업요건 충족', '오전', '금요일'], selectedDay: '1' };

test('실제 입력된 정보에 맞는 추천 근거를 제공한다', () => {
  const result = courseSuggestion(course, input);
  assert.ok(result.reasons.includes('확인된 이수 내역에 없는 전필'));
  assert.ok(result.reasons.includes('선택한 화요일 수업'));
  assert.ok(result.reasons.includes('선호 시간대: 오전'));
  assert.ok(result.reasons.includes('수업이 어려운 금요일 제외'));
});

test('학과·이수 정보가 없거나 과목이 이미 이수 또는 계획된 경우 추측하지 않는다', () => {
  const unknown = courseSuggestion(course, { ...input, matchedDept: undefined, completedCodes: [], prefs: [], selectedDay: '' });
  assert.deepEqual(unknown.reasons, []);
  assert.deepEqual(courseSuggestion(course, { ...input, completedCodes: ['M1'] }).reasons, []);
  assert.deepEqual(courseSuggestion(course, { ...input, plannedCodes: ['M1'] }).reasons, []);
  assert.deepEqual(courseSuggestion({ ...course, name: '데이터 분석' }, { ...input, completedNames: ['데이터분석'] }).reasons, []);
  assert.ok(!courseSuggestion({ ...course, slots: [] }, input).reasons.some((r) => r.includes('요일') || r.includes('시간대')));
});

test('확인된 시간만 비교하며 충돌하는 과목을 추천하지 않는다', () => {
  const plan = { id: 'P1', code: 'P1', slots: [{ d: 0, s: 540, e: 600 }] };
  const safe = courseSuggestion(course, { ...input, plannedSections: [plan] });
  assert.ok(safe.reasons.includes('시간 확인된 계획 과목과 충돌 없음'));
  const clash = courseSuggestion({ ...course, slots: [{ d: 0, s: 550, e: 610 }] }, { ...input, plannedSections: [plan] });
  assert.deepEqual(clash.reasons, []);
  const untimed = courseSuggestion({ ...course, untimed: true, slots: [] }, { ...input, plannedSections: [plan] });
  assert.ok(!untimed.reasons.some((reason) => reason.includes('충돌 없음')));
});
