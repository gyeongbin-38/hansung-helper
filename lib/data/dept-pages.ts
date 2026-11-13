/**
 * 학과 공식 사이트 수집 스냅샷 — 트랙소개·교육과정소개·교과목로드맵·졸업요건
 * 페이지의 원문 라인과 이미지/첨부 메타. 수치 해석 없이 출처를 보존한다.
 * provenance: 학과 공식 페이지 · 수집 스냅샷 · 졸업 사정 아님.
 */

export type DeptPageKind = 'intro' | 'curriculum' | 'roadmap' | 'rules';

export type DeptPage = {
  /** 사이트 슬러그 (예: Engineering) */
  slug: string;
  /** 사이트맵에서 연결된 학과·트랙명 */
  deptLabel: string;
  kind: DeptPageKind;
  /** 공식 페이지 절대 URL */
  url: string;
  /** 본문 원문 라인 */
  lines?: string[];
  /** 본문 콘텐츠 이미지들 (로드맵·규정표 그림) */
  images?: { src: string; alt?: string }[];
  /** 첨부 문서 라벨 — 본문이 문서로만 제공될 때 */
  attachment?: string | null;
  /** 대표 콘텐츠 이미지 */
  image?: { src: string; alt?: string };
  /** 수집 실패 시 오류 메시지 */
  error?: string;
};

export type DeptPageIndexEntry = {
  slug: string;
  dept: string;
  kinds: Partial<Record<DeptPageKind, string>>;
};

export type DeptPagesSnapshot = {
  source: string;
  fetchedAt: string;
  pages: DeptPage[];
  deptIndex: DeptPageIndexEntry[];
};

/** 사용자 학과 표기와 수집 라벨의 느슨한 비교 — 공백·법&정책 표기 차이 흡수 */
export function deptPageMatches(
  deptLabel: string,
  userDept: string,
  pool: string[] | null,
): boolean {
  const norm = (s: string) => s.replace(/\s+/g, '');
  const label = norm(deptLabel);
  if (!label) return false;
  if (label === norm(userDept)) return true;
  return !!pool?.some((d) => label === norm(d) || label === norm(`${d}트랙`) || `${label}트랙` === norm(d));
}
