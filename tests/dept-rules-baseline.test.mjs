import assert from 'node:assert/strict';
import { mergeBaseline } from '../scripts/_dept_rules_baseline.mjs';

const date = '2026-11-12T00:00:00Z';
const snapshot = (urls) => ({ source: 'hansung-dept-pages', fetchedAt: date, itemCount: urls.length,
  items: urls.map((url) => ({ url: `https://www.hansung.ac.kr/${url}`, lines: ['fixture'] })) });
const bundled = snapshot(['old']);
const active = snapshot(['new']);
const pointer = { part: -1, payload: JSON.stringify({ kind: 'dept-rules@generation', parts: 2 }), fetched_at: date, updated_at: 12 };
const raw = JSON.stringify(active), split = Math.floor(raw.length / 2);
const rows = [raw.slice(0, split), raw.slice(split)].map((payload, part) => ({ part, payload, fetched_at: date, updated_at: 12 }));
const query = async (kind) => kind === 'dept-rules@active' ? [pointer] : kind === 'dept-rules@generation' ? rows : [];
const merged = await mergeBaseline(query, bundled);
assert.equal(merged.itemCount, 2);
assert.ok(merged.items.some((v) => v.url.endsWith('/new')));
assert.ok(merged.items.some((v) => v.url.endsWith('/old')));
assert.equal((await mergeBaseline(async () => [], bundled)).itemCount, 1);
await assert.rejects(mergeBaseline(async (kind) => kind === 'dept-rules@active' ? [pointer] : rows.slice(0, 1), bundled), /incomplete/);
let pointerReads = 0;
await assert.rejects(mergeBaseline(async (kind) => {
  if (kind !== 'dept-rules@active') return rows;
  return [++pointerReads === 1 ? pointer : { ...pointer, updated_at: 13 }];
}, bundled), /changed/);
await assert.rejects(mergeBaseline(async () => { throw new Error('D1 unavailable'); }, bundled), /unavailable/);
console.log('department baseline: union, missing chunks, concurrent pointer changes and D1 failures handled');
