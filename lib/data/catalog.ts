import { koreanMatch } from './hangul.ts';

/** One meeting of a section: d=요일(0월..6일), s/e=자정 이후 분. */
export type CourseSlot = { d: number; s: number; e: number };
export type CourseSection = {
  id: string;
  code: string;
  section: string;
  name: string;
  dept: string;
  deptCode: string;
  category: string;
  credits: number;
  year: string;
  professor: string;
  room: string;
  cross: boolean;
  online: boolean;
  untimed?: boolean;
  /** 원본 파일의 종료<시작 오기를 교시표(월수금 75분) 기준으로 보정한 분반 — 표시 시 확인 필요 */
  timeFixed?: boolean;
  slots: CourseSlot[];
};
export type Catalog = {
  semester: string;
  source: string;
  sourceFile: string;
  generatedAt: string;
  sectionCount: number;
  untimedCount: number;
  sections: CourseSection[];
};
export const DAY_SHORT = ['월', '화', '수', '목', '금', '토', '일'];
/** '2026-2' 같은 학기 문자열 → 학기 시작 로컬 시각 (1학기 3/1, 2학기 9/1).
 *  해석 불가하면 null — 학기를 지어내지 않는다. */
export function semesterStartTs(semester: string): number | null {
  const m = semester.match(/(\d{4})\s*[-./]?\s*(\d)/);
  if (!m) return null;
  const y = +m[1];
  if (m[2] === '1') return new Date(y, 2, 1).getTime();
  if (m[2] === '2') return new Date(y, 8, 1).getTime();
  return null;
}
/** 원본 이수구분 → 졸업요건 계산용 그룹. 카탈로그의 표시용 catGroup과는 별도 축. */
export function gradGroup(category: string): string {
  if (category === '전필') return '전공필수';
  if (category === '전선' || category === '전기' || category === 'MD전선')
    return '전공선택';
  if (category === '교필' || category === '선필교' || category === '일교')
    return '교양';
  if (category === '일선') return '일반선택';
  return '기타';
}
export const GRAD_GROUPS = [
  '전공필수',
  '전공선택',
  '교양',
  '일반선택',
  '기타',
];
export function fmtMin(m: number) {
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
export function slotLabel(s: CourseSlot) {
  return `${DAY_SHORT[s.d]} ${fmtMin(s.s)}~${fmtMin(s.e)}`;
}
export function slotsLabel(s: CourseSection) {
  if (s.untimed || !s.slots.length) return '온라인 · 시간 미정';
  return s.slots.map(slotLabel).join(' · ');
}
/** 강의실 표시 — 원본 '온라인강좌 미래관B107'에서 방식 접두어를 벗겨
 *  실제 강의실만 돌려준다('미래관B107'). '온라인강좌' 단독이면 빈 문자열. */
export function roomLabel(s: CourseSection): string {
  return (s.room ?? '').replace(/^온라인강좌\s*/, '').trim();
}
/** 수업 방식 표시 — 온라인/대면을 강의실과 분리해 보여준다 */
export function deliveryLabel(s: CourseSection): string {
  return s.online ? '온라인' : '대면';
}
/** 방식+장소 한 줄 표시 — '온라인 · 미래관B107' / '미래관B107' / '온라인' */
export function placeLabel(s: CourseSection): string {
  const room = roomLabel(s);
  if (s.online) return room ? `온라인 · ${room}` : '온라인';
  return room || s.room || '강의실 미정';
}
/** 요일별 수업 요약: 수업 수, 첫/끝 시각, 수업 사이 공강(30분 이상만). */
export type DaySummary = {
  count: number;
  first: number | null;
  last: number | null;
  gaps: { s: number; e: number }[];
};
export function daySummaries(planned: CourseSection[]): DaySummary[] {
  const out: DaySummary[] = Array.from({ length: 7 }, () => ({
    count: 0,
    first: null,
    last: null,
    gaps: [],
  }));
  for (let d = 0; d < 7; d++) {
    const ivs = planned
      .flatMap((s) => s.slots)
      .filter((sl) => sl.d === d)
      .sort((a, b) => a.s - b.s);
    if (!ivs.length) continue;
    const merged: CourseSlot[] = [];
    for (const iv of ivs) {
      const last = merged[merged.length - 1];
      if (last && iv.s <= last.e) last.e = Math.max(last.e, iv.e);
      else merged.push({ ...iv });
    }
    out[d].count = ivs.length;
    out[d].first = merged[0].s;
    out[d].last = merged[merged.length - 1].e;
    for (let i = 1; i < merged.length; i++) {
      const gap = merged[i].s - merged[i - 1].e;
      if (gap >= 30)
        out[d].gaps.push({ s: merged[i - 1].e, e: merged[i].s });
    }
  }
  return out;
}

/** 과목명·교수·코드·학과에 대한 한국어 검색 (초성·부분문자열). */
export function courseMatch(s: CourseSection, q: string) {
  return koreanMatch(`${s.name} ${s.professor} ${s.code} ${s.dept}`, q);
}

/** Sections that share a 시간표 슬롯 overlap on the same day. */
export function conflicts(target: CourseSection, planned: CourseSection[]) {
  const hits: CourseSection[] = [];
  for (const p of planned) {
    if (p.id === target.id) continue;
    if (
      target.slots.some((a) =>
        p.slots.some((b) => a.d === b.d && a.s < b.e && b.s < a.e),
      )
    )
      hits.push(p);
  }
  return hits;
}
