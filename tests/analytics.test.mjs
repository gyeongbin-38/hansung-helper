import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

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
    // JSON은 vm 내장을 써야 한다 — 호스트 JSON.parse가 던지는 SyntaxError는
    // vm realm의 instanceof 검사와 어긋나 라우트가 400 대신 503을 반환한다.
    console, crypto, TextEncoder, TextDecoder,
    Response, Request, URL, Headers, setTimeout, clearTimeout,
  }, { filename: file });
  return exports;
}

const sql = new DatabaseSync(':memory:');
sql.exec(await readFile('drizzle/0007_analytics.sql', 'utf8'));
// limited()가 쓰는 실제 레이트 리밋 테이블 — 0000 스키마와 동일한 열 구성
sql.exec('CREATE TABLE academic_login_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
const d1 = {
  prepare(query) {
    let args = [];
    const stmt = {
      _select: /^\s*select/i.test(query),
      bind(...values) { args = values; return stmt; },
      async first() { return sql.prepare(query).get(...args) ?? null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
    };
    return stmt;
  },
  async batch(stmts) {
    const out = [];
    for (const s of stmts) out.push(await (s._select ? s.all() : s.run()));
    return out;
  },
};

const KEY = 'local-test-hmac-key-at-least-32bytes!';
const account = await load('lib/server/account.ts', {
  'cloudflare:workers': { env: { DB: d1, ACCOUNT_INDEX_HMAC_KEY: KEY } },
});
const route = await load('app/api/analytics/route.ts', {
  '@/lib/server/account': account,
});

// --- visitorDigest: 일별 순환·비가역 ---
const d1a = await account.visitorDigest('1.2.3.4', 'UA-A', '2099-01-01');
assert.equal(d1a, await account.visitorDigest('1.2.3.4', 'UA-A', '2099-01-01'), 'same input → same digest');
assert.notEqual(d1a, await account.visitorDigest('1.2.3.4', 'UA-A', '2099-01-02'), 'digest rotates daily');
assert.notEqual(d1a, await account.visitorDigest('5.6.7.8', 'UA-A', '2099-01-01'), 'different ip → different digest');
assert.match(d1a, /^[a-f0-9]{64}$/);
assert.ok(!d1a.includes('1.2.3.4'), 'raw ip never stored');

// --- POST: 방문 핑 기록·중복 방문 병합·집계 ---
const ping = (body, ip = '1.2.3.4', ua = 'UA-A', origin = 'https://app.example') =>
  route.POST(new Request('https://app.example/api/analytics', {
    method: 'POST',
    headers: {
      origin, 'content-type': 'application/json',
      'cf-connecting-ip': ip, 'user-agent': ua,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

let res = await ping({ p: 'home', ref: 'everytime.kr' });
assert.equal(res.status, 200);
res = await ping({ p: 'lms' });
assert.equal(res.status, 200);
const KST = 9 * 3600000;
const today = new Date(Date.now() + KST).toISOString().slice(0, 10);
const row = sql.prepare('SELECT * FROM site_visitors WHERE day = ?').get(today);
assert.equal(row.views, 2, 'same visitor second ping → views 2');
assert.equal(row.ref, 'everytime.kr', 'first referrer kept');
assert.equal(sql.prepare('SELECT COUNT(*) c FROM site_visitors WHERE day = ?').get(today).c, 1, 'one visitor per digest');
assert.equal(sql.prepare("SELECT views FROM site_views WHERE day = ? AND section = 'home'").get(today).views, 1);
assert.equal(sql.prepare("SELECT views FROM site_views WHERE day = ? AND section = 'lms'").get(today).views, 1);
// 다른 UA는 다른 방문자로 집계된다
res = await ping({ p: 'home' }, '1.2.3.4', 'UA-B');
assert.equal(res.status, 200);
assert.equal(sql.prepare('SELECT COUNT(*) c FROM site_visitors WHERE day = ?').get(today).c, 2);
// 유효하지 않은 섹션 문자열은 site_views에 쌓이지 않는다
res = await ping({ p: '<script>alert(1)</script>' });
assert.equal(res.status, 200);
assert.equal(sql.prepare("SELECT COUNT(*) c FROM site_views WHERE section = '<script>alert(1)</script>'").get().c, 0);

// --- GET: 30일 집계 ---
res = await route.GET();
const agg = (await res.json()).data;
const todayAgg = agg.days.find((d) => d.day === today);
assert.equal(todayAgg.visitors, 2);
assert.equal(todayAgg.views, 4);
assert.equal(todayAgg.referred, 1);
assert.ok(agg.sections.some((s) => s.section === 'lms' && s.views === 1));

// --- 잘못된 요청 ---
res = await ping('{broken');
assert.equal(res.status, 400);
res = await ping({}, '1.2.3.4', 'UA-A', 'https://evil.example');
assert.equal(res.status, 403);
// 레이트 리밋 — 실제 limited() 경로를 통해 429
const rateKey = 'ping:' + (await account.ipRateLimitKey('9.9.9.9'));
sql.prepare('INSERT INTO academic_login_limits (key, attempts, expires_at) VALUES (?, 999, ?)')
  .run(rateKey, Date.now() + 900000);
res = await ping({ p: 'home' }, '9.9.9.9', 'UA-C');
assert.equal(res.status, 429, 'rate-limited ping rejected');

console.log('analytics: visitorDigest rotation, ping dedup, section views, aggregates, 400/403/429 verified');
