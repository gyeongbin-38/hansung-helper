/**
 * COSMOS LMS 수집 데이터 — learn.hansung.ac.kr 페이지를 브라우저에서
 * 수집한 스냅샷(public/lms-collect.js 출력물, /lms-collect.js로 제공).
 * 학교 LMS 상태의 복사본이며, 원본은 LMS가 최종 권위다.
 */
import type { Catalog, CourseSection } from './catalog';

export type LmsTask = {
  title: string;
  url?: string;
  /** 'YYYY-MM-DD HH:mm' 또는 null (마감 없음/미기재) */
  due?: string | null;
  submitted: boolean;
  /** 제출/응시 여부 확인에 실패 — 미응시로 단정하지 않음 */
  uncertain?: boolean;
};

export type LmsVod = {
  title: string;
  week?: number;
  /** 출석 상태 원문 (O/X/P 등) */
  status?: string;
  attended: boolean;
  /** 주차 출석 원문 (일괄출석인정 포함) */
  weeklyStatus?: string;
  /** 수강 기간 원문 */
  range?: string;
  /** LMS 강의 링크 */
  url?: string;
  /** 시청시간 'HH:mm[:ss]' (확장 수집기만 제공) */
  watched?: string;
  /** 출석인정 요구시간 원문 (확장 수집기만 제공) */
  required?: string;
};

export type LmsCourse = {
  id: string;
  title: string;
  prof?: string;
  community?: boolean;
  vods: LmsVod[];
  assigns: LmsTask[];
  quizzes: LmsTask[];
  /** 수집 실패한 항목 (vod/assign/quiz/quiz-check) — 부분 수집 표시용 */
  errors?: string[];
};

export type LmsSnapshot = {
  source: 'cosmos-lms';
  fetchedAt: string;
  courses: LmsCourse[];
  /** 수집 진단 메타 — 어떤 셀렉터 경로로 과목을 찾았는지 기록(확장·콘솔 수집기) */
  diag?: {
    coursesVia?: string;
    pagePath?: string;
    scanned?: number;
  };
};

/** 수집 JSON 검증 — 형식이 맞지 않으면 null (부분 보정 없이 거부) */
export function validateLms(raw: unknown): LmsSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (s.source !== 'cosmos-lms' || !Array.isArray(s.courses)) return null;
  const courses: LmsCourse[] = [];
  for (const c of s.courses) {
    if (!c || typeof c !== 'object') return null;
    const co = c as Record<string, unknown>;
    if (typeof co.id !== 'string' || typeof co.title !== 'string') return null;
    const tasks = (v: unknown): LmsTask[] => {
      if (v === undefined) return [];
      if (!Array.isArray(v)) return [];
      return v.flatMap((x) => {
        if (!x || typeof x !== 'object') return [];
        const t = x as Record<string, unknown>;
        if (typeof t.title !== 'string') return [];
        return {
          title: t.title,
          url: typeof t.url === 'string' ? t.url : undefined,
          due: typeof t.due === 'string' ? t.due : null,
          submitted: !!t.submitted,
          uncertain: t.uncertain === true ? true : undefined,
        };
      });
    };
    const vods = (v: unknown): LmsVod[] => {
      if (v === undefined) return [];
      if (!Array.isArray(v)) return [];
      return v.flatMap((x) => {
        if (!x || typeof x !== 'object') return [];
        const t = x as Record<string, unknown>;
        if (typeof t.title !== 'string') return [];
        return {
          title: t.title,
          week: typeof t.week === 'number' ? t.week : undefined,
          status: typeof t.status === 'string' ? t.status : undefined,
          attended: !!t.attended,
          weeklyStatus:
            typeof t.weeklyStatus === 'string' ? t.weeklyStatus : undefined,
          range: typeof t.range === 'string' ? t.range : undefined,
          url: typeof t.url === 'string' ? t.url : undefined,
          watched: typeof t.watched === 'string' ? t.watched : undefined,
          required: typeof t.required === 'string' ? t.required : undefined,
        };
      });
    };
    courses.push({
      id: co.id,
      title: co.title,
      prof: typeof co.prof === 'string' ? co.prof : undefined,
      community: !!co.community,
      vods: vods(co.vods),
      assigns: tasks(co.assigns),
      quizzes: tasks(co.quizzes),
      errors: Array.isArray(co.errors)
        ? co.errors.filter((e): e is string => typeof e === 'string')
        : undefined,
    });
  }
  const d = s.diag as Record<string, unknown> | undefined;
  return {
    source: 'cosmos-lms',
    fetchedAt: typeof s.fetchedAt === 'string' ? s.fetchedAt : '',
    courses,
    ...(d && typeof d === 'object'
      ? {
          diag: {
            ...(typeof d.coursesVia === 'string'
              ? { coursesVia: d.coursesVia }
              : {}),
            ...(typeof d.pagePath === 'string' ? { pagePath: d.pagePath } : {}),
            ...(typeof d.scanned === 'number' ? { scanned: d.scanned } : {}),
          },
        }
      : {}),
  };
}

export type LmsPending = {
  course: string;
  kind: '강의' | '과제' | '퀴즈';
  title: string;
  url?: string;
  due: string | null;
  /** 확인 실패 항목 — "미완료"가 아니라 "확인 불가"로 표시해야 함 */
  uncertain?: boolean;
};

/** now 기준 현재 학기 시작 — 3/1(1학기)·9/1(2학기) 중 가장 최근.
 *  카탈로그 학기 문자열을 모를 때의 일반적 기본값. */
export function currentSemesterStart(now: number): number {
  const d = new Date(now);
  const y = d.getFullYear();
  const sep = new Date(y, 8, 1).getTime();
  if (now >= sep) return sep;
  const mar = new Date(y, 2, 1).getTime();
  if (now >= mar) return mar;
  return new Date(y - 1, 8, 1).getTime();
}

/** 마감 시각이 before보다 이전이면 지난 학기 항목.
 *  마감 미기재(dueTs null)는 학기를 알 수 없으므로 현재로 간주한다(추측 금지). */
export const isPast = (
  dueTs: number | null,
  before?: number | null,
): boolean => before != null && dueTs !== null && dueTs < before;

/** 과목의 마감이 모두 before 이전이면 지난 학기 과목 — 마감 미기재만 있으면 현재로 간주 */
export function courseIsPast(
  c: LmsCourse,
  before?: number | null,
): boolean {
  if (before == null) return false;
  const ts = [
    ...c.vods.map((v) => parseDue(v.range ?? null)),
    ...c.assigns.map((a) => parseDue(a.due ?? null)),
    ...c.quizzes.map((q) => parseDue(q.due ?? null)),
  ].filter((t): t is number => t !== null);
  return ts.length > 0 && ts.every((t) => t < before);
}

/** 스냅샷 수집 후 경과 일수 — fetchedAt 파싱 불가면 null */
export function staleDays(snap: LmsSnapshot, now: number): number | null {
  const t = Date.parse(snap.fetchedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

/** ISO 시각 → '방금/N분 전/N시간 전/N일 전' 상대 표기. 파싱 불가면 '시각 미상'. */
export function relTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '시각 미상';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return '방금';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 과목별 수강 진행 (온라인 강의 기준) */
export function courseProgress(c: LmsCourse): { done: number; total: number } {
  return {
    done: c.vods.filter((v) => v.attended).length,
    total: c.vods.length,
  };
}

export type WeekProgress = {
  week: number;
  done: number;
  total: number;
  /** 그룹 내 첫 항목의 수강 기간 원문 */
  range?: string;
};

/** vod를 주차별로 그룹화 — week 미기재 항목은 제외(주차를 지어내지 않음), 주차 오름차순 */
export function weekProgress(c: LmsCourse): WeekProgress[] {
  const map = new Map<number, WeekProgress>();
  for (const v of c.vods) {
    if (typeof v.week !== 'number') continue;
    const g =
      map.get(v.week) ?? { week: v.week, done: 0, total: 0 };
    g.total += 1;
    if (v.attended) g.done += 1;
    g.range ??= v.range;
    map.set(v.week, g);
  }
  return [...map.values()].sort((a, b) => a.week - b.week);
}

/** 미완료 항목 평탄화 — 미수강 강의 + 미제출 과제 + 미응시 퀴즈.
 *  before를 주면 그보다 이전에 끝난 지난 학기 항목은 제외한다. */
export function pendingTasks(
  snap: LmsSnapshot,
  before?: number | null,
): LmsPending[] {
  const out: LmsPending[] = [];
  const push = (p: LmsPending) => {
    if (!isPast(parseDue(p.due), before)) out.push(p);
  };
  for (const c of snap.courses) {
    for (const v of c.vods)
      if (!v.attended)
        push({
          course: c.title,
          kind: '강의',
          title: v.title,
          url: v.url,
          due: v.range ?? null,
        });
    for (const a of c.assigns)
      if (!a.submitted)
        push({
          course: c.title,
          kind: '과제',
          title: a.title,
          url: a.url,
          due: a.due ?? null,
        });
    for (const q of c.quizzes)
      if (!q.submitted)
        push({
          course: c.title,
          kind: '퀴즈',
          title: q.title,
          url: q.url,
          due: q.due ?? null,
          uncertain: q.uncertain,
        });
  }
  return out;
}

export type SubmissionItem = {
  course: string;
  courseId: string;
  kind: '과제' | '퀴즈';
  title: string;
  url?: string;
  due: string | null;
  /** parseDue 기반 마감 시각 — 정렬용, 파싱 불가면 null */
  dueTs: number | null;
  submitted: boolean;
  /** 제출·응시 여부 확인 실패 — 미완료로 단정하지 않음 */
  uncertain?: boolean;
  /** 마감이 학기 시작(before)보다 이전 — 지난 학기 보관 영역용 */
  past?: boolean;
};

/**
 * 전체 과제·퀴즈 — 제출 완료 항목 포함 (pendingTasks는 미완료만).
 * 정렬: 미완료·확인불가 먼저 → 마감 빠른 순 → 완료는 마감 빠른 순으로 뒤에.
 * before를 주면 그보다 이전에 끝난 항목에 past 표시(현재와 분리용).
 */
export function submissionItems(
  snap: LmsSnapshot,
  before?: number | null,
): SubmissionItem[] {
  const out: SubmissionItem[] = [];
  for (const c of snap.courses) {
    for (const a of c.assigns)
      out.push({
        course: c.title,
        courseId: c.id,
        kind: '과제',
        title: a.title,
        url: a.url,
        due: a.due ?? null,
        dueTs: parseDue(a.due ?? null),
        submitted: a.submitted,
        past: isPast(parseDue(a.due ?? null), before) || undefined,
      });
    for (const q of c.quizzes)
      out.push({
        course: c.title,
        courseId: c.id,
        kind: '퀴즈',
        title: q.title,
        url: q.url,
        due: q.due ?? null,
        dueTs: parseDue(q.due ?? null),
        submitted: q.submitted,
        uncertain: q.uncertain,
        past: isPast(parseDue(q.due ?? null), before) || undefined,
      });
  }
  return out.sort((a, b) => {
    const pa = (a.past ? 1 : 0) * 2 + (a.submitted ? 1 : 0);
    const pb = (b.past ? 1 : 0) * 2 + (b.submitted ? 1 : 0);
    if (pa !== pb) return pa - pb;
    if (a.dueTs === null && b.dueTs === null) return 0;
    if (a.dueTs === null) return 1;
    if (b.dueTs === null) return -1;
    return a.dueTs - b.dueTs;
  });
}

export type BingeItem = {
  course: string;
  courseId: string;
  week?: number;
  title: string;
  /** COSMOS 강의 페이지 링크 */
  url?: string;
  /** 수강 기간 원문 */
  range?: string;
  /** 출석 상태 원문 (O/X/P 등) */
  status?: string;
  /** 주차 출석 원문 (일괄출석인정 포함) */
  weeklyStatus?: string;
  /** 수강 기간 끝(마감) 시각 — 파싱 불가면 null */
  dueTs: number | null;
  /** 마감이 학기 시작(before)보다 이전 — 지난 학기 보관 영역용 */
  past?: boolean;
  /** 시청시간 'HH:mm[:ss]' (확장·콘솔 수집기만 제공) */
  watched?: string;
  /** 출석인정 요구시간 원문 */
  required?: string;
};

/**
 * 안 들은 온라인 강의 몰아듣기 큐 — 수강 기간 마감 빠른 순.
 * 기한을 알 수 없는 항목은 주차 오름차순으로 뒤에 둔다.
 * before를 주면 그보다 이전에 끝난 항목에 past 표시(현재와 분리용).
 */
export function bingeQueue(
  snap: LmsSnapshot,
  before?: number | null,
): BingeItem[] {
  const out: BingeItem[] = [];
  for (const c of snap.courses)
    for (const v of c.vods)
      if (!v.attended)
        out.push({
          course: c.title,
          courseId: c.id,
          week: v.week,
          title: v.title,
          url: v.url,
          range: v.range,
          status: v.status,
          weeklyStatus: v.weeklyStatus,
          dueTs: parseDue(v.range ?? null),
          past: isPast(parseDue(v.range ?? null), before) || undefined,
          watched: v.watched,
          required: v.required,
        });
  return out.sort((a, b) => {
    const pa = a.past ? 1 : 0;
    const pb = b.past ? 1 : 0;
    if (pa !== pb) return pa - pb;
    if (a.dueTs === null && b.dueTs === null)
      return (a.week ?? 99) - (b.week ?? 99);
    if (a.dueTs === null) return 1;
    if (b.dueTs === null) return -1;
    return a.dueTs - b.dueTs;
  });
}

/** 'YYYY-MM-DD HH:mm' 또는 범위 'a ~ b'의 마감(끝) 시각 — 파싱 불가면 null */
export const parseDue = (due: string | null): number | null => {
  if (!due) return null;
  // 'YYYY-MM-DD HH:mm' — range 'a ~ b' 형태면 끝(마감) 쪽 날짜가 매칭됨
  const m = due.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?\s*$/);
  if (!m) return null;
  return new Date(
    +m[1],
    +m[2] - 1,
    +m[3],
    +(m[4] ?? 23),
    +(m[5] ?? 59),
  ).getTime();
};

export type EnrolledMatch = {
  course: LmsCourse;
  /** 카탈로그에서 이름이 매칭된 분반들 — 없으면 빈 배열 */
  sections: CourseSection[];
  /** 사용자가 수업 현황에서 직접 연결한 매칭 (lmsMatch override) */
  manual?: boolean;
  /** 사용자가 '해당 과목 없음'으로 제외한 과목 — 매칭 경고에서 빠진다 */
  ignored?: boolean;
};

/** 과목명 정규화 — 학기 표기·괄호 장식·공백을 제거해 이름 비교에 사용 */
const normTitle = (s: string) =>
  s
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\d{4}\s*[-./년]?\s*\d?학기/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();

/** LMS 강의명에서 카테고리·분반·교수 장식을 벗긴 과목 후보 키.
 *  실제 fullname 형식: "교과(오프라인) 학부 알고리즘[A] 이지은" */
const lmsKey = (title: string) =>
  normTitle(
    title
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(
        /(^|\s)(교과|비교과|커뮤니티|학부|대학원|대학|전공|교양)(\s*\([^)]*\))?(?=\s|$)/g,
        ' ',
      ),
  );

/** LMS 수강 과목 ↔ 개설강의 카탈로그 이름 매칭 — 수강 정보를 지어내지 않고
 *  이름이 일치하는 분반만 반환한다(매칭 없으면 빈 배열).
 *  카탈로그 과목명이 LMS 제목의 접두어인 경우 매칭으로 보고, 여러 이름이
 *  겹치면 가장 구체적인(가장 긴) 이름의 분반만 반환한다.
 *  overrides(사용자 보정)는 자동 매칭보다 우선한다: 'ignore'는 제외,
 *  분반 id는 같은 과목 코드의 분반 전체로 확장된다. 카탈로그 재생성으로
 *  사라진 id를 가리키는 보정값은 자동 매칭으로 되돌린다. */
export function matchEnrollment(
  lms: LmsSnapshot,
  catalog: Catalog,
  overrides?: Record<string, string>,
): EnrolledMatch[] {
  const byName = new Map<string, CourseSection[]>();
  const byId = new Map<string, CourseSection>();
  const byCode = new Map<string, CourseSection[]>();
  for (const s of catalog.sections) {
    byId.set(s.id, s);
    const byC = byCode.get(s.code) ?? [];
    byC.push(s);
    byCode.set(s.code, byC);
    const k = normTitle(s.name);
    if (!k) continue;
    const arr = byName.get(k) ?? [];
    arr.push(s);
    byName.set(k, arr);
  }
  return lms.courses.map((course) => {
    const ov = overrides?.[course.id];
    if (ov === 'ignore') return { course, sections: [], ignored: true };
    if (ov) {
      const sec = byId.get(ov);
      if (sec)
        return {
          course,
          sections: byCode.get(sec.code) ?? [sec],
          manual: true,
        };
    }
    const key = lmsKey(course.title);
    if (!key) return { course, sections: [] };
    let best = '';
    for (const name of byName.keys()) {
      if (key.startsWith(name) && name.length > best.length) best = name;
    }
    return { course, sections: best ? byName.get(best)! : [] };
  });
}

/** COSMOS 수강 과목과 이름이 매칭된 카탈로그 분반 id 집합 — 표시용.
 *  이름 매칭만으로는 이수 확정이 아니므로 졸업 집계에는 쓰지 않는다. */
export function enrolledSectionIds(
  lms: LmsSnapshot,
  catalog: Catalog,
  overrides?: Record<string, string>,
): Set<string> {
  const ids = new Set<string>();
  for (const m of matchEnrollment(lms, catalog, overrides))
    for (const s of m.sections) ids.add(s.id);
  return ids;
}

export type MatchCandidate = {
  /** 과목 코드 — 같은 코드의 분반들이 한 후보로 묶인다 */
  code: string;
  name: string;
  dept: string;
  credits: number;
  sectionCount: number;
  /** override 저장에 쓰는 대표 분반 id */
  sectionId: string;
  /** 사용자에게 보이는 근거 — '이름 유사' '교수 일치' '분반 일치' */
  why: string[];
  score: number;
};

/** 정규화 문자열 두 개의 Dice bigram 유사도(0~1) — 짧은 과목명 비교용 */
const diceSim = (a: string, b: string): number => {
  if (!a || !b || a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
};

/** LMS '[A]'·'[01]' 분반 표기 → 카탈로그 section 값과 비교 가능한 형태 */
const sectKey = (raw: string | undefined): string => {
  if (!raw) return '';
  const s = raw.trim().toUpperCase();
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
};

/** 매칭에 실패한 LMS 과목의 보정 후보 — 과목 코드 단위로 묶어 제안한다.
 *  이름 유사도가 없으면 후보에서 제외하고, 교수·분반 일치는 보조 근거로
 *  점수를 올린다. 사용자가 최종 승인하므로 자동 확정은 하지 않는다. */
export function suggestMatchCandidates(
  course: LmsCourse,
  catalog: Catalog,
  limit = 5,
): MatchCandidate[] {
  const key = lmsKey(course.title);
  if (!key) return [];
  const profKey = course.prof ? normTitle(course.prof) : '';
  // LMS 제목 끝에 붙는 교수명을 떼면 과목 본체가 남는다
  const body = profKey ? key.replace(profKey, '') : key;
  if (!body) return [];
  const lmsSect = sectKey(course.title.match(/\[([^\]]{1,4})\]/)?.[1]);
  const byCode = new Map<string, MatchCandidate>();
  for (const s of catalog.sections) {
    const nk = normTitle(s.name);
    if (!nk) continue;
    const why: string[] = [];
    let score = 0;
    if (body.startsWith(nk) || nk.startsWith(body)) {
      score += 5;
      why.push('이름 포함');
    } else {
      const sim = diceSim(body, nk);
      if (sim >= 0.55) {
        score += 3;
        why.push('이름 유사');
      } else if (sim >= 0.4) score += 1;
      else continue;
    }
    if (profKey && normTitle(s.professor) === profKey) {
      score += 3;
      why.push('교수 일치');
    }
    if (lmsSect && sectKey(s.section) === lmsSect) {
      score += 1;
      why.push('분반 일치');
    }
    const cur = byCode.get(s.code);
    if (!cur || score > cur.score)
      byCode.set(s.code, {
        code: s.code,
        name: s.name,
        dept: s.dept,
        credits: s.credits,
        sectionCount: 1,
        sectionId: s.id,
        why,
        score,
      });
    else cur.sectionCount += 1;
  }
  return [...byCode.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** 마감 N일 이내 미완료 항목 — 마감 빠른 순. 마감 미기재 항목은 제외.
 *  마감이 pastDays일 이상 지난 항목도 제외 — 오래 지난 항목이
 *  다가오는 마감을 밀어내지 않게 한다.
 *  before(학기 경계)를 주면 그보다 이전에 끝난 항목도 제외한다. */
export function dueSoon(
  snap: LmsSnapshot,
  now: number,
  days = 7,
  pastDays = 7,
  before?: number | null,
): (LmsPending & { dueTs: number })[] {
  const limit = now + days * 86400e3;
  const floor = now - pastDays * 86400e3;
  return pendingTasks(snap, before)
    .flatMap((t) => {
      const ts = parseDue(t.due);
      return ts !== null && ts >= floor && ts <= limit
        ? [{ ...t, dueTs: ts }]
        : [];
    })
    .sort((a, b) => a.dueTs - b.dueTs);
}
