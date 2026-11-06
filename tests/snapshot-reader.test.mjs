import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

test('snapshot reader serves complete generations and falls back when chunks are missing', async () => {
  const source = await readFile('lib/server/snapshots.ts', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const rows = new Map();
  const db = { prepare: () => ({ bind: (kind) => ({ all: async () => ({ results: rows.get(kind) ?? [] }) }) }) };
  const exports = {};
  vm.runInNewContext(js, { exports, require: () => ({ env: { DB: db } }), Date, Map, JSON, Number, Response });
  const stamp = '2026-10-01T00:00:00Z';
  const pointer = (kind, parts) => ({ part: -1, payload: JSON.stringify({ kind, parts }), fetched_at: stamp, updated_at: 3 });
  const part = (part, payload) => ({ part, payload, fetched_at: stamp, updated_at: 3 });
  rows.set('activities@active', [pointer('activities@good', 2)]);
  rows.set('activities@good', [part(0, '{"items":'), part(1, '[1]}')]);
  assert.deepEqual((await (await exports.snapshotGet('activities', { items: [0] })).json()).data.items, [1]);
  rows.set('schedule@active', [pointer('schedule@bad', 2)]);
  rows.set('schedule@bad', [part(0, '{"items":[]}')]);
  assert.deepEqual((await (await exports.snapshotGet('schedule', { items: [0] })).json()).data.items, [0]);
  rows.set('courses', [part(0, '{"sections":[]}')]);
  assert.deepEqual((await (await exports.snapshotGet('courses', { sections: [0] })).json()).data.sections, []);
  assert.deepEqual((await (await exports.snapshotGet('courses', { sections: [0] }, '', (data) => data.semester === '2026-2')).json()).data.sections, [0]);
});
