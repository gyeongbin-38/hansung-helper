import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { earliestRoadmapSemester, nextRegularSemesters, planRoadmap } from '../lib/data/roadmap.ts';

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
