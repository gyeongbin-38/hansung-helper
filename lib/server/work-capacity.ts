import { database } from './account';

type Scope = 'advisor' | 'school-login';
export type WorkLease = { key: string; fence: number };
const LIMITS = { advisor: { count: 3, ttl: 60000 }, 'school-login': { count: 3, ttl: 120000 } };
const BREAKER = 'work:breaker:advisor';
const COOLDOWN_MS = 30000;

/** One atomic write across Worker instances. Reuses the existing expiring
 * counter table, with a separate namespace; no new production schema required.
 * No waiting queue or unbounded in-memory fallback on DB failure. */
export async function acquireWork(scope: Scope, owner: string): Promise<WorkLease | null> {
  const now = Date.now();
  const prefix = `work:lease:${scope}:`;
  const key = prefix + owner;
  const fence = Number.parseInt(crypto.randomUUID().replaceAll('-', '').slice(0, 12), 16);
  const config = LIMITS[scope];
  const breaker = scope === 'advisor' ? BREAKER : 'work:breaker:unused';
  const row = await database().prepare(
    `INSERT INTO academic_login_limits (key, attempts, expires_at)
     SELECT ?, ?, ? WHERE
       NOT EXISTS (SELECT 1 FROM academic_login_limits WHERE key = ? AND attempts >= 3 AND expires_at > ?)
       AND (SELECT COUNT(*) FROM academic_login_limits WHERE key GLOB ? AND expires_at > ?) <
         CASE WHEN EXISTS (SELECT 1 FROM academic_login_limits WHERE key = ? AND attempts >= 3) THEN 1 ELSE ? END
     ON CONFLICT(key) DO UPDATE SET attempts = excluded.attempts, expires_at = excluded.expires_at
       WHERE academic_login_limits.expires_at <= ?
     RETURNING key`,
  ).bind(key, fence, now + config.ttl, breaker, now, prefix + '*', now, breaker, config.count, now).first<{ key: string }>();
  return row ? { key, fence } : null;
}

export async function releaseWork(lease: WorkLease) {
  // Fence protects a replacement lease from a late completion of the old one.
  await database().prepare('DELETE FROM academic_login_limits WHERE key = ? AND attempts = ?')
    .bind(lease.key, lease.fence).run();
}

/** Only transport errors/timeouts count. A malicious prompt or rejected model
 * output must not let one user deliberately open the shared circuit. */
export async function advisorTransportFailed() {
  const now = Date.now();
  await database().prepare(
    `INSERT INTO academic_login_limits (key, attempts, expires_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       attempts = CASE WHEN attempts >= 3 THEN 3 WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
       expires_at = excluded.expires_at`,
  ).bind(BREAKER, now + COOLDOWN_MS, now).run();
}

export async function advisorTransportRecovered() {
  // A successful half-open probe closes an expired circuit. An older success
  // cannot clear a circuit another in-flight failure has just opened.
  await database().prepare('DELETE FROM academic_login_limits WHERE key = ? AND (attempts < 3 OR expires_at <= ?)')
    .bind(BREAKER, Date.now()).run();
}
