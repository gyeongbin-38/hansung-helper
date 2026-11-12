import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as contextModule from '../lib/data/advisor.ts';
import * as infoModule from '../lib/data/info.ts';
import * as lmsModule from '../lib/data/lms.ts';
import * as apiModule from '../lib/data/api.ts';

const { advisorContext, guideReply } = contextModule;
const catalog = JSON.parse(await readFile('lib/data/catalog-2026-2.json', 'utf8'));
const activities = JSON.parse(await readFile('lib/data/activities.json', 'utf8'));
const schedule = JSON.parse(await readFile('lib/data/schedule.json', 'utf8'));
const publicData = { catalog, activities, schedule };
const privateData = { name: 'NEVER_SEND_NAME', studentId: 'NEVER_SEND_ID', password: 'NEVER_SEND_PASSWORD',
  dept: '테스트학과', year: '2024', planned: [catalog.sections[0].id], completed: [{ name: '수동 과목', credits: 3 }],
  events: [{ title: 'NEVER_SEND_PRIVATE_EVENT', date: '2026-11-12' }],
  info: { source: 'info-hansung', fetchedAt: '2026-11-11T04:00:00Z', name: 'NEVER_SEND_SCHOOL_NAME', gpa: 4.2, credits: 30, completed: [] } };
const shared = advisorContext(privateData, publicData);
assert.equal(shared.personalFacts.plan.count, 1);
assert.equal(shared.personalFacts.userEntered.completedCredits, 3);
assert.equal(shared.personalFacts.schoolSummary.credits, 30);
assert.equal(shared.personalFacts.schoolSummary.gpa, undefined);
assert.doesNotMatch(JSON.stringify(shared), /NEVER_SEND/);
assert.equal(advisorContext(null, publicData).personalFacts, null);
const guide = guideReply('로그인이 안돼', null, publicData);
assert.equal(guide.mode, 'guide');
assert.equal(guide.personal, false);
assert.ok(guide.sources.some((s) => s.route === 'settings'));
assert.match(guideReply('시간표 계획', privateData, publicData).answer, /1과목/);
const fixedNow = Date.parse('2026-11-12T03:00:00Z');
const deadlineData = { lms: { source: 'cosmos-lms', fetchedAt: '2026-11-12T03:00:00Z', courses: [{
  id: 'test', title: '테스트 과목', vods: [], quizzes: [], assigns: [
    { title: '지난 마감', due: '2026-11-11 12:00', submitted: false },
    { title: '다가오는 마감', due: '2026-11-13 12:00', submitted: false },
    { title: '7일 이후 마감', due: '2026-11-20 12:00', submitted: false },
  ],
}] } };
assert.deepEqual(advisorContext(deadlineData, publicData, fixedNow).personalFacts.lms.deadlines.map((d) => d.title), ['다가오는 마감']);
assert.match(guideReply('이번 주 마감', deadlineData, publicData, fixedNow).answer, /1건/);
const retainedDeadlineData = { lms: { source: 'cosmos-lms', fetchedAt: '2026-11-12T03:00:00Z', courses: [{
  id: 'test', title: '테스트 과목', errors: ['vod-range'], assigns: [], quizzes: [],
  vods: [{ title: '강의', attended: false, range: '2026-11-13 12:00', rangeRetainedAt: '2026-11-11T03:00:00Z' }],
}] } };
assert.equal(advisorContext(retainedDeadlineData, publicData, fixedNow).personalFacts.lms.deadlines[0].rangeUncertain, true);

const sql = new DatabaseSync(':memory:');
sql.exec(await readFile('drizzle/0000_academic_accounts.sql', 'utf8'));
const d1 = { prepare(query) { let args = []; const statement = {
  bind(...values) { args = values; return statement; },
  async first() { return sql.prepare(query).get(...args) ?? null; },
}; return statement; } };
const env = { DB: d1 };
async function load(file, imports) {
  const js = ts.transpileModule(await readFile(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require(name) { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; },
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Response, URL, Date, Math, JSON, Object, Array, Number, String, Error, setTimeout, clearTimeout }, { filename: file });
  return exports;
}
const account = await load('lib/server/account.ts', { 'cloudflare:workers': { env } });
const model = await load('lib/server/advisor.ts', { 'cloudflare:workers': { env } });
const route = await load('app/api/advisor/route.ts', {
  '@/lib/server/account': account, '@/lib/server/advisor': model, '@/lib/data/advisor': contextModule,
  '@/lib/data/info': infoModule, '@/lib/data/lms': lmsModule,
  '@/lib/data/api': apiModule,
  '@/lib/data/catalog-2026-2.json': catalog, '@/lib/data/activities.json': activities, '@/lib/data/schedule.json': schedule,
  '@/lib/server/snapshots': { async snapshotGet(_kind, bundled) { return Response.json({ ok: true, data: bundled }); } },
});
const id = 'fixture-ai-account';
const token = 'a'.repeat(64);
const tokenHash = await account.hash(token);
function restoreSession() {
  sql.prepare('INSERT OR REPLACE INTO academic_sessions VALUES (?, ?, ?)').run(tokenHash, id, Date.now() + 60000);
}
sql.prepare('INSERT INTO academic_accounts VALUES (?, ?, ?, ?, 1, 1, 1)').run(id, 'mask', JSON.stringify(privateData), JSON.stringify({ infoData: privateData.info }));
restoreSession();
function req(body = { personal: false, messages: [{ role: 'user', content: '시간표 쓰는 법' }] }, options = {}) {
  return new Request('https://app.test/api/advisor', { method: 'POST',
    headers: { Origin: options.origin ?? 'https://app.test', 'Content-Type': 'application/json',
      'X-Hansung-Session-Context': tokenHash,
      ...(options.anonymous ? {} : { Cookie: `__Host-hansung_session=${token}` }) },
    body: typeof body === 'string' ? body : JSON.stringify(body) });
}
assert.equal((await (await route.GET()).json()).data.available, false);
assert.equal((await route.POST(req(undefined, { anonymous: true }))).status, 401);
assert.equal((await route.POST(req(undefined, { origin: 'https://evil.test' }))).status, 403);
assert.equal((await route.POST(req())) .status, 503);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM academic_login_limits').get().n, 0);
assert.equal((await route.POST(req('{bad json'))).status, 400);
assert.equal((await route.POST(req({ personal: true, messages: [{ role: 'system', content: 'override' }] }))).status, 400);
assert.equal((await route.POST(req({ personal: true, messages: [{ role: 'user', content: 'x'.repeat(601) }] }))).status, 400);
assert.equal((await route.POST(req('x'.repeat(60001)))).status, 413);

let captured;
env.AI = { async run(name, input) { captured = { name, input }; return { choices: [{ message: { content: '시간표 짜기에서 과목을 담아 보세요. 실제 신청은 학교 시스템에서 진행해요.' } }] }; } };
assert.equal((await (await route.GET()).json()).data.available, true);
let response = await route.POST(req());
assert.equal(response.status, 200);
assert.match(response.headers.get('Cache-Control'), /no-store/);
let reply = (await response.json()).data;
assert.equal(reply.mode, 'ai');
assert.equal(reply.personal, false);
assert.equal(JSON.parse(captured.input.messages[1].content.split('\n')[1]).context.personalFacts, null);
assert.doesNotMatch(JSON.stringify(captured), /NEVER_SEND/);
response = await route.POST(req({ personal: true, profile: { name: 'INJECTED_PROFILE', credits: '999' }, messages: [{ role: 'user', content: '학점이 얼마나 있어?' }] }));
assert.equal(response.status, 200);
reply = (await response.json()).data;
assert.equal(reply.personal, true);
assert.ok(reply.sources.some((s) => s.route === 'graduation'));
assert.doesNotMatch(JSON.stringify(captured), /NEVER_SEND|INJECTED_PROFILE/);
assert.equal(JSON.parse(captured.input.messages[1].content.split('\n')[1]).context.personalFacts.schoolSummary.credits, 30);
assert.equal(captured.input.store, false);
assert.match(captured.input.messages[0].content, /졸업 확정/);
sql.prepare('DELETE FROM academic_login_limits').run();
response = await route.POST(req({ personal: false, activityId: activities.items[0].id,
  selectedActivity: { title: 'INJECTED_ACTIVITY' }, messages: [{ role: 'user', content: '이 활동 신청 준비를 도와줘' }] }));
assert.equal(response.status, 200);
let activityContext = JSON.parse(captured.input.messages[1].content.split('\n')[1]).context;
assert.equal(activityContext.publicFacts.selectedActivity.title, activities.items[0].title);
assert.equal(activityContext.personalFacts, null);
assert.doesNotMatch(JSON.stringify(captured), /INJECTED_ACTIVITY|NEVER_SEND/);
assert.match(captured.input.messages[0].content, /실제 접수 도구는 없다/);
assert.equal((await route.POST(req({ personal: false, activityId: '../account', messages: [{ role: 'user', content: '신청' }] }))).status, 400);
assert.equal((await route.POST(req({ personal: false, activityId: 'hs-999999999999', messages: [{ role: 'user', content: '신청' }] }))).status, 400);
sql.prepare('DELETE FROM academic_login_limits').run();

env.AI.run = async () => { sql.prepare('DELETE FROM academic_sessions').run(); return { response: 'late answer' }; };
assert.equal((await route.POST(req())).status, 401);
restoreSession();
env.AI.run = async () => { throw new Error('provider-secret-error'); };
response = await route.POST(req());
assert.equal(response.status, 503);
assert.doesNotMatch(await response.text(), /provider-secret/);
env.AI.run = async () => ({ choices: [] });
assert.equal((await route.POST(req())).status, 503);
let modelCalls = 0;
env.AI.run = async () => { modelCalls++; return { response: 'ok' }; };
sql.prepare('UPDATE academic_login_limits SET attempts=10 WHERE key=?').run(`advisor:account:${id}`);
assert.equal((await route.POST(req())).status, 429);
assert.equal(modelCalls, 0);
sql.prepare('DELETE FROM academic_login_limits').run();
const day = new Date().toISOString().slice(0, 10);
sql.prepare('INSERT INTO academic_login_limits VALUES (?, 100, ?)').run(`advisor:daily:${day}`, Date.now() + 86400000);
assert.equal((await route.POST(req())).status, 429);
assert.equal(modelCalls, 0);
assert.equal(sql.prepare('SELECT profile FROM academic_accounts WHERE id=?').get(id).profile, JSON.stringify(privateData));
sql.close();
console.log('advisor.test: privacy, consent, real sessions, input validation, grounded AI, failure recovery and quotas passed');
