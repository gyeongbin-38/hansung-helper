import { gradGroup, type CourseSection } from './catalog.ts';

/** 사용자가 직접 입력한 이수 완료 과목 — provenance: 사용자 입력 */
export type CompletedCourse = {
  code: string;
  name: string;
  category: string;
  credits: number;
};

export type GradRequirement = {
  id: string;
  label: string;
  /** 포함할 이수구분 그룹 (gradGroup 결과) */
  groups: string[];
  /** 필요 수량. null이면 공식 기준 미확정 → UNKNOWN */
  required: number | null;
  /** 표시 단위 — 기본 '학점', 비교과는 'P' */
  unit?: string;
  /** earned의 출처 — 이수 과목 합산 또는 사용자 입력 포인트 */
  source?: 'completed' | 'points';
  note?: string;
};

/** 전역 졸업 기준의 공식 출처 — hansung.ac.kr 비교과 포인트 안내 */
export const GLOBAL_RULE_SOURCE = {
  url: 'https://www.hansung.ac.kr/hansung/6220/subview.do',
  label: '한성대학교 비교과 포인트 안내 (공식 페이지)',
  asOf: '2026-09-17',
};

/**
 * 2016학년도 이후 입학자 공식 전역 기준 — hansung.ac.kr/hansung/6220:
 * 교과 130학점 + 비교과(High-Success Point) 800P.
 * 학과별 세부 기준·2015학번 이전 기준은 미수집 → required:null(UNKNOWN).
 */
export const DEFAULT_RULES: GradRequirement[] = [
  {
    id: 'total',
    label: '총 이수학점 (교과)',
    groups: ['전공필수', '전공선택', '교양', '일반선택', '기타'],
    required: 130,
    note: '공식 기준(2016학번 이후) — 학과별 세부 요건은 별도 확인 필요',
  },
  {
    id: 'points',
    label: '비교과 포인트',
    groups: [],
    required: 800,
    unit: 'P',
    source: 'points',
    note: '공식 기준(2016학번 이후) — 실제 누적 포인트는 hsportal 마이페이지에서 확인',
  },
  { id: 'majorReq', label: '전공필수', groups: ['전공필수'], required: null },
  {
    id: 'major',
    label: '전공 (필수+선택)',
    groups: ['전공필수', '전공선택'],
    required: null,
  },
  { id: 'gen', label: '교양', groups: ['교양'], required: null },
  {
    id: 'free',
    label: '일반선택·기타',
    groups: ['일반선택', '기타'],
    required: null,
  },
];

export type RuleStatus = 'met' | 'progress' | 'unknown';
/** required 값의 출처 — 사용자 입력 > 학과 규정표 > 전역 공식 순으로 적용 */
export type RequiredSource = 'override' | 'dept' | 'global';
export type RuleResult = {
  rule: GradRequirement;
  /** 이수 완료로 확정된 학점 */
  earned: number;
  /** 계획 과목이 이수되면 추가될 학점 */
  planned: number;
  required: number | null;
  /** required가 확정된 경우의 출처 (null이면 미설정) */
  requiredSource?: RequiredSource;
  status: RuleStatus;
};

function sumByGroups(
  items: { category: string; credits: number }[],
  groups: string[],
) {
  const set = new Set(groups);
  return items.reduce(
    (n, c) => (set.has(gradGroup(c.category)) ? n + c.credits : n),
    0,
  );
}

/**
 * 졸업요건 평가 — deterministic rule engine.
 * 확정(완료) 학점과 계획 학점을 분리해 계산한다. 기준 미확정 항목은
 * 0%가 아니라 'unknown'으로 남긴다.
 */
export function evaluate(
  completed: CompletedCourse[],
  planned: CourseSection[],
  overrides: Record<string, number> = {},
  opts: {
    admitYear?: number;
    points?: number;
    /**
     * 학과 규정표(dept-rules yearTable)에서 해석된 학번별 기준.
     * total/points 규정에만 적용 — 사용자 override보다 낮고 전역 기준보다 높다.
     */
    deptTargets?: { total?: number; points?: number };
  } = {},
): RuleResult[] {
  // 입학연도 미입력 → null(참고 기본값 적용), 2016+ → true, 이전 → false(미수집)
  const post16 =
    opts.admitYear === undefined ? null : opts.admitYear >= 2016;
  // 이수 완료로 등록된 과목이 계획에도 남아 있으면 이중 집계된다 —
  // earned가 확정분이므로 계획 측에서는 빼고 '남은 이수 예정'만 센다.
  const doneCodes = new Set(completed.map((c) => c.code));
  const plannedItems = planned
    .filter((s) => !doneCodes.has(s.code))
    .map((s) => ({
      category: s.category,
      credits: s.credits,
    }));
  return DEFAULT_RULES.map((rule) => {
    const deptVal =
      rule.id === 'total'
        ? opts.deptTargets?.total
        : rule.id === 'points'
          ? opts.deptTargets?.points
          : undefined;
    let required: number | null;
    let requiredSource: RequiredSource | undefined;
    if (overrides[rule.id] !== undefined) {
      required = overrides[rule.id];
      requiredSource = 'override';
    } else if (deptVal !== undefined) {
      required = deptVal;
      requiredSource = 'dept';
    } else if (post16 === false) {
      // 2015학번 이전의 전역 기준은 수집하지 않았다 — 추측하지 않는다.
      required = null;
    } else {
      required = rule.required;
      requiredSource = required === null ? undefined : 'global';
    }
    const isPoints = rule.source === 'points';
    const earned = isPoints ? (opts.points ?? 0) : sumByGroups(completed, rule.groups);
    const plan = isPoints ? 0 : sumByGroups(plannedItems, rule.groups);
    const missingInput = isPoints && opts.points === undefined;
    const status: RuleStatus =
      required === null || missingInput
        ? 'unknown'
        : earned >= required
          ? 'met'
          : 'progress';
    return { rule, earned, planned: plan, required, requiredSource, status };
  });
}
