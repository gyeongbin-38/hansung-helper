import { env } from 'cloudflare:workers';

export function database() {
  return (env as unknown as { DB: D1Database }).DB;
}
export async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export class PayloadTooLargeError extends Error {}

export async function readTextLimited(request: Request, maxBytes: number) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
    throw new PayloadTooLargeError();

  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function keyedDigest(scope: string, value: string) {
  const secret = (env as unknown as { ACCOUNT_INDEX_HMAC_KEY?: string })
    .ACCOUNT_INDEX_HMAC_KEY;
  const keyBytes = secret ? new TextEncoder().encode(secret) : null;
  if (!keyBytes || keyBytes.byteLength < 32)
    throw new Error('ACCOUNT_INDEX_HMAC_KEY must contain at least 32 bytes');

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`hansung:${scope}:${value}`),
  );
  return [...new Uint8Array(digest)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

export async function studentAccountId(studentId: string) {
  return keyedDigest('student-id', studentId);
}

export async function ipRateLimitKey(ip: string) {
  return keyedDigest('login-ip', ip);
}

type StudentAccountRow = {
  id: string;
  student_mask: string;
  profile: string;
  snapshot: string;
  onboarded: number;
  created_at: number;
  consent_at: number;
};

function parseJsonObject(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isEmpty(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0)
  );
}

function mergeJsonObjects(older: string, newer: string) {
  const oldObject = parseJsonObject(older);
  const newObject = parseJsonObject(newer);
  const merged = { ...oldObject };
  for (const [key, value] of Object.entries(newObject)) {
    if (!isEmpty(value) || isEmpty(oldObject[key])) merged[key] = value;
  }
  return JSON.stringify(merged);
}

export async function migrateLegacyStudentAccount(
  accountId: string,
  legacyId: string,
) {
  if (accountId === legacyId) return;
  const db = database();
  const legacy = await db
    .prepare(
      'SELECT id, student_mask, profile, snapshot, onboarded, created_at, consent_at FROM academic_accounts WHERE id = ?',
    )
    .bind(legacyId)
    .first<StudentAccountRow>();
  if (!legacy) return;

  const current = await db
    .prepare(
      'SELECT id, student_mask, profile, snapshot, onboarded, created_at, consent_at FROM academic_accounts WHERE id = ?',
    )
    .bind(accountId)
    .first<StudentAccountRow>();
  const accountWrite = current
    ? db
        .prepare(
          'UPDATE academic_accounts SET student_mask = ?, profile = ?, snapshot = ?, onboarded = ?, created_at = ?, consent_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM academic_accounts WHERE id = ?)',
        )
        .bind(
          current.student_mask || legacy.student_mask,
          mergeJsonObjects(legacy.profile, current.profile),
          mergeJsonObjects(legacy.snapshot, current.snapshot),
          Math.max(current.onboarded, legacy.onboarded),
          Math.min(current.created_at, legacy.created_at),
          Math.max(current.consent_at, legacy.consent_at),
          accountId,
          legacyId,
        )
    : db
        .prepare(
          'INSERT INTO academic_accounts (id, student_mask, profile, snapshot, onboarded, created_at, consent_at) SELECT ?, student_mask, profile, snapshot, onboarded, created_at, consent_at FROM academic_accounts WHERE id = ? ON CONFLICT(id) DO NOTHING',
        )
        .bind(accountId, legacyId);

  await db.batch([
    accountWrite,
    db
      .prepare(
        'UPDATE academic_sessions SET account_id = ? WHERE account_id = ? AND EXISTS (SELECT 1 FROM academic_accounts WHERE id = ?)',
      )
      .bind(accountId, legacyId, accountId),
    db
      .prepare(
        'DELETE FROM academic_accounts WHERE id = ? AND EXISTS (SELECT 1 FROM academic_accounts WHERE id = ?)',
      )
      .bind(legacyId, accountId),
  ]);
}

export function json(
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}
export function validOrigin(request: Request) {
  return (
    request.headers.get('origin') === new URL(request.url).origin &&
    request.headers.get('content-type')?.startsWith('application/json')
  );
}
export type AccountRow = {
  id: string;
  profile: string;
  snapshot: string;
  onboarded: number;
  student_mask: string;
};
export async function authenticated(
  request: Request,
): Promise<AccountRow | null> {
  const token = request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)__Host-hansung_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  return database()
    .prepare(
      'SELECT a.id, a.profile, a.snapshot, a.onboarded, a.student_mask FROM academic_accounts a JOIN academic_sessions s ON s.account_id = a.id WHERE s.token_hash = ? AND s.expires_at > ?',
    )
    .bind(await hash(token), Date.now())
    .first<AccountRow>();
}
export function accountView(row: AccountRow) {
  return {
    profile: JSON.parse(row.profile),
    snapshot: JSON.parse(row.snapshot),
    onboarded: !!row.onboarded,
    studentMask: row.student_mask,
  };
}
export function sessionCookie(token: string, age = 86400) {
  return `__Host-hansung_session=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
}
export async function limited(key: string, max: number) {
  const now = Date.now();
  const row = await database()
    .prepare(
      'INSERT INTO academic_login_limits (key, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires_at < ? THEN 1 ELSE attempts + 1 END, expires_at = CASE WHEN expires_at < ? THEN excluded.expires_at ELSE expires_at END RETURNING attempts',
    )
    .bind(key, now + 900000, now, now)
    .first<{ attempts: number }>();
  return !row || row.attempts > max;
}
