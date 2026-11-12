// 서버 측 LMS 수집 파서 테스트 — node --experimental-transform-types tests/lms-server.test.mjs
import assert from 'node:assert/strict';
import {
  parseAssigns,
  parseQuizList,
  hasQuizAttempt,
  parseProgress,
  parseVodRanges,
  collectLms,
} from '../lib/server/lms.ts';

let pass = 0,
  fail = 0;
const t = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL:', name);
  }
};

// ── 과제 generaltable ─────────────────────────────────────────
const ASSIGN_HTML = `<table class="generaltable"><tbody>
<tr><td class="cell c0">1주차</td><td class="cell c1"><a href="/mod/assign/view.php?id=101">독후감 과제</a></td><td class="cell c2">2026-09-25 23:59</td><td class="cell c3">미제출</td></tr>
<tr><td class="cell c0"></td><td class="cell c1"><a href="/mod/assign/view.php?id=102">중간 레포트</a></td><td class="cell c2">-</td><td class="cell c3">제출 완료</td></tr>
<tr><td class="cell c0">2주차</td><td class="cell c1"><a href="https://learn.hansung.ac.kr/mod/assign/view.php?id=103">팀 과제</a></td><td class="cell c2">2026년 10月 02日 23:59</td><td class="cell c3">Not submitted</td></tr>
</tbody></table>`;
const assigns = parseAssigns(ASSIGN_HTML);
t('assign: 3개', assigns.length === 3);
t('assign: 미제출 판정', assigns[0].submitted === false);
t('assign: 제출 판정', assigns[1].submitted === true);
t('assign: 마감 - → null', assigns[1].due === null);
t('assign: 절대 URL', assigns[0].url.startsWith('https://learn.hansung.ac.kr'));
t('assign: 年形式 정규화', assigns[2].due === '2026-10-02 23:59');

// ── 퀴즈 목록 + 응시 판정 ─────────────────────────────────────
const QUIZ_HTML = `<table class="generaltable"><tbody>
<tr><td class="cell c0">3주차</td><td class="cell c1"><a href="view.php?id=201">쪽지 시험</a></td><td class="cell c2">2026-10-05 18:00</td></tr>
</tbody></table>`;
const quizzes = parseQuizList(QUIZ_HTML);
t('quiz: 1개', quizzes.length === 1);
t('quiz: 상대경로 보정', quizzes[0].url === 'https://learn.hansung.ac.kr/mod/quiz/view.php?id=201');
t('quiz: due 파싱', quizzes[0].due === '2026-10-05 18:00');
t('attempt: 있음', hasQuizAttempt(`<table class="quizattemptsummary"><tbody><tr><td>1</td></tr></tbody></table>`));
t('attempt: 없음', !hasQuizAttempt(`<table class="quizattemptsummary"><tbody></tbody></table>`));
t('attempt: 테이블 부재', !hasQuizAttempt(`<div>no table</div>`));

// ── 온라인 출석부 (6열, 출석인정 요구시간 컬럼 포함) ────────────
const PROGRESS_HTML = `<table class="user_progress_table">
<thead><tr><th>주차</th><th>콘텐츠</th><th>시청시간</th><th>출석인정 요구시간</th><th>출석</th><th>주차 출석</th></tr></thead>
<tbody>
<tr><td rowspan="2">1</td><td>1주차 강의A</td><td>10:00</td><td>30:00</td><td>O</td><td>O</td></tr>
<tr><td>1주차 강의B</td><td>05:00</td><td>30:00</td><td>X</td><td></td></tr>
<tr><td>2</td><td>2주차 강의</td><td>00:00</td><td>40:00</td><td>X</td><td>일괄출석인정</td></tr>
</tbody></table>`;
const vods = parseProgress(PROGRESS_HTML);
t('vod: 3개', vods.length === 3);
t('vod: 출석 O', vods[0].attended === true && vods[0].status === 'O');
t('vod: 미수강 X', vods[1].attended === false);
t('vod: rowspan 주차 유지', vods[1].week === 1);
t('vod: 주차 전이', vods[2].week === 2);
t('vod: 일괄출석인정→O', vods[2].weeklyStatus === 'O');
t('vod: 빈 주차출석은 직전값', vods[1].weeklyStatus === 'O');
t('vod: 없는 표 → 빈 배열', parseProgress('<div>nothing</div>').length === 0);
// 5열 (요구시간 없음) — '출석' 컬럼이 요구시간으로 오인되지 않아야 함
const PROGRESS5 = `<table class="user_progress_table">
<thead><tr><th>주차</th><th>콘텐츠</th><th>시청시간</th><th>출석</th><th>주차 출석</th></tr></thead>
<tbody><tr><td>1</td><td>강의</td><td>9:00</td><td>O</td><td>O</td></tr></tbody></table>`;
const v5 = parseProgress(PROGRESS5);
t('vod5: 1개', v5.length === 1 && v5[0].attended === true);

// ── 강좌 페이지 VOD 링크/기간 ─────────────────────────────────
const COURSE_HTML = `<ul><li class="section" id="section-1"><ul>
<li class="activity modtype_vod" id="module-1"><div class="activityinstance">
<a href="https://learn.hansung.ac.kr/mod/vod/view.php?id=55"><span class="instancename">1주차 강의A<span class="accesshide"> 동영상</span></span><span class="text-ubstrap">2026-09-01 ~ 2026-09-07 23:59</span></a></div></li>
<li class="activity modtype_vod dimmed" id="module-2"><div class="activityinstance">
<a href="/mod/vod/view.php?id=56"><span class="instancename">숨겨진 강의</span></a></div></li>
<li class="activity modtype_assign" id="module-3"><div class="activityinstance">
<a href="/mod/assign/view.php?id=57"><span class="instancename">과제</span></a></div></li>
</ul></li></ul>`;
const ranges = parseVodRanges(COURSE_HTML);
t('range: 제목 정제(accesshide 제거)', !!ranges['1주차 강의A']);
t('range: 기간', ranges['1주차 강의A'].range.includes('2026-09-07'));
t('range: url', ranges['1주차 강의A'].url.includes('/mod/vod/view.php?id=55'));
t('range: dimmed 제외', !ranges['숨겨진 강의']);
t('range: assign 타입 제외', !ranges['과제']);

// ── collectLms 통합 (가짜 세션) ───────────────────────────────
// 실제 Moodle 로그인 페이지에는 /login/logout.php 링크가 항상 있음 — 수집기가
// 세션 생존 마커로 검사하므로 fixture에도 붙인다
const ok = (body) =>
  new Response(body + '<a href="/login/logout.php">x</a>');
const byUrl = (url) => {
  if (url.includes('user_progress_a.php')) return ok(PROGRESS_HTML);
  if (url.includes('mod/assign/index.php')) return ok(ASSIGN_HTML);
  if (url.includes('mod/quiz/index.php')) return ok(QUIZ_HTML);
  if (url.includes('mod/quiz/view.php'))
    return ok(`<table class="quizattemptsummary"><tbody><tr><td>x</td></tr></tbody></table>`);
  if (url.includes('course/view.php')) return ok(COURSE_HTML);
  return new Response('not found', { status: 404 });
};
const snap = await collectLms(
  { request: async (url) => byUrl(url) },
  [{ id: '999', name: '테스트과목' }],
);
t('snap: source', snap.source === 'cosmos-lms');
t('snap: 과목 1개', snap.courses.length === 1);
t('snap: vods 병합(range)', snap.courses[0].vods[0].range?.includes('2026-09-07'));
t('snap: vods 병합(url)', snap.courses[0].vods[0].url?.includes('id=55'));
t('snap: assigns', snap.courses[0].assigns.length === 3);
t('snap: quiz 응시판정', snap.courses[0].quizzes[0].submitted === true);
t('snap: errors 없음', (snap.courses[0].errors ?? []).length === 0);

// 부분 실패: assign만 500 → errors:['assign'], 나머지 유지
const snap2 = await collectLms(
  {
    request: async (url) => {
      if (url.includes('mod/assign')) throw new Error('upstream');
      return byUrl(url);
    },
  },
  [{ id: '999', name: '테스트과목' }],
);
t('snap2: errors=assign', snap2.courses[0].errors?.includes('assign'));
t('snap2: vods 유지', snap2.courses[0].vods.length === 3);

// 세션 만료: 로그인 폼만 온 응답 → 빈 결과로 삼키지 않고 errors로 표면화
const snap3 = await collectLms(
  {
    request: async () =>
      new Response('<form action="/login/index.php"><input name="password"></form>'),
  },
  [{ id: '999', name: '테스트과목' }],
);
t('snap3: vod 오류 표면화', snap3.courses[0].errors?.includes('vod'));
t('snap3: assign 오류 표면화', snap3.courses[0].errors?.includes('assign'));
t('snap3: quiz 오류 표면화', snap3.courses[0].errors?.includes('quiz'));
t(
  'snap3: 빈 결과',
  snap3.courses[0].vods.length === 0 && snap3.courses[0].assigns.length === 0,
);

// 표 없는 정상 페이지(마커 있음) → 오류 아닌 빈 결과
const snap4 = await collectLms(
  {
    request: async (url) =>
      url.includes('user_progress')
        ? ok('<div>리포트 없음</div>')
        : byUrl(url),
  },
  [{ id: '999', name: '테스트과목' }],
);
t(
  'snap4: 표 없음은 오류 아님',
  !(snap4.courses[0].errors ?? []).includes('vod') &&
    snap4.courses[0].vods.length === 0,
);

// 퀴즈 상세 조회 실패 → 미응시 단정 금지: uncertain 표시 + quiz-check 오류
const snap5 = await collectLms(
  {
    request: async (url) => {
      if (url.includes('mod/quiz/view.php')) throw new Error('upstream');
      return byUrl(url);
    },
  },
  [{ id: '999', name: '테스트과목' }],
);
t('snap5: 퀴즈 목록은 수집됨', snap5.courses[0].quizzes.length === 1);
t('snap5: 실패는 uncertain으로 표시', snap5.courses[0].quizzes[0].uncertain === true);
t('snap5: submitted는 false 유지(미응시 단정 아님)', snap5.courses[0].quizzes[0].submitted === false);
t('snap5: errors=quiz-check', snap5.courses[0].errors?.includes('quiz-check'));
t('snap5: 목록 자체 오류 아님', !snap5.courses[0].errors?.includes('quiz'));

// 퀴즈 목록 페이지 자체 실패 → 기존처럼 errors:['quiz'], uncertain 아님
const snap6 = await collectLms(
  {
    request: async (url) => {
      if (url.includes('mod/quiz/index.php')) throw new Error('upstream');
      return byUrl(url);
    },
  },
  [{ id: '999', name: '테스트과목' }],
);
t('snap6: errors=quiz', snap6.courses[0].errors?.includes('quiz'));
t('snap6: quiz-check 아님', !snap6.courses[0].errors?.includes('quiz-check'));

console.log(`lms-server.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
