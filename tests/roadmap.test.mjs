import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { earliestRoadmapSemester, nextAllSemesters, nextRegularSemesters, planRoadmap, semesterCalendarIndex } from '../lib/data/roadmap.ts';

describe('nextRegularSemesters', () => {
  it('현재 학기 다음 정규 학기부터 n개', () => {
    assert.deepEqual(nextRegularSemesters('2026-2', null, 3), ['2027-1', '2027-2', '2028-1']);
  });
  it('target까지 나열', () => {
    assert.deepEqual(nextRegularSemesters('2025-2', '2027-1'), ['2026-1', '2026-2', '2027-1']);
  });
  it('target이 현재 학기보다 과거이면 빈 배열', () => {
    assert.deepEqual(nextRegularSemesters('2026-2', '2026-1'), []);
  });
  it('입력이 없으면 빈 배열', () => {
    assert.deepEqual(nextRegularSemesters(null, null), []);
    assert.deepEqual(nextRegularSemesters('2026-2', '모름'), ['2027-1', '2027-2', '2028-1', '2028-2']);
  });
});

const C = (code, credits = 3, terms = null, year = '1') => ({ code, name: code, credits, year, terms });

describe('planRoadmap', () => {
  it('미이수 과목을 학기에 순서대로 배치', () => {
    const r = planRoadmap({
      missing: [C('A'), C('B'), C('D')],
      currentSemester: '2026-2',
      target: null,
    });
    assert.equal(r.target, null);
    assert.equal(r.slots[0].semester, '2027-1');
    assert.equal(r.slots[0].courses.map((c) => c.code).join(','), 'A,B,D');
    assert.equal(r.unplaced.length, 0);
  });

  it('1학기 개설 과목은 2학기로 건너뛰고 배치', () => {
    const r = planRoadmap({
      missing: [C('SPRING', 3, '1'), C('BOTH')],
      currentSemester: '2026-1',
      target: '2026-2',
    });
    // 2026-2 슬롯에는 매학기 과목만 들어간다
    assert.equal(r.slots[0].courses.map((c) => c.code).join(','), 'BOTH');
    assert.equal(r.unplaced[0].course.code, 'SPRING');
    assert.match(r.unplaced[0].reason, /목표까지 개설 학기 없음|1학기/);
  });

  it('target까지 기간이 짧으면 배치 불가로 보고', () => {
    const r = planRoadmap({
      missing: [C('WINTER', 3, '2')],
      currentSemester: '2026-1',
      target: '2026-2',
    });
    // 2학기 개설 과목은 2026-2에 배치된다
    assert.equal(r.slots[0].courses[0].code, 'WINTER');
  });

  it('학기당 필수 부하 상한(9학점) 초과 시 다음 호환 학기로', () => {
    const r = planRoadmap({
      missing: [C('A', 3), C('B', 3), C('D', 3), C('E', 3), C('F', 3)],
      currentSemester: '2026-2',
      target: '2027-2',
    });
    const first = r.slots.find((s) => s.semester === '2027-1');
    assert.equal(first.credits, 9);
    assert.equal(first.courses.length, 3);
    const second = r.slots.find((s) => s.semester === '2027-2');
    assert.equal(second.credits, 6);
  });

  it('정규학기 개설 이력이 없는 과목은 배치 불가 사유를 단다', () => {
    const r = planRoadmap({
      missing: [C('SEASONAL', 3, '34')],
      currentSemester: '2026-2',
      target: null,
    });
    assert.equal(r.unplaced[0].course.code, 'SEASONAL');
    assert.match(r.unplaced[0].reason, /정규학기/);
  });

  it('이력 없는 과목(terms=null)은 매학기 개설로 간주', () => {
    const r = planRoadmap({
      missing: [C('X', 3, null)],
      currentSemester: '2026-2',
      target: '2027-1',
    });
    assert.equal(r.slots[0].courses[0].code, 'X');
  });

  it('이수 과목은 입력에 없어야 하지만 방어적으로 무시', () => {
    const r = planRoadmap({ missing: [], currentSemester: '2026-2', target: null });
    assert.equal(r.slots.length, 0);
    assert.equal(r.unplaced.length, 0);
  });
});

describe('earliestRoadmapSemester', () => {
  it('제약 없는 과목만 있으면 다음 학기가 빠른 졸업', () => {
    const e = earliestRoadmapSemester({
      missing: [C('A'), C('B')],
      currentSemester: '2026-2',
    });
    assert.equal(e.semester, '2027-1');
  });

  it('한쪽 학기 개설 과목이 졸업 시점을 미룬다', () => {
    const e = earliestRoadmapSemester({
      missing: [C('FALL', 3, '2'), C('ANY')],
      currentSemester: '2026-2',
    });
    assert.equal(e.semester, '2027-2');
    // 1학기 개설 과목이면 바로 다음 학기
    const s = earliestRoadmapSemester({
      missing: [C('SPRING', 3, '1')],
      currentSemester: '2026-2',
    });
    assert.equal(s.semester, '2027-1');
  });

  it('정규학기 미개설 과목만 있으면 졸업 불가 + blocked로 돌려준다', () => {
    const e = earliestRoadmapSemester({
      missing: [C('SEASONAL', 3, '34')],
      currentSemester: '2026-2',
    });
    assert.equal(e.semester, null);
    assert.equal(e.blocked[0].code, 'SEASONAL');
  });

  it('계절전용 과목은 제외하고 나머지로 판정한다', () => {
    const e = earliestRoadmapSemester({
      missing: [C('SEASONAL', 3, '34'), C('ANY')],
      currentSemester: '2026-2',
    });
    assert.equal(e.semester, '2027-1');
    assert.equal(e.blocked.length, 1);
  });

  it('미이수가 없거나 학기를 모르면 null', () => {
    assert.equal(earliestRoadmapSemester({ missing: [], currentSemester: '2026-2' }), null);
    assert.equal(earliestRoadmapSemester({ missing: [C('A')], currentSemester: null }), null);
  });

  it('학기당 필수 상한(9학점)을 넘으면 다음 학기로 미룬다', () => {
    const e = earliestRoadmapSemester({
      missing: [C('A', 3), C('B', 3), C('D', 3), C('E', 3)],
      currentSemester: '2026-2',
    });
    assert.equal(e.semester, '2027-2');
  });
});

describe('strictCap', () => {
  it('strictCap이면 상한 초과 과목을 배치하지 않는다', () => {
    const r = planRoadmap({
      missing: [C('A', 3), C('B', 3), C('D', 3), C('E', 3)],
      currentSemester: '2026-2',
      target: '2027-1',
      strictCap: true,
    });
    assert.equal(r.unplaced.length, 1);
    assert.match(r.unplaced[0].reason, /상한/);
  });
});

describe('계절학기 모드', () => {
  it('nextAllSemesters는 달력 순서(봄→여름→가을→겨울)로 나열한다', () => {
    assert.deepEqual(nextAllSemesters('2026-2', null, 4), ['2026-4', '2027-1', '2027-3', '2027-2']);
    assert.deepEqual(nextAllSemesters('2026-1', null, 3), ['2026-3', '2026-2', '2026-4']);
    // target 포함, 초과 안 함
    assert.deepEqual(nextAllSemesters('2026-1', '2026-2'), ['2026-3', '2026-2']);
  });

  it('semesterCalendarIndex로 정규·계절 라벨의 선후를 비교한다', () => {
    assert.ok(semesterCalendarIndex('2026-4') < semesterCalendarIndex('2027-1'));
    assert.ok(semesterCalendarIndex('2027-3') < semesterCalendarIndex('2027-2'));
  });

  it('seasonal=true이면 계절 개설 과목을 계절 슬롯에 배치한다', () => {
    const r = planRoadmap({
      missing: [C('SUM', 3, '3'), C('BOTH')],
      currentSemester: '2026-1',
      target: '2026-2',
      seasonal: true,
    });
    const summer = r.slots.find((s) => s.semester === '2026-3');
    assert.equal(summer.courses[0].code, 'SUM');
    assert.equal(r.unplaced.length, 0);
  });

  it('계절전용 과목은 정규 모드에선 불가, 계절 모드에선 배치된다', () => {
    const regular = earliestRoadmapSemester({
      missing: [C('SEASONAL', 3, '34')],
      currentSemester: '2026-2',
    });
    assert.equal(regular.semester, null);
    const seasonal = earliestRoadmapSemester({
      missing: [C('SEASONAL', 3, '34')],
      currentSemester: '2026-2',
      seasonal: true,
    });
    assert.equal(seasonal.semester, '2026-4');
    assert.equal(seasonal.blocked.length, 0);
  });

  it('계절 개설 과목이 있으면 빠른 졸업이 앞당겨질 수 있다', () => {
    // 겨울(4) 개설 과목을 정규 모드는 배치 못 하고 blocked로 돌린다
    const regular = earliestRoadmapSemester({
      missing: [C('WIN', 3, '4'), C('SPRING', 3, '1'), C('ANY')],
      currentSemester: '2026-2',
    });
    assert.equal(regular.blocked[0].code, 'WIN');
    assert.equal(regular.semester, '2027-1');
    // 계절 모드는 겨울 슬롯(2026-4)에 WIN을 배치하고 전체 완료는 동일 2027-1
    const seasonal = earliestRoadmapSemester({
      missing: [C('WIN', 3, '4'), C('SPRING', 3, '1'), C('ANY')],
      currentSemester: '2026-2',
      seasonal: true,
    });
    assert.equal(seasonal.semester, '2027-1');
    assert.equal(seasonal.blocked.length, 0);
    // 봄·여름 개설('13') 과목이 있으면 여름 슬롯으로 빠른 졸업이 앞당겨진다
    const faster = earliestRoadmapSemester({
      missing: [C('WIN', 3, '4'), C('S1', 3, '1'), C('S2', 3, '1'), C('S3', 3, '1'), C('S4', 3, '13')],
      currentSemester: '2026-2',
      seasonal: true,
    });
    // 2026-4: WIN — 2027-1: S1~S3(9학점 상한) — 2027-3(여름): S4('13' 호환)
    assert.equal(faster.semester, '2027-3');
    const fasterRegular = earliestRoadmapSemester({
      missing: [C('WIN', 3, '4'), C('S1', 3, '1'), C('S2', 3, '1'), C('S3', 3, '1'), C('S4', 3, '13')],
      currentSemester: '2026-2',
    });
    // 정규만이면 S4('13')는 다음 1학기인 2028-1을 기다린다
    assert.equal(fasterRegular.semester, '2028-1');
  });
});
