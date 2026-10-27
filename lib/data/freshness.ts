/** 스냅샷 수집 시각의 신선도 — 모든 공개 스냅샷 공용 */

const DAY_MS = 86400000;

/** ISO 시각 → 경과 일수. 파싱 불가·미래 시각은 null/0으로 정규화 */
export function ageDays(
  iso: string | null | undefined,
  now: number,
): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** 수집 후 warnAfter일 이상이면 '오래된 데이터'로 표시한다 */
export function isStale(
  iso: string | null | undefined,
  now: number,
  warnAfter = 14,
): boolean {
  const d = ageDays(iso, now);
  return d !== null && d >= warnAfter;
}

/** 배지 문구 — 'N일 전 수집' 또는 '오래된 데이터'. 신선하면 null */
export function staleLabel(
  iso: string | null | undefined,
  now: number,
  warnAfter = 14,
): string | null {
  const d = ageDays(iso, now);
  if (d === null || d < warnAfter) return null;
  return `${d}일 전 수집`;
}
