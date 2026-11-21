import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findHistoryEntry,
  lastOfferedLabel,
  offeringLabel,
  offeringLabelFromTerms,
  suggestOfferingSemester,
} from '../lib/data/course-history.ts';
import { buildRequiredTrack } from '../lib/data/curriculum.ts';

test('개설 학기 패턴 라벨', () => {
  assert.equal(offeringLabelFromTerms('1'), '1학기 개설');
  assert.equal(offeringLabelFromTerms('2'), '2학기 개설');
  assert.equal(offeringLabelFromTerms('34'), '계절학기 개설');
  assert.equal(offeringLabelFromTerms('13'), '계절 포함 개설');
  assert.equal(offeringLabelFromTerms('12'), '매학기 개설');
  assert.equal(offeringLabelFromTerms('1234'), '계절 포함 개설');
  assert.equal(offeringLabel(null), null);
  assert.equal(offeringLabel({ name: 'x', terms: '1', last: '2024-1' }), '1학기 개설');
});

test('마지막 개설이 2년 이상 지났을 때만 경고한다', () => {
  const stale = { name: 'x', terms: '12', last: '2023-1' };
  assert.equal(lastOfferedLabel(stale, '2026-1'), '2023-1 이후 미개설');
  const recent = { name: 'x', terms: '12', last: '2025-1' };
  assert.equal(lastOfferedLabel(recent, '2026-1'), null);
  assert.equal(lastOfferedLabel(stale, null), null);
  assert.equal(lastOfferedLabel(null, '2026-1'), null);
});

test('잘못 담아둔 학기의 교정 후보 — 같은 학년도의 맞는 학기를 우선 제안한다', () => {
  const firstOnly = { name: 'x', terms: '1', last: '2026-1' };
  assert.equal(suggestOfferingSemester(firstOnly, '2027-2', '2026-1'), '2027-1');
  const secondOnly = { name: 'x', terms: '2', last: '2026-2' };
  assert.equal(suggestOfferingSemester(secondOnly, '2027-1', '2026-1'), '2027-2');
  // 맞는 학기가 지났으면 다음 해로 건너간다
  assert.equal(suggestOfferingSemester(firstOnly, '2026-2', '2026-2'), '2027-1');
  // 패턴에 '34'만 있으면 계절학기를 제안한다
  const seasonal = { name: 'x', terms: '3', last: '2025-3' };
  assert.equal(suggestOfferingSemester(seasonal, '2027-2', '2026-1'), '2027-3');
  // 담아둔 학기 자체는 제외하고 가장 가까운 맞는 학기를 고른다(동일 거리면 이른 학기)
  assert.equal(suggestOfferingSemester(firstOnly, '2027-1', '2026-1'), '2026-1');
  assert.equal(suggestOfferingSemester(null, '2027-2', '2026-1'), null);
  assert.equal(suggestOfferingSemester(firstOnly, 'bad', '2026-1'), null);
});

const c = (code, name, kind, year = '2') => ({ code, name, kind, credits: 3, year });
const CURRICULUM = {
  semester: '2023-1',
  majors: {
    V021: {
      name: '[V021] 모바일소프트웨어트랙',
      courses: [c('K0010', '모바일프로그래밍', '전필'), c('K0011', '캡스톤디자인', '전필', '4')],
    },
  },
};
const EQUIV = {
  groups: {
    g1: { name: '모바일프로그래밍', courses: [{ code: 'K0010', name: '모바일프로그래밍' }, { code: 'K0099', name: '스마트폰프로그래밍' }] },
  },
};
const HISTORY = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  semesterCount: 84,
  courses: {
    K0011: { name: '캡스톤디자인', terms: '1', last: '2024-1' },
    K0099: { name: '스마트폰프로그래밍', terms: '2', last: '2025-2' },
  },
};

test('폐지 과목이 동일과목으로 개설되면 개설로 인정하고 실제 코드를 기록한다', () => {
  const t = buildRequiredTrack({
    curriculum: CURRICULUM,
    deptInput: '모바일소프트웨어트랙',
    completed: [],
    offeredCodes: new Set(['K0099']),
    equiv: EQUIV,
    history: HISTORY,
  });
  const course = t.groups[0].courses.find((x) => x.code === 'K0010');
  assert.equal(course.offered, true);
  assert.equal(course.offeredCode, 'K0099');
  // 이력은 형제 코드로도 찾는다
  assert.equal(course.hist.terms, '2');
});

test('동일과목 코드로 담은 계획도 계획 중으로 인정한다', () => {
  const t = buildRequiredTrack({
    curriculum: CURRICULUM,
    deptInput: '모바일소프트웨어트랙',
    completed: [],
    plannedCodes: new Set(['K0099']),
    equiv: EQUIV,
  });
  assert.equal(t.groups[0].courses.find((x) => x.code === 'K0010').status, 'planned');
});

test('이력 스냅샷이 없으면 hist 없이 동작한다', () => {
  const t = buildRequiredTrack({
    curriculum: CURRICULUM,
    deptInput: '모바일소프트웨어트랙',
    completed: [],
  });
  assert.equal(t.groups[0].courses.find((x) => x.code === 'K0011').hist, undefined);
});

test('직접 코드 이력이 형제보다 우선한다', () => {
  const t = buildRequiredTrack({
    curriculum: CURRICULUM,
    deptInput: '모바일소프트웨어트랙',
    completed: [],
    equiv: EQUIV,
    history: {
      ...HISTORY,
      courses: { ...HISTORY.courses, K0010: { name: '모바일프로그래밍', terms: '12', last: '2026-1' } },
    },
  });
  assert.equal(t.groups[0].courses.find((x) => x.code === 'K0010').hist.terms, '12');
});

test('findHistoryEntry — 코드 → 형제 → 동명 폴백 순으로 찾는다', () => {
  const h = {
    generatedAt: 'x', semesterCount: 1,
    courses: {
      A1: { name: '알파', terms: '1', last: '2024-1' },
      A2: { name: '알파', terms: '1', last: '2026-1' },   // 동명·동패턴 개편 코드
      B1: { name: '베타', terms: '1', last: '2020-1' },
      B2: { name: '베타', terms: '12', last: '2026-1' },  // 동명이과 의심 — 패턴 다름
      C9: { name: '감마', terms: '2', last: '2026-2' },
    },
  };
  const noSib = () => [];
  // 직접 코드 우선
  assert.equal(findHistoryEntry(h, { code: 'A1', name: '알파' }, noSib)?.last, '2024-1');
  // 이력에 없는 신코드 → 동명·동패턴 폴백, 가장 최근 개설 항목
  const renamed = findHistoryEntry(h, { code: 'A9', name: '알파' }, noSib);
  assert.equal(renamed?.last, '2026-1');
  // 동명이지만 패턴이 갈리면 붙이지 않는다
  assert.equal(findHistoryEntry(h, { code: 'B9', name: '베타' }, noSib), undefined);
  // 형제 코드가 있으면 폴백보다 우선
  assert.equal(findHistoryEntry(h, { code: 'ZZ', name: '알파' }, () => ['C9'])?.terms, '2');
  // 이름도 없으면 undefined
  assert.equal(findHistoryEntry(h, { code: 'ZZ', name: '없는과목' }, noSib), undefined);
  // 공백 차이는 무시한다
  assert.equal(findHistoryEntry(h, { code: 'A9', name: '알 파' }, noSib)?.last, '2026-1');
  assert.equal(findHistoryEntry(null, { code: 'A1', name: '알파' }), undefined);
});

test('필수 과목이 이력에 없는 개편 코드면 동명 폴백으로 패턴을 붙인다', () => {
  const t = buildRequiredTrack({
    curriculum: {
      semester: '2023-1',
      majors: { V021: { name: '[V021] 모바일소프트웨어트랙', courses: [c('K9999', '스마트폰프로그래밍', '전필')] } },
    },
    deptInput: '모바일소프트웨어트랙',
    completed: [],
    history: HISTORY, // K9999 없음, 동명 '스마트폰프로그래밍' K0099(terms '2')만 존재
  });
  assert.equal(t.groups[0].courses[0].hist?.terms, '2');
});
