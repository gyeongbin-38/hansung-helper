/** Web Push 프로토콜 — RFC 8291(aes128gcm 콘텐츠 암호화) + RFC 8292(VAPID).
 *  외부 라이브러리 없이 WebCrypto만 사용한다 (Workers/Node 20+ 공용). */

export type PushKeys = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
};

function b64u8(value: string): Uint8Array {
  const s = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function u8b64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const te = new TextEncoder();
function concat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as BufferSource));
}

/** RFC 8291 — aes128gcm 콘텐츠 암호화. 단일 레코드 본문을 만든다. */
export async function encryptPushPayload(
  payload: Uint8Array,
  p256dhB64: string,
  authB64: string,
): Promise<Uint8Array> {
  const uaPub = b64u8(p256dhB64); // 구독 공개키 — 비압축 P-256 점(65B)
  const auth = b64u8(authB64); // 구독 auth 비밀(16B)
  if (uaPub.length !== 65 || uaPub[0] !== 4) throw new Error('bad p256dh');
  // 1. 임시 ECDH 키 쌍 → 공유 비밀
  const as = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: u8b64(uaPub.slice(1, 33)),
      y: u8b64(uaPub.slice(33, 65)),
    },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaKey },
      as.privateKey,
      256,
    ),
  );
  // 2. IKM = HKDF(auth, shared, "WebPush: info" || 0x00 || uaPub || asPub)
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(
    prkKey,
    concat(te.encode('WebPush: info'), [0], uaPub, asPub, [1]),
  );
  // 3. salt 기반 PRK → CEK(16B)와 NONCE(12B)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (
    await hmac(prk, concat(te.encode('Content-Encoding: aes128gcm'), [0, 1]))
  ).slice(0, 16);
  const nonce = (
    await hmac(prk, concat(te.encode('Content-Encoding: nonce'), [0, 1]))
  ).slice(0, 12);
  // 4. 평문 = payload || 0x02(마지막 레코드 구분자)
  const aes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
    'encrypt',
  ]);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      aes,
      concat(payload, [2]) as BufferSource,
    ),
  );
  // 5. 본문 = salt(16) || rs(4) || idlen(1) || asPub || ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, [asPub.length], asPub, ct);
}

/** VAPID 공개키 — JWK의 x,y를 비압축 점으로 조립해 base64url로 돌려준다. */
export function vapidPublicKey(jwk: JsonWebKey): string {
  const x = b64u8(String(jwk.x)), y = b64u8(String(jwk.y));
  const pad = (v: Uint8Array) =>
    v.length >= 32 ? v : concat(new Uint8Array(32 - v.length), v);
  return u8b64(concat([4], pad(x), pad(y)));
}

/** RFC 8292 — ES256 JWT (aud=push 서비스 origin, 12시간 만료). */
async function vapidJwt(
  audience: string,
  jwk: JsonWebKey,
  subject: string,
): Promise<string> {
  const header = u8b64(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = u8b64(
    te.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'jwk',
    { ...jwk, key_ops: ['sign'], ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      te.encode(`${header}.${body}`) as BufferSource,
    ),
  );
  return `${header}.${body}.${u8b64(sig)}`;
}

/** 구독 하나에 알림 한 건을 발송한다. 응답은 호출자가 판독한다. */
export async function sendPush(
  sub: PushKeys,
  payload: PushPayload,
  jwk: JsonWebKey,
  subject: string,
  ttl = 43200,
): Promise<Response> {
  const body = await encryptPushPayload(
    te.encode(JSON.stringify(payload)),
    sub.p256dh,
    sub.auth,
  );
  const jwt = await vapidJwt(new URL(sub.endpoint).origin, jwk, subject);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt},k=${vapidPublicKey(jwk)}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
    },
    body: body as BodyInit,
  });
}
