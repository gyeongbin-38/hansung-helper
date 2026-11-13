import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend } from '../lib/data/timetable-recommendations.ts';

const section = (id, overrides = {}) => ({
  id, code: id, name: id, dept: '컴퓨터학과', category: '전필', year: '전학년',
  cross: true, online: false, slots: [{ d: 1, s: 600, e: 675 }], ...overrides,
});
const data = { dept: '컴퓨터학과', year: '2025', completed: [], prefs: ['', '오전', '금요일'], info: { completed: [{ code: 'DONE' }] } };
const planned = [section('PLAN', { slots: [{ d: 0, s: 540, e: 615 }] })];

test('실제 적용된 미이수 추정·선택 요일·충돌 검사 근거를 표시하고 이수한 과목을 제외한다', () => {
  const good = section('GOOD');
  const completed = section('DONE');
  const conflict = section('CLASH', { slots: [{ d: 0, s: 550, e: 600 }] });
  const sameName = section('OTHER', { name: '데이터 분석' });
  const withManual = { ...data, completed: [{ code: '수기-데이터분석', name: '데이터분석' }] };
  const result = recommend([good, completed, conflict, sameName, ...planned], withManual, planned, 6, { selectedDay: '1', sourceSemester: '2026-2' });
  assert.deepEqual(result.map((r) => r.section.id), ['GOOD']);
  assert.ok(result[0].reasons.includes('확인된 이수 내역에 없는 전필'));
  assert.ok(result[0].reasons.includes('선택한 화요일 수업'));
  assert.ok(result[0].reasons.includes('수업이 어려운 금요일 제외'));
  assert.ok(result[0].reasons.includes('시간 확인된 계획 과목과 충돌 없음'));
});

test('이수·시간이 미확인인 경우 미이수나 충돌 없음을 단정하지 않는다', () => {
  const untimed = section('ASYNC', { slots: [], untimed: true });
  const result = recommend([untimed], { ...data, completed: [], info: undefined, prefs: [] }, planned);
  assert.ok(result[0].reasons.includes('시간 미정 · 충돌 확인 필요'));
  assert.ok(!result[0].reasons.some((reason) => reason.includes('충돌 없음') || reason.includes('이수 내역에 없는')));
  const noPlan = recommend([section('NEW')], { ...data, info: undefined, prefs: [] }, []);
  assert.ok(!noPlan[0].reasons.some((reason) => reason.includes('충돌 없음')));
});

test('자료 연도 없이 학년을 추측하지 않고, 선택한 요일과 다른 과목은 제외한다', () => {
  const no = section('NO', { year: '2', slots: [{ d: 2, s: 600, e: 675 }] });
  const result = recommend([no], { ...data, prefs: [] }, [], 6, { selectedDay: '1' });
  assert.deepEqual(result, []);
  assert.ok(!recommend([no], { ...data, prefs: [] }, [])[0].reasons.some((reason) => reason.includes('학년')));
});

test('타학과 수강 가능 과목은 본인 학과 과목보다 후순위로 밀려난다', () => {
  const mine = section('MINE', { dept: '컴퓨터학과', category: '전선' });
  const other = section('OTHER', { dept: '디자인학과', category: '전필' });
  const result = recommend([other, mine], { ...data, prefs: ['졸업요건 충족', '오전', '금요일'] }, [], 6);
  assert.deepEqual(result.map((r) => r.section.id), ['MINE', 'OTHER']);
  assert.ok(result[1].reasons.includes('타학과 수강 가능 과목'));
});

test('같은 과목의 여러 분반은 점수가 높은 하나만 추천한다', () => {
  const a = section('A', { code: 'SAME', name: '같은과목', slots: [{ d: 1, s: 600, e: 675 }] });
  const b = section('B', { code: 'SAME', name: '같은과목', slots: [{ d: 1, s: 600, e: 675 }] });
  const c = section('C', { code: 'SAME', name: '같은과목', slots: [{ d: 1, s: 600, e: 675 }] });
  const other = section('D', { code: 'DIFF', name: '다른과목' });
  const result = recommend([a, b, c, other], { ...data, prefs: [] }, [], 6);
  assert.deepEqual(result.map((r) => r.section.code), ['SAME', 'DIFF']);
});
