import { useEffect, useState } from 'react';

/** 정상 응답은 방해하지 않고 오래 걸리는 요청에만 안내를 표시한다. */
export function useSlowLoading(active: boolean, delayMs = 8000): boolean {
  const [state, setState] = useState({ active, generation: 0, slow: false });
  if (state.active !== active)
    setState({ active, generation: state.generation + 1, slow: false });
  useEffect(() => {
    if (!active) return;
    const generation = state.generation;
    const timer = setTimeout(() => setState((current) =>
      current.active && current.generation === generation
        ? { ...current, slow: true }
        : current), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs, state.generation]);
  return active && state.active === active && state.slow;
}
