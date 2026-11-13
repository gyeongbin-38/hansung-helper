import type { Data } from '../../app/sections/data';
import { activityNeedsVerification, actScore, liveStatus, type Activity, type ActivitySnapshot } from './activities.ts';
import { evaluate } from './graduation.ts';

export type ActivityWorkspaceFilter = 'available' | 'saved' | 'all';

/** Client-side finder over the data already loaded by the app. No live school request is implied. */
export function activityWorkspaceItems(
  items: Activity[],
  options: { query?: string; filter?: ActivityWorkspaceFilter; saved?: Set<string>; now?: number } = {},
) {
  const query = (options.query ?? '').trim().toLocaleLowerCase('ko-KR');
  const filter = options.filter ?? 'available';
  const saved = options.saved ?? new Set<string>();
  const now = options.now ?? Date.now();
  return items
    .filter((item) => !query || `${item.title} ${item.dept}`.toLocaleLowerCase('ko-KR').includes(query))
    .filter((item) => filter === 'all' || filter === 'saved' ? filter !== 'saved' || saved.has(item.id) : ['open', 'closing', 'upcoming'].includes(liveStatus(item, now).status))
    .sort((a, b) => Number(saved.has(b.id)) - Number(saved.has(a.id)) || (a.applyEnd ?? '9999').localeCompare(b.applyEnd ?? '9999') || a.title.localeCompare(b.title, 'ko'));
}

/** Public-list facts only: membership, eligibility and acceptance are not exposed by this feed. */
export function activityBrief(activity: Activity, fetchedAt: string | undefined, now = Date.now()) {
  return {
    id: activity.id, title: activity.title, department: activity.dept,
    applicationStart: activity.applyStart, applicationEnd: activity.applyEnd,
    runStart: activity.runStart, runEnd: activity.runEnd, points: activity.points, team: activity.team,
    status: liveStatus(activity, now).label,
    needsVerification: activityNeedsVerification(fetchedAt, now),
    asOf: fetchedAt ?? null,
    eligibility: '공개 목록에 지원 자격·필수 서류·신청 문항이 없어 학교 공고에서 확인 필요',
    application: '신청 준비 단계. 학교 접수·선발·포인트 인정은 확인되지 않음',
  };
}

export function activityDigest(data: Partial<Data>, snapshot: ActivitySnapshot | null, now = Date.now()) {
  const saved = new Set(data.saved ?? []);
  const stages = data.actStatus ?? {};
  const stale = !snapshot || activityNeedsVerification(snapshot.fetchedAt, now);
  const items = snapshot?.items ?? [];
  const open = items.filter(a => ['open', 'closing'].includes(liveStatus(a, now).status));
  const upcoming = items.filter(a => saved.has(a.id) && ['open', 'closing', 'upcoming'].includes(liveStatus(a, now).status));
  const closing = upcoming.filter(a => !stages[a.id] && a.applyEnd && Date.parse(a.applyEnd) >= now && Date.parse(a.applyEnd) <= now + 7 * 86400000);
  const suggestions = open.filter(a => !stages[a.id]).sort((a, b) =>
    Number(saved.has(b.id)) - Number(saved.has(a.id)) ||
    actScore(b, data.actPrefs ?? [], now).score - actScore(a, data.actPrefs ?? [], now).score ||
    (a.applyEnd ?? '9999').localeCompare(b.applyEnd ?? '9999'));
  const points = data.info?.points ?? (data.points?.trim() ? Number(data.points) : undefined);
  const year = data.info?.admitYear ?? Number(data.year);
  const target = evaluate([], [], data.ruleOverrides, { admitYear: year, admissionType: data.admissionType, points }).find(r => r.rule.id === 'points')!.required;
  return {
    stale, saved: saved.size, closing: closing.length,
    participating: Object.values(stages).filter(s => s === 'joined').length,
    awaitingPoints: Object.values(stages).filter(s => s === 'done').length,
    points: points !== undefined && Number.isFinite(points) ? points : null,
    requiredPoints: target,
    remainingPoints: points !== undefined && Number.isFinite(points) && target !== null ? Math.max(0, target - points) : null,
    picks: suggestions.slice(0, 3),
    openCount: open.length,
  };
}
