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
  /** 필요 학점. null이면 공식 기준 미확정 → UNKNOWN */
  required: number | null;
  note?: string;
};

/**
 * 참고용 기본 규칙 — 공식 졸업 규정이 아님.
 * required: null은 '기준 미확정'으로 표시되며 사용자가 직접 입력해 확정한다.
 * 총 이수학점 130은 일반적인 졸업학점 참고 기본값 — 학과 공식 기준으로 수정 필요.
 */
export const DEFAULT_RULES: GradRequirement[] = [
  {
    id: 'total',
    label: '총 이수학점',
    groups: ['전공필수', '전공선택', '교양', '일반선택', '기타'],
    required: 130,
    note: '참고 기본값 — 학과 공식 기준 확인 필요',
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
export type RuleResult = {
  rule: GradRequirement;
  /** 이수 완료로 확정된 학점 */
  earned: number;
  /** 계획 과목이 이수되면 추가될 학점 */
  planned: number;
  required: number | null;
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
): RuleResult[] {
  const plannedItems = planned.map((s) => ({
    category: s.category,
    credits: s.credits,
  }));
  return DEFAULT_RULES.map((rule) => {
    const required =
      overrides[rule.id] !== undefined ? overrides[rule.id] : rule.required;
    const earned = sumByGroups(completed, rule.groups);
    const plan = sumByGroups(plannedItems, rule.groups);
    const status: RuleStatus =
      required === null
        ? 'unknown'
        : earned >= required
          ? 'met'
          : 'progress';
    return { rule, earned, planned: plan, required, status };
  });
}
