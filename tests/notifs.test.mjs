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

console.log(`notifs: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
