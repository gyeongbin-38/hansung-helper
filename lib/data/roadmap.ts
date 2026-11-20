/**
 * 남은 학기 필수 로드맵 — 미이수 필수 과목을 개설 학기 패턴(terms)에 맞춰
 * 졸업 목표까지의 정규 학기 슬롯에 배치한다.
 * 목표가 없으면 향후 4개 정규 학기를 쓴다. 계절학기(3/4)는 필수 배치에서
 * 제외 — 학교가 필수 과목을 계절에 개설한다는 보장이 없기 때문.
 */
import { parseSemester, formatSemesterLabel } from './graduation.ts';

export type RoadmapCourse = {
  code: string;
  name: string;
  credits: number;
  /** '1'~'4' 커리큘럼 권장 학년 또는 null */
  year: string | null;
  /** 개설 학기 패턴 '1','2','12','13'… — 없으면 정규 어느 학기든 가능으로 본다 */
  terms?: string;
};

export type RoadmapSlot = {
  /** '2027-1' */
  semester: string;
  /** '2027학년도 1학기' */
  label: string;
  courses: RoadmapCourse[];
  credits: number;
  /** 한 학기에 필수 부하가 몰렸을 때 경고 */
  heavy?: boolean;
};

export type RoadmapResult = {
  slots: RoadmapSlot[];
  /** 목표 학기 안에 배치하지 못한 과목 */
  unplaced: { course: RoadmapCourse; reason: string }[];
  /** 적용된 목표 라벨 'YYYY-S' 또는 null(기본 4학기) */
  target: string | null;
};

const termOf = (sem: string) => Number(sem.slice(5));

/** 정규학기 인덱스 — '2026-2' → 2026*2+1 (parseSemester는 1·2학기만 매칭) */
const semIndex = (s: string) => {
  const p = parseSemester(s);
  return p ? p[0] * 2 + (p[1] - 1) : null;
};

/** 현재 학기 다음의 정규 학기(1·2학기) 열 — target까지, 없으면 n개 */
export function nextRegularSemesters(
  currentSemester: string | null | undefined,
  target: string | null | undefined,
  n = 4,
): string[] {
  const idx = currentSemester ? semIndex(currentSemester) : null;
  if (idx === null) return [];
  const tIdx = target ? semIndex(target) : null;
  const out: string[] = [];
  let i = idx;
  while (out.length < (tIdx ? 16 : n)) {
    i += 1;
    if (tIdx && i > tIdx) break;
    out.push(`${Math.floor(i / 2)}-${(i % 2) + 1}`);
  }
  return out;
}

const compatible = (c: RoadmapCourse, sem: string) => {
  const t = String(termOf(sem));
  return !c.terms || c.terms.includes(t);
};

/** 한 학기 필수 과목 권장 상한 — 이 이상이면 부하 경고 */
const REQUIRED_CAP = 9;

/**
 * 필수 과목 배치 제약만으로 도달 가능한 가장 빠른 졸업 학기.
 * 목표 없이 n개 학기 슬롯을 늘려가며 planRoadmap이 전부 배치하는
 * 최초 학기를 찾는다 — '학점 페이스'(graduationOutlook)와는 별개의
 * 과목 배치 제약 쪽 하한이다.
 * 정규학기 개설 이력이 전혀 없는 과목은 어느 목표에도 못 들어가므로
 * 계산에서 빼고 blocked로 돌려준다.
 */
export function earliestRoadmapSemester(input: {
  missing: RoadmapCourse[];
  currentSemester?: string | null;
  /** 탐색할 최대 학기 수 — 기본 8(4년) */
  horizon?: number;
}): { semester: string | null; label?: string; blocked: RoadmapCourse[] } | null {
  const idx = semIndex(input.currentSemester ?? '');
  if (idx === null || !input.missing.length) return null;
  const placeable = input.missing.filter(
    (c) => !c.terms || c.terms.includes('1') || c.terms.includes('2'),
  );
  const blocked = input.missing.filter(
    (c) => c.terms && !c.terms.includes('1') && !c.terms.includes('2'),
  );
  if (!placeable.length) return { semester: null, blocked };
  const horizon = input.horizon ?? 8;
  for (let n = 1; n <= horizon; n++) {
    const i = idx + n;
    const target = `${Math.floor(i / 2)}-${(i % 2) + 1}`;
    const r = planRoadmap({
      missing: placeable,
      currentSemester: input.currentSemester,
      target,
      strictCap: true,
    });
    if (!r.unplaced.length)
      return { semester: target, label: formatSemesterLabel(target), blocked };
  }
  return { semester: null, blocked };
}

export function planRoadmap(input: {
  missing: RoadmapCourse[];
  currentSemester?: string | null;
  /** 'YYYY-S'로 정규화된 졸업 목표 또는 null */
  target?: string | null;
  /** 목표가 없을 때 앞으로 보여줄 정규 학기 수 */
  futureCount?: number;
  /** 참이면 학기당 필수 상한을 강제 — 초과 시 배치하지 않는다 (졸업 가능 시점 산정용) */
  strictCap?: boolean;
}): RoadmapResult {
  const target = input.target ?? null;
  const semesters = nextRegularSemesters(
    input.currentSemester,
    target,
    input.futureCount ?? 4,
  );
  const slots: RoadmapSlot[] = semesters.map((sem) => ({
    semester: sem,
    label: formatSemesterLabel(sem),
    courses: [],
    credits: 0,
  }));
  const unplaced: RoadmapResult['unplaced'] = [];

  // 배치 순서: 개설 학기가 좁은 과목 먼저(단일 정규학기 > 양 학기 > 계절전용),
  // 같은 제약이면 권장 학년이 낮은 순
  const restriction = (c: RoadmapCourse) => {
    if (!c.terms) return 2;
    const regular = ['1', '2'].filter((t) => c.terms!.includes(t)).length;
    if (regular === 0) return 0; // 정규학기 미개설 — 배치 불가능
    return regular === 1 ? 1 : 2;
  };
  const sorted = [...input.missing].sort(
    (a, b) =>
      restriction(a) - restriction(b) ||
      (a.year ?? '9').localeCompare(b.year ?? '9') ||
      a.name.localeCompare(b.name, 'ko'),
  );

  for (const course of sorted) {
    if (restriction(course) === 0) {
      unplaced.push({ course, reason: '정규학기 개설 이력이 없어요' });
      continue;
    }
    const ok = slots.filter((s) => compatible(course, s.semester));
    if (!ok.length) {
      unplaced.push({
        course,
        reason: target
          ? `${course.terms === '1' ? '1' : '2'}학기 개설 과목인데 목표 학기 전 ${course.terms}학기가 없어요`
          : '배치 가능한 학기가 없어요',
      });
      continue;
    }
    // 상한 미만 슬롯을 우선 — 없으면 가장 이른 호환 슬롯
    const slot =
      ok.find((s) => s.credits + course.credits <= REQUIRED_CAP) ??
      (input.strictCap ? undefined : ok[0]);
    if (!slot) {
      unplaced.push({
        course,
        reason: `학기당 필수 ${REQUIRED_CAP}학점 권장 상한을 넘어 배치하지 못했어요`,
      });
      continue;
    }
    slot.courses.push(course);
    slot.credits += course.credits;
  }
  for (const s of slots) s.heavy = s.credits > REQUIRED_CAP;
  return { slots: slots.filter((s) => s.courses.length), unplaced, target };
}
