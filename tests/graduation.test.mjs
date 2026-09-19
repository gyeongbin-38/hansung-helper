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
  assert.ok(DEFAULT_RULES.every((x) => x.id && x.label));
  assert.equal(DEFAULT_RULES[0].id, 'total');
  assert.match(DEFAULT_RULES[0].note ?? '', /공식 기준/);
});

test('official global baseline applies only for 2016+ entrants', () => {
  const r16 = evaluate([], [], {}, { admitYear: 2023 });
  assert.equal(r16.find((x) => x.rule.id === 'total').required, 130);
  const r15 = evaluate([], [], {}, { admitYear: 2015 });
  // 2015학번 이전 전역 기준은 미수집 — 추측하지 않고 UNKNOWN
  assert.equal(r15.find((x) => x.rule.id === 'total').required, null);
  assert.equal(r15.find((x) => x.rule.id === 'total').status, 'unknown');
  const rNone = evaluate([], []);
  assert.equal(rNone.find((x) => x.rule.id === 'total').required, 130);
  // 사용자가 직접 기준을 입력하면 미수집 연도에도 적용
  const rOver = evaluate([], [], { total: 140 }, { admitYear: 2014 });
  assert.equal(rOver.find((x) => x.rule.id === 'total').required, 140);
});

test('비교과 포인트 rule: 800P official, missing input stays unknown', () => {
  const r = evaluate([], [], {}, { admitYear: 2023 });
  const pts = r.find((x) => x.rule.id === 'points');
  assert.equal(pts.required, 800);
  assert.equal(pts.rule.unit, 'P');
  assert.equal(pts.status, 'unknown'); // 입력 전 — 0/800으로 표시하지 않음
  const r2 = evaluate([], [], {}, { admitYear: 2023, points: 900 });
  const pts2 = r2.find((x) => x.rule.id === 'points');
  assert.equal(pts2.earned, 900);
  assert.equal(pts2.status, 'met');
});

// 학과 규정표(yearTable) 해석 기준 — 검증된 학과만 엔진에 연결
test('deptTargets: 학과 기준이 미수집 전역 기준을 메운다 (pre-2016)', () => {
  // 2015학번: 전역 기준 미수집이지만 학과 규정표에 140학점 명시
  const r = evaluate([], [], {}, { admitYear: 2015, deptTargets: { total: 140 } });
  const total = r.find((x) => x.rule.id === 'total');
  assert.equal(total.required, 140);
  assert.equal(total.requiredSource, 'dept');
  // 학과 기준이 없는 규정은 여전히 unknown
  const major = r.find((x) => x.rule.id === 'major');
  assert.equal(major.required, null);
  assert.equal(major.requiredSource, undefined);
});

test('deptTargets: 사용자 override가 학과 기준보다 우선한다', () => {
  const r = evaluate([], [], { total: 150 }, { admitYear: 2015, deptTargets: { total: 140 } });
  const total = r.find((x) => x.rule.id === 'total');
  assert.equal(total.required, 150);
  assert.equal(total.requiredSource, 'override');
});

test('deptTargets: 비교과 포인트도 학과 기준으로 확정 가능', () => {
  const r = evaluate([], [], {}, { admitYear: 2015, points: 500, deptTargets: { points: 800 } });
  const pts = r.find((x) => x.rule.id === 'points');
  assert.equal(pts.required, 800);
  assert.equal(pts.requiredSource, 'dept');
  assert.equal(pts.status, 'progress');
});

test('planned already-completed code is not double counted', () => {
  // 이수 목록에 올린 과목이 계획에도 남아 있으면 '계획 포함' 표시가 부풀려졌다
  const completed = [done('A1', '전필', 3)];
  const planned = [
    section('A1-1', '전필', 3), // A1과 같은 코드 — 이미 이수됨
    section('P2-1', '전선', 3),
  ];
  const r = evaluate(completed, planned);
  const total = r.find((x) => x.rule.id === 'total');
  assert.equal(total.earned, 3);
  assert.equal(total.planned, 3); // A1 계획분은 제외 — 6이 아니라 3
});

test('requiredSource: 전역 기준 경로는 global로 표시', () => {
  const r = evaluate([], [], {}, { admitYear: 2023 });
  assert.equal(r.find((x) => x.rule.id === 'total').requiredSource, 'global');
  // 학과 기준이 있어도 total/points 외 규정에는 영향 없음
  const r2 = evaluate([], [], {}, { admitYear: 2023, deptTargets: { total: 130, points: 800 } });
  assert.equal(r2.find((x) => x.rule.id === 'gen').requiredSource, undefined);
});
