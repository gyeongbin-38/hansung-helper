import { apiFetch, apiData, ApiRequestError } from './data/api.ts';

/** 백그라운드 푸시 지원 여부 — 서비스워커·PushManager·알림 권한 흐름이 모두 있어야 한다. */
export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  );
}

export type PushStatus = 'unsupported' | 'off' | 'active' | 'no-server';

let swRegistration: ServiceWorkerRegistration | undefined;

/** 앱 시작 시 무조건 호출 — 푸시 구독과 무관하게 SW를 등록해
 *  오프라인 캐시(fetch 핸들러)를 모든 사용자에게 활성화한다. */
export function ensureSwRegistered() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void registration().catch(() => {});
}

async function registration() {
  if (!swRegistration) swRegistration = await navigator.serviceWorker.register('/sw.js');
  return swRegistration;
}

/** 서버가 발급하는 VAPID 공개키 — 푸시 미설정 환경에서는 null. */
async function vapidKey(): Promise<string | null> {
  try {
    const res = await apiFetch('/api/push/key');
    if (!res.ok) return null;
    const { key } = await apiData<{ key: string }>(res);
    return typeof key === 'string' && key ? key : null;
  } catch {
    return null;
  }
}

function b64ToU8(value: string): Uint8Array {
  const s = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 이 기기의 구독 상태 — 브라우저에 유효한 구독이 있으면 endpoint를 돌려준다. */
export async function currentPushEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

/** 구독 생성 + 서버 등록. 알림 권한이 없으면 null — 호출 전에
 *  Notification.requestPermission()으로 권한을 얻어 둘 것. */
export async function ensurePushSubscription(): Promise<string | null> {
  if (!pushSupported()) return null;
  const key = await vapidKey();
  if (!key) return null;
  try {
    const reg = await registration();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToU8(key) as BufferSource,
      }));
    await apiFetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    }).then((res) => apiData(res));
    return sub.endpoint;
  } catch (error) {
    // 서버 등록 실패 시 로컬 구독은 놔둔다 — 다음 로그인 때 재시도된다.
    if (error instanceof ApiRequestError && error.status === 401) return null;
    return null;
  }
}

/** 이 기기의 구독을 브라우저와 서버 양쪽에서 해제한다. */
export async function dropPushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await apiFetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
  } catch {
    /* 해제 실패는 치명적이지 않다 — 서버 쪽 dead-endpoint 정리가 뒷받침한다 */
  }
}
