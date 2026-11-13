/**
 * 학교 세션 볼트 — 로그인 성공 시 학교 세션 쿠키를 암호화해 D1에 짧게
 * 보관하고, 비밀번호 없이 재수집할 때 재사용한다.
 *
 * 저장하는 것은 비밀번호가 아니라 학교 세션 쿠키뿐이다. 볼트는 다음을
 * 보장한다: AES-GCM 암호화, 계정 id를 추가 인증 데이터(AAD)로 묶어 타
 * 계정 복호화 불가, 고정 TTL, 로그아웃·계정 삭제 시 삭제.
 */
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
const MIN_SECRET_BYTES = 32;

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

/** 로그인/재인증 성공 시 호출 — 실패해도 로그인 자체에는 영향이 없어야 한다. */
export async function saveSchoolSession(
  accountId: string,
  cookies: SchoolCookieJar,
): Promise<boolean> {
  const key = secret();
  if (!key) return false;
  const clean = sanitizeSchoolCookies(cookies);
  if (!clean) return false;
  const payload = await encryptSchoolCookies(key, accountId, clean);
  const now = Date.now();
  await database()
    .prepare(
      'INSERT INTO school_session_vault (account_id, ciphertext, key_version, created_at, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET ciphertext = excluded.ciphertext, key_version = excluded.key_version, created_at = excluded.created_at, expires_at = excluded.expires_at, last_used_at = NULL',
    )
    .bind(accountId, payload, SCHOOL_SESSION_VERSION, now, now + TTL_MS)
    .run();
  return true;
}

/** 저장된 세션 쿠키를 복호화해 돌려준다. 없거나 만료·손상이면 null. */
export async function loadSchoolSession(
  accountId: string,
): Promise<SchoolCookieJar | null> {
  const key = secret();
  if (!key) return null;
  const db = database();
  const row = await db
    .prepare(
      'SELECT ciphertext, key_version, expires_at FROM school_session_vault WHERE account_id = ?',
    )
    .bind(accountId)
    .first<{ ciphertext: string; key_version: number; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await db
      .prepare('DELETE FROM school_session_vault WHERE account_id = ?')
      .bind(accountId)
      .run();
    return null;
  }
  if (row.key_version !== SCHOOL_SESSION_VERSION) return null;
  const cookies = await decryptSchoolCookies(key, accountId, row.ciphertext);
  if (!cookies) {
    await db
      .prepare('DELETE FROM school_session_vault WHERE account_id = ?')
      .bind(accountId)
      .run();
    return null;
  }
  await db
    .prepare('UPDATE school_session_vault SET last_used_at = ? WHERE account_id = ?')
    .bind(Date.now(), accountId)
    .run();
  return cookies;
}

export async function deleteSchoolSession(accountId: string): Promise<void> {
  if (!secret()) return;
  await database()
    .prepare('DELETE FROM school_session_vault WHERE account_id = ?')
    .bind(accountId)
    .run();
}

export async function cleanupExpiredSchoolSessions(): Promise<void> {
  if (!secret()) return;
  await database()
    .prepare('DELETE FROM school_session_vault WHERE expires_at < ?')
    .bind(Date.now())
    .run();
}
