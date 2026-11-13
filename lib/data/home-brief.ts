import type { ActivitySnapshot, ExtActivity } from './activities.ts';
import { activityNeedsVerification } from './activities.ts';
import type { LmsSnapshot } from './lms.ts';
import { courseIsPast, currentSemesterStart, kstDateNumber, parseDue } from './lms.ts';
import type { ScheduleSnapshot } from './schedule.ts';

export type BriefItem = {
  id: string;
  kind: string;
  title: string;
  context: string;
  route: string;
  url?: string;
  at: number | null;
  timing: string;
  caution?: string;
};

type BriefInput = {
  now: number;
  lms?: LmsSnapshot;
  activities: ActivitySnapshot | null;
  schedule: ScheduleSnapshot | null;
  saved: string[];
  actStatus?: Record<string, string>;
  extActivities?: ExtActivity[];
  events: { title: string; date: string }[];
};

/** Date-only school information is a Korean calendar day, never browser-local time. */
const dayEnd = (date: string) => parseDue(date.slice(0, 10));

export function briefTiming(at: number, now: number): string {
  if (at < now) return '기한 지남';
  const days = kstDateNumber(at) - kstDateNumber(now);
  return days === 0 ? '오늘' : days === 1 ? '내일' : `D-${days}`;
}

/** Read existing snapshots only. Missing/uncertain statuses never become confirmed obligations. */
export function buildHomeBrief(input: BriefInput): { deadlines: BriefItem[]; checks: BriefItem[] } {
  const { now, lms, activities, schedule } = input;
  const deadlines: BriefItem[] = [];
  const checks: BriefItem[] = [];
  const before = currentSemesterStart(now);
  const inWeek = (at: number) => {
    const days = kstDateNumber(at) - kstDateNumber(now);
    return days >= 0 && days <= 7;
  };
  const fetched = lms ? Date.parse(lms.fetchedAt) : NaN;
  const staleLms = !Number.isFinite(fetched) || fetched > now || now - fetched >= 86400000;

  for (const course of lms?.courses ?? []) {
    if (course.community || courseIsPast(course, before)) continue;
    for (const [kind, tasks, errorKey] of [
      ['강의', course.vods.map((v) => ({ ...v, submitted: v.attended, due: v.range })), 'vod'],
      ['과제', course.assigns, 'assign'],
      ['퀴즈', course.quizzes, 'quiz'],
    ] as const) {
      const errors = course.errors ?? [];
      const retained = errors.includes(errorKey) || errors.includes('timeout') || errors.includes('budget') || (!!course.retainedAt && !errors.length);
      const statusUnknown = retained || errors.includes(`${errorKey}-check`);
      tasks.forEach((task, index) => {
        if (task.submitted && !task.uncertain && !statusUnknown) return;
        const at = parseDue(task.due ?? null);
        if (at !== null && at < before) return;
        const uncertain = task.uncertain || statusUnknown;
        const caution = retained ? '수집 실패 · 이전 결과일 수 있어요' : uncertain ? '완료 여부 확인 필요' : staleLms ? '이전 수집 결과 · 현재 상태 확인 필요' : undefined;
        const item: BriefItem = {
          id: `lms:${course.id}:${kind}:${index}`,
          kind, title: task.title, context: course.title,
          route: `lms/${course.id}`, url: task.url, at,
          timing: at === null ? '마감 확인' : briefTiming(at, now),
          caution,
        };
        if (at === null) checks.push(item);
        else if (inWeek(at) || (at < now && now - at <= 7 * 86400000)) deadlines.push(item);
      });
    }
  }

  const addActivity = (id: string, title: string, context: string, end: string | null, stale: boolean) => {
    if (input.actStatus?.[id]) return; // Application already recorded; do not ask to apply again.
    const at = end ? parseDue(end) : null;
    const item: BriefItem = {
      id: `activity:${id}`, kind: '신청 마감', title, context,
      route: `activities/${id}`, at,
      timing: at === null ? '마감 확인' : briefTiming(at, now),
      caution: stale ? '현재 접수 여부 확인 필요' : undefined,
    };
    if (at === null || stale) checks.push({ ...item, timing: '접수 확인' });
    else if (at >= now && inWeek(at)) deadlines.push(item);
  };
  const staleActivities = activityNeedsVerification(activities?.fetchedAt, now);
  for (const activity of activities?.items ?? []) {
    if (input.saved.includes(activity.id)) addActivity(activity.id, activity.title, activity.dept, activity.applyEnd, staleActivities);
  }
  for (const activity of input.extActivities ?? []) {
    addActivity(activity.id, activity.title, `${activity.org || '외부 활동'} · 직접 등록`, activity.applyEnd, false);
  }
  for (const event of schedule?.items ?? []) {
    const end = dayEnd(event.end ?? event.start);
    if (end === null || end < now) continue;
    const start = dayEnd(event.start);
    const ending = event.end !== null && inWeek(end);
    const at = ending ? end : start;
    if (at === null || !inWeek(at)) continue;
    deadlines.push({
      id: `schedule:${event.id}`, kind: '학사일정', title: event.title,
      context: event.end ? `${event.start} ~ ${event.end}` : event.start,
      route: 'calendar', at, timing: ending ? `${briefTiming(at, now)} 종료` : `${briefTiming(at, now)} 일정`,
    });
  }
  input.events.forEach((event, index) => {
    const at = dayEnd(event.date);
    if (at === null || at < now || !inWeek(at)) return;
    deadlines.push({
      id: `personal:${event.date}:${index}`, kind: '개인 일정', title: event.title,
      context: `${event.date} · 직접 등록`, route: 'calendar', at, timing: briefTiming(at, now),
    });
  });
  // Upcoming deadlines should not be pushed below old pending entries.
  deadlines.sort((a, b) => {
    const aAt = a.at ?? Infinity;
    const bAt = b.at ?? Infinity;
    const aPast = aAt < now;
    const bPast = bAt < now;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return (aPast ? bAt - aAt : aAt - bAt) || a.id.localeCompare(b.id);
  });
  return { deadlines, checks };
}
