import { deriveNotifs, reminderTargets } from '../lib/data/notifs.ts';
import { parseDue } from '../lib/data/lms.ts';

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

const sec = (id, slots = []) => ({
  id,
  code: id.split('-')[0],
  section: 'N',
  name: '과목' + id,
  dept: 'AI·소프트웨어학과',
  deptCode: 'W080',
  category: '전선',
  credits: 3,
  year: '2',
  professor: 'p',
  room: 'r',
  cross: false,
  online: false,
  slots,
});

const act = (id, status, applyEnd) => ({
  id,
  key: id,
  title: '활동' + id,
  dept: '부서',
  status,
  statusLabel: status === 'open' ? '접수중' : '마감임박',
  applyStart: '2026-09-01',
  applyEnd,
  runStart: null,
  runEnd: null,
  dday: null,
  points: null,
  team: null,
  applicants: null,
  capacity: null,
  certified: false,
  url: '',
  cover: null,
});

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const snap = (items) => ({
  source: 'hsportal',
  sourceUrl: '',
  fetchedAt: '2026-09-18',
  itemCount: items.length,
  items,
});
const schedSnap = (items) => ({
  source: 'hansung-homepage',
  sourceUrl: '',
  fetchedAt: '2026-09-18',
  eventCount: items.length,
  items,
});

// 기본 — 연결 안내 항상 존재
let items = deriveNotifs({
  account: null,
  data: { saved: [], dept: 'AI·소프트웨어학과', year: '2023' },
  planned: [],
  acts: null,
  sched: null,
  now: NOW,
});
t('connection notif always present', items[0].id === 'connection');
t('disconnected title', items[0].title.includes('연결 전'));

// 프로필 미완성 → 정보 필요 알림
items = deriveNotifs({
  account: {},
  data: { saved: [], dept: '', year: '' },
  planned: [],
  acts: null,
  sched: null,
  now: NOW,
});
t('incomplete profile notif', items.some((i) => i.id === 'profile'));
t('connected title', items[0].title.includes('연결되어 있습니다'));

// 시간 충돌 알림
const clashing = [
  sec('A-N', [{ d: 0, s: 540, e: 630 }]),
  sec('B-N', [{ d: 0, s: 600, e: 690 }]),
];
items = deriveNotifs({
  account: null,
  data: { saved: [], dept: 'd', year: '2023' },
  planned: clashing,
  acts: null,
  sched: null,
  now: NOW,
});
t('conflict notif', items.some((i) => i.id === 'conflict' && i.title.includes('2개')));

// 마감 임박 — 7일 이내 + open/closing만
const acts1 = snap([
  act('hs-saved', 'open', iso(NOW + 2 * DAY)), // 저장됨, 범위 내
  act('hs-plain', 'open', iso(NOW + 5 * DAY)), // 범위 내
  act('hs-far', 'open', iso(NOW + 30 * DAY)), // 범위 밖
  act('hs-closed', 'closed', iso(NOW + 2 * DAY)), // closed 제외
  act('hs-nodate', 'open', null), // applyEnd 없음 제외
]);
items = deriveNotifs({
  account: null,
  data: { saved: ['hs-saved'], dept: 'd', year: '2023' },
  planned: [],
  acts: acts1,
  sched: null,
  now: NOW,
});
const actItems = items.filter((i) => i.id.startsWith('act-'));
t('deadline window filters', actItems.length === 2);
t('saved activity first', actItems[0].id === 'act-hs-saved');
t('saved label + purple', actItems[0].label === '저장한 활동' && actItems[0].tone === 'purple');
t('unsaved keeps statusLabel', actItems[1].label === '접수중' && actItems[1].tone === 'orange');

// 학사일정 — 시작일이 오늘~+7일 (과거 하루 유예 포함)
const sched1 = schedSnap([
  { id: 's1', title: '곧 시작', start: iso(NOW + 3 * DAY), end: null },
  { id: 's2', title: '어제 시작', start: iso(NOW - DAY), end: iso(NOW + DAY) },
  { id: 's3', title: '한달 뒤', start: iso(NOW + 30 * DAY), end: null },
]);
items = deriveNotifs({
  account: null,
  data: { saved: [], dept: 'd', year: '2023' },
  planned: [],
  acts: null,
  sched: sched1,
  now: NOW,
});
const schItems = items.filter((i) => i.id.startsWith('sch-'));
t('schedule window', schItems.length === 2);
t('schedule provenance label', schItems.every((i) => i.label === '공식 일정'));

// --- reminderTargets: 브라우저 마감 알림 예약 ---
const lmsSnap = (courses) => ({
  source: 'cosmos-lms',
  fetchedAt: '2026-09-18',
  courses,
});
const course = (id, title, assigns = [], quizzes = [], vods = []) => ({
  id,
  title,
  vods,
  assigns,
  quizzes,
});
const task = (title, due, submitted = false, uncertain) => ({
  title,
  due,
  submitted,
  uncertain,
});
const dueStr = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const lms1 = lmsSnap([
  course('c1', '알고리즘', [
    task('D+3 과제', dueStr(NOW + 3 * DAY)),
    task('당일 과제', dueStr(NOW + 5 * 36e5)), // 오늘 중 5시간 뒤
    task('지난 과제', dueStr(NOW - 2 * DAY)),
    task('완료 과제', dueStr(NOW + DAY), true),
  ]),
  course('c2', '머신러닝', [task('먼 과제', dueStr(NOW + 30 * DAY))]),
]);
const rem = reminderTargets(lms1, NOW);
t('reminder: 미래·미완료만', rem.length === 2);
t('reminder: 캘린더 D-3', rem.some((r) => r.title.startsWith('D-3 마감')));
t('reminder: 당일은 오늘 마감', rem.some((r) => r.title.startsWith('오늘 마감')));
const d3 = rem.find((r) => r.title.startsWith('D-3'));
t('reminder: fireAt=due-24h', d3.fireAt === parseDue(dueStr(NOW + 3 * DAY)) - DAY);
t('reminder: 임박은 즉시', rem.find((r) => r.title.startsWith('오늘')).fireAt === NOW);
t('reminder: 정렬 fireAt asc', rem.every((r, i) => !i || r.fireAt >= rem[i - 1].fireAt));
t('reminder: id lms- 형식', rem.every((r) => r.id.startsWith('lms-')));

const lms2 = lmsSnap([
  course('c1', '퀴즈과목', [], [task('2주차 퀴즈', dueStr(NOW + DAY), false, true)]),
]);
const rem2 = reminderTargets(lms2, NOW);
t('reminder: uncertain 표기', rem2.length === 1 && rem2[0].body.includes('응시 여부 확인 실패'));
t('reminder: 내일 마감', rem2[0].title.startsWith('내일 마감'));

console.log(`notifs: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
