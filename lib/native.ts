/** 네이티브(Capacitor) 앱 감지 + 네이티브 푸시 등록.
 *  웹에서는 isNativeApp()이 false라 플러그인 코드가 실행되지 않는다 —
 *  @capacitor/push-notifications의 웹 구현은 no-op이므로 정적 임포트해도 안전하다. */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { apiFetch, apiData } from './data/api.ts';

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

const TOKEN_KEY = 'hs-native-push-token';
let listenersInstalled = false;

/** 알림 탭 시 payload.data.link로 해시 라우트 이동 — 앱 시작 시 1회 설치. */
export function initNativePush(): void {
  if (!isNativeApp() || listenersInstalled) return;
  listenersInstalled = true;
  void PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action) => {
      const link = action.notification.data?.link;
      if (typeof link === 'string' && link.startsWith('/#'))
        window.location.hash = link.slice(1);
    },
  );
}

/** 이 기기의 네이티브 토큰이 서버에 등록돼 있으면 그 값을 돌려준다. */
export function currentNativeToken(): string | null {
  if (!isNativeApp()) return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** 네이티브 알림 권한 요청 — 토글 ON 시점에만 호출한다. */
export async function requestNativePermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const current = await PushNotifications.checkPermissions();
    if (current.receive === 'granted') return true;
    return (await PushNotifications.requestPermissions()).receive === 'granted';
  } catch {
    return false;
  }
}

/** APNs/FCM 등록 → 토큰 수신 → 서버 upsert. 권한은 이미 얻어 둘 것. */
export async function ensureNativePush(): Promise<string | null> {
  if (!isNativeApp()) return null;
  initNativePush();
  const token = await new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    void PushNotifications.addListener('registration', (t) =>
      finish(t.value),
    );
    void PushNotifications.addListener('registrationError', () =>
      finish(null),
    );
    void PushNotifications.register();
    // FCM/APNs가 토큰을 돌려주지 않는 환경(시뮬레이터·구성 누락)의 안전장치
    setTimeout(() => finish(null), 15000);
  });
  if (!token) return null;
  try {
    await apiFetch('/api/push/native', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        platform: Capacitor.getPlatform(),
      }),
    }).then((res) => apiData(res));
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    // 서버 등록 실패 시 토큰은 로컬에 두지 않는다 — 다음 로그인 때 재시도
    return null;
  }
}

/** 서버에서 이 기기의 토큰을 해제한다. OS 토큰 자체는 남아도 서버가 보내지 않는다. */
export async function dropNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  const token = currentNativeToken();
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
  if (!token) return;
  await apiFetch('/api/push/native', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => {});
}
