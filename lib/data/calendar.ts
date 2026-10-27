/**
 * 학사 캘린더 통합 뷰 — 공식 학사일정·COSMOS 마감·개인 일정을 하나의
 * 월 그리드로 합치는 순수 로직. 출처별 kind를 유지해 화면에서 구분한다.
 */
import { pendingTasks, type LmsPending, type LmsSnapshot } from './lms.ts';
import type { ScheduleEvent } from './schedule.ts';

export type CalKind = 'academic' | 'lms' | 'personal';

export type CalItem = {
  id: string;
  kind: CalKind;
  title: string;
  /** ISO 'YYYY-MM-DD' */
  start: string;
  /** 기간 항목의 마지막 날(포함). 단일일이면 undefined */
  end?: string;
  url?: string;
  /** 보조 표시 — '과제 · D-3' 같은 출처 메타 */
  meta?: string;
  /** 개인 일정 배열 인덱스 — 삭제에 사용 */
  index?: number;
};

/* ---------- 날짜 유틸 (ISO 문자열 기준, 로컬 타임존) ---------- */

const pad = (n: number) => String(n).padStart(2, '0');

export const isoOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const dateOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (iso: string, n: number) => {
  const d = dateOf(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};

export const monthKeyOf = (iso: string) => iso.slice(0, 7);

/** 'YYYY-MM' → 그 달의 첫째 날 ISO */
export const monthStart = (ym: string) => `${ym}-01`;

export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  return isoOf(new Date(y, m - 1 + n, 1)).slice(0, 7);
};

/** ISO 요일 — 0=일요일(calendar 그리드는 일요일 시작) */
export const dowOf = (iso: string) => dateOf(iso).getDay();

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 월 그리드 셀 — 일요일 시작 6주(42칸) 고정으로 높이 흔들림 방지 */
export type CalCell = { iso: string; inMonth: boolean };

export function monthGrid(ym: string): CalCell[] {
  const first = monthStart(ym);
  const lead = dowOf(first); // 일요일=0
  return Array.from({ length: 42 }, (_, i) => {
    const iso = addDays(first, i - lead);
    return { iso, inMonth: monthKeyOf(iso) === ym };
  });
}

/* ---------- 통합 항목 수집 ---------- */

const KIND_LABEL: Record<CalKind, string> = {
  academic: '공식 학사일정',
  lms: '수업 마감',
  personal: '개인 일정',
};
export const kindLabel = (k: CalKind) => KIND_LABEL[k];

const dueToIso = (due: string | null): string | null => {
  if (!due) return null;
  const m = due.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null;
};

/**
 * 세 출처 → CalItem 목록.
 * - academic: ScheduleEvent (start/end 날짜 범위)
 * - lms: 미완료 항목 중 마감 날짜가 있는 것만 (kind · 과목 메타)
 * - personal: data.events
 */
export function collectCalItems(input: {
  schedule?: ScheduleEvent[] | null;
  lms?: LmsSnapshot | null;
  events?: { title: string; date: string }[];
  /** LMS 지난 학기 경계 시각(ms) — semesterStartTs 결과 */
  lmsBefore?: number | null;
}): CalItem[] {
  const out: CalItem[] = [];
  for (const e of input.schedule ?? []) {
    if (!e?.id || !e.title || !e.start) continue;
    out.push({
      id: `ac-${e.id}`,
      kind: 'academic',
      title: e.title,
      start: e.start,
      end: e.end && e.end > e.start ? e.end : undefined,
    });
  }
  const pending: LmsPending[] = input.lms
    ? pendingTasks(input.lms, input.lmsBefore ?? null)
    : [];
  pending.forEach((t, i) => {
    const start = dueToIso(t.due);
    if (!start) return;
    out.push({
      id: `lms-${i}-${start}`,
      kind: 'lms',
      title: t.title,
      start,
      url: t.url,
      meta: `${t.kind} · ${t.course}${t.uncertain ? ' · 확인 실패' : ''}`,
    });
  });
  (input.events ?? []).forEach((e, i) => {
    const start = dueToIso(e.date);
    if (!e.title || !start) return;
    out.push({ id: `pe-${i}`, kind: 'personal', title: e.title, start, index: i });
  });
  return out;
}

/** 해당 날짜에 걸리는 항목 — end가 있으면 범위 포함 */
export const itemsOnDay = (items: CalItem[], iso: string) =>
  items.filter((it) => it.start <= iso && (it.end ?? it.start) >= iso);

/** 월 그리드용 — 그 달 범위(이웃 달 패딩 포함)와 겹치는 항목만 */
export const itemsInRange = (items: CalItem[], fromIso: string, toIso: string) =>
  items.filter((it) => it.start <= toIso && (it.end ?? it.start) >= fromIso);

/* ---------- 자연어 quick-add ----------

   planner의 quick-add 패턴(입력 → 해석 미리보기 → 확인)을 따른다.
   지원 표현만 파싱하고, 날짜를 찾지 못하면 선택된 날짜에 두되
   미리보기에서 어떻게 해석됐는지 반드시 보여준다. */

export type QuickAddParse = { title: string; date: string; dateFound: boolean };

const KOR_DOW: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
};

export function parseQuickAdd(raw: string, refIso: string): QuickAddParse | null {
  let text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  let date: string | undefined;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => string | undefined) => {
    const m = text.match(re);
    if (!m) return false;
    const v = fn(m);
    if (v === undefined) return false;
    date = v;
    text = text.replace(re, ' ').replace(/\s+/g, ' ').trim();
    return true;
  };

  // 절대 연도 표기
  take(/(\d{4})\s*[년./-]\s*(\d{1,2})\s*[월./-]\s*(\d{1,2})\s*일?/, (m) => {
    return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  });
  // M월 D일 — 연도 추론: 이미 지난 날짜면 다음 해로
  if (!date)
    take(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/, (m) => {
      const y = +refIso.slice(0, 4);
      const cand = `${y}-${pad(+m[1])}-${pad(+m[2])}`;
      return cand >= refIso ? cand : `${y + 1}-${pad(+m[1])}-${pad(+m[2])}`;
    });
  if (!date)
    take(/(\d{1,2})\s*[./]\s*(\d{1,2})(?!\d)/, (m) => {
      const y = +refIso.slice(0, 4);
      const cand = `${y}-${pad(+m[1])}-${pad(+m[2])}`;
      return cand >= refIso ? cand : `${y + 1}-${pad(+m[1])}-${pad(+m[2])}`;
    });
  // 상대일
  if (!date) {
    const rel: [RegExp, (m: RegExpMatchArray) => string][] = [
      [/글피/, () => addDays(refIso, 3)],
      [/모레/, () => addDays(refIso, 2)],
      [/내일/, () => addDays(refIso, 1)],
      [/오늘/, () => refIso],
      [/(\d{1,3})\s*일\s*(?:후|뒤)/, (m) => addDays(refIso, +m[1])],
    ];
    for (const [re, fn] of rel) if (take(re, fn)) break;
  }
  // 다음주/이번주/이 주 X요일 — 이번 주는 지난 요일이면 다음 주로 넘김
  if (!date) {
    const m = text.match(/(다음\s*주|이번\s*주|이\s*주)?\s*(일|월|화|수|목|금|토)\s*요일/);
    if (m) {
      const target = KOR_DOW[m[2]];
      const cur = dowOf(refIso);
      let delta = (target - cur + 7) % 7;
      if (m[1]?.includes('다음')) delta += 7;
      else if (delta === 0) delta = 7;
      date = addDays(refIso, delta);
      text = text.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
    }
  }
  // D-N 표기
  if (!date) take(/[Dd]-?(\d{1,3})/, (m) => addDays(refIso, +m[1]));

  const title = text
    .replace(/^(에|까지|까지에|날|일에?)\s+/, '')
    .replace(/^(에|까지|날|일에?)\s+/, '')
    .trim();
  if (!title) return null;
  return { title, date: date ?? refIso, dateFound: !!date };
}
