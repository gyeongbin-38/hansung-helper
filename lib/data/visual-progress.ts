export function targetProgress(value: number | null | undefined, target: number | null | undefined) {
  if (value == null || target == null || !Number.isFinite(value) || value < 0 || !Number.isFinite(target) || target <= 0) return null;
  return { percent: Math.min(value >= target ? 100 : 99, Math.round(value / target * 100)), remaining: Math.max(0, target - value) };
}

/** Missing course detail stays unclassified; do not invent a category to fill the school total. */
export function creditDistribution(total: number | null, major: number, general: number, other: number) {
  const clean = (n: number) => Number.isFinite(n) && n >= 0 ? n : 0;
  const values = [clean(major), clean(general), clean(other)];
  const classified = values.reduce((sum, n) => sum + n, 0);
  const knownTotal = total !== null && Number.isFinite(total) && total >= 0 ? total : null;
  const unclassified = knownTotal === null ? 0 : Math.max(0, knownTotal - classified);
  return { values: [...values, unclassified], size: classified + unclassified,
    inconsistent: knownTotal !== null && classified > knownTotal };
}

/** 확정·계획·남은 수량을 기준 대비 비율(%)로 나눈다. 기준이 없으면 null — 0%로 그리지 않는다. */
export function requirementSegments(earned: number, planned: number, required: number | null) {
  if (required == null || !Number.isFinite(required) || required <= 0 || !Number.isFinite(earned) || earned < 0) return null;
  const done = Math.min(earned, required);
  const plan = Math.min(Number.isFinite(planned) ? Math.max(0, planned) : 0, required - done);
  const rest = required - done - plan;
  const pct = (n: number) => Math.round(n / required * 1000) / 10;
  return { done, plan, rest, over: Math.max(0, earned - required), donePct: pct(done), planPct: pct(plan), restPct: pct(rest) };
}

const CATEGORY_LABELS: Record<string, string> = {
  전필: '전공필수', 전선: '전공선택', 전기: '전공기초', MD전선: 'MD전공선택',
  교필: '교양필수', 선필교: '선택필수교양', 일교: '일반교양', 일선: '일반선택',
};
export const categoryLabel = (category: string) => CATEGORY_LABELS[category] ?? category;

/** 이수구분별 학점 합계 — 학점 많은 순, 같은 학점이면 이름순. */
export function categoryBreakdown(courses: { category: string; credits: number }[]) {
  const map = new Map<string, { category: string; label: string; credits: number; count: number }>();
  for (const course of courses) {
    if (!Number.isFinite(course.credits) || course.credits < 0) continue;
    const item = map.get(course.category) ?? { category: course.category, label: categoryLabel(course.category), credits: 0, count: 0 };
    item.credits += course.credits;
    item.count += 1;
    map.set(course.category, item);
  }
  return [...map.values()].sort((a, b) => b.credits - a.credits || a.label.localeCompare(b.label, 'ko'));
}

/** 학기별 이수 학점 — 오래된 학기부터. 학기를 모르는 과목은 지어내지 않고 undated로 따로 센다. */
export function semesterBreakdown(courses: { semester?: string; credits: number }[]) {
  const map = new Map<string, { semester: string; credits: number; count: number }>();
  let undated = 0;
  for (const course of courses) {
    if (!Number.isFinite(course.credits) || course.credits < 0) continue;
    const semester = course.semester?.match(/^(20\d{2})-([12])$/) ? course.semester : null;
    if (!semester) { undated += course.credits; continue; }
    const item = map.get(semester) ?? { semester, credits: 0, count: 0 };
    item.credits += course.credits;
    item.count += 1;
    map.set(semester, item);
  }
  const items = [...map.values()].sort((a, b) => a.semester.localeCompare(b.semester));
  return { items, undated, max: items.reduce((max, item) => Math.max(max, item.credits), 0) };
}

export function activityStageCounts(saved: string[], external: { id: string }[], stages: Record<string, string>) {
  const ids = new Set([...saved, ...external.map(a => a.id), ...Object.keys(stages)]);
  const counts = ['applied', 'joined', 'done', 'credited'].map(stage => [...ids].filter(id => stages[id] === stage).length);
  return { total: ids.size, counts, pending: ids.size - counts.reduce((sum, n) => sum + n, 0) };
}
