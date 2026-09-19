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
};

export type LmsCourse = {
  id: string;
  title: string;
  prof?: string;
  community?: boolean;
  vods: LmsVod[];
  assigns: LmsTask[];
  quizzes: LmsTask[];
  /** 수집 실패한 항목 (vod/assign/quiz) — 부분 수집 표시용 */
  errors?: string[];
};

export type LmsSnapshot = {
  source: 'cosmos-lms';
  fetchedAt: string;
  courses: LmsCourse[];
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
  return {
    source: 'cosmos-lms',
    fetchedAt: typeof s.fetchedAt === 'string' ? s.fetchedAt : '',
    courses,
  };
}

export type LmsPending = {
  course: string;
  kind: '강의' | '과제' | '퀴즈';
  title: string;
  url?: string;
  due: string | null;
};

/** 스냅샷 수집 후 경과 일수 — fetchedAt 파싱 불가면 null */
export function staleDays(snap: LmsSnapshot, now: number): number | null {
  const t = Date.parse(snap.fetchedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
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

/** 미완료 항목 평탄화 — 미수강 강의 + 미제출 과제 + 미응시 퀴즈 */
export function pendingTasks(snap: LmsSnapshot): LmsPending[] {
  const out: LmsPending[] = [];
  for (const c of snap.courses) {
    for (const v of c.vods)
      if (!v.attended)
        out.push({
          course: c.title,
          kind: '강의',
          title: v.title,
          url: v.url,
          due: v.range ?? null,
        });
    for (const a of c.assigns)
      if (!a.submitted)
        out.push({
          course: c.title,
          kind: '과제',
          title: a.title,
          url: a.url,
          due: a.due ?? null,
        });
    for (const q of c.quizzes)
      if (!q.submitted)
        out.push({
          course: c.title,
          kind: '퀴즈',
          title: q.title,
          url: q.url,
          due: q.due ?? null,
        });
  }
  return out;
}

const parseDue = (due: string | null): number | null => {
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
 *  겹치면 가장 구체적인(가장 긴) 이름의 분반만 반환한다. */
export function matchEnrollment(
  lms: LmsSnapshot,
  catalog: Catalog,
): EnrolledMatch[] {
  const byName = new Map<string, CourseSection[]>();
  for (const s of catalog.sections) {
    const k = normTitle(s.name);
    if (!k) continue;
    const arr = byName.get(k) ?? [];
    arr.push(s);
    byName.set(k, arr);
  }
  return lms.courses.map((course) => {
    const key = lmsKey(course.title);
    if (!key) return { course, sections: [] };
    let best = '';
    for (const name of byName.keys()) {
      if (key.startsWith(name) && name.length > best.length) best = name;
    }
    return { course, sections: best ? byName.get(best)! : [] };
  });
}

/** 마감 N일 이내 미완료 항목 — 마감 빠른 순. 마감 미기재 항목은 제외 */
export function dueSoon(
  snap: LmsSnapshot,
  now: number,
  days = 7,
): (LmsPending & { dueTs: number })[] {
  const limit = now + days * 86400e3;
  return pendingTasks(snap)
    .flatMap((t) => {
      const ts = parseDue(t.due);
      return ts !== null && ts <= limit ? [{ ...t, dueTs: ts }] : [];
    })
    .sort((a, b) => a.dueTs - b.dueTs);
}
