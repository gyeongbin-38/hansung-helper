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
sql.exec(await readFile('drizzle/0009_native_push.sql', 'utf8'));
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
    crypto: globalThis.crypto,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    // 호출 시점의 mock이 보이도록 위임한다
    fetch: (...a) => globalThis.fetch(...a),
    TextEncoder, TextDecoder, URL, Response, encodeURIComponent, setTimeout, Promise,
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
  './native-push.ts': {
    nativePushCredentials: () => null,
    sendNativePush: async () => 'fail',
  },
});
const lms = { source: 'cosmos-lms', fetchedAt: 'x', courses: [] };
const creds = { jwk: {}, subject: 'https://app.example' };
d1.prepare("INSERT INTO push_subscriptions (endpoint, account_id, p256dh, auth, user_agent, created_at, last_seen_at) VALUES ('https://ep/ok','acc','k','a','ua',1,1)").run();
d1.prepare("INSERT INTO push_subscriptions (endpoint, account_id, p256dh, auth, user_agent, created_at, last_seen_at) VALUES ('https://ep/dead','acc','k','a','ua',1,1)").run();
d1.prepare("INSERT INTO push_subscriptions (endpoint, account_id, p256dh, auth, user_agent, created_at, last_seen_at) VALUES ('https://ep/other','other','k','a','ua',1,1)").run();

let r = await dispatch.dispatchLmsReminders(d1, 'acc', lms, { web: creds, native: null }, 1000);
assert.equal(r.sent, 2, 'due reminders sent');
assert.deepEqual(sent.filter((e) => e === 'https://ep/ok').length, 2, 'live endpoint gets both reminders');
assert.equal(sent.filter((e) => e === 'https://ep/dead').length, 1, 'dead endpoint tried once then skipped');
assert.equal(sent.filter((e) => e === 'https://ep/other').length, 0, 'other account untouched');
assert.equal(r.removed, 1, 'dead endpoint reported');
assert.equal(sql.prepare('SELECT COUNT(*) c FROM push_notified WHERE account_id = ?').get('acc').c, 2);
assert.equal(sql.prepare('SELECT COUNT(*) c FROM push_subscriptions WHERE endpoint = ?').get('https://ep/dead').c, 0, 'dead endpoint row deleted');

sent.length = 0;
r = await dispatch.dispatchLmsReminders(d1, 'acc', lms, { web: creds, native: null }, 1000);
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
  './native-push.ts': {
    nativePushCredentials: () => null,
    sendNativePush: async () => 'fail',
  },
});
r = await dispatch2.dispatchLmsReminders(d1, 'acc', lms, { web: creds, native: null }, 1000);
assert.equal(r.sent, 0);
assert.equal(sql.prepare("SELECT COUNT(*) c FROM push_notified WHERE account_id = 'acc' AND notif_id = 'lms-x'").get().c, 0, 'transient failure must not mark notified');
console.log('push dispatch: dedup, dead-endpoint cleanup, transient retry preserved');

// --- 네이티브 채널: 토큰 발송·dead 정리·웹 채널 없이도 동작 ---
const nativeSent = [];
const dispatch3 = await load('lib/server/push-dispatch.ts', {
  'cloudflare:workers': { env: {} },
  '../data/lms.ts': { currentSemesterStart: () => 0 },
  '../data/notifs.ts': {
    reminderTargets: () => [{ id: 'lms-n', fireAt: 1, title: 't', body: 'b' }],
  },
  './webpush.ts': { sendPush: async () => new Response(null, { status: 201 }) },
  './native-push.ts': {
    nativePushCredentials: () => ({ apns: {}, fcm: {} }),
    sendNativePush: async (_c, platform, token) => {
      nativeSent.push(`${platform}:${token}`);
      return token === 'dead-tok' ? 'dead' : 'ok';
    },
  },
});
d1.prepare("INSERT INTO native_push_tokens (token, account_id, platform, created_at, last_seen_at) VALUES ('ios-tok','acc','ios',1,1)").run();
d1.prepare("INSERT INTO native_push_tokens (token, account_id, platform, created_at, last_seen_at) VALUES ('dead-tok','acc','ios',1,1)").run();
d1.prepare("INSERT INTO native_push_tokens (token, account_id, platform, created_at, last_seen_at) VALUES ('and-tok','acc','android',1,1)").run();
d1.prepare("INSERT INTO native_push_tokens (token, account_id, platform, created_at, last_seen_at) VALUES ('other-tok','other','ios',1,1)").run();
r = await dispatch3.dispatchLmsReminders(d1, 'acc', lms, { web: null, native: { apns: {}, fcm: {} } }, 1000);
assert.equal(r.sent, 1, 'native-only account still receives the reminder');
assert.ok(nativeSent.includes('ios:ios-tok') && nativeSent.includes('android:and-tok'), 'ios+android tokens both tried');
assert.ok(!nativeSent.some((t) => t === 'ios:other-tok'), 'other account untouched');
assert.equal(r.removed, 1, 'dead native token reported');
assert.equal(sql.prepare('SELECT COUNT(*) c FROM native_push_tokens WHERE token = ?').get('dead-tok').c, 0, 'dead native token deleted');
console.log('push dispatch: native tokens sent, dead-token cleanup');

// --- native-push: 자격 파싱 + APNs/FCM 요청 형태 + dead 판정 ---
const np = await load('lib/server/native-push.ts', {
  'cloudflare:workers': { env: {} },
});
assert.equal(np.nativePushCredentials({}), null, 'no env → credentials null');
const apnsOnly = np.nativePushCredentials({ APNS_KEY_ID: 'k', APNS_TEAM_ID: 't', APNS_KEY: 'x' });
assert.equal(apnsOnly.apns.topic, 'dev.gyeongbin38.hansunghelper', 'topic defaults to bundle id');
assert.equal(apnsOnly.apns.sandbox, false);
assert.equal(apnsOnly.fcm, null);
const brokenFcm = np.nativePushCredentials({ FCM_SERVICE_ACCOUNT: '{broken' });
assert.equal(brokenFcm, null, 'broken service-account JSON → null');
const fcmOnly = np.nativePushCredentials({
  FCM_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'a@x.iam', private_key: 'k', project_id: 'p' }),
});
assert.equal(fcmOnly.fcm.tokenUri, 'https://oauth2.googleapis.com/token', 'token_uri defaults');
assert.equal(fcmOnly.apns, null);

// APNs — ES256 JWT(kid/iss) + 게이트웨이 주소 + 본문 형태 + 410 → dead
const ecPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const ecPkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', ecPair.privateKey)).toString('base64');
const apns = { keyId: 'KID1234567', teamId: 'TEAM99999', key: ecPkcs8, topic: 'dev.app', sandbox: false };
let apnsReq = null;
globalThis.fetch = async (url, init) => {
  apnsReq = { url, init };
  return new Response(JSON.stringify({ reason: 'Unregistered' }), { status: 410 });
};
let res = await np.sendNativePush({ apns, fcm: null }, 'ios', 'apns-token-1', { title: 't', body: 'b', url: '/#lms' });
assert.equal(res, 'dead', 'APNs Unregistered → dead token');
assert.equal(apnsReq.url, 'https://api.push.apple.com/3/device/apns-token-1');
const [ah, ap] = apnsReq.init.headers.authorization.replace('bearer ', '').split('.').slice(0, 2).map((s) => JSON.parse(Buffer.from(s, 'base64url').toString()));
assert.equal(ah.kid, 'KID1234567');
assert.equal(ap.iss, 'TEAM99999');
assert.equal(apnsReq.init.headers['apns-topic'], 'dev.app');
const apnsBody = JSON.parse(apnsReq.init.body);
assert.equal(apnsBody.aps.alert.title, 't');
assert.equal(apnsBody.link, '/#lms');
// 서명도 실제로 검증 — APNs가 거부하는 서명 오류를 여기서 잡는다
const [, , apnsSigB64] = apnsReq.init.headers.authorization.split('.');
const verifyEc = await crypto.subtle.importKey('jwk', await crypto.subtle.exportKey('jwk', ecPair.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
assert.ok(await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  verifyEc,
  u8(apnsSigB64),
  te.encode(`${apnsReq.init.headers.authorization.split(' ')[1].split('.').slice(0, 2).join('.')}`),
), 'APNs JWT must verify');
// 샌드박스 게이트웨이 분기
const apnsSand = { ...apns, sandbox: true };
globalThis.fetch = async (url) => { apnsReq = { url }; return new Response('{}', { status: 200 }); };
assert.equal(await np.sendNativePush({ apns: apnsSand, fcm: null }, 'ios', 'tok', { title: 't', body: 'b' }), 'ok');
assert.equal(apnsReq.url, 'https://api.sandbox.push.apple.com/3/device/tok');
// 미설정 채널·알 수 없는 플랫폼 → fail
assert.equal(await np.sendNativePush({ apns: null, fcm: null }, 'ios', 'tok', {}), 'fail');
assert.equal(await np.sendNativePush({ apns, fcm: null }, 'android', 'tok', {}), 'fail');
console.log('native push: APNs JWT + gateway + dead-token verdict verified');

// FCM — RS256 → OAuth → v1 messages:send, UNREGISTERED → dead
const rsaPair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign'],
);
const rsaPkcs8 = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', rsaPair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
const fcm = { clientEmail: 'push@proj.iam.gserviceaccount.com', privateKey: rsaPkcs8, projectId: 'proj-1', tokenUri: 'https://oauth.example/token' };
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  if (String(url).includes('oauth'))
    return new Response(JSON.stringify({ access_token: 'tok-abc', expires_in: 3600 }), { status: 200 });
  return new Response('{}', { status: 200 });
};
res = await np.sendNativePush({ apns: null, fcm }, 'android', 'fcm-tok-1', { title: 't', body: 'b', url: '/#lms' });
assert.equal(res, 'ok');
assert.equal(calls[1].url, 'https://fcm.googleapis.com/v1/projects/proj-1/messages:send');
assert.equal(calls[1].init.headers.authorization, 'Bearer tok-abc');
const fcmBody = JSON.parse(calls[1].init.body);
assert.equal(fcmBody.message.token, 'fcm-tok-1');
assert.equal(fcmBody.message.data.link, '/#lms');
const grantBody = calls[0].init.body;
assert.ok(grantBody.includes('grant_type=') && grantBody.includes('jwt-bearer'), 'token request uses jwt-bearer grant');
// dead 판정 — UNREGISTERED 에러 코드
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  if (String(url).includes('oauth'))
    return new Response(JSON.stringify({ access_token: 'tok-abc', expires_in: 3600 }), { status: 200 });
  return new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 });
};
res = await np.sendNativePush({ apns: null, fcm }, 'android', 'fcm-tok-dead', { title: 't', body: 'b' });
assert.equal(res, 'dead', 'FCM UNREGISTERED → dead token');
console.log('native push: FCM oauth + send + dead-token verdict verified');
globalThis.fetch = realFetch;
