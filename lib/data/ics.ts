/**
 * iCalendar(.ics) 생성 — 학사일정·수업 마감·개인 일정·계획 시간표를
 * 휴대폰 캘린더 앱으로 보내기 위한 텍스트 포맷. RFC 5545 최소 집합.
 */
import type { CalItem } from './calendar.ts';
import type { CourseSection } from './catalog.ts';
import { addDays } from './calendar.ts';

const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const dtDate = (iso: string) => iso.replace(/-/g, '');

/** 'YYYY-MM-DD' + 자정 이후 분 → 로컬 시각 'YYYYMMDDTHHMMSS' */
const dtMin = (iso: string, min: number) =>
  `${iso.replace(/-/g, '')}T${String(Math.floor(min / 60)).padStart(2, '0')}${String(min % 60).padStart(2, '0')}00`;

const fold = (line: string) => {
  // RFC 5545 §3.1 — 75 옥텟 제한. 한글은 UTF-8 3바이트라 보수적으로 접는다.
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = ch.charCodeAt(0) > 0x7ff ? 3 : ch.charCodeAt(0) > 0x7f ? 2 : 1;
    if (bytes + b > 74) {
      out.push(cur);
      cur = ' ' + ch;
      bytes = 1 + b;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  out.push(cur);
  return out.join('\r\n');
};

const uid = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `hs-${(h >>> 0).toString(36)}@hansung-helper`;
};

type VEvent = string[];

const allDay = (item: CalItem): VEvent => {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid(item.id + item.title)}`,
    `DTSTAMP:${dtMin('2026-01-01', 0)}`,
    // 종일 종료는 '다음 날'이 exclusive라 +1일 — 포함 범위를 맞춘다
    `DTSTART;VALUE=DATE:${dtDate(item.start)}`,
    `DTEND;VALUE=DATE:${dtDate(addDays(item.end ?? item.start, 1))}`,
    `SUMMARY:${esc(item.title)}`,
    `DESCRIPTION:${esc(item.meta ?? '')}`,
  ];
  if (item.url) lines.push(`URL:${item.url}`);
  lines.push('END:VEVENT');
  return lines;
};

const timed = (
  id: string,
  title: string,
  date: string,
  sMin: number,
  eMin: number,
  rrule?: string,
  meta?: string,
): VEvent => {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid(id + title + date)}`,
    `DTSTAMP:${dtMin('2026-01-01', 0)}`,
    `DTSTART:${dtMin(date, sMin)}`,
    `DTEND:${dtMin(date, eMin)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(meta ?? '')}`,
  ];
  if (rrule) lines.push(`RRULE:${rrule}`);
  lines.push('END:VEVENT');
  return lines;
};

/** 학기 문자열 '2026-2' → 수업 주간 RRULE UNTIL 경계.
 *  1학기 ~6월 말 / 2학기 ~12월 말 (성적기간 포함한 보수적 상한). */
export function semesterUntil(semester: string): string | null {
  const m = semester.match(/(\d{4})\s*[-./]?\s*(\d)/);
  if (!m) return null;
  const y = +m[1];
  if (m[2] === '1') return `${y}0630T235959`;
  if (m[2] === '2') return `${y}1231T235959`;
  return null;
}

const DAYCODE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/**
 * 캘린더 전체 내보내기.
 * - items: CalItem(공식·LMS·개인) — 종일/범위 이벤트
 * - planned: 시간표 분반 — 주간 반복 수업 이벤트(학기 범위 UNTIL)
 * - semesterStartIso: 학기 첫 수업 기준일(슬롯 요일 정합용)
 */
export function buildIcs(input: {
  items: CalItem[];
  planned?: CourseSection[];
  semester?: string;
  semesterStartIso?: string;
}): string {
  const events: VEvent[] = input.items.map(allDay);
  const until = input.semester ? semesterUntil(input.semester) : null;
  if (input.planned && input.semesterStartIso && until) {
    for (const s of input.planned) {
      for (const sl of s.slots) {
        // 슬롯 요일(slot.d: 0=월..6=일) → getDay() 축(0=일..6=토)으로 환산해
        // 학기 시작일 이후 첫 발생일을 맞춘다
        const targetDow = (sl.d + 1) % 7;
        const startDow = new Date(
          input.semesterStartIso + 'T00:00:00',
        ).getDay();
        const delta = (targetDow - startDow + 7) % 7;
        const first = addDays(input.semesterStartIso, delta);
        events.push(
          timed(
            `plan-${s.id}-${sl.d}-${sl.s}`,
            `[수업] ${s.name}`,
            first,
            sl.s,
            sl.e,
            `FREQ=WEEKLY;BYDAY=${DAYCODE[targetDow]};UNTIL=${until}`,
            `${s.section}분반 · ${s.professor} · 계획 시간표(비공식 — 학교 수강신청 결과가 최종)`,
          ),
        );
      }
    }
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//hansung-helper//academic calendar//KO',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:한성 학사 도우미',
    ...events.flat(),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
