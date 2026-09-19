import { searchAll } from '../lib/data/search.ts';

let pass = 0;
let fail = 0;
const t = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL', name);
  }
};

const sec = (id, name, dept = 'AI·소프트웨어학과') => ({
  id,
  code: id.split('-')[0],
  section: id.split('-')[1] ?? 'N',
  name,
  dept,
  deptCode: 'W080',
  category: '전선',
  credits: 3,
  year: '2',
  professor: '홍길동',
  room: '미래관',
  cross: false,
  online: false,
  slots: [{ d: 0, s: 540, e: 615 }],
});

const catalog = {
  semester: '2026-2',
  source: 'fixture',
  sourceFile: 'fixture',
  generatedAt: '2026-09-18',
  sectionCount: 3,
  untimedCount: 0,
  sections: [
    sec('W001-N', '튜터링 프로그래밍'),
    sec('W002-N', '자료구조'),
    sec('W003-N', '운영체제'),
  ],
};

const acts = [
  {
    id: 'hs-1',
    key: '1',
    title: '취업 특강',
    dept: '취업지원',
    status: 'open',
    statusLabel: '접수중',
    applyStart: '2026-09-01',
    applyEnd: '2026-09-25',
    runStart: '2026-10-01',
    runEnd: '2026-10-31',
    dday: null,
    points: null,
    team: null,
    applicants: null,
    capacity: null,
    certified: false,
    url: '',
    cover: null,
  },
];

const sched = [
  { id: 'sch-a', title: '2학기 수강신청', start: '2026-08-20', end: '2026-08-24' },
  { id: 'sch-b', title: '등록금 납부 기간', start: '2026-08-10', end: '2026-08-14' },
  { id: 'sch-c', title: '중간고사 기간', start: '2026-10-20', end: '2026-10-24' },
];

// 과목 매칭 → 상세 라우트 딥링크
let hits = searchAll('자료구조', catalog, acts, sched);
t('course hit deep-links to courses/:id', hits.length === 1 && hits[0].route === 'courses/W002-N');
t('course hit shows dept·credits·category sub', hits[0].sub.includes('전선'));

// 활동 매칭 → 상세 라우트
hits = searchAll('취업', catalog, acts, sched);
t('activity hit routes to activities/:id', hits.some((h) => h.route === 'activities/hs-1'));

// 학사일정 제목 직접 매칭 — 상세 라우트 딥링크
hits = searchAll('수강신청', catalog, acts, sched);
t('schedule title match routes to calendar/:id', hits.some((h) => h.route === 'calendar/sch-a'));
t('schedule hit sub has 공식 provenance', hits.find((h) => h.route.startsWith('calendar/')).sub.startsWith('공식 학사일정'));

// 동의어 확장 — '시험' 질의가 '중간고사' 제목을 잡는다
hits = searchAll('시험', catalog, acts, sched);
t('synonym: 시험 → 중간고사 이벤트', hits.some((h) => h.label === '중간고사 기간'));

hits = searchAll('납부', catalog, acts, sched);
t('synonym: 납부 → 등록금 납부 이벤트', hits.some((h) => h.label === '등록금 납부 기간'));

// 스냅샷 없음 → 해당 그룹 생략, 에러 없음
hits = searchAll('자료구조', null, null, null);
t('null snapshots → empty, no throw', hits.length === 0);

// 캡 — 과목 최대 4
const bigCatalog = { ...catalog, sections: Array.from({ length: 10 }, (_, i) => sec(`W10${i}-N`, '공통과목')) };
hits = searchAll('공통과목', bigCatalog, acts, sched);
t('course hits capped at 4', hits.filter((h) => h.route.startsWith('courses/')).length === 4);

// 순서 — 과목이 활동·일정보다 먼저
hits = searchAll('수강', catalog, acts, sched);
const firstCalendar = hits.findIndex((h) => h.route.startsWith('calendar/'));
t('ordering: courses before schedule', firstCalendar === -1 || hits.slice(0, firstCalendar).every((h) => !h.route.startsWith('calendar/')));

// LMS 수강 과목 — lms/:id 라우트 + 출처 부제
const lmsCourses = [
  { id: '101', title: '운영체제', prof: '김교수', vods: [], assigns: [], quizzes: [] },
  { id: '102', title: '자료구조 특강', vods: [], assigns: [], quizzes: [] },
];
hits = searchAll('운영체제', catalog, acts, sched, lmsCourses);
const lmsHit = hits.find((h) => h.route === 'lms/101');
t('lms course hit deep-links to lms/:id', lmsHit?.label === '운영체제');
t('lms hit sub has COSMOS provenance', lmsHit?.sub.startsWith('COSMOS 수업 현황'));
hits = searchAll('자료구조', catalog, acts, sched, lmsCourses);
t('lms hits come after catalog hits', hits[0].route === 'courses/W002-N' && hits.at(-1).route === 'lms/102');
hits = searchAll('운영체제', catalog, acts, sched);
t('no lms arg → no lms hits', !hits.some((h) => h.route.startsWith('lms')));

// LMS 개별 항목 — '과제 언제까지' 같은 자유질문에서 마감 단위까지 검색
const lmsTasks = [
  {
    id: '201',
    title: '교과(오프라인) 학부 알고리즘[A] 이지은',
    vods: [
      { title: '1주차 강의', attended: false, range: '2026-09-01 00:00 ~ 2026-09-08 23:59' },
      { title: '2주차 강의', attended: true, range: '2026-09-08 00:00 ~ 2026-09-15 23:59' },
    ],
    assigns: [
      { title: '정렬 구현 과제', due: '2026-10-05 23:59', submitted: false },
      { title: '기말 대체 과제', due: '2026-12-10 23:59', submitted: true },
    ],
    quizzes: [
      { title: '3주차 퀴즈', due: '2026-09-20 23:59', submitted: false, uncertain: true },
    ],
  },
  {
    id: '202',
    title: '운영체제',
    vods: [],
    assigns: [{ title: '스케줄링 리포트', due: '2026-10-01 23:59', submitted: false }],
    quizzes: [],
  },
];

// 제목 토큰 매칭 — 미완료가 완료보다 먼저
hits = searchAll('과제', catalog, [], [], lmsTasks);
const taskHits = hits.filter((h) => h.route.startsWith('lms/'));
t('kind word 과제 → 모든 과제 항목', taskHits.length === 3);
t('pending first, due asc', taskHits[0].label === '스케줄링 리포트' && taskHits[1].label === '정렬 구현 과제' && taskHits[0].sub.includes('미완료'));
t('done task labelled 완료', taskHits.at(-1).sub.includes('완료'));
t('task hit routes lms/:id', taskHits[1].route === 'lms/201');

// 질문형 어미 제거 — '알고리즘 과제 언제까지'가 과목+종류로 해석된다
hits = searchAll('알고리즘 과제 언제까지', catalog, [], [], lmsTasks);
const algHits = hits.filter((h) => h.route.startsWith('lms/'));
t('question words stripped, course-scoped tasks', algHits.length === 2 && algHits.every((h) => h.route === 'lms/201'));

// 종류 필터 — 퀴즈 질의는 퀴즈만
hits = searchAll('알고리즘 퀴즈', catalog, [], [], lmsTasks);
t('kind filter: 퀴즈 only', hits.length === 1 && hits[0].label === '3주차 퀴즈');
t('uncertain quiz → 확인 실패 표시', hits[0].sub.includes('응시 여부 확인 실패'));

// 초성 검색도 항목에 동작
hits = searchAll('ㅈㄹ ㄱㅎ ㄱㅈ', catalog, [], [], lmsTasks);
t('chosung on task title', hits.some((h) => h.label === '정렬 구현 과제'));

// 관계없는 질의는 매칭 안 함
hits = searchAll('안녕하세요', catalog, [], [], lmsTasks);
t('unrelated query → no lms task hits', !hits.some((h) => h.route.startsWith('lms/')));

// 마감 없는 항목도 제목으로 찾을 수 있다
hits = searchAll('리포트', catalog, [], [], lmsTasks);
t('task title match w/o kind word', hits.some((h) => h.label === '스케줄링 리포트' && h.sub.includes('마감 2026-10-01')));

// 마감 의도어 — 종류 지정 없이 그 과목의 모든 항목을 마감순으로
hits = searchAll('알고리즘 마감', catalog, [], [], lmsTasks);
const dlHits = hits.filter((h) => h.route === 'lms/201');
t('deadline word → all course tasks', dlHits.length === 5 && dlHits[0].label === '1주차 강의');

// 질문어만 있는 질의는 매칭하지 않는다
hits = searchAll('언제까지', catalog, [], [], lmsTasks);
t('pure question word → no hits', hits.length === 0);

console.log(`search: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
