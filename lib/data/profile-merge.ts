import type { Data } from '../../app/sections/data';

/** 3-way 프로필 병합 — 다른 기기가 먼저 저장해 409가 났을 때
 *  base(내가 마지막으로 동기화한 상태) 대비 local(내 변경)과
 *  remote(서버의 현재 상태)를 필드별로 병합한다.
 *  - 배열 필드는 집합 병합: 양쪽 추가분을 합치고 삭제는 local 삭제분만
 *    반영(remote도 지운 항목은 어차피 remote에 없다)
 *  - 레코드 필드는 키 단위 3-way: local이 추가·변경한 키는 local 값,
 *    local이 지운 키는 삭제, 나머지는 remote
 *  - 스칼라는 local이 바꾼 경우만 local, 아니면 remote(다른 기기 변경 보존)
 *  - lms/info/consent/rev는 서버 관리 필드라 remote 고정 */
export function mergeProfile(base: Data, local: Data, remote: Data): Data {
  const setMerge = <T>(b: T[], l: T[], r: T[], key: (x: T) => string): T[] => {
    const bk = new Set(b.map(key));
    const removed = new Set(
      [...bk].filter((k) => !l.some((x) => key(x) === k)),
    );
    const out = r.filter((x) => !removed.has(key(x)));
    const seen = new Set(out.map(key));
    for (const x of l) {
      const k = key(x);
      if (!bk.has(k) && !seen.has(k)) {
        out.push(x);
        seen.add(k);
      }
    }
    return out;
  };
  const recMerge = <V>(
    b: Record<string, V> | undefined,
    l: Record<string, V> | undefined,
    r: Record<string, V> | undefined,
  ): Record<string, V> => {
    const bb = b ?? {};
    const ll = l ?? {};
    const out: Record<string, V> = { ...r };
    for (const k of Object.keys(ll))
      if (!(k in bb) || JSON.stringify(ll[k]) !== JSON.stringify(bb[k]))
        out[k] = ll[k];
    for (const k of Object.keys(bb)) if (!(k in ll)) delete out[k];
    return out;
  };
  const scalar = <T>(b: T, l: T, r: T): T => (l !== b ? l : r);
  return {
    ...remote,
    name: scalar(base.name, local.name, remote.name),
    year: scalar(base.year, local.year, remote.year),
    dept: scalar(base.dept, local.dept, remote.dept),
    credits: scalar(base.credits, local.credits, remote.credits),
    points: scalar(base.points, local.points, remote.points),
    saved: setMerge(base.saved, local.saved, remote.saved, (x) => x),
    planned: setMerge(base.planned, local.planned, remote.planned, (x) => x),
    plans: recMerge(base.plans, local.plans, remote.plans),
    completed: setMerge(
      base.completed,
      local.completed,
      remote.completed,
      (x) => `${x.code}|${x.name}`,
    ),
    ruleOverrides: recMerge(
      base.ruleOverrides,
      local.ruleOverrides,
      remote.ruleOverrides,
    ),
    events: setMerge(
      base.events,
      local.events,
      remote.events,
      (x) => `${x.title}|${x.date}`,
    ),
    prefs: setMerge(base.prefs, local.prefs, remote.prefs, (x) => x),
    actPrefs: setMerge(
      base.actPrefs ?? [],
      local.actPrefs ?? [],
      remote.actPrefs ?? [],
      (x) => x,
    ),
    actStatus: recMerge(base.actStatus, local.actStatus, remote.actStatus),
    extActivities: setMerge(
      base.extActivities ?? [],
      local.extActivities ?? [],
      remote.extActivities ?? [],
      (x) => x.id,
    ),
    readIds: setMerge(base.readIds, local.readIds, remote.readIds, (x) => x),
    reqChecks: setMerge(
      base.reqChecks ?? [],
      local.reqChecks ?? [],
      remote.reqChecks ?? [],
      (x) => x,
    ),
    notifiedIds: setMerge(
      base.notifiedIds ?? [],
      local.notifiedIds ?? [],
      remote.notifiedIds ?? [],
      (x) => x,
    ),
    notifEnabled: scalar(
      base.notifEnabled,
      local.notifEnabled,
      remote.notifEnabled,
    ),
    lmsMatch: recMerge(base.lmsMatch, local.lmsMatch, remote.lmsMatch),
  };
}
