import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

for (const path of ['extension/content.js', 'public/lms-collect.js']) {
  const source = await readFile(path, 'utf8');
  const start = source.indexOf('  const fetchVods = async');
  const end = source.indexOf('\n  // ── 강의 수강 기간', start);
  assert.ok(start >= 0 && end > start, path);
  const fn = source.slice(start, end).replace('const fetchVods =', 'fetchVods =');
  const makeDoc = ({ table = true, body = true, headers = ['주차', '콘텐츠', '시간', '출석', '주차 출석'] } = {}) => ({
    querySelector: (selector) => selector.endsWith('tbody') ? (body ? {} : null) : (table ? {} : null),
    querySelectorAll: (selector) => selector.includes('thead') ? headers.map(textContent => ({ textContent })) : [],
  });
  let doc = makeDoc(), byUrl = null, urls = [];
  const context = { fetchVods: null, BASE: 'https://learn.hansung.ac.kr', fetchHtml: async (url) => { urls.push(url); return byUrl ? byUrl(url) : doc; },
    COL_WEEKLY_ATTENDANCE: ['주차 출석', 'Week attendance'], COL_ATTENDANCE: ['출석', 'Attendance'],
    COL_REQUIRED_TIME: ['출석인정 요구시간', 'Required'], BULK_APPROVED: ['일괄출석인정'] };
  vm.runInNewContext(fn, context);
  assert.equal((await context.fetchVods('1', false)).length, 0, `${path}: valid empty table`);
  doc = makeDoc({ headers: ['주차', '콘텐츠', '시간', '출석', '기타'] });
  await assert.rejects(context.fetchVods('1', false), /progress-columns-missing/);
  doc = makeDoc({ table: false });
  await assert.rejects(context.fetchVods('1', false), /progress-table-missing/);
  doc = makeDoc({ body: false });
  await assert.rejects(context.fetchVods('1', false), /progress-body-missing/);
  urls = [];
  byUrl = (url) => url.includes('user_progress_a.php')
    ? makeDoc({ headers: ['주차', '콘텐츠', '시간', '출석', '기타'] }) : makeDoc();
  assert.equal((await context.fetchVods('1', false)).length, 0, `${path}: malformed primary falls back to valid empty secondary`);
  assert.equal(urls.length, 2);
  urls = [];
  byUrl = (url) => url.includes('user_progress_a.php') ? makeDoc() : makeDoc({ table: false });
  assert.equal((await context.fetchVods('1', true)).length, 0, `${path}: community falls back to alternate URL`);
  assert.equal(urls.length, 2);
  byUrl = () => { throw new Error('private-upstream-details'); };
  await assert.rejects(context.fetchVods('1', false), (error) =>
    error.message === 'progress-fetch-failed' && !error.message.includes('private-upstream-details'));
}
console.log('browser progress collectors: valid empty and malformed tables distinguished');
