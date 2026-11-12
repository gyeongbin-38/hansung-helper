import type { CourseSection } from './catalog.ts';

export type RecommendationConstraints = {
  /** 피하고 싶은 요일(0=월 .. 6=일). 시간 미정 과목은 확인할 수 없어 제외하지 않는다. */
  avoidedDays?: readonly number[];
  /** 계획 중인 과목을 포함한 이번 학기 총 학점 상한. undefined면 미적용. */
  maxCredits?: number;
};

/**
 * 기존 추천 점수와 충돌 판정을 유지한 채, 사용자가 추가로
 * 지정한 요일·학점 제약을 추천 후보에 적용한다.
 *
 * 시간 미정 과목은 피할 요일을 검증할 수 없으므로 제외하지 않고,
 * 표시 계층이 반드시 그 불확실성을 알리도록 한다.
 */
export function filterRecommendationCandidates<
  T extends { section: CourseSection },
>(
  candidates: readonly T[],
  planned: readonly CourseSection[],
  constraints: RecommendationConstraints,
): T[] {
  const avoided = new Set(
    (constraints.avoidedDays ?? []).filter(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6,
    ),
  );
  const plannedCredits = planned.reduce(
    (sum, section) => sum + section.credits,
    0,
  );
  const maxCredits = constraints.maxCredits;

  return candidates.filter(({ section }) => {
    if (avoided.size > 0 && section.slots.some((slot) => avoided.has(slot.d)))
      return false;
    if (
      maxCredits !== undefined &&
      plannedCredits + section.credits > maxCredits
    )
      return false;
    return true;
  });
}
