import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAudit,
  evaluate,
  DEFAULT_RULES,
  graduationOutlook,
  requirementQuantityName,
  generalEducationReference,
  evaluateGpa,
} from '../lib/data/graduation.ts';

test('교양 기준은 입학연도와 유형을 구분한다', () => {
  assert.equal(generalEducationReference(2023, 'freshman').total, 28);
  assert.equal(generalEducationReference(2024, 'freshman').total, 31);
  assert.equal(generalEducationReference(2022, 'freshman').total, 28);
  assert.equal(generalEducationReference(2018, 'freshman').total, 22);
  assert.equal(generalEducationReference(2016, 'freshman'), null);
  assert.equal(generalEducationReference(2023, 'general-transfer'), null);
  const rule = evaluate([], [], {}, { admitYear: 2023, admissionType: 'freshman' }).find((r) => r.rule.id === 'gen');
  assert.equal(rule.required, 28);
  assert.equal(rule.status, 'unknown');
  assert.equal(rule.uncertainAllocation, true);
});

test('평점 미수집·확인 실패는 충족으로 판정하지 않는다', () => {
  assert.equal(evaluateGpa(undefined, true).status, 'unknown');
  assert.equal(evaluateGpa(2.5, false).status, 'unknown');
  assert.equal(evaluateGpa(2, true).status, 'met');
  assert.equal(evaluateGpa(1.99, true).status, 'progress');
  assert.equal(evaluateGpa(5, true).status, 'unknown');
});

test('23학번 융합전공 I 78학점은 트랙별 인정 확인 전 충족으로 단정하지 않는다', () => {
  const courses = Array.from({ length: 26 }, (_, i) => ({ code: `M${i}`, name: `M${i}`, category: '전선', credits: 3 }));
  const scoped = evaluate(courses, [], {}, { admitYear: 2023, admissionType: 'freshman', programMode: 'fusion1' }).find((r) => r.rule.id === 'major');
  assert.equal(scoped.required, 78);
  assert.equal(scoped.earned, 78);
  assert.equal(scoped.status, 'unknown');
  assert.equal(scoped.uncertainTrack, true);
  // 융합전공Ⅱ도 전공합계 78 — 과정 무관하게 동일 총량 (트랙 배분 검증은 fusion1에서만)
  assert.equal(evaluate(courses, [], {}, { admitYear: 2023, admissionType: 'freshman', programMode: 'fusion2' }).find((r) => r.rule.id === 'major').required, 78);
});

test('24학번 신입학 융합전공 I에 31·78·21 기준을 적용하되 배분 확정은 보류한다', () => {
  const results = evaluate([], [], {}, { admitYear: 2024, admissionType: 'freshman', programMode: 'fusion1' });
  for (const [id, required] of [['gen', 31], ['major', 78], ['free', 21]]) {
    const rule = results.find((r) => r.rule.id === id);
    assert.equal(rule.required, required);
    assert.equal(rule.status, 'unknown');
  }
  assert.match(generalEducationReference(2024, 'freshman').note, /13학점.*15학점.*3학점/);
  // 일반편입도 학번 기준 적용 — 전공 78·교양 31 (자유선택은 인정학점 배분 불명확으로 미확정)
  const transfer = evaluate([], [], {}, { admitYear: 2024, admissionType: 'general-transfer', programMode: 'fusion1' });
  assert.equal(transfer.find((r) => r.rule.id === 'gen').required, 31);
  assert.equal(transfer.find((r) => r.rule.id === 'major').required, 78);
  assert.equal(transfer.find((r) => r.rule.id === 'free').required, null);
  // 다른 이수과정도 전공합계 78·자유선택 21 동일
  const otherMode = evaluate([], [], {}, { admitYear: 2024, admissionType: 'freshman', programMode: 'fusion2' });
  assert.equal(otherMode.find((r) => r.rule.id === 'major').required, 78);
  assert.equal(otherMode.find((r) => r.rule.id === 'free').required, 21);
});

test('교과와 비교과 필요 기준의 단위 명칭이 구분된다', () => {
  assert.equal(requirementQuantityName(DEFAULT_RULES.find((rule) => rule.id === 'points')), '포인트');
  assert.equal(requirementQuantityName(DEFAULT_RULES.find((rule) => rule.id === 'total')), '학점');
  assert.equal(requirementQuantityName(DEFAULT_RULES.find((rule) => rule.id === 'majorReq')), '학점');
});

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
  const r16 = evaluate([], [], {}, { admissionType: 'freshman', admitYear: 2023 });
  assert.equal(r16.find((x) => x.rule.id === 'total').required, 130);
  const r15 = evaluate([], [], {}, { admitYear: 2015 });
  // 2015학번 이전 전역 기준은 미수집 — 추측하지 않고 UNKNOWN
  assert.equal(r15.find((x) => x.rule.id === 'total').required, null);
  assert.equal(r15.find((x) => x.rule.id === 'total').status, 'unknown');
  const rNone = evaluate([], []);
  assert.equal(rNone.find((x) => x.rule.id === 'total').required, null);
  const transfer = evaluate([], [], {}, { admissionType: 'transfer', admitYear: 2023, points: 800 });
  assert.equal(transfer.find((x) => x.rule.id === 'points').status, 'unknown');
  // 사용자가 직접 기준을 입력하면 미수집 연도에도 적용
  const rOver = evaluate([], [], { total: 140 }, { admitYear: 2014 });
  assert.equal(rOver.find((x) => x.rule.id === 'total').required, 140);
});

test('비교과 포인트 rule: 800P official, missing input stays unknown', () => {
  const r = evaluate([], [], {}, { admissionType: 'freshman', admitYear: 2023 });
  const pts = r.find((x) => x.rule.id === 'points');
  assert.equal(pts.required, 800);
  assert.equal(pts.rule.unit, 'P');
  assert.equal(pts.status, 'unknown'); // 입력 전 — 0/800으로 표시하지 않음
  const r2 = evaluate([], [], {}, { admissionType: 'freshman', admitYear: 2023, points: 900 });
  const pts2 = r2.find((x) => x.rule.id === 'points');
  assert.equal(pts2.earned, 900);
  assert.equal(pts2.status, 'met');
});

// 학과 규정표(yearTable) 해석 기준 — 검증된 학과만 엔진에 연결
test('deptTargets: 학과 기준이 미수집 전역 기준을 메운다 (pre-2016)', () => {
  // 2015학번: 전역 기준 미수집이지만 학과 규정표에 140학점 명시
  const r = evaluate([], [], {}, { admissionType: 'freshman', admitYear: 2015, deptTargets: { total: 140 } });
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

test('사용자 수정값 삭제 후 공식 기준 또는 미확정 상태로 복원된다', () => {
  const opts = { admitYear: 2023, admissionType: 'freshman', deptTargets: { total: 140 } };
  const modified = evaluate([], [], { total: 150, major: 60 }, opts);
  assert.equal(modified.find((x) => x.rule.id === 'total').requiredSource, 'override');
  assert.equal(modified.find((x) => x.rule.id === 'major').required, 60);
  const restored = evaluate([], [], {}, opts);
  assert.equal(restored.find((x) => x.rule.id === 'total').required, 140);
  assert.equal(restored.find((x) => x.rule.id === 'total').requiredSource, 'dept');
  // 23학번 전공 기준은 전역 수집 완료 — 학과 미수집이어도 78로 복원
  assert.equal(restored.find((x) => x.rule.id === 'major').required, 78);
  assert.equal(restored.find((x) => x.rule.id === 'major').requiredSource, 'global');
  const global = evaluate([], [], {}, { admitYear: 2023, admissionType: 'freshman' });
  assert.equal(global.find((x) => x.rule.id === 'total').requiredSource, 'global');
});

test('deptTargets: 비교과 포인트도 학과 기준으로 확정 가능', () => {
  const r = evaluate([], [], {}, { admissionType: 'freshman', admitYear: 2015, points: 500, deptTargets: { points: 800 } });
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

test('duplicate completed codes require review rather than counting retakes twice', () => {
  const r = evaluate([done('A', '전필', 3), done('A', '전필', 3)], [], { total: 6 });
  const total = r.find((x) => x.rule.id === 'total');
  assert.equal(total.earned, 0);
  assert.equal(total.status, 'unknown');
  assert.equal(total.uncertainCredits, true);
});

test('confirmed admission types use their own baseline without applying freshman department targets to transfers', () => {
  for (const [admissionType, total, points] of [['freshman', 130, 800], ['general-transfer', 130, 400], ['bachelor-transfer', 65, 400]]) {
    const r = evaluate([], [], {}, { admitYear: 2025, admissionType, deptTargets: { total: 130, points: 800 } });
    assert.equal(r[0].required, total);
    assert.equal(r[1].required, points);
  }
  assert.equal(evaluate([], [], {}, { admitYear: 2015, admissionType: 'freshman' })[0].required, 140);
  assert.equal(evaluate([], [], {}, { admitYear: 2015, admissionType: 'bachelor-transfer' })[0].required, 70);
  assert.equal(evaluate([], [], {}, { admitYear: 2015, admissionType: 'freshman' })[1].required, null);
});

test('invalid admission year never receives a guessed baseline', () => {
  for (const admitYear of [0, 1800, 9999, NaN])
    assert.equal(evaluate([], [], {}, { admitYear, admissionType: 'freshman' })[0].required, null);
});

test('requiredSource: 전역 기준 경로는 global로 표시', () => {
  const r = evaluate([], [], {}, { admissionType: 'freshman', admitYear: 2023 });
  assert.equal(r.find((x) => x.rule.id === 'total').requiredSource, 'global');
  // 학과 기준이 있어도 별도로 확인한 23학번 교양 기준은 유지된다.
  const r2 = evaluate([], [], {}, { admissionType: 'freshman', admitYear: 2023, deptTargets: { total: 130, points: 800 } });
  assert.equal(r2.find((x) => x.rule.id === 'gen').requiredSource, 'global');
  assert.equal(r2.find((x) => x.rule.id === 'gen').status, 'unknown');
});

// ── graduationOutlook — 남은 학점 → 학기 역산 추정 ─────────
// 공식 사정이 아닌 계획 참고용 — 화면에 가정과 함께 표시된다.

test('outlook: 기준 미확정(required null/0)이면 계산 불가', () => {
  assert.equal(
    graduationOutlook({ earned: 50, required: null, planned: 0 }).ok,
    false,
  );
  assert.equal(
    graduationOutlook({ earned: 50, required: 0, planned: 0 }).ok,
    false,
  );
});

test('outlook: 남은 학점을 학기당 18학점 기본으로 나눈다', () => {
  // 130 - 50 = 80 → ceil(80/18) = 5학기
  const o = graduationOutlook({ earned: 50, required: 130, planned: 0 });
  assert.equal(o.remaining, 80);
  assert.equal(o.afterPlan, 80);
  assert.equal(o.perSemester, 18);
  assert.equal(o.semestersLeft, 5);
});

test('outlook: 이번 학기 계획 학점은 이수 예정으로 먼저 차감', () => {
  // 계획 18 → 남은 62, 학기당 기본도 계획값 18을 따른다 → ceil(62/18)=4
  const o = graduationOutlook({ earned: 50, required: 130, planned: 18 });
  assert.equal(o.afterPlan, 62);
  assert.equal(o.perSemester, 18);
  assert.equal(o.semestersLeft, 4);
  // 계획이 남은 학점을 다 채우면 추가 학기 0
  const full = graduationOutlook({ earned: 120, required: 130, planned: 12 });
  assert.equal(full.afterPlan, 0);
  assert.equal(full.semestersLeft, 0);
});

test('outlook: perSemester 지정 시 기본값 대신 적용 + 1~25 클램프', () => {
  const o = graduationOutlook({
    earned: 50,
    required: 130,
    planned: 0,
    perSemester: 10,
  });
  assert.equal(o.perSemester, 10);
  assert.equal(o.semestersLeft, 8);
  const hi = graduationOutlook({
    earned: 50,
    required: 130,
    planned: 0,
    perSemester: 40,
  });
  assert.equal(hi.perSemester, 25); // 상한
  const lo = graduationOutlook({
    earned: 50,
    required: 130,
    planned: 0,
    perSemester: 0,
  });
  assert.equal(lo.perSemester, 1); // 하한 — 0으로 나누기 방지
});

test('outlook: 학기 라벨로 졸업 시기와 현재 학년 추정', () => {
  // 2026-2에 5학기 남음 → 2029-1 이수 완료 전망
  const o = graduationOutlook({
    earned: 50,
    required: 130,
    planned: 0,
    semester: '2026-2',
    admitYear: 2025,
  });
  assert.equal(o.estLabel, '2029-1');
  assert.equal(o.gradeYear, 2); // 2025입학 → 2026-2는 2학년
  // 학기 미지정이면 추정 라벨 없이 학기 수만
  const noSem = graduationOutlook({ earned: 50, required: 130, planned: 0 });
  assert.equal(noSem.estLabel, undefined);
  assert.equal(noSem.gradeYear, undefined);
});

test('outlook: 이미 채웠으면 남은 0 — 추가 학기 없음', () => {
  const o = graduationOutlook({ earned: 135, required: 130, planned: 0 });
  assert.equal(o.remaining, 0);
  assert.equal(o.semestersLeft, 0);
});

// ---------- 학교 졸업가사정표(info.audit) 오버레이 ----------
const row = (area, required, earned, verdict) => ({ area, required, earned, verdict });

test('사정표 행이 기준·취득을 학교 값으로 교체하고 판정을 보존한다', () => {
  const base = evaluate([], [], {}, { admitYear: 2024, admissionType: 'freshman' });
  const out = applyAudit(base, [
    row('졸업학점', '130', '49', '미충족'),
    row('비교과 포인트', '800', '0', '미충족'),
  ]);
  const total = out.find((r) => r.rule.id === 'total');
  const points = out.find((r) => r.rule.id === 'points');
  assert.equal(total.required, 130);
  assert.equal(total.earned, 49);
  assert.equal(total.requiredSource, 'audit');
  assert.equal(total.auditVerdict, '미충족');
  assert.equal(total.status, 'progress'); // '미충족'은 '충족' 부분 매칭으로 met가 되면 안 됨
  assert.equal(points.earned, 0);
  assert.equal(points.auditVerdict, '미충족');
});

test('사정표 충족 판정은 미충족보다 먼저 확인하지 않는다', () => {
  const base = evaluate([], [], {}, { admitYear: 2024, admissionType: 'freshman' });
  const met = applyAudit(base, [row('졸업학점', '130', '140', '충족')])
    .find((r) => r.rule.id === 'total');
  assert.equal(met.status, 'met');
  const unmet = applyAudit(base, [row('졸업학점', '130', '140', '미충족')])
    .find((r) => r.rule.id === 'total');
  // 취득이 기준을 넘어도 학교 판정 '미충족'이면 미충족으로 표시
  assert.equal(unmet.status, 'progress');
});

test('사정표 천 단위 쉼표와 판정 없는 행은 숫자 비교로 판정한다', () => {
  const base = evaluate([], [], {}, { admitYear: 2024, admissionType: 'freshman' });
  const out = applyAudit(base, [row('졸업학점', '130', '1,230', '진행중')])
    .find((r) => r.rule.id === 'total');
  assert.equal(out.earned, 1230);
  assert.equal(out.status, 'met'); // 1230 >= 130
  assert.equal(out.auditVerdict, '진행중');
});

test('사정표 전공·교양 결합 행이 없으면 세부 행을 합산한다', () => {
  const base = evaluate([], [], {}, { admitYear: 2024, admissionType: 'freshman' });
  const out = applyAudit(base, [
    row('전공필수', '39', '12', '미충족'),
    row('전공선택', '39', '30', '미충족'),
    row('교양필수', '13', '10', '미충족'),
    row('선택필수교양', '15', '9', '미충족'),
    row('자율선택', '3', '3', '충족'),
  ]);
  const major = out.find((r) => r.rule.id === 'major');
  const gen = out.find((r) => r.rule.id === 'gen');
  assert.equal(major.required, 78); // 39 + 39
  assert.equal(major.earned, 42); // 12 + 30
  assert.equal(major.requiredSource, 'audit');
  assert.equal(major.status, 'progress');
  assert.equal(gen.required, 28); // 13 + 15 (+3은 자율선택 — parts 정규식 미포함)
  assert.equal(gen.earned, 19);
});

test('사정표 없으면 결과를 그대로 반환한다', () => {
  const base = evaluate([], [], {}, { admitYear: 2024, admissionType: 'freshman' });
  assert.equal(applyAudit(base, undefined), base);
  assert.equal(applyAudit(base, []), base);
});

test('사정표 행이 매칭되지 않거나 비숫자면 계산값을 유지한다', () => {
  const base = evaluate([], [], {}, { admitYear: 2024, admissionType: 'freshman' });
  const unrelated = applyAudit(base, [row('평균평점', '2.0', '3.1', '충족')]);
  for (const r of unrelated) {
    const orig = base.find((x) => x.rule.id === r.rule.id);
    // 평점 행은 어떤 규칙에도 매핑되지 않는다
    assert.equal(r.requiredSource, orig.requiredSource);
    assert.equal(r.auditVerdict, undefined);
  }
  // 비숫자 기준 행은 매칭돼도 required=null 유지 → 기존 'unknown' 보존
  const vague = applyAudit(base, [row('기타 졸업조건', '-', '-', '확인중')]);
  assert.equal(vague.find((r) => r.rule.id === 'majorReq').status, 'unknown');
});

test('사정표가 확정한 규칙은 재수강 추정 경고를 지운다', () => {
  // 동일 과목코드 중복 → uncertainCredits 유발
  const completed = [done('A1', '전선', 3), done('A1', '전선', 3)];
  const base = evaluate(completed, [], {}, { admitYear: 2024, admissionType: 'freshman' });
  assert.equal(base.find((r) => r.rule.id === 'total').uncertainCredits, true);
  const out = applyAudit(base, [row('졸업학점', '130', '60', '미충족')]);
  const total = out.find((r) => r.rule.id === 'total');
  assert.equal(total.uncertainCredits, undefined);
  assert.equal(total.earned, 60);
});
