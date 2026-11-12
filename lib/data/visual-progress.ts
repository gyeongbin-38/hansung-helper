export function targetProgress(value: number | null | undefined, target: number | null | undefined) {
  if (value == null || target == null || !Number.isFinite(value) || value < 0 || !Number.isFinite(target) || target <= 0) return null;
  return { percent: Math.min(value >= target ? 100 : 99, Math.round(value / target * 100)), remaining: Math.max(0, target - value) };
}

/** Missing course detail stays unclassified; do not invent a category to fill the school total. */
export function creditDistribution(total: number | null, major: number, general: number, other: number) {
  const clean = (n: number) => Number.isFinite(n) && n >= 0 ? n : 0;
  const values = [clean(major), clean(general), clean(other)];
  const classified = values.reduce((sum, n) => sum + n, 0);
  const knownTotal = total !== null && Number.isFinite(total) && total >= 0 ? total : null;
  const unclassified = knownTotal === null ? 0 : Math.max(0, knownTotal - classified);
  return { values: [...values, unclassified], size: classified + unclassified,
    inconsistent: knownTotal !== null && classified > knownTotal };
}

export function activityStageCounts(saved: string[], external: { id: string }[], stages: Record<string, string>) {
  const ids = new Set([...saved, ...external.map(a => a.id), ...Object.keys(stages)]);
  const counts = ['applied', 'joined', 'done', 'credited'].map(stage => [...ids].filter(id => stages[id] === stage).length);
  return { total: ids.size, counts, pending: ids.size - counts.reduce((sum, n) => sum + n, 0) };
}
