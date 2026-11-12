import { conflicts, type CourseSection } from './catalog.ts';

/** 입력된 정보로 확인할 수 있는 근거만 표시한다. 수강 자격이나 졸업 판정이 아니다. */
export function courseSuggestion(
  course: CourseSection,
  input: { matchedDept?: string; completedCodes: string[]; completedNames?: string[]; plannedCodes: string[]; prefs: string[]; selectedDay: string; plannedSections?: CourseSection[] },
): { score: number; reasons: string[] } {
  if (input.completedCodes.includes(course.code) || input.plannedCodes.includes(course.code) ||
      (!!course.name && (input.completedNames ?? []).some((name) => name.replace(/\s+/g, '').toLowerCase() === course.name.replace(/\s+/g, '').toLowerCase())))
    return { score: 0, reasons: [] };
  const planned = input.plannedSections ?? [];
  if (conflicts(course, planned).length) return { score: 0, reasons: [] };
  const reasons: string[] = [];
  let score = 0;
  if (!course.untimed && course.slots.length && planned.some((item) => !item.untimed && item.slots.length))
    reasons.push('시간 확인된 계획 과목과 충돌 없음');
  if (input.matchedDept && course.dept === input.matchedDept) {
    score += 4;
    reasons.push('입력한 학과 과목');
    if (course.category === '전필' && input.completedCodes.length) {
      score += 3;
      reasons.push('확인된 이수 내역에 없는 전필');
    }
  }
  const day = Number(input.selectedDay);
  if (input.selectedDay !== '' && Number.isInteger(day) && day >= 0 && day < 7 && course.slots.some((slot) => slot.d === day)) {
    score += 1;
    reasons.push(`선택한 ${['월', '화', '수', '목', '금', '토', '일'][day]}요일 수업`);
  }
  const timePreference = input.prefs[1];
  if (course.slots.length && timePreference === '오전' && course.slots.every((slot) => slot.s < 720)) {
    score += 1;
    reasons.push('선호 시간대: 오전');
  } else if (course.slots.length && timePreference === '오후' && course.slots.every((slot) => slot.s >= 720 && slot.s < 1080)) {
    score += 1;
    reasons.push('선호 시간대: 오후');
  }
  const avoidedDay = input.prefs[2] === '월요일' ? 0 : input.prefs[2] === '금요일' ? 4 : null;
  if (avoidedDay !== null && course.slots.length && course.slots.every((slot) => slot.d !== avoidedDay)) {
    score += 1;
    reasons.push(`수업이 어려운 ${input.prefs[2]} 제외`);
  }
  return { score, reasons };
}
