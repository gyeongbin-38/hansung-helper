import { conflicts, type CourseSection } from './catalog.ts';
import { resolveDept } from './dept.ts';
import type { Data } from '../../app/sections/data';

const deptMatches = (a: string, b: string) => {
  const left = a.replace(/\s+/g, '');
  const right = b.replace(/\s+/g, '');
  return !!left && !!right && (left.includes(right) || right.includes(left));
};
const catGroup = (s: CourseSection) =>
  ['전필', '전선', 'MD전선', '전기'].includes(s.category) ? '전공' : '교양·일반';

export type Rec = { section: CourseSection; score: number; reasons: string[] };
/**
 * 규칙 기반 추천 — 학과/학년/이수구분/설문 선호/시간 충돌만 사용.
 * 시간이 겹치거나 타학과 수강이 불가한 과목은 후보에서 제외한다.
 */
export function recommend(
  sections: CourseSection[],
  data: Data,
  planned: CourseSection[],
  limit = 6,
  options: { selectedDay?: string; sourceSemester?: string } = {},
): Rec[] {
  const plannedIds = new Set(planned.map((p) => p.id));
  const plannedCodes = new Set(planned.map((p) => p.code));
  const completedCodes = new Set(
    [...(data.completed ?? []), ...(data.info?.completed ?? [])]
      .map((c) => c.code?.trim()).filter((code) => code && code !== '미확인'),
  );
  const completedNames = new Set([...(data.completed ?? []), ...(data.info?.completed ?? [])]
    .map((c) => c.name?.replace(/\s+/g, '').toLowerCase()).filter(Boolean));
  const hasDept = !!data.dept && data.dept !== '소속 미입력';
  const resolved = hasDept ? resolveDept(data.dept, [...new Set(sections.map((s) => s.dept))]) : {};
  const pool = resolved.dept ? [resolved.dept] : (resolved.candidates ?? null);
  // 휴학·편입 여부는 알 수 없으므로 입학연도와 자료 연도 기준의 추정치만 표시한다.
  const admit = parseInt(data.year, 10);
  const sourceYear = /^20\d{2}-[12]$/.test(options.sourceSemester ?? '') ? Number(options.sourceSemester!.slice(0, 4)) : 0;
  const grade = admit && sourceYear && admit <= sourceYear ? Math.min(sourceYear - admit + 1, 4) : 0;
  const plannedDays = new Set(planned.flatMap((p) => p.slots.map((sl) => sl.d)));
  const dayLoad = new Map<number, number>();
  for (const p of planned)
    for (const sl of p.slots)
      dayLoad.set(sl.d, (dayLoad.get(sl.d) ?? 0) + 1);
  const recs: Rec[] = [];
  for (const s of sections) {
    const selectedDay = options.selectedDay ?? '';
    if (/^[0-6]$/.test(selectedDay) && (s.untimed || !s.slots.some((slot) => slot.d === Number(selectedDay)))) continue;
    if (
      plannedIds.has(s.id) ||
      plannedCodes.has(s.code) ||
      completedCodes.has(s.code) ||
      completedNames.has(s.name.replace(/\s+/g, '').toLowerCase())
    )
      continue;
    if (conflicts(s, planned).length) continue;
    const sameDept = pool ? pool.some((d) => deptMatches(s.dept, d)) : false;
    if (pool && !sameDept && !s.cross) continue;
    let score = 0;
    const reasons: string[] = [];
    if (sameDept) {
      score += 4;
      reasons.push(resolved.dept ? '입력한 학과' : '학과 후보 일치 · 확인 필요');
      if (s.category === '전필') {
        score += 3;
        reasons.push(resolved.dept && completedCodes.size ? '확인된 이수 내역에 없는 전필' : '개설강의상 전공필수 · 적용 여부 확인 필요');
      }
    } else if (pool && s.cross) {
      // 타학과 수강 가능 과목은 본인 학과 과목보다 후순위로 둔다.
      // 학과 일치 점수(+4)와 같은 크기만큼 감점해, 연도·필수·선호 보너스가
      // 겹쳐도 본인 학과 과목이 추천 상단을 차지하도록 한다.
      score -= 4;
      reasons.push('타학과 수강 가능 과목');
    }
    if (s.year === '전학년') {
      score += 1;
      reasons.push('전학년 대상');
    } else if (grade && s.year === String(grade)) {
      score += 2;
      reasons.push(`${grade}학년 과목 · 입학연도 기준 추정`);
    }
    if (selectedDay !== '' && /^[0-6]$/.test(selectedDay) && s.slots.some((slot) => slot.d === Number(selectedDay))) {
      score += 1;
      reasons.push(`선택한 ${['월', '화', '수', '목', '금', '토', '일'][Number(selectedDay)]}요일 수업`);
    }
    if (!s.untimed && s.slots.length && planned.some((item) => !item.untimed && item.slots.length))
      reasons.push('시간 확인된 계획 과목과 충돌 없음');
    else if (s.untimed || !s.slots.length)
      reasons.push('시간 미정 · 충돌 확인 필요');
    for (const p of data.prefs) {
      if (p === '오전' && s.slots.length && s.slots.every((sl) => sl.s < 720)) {
        score += 1;
        reasons.push('오전 수업');
      }
      if (
        p === '오후' &&
        s.slots.length &&
        s.slots.every((sl) => sl.s >= 780)
      ) {
        score += 1;
        reasons.push('오후 수업');
      }
      if (p === '금요일' || p === '월요일') {
        const avoid = p === '금요일' ? 4 : 0;
        if (s.slots.some((sl) => sl.d === avoid)) score -= 2;
        else if (!s.untimed && s.slots.length) {
          score += 1;
          reasons.push(`수업이 어려운 ${p} 제외`);
        }
      }
      // 우선 목표
      if (p === '졸업요건 충족' && (s.category === '전필' || s.category === '교필')) {
        score += 2;
        reasons.push('필수 영역 우선');
      }
      if (p === '전공 심화' && sameDept && (s.category === '전필' || s.category === '전선')) {
        score += 2;
        reasons.push('전공 심화');
      }
      if (p === '진로 탐색' && catGroup(s) === '교양·일반') {
        score += 1;
        reasons.push('진로 탐색');
      }
      if (p === '일정 여유' && (s.online || s.untimed || !s.slots.length)) {
        score += 1;
        reasons.push('일정 여유');
      }
      // 학기 구성 선호 — 계획된 요일과의 관계로 점수화
      if (
        p === '공강일 확보' &&
        plannedDays.size &&
        s.slots.length &&
        s.slots.every((sl) => plannedDays.has(sl.d))
      ) {
        score += 1;
        reasons.push('기존 등교일 유지');
      }
      if (
        p === '고른 배치' &&
        s.slots.length &&
        s.slots.every((sl) => (dayLoad.get(sl.d) ?? 0) <= 1)
      ) {
        score += 1;
        reasons.push('요일 균형');
      }
    }
    if (!reasons.length) reasons.push('추천 근거를 확인할 정보 부족');
    recs.push({ section: s, score, reasons });
  }
  recs.sort((a, b) => b.score - a.score);
  // 같은 과목(코드)의 여러 분반이 추천 상단을 채우지 않도록, 점수가 가장
  // 높은 분반 하나만 남기고 나머지는 제외한다. 분반 선택은 상세에서 가능하다.
  const seen = new Set<string>();
  const unique: Rec[] = [];
  for (const r of recs) {
    if (seen.has(r.section.code)) continue;
    seen.add(r.section.code);
    unique.push(r);
    if (unique.length >= limit) break;
  }
  return unique;
}
