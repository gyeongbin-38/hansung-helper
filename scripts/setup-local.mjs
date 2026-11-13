// Local development only. Never reads or changes production Worker secrets.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const vars = new URL('.dev.vars', root);
const built = new URL('dist/server/wrangler.json', root);
if (!existsSync(built)) throw new Error('Run npm run build first.');
let content = existsSync(vars) ? readFileSync(vars, 'utf8') : '';
if (!/^ACCOUNT_INDEX_HMAC_KEY\s*=/m.test(content)) {
  content += `\nACCOUNT_INDEX_HMAC_KEY=${randomBytes(32).toString('hex')}\n`;
  writeFileSync(vars, content, { mode: 0o600 });
}
const value = content.match(/^ACCOUNT_INDEX_HMAC_KEY\s*=\s*([^\r\n]*)/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
if (!value || Buffer.byteLength(value, 'utf8') < 32)
  throw new Error('The existing local ACCOUNT_INDEX_HMAC_KEY must contain at least 32 bytes. It was not replaced.');

// 학교 세션 볼트용 별도 키 — 기존 키는 교체하지 않고 없을 때만 생성한다.
if (!/^SCHOOL_SESSION_KEY\s*=/m.test(content)) {
  content += `\nSCHOOL_SESSION_KEY=${randomBytes(32).toString('hex')}\n`;
  writeFileSync(vars, content, { mode: 0o600 });
}
const schoolSessionKey = content.match(/^SCHOOL_SESSION_KEY\s*=\s*([^\r\n]*)/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
if (!schoolSessionKey || Buffer.byteLength(schoolSessionKey, 'utf8') < 32)
  throw new Error('The existing local SCHOOL_SESSION_KEY must contain at least 32 bytes. It was not replaced.');
copyFileSync(vars, new URL('dist/server/.dev.vars', root));
console.log(`Local configuration ready in ${fileURLToPath(new URL('dist/server/', root))}. Secret values hidden.`);
