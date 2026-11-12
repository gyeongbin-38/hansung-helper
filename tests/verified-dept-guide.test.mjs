import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedDeptGuide} from '../lib/data/verified-dept-guide.ts';
test('AI 25학번 요건과 졸업시점 예외 출처 보존', () => { const g=verifiedDeptGuide('AI응용학과',2025); assert.match(g.items.join(' '),/25학번부터/); assert.match(g.items.join(' '),/6학기/); assert.match(g.url,/hansung\.ac\.kr/); assert.equal(g.checkedAt,'2026-11-06'); });
test('컴퓨터공학부 학번 구간 및 졸업 시점 구분', () => { for (const [y,c] of [[2015,'~15학번'],[2016,'16학번'],[2017,'17~23학번'],[2023,'17~23학번'],[2024,'24학번 이후']]) assert.equal(verifiedDeptGuide('컴퓨터공학부',y).cohorts,c); assert.match(verifiedDeptGuide('컴퓨터공학부',2025).items.join(' '),/2028년 2월/); });
test('학과 또는 학번 불명은 추정하지 않음', () => { assert.equal(verifiedDeptGuide('다른학과',2025),null); assert.equal(verifiedDeptGuide('AI응용학과'),null); assert.equal(verifiedDeptGuide('AI응용학과',9999),null); });
