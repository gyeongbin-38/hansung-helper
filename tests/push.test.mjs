import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import { encryptPushPayload, sendPush, vapidPublicKey } from '../lib/server/webpush.ts';

const te = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const u8 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const cat = (...ps) => { const o = new Uint8Array(ps.reduce((n, p) => n + p.length, 0)); let a = 0; for (const p of ps) { o.set(p, a); a += p.length; } return o; };
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// --- encryptPushPayload: RFC 8291 aes128gcm 왕복 복호화 ---
// 구독자(브라우저) 측 키를 시뮬레이션하고, 서버가 만든 본문을 RFC 절차로
// 되돌려 평문이 살아나는지 확인한다 — 암호화 자체의 검증.
const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
const p256dh = b64(uaPubRaw);
const authBytes = crypto.getRandomValues(new Uint8Array(16));
const auth = b64(authBytes);
const payload = te.encode(JSON.stringify({ title: '내일 마감', body: '과제', tag: 'x' }));
const body = await encryptPushPayload(payload, p256dh, auth);
assert.equal(body[20], 65, 'record idlen must be the ephemeral key length');
const salt = body.slice(0, 16), idlen = body[20];
const asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
assert.equal(asPub[0], 4, 'ephemeral key must be an uncompressed point');
// 수신 측 복호화 — 같은 HKDF 체인으로 CEK/NONCE 재도출
const asKey = await crypto.subtle.importKey(
  'jwk',
  { kty: 'EC', crv: 'P-256', x: b64(asPub.slice(1, 33)), y: b64(asPub.slice(33, 65)) },
  { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
const ikm = await hmac(await hmac(authBytes, shared), cat(te.encode('WebPush: info'), [0], uaPubRaw, asPub, [1]));
const prk = await hmac(salt, ikm);
const cek = (await hmac(prk, cat(te.encode('Content-Encoding: aes128gcm'), [0, 1]))).slice(0, 16);
const nonce = (await hmac(prk, cat(te.encode('Content-Encoding: nonce'), [0, 1]))).slice(0, 12);
const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, ct));
assert.equal(plain[plain.length - 1], 2, 'last byte must be the final-record delimiter');
assert.deepEqual(plain.slice(0, -1), payload);
// 손상된 키는 거부
await assert.rejects(encryptPushPayload(payload, b64(new Uint8Array(10)), auth));

// --- sendPush: VAPID JWT 서명 검증 + 요청 형태 ---
const vapidPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const vapidJwk = await crypto.subtle.exportKey('jwk', vapidPair.privateKey);
assert.equal(vapidPublicKey(vapidJwk).length, 87, 'uncompressed P-256 point is 65B → 87 base64url chars');
let request = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { request = { url, init }; return new Response(null, { status: 201 }); };
await sendPush({ endpoint: 'https://push.example.com/send/abc', p256dh, auth }, { title: 't', body: 'b' }, vapidJwk, 'https://app.example');
globalThis.fetch = realFetch;
assert.equal(request.init.method, 'POST');
assert.equal(request.init.headers['Content-Encoding'], 'aes128gcm');
const authHeader = request.init.headers.Authorization;
const [, jwtB64, kB64] = authHeader.match(/^vapid t=([^,]+),k=(.+)$/);
assert.equal(kB64, vapidPublicKey(vapidJwk), 'k= must be the VAPID public key');
const [hB64, pB64, sigB64] = jwtB64.split('.');
const claims = JSON.parse(new TextDecoder().decode(u8(pB64)));
assert.equal(claims.aud, 'https://push.example.com');
assert.equal(claims.sub, 'https://app.example');
assert.ok(claims.exp > Date.now() / 1000, 'exp must be in the future');
const verifyKey = await crypto.subtle.importKey('jwk', await crypto.subtle.exportKey('jwk', vapidPair.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, u8(sigB64), te.encode(`${hB64}.${pB64}`)), 'JWT signature must verify');
console.log('push crypto: aes128gcm roundtrip + VAPID JWT verified');

// --- dispatchLmsReminders: 발송·중복 방지·dead endpoint 정리 ---
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
sql.exec('CREATE TABLE academic_accounts (id TEXT PRIMARY KEY NOT NULL, student_mask TEXT NOT NULL, profile TEXT NOT NULL, snapshot TEXT NOT NULL, onboarded INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, consent_at INTEGER NOT NULL)');
sql.exec(await readFile('drizzle/0006_push.sql', 'utf8'));
sql.prepare("INSERT INTO academic_accounts (id, student_mask, profile, snapshot, created_at, consent_at) VALUES ('acc','m','{}','{}',1,1)").run();
sql.prepare("INSERT INTO academic_accounts (id, student_mask, profile, snapshot, created_at, consent_at) VALUES ('other','m','{}','{}',1,1)").run();
const d1 = {
  prepare(query) {
    let args = [];
    const stmt = {
      bind(...values) { args = values; return stmt; },
      async first() { return sql.prepare(query).get(...args) ?? null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
    };
    return stmt;
  },
};
async function load(file, imports) {
  const source = await readFile(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require(name) {
      if (!(name in imports)) throw new Error(`unexpected import: ${name}`);
      return imports[name];
    },
    console, JSON, Date, Math,
  }, { filename: file });
  return exports;
}
const sent = [];
const dispatch = await load('lib/server/push-dispatch.ts', {
  'cloudflare:workers': { env: {} },
  '../data/lms.ts': { currentSemesterStart: () => 0 },
  '../data/notifs.ts': {
    reminderTargets: () => [
      { id: 'lms-a', fireAt: 1, title: '오늘 마감', body: 'a' },
      { id: 'lms-b', fireAt: 1, title: '내일 마감', body: 'b' },
      { id: 'lms-future', fireAt: Date.now() + 86400000, title: '먼 미래', body: 'c' },
    ],
  },
  './webpush.ts': {
    sendPush: async (sub) => {
      sent.push(sub.endpoint);
      return sub.endpoint === 'https://ep/dead'
        ? new Response(null, { status: 404 })
        : new Response(null, { status: 201 });
    },
  },
});
const lms = { source: 'cosmos-lms', fetchedAt: 'x', courses: [] };
const creds = { jwk: {}, subject: 'https://app.example' };
d1.prepare("INSERT INTO push_subscriptions (endpoint, account_id, p256dh, auth, user_agent, created_at, last_seen_at) VALUES ('https://ep/ok','acc','k','a','ua',1,1)").run();
d1.prepare("INSERT INTO push_subscriptions (endpoint, account_id, p256dh, auth, user_agent, created_at, last_seen_at) VALUES ('https://ep/dead','acc','k','a','ua',1,1)").run();
d1.prepare("INSERT INTO push_subscriptions (endpoint, account_id, p256dh, auth, user_agent, created_at, last_seen_at) VALUES ('https://ep/other','other','k','a','ua',1,1)").run();

let r = await dispatch.dispatchLmsReminders(d1, 'acc', lms, creds, 1000);
assert.equal(r.sent, 2, 'due reminders sent');
assert.deepEqual(sent.filter((e) => e === 'https://ep/ok').length, 2, 'live endpoint gets both reminders');
assert.equal(sent.filter((e) => e === 'https://ep/dead').length, 1, 'dead endpoint tried once then skipped');
assert.equal(sent.filter((e) => e === 'https://ep/other').length, 0, 'other account untouched');
assert.equal(r.removed, 1, 'dead endpoint reported');
assert.equal(sql.prepare('SELECT COUNT(*) c FROM push_notified WHERE account_id = ?').get('acc').c, 2);
assert.equal(sql.prepare('SELECT COUNT(*) c FROM push_subscriptions WHERE endpoint = ?').get('https://ep/dead').c, 0, 'dead endpoint row deleted');

sent.length = 0;
r = await dispatch.dispatchLmsReminders(d1, 'acc', lms, creds, 1000);
assert.equal(r.sent, 0, 'notified ids dedup — no resend');
assert.equal(sent.length, 0, 'no pushes on second dispatch');

// 발송 실패(일시 오류)는 기록하지 않아 다음 시도에 재발송된다
const sent2 = [];
const dispatch2 = await load('lib/server/push-dispatch.ts', {
  'cloudflare:workers': { env: {} },
  '../data/lms.ts': { currentSemesterStart: () => 0 },
  '../data/notifs.ts': {
    reminderTargets: () => [{ id: 'lms-x', fireAt: 1, title: 't', body: 'b' }],
  },
  './webpush.ts': {
    sendPush: async () => { sent2.push(1); return new Response(null, { status: 500 }); },
  },
});
r = await dispatch2.dispatchLmsReminders(d1, 'acc', lms, creds, 1000);
assert.equal(r.sent, 0);
assert.equal(sql.prepare("SELECT COUNT(*) c FROM push_notified WHERE account_id = 'acc' AND notif_id = 'lms-x'").get().c, 0, 'transient failure must not mark notified');
console.log('push dispatch: dedup, dead-endpoint cleanup, transient retry preserved');
