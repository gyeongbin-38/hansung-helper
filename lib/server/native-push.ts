/** 네이티브 푸시 발송 — Capacitor 래퍼 앱의 APNs(iOS)·FCM(Android) 채널.
 *  웹 푸시(lib/server/webpush.ts)와 같은 역할을 네이티브 토큰에 대해 수행한다.
 *  자격은 Worker 비밀값으로 주입되며 미설정 시 해당 채널만 꺼진다
 *  (MODERATION_KEY와 같은 부분 활성 패턴). 외부 라이브러리 없이 WebCrypto만 사용.
 *
 *  필수 비밀값:
 *  - iOS: APNS_KEY_ID·APNS_TEAM_ID·APNS_KEY(.p8 PEM) — 선택 APNS_TOPIC(앱 번들 ID),
 *    APNS_SANDBOX=1이면 샌드박스 게이트웨이 사용
 *  - Android: FCM_SERVICE_ACCOUNT — 서비스 계정 JSON
 *    (client_email·private_key·project_id·token_uri) */
import { env } from 'cloudflare:workers';
import type { PushPayload } from './webpush.ts';

export type ApnsCreds = {
  keyId: string;
  teamId: string;
  /** .p8 PEM 또는 base64 PKCS8 */
  key: string;
  topic: string;
  sandbox: boolean;
};
export type FcmCreds = {
  clientEmail: string;
  privateKey: string;
  projectId: string;
  tokenUri: string;
};
export type NativePushCreds = { apns: ApnsCreds | null; fcm: FcmCreds | null };

type EnvLike = Record<string, string | undefined>;

/** 네이티브 발송 자격 — 설정된 채널만 채운다. 둘 다 없으면 null. */
export function nativePushCredentials(source?: EnvLike): NativePushCreds | null {
  const e: EnvLike = source ?? (env as unknown as EnvLike);
  let apns: ApnsCreds | null = null;
  if (e.APNS_KEY_ID && e.APNS_TEAM_ID && e.APNS_KEY) {
    apns = {
      keyId: e.APNS_KEY_ID,
      teamId: e.APNS_TEAM_ID,
      key: e.APNS_KEY,
      topic: e.APNS_TOPIC ?? 'dev.gyeongbin38.hansunghelper',
      sandbox: e.APNS_SANDBOX === '1' || e.APNS_SANDBOX === 'true',
    };
  }
  let fcm: FcmCreds | null = null;
  if (e.FCM_SERVICE_ACCOUNT) {
    try {
      const sa = JSON.parse(e.FCM_SERVICE_ACCOUNT) as Record<string, string>;
      if (sa.client_email && sa.private_key && sa.project_id) {
        fcm = {
          clientEmail: sa.client_email,
          privateKey: sa.private_key,
          projectId: sa.project_id,
          tokenUri: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
        };
      }
    } catch {
      /* 손상된 JSON은 자격 미설정과 같게 취급 */
    }
  }
  return apns || fcm ? { apns, fcm } : null;
}

const te = new TextEncoder();
function u8b64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PEM(또는 순수 base64) PKCS8을 디코딩한다 — 비밀값에 \n 이스케이프로 넣어도 동작. */
function pkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----[^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function jwtEs256(
  header: Record<string, string>,
  claims: Record<string, unknown>,
  keyPem: string,
): Promise<string> {
  const h = u8b64(te.encode(JSON.stringify(header)));
  const p = u8b64(te.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8(keyPem) as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      te.encode(`${h}.${p}`) as BufferSource,
    ),
  );
  return `${h}.${p}.${u8b64(sig)}`;
}

async function jwtRs256(
  claims: Record<string, unknown>,
  keyPem: string,
): Promise<string> {
  const h = u8b64(te.encode(JSON.stringify({ typ: 'JWT', alg: 'RS256' })));
  const p = u8b64(te.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8(keyPem) as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      te.encode(`${h}.${p}`) as BufferSource,
    ),
  );
  return `${h}.${p}.${u8b64(sig)}`;
}

/** APNs provider JWT — 1시간 이상 된 토큰은 거부되므로 발송마다 새로 서명한다. */
export async function sendApns(
  creds: ApnsCreds,
  token: string,
  payload: PushPayload,
): Promise<Response> {
  const jwt = await jwtEs256(
    { alg: 'ES256', kid: creds.keyId },
    { iss: creds.teamId, iat: Math.floor(Date.now() / 1000) },
    creds.key,
  );
  const host = creds.sandbox
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com';
  return fetch(`${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': creds.topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
      link: payload.url ?? '',
    }),
  });
}

let fcmToken: { token: string; exp: number } | null = null;

/** 서비스 계정 JWT → OAuth 액세스 토큰. 아이솔레이트 수명 안에서 만료 5분 전까지 캐시. */
async function fcmAccessToken(creds: FcmCreds): Promise<string | null> {
  if (fcmToken && fcmToken.exp > Date.now() + 300000) return fcmToken.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = await jwtRs256(
    {
      iss: creds.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: creds.tokenUri,
      iat: now,
      exp: now + 3600,
    },
    creds.privateKey,
  );
  const res = await fetch(creds.tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(assertion)}`,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  fcmToken = {
    token: data.access_token,
    exp: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return fcmToken.token;
}

export async function sendFcm(
  creds: FcmCreds,
  token: string,
  payload: PushPayload,
): Promise<Response | null> {
  const access = await fcmAccessToken(creds);
  if (!access) return null;
  return fetch(
    `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: { link: payload.url ?? '' },
          android: { priority: 'HIGH' },
        },
      }),
    },
  );
}

export type NativeSendResult = 'ok' | 'dead' | 'fail';

/** 플랫폼별 발송 — 'dead'는 토큰 폐기(삭제 대상), 'fail'은 재시도 대상. */
export async function sendNativePush(
  creds: NativePushCreds,
  platform: string,
  token: string,
  payload: PushPayload,
): Promise<NativeSendResult> {
  try {
    if (platform === 'ios' && creds.apns) {
      const res = await sendApns(creds.apns, token, payload);
      if (res.ok) return 'ok';
      const reason = await res
        .json()
        .then((d) => String((d as { reason?: string }).reason ?? ''))
        .catch(() => '');
      // Unregistered/BadDeviceToken은 재발송해도 살아나지 않는다
      if (res.status === 410 || /^(Unregistered|BadDeviceToken)$/.test(reason))
        return 'dead';
      return 'fail';
    }
    if (platform === 'android' && creds.fcm) {
      const res = await sendFcm(creds.fcm, token, payload);
      if (!res) return 'fail';
      if (res.ok) return 'ok';
      const code = await res
        .json()
        .then((d) =>
          String(
            (d as { error?: { status?: string; details?: { errorCode?: string }[] } })
              .error?.details?.[0]?.errorCode ??
              (d as { error?: { status?: string } }).error?.status ??
              '',
          ),
        )
        .catch(() => '');
      if (res.status === 404 || code === 'UNREGISTERED') return 'dead';
      return 'fail';
    }
    return 'fail';
  } catch {
    return 'fail';
  }
}
