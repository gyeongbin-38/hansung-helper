import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = await readFile('app/sections/graduation-school-requirements.tsx', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
vm.runInNewContext(js, { exports, require: createRequire(import.meta.url) });
const cell = (text, header = false, colspan = 1, rowspan = 1) => ({ text, header, colspan, rowspan });
const flat = {
  heading: '졸업요건',
  rows: [
    ['순번', '트랙(학과)', '졸업요건', '비고'].map(text => cell(text, true)),
    ['1', '빅데이터트랙', '1. 졸업논문 발표 2. 공모전 입상 3. 자격증 취득', '2028년 2월 졸업예정자부터 적용'].map(text => cell(text)),
    ['2', 'AI응용학과', 'TOEIC 700점 이상 또는 논문 실적', ''].map(text => cell(text)),
  ],
};
const render = tables => renderToStaticMarkup(createElement(exports.SchoolRequirementTables, { tables }));

test('전공 카드는 모든 원문 항목과 적용 조건을 보존하고 빈 비고를 생략한다', () => {
  const html = render([flat]);
  assert.equal((html.match(/<article /g) ?? []).length, 2);
  assert.equal((html.match(/<aside /g) ?? []).length, 1);
  for (const row of flat.rows.slice(1)) for (const c of row) {
    for (const fragment of c.text.split(/\s+(?=\d+\.\s)/)) assert.ok(html.includes(fragment), fragment);
  }
  assert.ok(html.includes('<p>2. 공모전 입상</p>'));
  assert.ok(!html.includes('<table'));
});

test('병합 셀과 여러 헤더 행은 카드로 추정하지 않고 원문 표를 유지한다', () => {
  const merged = {
    heading: '트랙별 기준',
    rows: [
      [cell('구분', true, 1, 2), cell('전공', true, 2)],
      [cell('기준', true), cell('이수', true)],
      [cell('빅데이터'), cell('39'), cell('30')],
    ],
  };
  const html = render([merged]);
  assert.ok(html.includes('rowSpan="2"'));
  assert.ok(html.includes('colSpan="2"'));
  assert.ok(html.includes('<caption>트랙별 기준</caption>'));
  assert.ok(html.includes('tabindex="0"'));
  assert.ok(!html.includes('<article'));
  const flatWithMerge = { ...flat, rows: flat.rows.map(row => row.map(c => ({ ...c }))) };
  flatWithMerge.rows[1][3].rowspan = 2;
  flatWithMerge.rows[2].pop();
  assert.ok(render([flatWithMerge]).includes('<table'));
});

test('다른 열 구조와 빈 표에서도 원문 순서와 안전한 텍스트 출력을 유지한다', () => {
  const html = render([{ heading: '', rows: [[cell('과목', true), cell('조건', true)], [cell('<script>학교 원문</script>'), cell('39학점')]] }, { heading: '', rows: [] }]);
  assert.ok(html.includes('&lt;script&gt;학교 원문&lt;/script&gt;'));
  assert.ok(html.includes('39학점'));
  assert.ok(html.includes('<caption>졸업요건 2</caption>'));
  assert.equal((html.match(/<table /g) ?? []).length, 2);
});
