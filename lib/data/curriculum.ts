/**
 * 교육과정(학기별 학과 필수·선택 과목) 클라이언트 로직.
 * 스냅샷 원본은 종합정보 교육과정조회 — D1 `curriculum:YYYY-S` 스냅샷으로
 * 게시되고 `/api/curriculum`이 서빙한다. 번들 폴백 없음.
 *
 * 용도: 입학연도 교육과정 기준으로 학과 전필·교양필수 과목의 이수 여부를
 * 보여주는 '필수 이수 지도'. 학점 합계가 아니라 과목 단위 판정이 필요하다.
 */
import { resolveDept } from './dept.ts';
import { RULESET_DEPT_FAMILY } from './dept-rules.ts';
import type { EquivalentsSnapshot } from './equivalents.ts';
import type { CourseHistory, CourseHistoryEntry } from './course-history.ts';

export type CurriculumCourse = {
  code: string;
  name: string;
  /** '전필' | '전선' | '전기' | '교필' | '선필교' | '일교' | '일선' | … */
  kind: string;
  credits: number;
  /** 권장 이수 학년 '1'~'4'. 없으면 null */
  year: string | null;
};

export type CurriculumMajor = {
  /** '[V021] 모바일소프트웨어트랙' 형태 원문 */
  name: string;
  courses: CurriculumCourse[];
};

export type Curriculum = {
  semester: string;
  majors: Record<string, CurriculumMajor>;
};

export type CurriculumIndex = {
  semesters: Record<string, { majors: Record<string, string> }>;
};

const norm = (s: string) => s.replace(/\s+/g, '');

/** '[V021] 모바일소프트웨어트랙' → '모바일소프트웨어트랙' */
export const majorLabel = (raw: string) => raw.replace(/^\[[^\]]*\]\s*/, '');

const semIdx = (s: string) => {
  const m = s.match(/^(20\d{2})-([1-4])$/);
  return m ? Number(m[1]) * 4 + Number(m[2]) : null;
};

/**
 * 입학연도 → 적용 교육과정 학기 선택.
 * 당해 1학기 → 2학기를 먼저 보고, 없으면 가장 가까운 학기로 보정한다
 * (입학연도 개편이 없는 학과는 직전 학년도 교육과정이 그대로 적용된다).
 * 색인에 아무 학기도 없으면 null.
 */
export function pickCurriculumSemester(
  admitYear: number | undefined,
  index: CurriculumIndex | null | undefined,
): string | null {
  const sems = index ? Object.keys(index.semesters).filter((s) => semIdx(s) !== null) : [];
  if (admitYear === undefined || !Number.isInteger(admitYear) || !sems.length) return null;
  const primary = `${admitYear}-1`;
  if (index!.semesters[primary]) return primary;
  const secondary = `${admitYear}-2`;
  if (index!.semesters[secondary]) return secondary;
  const target = admitYear * 4 + 1;
  return sems
    .map((s) => ({ s, d: semIdx(s)! - target }))
    // 이후 학기 우선, 같은 거리면 이전 학기보다 가까운 쪽
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d) || b.d - a.d)[0].s;
}

/** 필수 과목 한 행의 표시 단위 */
export type TrackCourse = {
  code: string;
  name: string;
  credits: number;
  /** '1'~'4' 또는 null(전학년) */
  year: string | null;
  status: 'done' | 'planned' | 'missing';
  /** 이수로 인정된 실제 이수 과목명 — 동일과목(폐지 과목 등) 매칭일 때만 */
  matchedName?: string;
  /** 현재 학기 카탈로그에 개설됨 */
  offered: boolean;
  /** 개설된 실제 과목 코드 — 동일과목 매칭으로만 개설될 때 curriculum code와 다르다 */
  offeredCode?: string;
  /** 과거 개설 이력 — 개설 학기 패턴 경고용 */
  hist?: CourseHistoryEntry;
};

export type TrackGroup = {
  key: string;
  /** '모바일소프트웨어트랙' | '교양필수' | '선택필수교양' */
  title: string;
  role: 'major-common' | 'major-track' | 'gen-required' | 'gen-selective';
  courses: TrackCourse[];
};

export type TrackResult = {
  groups: TrackGroup[];
  /** 전필·교필(전원 필수) 기준 이수/전체 과목 수 */
  requiredDone: number;
  requiredTotal: number;
  /** 학과 입력이 모호해 후보가 여럿일 때 */
  ambiguous?: string[];
};

/**
 * 이수 내역 → 조회 인덱스. code와 공백 제거 과목명 양쪽으로 찾고,
 * 동일과목 그룹 멤버도 같은 이수로 인정한다(폐지 과목 재수강 인정).
 * 값은 '표시할 매칭 과목명' — 직접 일치면 undefined 취급.
 */
function buildDoneIndex(
  completed: { code: string; name: string }[],
  equiv: EquivalentsSnapshot | null | undefined,
) {
  const map = new Map<string, { name: string; equiv: boolean }>();
  for (const c of completed) {
    map.set(c.code.trim(), { name: c.name, equiv: false });
    map.set(norm(c.name), { name: c.name, equiv: false });
  }
  if (!equiv) return map;
  // code → group, normName → group 역인덱스를 스냅샷에서 한 번 만든다.
  const byCode = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  for (const [id, g] of Object.entries(equiv.groups)) {
    for (const m of g.courses) {
      byCode.set(m.code, [...(byCode.get(m.code) ?? []), id]);
      const k = norm(m.name);
      byName.set(k, [...(byName.get(k) ?? []), id]);
    }
  }
  const groupsOf = (c: { code: string; name: string }) =>
    [...new Set([...(byCode.get(c.code) ?? []), ...(byName.get(norm(c.name)) ?? [])])];
  for (const c of completed) {
    for (const gid of groupsOf(c)) {
      for (const m of equiv.groups[gid].courses) {
        for (const key of [m.code, norm(m.name)]) {
          if (!map.has(key)) map.set(key, { name: c.name, equiv: true });
        }
      }
    }
  }
  return map;
}

/** code → 동일과목 그룹 형제 코드 인덱스 (개설·이력 조회용) */
function equivCodeIndex(equiv: EquivalentsSnapshot | null | undefined) {
  const byCode = new Map<string, string[]>();
  for (const [id, g] of Object.entries(equiv?.groups ?? {})) {
    for (const m of g.courses) {
      byCode.set(m.code, [...(byCode.get(m.code) ?? []), id]);
    }
  }
  const siblingCodes = (code: string) =>
    [
      ...new Set(
        (byCode.get(code) ?? []).flatMap(
          (id) => equiv?.groups[id]?.courses.map((m) => m.code) ?? [],
        ),
      ),
    ];
  return { siblingCodes };
}

function toTrack(
  course: CurriculumCourse,
  ctx: {
    done: Map<string, { name: string; equiv: boolean }>;
    plannedFor: (code: string) => boolean;
    offeredFor: (code: string) => string | undefined;
    histFor: (code: string) => CourseHistoryEntry | undefined;
  },
): TrackCourse {
  const hit = ctx.done.get(course.code) ?? ctx.done.get(norm(course.name));
  const status: TrackCourse['status'] = hit ? 'done' : ctx.plannedFor(course.code) ? 'planned' : 'missing';
  const offeredCode = ctx.offeredFor(course.code);
  return {
    code: course.code,
    name: course.name,
    credits: course.credits,
    year: course.year && /^[1-4]$/.test(course.year) ? course.year : null,
    status,
    matchedName: hit?.equiv ? hit.name : undefined,
    offered: !!offeredCode,
    offeredCode: offeredCode !== course.code ? offeredCode : undefined,
    hist: ctx.histFor(course.code),
  };
}

const byYearThenName = (a: TrackCourse, b: TrackCourse) =>
  (a.year ?? '9').localeCompare(b.year ?? '9') || a.name.localeCompare(b.name, 'ko');

/**
 * 입학연도 교육과정 + 이수 내역 → 필수 과목 트랙.
 * - 전공 그룹: resolveDept로 해석한 학과(검증된 학부·트랙 패밀리 포함)의 '전필'
 * - 교양 그룹: '교필' 과목을 담은 전공(교양필수)과 '선필교'(선택필수교양)
 * 교양 그룹이 없는 구 교육과정은 전공만 돌려준다.
 */
export function buildRequiredTrack(args: {
  curriculum: Curriculum;
  deptInput: string;
  completed: { code: string; name: string }[];
  /** 현재 계획에 담긴 과목 코드 */
  plannedCodes?: Set<string>;
  /** 현재 학기 카탈로그에 개설된 과목 코드 */
  offeredCodes?: Set<string>;
  equiv?: EquivalentsSnapshot | null;
  /** 과목별 개설 이력 — 학기 패턴 경고에 사용 */
  history?: CourseHistory | null;
}): TrackResult {
  const { curriculum, deptInput, completed, equiv, history } = args;
  const offered = args.offeredCodes ?? new Set<string>();
  const planned = args.plannedCodes ?? new Set<string>();
  const { siblingCodes } = equivCodeIndex(equiv);
  const offeredFor = (code: string) => {
    if (offered.has(code)) return code;
    return siblingCodes(code).find((s) => offered.has(s));
  };
  // 동일과목 코드로 담은 계획도 '계획 중'으로 인정 (폐지 과목 대체 수강)
  const plannedFor = (code: string) =>
    planned.has(code) || siblingCodes(code).some((s) => planned.has(s));
  const histFor = (code: string) => {
    if (!history) return undefined;
    const direct = history.courses[code];
    if (direct) return direct;
    let best: CourseHistoryEntry | undefined;
    for (const s of siblingCodes(code)) {
      const e = history.courses[s];
      if (e && (!best || e.last > best.last)) best = e;
    }
    return best;
  };
  const ctx = {
    done: buildDoneIndex(completed, equiv),
    plannedFor,
    offeredFor,
    histFor,
  };

  const groups: TrackGroup[] = [];

  // ── 전공 필수 ──────────────────────────────────────────────
  const majorNames = Object.values(curriculum.majors).map((m) => majorLabel(m.name));
  const resolved = deptInput.trim() ? resolveDept(deptInput, majorNames) : {};
  const wanted = new Set<string>();
  if (resolved.dept) wanted.add(resolved.dept);
  for (const c of resolved.candidates ?? []) wanted.add(c);
  // 학부 입력이 패밀리 키와 일치하거나 해석 결과가 패밀리 소속이면
  // 형제 학부·트랙 전공도 함께 보여준다 (학생이 자기 트랙을 고른다).
  const familyKey = Object.keys(RULESET_DEPT_FAMILY).find((k) => norm(k) === norm(deptInput));
  const familyNames = new Set<string>();
  if (familyKey) {
    wanted.add(familyKey);
    for (const n of RULESET_DEPT_FAMILY[familyKey]) { wanted.add(n); familyNames.add(n); }
  } else {
    const hit = Object.entries(RULESET_DEPT_FAMILY).find(([, v]) => v.some((n) => wanted.has(n)));
    if (hit) {
      wanted.add(hit[0]);
      for (const n of hit[1]) { wanted.add(n); familyNames.add(n); }
    }
  }
  for (const [code, major] of Object.entries(curriculum.majors)) {
    const label = majorLabel(major.name);
    if (!wanted.has(label)) continue;
    const required = major.courses.filter((c) => c.kind === '전필');
    if (!required.length) continue;
    groups.push({
      key: `major:${code}`,
      title: label,
      role: familyNames.has(label) ? 'major-track' : 'major-common',
      courses: required.map((c) => toTrack(c, ctx)).sort(byYearThenName),
    });
  }
  const ambiguous = !groups.some((g) => g.role.startsWith('major')) && resolved.candidates?.length
    ? resolved.candidates
    : undefined;

  // ── 교양 필수/선택필수 ──────────────────────────────────────
  for (const [code, major] of Object.entries(curriculum.majors)) {
    const label = majorLabel(major.name);
    const req = major.courses.filter((c) => c.kind === '교필');
    if (req.length)
      groups.push({
        key: `gen:req:${code}`,
        title: /교양필수|교필/.test(label) ? '교양필수' : label,
        role: 'gen-required',
        courses: req.map((c) => toTrack(c, ctx)).sort(byYearThenName),
      });
    const sel = major.courses.filter((c) => c.kind === '선필교');
    if (sel.length)
      groups.push({
        key: `gen:sel:${code}`,
        title: /선택필수/.test(label) ? '선택필수교양' : label,
        role: 'gen-selective',
        courses: sel.map((c) => toTrack(c, ctx)).sort(byYearThenName),
      });
  }

  // 필수 총계 — 공통·트랙 그룹 간 공유 과목(예: SW설계)을 코드 기준 중복 제거
  const requiredCodes = new Set<string>();
  const doneCodes = new Set<string>();
  for (const g of groups) {
    if (g.role === 'gen-selective') continue;
    for (const c of g.courses) {
      requiredCodes.add(c.code);
      if (c.status === 'done') doneCodes.add(c.code);
    }
  }
  return { groups, requiredDone: doneCodes.size, requiredTotal: requiredCodes.size, ambiguous };
}
