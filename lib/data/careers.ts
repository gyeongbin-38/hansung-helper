/** 학과·트랙별 진로 정보 — 커리어넷 오픈 API 스냅샷(crawl-careers.mts) +
 *  공식 사이트 링크. 스냅샷이 없으면 링크만 노출한다. */
import snapshotJson from './careers.json' with { type: 'json' };

export type CareerEntry = {
  /** 커리어넷 학과사전 고유번호 */
  majorSeq?: number;
  /** 커리어넷에서 매칭된 학과명 */
  name?: string;
  /** 학과 개요 요약 */
  summary?: string;
  /** 관련 직업명 목록 */
  jobs?: string[];
  /** 취업률 표시 문자열(예: '62%') */
  employment?: string;
  /** 졸업 후 직장임금 표시 문자열 */
  salary?: string;
  source: 'careernet';
  fetchedAt?: string;
};

export type CareerSnapshot = {
  generated: string | null;
  depts: Record<string, CareerEntry>;
};

const snap = snapshotJson as CareerSnapshot;

/** 학과·트랙 표기 정규화 — 소속 표기 차이(학부/학과/트랙)를 흡수한다.
 *  '컴퓨터공학부'는 '공학'이 본체라 '부'만 뗀다. */
export function normDeptName(name: string): string {
  return name
    .trim()
    .replace(/[\s·/()\-_&]/g, '')
    .replace(/공학[부과]$/, '공학')
    .replace(/(전문가과정|전공과정|전문과정|학부|학과|전공|트랙|과정)$/, '')
    .toLowerCase();
}

/** 소속 학과·트랙으로 스냅샷에서 진로 정보를 찾는다. 정확 일치 후 양방향 포함 비교. */
export function careerInfoFor(
  dept: string | undefined,
  tracks?: string[],
  depts: Record<string, CareerEntry> = snap.depts ?? {},
): CareerEntry | undefined {
  const candidates = [dept, ...(tracks ?? [])]
    .filter((x): x is string => typeof x === 'string' && !!x.trim())
    .map(normDeptName)
    .filter(Boolean);
  if (!candidates.length) return undefined;
  const entries = Object.entries(depts).map(([k, v]) => [
    normDeptName(k),
    v,
  ] as const);
  for (const c of candidates) {
    const exact = entries.find(([k]) => k === c);
    if (exact) return exact[1];
  }
  for (const c of candidates) {
    const loose = entries.find(([k]) => k && (k.includes(c) || c.includes(k)));
    if (loose) return loose[1];
  }
  return undefined;
}

/** 커리어넷 대학교 학과사전 — 검색은 사이트 내에서 한다. */
export const CAREER_MAJOR_URL =
  'https://www.career.go.kr/cnet/front/base/major/FunivMajorList.do';
/** 커리어넷 직업백과 목록. */
export const CAREER_JOB_URL = 'https://www.career.go.kr/cloud/w/job/list';
/** 잡코리아 통합검색 — GET 검색어 지원. */
export function jobSearchUrl(keyword: string): string {
  return `https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(keyword)}`;
}
/** 검색용 학과 키워드 — 소속 표기에서 말미 기관 접미사를 뗀다. */
export function careerKeyword(dept?: string, tracks?: string[]): string {
  const base = (dept ?? tracks?.[0] ?? '').trim();
  const cut = base
    .replace(/공학[부과]$/, '공학')
    .replace(/(학부|학과|전공|트랙)$/, '')
    .trim();
  return cut || base;
}
