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

/** 저장된 학교 세션으로 조용히 재수집할지 판단한다. 수집 중이거나, 마지막 학교 확인이
 *  minAgeMs 이내이거나, 같은 탭에서 cooldownMs 안에 이미 자동 시도했으면 건너뛴다.
 *  확인 시각을 읽을 수 없으면 오래된 것으로 보고 한 번 시도한다. */
export function shouldAutoRefreshSchool(
  input: { checkedAt?: string | null; pending: boolean; lastAttempt?: number | null; now: number },
  minAgeMs = 30 * 60e3,
  cooldownMs = 30 * 60e3,
): boolean {
  if (input.pending) return false;
  if (input.lastAttempt != null && Number.isFinite(input.lastAttempt) && input.now - input.lastAttempt < cooldownMs) return false;
  const checked = input.checkedAt ? Date.parse(input.checkedAt) : NaN;
  return Number.isNaN(checked) || input.now - checked >= minAgeMs;
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
