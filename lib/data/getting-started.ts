/** 정보가 비어 있는 것과 사용자가 이수 내역이 없다고 확인한 것을 구분한다. */
export function gettingStarted(data: {
  dept: string; year: string; completed: unknown[];
  info?: { completed: unknown[] }; setupHistory?: 'none' | 'later'; recommendationsSeen?: boolean;
}) {
  const missing = [
    !data.dept?.trim() || data.dept.trim() === '소속 미입력' ? 'dept' : '',
    !data.year?.trim() ? 'year' : '',
  ].filter(Boolean);
  const hasHistory = data.completed.length > 0 || (data.info?.completed.length ?? 0) > 0;
  const historyDone = hasHistory || data.setupHistory === 'none' || data.setupHistory === 'later';
  const current = missing.length ? 0 : !historyDone ? 1 : !data.recommendationsSeen ? 2 : 3;
  return { missing, hasHistory, historyDone, current };
}
