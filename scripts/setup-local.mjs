// Local development only. Never reads or changes production Worker secrets.
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const vars = new URL('.dev.vars', root);
const built = new URL('dist/server/wrangler.json', root);
if (!existsSync(built)) throw new Error('Run npm run build first.');
let content = '';
try {
  content = readFileSync(vars, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

// 각 키는 없을 때만 생성하고 기존 값은 교체하지 않는다.
const additions = [];
if (!/^ACCOUNT_INDEX_HMAC_KEY\s*=/m.test(content))
  additions.push(`ACCOUNT_INDEX_HMAC_KEY=${randomBytes(32).toString('hex')}`);
const value = (content + additions.join('\n')).match(/^ACCOUNT_INDEX_HMAC_KEY\s*=\s*([^\r\n]*)/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
if (!value || Buffer.byteLength(value, 'utf8') < 32)
  throw new Error('The existing local ACCOUNT_INDEX_HMAC_KEY must contain at least 32 bytes. It was not replaced.');

// 학교 세션 볼트용 별도 키 — 기존 키는 교체하지 않고 없을 때만 생성한다.
if (!/^SCHOOL_SESSION_KEY\s*=/m.test(content))
  additions.push(`SCHOOL_SESSION_KEY=${randomBytes(32).toString('hex')}`);
const schoolSessionKey = (content + additions.join('\n')).match(/^SCHOOL_SESSION_KEY\s*=\s*([^\r\n]*)/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
if (!schoolSessionKey || Buffer.byteLength(schoolSessionKey, 'utf8') < 32)
  throw new Error('The existing local SCHOOL_SESSION_KEY must contain at least 32 bytes. It was not replaced.');

// 푸시 알림 VAPID 키 쌍 — 로컬 전용 EC JWK. 없을 때만 생성하고 교체하지 않는다.
// 로컬 구독은 로컬 키로 서명되므로 프로덕션 키와 무관하게 동작한다.
if (!/^VAPID_JWK\s*=/m.test(content)) {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = pair.privateKey.export({ format: 'jwk' });
  additions.push(`VAPID_JWK='${JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d })}'`);
}

if (additions.length)
  writeFileSync(vars, content + '\n' + additions.join('\n') + '\n', { mode: 0o600 });
copyFileSync(vars, new URL('dist/server/.dev.vars', root));
console.log(`Local configuration ready in ${fileURLToPath(new URL('dist/server/', root))}. Secret values hidden.`);
