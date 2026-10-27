import {
  addDays,
  addMonths,
  collectCalItems,
  dowOf,
  isoOf,
  itemsInRange,
  itemsOnDay,
  monthGrid,
  monthKeyOf,
  parseQuickAdd,
} from '../lib/data/calendar.ts';
import { buildIcs, semesterUntil } from '../lib/data/ics.ts';

let pass = 0;
let fail = 0;
const t = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL', name);
  }
};

/* ---------- 날짜 유틸 ---------- */
t('isoOf 형식', isoOf(new Date(2026, 0, 5)) === '2026-01-05');
t('addDays 월 경계', addDays('2026-01-31', 1) === '2026-02-01');
t('addDays 연 경계', addDays('2026-12-31', 1) === '2027-01-01');
t('addDays 음수', addDays('2026-03-01', -1) === '2026-02-28');
t('addMonths +1', addMonths('2026-01', 1) === '2026-02');
t('addMonths 연 경계', addMonths('2026-12', 1) === '2027-01');
t('addMonths -1', addMonths('2026-01', -1) === '2025-12');
t('dowOf 일요일', dowOf('2026-10-11') === 0); // 2026-10-11은 일요일
t('dowOf 월요일', dowOf('2026-10-12') === 1);
t('monthKeyOf', monthKeyOf('2026-10-31') === '2026-10');

/* ---------- monthGrid ---------- */
const g = monthGrid('2026-10');
t('grid 42칸', g.length === 42);
t('grid 첫 칸 일요일', dowOf(g[0].iso) === 0);
t('grid 1일 포함', g.some((c) => c.iso === '2026-10-01' && c.inMonth));
t('grid 말일 포함', g.some((c) => c.iso === '2026-10-31' && c.inMonth));
t(
  'grid 달 밖 표시',
  g.filter((c) => !c.inMonth).every((c) => monthKeyOf(c.iso) !== '2026-10'),
);
t('grid 연속성', g.every((c, i) => i === 0 || c.iso === addDays(g[i - 1].iso, 1)));

/* ---------- collectCalItems ---------- */
const lmsSnap = {
  source: 'cosmos-lms',
  fetchedAt: '2026-10-01T00:00:00Z',
  courses: [
    {
      id: 'c1',
      title: '인공지능개론',
      vods: [
        { title: '3주차 강의', attended: false, range: '2026-10-20 ~ 2026-10-26' },
      ],
      assigns: [
        { title: '과제1', due: '2026-10-22 23:59', submitted: false },
        { title: '과제2(제출함)', due: '2026-10-25 23:59', submitted: true },
      ],
      quizzes: [
        {
          title: '퀴즈1',
          due: '2026-10-24 23:59',
          submitted: false,
          uncertain: true,
        },
      ],
    },
  ],
};
const items = collectCalItems({
  schedule: [
    { id: 's1', title: '중간고사', start: '2026-10-20', end: '2026-10-26' },
    { id: 's2', title: '개교기념일', start: '2026-10-28', end: null },
  ],
  lms: lmsSnap,
  events: [
    { title: '팀플', date: '2026-10-21' },
    { title: '날짜오류', date: 'hello' },
  ],
});
t('학사 2건', items.filter((i) => i.kind === 'academic').length === 2);
t('제출 과제 제외', !items.some((i) => i.title === '과제2(제출함)'));
t('LMS 마감 3건', items.filter((i) => i.kind === 'lms').length === 3);
t(
  'LMS 메타',
  items.find((i) => i.title === '퀴즈1')?.meta?.includes('확인 실패'),
);
t('잘못된 개인 날짜 제외', !items.some((i) => i.title === '날짜오류'));
t(
  '기간 밴드 유지',
  items.find((i) => i.title === '중간고사')?.end === '2026-10-26',
);

/* ---------- itemsOnDay / itemsInRange ---------- */
const mid = itemsOnDay(items, '2026-10-22');
t('10/22 — 밴드 포함', mid.some((i) => i.title === '중간고사'));
t('10/22 — 과제 포함', mid.some((i) => i.title === '과제1'));
t('10/27 — 밴드 없음', !itemsOnDay(items, '2026-10-27').some((i) => i.title === '중간고사'));
t(
  'range 필터',
  itemsInRange(items, '2026-10-01', '2026-10-15').every(
    (i) => i.start <= '2026-10-15' && (i.end ?? i.start) >= '2026-10-01',
  ),
);
t(
  '범위 걸침 포함',
  itemsInRange(items, '2026-10-25', '2026-10-25').some(
    (i) => i.title === '중간고사',
  ),
);

/* ---------- parseQuickAdd ---------- */
const REF = '2026-10-11'; // 일요일
t('내일', parseQuickAdd('내일 팀플 회의', REF)?.date === '2026-10-12');
t('모레', parseQuickAdd('모레 제출', REF)?.date === '2026-10-13');
t(
  'N일 후',
  parseQuickAdd('5일 후 발표', REF)?.date === '2026-10-16',
);
t(
  'M월D일',
  parseQuickAdd('11월 3일 보고서', REF)?.date === '2026-11-03',
);
t(
  'M월D일 지남→내년',
  parseQuickAdd('10월 5일 재시험', REF)?.date === '2027-10-05',
);
t('M/D', parseQuickAdd('11/3 보고서', REF)?.date === '2026-11-03');
t(
  '연도 표기',
  parseQuickAdd('2027-03-02 개강', REF)?.date === '2027-03-02',
);
t(
  '다음주 월요일',
  parseQuickAdd('다음주 월요일 미팅', REF)?.date === '2026-10-19',
);
t(
  '이번주 금요일',
  parseQuickAdd('이번주 금요일 스터디', REF)?.date === '2026-10-16',
);
t(
  '같은 요일은 다음 주',
  parseQuickAdd('일요일 리마인드', REF)?.date === '2026-10-18',
);
t(
  'D-N',
  parseQuickAdd('D-7 시험 대비', REF)?.date === '2026-10-18',
);
t(
  '날짜 없음 → 선택일',
  (() => {
    const p = parseQuickAdd('도서 반납', REF);
    return p?.date === REF && p.dateFound === false;
  })(),
);
t(
  '제목에서 날짜 구문 제거',
  !parseQuickAdd('내일 팀플', REF).title.includes('내일'),
);
t('빈 입력 null', parseQuickAdd('   ', REF) === null);
t(
  '날짜만 있는 입력 null',
  parseQuickAdd('내일', REF) === null,
);

/* ---------- ICS ---------- */
const ics = buildIcs({
  items: [
    {
      id: 'ac-s1',
      kind: 'academic',
      title: '중간고사, 실기',
      start: '2026-10-20',
      end: '2026-10-26',
    },
    {
      id: 'pe-0',
      kind: 'personal',
      title: '팀플; 회의',
      start: '2026-10-21',
    },
  ],
  planned: [
    {
      id: 'CSE101-01',
      code: 'CSE101',
      section: '01',
      name: '자료구조',
      dept: 'AI응용학과',
      deptCode: 'W',
      category: '전필',
      credits: 3,
      year: '2',
      professor: '김',
      room: 'B107',
      cross: false,
      online: false,
      slots: [{ d: 0, s: 540, e: 615 }],
    },
  ],
  semester: '2026-2',
  semesterStartIso: '2026-09-01',
});
t('ics 헤더', ics.startsWith('BEGIN:VCALENDAR'));
t('ics 종료', ics.trimEnd().endsWith('END:VCALENDAR'));
t('ics 범위 종일 exclusive', ics.includes('DTEND;VALUE=DATE:20261027'));
t('ics 이스케이프', ics.includes('중간고사\\, 실기') && ics.includes('팀플\\; 회의'));
t('ics 수업 RRULE', ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959'));
t('ics 수업 시각', ics.includes('DTSTART:20260907T090000')); // 9/1(화) 이후 첫 월요일 = 9/7
t('ics 반복 종료', ics.includes('DTEND:20260907T101500'));
t('semesterUntil 1학기', semesterUntil('2026-1') === '20260630T235959');
t('semesterUntil 무효', semesterUntil('??') === null);

console.log(`calendar.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
