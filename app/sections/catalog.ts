'use client';
import { useEffect, useState } from 'react';
import { resolveDept } from '@/lib/data/dept';
import { apiData, apiFetch } from '@/lib/data/api';
import {
  conflicts,
  type Catalog,
  type CourseSection,
} from '@/lib/data/catalog';
import type { ActivitySnapshot } from '@/lib/data/activities';
import type { DeptRulesSnapshot } from '@/lib/data/dept-rules';
import type { DeptPagesSnapshot } from '@/lib/data/dept-pages';
import type { ScheduleSnapshot } from '@/lib/data/schedule';
import type { Curriculum, CurriculumIndex } from '@/lib/data/curriculum';
import type { EquivalentsSnapshot } from '@/lib/data/equivalents';
import type { CourseHistory } from '@/lib/data/course-history';
import type { Data } from './data';

/**
 * 현재 시각을 tickMs 간격으로 갱신하는 훅.
 * `useState(() => Date.now())`는 마운트 시각에 고정돼 탭을 오래 열어 두면
 * 상대시간(방금/N분 전)과 마감 계산이 실제 시각과 어긋난다 — 상태가 실제
 * 시각을 따라가도록 주기적으로 다시 읽는다.
 */
export function useNow(tickMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return now;
}

let cache: Promise<Catalog> | null = null;
function load() {
  cache ??= apiFetch('/api/courses')
    .then((r) => apiData<Catalog>(r))
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    load()
      .then((c) => on && setCatalog(c))
      .catch(() => on && setFailed(true));
    return () => {
      on = false;
    };
  }, [tick]);
  // 실패 시 load()가 cache를 비우므로 재호출은 실제 재요청이 된다
  const retry = () => {
    setFailed(false);
    setTick((t) => t + 1);
  };
  return { catalog, failed, retry };
}

let actCache: Promise<ActivitySnapshot> | null = null;
let actCachedAt = 0;
function loadActivities() {
  if (actCache && Date.now() - actCachedAt < 60_000) return actCache;
  actCachedAt = Date.now();
  const request = apiFetch('/api/activities')
    .then((r) => apiData<ActivitySnapshot>(r))
    .catch((e) => {
      if (actCache === request) actCache = null;
      throw e;
    });
  actCache = request;
  return request;
}
export function useActivities() {
  const [snap, setSnap] = useState<ActivitySnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    loadActivities()
      .then((s) => { if (on) { setSnap(s); setFailed(false); } })
      .catch(() => on && setFailed(true));
    return () => {
      on = false;
    };
  }, [tick]);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 5 * 60_000);
    return () => clearInterval(timer);
  }, []);
  const retry = () => {
    actCache = null;
    setFailed(false);
    setTick((t) => t + 1);
  };
  return { snap, failed, retry };
}

let schCache: Promise<ScheduleSnapshot> | null = null;
function loadSchedule() {
  schCache ??= apiFetch('/api/schedule')
    .then((r) => apiData<ScheduleSnapshot>(r))
    .catch((e) => {
      schCache = null;
      throw e;
    });
  return schCache;
}
export function useSchedule() {
  const [snap, setSnap] = useState<ScheduleSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    loadSchedule()
      .then((s) => on && setSnap(s))
      .catch(() => on && setFailed(true));
    return () => {
      on = false;
    };
  }, [tick]);
  const retry = () => {
    setFailed(false);
    setTick((t) => t + 1);
  };
  return { snap, failed, retry };
}

let deptRulesCache: Promise<DeptRulesSnapshot> | null = null;
function loadDeptRules() {
  deptRulesCache ??= apiFetch('/api/dept-rules')
    .then((r) => apiData<DeptRulesSnapshot>(r))
    .catch((e) => {
      deptRulesCache = null;
      throw e;
    });
  return deptRulesCache;
}
export function useDeptRules() {
  const [snap, setSnap] = useState<DeptRulesSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    loadDeptRules()
      .then((s) => on && setSnap(s))
      .catch(() => on && setFailed(true));
    return () => {
      on = false;
    };
  }, [tick]);
  const retry = () => {
    setFailed(false);
    setTick((t) => t + 1);
  };
  return { snap, failed, retry };
}

let currIndexCache: Promise<CurriculumIndex> | null = null;
function loadCurriculumIndex() {
  currIndexCache ??= apiFetch('/api/curriculum')
    .then((r) => apiData<CurriculumIndex>(r))
    .catch((e) => {
      currIndexCache = null;
      throw e;
    });
  return currIndexCache;
}
const currCache = new Map<string, Promise<Curriculum>>();
function loadCurriculum(semester: string) {
  let req = currCache.get(semester);
  if (!req) {
    req = apiFetch(`/api/curriculum?semester=${semester}`)
      .then((r) => apiData<Curriculum>(r))
      .catch((e) => {
        currCache.delete(semester);
        throw e;
      });
    currCache.set(semester, req);
  }
  return req;
}
/**
 * 입학연도 교육과정 로드 — 색인을 먼저 받아 적용 학기를 고른 뒤
 * 해당 학기 파일을 받는다. 학기가 못 정해지면 fetch하지 않는다.
 */
export function useCurriculum(semester: string | null) {
  // 학기별 결과를 함께 보관해 이전 학기 데이터가 새 학기에 새어 나오지 않게 한다.
  const [state, setState] = useState<{ sem: string; snap?: Curriculum; failed?: boolean }>({ sem: '' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!semester) return;
    let on = true;
    loadCurriculum(semester)
      .then((s) => { if (on) setState({ sem: semester, snap: s }); })
      .catch(() => { if (on) setState({ sem: semester, failed: true }); });
    return () => { on = false; };
  }, [semester, tick]);
  const retry = () => {
    setState({ sem: semester ?? '' });
    setTick((t) => t + 1);
  };
  const snap = semester && state.sem === semester ? state.snap ?? null : null;
  const failed = !!semester && state.sem === semester && !!state.failed;
  return { snap, failed, retry };
}
export function useCurriculumIndex() {
  const [snap, setSnap] = useState<CurriculumIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    loadCurriculumIndex()
      .then((s) => on && setSnap(s))
      .catch(() => on && setFailed(true));
    return () => { on = false; };
  }, [tick]);
  const retry = () => {
    setFailed(false);
    setTick((t) => t + 1);
  };
  return { snap, failed, retry };
}

let equivCache: Promise<EquivalentsSnapshot> | null = null;
function loadEquivalents() {
  equivCache ??= apiFetch('/api/equivalents')
    .then((r) => apiData<EquivalentsSnapshot>(r))
    .catch((e) => {
      equivCache = null;
      throw e;
    });
  return equivCache;
}
export function useEquivalents() {
  const [snap, setSnap] = useState<EquivalentsSnapshot | null>(null);
  useEffect(() => {
    let on = true;
    loadEquivalents()
      .then((s) => on && setSnap(s))
      .catch(() => {});
    return () => { on = false; };
  }, []);
  return snap;
}

let courseHistoryCache: Promise<CourseHistory> | null = null;
function loadCourseHistory() {
  courseHistoryCache ??= apiFetch('/api/course-history')
    .then((r) => apiData<CourseHistory>(r))
    .catch((e) => {
      courseHistoryCache = null;
      throw e;
    });
  return courseHistoryCache;
}
export function useCourseHistory() {
  const [snap, setSnap] = useState<CourseHistory | null>(null);
  useEffect(() => {
    let on = true;
    loadCourseHistory()
      .then((s) => on && setSnap(s))
      .catch(() => {});
    return () => { on = false; };
  }, []);
  return snap;
}

let deptPagesCache: Promise<DeptPagesSnapshot> | null = null;
function loadDeptPages() {
  deptPagesCache ??= apiFetch('/api/dept-pages')
    .then((r) => apiData<DeptPagesSnapshot>(r))
    .catch((e) => {
      deptPagesCache = null;
      throw e;
    });
  return deptPagesCache;
}
export function useDeptPages() {
  const [snap, setSnap] = useState<DeptPagesSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    loadDeptPages()
      .then((s) => on && setSnap(s))
      .catch(() => on && setFailed(true));
    return () => {
      on = false;
    };
  }, [tick]);
  const retry = () => {
    setFailed(false);
    setTick((t) => t + 1);
  };
  return { snap, failed, retry };
}

/** 넓은 카테고리 그룹 (표시는 원본 이수구분 유지). */
export function catGroup(s: CourseSection) {
  if (s.category === '전필') return '전필';
  if (s.category === '전선' || s.category === 'MD전선') return '전선';
  if (s.category === '전기') return '전기';
  return '교양·일반';
}

export function deptMatches(a: string, b: string) {
  const na = a.replace(/\s+/g, '');
  const nb = b.replace(/\s+/g, '');
  return !!na && (na.includes(nb) || nb.includes(na));
}

/**
 * 프로필 학과명을 카탈로그 학과로 해석.
 * - 확정 → [해당 학과]
 * - 모호 → 후보 전체(학과 필터는 후보들로 적용)
 * - 매칭 실패 → null (학과 필터 비활성, 잘못된 결과 대신 전체 표시)
 */
export function deptPoolOf(
  deptInput: string,
  depts: string[],
): string[] | null {
  const r = resolveDept(deptInput, depts);
  if (r.dept) return [r.dept];
  if (r.candidates) return r.candidates;
  return null;
}

/**
 * 계획 담기 공통 검증 — 이미 담긴 분반·이수 완료·같은 과목 다른 분반·
 * 시간 충돌을 검사하고 막히는 이유 메시지를 돌려준다.
 * 통과 가능하면 null. 과목 탐색·시간표·검색의 담기 경로가 공유한다.
 * opts.retake가 참이면 이수 완료 과목도 담을 수 있다(성적 갱신 재수강).
 */
export function planBlockReason(
  s: CourseSection,
  data: Data,
  planned: CourseSection[],
  opts?: { retake?: boolean },
): string | null {
  if (planned.some((p) => p.id === s.id))
    return '이미 계획에 담긴 분반입니다.';
  if (!opts?.retake && (data.completed ?? []).some((c) => c.code === s.code))
    return '이미 이수한 과목입니다. 이수 내역은 졸업요건에서 관리하세요.';
  const dup = planned.find((p) => p.code === s.code);
  if (dup)
    return `같은 과목의 ${dup.section}분반이 이미 담겨 있습니다. 시간표에서 분반을 변경하세요.`;
  const hits = conflicts(s, planned);
  if (hits.length)
    return `시간이 겹칩니다: ${hits
      .map((h) => h.name)
      .slice(0, 2)
      .join(', ')}`;
  return null;
}

