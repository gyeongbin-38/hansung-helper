// 학교 세션 쿠키 암호화 테스트 — node --experimental-strip-types tests/school-session-crypto.test.mjs
import assert from 'node:assert/strict';
import {
  SCHOOL_SESSION_ALLOWED_HOSTS,
  encryptSchoolCookies,
  decryptSchoolCookies,
  sanitizeSchoolCookies,
} from '../lib/server/school-session-crypto.ts';

let pass = 0;
let fail = 0;
const t = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL:', name);
  }
};

const secret = 'a'.repeat(64);

// ── sanitize ─────────────────────────────────────────────
const clean = sanitizeSchoolCookies({
  'info.hansung.ac.kr': { a: '1', b: '2' },
  'learn.hansung.ac.kr': { c: '3' },
  'evil.example.com': { d: '4' },
});
t('sanitize: 허용 호스트만 남김', clean && 'info.hansung.ac.kr' in clean && 'learn.hansung.ac.kr' in clean && !('evil.example.com' in clean));
t('sanitize: 쿠키 쌍 보존', clean?.['info.hansung.ac.kr']?.['a'] === '1');
t('sanitize: 빈 객체는 null', sanitizeSchoolCookies({}) === null);
t('sanitize: 비객체는 null', sanitizeSchoolCookies(null) === null && sanitizeSchoolCookies('x') === null);
t('sanitize: 세미콜론 이름 제거', sanitizeSchoolCookies({ 'learn.hansung.ac.kr': { 'a;b': '1' } }) === null);
t('sanitize: 허용 호스트 외만 있으면 null', sanitizeSchoolCookies({ 'evil.example.com': { d: '4' } }) === null);

// ── encrypt/decrypt round trip ────────────────────────────
const jar = {
  'info.hansung.ac.kr': { JSESSIONID: 'abc123', other: 'xyz' },
  'learn.hansung.ac.kr': { MoodleSession: 'def456' },
};
const payload = await encryptSchoolCookies(secret, 'account-1', jar);
t('encrypt: iv.ciphertext 형식', payload.split('.').length === 2);
const decrypted = await decryptSchoolCookies(secret, 'account-1', payload);
t('decrypt: 왕복 일치', decrypted?.['info.hansung.ac.kr']?.['JSESSIONID'] === 'abc123' && decrypted?.['learn.hansung.ac.kr']?.['MoodleSession'] === 'def456');

// ── AAD 계정 바인딩 ───────────────────────────────────────
t('decrypt: 다른 계정으로 복호화 불가', (await decryptSchoolCookies(secret, 'account-2', payload)) === null);

// ── 잘못된 키/변조 ────────────────────────────────────────
t('decrypt: 다른 키로 복호화 불가', (await decryptSchoolCookies('b'.repeat(64), 'account-1', payload)) === null);
const [iv, ct] = payload.split('.');
const tampered = `${iv}.${ct.slice(0, -2)}00`;
t('decrypt: 변조된 암호문은 null', (await decryptSchoolCookies(secret, 'account-1', tampered)) === null);
t('decrypt: 형식 불량 null', (await decryptSchoolCookies(secret, 'account-1', 'no-dot')) === null);

// ── 짧은 비밀값 거부 ──────────────────────────────────────
let shortRejected = false;
try {
  await encryptSchoolCookies('short', 'account-1', jar);
} catch {
  shortRejected = true;
}
t('encrypt: 32바이트 미만 비밀값 거부', shortRejected);

// ── 허용 호스트 상수 ──────────────────────────────────────
t('hosts: 정보/코스모스만 허용', SCHOOL_SESSION_ALLOWED_HOSTS.includes('info.hansung.ac.kr') && SCHOOL_SESSION_ALLOWED_HOSTS.includes('learn.hansung.ac.kr'));

console.log(`school-session-crypto.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
