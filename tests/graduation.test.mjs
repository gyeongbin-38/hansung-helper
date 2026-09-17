import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, DEFAULT_RULES } from '../lib/data/graduation.ts';

const section = (id, category, credits) => ({
  id,
  code: id.split('-')[0],
  section: '1',
  name: id,
  dept: '테스트학과',
  deptCode: 'TST',
  category,
  credits,
  year: '1',
  professor: 'x',
  room: 'x',
  cross: false,
  online: false,
  slots: [],
});
const done = (code, category, credits) => ({
  code,
  name: code,
  category,
  credits,
});

test('completed credits sum by 이수구분 group; planned kept separate', () => {
  const completed = [
    done('A1', '전필', 3),
    done('A2', '전선', 3),
    done('B1', '교필', 2),
    done('C1', '일선', 2),
  ];
  const planned = [section('P1-1', '전필', 3)];
  const r = evaluate(completed, planned);
  const total = r.find((x) => x.rule.id === 'total');
  const majorReq = r.find((x) => x.rule.id === 'majorReq');
  const gen = r.find((x) => x.rule.id === 'gen');
  assert.equal(total.earned, 10);
  assert.equal(total.planned, 3);
  assert.equal(majorReq.earned, 3);
  assert.equal(majorReq.planned, 3);
  assert.equal(gen.earned, 2);
});

test('unknown requirement stays unknown, never reported as 0%', () => {
  const r = evaluate([], []);
  const majorReq = r.find((x) => x.rule.id === 'majorReq');
  assert.equal(majorReq.status, 'unknown');
  assert.equal(majorReq.required, null);
});

test('met only when earned reaches required; override sets requirement', () => {
  const completed = [done('A1', '전필', 3), done('A2', '전선', 3)];
  const r1 = evaluate(completed, [], { major: 6 });
  assert.equal(r1.find((x) => x.rule.id === 'major').status, 'met');
  const r2 = evaluate(completed, [], { major: 9 });
  assert.equal(r2.find((x) => x.rule.id === 'major').status, 'progress');
});

test('default rules carry honest provenance note and sane shape', () => {
  assert.ok(DEFAULT_RULES.every((x) => x.id && x.label && x.groups.length));
  assert.equal(DEFAULT_RULES[0].id, 'total');
  assert.match(DEFAULT_RULES[0].note ?? '', /공식 기준/);
});
