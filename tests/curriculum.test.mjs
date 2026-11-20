import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRequiredTrack,
  findRetakeCandidates,
  majorLabel,
  missingRequiredCodeSet,
  pickCurriculumSemester,
} from '../lib/data/curriculum.ts';

const INDEX = {
  semesters: {
    '2019-2': { majors: {} },
    '2020-1': { majors: {} },
    '2022-1': { majors: {} },
    '2023-1': { majors: {} },
    '2023-2': { majors: {} },
  },
};

const c = (code, name, kind, year = '2') => ({ code, name, kind, credits: 3, year });

const CURRICULUM = {
  semester: '2023-1',
  majors: {
    V020: {
      name: '[V020] 컴퓨터공학부',
      courses: [c('K0001', '공학기초', '전필', '1'), c('K0002', '공학수학', '전선'), c('K0011', '캡스톤디자인', '전필', '4')],
    },
    V021: {
      name: '[V021] 모바일소프트웨어트랙',
      courses: [c('K0010', '모바일프로그래밍', '전필', '2'), c('K0011', '캡스톤디자인', '전필', '4'), c('K0012', '선택과목', '전선')],
    },
    A040: {
      name: '[A040] 영어영문학부',
      courses: [c('P0001', '영문학개론', '전필', '1')],
    },
    L11E: {
      name: '[L11E] 교양필수',
      courses: [c('L0001', '글쓰기', '교필', '1'), c('L0002', '영어', '교필', '1')],
    },
    L11F: {
      name: '[L11F] 선택필수교양',
      courses: [c('L0010', '인문선택A', '선필교'), c('L0011', '인문선택B', '선필교')],
    },
  },
};

const EQUIV = {
  groups: {
    g1: { name: '모바일프로그래밍', courses: [{ code: 'K0010', name: '모바일프로그래밍' }, { code: 'K0099', name: '스마트폰프로그래밍' }] },
  },
};

test('입학연도 → 당해 1학기 우선, 없으면 2학기, 없으면 가장 가까운 학기', () => {
  assert.equal(pickCurriculumSemester(2023, INDEX), '2023-1');
  assert.equal(pickCurriculumSemester(2020, INDEX), '2020-1');
  assert.equal(pickCurriculumSemester(2021, INDEX), '2022-1'); // 2021 없음 → 가장 가까운 이후
  assert.equal(pickCurriculumSemester(2024, INDEX), '2023-2'); // 이후 없음 → 가장 가까운 이전
  assert.equal(pickCurriculumSemester(undefined, INDEX), null);
  assert.equal(pickCurriculumSemester(2023, null), null);
  assert.equal(pickCurriculumSemester(2023, { semesters: {} }), null);
});

test('전공명 라벨에서 코드 접두를 제거한다', () => {
  assert.equal(majorLabel('[V021] 모바일소프트웨어트랙'), '모바일소프트웨어트랙');
  assert.equal(majorLabel('교양필수'), '교양필수');
});

test('학부 입력 시 학부 공통 + 형제 트랙 전공을 함께 보여준다', () => {
  const t = buildRequiredTrack({ curriculum: CURRICULUM, deptInput: '컴퓨터공학부', completed: [] });
  const majors = t.groups.filter((g) => g.role.startsWith('major'));
  assert.deepEqual(majors.map((g) => g.title).sort(), ['모바일소프트웨어트랙', '컴퓨터공학부']);
  assert.equal(majors.find((g) => g.title === '컴퓨터공학부').role, 'major-common');
  assert.equal(majors.find((g) => g.title === '모바일소프트웨어트랙').role, 'major-track');
  // 캡스톤디자인이 공통·트랙에 중복으로 있어도 총계는 코드 기준 중복 제거
  assert.equal(t.requiredTotal, 3 + 2); // K0001·K0010·K0011 + 교필 2
});

test('전필·교필 과목의 이수 여부를 과목 단위로 판정한다', () => {
  const t = buildRequiredTrack({
    curriculum: CURRICULUM,
    deptInput: '모바일소프트웨어트랙',
    completed: [
      { code: 'K0010', name: '모바일프로그래밍' },
      { code: 'L0001', name: '글쓰기' },
    ],
    plannedCodes: new Set(['K0011']),
    offeredCodes: new Set(['L0002', 'K0099']),
  });
  const mobile = t.groups.find((g) => g.title === '모바일소프트웨어트랙');
  assert.equal(mobile.courses.find((x) => x.code === 'K0010').status, 'done');
  assert.equal(mobile.courses.find((x) => x.code === 'K0011').status, 'planned');
  const genReq = t.groups.find((g) => g.role === 'gen-required');
  assert.equal(genReq.courses.find((x) => x.code === 'L0001').status, 'done');
  const eng = genReq.courses.find((x) => x.code === 'L0002');
  assert.equal(eng.status, 'missing');
  assert.equal(eng.offered, true);
  // requiredDone/Total은 선택필수교양을 제외한 전필+교필 기준
  assert.equal(t.requiredTotal, 1 + 2 + 2); // 학부 공통 1 + 트랙 2 + 교필 2
  assert.equal(t.requiredDone, 2); // K0010 + L0001
});

test('트랙 입력 시 해당 트랙 + 학부 공통 전공을 함께 해석한다', () => {
  const t = buildRequiredTrack({ curriculum: CURRICULUM, deptInput: '모바일소프트웨어트랙', completed: [] });
  const majors = t.groups.filter((g) => g.role.startsWith('major'));
  assert.ok(majors.some((g) => g.title === '컴퓨터공학부'), '학부 공통 포함');
  assert.ok(majors.some((g) => g.title === '모바일소프트웨어트랙'), '트랙 포함');
});

test('동일과목(폐지 과목) 이수를 인정한다', () => {
  const t = buildRequiredTrack({
    curriculum: CURRICULUM,
    deptInput: '모바일소프트웨어트랙',
    completed: [{ code: 'K0099', name: '스마트폰프로그래밍' }],
    equiv: EQUIV,
  });
  const mobile = t.groups.find((g) => g.title === '모바일소프트웨어트랙');
  const course = mobile.courses.find((x) => x.code === 'K0010');
  assert.equal(course.status, 'done');
  assert.equal(course.matchedName, '스마트폰프로그래밍');
});

test('동일과목 스냅샷이 없으면 코드·과목명으로만 판정한다', () => {
  const t = buildRequiredTrack({
    curriculum: CURRICULUM,
    deptInput: '모바일소프트웨어트랙',
    completed: [{ code: 'K0099', name: '스마트폰프로그래밍' }],
  });
  const mobile = t.groups.find((g) => g.title === '모바일소프트웨어트랙');
  assert.equal(mobile.courses.find((x) => x.code === 'K0010').status, 'missing');
});

test('선택필수교양은 필수 총계에서 제외한다', () => {
  const t = buildRequiredTrack({ curriculum: CURRICULUM, deptInput: '영어영문학부', completed: [] });
  const sel = t.groups.find((g) => g.role === 'gen-selective');
  assert.ok(sel);
  assert.equal(sel.courses.length, 2);
  assert.equal(t.requiredTotal, 1 + 2); // 영문 전필 1 + 교필 2
});

test('학과 미입력·미해석이어도 교양 그룹은 보여준다', () => {
  const t = buildRequiredTrack({ curriculum: CURRICULUM, deptInput: '', completed: [] });
  assert.ok(t.groups.every((g) => g.role.startsWith('gen')));
});

test('F 받은 필수 과목을 재수강 대상으로 표시한다', () => {
  const t = buildRequiredTrack({
    curriculum: CURRICULUM,
    deptInput: '모바일소프트웨어트랙',
    completed: [],
    failed: [{ code: 'K0010', name: '모바일프로그래밍', grade: 'F' }],
  });
  const mobile = t.groups.find((g) => g.title === '모바일소프트웨어트랙');
  const course = mobile.courses.find((x) => x.code === 'K0010');
  assert.equal(course.status, 'missing');
  assert.equal(course.failed, 'F');
});

test('동일과목 폐지 과목의 F도 후속 과목의 재수강으로 인정한다', () => {
  const t = buildRequiredTrack({
    curriculum: CURRICULUM,
    deptInput: '모바일소프트웨어트랙',
    completed: [],
    failed: [{ code: 'K0099', name: '스마트폰프로그래밍', grade: 'F' }],
    equiv: EQUIV,
  });
  const mobile = t.groups.find((g) => g.title === '모바일소프트웨어트랙');
  assert.equal(mobile.courses.find((x) => x.code === 'K0010').failed, 'F');
});

test('이후 이수에 성공한 과목은 재수강 표시를 하지 않는다', () => {
  const t = buildRequiredTrack({
    curriculum: CURRICULUM,
    deptInput: '모바일소프트웨어트랙',
    completed: [{ code: 'K0010', name: '모바일프로그래밍' }],
    failed: [{ code: 'K0010', name: '모바일프로그래밍', grade: 'F' }],
  });
  const mobile = t.groups.find((g) => g.title === '모바일소프트웨어트랙');
  const course = mobile.courses.find((x) => x.code === 'K0010');
  assert.equal(course.status, 'done');
  assert.equal(course.failed, undefined);
});

test('C+ 이하 개설 과목만 평점 개선 재수강 후보가 된다', () => {
  const out = findRetakeCandidates({
    completed: [
      { code: 'K0010', name: '모바일프로그래밍', credits: 3, grade: 'C+' },
      { code: 'K0001', name: '공학기초', credits: 3, grade: 'A0' },
      { code: 'K0011', name: '캡스톤디자인', credits: 3, grade: 'D0' },
      { code: 'L0001', name: '글쓰기', credits: 2, grade: 'C0' },
    ],
    offeredCodes: new Set(['K0010', 'K0011']),
  });
  assert.deepEqual(out.map((r) => r.code), ['K0011', 'K0010']); // 낮은 성적순
  assert.equal(out[0].grade, 'D0');
});

test('폐지 과목도 동일과목 개설로 재수강 인정된다', () => {
  const out = findRetakeCandidates({
    completed: [{ code: 'K0099', name: '스마트폰프로그래밍', credits: 3, grade: 'D+' }],
    offeredCodes: new Set(['K0010']),
    equiv: EQUIV,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].offeredCode, 'K0010');
});

test('이미 계획에 담은 과목과 미개설 과목은 재수강 후보에서 제외한다', () => {
  const out = findRetakeCandidates({
    completed: [
      { code: 'K0010', name: '모바일프로그래밍', credits: 3, grade: 'C+' },
      { code: 'K0001', name: '공학기초', credits: 3, grade: 'C0' },
    ],
    offeredCodes: new Set(['K0010', 'K0001']),
    plannedCodes: new Set(['K0010']),
  });
  assert.deepEqual(out.map((r) => r.code), ['K0001']);
});

test('missingRequiredCodeSet — 미이수 필수 + 동일과목 확장, 이수·계획·선필교 제외', () => {
  const t = buildRequiredTrack({
    curriculum: CURRICULUM,
    deptInput: '컴퓨터공학부',
    completed: [{ code: 'K0001', name: '공학기초' }],
    plannedCodes: new Set(['L0001']),
    equiv: EQUIV,
  });
  const set = missingRequiredCodeSet({ track: t, trackName: '모바일소프트웨어트랙', equiv: EQUIV });
  // 공학기초(이수)·글쓰기(계획)는 빠지고, 캡스톤·영어·모바일프로그래밍(+형제 K0099)이 든다
  assert.ok(set.has('K0011') && set.has('L0002') && set.has('K0010') && set.has('K0099'));
  assert.ok(!set.has('K0001') && !set.has('L0001'));
  // 선택필수교양은 개별 과목이 필수가 아니므로 제외
  assert.ok(!set.has('L0010') && !set.has('L0011'));
});

test('missingRequiredCodeSet — 트랙 미지정·다른 트랙이면 트랙 과목을 제외한다', () => {
  const t = buildRequiredTrack({ curriculum: CURRICULUM, deptInput: '컴퓨터공학부', completed: [] });
  const none = missingRequiredCodeSet({ track: t, trackName: null });
  assert.ok(!none.has('K0010') && none.has('K0011') && none.has('L0001'));
  const other = missingRequiredCodeSet({ track: t, trackName: '빅데이터트랙' });
  assert.ok(!other.has('K0010'));
});
