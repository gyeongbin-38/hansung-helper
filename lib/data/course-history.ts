/**
 * 과목별 개설 이력 인덱스 — 과거 학기 카탈로그(D1 history 스냅샷)에서
 * 과목 코드별 개설 학기 패턴을 요약한다. 필수 과목이 어느 학기에만
 * 열리는지 보여 '놓치면 1년 지연' 경고를 만드는 데 쓴다.
 * 스냅샷은 scripts/_publish_snapshots.mjs가 history 카탈로그에서 생성해
 * D1 `course-history`로 게시하고 `/api/course-history`가 서빙한다.
 */

export type CourseHistoryEntry = {
  /** 최신 표기 과목명 */
  name: string;
  /** 개설된 학기 종류 — 정렬된 유일 학기 숫자, 예: '1', '12', '24' */
  terms: string;
  /** 가장 최근 개설 학기 'YYYY-S' */
  last: string;
};

export type CourseHistory = {
  generatedAt: string;
  /** 'YYYY-S' 카탈로그가 포함된 학기 수 */
  semesterCount: number;
  courses: Record<string, CourseHistoryEntry>;
};

/**
 * 인덱스 생성은 scripts/build-course-history.mjs가 담당한다
 * (게시 스크립트는 플래그 없는 node로 실행되므로 순수 JS 구현을 유지).
 * 이 파일은 소비 측 타입·라벨만 둔다.
 */

/** terms 문자열에서 개설 패턴을 판별하는 순수 함수 — 테스트 가능 */
export function offeringLabelFromTerms(terms: string): string {
  if (terms === '1') return '1학기 개설';
  if (terms === '2') return '2학기 개설';
  if (terms === '3' || terms === '4' || terms === '34') return '계절학기 개설';
  if (terms.includes('3') || terms.includes('4')) return '계절 포함 개설';
  return '매학기 개설';
}

/**
 * 개설 패턴 → 짧은 안내 라벨.
 * 미이수 필수 과목에 붙일 경고용 — 개설 주기가 좁을수록 위험하다.
 * 이력이 없으면 null(신규 과목 가능성 — 추측 경고는 하지 않는다).
 */
export function offeringLabel(entry: CourseHistoryEntry | null | undefined): string | null {
  if (!entry) return null;
  return offeringLabelFromTerms(entry.terms);
}

/** 최근 개설 학기가 오래됐는지 — 마지막 개설이 기준 학기보다 2년 이상 전이면 라벨 반환 */
export function lastOfferedLabel(
  entry: CourseHistoryEntry | null | undefined,
  currentSemester: string | null | undefined,
): string | null {
  if (!entry?.last || !currentSemester) return null;
  const [cy, ct] = currentSemester.split('-').map(Number);
  const [ly, lt] = entry.last.split('-').map(Number);
  if (!cy || !ly) return null;
  // 학기 단위 차이(1/2학기만 비교, 계절은 0.5로)
  const gap = (cy - ly) * 2 + (Math.min(ct, 2) - Math.min(lt, 2));
  return gap >= 4 ? `${entry.last} 이후 미개설` : null;
}

const semSlot = (s: string) => {
  const m = s.match(/^(20\d{2})-([1-4])$/);
  return m ? Number(m[1]) * 4 + Number(m[2]) : null;
};

/**
 * 개설 패턴과 어긋나게 담아둔 학기를 바로잡을 후보 학기.
 * 현재 학기 이상이면서 패턴 학기와 일치하는 학기 중 담아둔 학기에
 * 가장 가까운 학기(동일 거리면 이른 학기) — 같은 학년도를 우선 유지한다.
 * 후보가 없으면 null.
 */
export function suggestOfferingSemester(
  entry: CourseHistoryEntry | null | undefined,
  wishedSemester: string | null | undefined,
  currentSemester: string | null | undefined,
): string | null {
  if (!entry || !wishedSemester) return null;
  const wIdx = semSlot(wishedSemester);
  const cIdx = currentSemester ? semSlot(currentSemester) : null;
  if (wIdx === null) return null;
  const wYear = Number(wishedSemester.slice(0, 4));
  const terms = entry.terms.split('').filter((t) => /[1-4]/.test(t));
  let best: { sem: string; idx: number; d: number } | null = null;
  for (let y = wYear - 1; y <= wYear + 2; y++) {
    for (const t of terms) {
      const sem = `${y}-${t}`;
      const idx = semSlot(sem)!;
      if (cIdx !== null && idx < cIdx) continue; // 과거 학기는 제안하지 않는다
      if (idx === wIdx) continue;
      const d = Math.abs(idx - wIdx);
      if (!best || d < best.d || (d === best.d && idx < best.idx)) best = { sem, idx, d };
    }
  }
  return best?.sem ?? null;
}
