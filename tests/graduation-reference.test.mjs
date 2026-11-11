import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const data = JSON.parse(await readFile('lib/data/graduation-reference.json', 'utf8'));
assert.equal(data.asOf, '2026-11-08');
assert.equal(data.programCatalogYear, 2026);
assert.equal(data.sections.programs2026.length, 66);
assert.equal(data.sections.programs2026.filter((p) => p.status === '추가 확인 필요').length, 36);
assert.ok(data.sections.departmentRequirements.every((item) => item.status && item.sourceUrl));
assert.ok(data.sections.reorganization2027.every((item) => item.notes));

const source = await readFile('app/api/graduation-reference/route.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(js, { exports, require: () => ({ default: data }), URL, Response });
const api = async (query = '') => {
  const response = exports.GET({ url: `https://example.test/api/graduation-reference${query}` });
  return { status: response.status, json: await response.json() };
};
const all = await api();
assert.equal(all.json.data.purpose, 'reference-only');
assert.equal(all.json.data.graduationDecision, '확인 필요');
assert.equal(all.json.data.programs2026.length, 66);
const program = data.sections.programs2026[0];
const query = new URLSearchParams({ department: program.department, track: program.track });
const selected = await api(`?${query}`);
assert.ok(selected.json.data.programs2026.length > 0);
assert.ok(selected.json.data.programs2026.every((p) => p.department === program.department && p.track === program.track));
const duplicateTrack = data.sections.programs2026.find((p, i, all) => all.filter((q) => q.track === p.track).length > 1);
assert.ok(duplicateTrack);
const ambiguous = await api(`?${new URLSearchParams({ track: duplicateTrack.track })}`);
assert.ok(ambiguous.json.data.programs2026.length > 1, 'a generic track name must not be assigned to a single department');
assert.equal((await api('?track=no-such-track')).json.data.programs2026.length, 0);
assert.equal((await api('?track=%20')).status, 400);
assert.equal((await api('?track=a&track=b')).status, 400);
assert.equal((await api('?admitYear=2027')).status, 400);
console.log('graduation reference: preserved scope, uncertainty, sources and exact filters');
