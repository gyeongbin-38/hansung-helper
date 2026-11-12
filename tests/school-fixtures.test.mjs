import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectLms, parseProgress } from '../lib/server/lms.ts';
import { mergeLmsSnapshot } from '../lib/data/lms.ts';

const fixture = async (name) => readFile(`tests/fixtures/school/${name}.html`, 'utf8');
const valid = await fixture('progress-valid');
const empty = await fixture('progress-empty');
const broken = await fixture('progress-missing-column');
const login = await fixture('login-wall');
assert.equal(parseProgress(valid)[0].attended, true);
assert.deepEqual(parseProgress(empty), []);
assert.throws(() => parseProgress(broken), /progress-columns-missing/);
assert.throws(() => parseProgress(login), /progress-header-missing/);
const auth = (html) => new Response(html + '<a href="/login/logout.php">logout</a>');
const items = '<table class="generaltable"><tbody></tbody></table>';
const course = [{ id: '1', name: 'fixture' }];
let urls = [];
const fallback = await collectLms({ request: async (url) => {
  urls.push(url);
  if (url.includes('user_progress_a.php')) return auth(broken);
  if (url.includes('user_progress.php')) return auth(empty);
  return auth(items);
} }, course);
assert.ok(urls.some((url) => url.includes('user_progress.php')));
assert.equal(fallback.courses[0].errors.includes('vod'), false);
assert.deepEqual(fallback.courses[0].vods, []);
const failed = await collectLms({ request: async (url) =>
  url.includes('user_progress') ? new Response(login) : auth(items) }, course);
assert.ok(failed.courses[0].errors.includes('vod'));
const prior = { source: 'cosmos-lms', fetchedAt: '2026-09-01T00:00:00Z', courses: [{ id: '1', title: 'fixture', vods: [{ title: 'old', attended: true }], assigns: [], quizzes: [] }] };
assert.equal(mergeLmsSnapshot(prior, failed).courses[0].vods[0].attended, true);
console.log('school fixtures: valid/empty/broken/login wall, fallback and retained attendance passed');
