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
