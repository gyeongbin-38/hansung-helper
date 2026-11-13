/** 학교 로그인 뒤 발급된 세션 쿠키만 짧게 암호화해 보관한다. */
import { env } from 'cloudflare:workers';
import { database } from './account.ts';
import {
  SCHOOL_SESSION_VERSION,
  decryptSchoolCookies,
  encryptSchoolCookies,
  sanitizeSchoolCookies,
  type SchoolCookieJar,
} from './school-session-crypto.ts';

const TTL_MS = 2 * 60 * 60 * 1000;
/** 사용자가 '자동 연결 유지'를 선택했을 때의 보관 상한 — 그 이상은 서버가 거부한다. */
const MAX_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const MIN_SECRET_BYTES = 32;

export const VAULT_TTL_MS = TTL_MS;
export const VAULT_MAX_TTL_MS = MAX_TTL_MS;

type VaultRow = {
  ciphertext: string;
  key_version: number;
  created_at: number;
  expires_at: number;
  app_session_hash: string | null;
};

export type SchoolSessionStatus = {
  configured: boolean;
  available: boolean;
  expiresAt: number | null;
};

export type LoadedSchoolSession = {
  cookies: SchoolCookieJar;
  revision: {
    appSessionHash: string;
    createdAt: number;
    expiresAt: number;
  };
};

function secret(): string | null {
  const value = (env as unknown as { SCHOOL_SESSION_KEY?: string })
    .SCHOOL_SESSION_KEY;
  if (typeof value !== 'string') return null;
  return new TextEncoder().encode(value).byteLength >= MIN_SECRET_BYTES
    ? value
    : null;
}

export function sessionVaultConfigured(): boolean {
  return secret() !== null;
}

/**
 * 새 비밀번호 인증으로 얻은 쿠키를 저장한다. issuedAt은 요청 시작 시각이라
 * 늦게 끝난 이전 요청이 더 최근 로그인/재인증의 쿠키를 덮지 못한다.
 * 앱 세션이 이미 취소됐다면 INSERT/UPDATE 모두 수행되지 않는다.
 */
export async function saveSchoolSession(
  accountId: string,
  cookies: SchoolCookieJar,
  options: { sessionHash: string; issuedAt?: number; ttlMs?: number },
): Promise<boolean> {
  const key = secret();
  if (!key) return false;
  const clean = sanitizeSchoolCookies(cookies);
  if (!clean) return false;
  const issuedAt = options.issuedAt ?? Date.now();
  // 클라이언트가 긴 보관을 요청해도 상한 이상은 허용하지 않는다.
  const ttlMs = Math.min(Math.max(options.ttlMs ?? TTL_MS, 0), MAX_TTL_MS);
  const payload = await encryptSchoolCookies(key, accountId, clean);
  const result = await database()
    .prepare(
      `INSERT INTO school_session_vault
        (account_id, ciphertext, key_version, created_at, expires_at, last_used_at, app_session_hash)
       SELECT ?, ?, ?, ?, ?, NULL, ?
       WHERE EXISTS (
         SELECT 1 FROM academic_sessions
         WHERE token_hash = ? AND account_id = ? AND expires_at > ?
       )
       ON CONFLICT(account_id) DO UPDATE SET
         ciphertext = excluded.ciphertext,
         key_version = excluded.key_version,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at,
         last_used_at = NULL,
         app_session_hash = excluded.app_session_hash
       WHERE (
           school_session_vault.app_session_hash IS NULL
           OR excluded.created_at >= school_session_vault.created_at
         )
         AND EXISTS (
           SELECT 1 FROM academic_sessions
           WHERE token_hash = ? AND account_id = ? AND expires_at > ?
         )`,
    )
    .bind(
      accountId,
      payload,
      SCHOOL_SESSION_VERSION,
      issuedAt,
      issuedAt + ttlMs,
      options.sessionHash,
      options.sessionHash,
      accountId,
      Date.now(),
      options.sessionHash,
      accountId,
      Date.now(),
    )
    .run();
  return Boolean(result.meta.changes);
}

/** 저장된 쿠키를 복호화한다. 읽기와 last_used_at 갱신은 TTL을 연장하지 않는다. */
export async function loadSchoolSession(
  accountId: string,
  appSessionHash: string,
): Promise<LoadedSchoolSession | null> {
  const key = secret();
  if (!key) return null;
  const db = database();
  const row = await db
    .prepare(
      `SELECT ciphertext, key_version, created_at, expires_at, app_session_hash
       FROM school_session_vault
       WHERE account_id = ? AND app_session_hash IS NOT NULL AND EXISTS (
         SELECT 1 FROM academic_sessions
         WHERE token_hash = ? AND account_id = ? AND expires_at > ?
       )`,
    )
    .bind(accountId, appSessionHash, accountId, Date.now())
    .first<VaultRow>();
  // 0003 이전 행은 어떤 앱 세션이 만들었는지 증명할 수 없다. 쿠키를
  // 재사용하지 않고 다음 비밀번호 인증이 안전하게 교체하도록 둔다.
  if (!row?.app_session_hash) return null;
  if (row.expires_at <= Date.now()) {
    await db
      .prepare(
        `DELETE FROM school_session_vault
         WHERE account_id = ? AND app_session_hash = ? AND expires_at = ?
           AND EXISTS (
             SELECT 1 FROM academic_sessions
             WHERE token_hash = ? AND account_id = ? AND expires_at > ?
           )`,
      )
      .bind(
        accountId, row.app_session_hash, row.expires_at,
        appSessionHash, accountId, Date.now(),
      )
      .run();
    return null;
  }
  if (row.key_version !== SCHOOL_SESSION_VERSION) return null;
  const cookies = await decryptSchoolCookies(key, accountId, row.ciphertext);
  if (!cookies) {
    await db
      .prepare(
        `DELETE FROM school_session_vault
         WHERE account_id = ? AND app_session_hash = ? AND expires_at = ?
           AND EXISTS (
             SELECT 1 FROM academic_sessions
             WHERE token_hash = ? AND account_id = ? AND expires_at > ?
           )`,
      )
      .bind(
        accountId, row.app_session_hash, row.expires_at,
        appSessionHash, accountId, Date.now(),
      )
      .run();
    return null;
  }
  await db
    .prepare(
      `UPDATE school_session_vault SET last_used_at = ?
       WHERE account_id = ? AND app_session_hash = ? AND expires_at = ?
         AND EXISTS (
           SELECT 1 FROM academic_sessions
           WHERE token_hash = ? AND account_id = ? AND expires_at > ?
         )`,
    )
    .bind(
      Date.now(), accountId, row.app_session_hash, row.expires_at,
      appSessionHash, accountId, Date.now(),
    )
    .run();
  return {
    cookies,
    revision: {
      appSessionHash: row.app_session_hash,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    },
  };
}

/** 쿠키를 읽거나 복호화하지 않는 UI용 연결 상태 조회. */
export async function schoolSessionStatus(
  accountId: string,
): Promise<SchoolSessionStatus> {
  if (!secret())
    return { configured: false, available: false, expiresAt: null };
  const row = await database()
    .prepare(
      `SELECT expires_at FROM school_session_vault
       WHERE account_id = ? AND app_session_hash IS NOT NULL`,
    )
    .bind(accountId)
    .first<{ expires_at: number }>();
  const expiresAt = row?.expires_at ?? null;
  return {
    configured: true,
    available: expiresAt !== null && expiresAt > Date.now(),
    expiresAt,
  };
}

/** 해당 앱 세션이 만든 볼트 행만 삭제해 지연 로그아웃 경쟁을 막는다. */
export async function deleteSchoolSession(
  accountId: string,
  appSessionHash: string,
): Promise<void> {
  if (!secret()) return;
  await database()
    .prepare(
      `DELETE FROM school_session_vault
       WHERE account_id = ?
         AND (app_session_hash = ? OR app_session_hash IS NULL)`,
    )
    .bind(accountId, appSessionHash)
    .run();
}

/** 읽어 둔 정확한 볼트 세대만 삭제한다. 사이에 저장된 새 쿠키는 보존된다. */
export async function deleteSchoolSessionRevision(
  accountId: string,
  revision: LoadedSchoolSession['revision'],
  authorizingSessionHash: string,
): Promise<void> {
  if (!secret()) return;
  await database()
    .prepare(
      `DELETE FROM school_session_vault
       WHERE account_id = ? AND app_session_hash = ?
         AND created_at = ? AND expires_at = ?
         AND EXISTS (
           SELECT 1 FROM academic_sessions
           WHERE token_hash = ? AND account_id = ? AND expires_at > ?
         )`,
    )
    .bind(
      accountId, revision.appSessionHash, revision.createdAt, revision.expiresAt,
      authorizingSessionHash, accountId, Date.now(),
    )
    .run();
}

export async function cleanupExpiredSchoolSessions(): Promise<void> {
  if (!secret()) return;
  await database()
    .prepare('DELETE FROM school_session_vault WHERE expires_at <= ?')
    .bind(Date.now())
    .run();
}
