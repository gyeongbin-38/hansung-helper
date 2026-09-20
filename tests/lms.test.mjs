import {
  validateLms,
  courseProgress,
  pendingTasks,
  dueSoon,
  staleDays,
  weekProgress,
  matchEnrollment,
  enrolledSectionIds,
  submissionItems,
  bingeQueue,
  relTime,
  currentSemesterStart,
  isPast,
  courseIsPast,
  parseDue,
} from '../lib/data/lms.ts';
import { deriveNotifs } from '../lib/data/notifs.ts';

let pass = 0;
let fail = 0;
const t = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL', name);
  }
};

const NOW = Date.parse('2026-09-18T00:00:00Z');
const DAY = 86400000;

const snap = {
  source: 'cosmos-lms',
  fetchedAt: '2026-09-17T10:00:00.000Z',
  courses: [
    {
      id: '101',
      title: '운영체제',
      prof: '김교수',
      vods: [
        { title: '1주차 강의', week: 1, status: 'O', attended: true },
        {
          title: '2주차 강의',
          week: 2,
          status: 'X',
          attended: false,
          range: '2026-09-14 ~ 2026-09-20 23:59',
          url: 'https://learn.hansung.ac.kr/mod/vod/view.php?id=55',
        },
      ],
      assigns: [
        {
          title: '과제1',
          url: 'https://learn.hansung.ac.kr/mod/assign/view.php?id=9',
          due: '2026-09-25 23:59',
          submitted: false,
        },
        { title: '과제0', due: null, submitted: true },
      ],
      quizzes: [
        {
          title: '퀴즈1',
          due: '2026-09-19 23:59',
          submitted: false,
          url: 'https://learn.hansung.ac.kr/mod/quiz/view.php?id=7',
        },
      ],
      errors: [],
    },
    {
      id: '102',
      title: '캡스톤',
      community: true,
      vods: [],
      assigns: [],
      quizzes: [],
    },
  ],
};

// ── validateLms ─────────────────────────────────────────────
t('validate: 정상 스냅샷 통과', validateLms(snap) !== null);
t('validate: source 불일치 거부', validateLms({ ...snap, source: 'x' }) === null);
t('validate: courses 비배열 거부', validateLms({ source: 'cosmos-lms', courses: 'x' }) === null);
t('validate: course 필수필드 누락 거부', validateLms({
  source: 'cosmos-lms',
  courses: [{ title: 'x' }],
}) === null);
t('validate: null/원시값 거부', validateLms(null) === null && validateLms('x') === null);
const v = validateLms(snap);
t('validate: optional 필드 보존', v.courses[0].vods[1].range === '2026-09-14 ~ 2026-09-20 23:59');
t('validate: 배열 누락 허용', validateLms({
  source: 'cosmos-lms',
  courses: [{ id: '1', title: 'x' }],
}) !== null);

// ── courseProgress ──────────────────────────────────────────
t('progress: 수강률 계산', courseProgress(snap.courses[0]).done === 1 && courseProgress(snap.courses[0]).total === 2);
t('progress: 강의 없는 과목', courseProgress(snap.courses[1]).total === 0);

// ── weekProgress ────────────────────────────────────────────
const weeks = weekProgress(snap.courses[0]);
t('weeks: 주차 그룹 수', weeks.length === 2);
t('weeks: 주차별 진도', weeks[0].week === 1 && weeks[0].done === 1 && weeks[0].total === 1 && weeks[1].week === 2 && weeks[1].done === 0 && weeks[1].total === 1);
t('weeks: range 전달', weeks[1].range === '2026-09-14 ~ 2026-09-20 23:59');
t('weeks: vod 없는 과목 빈 배열', weekProgress(snap.courses[1]).length === 0);
const noWeek = weekProgress({
  id: 'x', title: 'x', vods: [{ title: 'a', attended: true }, { title: 'b', week: 3, attended: false }], assigns: [], quizzes: [],
});
t('weeks: week 미기재 항목 제외', noWeek.length === 1 && noWeek[0].week === 3 && noWeek[0].total === 1);
t('weeks: 주차 정렬', weekProgress({
  id: 'x', title: 'x',
  vods: [
    { title: 'a', week: 5, attended: true },
    { title: 'b', week: 2, attended: false },
    { title: 'c', week: 5, attended: false },
  ],
  assigns: [], quizzes: [],
}).map((w) => w.week).join(',') === '2,5');

// ── matchEnrollment ─────────────────────────────────────────
const mkSection = (id, name, extra = {}) => ({
  id, code: id, section: '01', name, dept: 'x', deptCode: 'x',
  category: '전선', credits: 3, year: '2', professor: 'x', room: '',
  cross: false, online: false, slots: [], ...extra,
});
const catalog = {
  semester: '2026-2', source: 'x', sourceFile: 'x', generatedAt: '',
  sectionCount: 3, untimedCount: 0,
  sections: [
    mkSection('a1', '운영체제'),
    mkSection('a2', '운영체제', { section: '02' }),
    mkSection('b1', '데이터베이스'),
  ],
};
const catalog2 = {
  ...catalog,
  sections: [
    ...catalog.sections,
    mkSection('c1', '알고리즘'),
    mkSection('c2', '알고리즘', { section: '02' }),
    mkSection('d1', '자료구조및실습'),
  ],
};
const lmsMatch = {
  source: 'cosmos-lms', fetchedAt: 'x',
  courses: [
    { id: '1', title: '운영체제', vods: [], assigns: [], quizzes: [] },
    { id: '2', title: '[2026-2학기] 데이터베이스(01분반)', vods: [], assigns: [], quizzes: [] },
    { id: '3', title: '카탈로그에없는과목', vods: [], assigns: [], quizzes: [] },
    { id: '4', title: '캡스톤 커뮤니티', community: true, vods: [], assigns: [], quizzes: [] },
    // 실제 COSMOS fullname 형식
    { id: '5', title: '교과(오프라인) 학부 알고리즘[A] 이지은', vods: [], assigns: [], quizzes: [] },
    { id: '6', title: '교과(오프라인) 학부 자료구조및실습[A,B] 김철수', vods: [], assigns: [], quizzes: [] },
    { id: '7', title: '교과(온라인) 학부 머신러닝[B] 지준', vods: [], assigns: [], quizzes: [] },
    { id: '8', title: '커뮤니티 HSU AI 활용 윤리 지침 신상희 / 오현준', community: true, vods: [], assigns: [], quizzes: [] },
  ],
};
const em = matchEnrollment(lmsMatch, catalog2);
t('match: 정확한 이름 매칭', em[0].sections.length === 2);
t('match: 장식 제거 매칭', em[1].sections.length === 1 && em[1].sections[0].id === 'b1');
t('match: 매칭 없음 빈 배열', em[2].sections.length === 0);
t('match: 모든 과목 반환', em.length === 8);
t('match: 카테고리·분반·교수 장식 제거', em[4].sections.length === 2 && em[4].sections[0].id === 'c1');
t('match: 부분명칭 혼동 없음(최장 접두어)', em[5].sections.length === 1 && em[5].sections[0].id === 'd1');
t('match: 커뮤니티 과목 미매칭', em[7].sections.length === 0);

// ── enrolledSectionIds ──────────────────────────────────────
const eids = enrolledSectionIds(lmsMatch, catalog2);
t('enrolled: 매칭된 분반 id 집합', eids.size === 6 && eids.has('a1') && eids.has('a2') && eids.has('b1') && eids.has('c1') && eids.has('c2') && eids.has('d1'));
t('enrolled: 미매칭 과목 제외', !eids.has('x1') && eids.size === 6);

// ── pendingTasks ────────────────────────────────────────────
const pend = pendingTasks(snap);
t('pending: 미완료 항목 수', pend.length === 3);
t('pending: 종류 포함', pend.some((p) => p.kind === '강의') && pend.some((p) => p.kind === '과제') && pend.some((p) => p.kind === '퀴즈'));
t('pending: 과목명 전달', pend.every((p) => p.course === '운영체제'));

// ── dueSoon ─────────────────────────────────────────────────
const soon = dueSoon(snap, NOW, 7);
t('dueSoon: 7일 내 항목 수', soon.length === 2); // 강의(9/20), 퀴즈(9/19) — 과제(9/25)는 7일 초과
t('dueSoon: 마감 빠른 순 정렬', soon[0].title === '퀴즈1' && soon[1].title === '2주차 강의');
t('dueSoon: 마감 미기재 제외', !pendingTasks(snap).some((p) => p.title === '과제0' ));
t('dueSoon: range 끝날짜 사용', soon.some((p) => p.title === '2주차 강의' && p.dueTs === Date.parse('2026-09-20T23:59')));
const far = dueSoon(snap, NOW, 2);
t('dueSoon: 2일 창', far.length === 1 && far[0].title === '퀴즈1');
// 과거 하한 — 오래 지난 미완료가 다가오는 마감을 밀어내지 않아야 한다
const oldSnap = {
  ...snap,
  courses: [{
    id: '201', title: '고대과목',
    vods: [],
    assigns: [
      { title: '아주오래된과제', due: '2026-01-05 23:59', submitted: false },
      { title: '최근지난과제', due: '2026-09-15 23:59', submitted: false },
      { title: '다가오는과제', due: '2026-09-20 23:59', submitted: false },
    ],
    quizzes: [],
  }],
};
const withOld = dueSoon(oldSnap, NOW, 7);
t('dueSoon: 오래 지난 항목 제외', !withOld.some((p) => p.title === '아주오래된과제'));
t('dueSoon: 최근 지난 항목은 포함(마감 지남 표시용)', withOld.some((p) => p.title === '최근지난과제'));
t('dueSoon: 다가오는 항목 포함', withOld.some((p) => p.title === '다가오는과제'));
t('dueSoon: 정렬 유지', withOld[0].dueTs <= withOld[withOld.length - 1].dueTs);
const allPast = {
  ...oldSnap,
  courses: [{ ...oldSnap.courses[0], assigns: [
    { title: '만년전과제', due: '2020-01-01 00:00', submitted: false },
  ] }],
};
t('dueSoon: 전부 오래됐으면 빈 배열', dueSoon(allPast, NOW, 7).length === 0);

// ── uncertain (응시 확인 실패) ──────────────────────────────
const unSnap = {
  ...snap,
  courses: [{
    id: '301', title: '퀴즈과목',
    vods: [], assigns: [],
    quizzes: [
      { title: '확인된미응시', due: '2026-09-20 23:59', submitted: false },
      { title: '확인실패퀴즈', due: '2026-09-21 23:59', submitted: false, uncertain: true },
      { title: '응시완료', due: '2026-09-22 23:59', submitted: true },
    ],
  }],
};
const unPend = pendingTasks(unSnap);
t('uncertain: 미응시·확인실패 모두 pending 포함', unPend.length === 2);
t('uncertain: 플래그 전달', unPend.find((p) => p.title === '확인실패퀴즈')?.uncertain === true);
t('uncertain: 확인된 항목은 플래그 없음', !unPend.find((p) => p.title === '확인된미응시')?.uncertain);

// ── staleDays ───────────────────────────────────────────────
t('stale: 수집 당일 0일', staleDays(snap, NOW) === 0); // 14h 경과 → 0일
t('stale: 8일 경과', staleDays(snap, NOW + 8 * DAY) === 8);
t('stale: 미래 시각은 0', staleDays(snap, Date.parse(snap.fetchedAt) - DAY) === 0);
t('stale: 파싱 불가 → null', staleDays({ ...snap, fetchedAt: 'not-a-date' }, NOW) === null);

// ── submissionItems (제출·응시 통합 현황) ────────────────────
const subs = submissionItems(snap);
t('submissions: 완료 포함 전체', subs.length === 3);
t('submissions: 미완료 먼저 + 마감순', subs[0].title === '퀴즈1' && subs[1].title === '과제1');
t('submissions: 완료는 뒤로', subs[2].title === '과제0' && subs[2].submitted === true);
t('submissions: kind 구분', subs.find((s) => s.title === '퀴즈1').kind === '퀴즈' && subs.find((s) => s.title === '과제1').kind === '과제');
t('submissions: dueTs 파싱', subs[0].dueTs !== null && subs[2].dueTs === null);
const unSubs = submissionItems(unSnap);
t('submissions: uncertain 전달', unSubs.find((s) => s.title === '확인실패퀴즈')?.uncertain === true);
t('submissions: 응시완료 포함', unSubs.some((s) => s.title === '응시완료' && s.submitted));

// ── bingeQueue (강의 몰아듣기) ───────────────────────────────
const bq = bingeQueue(snap);
t('binge: 안 들은 강의만', bq.length === 1 && bq[0].title === '2주차 강의');
t('binge: range 끝날짜→dueTs', bq[0].dueTs === Date.parse('2026-09-20T23:59'));
t('binge: 주차·출석 원문 전달', bq[0].week === 2 && bq[0].status === 'X');
const bqSnap = {
  ...snap,
  courses: [{
    id: '401', title: '몰아듣기과목',
    vods: [
      { title: '기한없음 2주차', week: 2, attended: false, watched: '12:34', required: '45:00' },
      { title: '느린 마감 강의', week: 1, attended: false, range: '2026-09-01 ~ 2026-10-01 23:59' },
      { title: '빠른 마감 강의', week: 5, attended: false, range: '2026-09-01 ~ 2026-09-19 23:59' },
      { title: '기한없음 1주차', week: 1, attended: false },
      { title: '들은 강의', week: 3, attended: true },
    ],
    assigns: [], quizzes: [],
  }],
};
const bq2 = bingeQueue(bqSnap);
t('binge: 마감 빠른 순 정렬', bq2[0].title === '빠른 마감 강의' && bq2[1].title === '느린 마감 강의');
t('binge: 기한 없음은 주차순 뒤로', bq2[2].title === '기한없음 1주차' && bq2[3].title === '기한없음 2주차');
t('binge: 시청·요구시간 전달', bq2[3].watched === '12:34' && bq2[3].required === '45:00');
t('binge: 수강 완료 제외', !bq2.some((b) => b.title === '들은 강의'));
t('binge: vod 없는 과목 빈 큐', bingeQueue({ ...snap, courses: [snap.courses[1]] }).length === 0);

// ── deriveNotifs 통합 ───────────────────────────────────────
const notifs = deriveNotifs({
  account: null,
  data: { saved: [], dept: 'AI·소프트웨어학과', year: '22', lms: snap },
  planned: [],
  acts: null,
  sched: null,
  now: NOW,
});
const lmsNotifs = notifs.filter((n) => n.cat === '수업');
t('notifs: LMS 항목 도출', lmsNotifs.length === 2);
t('notifs: 라우트', lmsNotifs.every((n) => n.route === 'lms'));
t('notifs: D-day 라벨', lmsNotifs.some((n) => n.label.includes('D-')));
t('notifs: lms 없으면 수업 알림 없음', !deriveNotifs({
  account: null,
  data: {},
  planned: [],
  acts: null,
  sched: null,
  now: NOW,
}).some((n) => n.cat === '수업'));

// ── 실계정 수집 형태 (7과목, diag 포함) ─────────────────────
// 실제 lms-data.json의 구조를 익명화해 반영 — 진단 필드·주차 상태·
// 시청시간·uncertain 퀴즈·커뮤니티 과목이 검증을 통과하는지 확인.
const live = {
  source: 'cosmos-lms',
  fetchedAt: '2026-09-17T11:30:00.000Z',
  diag: { coursesVia: 'link-scan', pagePath: '/my/', scanned: 14 },
  courses: [
    {
      id: '46668',
      title: 'HSU AI 활용 커뮤니티',
      prof: '운영팀',
      community: true,
      vods: [],
      assigns: [],
      quizzes: [],
    },
    {
      id: '46001',
      title: '교과(온라인) 학부 데이터분석[01] 김교수',
      prof: '김교수',
      vods: [
        {
          title: '1주차 강의',
          week: 1,
          status: '출석',
          attended: true,
          weeklyStatus: '6/6',
          range: '2026-09-01 00:00 ~ 2026-09-07 23:59',
          watched: '42:10',
          required: '40:00',
          url: 'https://learn.hansung.ac.kr/mod/vod/view.php?id=11',
        },
        {
          title: '2주차 강의',
          week: 2,
          status: '결석',
          attended: false,
          weeklyStatus: '4/8',
          range: '2026-09-08 00:00 ~ 2026-09-14 23:59',
          watched: '12:00',
          required: '38:00',
          url: 'https://learn.hansung.ac.kr/mod/vod/view.php?id=12',
        },
      ],
      assigns: [
        {
          title: '중간 레포트',
          url: 'https://learn.hansung.ac.kr/mod/assign/view.php?id=21',
          due: '2026-09-20 23:59',
          submitted: false,
        },
        {
          title: '예습 퀴즈 대체 과제',
          url: 'https://learn.hansung.ac.kr/mod/assign/view.php?id=22',
          due: '2026-09-10 23:59',
          submitted: true,
        },
      ],
      quizzes: [
        {
          title: '2주차 퀴즈',
          url: 'https://learn.hansung.ac.kr/mod/quiz/view.php?id=31',
          due: '2026-09-19 23:59',
          submitted: false,
          uncertain: true,
        },
      ],
      errors: ['quiz-check'],
    },
    {
      id: '46002',
      title: '교과(오프라인) 학부 알고리즘[A] 이교수',
      prof: '이교수',
      vods: [
        {
          title: '보강 영상',
          attended: false,
          range: '2026-09-15 00:00 ~ 2026-09-21 23:59',
          url: 'https://learn.hansung.ac.kr/mod/vod/view.php?id=41',
        },
      ],
      assigns: [],
      quizzes: [
        {
          title: '쪽지 시험',
          url: 'https://learn.hansung.ac.kr/mod/quiz/view.php?id=42',
          submitted: true,
        },
      ],
    },
    { id: '46003', title: '캡스톤디자인', prof: '박교수', vods: [], assigns: [], quizzes: [] },
    { id: '46004', title: '웹 프로그래밍', vods: [], assigns: [], quizzes: [] },
    { id: '46005', title: '운영체제', prof: '최교수', vods: [], assigns: [], quizzes: [] },
    { id: '46006', title: '진로 탐색', vods: [], assigns: [], quizzes: [] },
  ],
};
const lv = validateLms(JSON.parse(JSON.stringify(live)));
t('live: 7과목 통과', lv !== null && lv.courses.length === 7);
t('live: diag 보존', lv.diag?.coursesVia === 'link-scan' && lv.diag.pagePath === '/my/' && lv.diag.scanned === 14);
t('live: community 보존', lv.courses[0].community === true);
t('live: 시청·요구시간 보존', lv.courses[1].vods[0].watched === '42:10' && lv.courses[1].vods[0].required === '40:00');
t('live: weeklyStatus 보존', lv.courses[1].vods[1].weeklyStatus === '4/8');
t('live: uncertain 퀴즈는 미응시 아님', lv.courses[1].quizzes[0].uncertain === true && lv.courses[1].quizzes[0].submitted === false);
t('live: quiz-check 오류 보존', lv.courses[1].errors?.includes('quiz-check') === true);
t('live: 남은 항목 집계', pendingTasks(lv).length === 4); // 미수강 강의 2 + 중간 레포트 + uncertain 퀴즈
t('live: uncertain도 pending에 포함(확인 필요)', pendingTasks(lv).some((p) => p.title === '2주차 퀴즈' && p.uncertain === true));
t('live: 제출 항목 구분', submissionItems(lv).length === 4);
t('live: relTime 단위', relTime('2026-09-17T11:29:40.000Z', Date.parse('2026-09-17T11:30:00.000Z')) === '방금');
t('live: relTime 분', relTime('2026-09-17T11:15:00.000Z', Date.parse('2026-09-17T11:30:00.000Z')) === '15분 전');
t('live: relTime 시간·일', relTime('2026-09-17T08:30:00.000Z', Date.parse('2026-09-17T11:30:00.000Z')) === '3시간 전' && relTime('2026-09-15T11:30:00.000Z', Date.parse('2026-09-17T11:30:00.000Z')) === '2일 전');
t('live: relTime 파싱 불가', relTime('not-a-date', NOW) === '시각 미상');
const lwp = weekProgress(lv.courses[1]);
t('live: 주차 진행', lwp.length === 2 && lwp[0].done === 1 && lwp[1].done === 0 && lwp[1].total === 1);

// ── 학기 경계 (지난 학기 분리) ──────────────────────────────
const SEM = currentSemesterStart(NOW); // 2026-09-18 → 2026-09-01
t('semester: 9월은 9/1 시작', SEM === new Date(2026, 8, 1).getTime());
t('semester: 3월은 3/1 시작', currentSemesterStart(Date.parse('2026-03-15')) === new Date(2026, 2, 1).getTime());
t('semester: 1~2월은 전년 9/1', currentSemesterStart(Date.parse('2026-02-15')) === new Date(2025, 8, 1).getTime());
t('isPast: 경계 이전 마감', isPast(parseDue('2025-11-23 23:59'), SEM) === true);
t('isPast: 경계 이후 마감', isPast(parseDue('2026-09-20 23:59'), SEM) === false);
t('isPast: 마감 미기재는 현재 간주(추측 금지)', isPast(null, SEM) === false);
t('isPast: 경계 없으면 항상 현재', isPast(parseDue('2020-01-01 00:00'), null) === false);
const mixedSnap = {
  ...snap,
  courses: [
    {
      id: '501', title: '지난학기과목',
      vods: [],
      assigns: [
        { title: '지난학기과제', due: '2025-11-23 23:59', submitted: false },
        { title: '지난학기퀴즈', due: '2025-10-30 23:59', submitted: false },
      ],
      quizzes: [],
    },
    {
      id: '502', title: '현재과목',
      vods: [{ title: '지난기간강의', attended: false, range: '2025-11-01 ~ 2025-11-30 23:59' }],
      assigns: [{ title: '이번학기과제', due: '2026-09-25 23:59', submitted: false }],
      quizzes: [],
    },
  ],
};
t('courseIsPast: 전부 지난 마감 → 지난 학기', courseIsPast(mixedSnap.courses[0], SEM) === true);
t('courseIsPast: 섞이면 현재', courseIsPast(mixedSnap.courses[1], SEM) === false);
t('courseIsPast: 마감 없는 과목은 현재', courseIsPast(snap.courses[1], SEM) === false);
t('courseIsPast: 경계 없으면 현재', courseIsPast(mixedSnap.courses[0], null) === false);
t('pending(before): 지난 학기 항목 제외', pendingTasks(mixedSnap, SEM).length === 1 && pendingTasks(mixedSnap, SEM)[0].title === '이번학기과제');
t('pending(no before): 전부 포함', pendingTasks(mixedSnap).length === 4);
const mixSubs = submissionItems(mixedSnap, SEM);
t('submissions(before): 지난 학기는 뒤로', mixSubs[mixSubs.length - 1].past === true);
t('submissions(before): 현재 먼저', mixSubs[0].title === '이번학기과제' && !mixSubs[0].past);
t('submissions(before): past 플래그', mixSubs.filter((s) => s.past).length === 2 && mixSubs.length === 3);
const mixBq = bingeQueue(mixedSnap, SEM);
t('binge(before): 지난 학기는 뒤로 + past', mixBq[0].past === true && mixBq.length === 1);
// 지난 학기 항목이 pastDays 창 안에 있어도 경계로 제외
const edgeSnap = {
  ...snap,
  courses: [{
    id: '503', title: '경계과목',
    vods: [], quizzes: [],
    assigns: [
      { title: '학기말과제', due: '2026-08-30 23:59', submitted: false },
      { title: '이번주과제', due: '2026-09-06 23:59', submitted: false },
    ],
  }],
};
// 2026-09-03 시점: 8/30 마감은 4일 전(pastDays 창 안)이지만 학기 경계 이전
const soonEdge = dueSoon(edgeSnap, Date.parse('2026-09-03'), 7, 7, SEM);
t('dueSoon(before): 경계 이전 항목 제외', !soonEdge.some((p) => p.title === '학기말과제'));
t('dueSoon(before): 현재 학기 유지', soonEdge.some((p) => p.title === '이번주과제'));

console.log(`lms.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
