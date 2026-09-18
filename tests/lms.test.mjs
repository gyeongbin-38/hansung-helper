import {
  validateLms,
  courseProgress,
  pendingTasks,
  dueSoon,
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

console.log(`lms.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
