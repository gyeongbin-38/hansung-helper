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
export class PayloadTooLargeError extends Error { status = 413; }
export class PayloadReadError extends PayloadTooLargeError {
  constructor(status: 408 | 429) { super('request body unavailable'); this.status = status; }
}
let bodyReads = 0;
const MAX_BODY_READS = 32;

export async function readTextLimited(request: Request, maxBytes: number, timeoutMs = 15000) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
    throw new PayloadTooLargeError();

  if (!request.body) return '';
  if (bodyReads >= MAX_BODY_READS) throw new PayloadReadError(429);
  const reader = request.body.getReader();
  bodyReads++;
  // One bounded buffer avoids retaining thousands of tiny/empty chunk objects.
  const bytes = new Uint8Array(maxBytes);
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    const stopped = new Promise<never>((_, reject) => {
      abort = () => {
        reject(new PayloadReadError(408));
        void reader.cancel().catch(() => {});
      };
      timer = setTimeout(abort, timeoutMs);
      request.signal.addEventListener('abort', abort, { once: true });
      if (request.signal.aborted) abort();
    });
    const consume = async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (total + value.byteLength > maxBytes) {
          void reader.cancel().catch(() => {});
          throw new PayloadTooLargeError();
        }
        bytes.set(value, total);
        total += value.byteLength;
      }
    };
    await Promise.race([consume(), stopped]);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    reader.releaseLock();
    bodyReads--;
  }
  return new TextDecoder().decode(bytes.subarray(0, total));
}

function accountIndexKeyBytes() {
  const secret = (env as unknown as { ACCOUNT_INDEX_HMAC_KEY?: string })
    .ACCOUNT_INDEX_HMAC_KEY;
  return typeof secret === 'string' ? new TextEncoder().encode(secret) : null;
}

export function accountAuthConfigured() {
  return (accountIndexKeyBytes()?.byteLength ?? 0) >= 32;
}

async function keyedDigest(scope: string, value: string) {
  const keyBytes = accountIndexKeyBytes();
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
  session?: { hash: string; accountId: string },
) {
  if (accountId === legacyId) return;
  const db = database();
  // 재수집 요청은 장시간 학교 서버를 기다리는 동안 세션이 종료될 수 있다.
  // 이전 배치의 모든 쓰기 시점에 동일 세션이 여전히 유효한지 확인한다.
  const guard = session
    ? " AND EXISTS (SELECT 1 FROM academic_sessions WHERE token_hash = ? AND account_id IN (?, ?) AND expires_at > CAST(unixepoch('subsec') * 1000 AS INTEGER))"
    : '';
  const guardArgs = session ? [session.hash, session.accountId, accountId] : [];
  // D1 batch is transactional, but the reads before it are not. Compare both
  // rows inside the batch so a concurrent profile or snapshot write cannot be
  // overwritten or discarded by the legacy deletion.
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
    const legacyValues = [legacy.student_mask, legacy.profile, legacy.snapshot, legacy.onboarded, legacy.created_at, legacy.consent_at];
    const legacyMatches = 'SELECT 1 FROM academic_accounts WHERE id = ? AND student_mask IS ? AND profile IS ? AND snapshot IS ? AND onboarded IS ? AND created_at IS ? AND consent_at IS ?';
    const merged = current ? [
      current.student_mask || legacy.student_mask,
      mergeJsonObjects(legacy.profile, current.profile),
      mergeJsonObjects(legacy.snapshot, current.snapshot),
      Math.max(current.onboarded, legacy.onboarded),
      Math.min(current.created_at, legacy.created_at),
      Math.max(current.consent_at, legacy.consent_at),
    ] : legacyValues;
    const accountWrite = current
      ? db
          .prepare(
            'UPDATE academic_accounts SET student_mask = ?, profile = ?, snapshot = ?, onboarded = ?, created_at = ?, consent_at = ? WHERE id = ? AND student_mask IS ? AND profile IS ? AND snapshot IS ? AND onboarded IS ? AND created_at IS ? AND consent_at IS ? AND EXISTS (' + legacyMatches + ')' + guard,
          )
          .bind(
            ...merged,
            accountId,
            current.student_mask, current.profile, current.snapshot, current.onboarded, current.created_at, current.consent_at,
            legacyId, ...legacyValues,
            ...guardArgs,
          )
      : db
          .prepare(
            'INSERT INTO academic_accounts (id, student_mask, profile, snapshot, onboarded, created_at, consent_at) SELECT ?, student_mask, profile, snapshot, onboarded, created_at, consent_at FROM academic_accounts WHERE id = ? AND student_mask IS ? AND profile IS ? AND snapshot IS ? AND onboarded IS ? AND created_at IS ? AND consent_at IS ?' + guard + ' ON CONFLICT(id) DO NOTHING',
          )
          .bind(accountId, legacyId, ...legacyValues, ...guardArgs);

    const targetMatches = 'SELECT 1 FROM academic_accounts WHERE id = ? AND student_mask IS ? AND profile IS ? AND snapshot IS ? AND onboarded IS ? AND created_at IS ? AND consent_at IS ?';
    const result = await db.batch([
      accountWrite,
      db
        .prepare(
          'UPDATE academic_sessions SET account_id = ? WHERE account_id = ? AND EXISTS (' + targetMatches + ') AND EXISTS (' + legacyMatches + ')' + guard,
        )
        .bind(accountId, legacyId, accountId, ...merged, legacyId, ...legacyValues, ...guardArgs),
      db
        .prepare(
          'DELETE FROM academic_accounts WHERE id = ? AND EXISTS (' + targetMatches + ') AND student_mask IS ? AND profile IS ? AND snapshot IS ? AND onboarded IS ? AND created_at IS ? AND consent_at IS ?' + guard,
        )
        .bind(legacyId, accountId, ...merged, ...legacyValues, ...guardArgs),
    ]);
    if (result[2].meta.changes) return;
    if (session) {
      const active = await db.prepare("SELECT 1 AS active FROM academic_sessions WHERE token_hash = ? AND account_id IN (?, ?) AND expires_at > CAST(unixepoch('subsec') * 1000 AS INTEGER)")
        .bind(...guardArgs).first();
      if (!active) return;
    }
  }
  throw new Error('Concurrent account migration could not be completed');
}

export function json(
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
  code?: string,
) {
  const isError = status >= 400;
  const errorMessage =
    isError && body && typeof body === 'object' &&
    typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : '요청을 처리하지 못했습니다.';
  const errorCode: Record<number, string> = {
    400: 'INVALID_REQUEST',
    401: 'AUTH_REQUIRED',
    403: 'FORBIDDEN',
    408: 'REQUEST_TIMEOUT',
    413: 'PAYLOAD_TOO_LARGE',
    429: 'RATE_LIMITED',
    503: 'SERVICE_UNAVAILABLE',
  };
  const payload = isError
    ? {
        ok: false,
        error: {
          code: code ?? errorCode[status] ?? 'REQUEST_FAILED',
          message: errorMessage,
        },
      }
    : { ok: true, data: body };
  return Response.json(payload, {
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
): Promise<(AccountRow & { session_hash: string }) | null> {
  const token = request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)__Host-hansung_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  const sessionHash = await hash(token);
  const context = request.headers.get('x-hansung-session-context');
  const initialAccountRead = request.method === 'GET' && new URL(request.url).pathname === '/api/account';
  if ((!context && !initialAccountRead) || (context && context !== sessionHash)) return null;
  return database()
    .prepare(
      'SELECT a.id, a.profile, a.snapshot, a.onboarded, a.student_mask, s.token_hash AS session_hash FROM academic_accounts a JOIN academic_sessions s ON s.account_id = a.id WHERE s.token_hash = ? AND s.expires_at > ?',
    )
    .bind(sessionHash, Date.now())
    .first<AccountRow & { session_hash: string }>();
}
export function accountView(row: AccountRow, sessionContext?: string) {
  return {
    profile: JSON.parse(row.profile),
    snapshot: JSON.parse(row.snapshot),
    onboarded: !!row.onboarded,
    studentMask: row.student_mask,
    sessionContext: sessionContext ?? (row as AccountRow & { session_hash?: string }).session_hash,
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
