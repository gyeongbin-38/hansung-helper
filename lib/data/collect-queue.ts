import { apiData, apiFetch } from './api';

/**
 * 학교 수집 대기열 클라이언트 — 서버 lms-refresh 계열 라우트의
 * { queued, position } 응답과 GET queue 필드에 대응한다.
 */
export type CollectQueueState = {
  status: 'waiting' | 'ready' | 'running';
  position: number;
} | null;

export type QueuedResponse = { queued: true; running: boolean; position: number };

export function isQueuedResponse(value: unknown): value is QueuedResponse {
  return !!value && typeof value === 'object' && (value as { queued?: unknown }).queued === true;
}

export async function fetchCollectQueue(signal?: AbortSignal): Promise<CollectQueueState> {
  const response = await apiFetch('/api/account/lms-refresh-session', {
    cache: 'no-store',
    signal,
  });
  const body = await apiData<{ queue?: CollectQueueState }>(response);
  return body.queue ?? null;
}

/**
 * 'ready'(슬롯이 비어 다시 POST 하면 되는 상태)가 될 때까지 폴링한다.
 * 'running'은 같은 계정의 수집이 다른 요청에서 진행 중이라는 뜻이므로
 * 끝날 때까지 기다린다 — 끝나면 티켓이 'done'으로 지워져 null이 돌아오고,
 * 다시 POST 하면 cooldown으로 직전 결과를 받는다. 타임아웃 시 마지막 상태 반환.
 */
export async function waitForCollectTurn(opts: {
  signal?: AbortSignal;
  onUpdate?: (state: CollectQueueState) => void;
  intervalMs?: number;
  timeoutMs?: number;
}): Promise<CollectQueueState> {
  const interval = opts.intervalMs ?? 4000;
  const deadline = Date.now() + (opts.timeoutMs ?? 300_000);
  let last: CollectQueueState = null;
  while (Date.now() < deadline) {
    const state = await fetchCollectQueue(opts.signal);
    last = state;
    opts.onUpdate?.(state);
    if (state === null || state.status === 'ready') return state;
    await new Promise((resolve) => setTimeout(resolve, interval));
    if (opts.signal?.aborted) throw new DOMException('대기가 중단되었습니다.', 'AbortError');
  }
  return last;
}
