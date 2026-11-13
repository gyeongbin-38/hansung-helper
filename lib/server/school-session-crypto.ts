/**
 * 학교 세션 쿠키 암호화 — 비밀번호가 아닌 학교 세션 쿠키만 AES-GCM으로
 * 암호화해 짧게 보관한다. 자격 증명은 저장하지 않는다.
 *
 * 이 모듈은 Node 테스트에서도 쓰일 수 있도록 Workers 바인딩(env/DB)에
 * 의존하지 않는다. 키·계정·쿠키는 함수 인자로 받는다.
 */

export type SchoolCookieJar = Record<string, Record<string, string>>;

/** 세션 볼트에 허용하는 학교 호스트 — 그 외 호스트의 쿠키는 저장하지 않는다. */
export const SCHOOL_SESSION_ALLOWED_HOSTS = [
  'info.hansung.ac.kr',
  'learn.hansung.ac.kr',
] as const;

export const SCHOOL_SESSION_VERSION = 1;
const MAX_BYTES = 8 * 1024;
const MIN_SECRET_BYTES = 32;

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function aadFor(accountId: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    enc.encode(`hansung-school-session:v${SCHOOL_SESSION_VERSION}:${accountId}`),
  );
}

/** 비밀값 → AES-256 키. 32바이트 이상의 무작위 비밀값을 SHA-256으로 유도한다. */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(enc.encode(secret));
  if (bytes.byteLength < MIN_SECRET_BYTES)
    throw new Error('school session secret must contain at least 32 bytes');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** 쿠키 명세를 정리·검증한다. 호스트·이름·값 크기를 제한하고, 허용 호스트만 남긴다. */
export function sanitizeSchoolCookies(cookies: unknown): SchoolCookieJar | null {
  if (!cookies || typeof cookies !== 'object' || Array.isArray(cookies)) return null;
  const allowed = new Set<string>(SCHOOL_SESSION_ALLOWED_HOSTS);
  const out: SchoolCookieJar = {};
  let bytes = 0;
  for (const host of Object.keys(cookies as Record<string, unknown>)) {
    if (!allowed.has(host)) continue;
    const jar = (cookies as Record<string, unknown>)[host];
    if (!jar || typeof jar !== 'object' || Array.isArray(jar)) continue;
    const map: Record<string, string> = {};
    for (const [name, value] of Object.entries(jar as Record<string, unknown>)) {
      if (typeof value !== 'string') continue;
      const n = name.slice(0, 64);
      const v = value.slice(0, 512);
      if (!n || /[;=\s]/.test(n) || !v) continue;
      map[n] = v;
      bytes += n.length + v.length + 2;
      if (bytes > MAX_BYTES) return null;
    }
    if (Object.keys(map).length) out[host] = map;
  }
  return Object.keys(out).length ? out : null;
}

/** 쿠키를 암호화해 "iv.ciphertext" base64 문자열로 돌려준다. */
export async function encryptSchoolCookies(
  secret: string,
  accountId: string,
  cookies: SchoolCookieJar,
): Promise<string> {
  const clean = sanitizeSchoolCookies(cookies);
  if (!clean) throw new Error('school session cookie jar is empty or invalid');
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadFor(accountId) },
    key,
    new Uint8Array(enc.encode(JSON.stringify(clean))),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

/** 암호문을 복호화해 쿠키 명세를 돌려준다. 실패·변조·계정 불일치면 null. */
export async function decryptSchoolCookies(
  secret: string,
  accountId: string,
  payload: string,
): Promise<SchoolCookieJar | null> {
  const [ivB64, ctB64] = payload.split('.');
  if (!ivB64 || !ctB64) return null;
  try {
    const key = await deriveKey(secret);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivB64), additionalData: aadFor(accountId) },
      key,
      fromBase64(ctB64),
    );
    const parsed: unknown = JSON.parse(dec.decode(plain));
    return sanitizeSchoolCookies(parsed);
  } catch {
    return null;
  }
}
