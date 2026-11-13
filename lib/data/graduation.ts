import { gradGroup, type CourseSection } from './catalog.ts';
import type { InfoAuditRow } from './info.ts';

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

/** 사용자에게 보여주는 필요 수량 이름 — 비교과는 포인트, 교과는 학점. */
export function requirementQuantityName(rule: Pick<GradRequirement, 'source'>): '포인트' | '학점' {
  return rule.source === 'points' ? '포인트' : '학점';
}

/** 전역 졸업 기준의 공식 출처 — hansung.ac.kr 비교과 포인트 안내 */
export const GLOBAL_RULE_SOURCE = {
  url: 'https://www.hansung.ac.kr/hansung/6217/subview.do',
  label: '한성대학교 교육과정 이수체계 (공식 페이지)',
  asOf: '2026-11-13',
};
export const TRANSFER_RULE_SOURCE = {
  url: 'https://www.hansung.ac.kr/hansung/6221/subview.do',
  label: '한성대학교 3학년 편입생 이수체계 (공식 페이지)',
};

/**
 * 표시용 기본 항목. 실제 기준은 입학유형과 입학연도를 확인해 적용한다.
 */
export const DEFAULT_RULES: GradRequirement[] = [
  {
    id: 'total',
    label: '총 이수학점 (교과)',
    groups: ['전공필수', '전공선택', '교양', '일반선택', '기타'],
    required: 130,
    note: '공식 기준은 학번·입학유형별로 적용 — 학과별 세부 요건 별도 확인',
  },
  {
    id: 'points',
    label: '비교과 포인트',
    groups: [],
    required: 800,
    unit: 'P',
    source: 'points',
    note: '실제 졸업 인정 포인트는 hsportal 마이페이지에서 확인',
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
export type AdmissionType = 'unknown' | 'freshman' | 'general-transfer' | 'bachelor-transfer';

/** 학교 공식 안내에서 확인한 학번별 교양 기준. 세부 충족은 별도 사정이 필요하다. */
export function generalEducationReference(year: number | undefined, admission: AdmissionType) {
  if (admission !== 'freshman') return null;
  const url = 'https://www.hansung.ac.kr/hansung/6219/subview.do';
  if (year !== undefined && year >= 2024) return { total: 31, note: '교양필수 13학점, 선택필수교양 15학점, 자율선택 3학점 및 4개 영역 이상 확인 필요', url };
  if (year !== undefined && year >= 2019) return { total: 28, note: '교양필수 8~10학점, 선택필수교양 7~9학점, 일반교양·일반선택 9~13학점 및 3개 영역 이상 확인 필요', url };
  if (year === 2017 || year === 2018) return { total: 22, note: '교양필수 16학점(필수 이수) 및 핵심역량별 자율교양 이수 확인 필요', url };
  return null;
}

/** 평점이 누락되거나 최근 확인에 실패한 경우 충족으로 추정하지 않는다. */
export function evaluateGpa(gpa: number | undefined, verified: boolean): { required: number; earned?: number; status: RuleStatus } {
  const valid = typeof gpa === 'number' && Number.isFinite(gpa) && gpa >= 0 && gpa <= 4.5;
  return { required: 2, earned: valid ? gpa : undefined,
    status: !verified || !valid ? 'unknown' : gpa >= 2 ? 'met' : 'progress' };
}
/** required 값의 출처 — 학교 사정표 > 사용자 입력 > 학과 규정표 > 전역 공식 순 */
export type RequiredSource = 'audit' | 'override' | 'dept' | 'global';
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
  /** 재수강·중복 여부를 판정할 수 없는 동일 과목이 있는 경우 */
  uncertainCredits?: boolean;
  uncertainTrack?: boolean;
  uncertainAllocation?: boolean;
  /** 학교 졸업가사정표에서 기준·취득을 직접 확인한 경우의 판정 원문 */
  auditVerdict?: string;
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
    admissionType?: AdmissionType;
    programMode?: string;
    points?: number;
    /**
     * 학과 규정표(dept-rules yearTable)에서 해석된 학번별 기준.
     * total/points 규정에만 적용 — 사용자 override보다 낮고 전역 기준보다 높다.
     */
    deptTargets?: { total?: number; points?: number };
  } = {},
): RuleResult[] {
  const year = opts.admitYear ?? 0;
  const currentYear = new Date(Date.now() + 9 * 3600_000).getUTCFullYear();
  const validYear = typeof year === 'number' && Number.isInteger(year) && year >= 1900 && year <= currentYear;
  const admission = ['freshman', 'general-transfer', 'bachelor-transfer'].includes(opts.admissionType ?? '')
    ? opts.admissionType : 'unknown';
  // 이수 완료로 등록된 과목이 계획에도 남아 있으면 이중 집계된다 —
  // earned가 확정분이므로 계획 측에서는 빼고 '남은 이수 예정'만 센다.
  const doneCodes = new Set(completed.map((c) => c.code));
  const counts = new Map<string, number>();
  for (const c of completed) {
    const key = c.code?.trim();
    if (key && key !== '미확인') counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ambiguous = completed.filter((c) => (counts.get(c.code?.trim()) ?? 0) > 1);
  const verifiedCompleted = completed.filter((c) => (counts.get(c.code?.trim()) ?? 0) <= 1);
  const plannedCodes = new Set<string>();
  const plannedItems = planned
    .filter((s) => {
      if (doneCodes.has(s.code) || plannedCodes.has(s.code)) return false;
      plannedCodes.add(s.code);
      return true;
    })
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
    let required: number | null = null;
    let requiredSource: RequiredSource | undefined;
    if (overrides[rule.id] !== undefined) {
      required = overrides[rule.id];
      requiredSource = 'override';
    } else if (deptVal !== undefined && validYear && admission === 'freshman') {
      required = deptVal;
      requiredSource = 'dept';
    } else if (!validYear || admission === 'unknown') {
      required = null;
    } else if (rule.id === 'total') {
      required = admission === 'bachelor-transfer' ? (year >= 2016 ? 65 : 70) : (year >= 2016 ? 130 : 140);
      requiredSource = 'global';
    } else if (rule.id === 'points' && year >= 2016) {
      required = admission === 'freshman' ? 800 : 400;
      requiredSource = 'global';
    } else if (rule.id === 'major' && year >= 2017 && (admission === 'freshman' || admission === 'general-transfer')) {
      // 17학번 이후 전공합계는 이수과정 무관하게 78 (융합Ⅰ 39+39 · 융합Ⅱ 57+21 · 심화 78)
      required = 78;
      requiredSource = 'global';
    } else if (rule.id === 'major' && year >= 2016 && admission === 'bachelor-transfer') {
      // 학사편입생(16학번 이후): 본인 전공 39학점
      required = 39;
      requiredSource = 'global';
    } else if (rule.id === 'gen' && (admission === 'freshman' || admission === 'general-transfer')) {
      // 교양 최소 이수학점 — 17~18학번 22 / 19~23학번 28 / 24학번 이후 31
      if (year >= 2024) required = 31;
      else if (year >= 2019) required = 28;
      else if (year >= 2017) required = 22;
      if (required !== null) requiredSource = 'global';
    } else if (rule.id === 'free' && admission === 'bachelor-transfer' && year >= 2016) {
      // 학사편입생: 전공 39 + 자유선택 26 = 65학점
      required = 26;
      requiredSource = 'global';
    } else if (rule.id === 'free' && admission === 'freshman' && year >= 2024) {
      // 24학번 이후: 총 130 − 전공 78 − 교양 31 = 자유선택 21
      required = 21;
      requiredSource = 'global';
    } else {
      required = null;
    }
    const isPoints = rule.source === 'points';
    const earned = isPoints ? (opts.points ?? 0) : sumByGroups(verifiedCompleted, rule.groups);
    const plan = isPoints ? 0 : sumByGroups(plannedItems, rule.groups);
    const missingInput = isPoints && opts.points === undefined;
    const uncertainCredits = !isPoints && ambiguous.some((c) => rule.groups.includes(gradGroup(c.category)));
    // 융합전공Ⅰ 모의 계산에서만 — 두 트랙 각 39학점 배분은 과목별 소속 확인이 필요하다.
    const uncertainTrack = rule.id === 'major' && requiredSource === 'global' && required === 78 && opts.programMode === 'fusion1';
    // 교양 기준에는 일반선택 성격 과목이 일부 포함될 수 있어 분류만으로 배분할 수 없다.
    const uncertainAllocation = requiredSource === 'global' &&
      ((rule.id === 'gen' && year >= 2019) ||
        (rule.id === 'free' && (year >= 2024 || admission === 'bachelor-transfer')));
    const status: RuleStatus =
      required === null || missingInput || uncertainCredits || uncertainTrack || uncertainAllocation
        ? 'unknown'
        : earned >= required
          ? 'met'
          : 'progress';
    return { rule, earned, planned: plan, required, requiredSource, status, uncertainCredits: uncertainCredits || undefined, uncertainTrack: uncertainTrack || undefined, uncertainAllocation: uncertainAllocation || undefined };
  });
}

const auditNum = (s: string): number | undefined => {
  const m = s.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : undefined;
};

/** 사정표 영역 라벨 → 규칙 id. 합성 행(parts)은 결합 행이 없을 때 합산한다. */
const AUDIT_MAP: Record<string, { re: RegExp; excl?: RegExp; parts?: RegExp[] }> = {
  points: { re: /비교과|포인트|마일리지/ },
  majorReq: { re: /전공.*필수|필수.*전공|전필/ },
  major: {
    re: /전공/,
    excl: /필수|선택/,
    parts: [/전공.*필수|필수.*전공|전필/, /전공.*선택|선택.*전공|전선/],
  },
  gen: {
    re: /교양|선필교/,
    excl: /필수|선택|영역/,
    parts: [/교양.*필수|필수.*교양|교필/, /선택.*교양|선필교/, /일반.*교양|일교/],
  },
  free: { re: /일반선택|자유선택|자유/ },
  total: { re: /총|소계|합계|전체|졸업.*학점|졸업학점|수료/, excl: /비교과|포인트|평점|전공|교양/ },
};

const auditHit = (audit: InfoAuditRow[], re: RegExp, excl?: RegExp) =>
  audit.find((a) => re.test(a.area) && !(excl && excl.test(a.area)));

const auditMet = (verdict: string): boolean | undefined => {
  // '미충족'이 '충족'에 매칭되므로 부정을 먼저 확인한다.
  if (/미충족|미달|부족|불가|불충족|^n$/i.test(verdict)) return false;
  if (/충족|통과|합격|가능|완료|^y$/i.test(verdict)) return true;
  return undefined;
};

/**
 * 학교 졸업가사정표(info.audit)를 평가 결과에 반영한다.
 * 영역 행이 맞으면 기준·취득을 학교 값으로 교체하고 판정 원문을 보존한다.
 * 결합 행이 없는 규칙은 세부 행 합산(2개 이상)으로 채운다.
 */
export function applyAudit(results: RuleResult[], audit: InfoAuditRow[] | undefined): RuleResult[] {
  if (!audit?.length) return results;
  return results.map((r) => {
    const conf = AUDIT_MAP[r.rule.id];
    if (!conf) return r;
    let hit = auditHit(audit, conf.re, conf.excl);
    const verdict = hit?.verdict ?? '';
    if (!hit && conf.parts) {
      const rows = conf.parts
        .map((re) => audit.find((a) => re.test(a.area)))
        .filter((a): a is InfoAuditRow => !!a);
      if (rows.length >= 2) {
        const req = rows.map((a) => auditNum(a.required));
        const got = rows.map((a) => auditNum(a.earned));
        hit = {
          area: rows.map((a) => a.area).join('+'),
          required: req.every((n) => n !== undefined)
            ? String(req.reduce<number>((s, n) => s + (n ?? 0), 0))
            : '',
          earned: got.every((n) => n !== undefined)
            ? String(got.reduce<number>((s, n) => s + (n ?? 0), 0))
            : '',
          verdict: '',
        };
      }
    }
    if (!hit) return r;
    const req = auditNum(hit.required);
    const got = auditNum(hit.earned);
    const required = req ?? r.required;
    const earned = got ?? r.earned;
    const met = auditMet(verdict);
    const status: RuleStatus =
      met === true
        ? 'met'
        : met === false
          ? 'progress'
          : required === null
            ? 'unknown'
            : earned >= required
              ? 'met'
              : 'progress';
    return {
      ...r,
      earned,
      required,
      requiredSource: 'audit',
      status,
      // 사정표 취득값이 확정치라 재수강 추정 경고는 사라진다.
      uncertainCredits: undefined,
      auditVerdict: verdict || undefined,
    };
  });
}

/** 학기 라벨 '2026-2' → [2026, 2] */
export const parseSemester = (s: string): [number, number] | null => {
  const m = s.match(/(20\d{2})\s*[-./]?\s*([12])/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
};

const semIdx = (y: number, s: number) => y * 2 + (s - 1);
const semLabel = (idx: number) => `${Math.floor(idx / 2)}-${(idx % 2) + 1}`;

/** 졸업 전망 역산 — 남은 학점을 학기당 목표로 나눈 추정치.
 *  공식 사정이 아니라 계획 참고용 — 화면에 가정을 그대로 표시해야 한다.
 *  이번 학기 계획 과목은 '이수 예정'으로 취급해 남은 학점에서 먼저 뺀다. */
export function graduationOutlook(input: {
  /** 확정 이수 학점(교과 총계) */
  earned: number;
  /** 졸업 필요 총학점 — null이면 기준 미확정으로 계산 불가 */
  required: number | null;
  /** 이번 학기 계획 과목 학점 */
  planned: number;
  /** 학기당 목표 이수 학점 — 미지정 시 계획 학점(없으면 18) */
  perSemester?: number;
  /** 현재 학기 라벨 '2026-2' — 예상 졸업 시기 계산용 */
  semester?: string;
  /** 입학연도 — 현재 학년차 표시용 */
  admitYear?: number;
}): {
  /** 계산 가능 여부 — required 미확정 또는 입력 부족이면 false */
  ok: boolean;
  /** 계획 반영 전 남은 교과 학점 */
  remaining: number;
  /** 이번 학기 계획 반영 후 남은 학점 */
  afterPlan: number;
  /** 실제 적용된 학기당 학점 */
  perSemester: number;
  /** 계획 이수 후 추가로 필요한 학기 수 */
  semestersLeft: number;
  /** 예상 졸업 학기 라벨 'YYYY-S' — semester 미지정이면 없음 */
  estLabel?: string;
  /** 현재 학년차 — admitYear+semester가 있을 때만 */
  gradeYear?: number;
} {
  if (input.required === null || input.required <= 0)
    return {
      ok: false,
      remaining: 0,
      afterPlan: 0,
      perSemester: 0,
      semestersLeft: 0,
    };
  const remaining = Math.max(0, input.required - input.earned);
  const afterPlan = Math.max(0, remaining - input.planned);
  const perSemester = Math.min(
    25,
    Math.max(1, Math.round(input.perSemester ?? (input.planned || 18))),
  );
  const semestersLeft = Math.ceil(afterPlan / perSemester);
  const sem = input.semester ? parseSemester(input.semester) : null;
  let estLabel: string | undefined;
  let gradeYear: number | undefined;
  if (sem) {
    const cur = semIdx(sem[0], sem[1]);
    // 계획은 현재 학기분 — 남은 학점은 다음 학기부터 채운다
    estLabel = semLabel(cur + semestersLeft);
    if (input.admitYear) {
      const elapsed = cur - semIdx(input.admitYear, 1);
      if (elapsed >= 0 && elapsed < 20) gradeYear = Math.floor(elapsed / 2) + 1;
    }
  }
  return {
    ok: true,
    remaining,
    afterPlan,
    perSemester,
    semestersLeft,
    estLabel,
    gradeYear,
  };
}
