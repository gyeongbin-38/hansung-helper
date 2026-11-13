/**
 * 동일교과목 스냅샷 — 종합정보시스템 동일교과목조회의 그룹표.
 * 같은 그룹의 과목은 서로 동일과목(대체 인정)이며, 그룹이 다르면 동일과목이 아니다.
 * 폐지·개편 과목의 재수강/이수 인정 판단에 쓰는 학교 공식 매핑이다.
 */

export type EquivCourse = { code: string; name: string; note?: string };
export type EquivGroup = { name: string; courses: EquivCourse[] };

export type EquivalentsSnapshot = {
  source: string;
  sourceUrl?: string;
  generatedAt: string;
  groupCount: number;
  rowCount: number;
  /** groupcode → 그룹 (같은 그룹 안의 과목끼리만 동일 인정) */
  groups: Record<string, EquivGroup>;
};

/** 과목코드의 동일과목 그룹을 찾는다 — 없으면 null */
export function equivGroupOf(
  snap: EquivalentsSnapshot,
  code: string,
): { id: string; group: EquivGroup } | null {
  for (const [id, group] of Object.entries(snap.groups)) {
    if (group.courses.some((c) => c.code === code)) return { id, group };
  }
  return null;
}
