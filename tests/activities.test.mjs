import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProgramList,
  isAnomalous,
  activityMatch,
  liveStatus,
  actScore,
  pointScore,
  extToActivity,
  ACT_STAGES,
} from '../lib/data/activities.ts';
import { koreanMatch } from '../lib/data/hangul.ts';
import snapshot from '../lib/data/activities.json' with { type: 'json' };

const fixture = readFileSync('tests/fixtures/hsportal-list.html', 'utf-8');

test('parser extracts card fields from real hsportal markup', () => {
  const { items, pageTotal } = parseProgramList(fixture);
  assert.equal(items.length, 3);
  assert.equal(pageTotal, 4);

  const one = items.find((i) => i.key === '14107');
  assert.ok(one, 'card 14107 parsed');
  assert.equal(one.id, 'hs-14107');
  assert.match(one.title, /KESCO/);
  assert.equal(one.dept, '행정부서 글로컬협력처');
  assert.equal(one.status, 'upcoming');
  assert.equal(one.statusLabel, '접수예정');
  assert.equal(one.points, 30);
  assert.equal(one.team, '개인');
  assert.equal(one.applicants, 11);
  assert.equal(one.certified, true);
  assert.match(one.applyStart ?? '', /^2026-09-15/);
  assert.match(one.applyEnd ?? '', /^2026-09-18/);
  // date_layer 라벨 기준 매핑 — 카드 헤더의 운영 시각이 신청으로 들어오면 안 됨
  assert.match(one.runStart ?? '', /^2026-09-30T06:30/);
  assert.match(one.runEnd ?? '', /^2026-09-30T18:00/);
  assert.match(one.cover ?? '', /attachment\/view\/88716/);
  assert.equal(
    one.url,
    'https://hsportal.hansung.ac.kr/ko/program/all/view/14107',
  );
});

test('parser maps status classes and dedupes nothing fabricated', () => {
  const { items } = parseProgramList(fixture);
  for (const i of items) {
    assert.ok(['upcoming', 'open', 'closing', 'running', 'closed'].includes(i.status));
    assert.ok(i.title && i.key);
    assert.ok(!i.url.includes('undefined'));
  }
});

test('card without 신청 layer leaves apply fields null', () => {
  // 신청 date_layer를 제거해도 운영 시각이 apply로 새지 않아야 한다.
  const stripped = fixture.replace(
    /<small class="date_layer">\s*<i class="xi xi-calendar"><\/i>\s*<span class="date_title">신청:<\/span>[\s\S]*?<\/small>/g,
    '',
  );
  const { items } = parseProgramList(stripped);
  const one = items.find((i) => i.key === '14107');
  assert.ok(one, 'card still parses');
  assert.equal(one.applyStart, null);
  assert.equal(one.applyEnd, null);
  assert.match(one.runStart ?? '', /^2026-09-30/);
});

test('anomaly check keeps last-known-good on empty/dropped collection', () => {
  const prev = {
    source: 'hsportal',
    sourceUrl: '',
    fetchedAt: '',
    itemCount: 39,
    items: [{}],
  };
  assert.ok(isAnomalous({ ...prev, itemCount: 0, items: [] }, prev));
  assert.ok(isAnomalous({ ...prev, itemCount: 5, items: [{}, {}, {}, {}, {}] }, prev));
  assert.equal(
    isAnomalous({ ...prev, itemCount: 39, items: prev.items }, prev),
    null,
  );
  assert.equal(
    isAnomalous({ ...prev, itemCount: 5, items: [{}, {}, {}, {}, {}] }, null),
    null,
  );
});

test('snapshot integrity: unique keys, real urls, provenance', () => {
  assert.equal(snapshot.source, 'hsportal');
  assert.ok(snapshot.fetchedAt.length > 0);
  const keys = new Set(snapshot.items.map((i) => i.key));
  assert.equal(keys.size, snapshot.items.length);
  assert.equal(snapshot.itemCount, snapshot.items.length);
  for (const i of snapshot.items) {
    assert.ok(i.id === 'hs-' + i.key);
    assert.ok(i.url.startsWith('https://hsportal.hansung.ac.kr/'));
    assert.ok(i.title.length > 0);
  }
});

test('activityMatch searches title/dept/status via koreanMatch', () => {
  const a = snapshot.items[0];
  assert.ok(activityMatch(a, a.title.slice(0, 4), koreanMatch));
  assert.ok(!activityMatch(a, 'zzzznomatch', koreanMatch));
});

// ── liveStatus — 신청 기간+현재 시각으로 상태 재계산 ─────────
// QA 기준 시나리오: 2026-09-21 시점에 9/20 종료 활동이 '마감임박 D-2'로
// 남으면 안 된다 — 스냅샷 문자열이 아니라 날짜로 판정해야 한다.
const base = {
  id: 'hs-t', key: 't', title: 't', dept: 'x',
  status: 'closing', statusLabel: '마감임박', dday: 'D-2',
  applyStart: null, applyEnd: null,
  runStart: null, runEnd: null,
  points: null, team: null, applicants: null, capacity: null,
  certified: false, url: '', cover: null,
};
const NOW21 = Date.parse('2026-09-21T02:05:00+09:00');

test('liveStatus: 신청 마감 경과 → 마감 (D-2 스냅샷 무시)', () => {
  const a = {
    ...base,
    applyStart: '2026-09-14T00:00:00+09:00',
    applyEnd: '2026-09-20T23:45:00+09:00',
  };
  const s = liveStatus(a, NOW21);
  assert.equal(s.status, 'closed');
  assert.equal(s.label, '마감');
  assert.equal(s.dday, '마감');
});

test('liveStatus: 신청 시작 전 → 접수예정', () => {
  const a = {
    ...base,
    status: 'open', statusLabel: '접수중',
    applyStart: '2026-09-25T00:00:00+09:00',
    applyEnd: '2026-10-05T23:59:00+09:00',
  };
  const s = liveStatus(a, NOW21);
  assert.equal(s.status, 'upcoming');
  assert.equal(s.label, '접수예정');
});

test('liveStatus: 접수 중 마감 7일 이내 → 마감임박 + D-n', () => {
  const a = {
    ...base,
    applyStart: '2026-09-14T00:00:00+09:00',
    applyEnd: '2026-09-25T23:59:00+09:00',
  };
  const s = liveStatus(a, NOW21);
  assert.equal(s.status, 'closing');
  assert.equal(s.label, '마감임박');
  assert.equal(s.dday, 'D-4'); // 9/21 → 9/25 캘린더 4일
});

test('liveStatus: 마감 당일 → 오늘 마감', () => {
  const a = {
    ...base,
    applyStart: '2026-09-14T00:00:00+09:00',
    applyEnd: '2026-09-21T23:59:00+09:00',
  };
  const s = liveStatus(a, NOW21);
  assert.equal(s.status, 'closing');
  assert.equal(s.dday, '오늘 마감');
});

test('liveStatus: 접수 중 마감 7일 초과 → 접수중', () => {
  const a = {
    ...base,
    applyStart: '2026-09-14T00:00:00+09:00',
    applyEnd: '2026-10-20T23:59:00+09:00',
  };
  const s = liveStatus(a, NOW21);
  assert.equal(s.status, 'open');
  assert.equal(s.dday, 'D-29');
});

test('liveStatus: 신청 기간 없으면 스냅샷 값 유지(추측 금지)', () => {
  const s = liveStatus(base, NOW21);
  assert.equal(s.status, 'closing');
  assert.equal(s.label, '마감임박');
  assert.equal(s.dday, 'D-2');
});

test('liveStatus: 파싱 불가 날짜는 스냅샷 유지', () => {
  const a = { ...base, applyStart: 'garbage', applyEnd: 'also-bad' };
  const s = liveStatus(a, NOW21);
  assert.equal(s.status, 'closing');
});

// ── actScore — 비교과 취향 설문 → 규칙 기반 적합도 ─────────
// NOW21 시점 접수 중(마감 10/20) 활동으로 고정해 상태 가산을 예측 가능하게 한다.
const openBase = {
  ...base,
  status: 'open',
  statusLabel: '접수중',
  applyStart: '2026-09-14T00:00:00+09:00',
  applyEnd: '2026-10-20T23:59:00+09:00',
};

test('actScore: 설문 미응답 → 0점·근거 없음', () => {
  assert.deepEqual(actScore(openBase, undefined, NOW21), {
    score: 0,
    reasons: [],
  });
  assert.deepEqual(actScore(openBase, [], NOW21), { score: 0, reasons: [] });
  assert.deepEqual(actScore(openBase, ['상관없음'], NOW21), {
    score: 0,
    reasons: [],
  });
});

test('actScore: 개인/팀 선호가 team 필드에 반영', () => {
  const solo = { ...openBase, team: '개인' };
  const team = { ...openBase, team: '팀' };
  assert.equal(actScore(solo, ['개인 활동'], NOW21).score, 2);
  assert.equal(actScore(solo, ['팀 활동'], NOW21).score, 0);
  assert.equal(actScore(team, ['팀 활동'], NOW21).score, 2);
  assert.ok(
    actScore(team, ['팀 활동'], NOW21).reasons.includes('팀 활동'),
  );
});

test('actScore: 졸업 포인트 목표는 포인트·인재인증에 가산', () => {
  const pts = { ...openBase, points: 20, certified: true };
  const noPts = { ...openBase, points: null };
  const s = actScore(pts, ['졸업 포인트 채우기'], NOW21);
  assert.equal(s.score, 3); // 포인트 2 + 인증 1
  assert.deepEqual(s.reasons, ['포인트 활동', '인재인증']);
  assert.equal(actScore(noPts, ['졸업 포인트 채우기'], NOW21).score, 0);
});

test('actScore: 활동 유형 키워드 매칭', () => {
  const lecture = { ...openBase, title: '취업 특강 시리즈' };
  const contest = { ...openBase, title: '데이터분석 공모전' };
  const volunteer = { ...openBase, title: '해외 봉사단 모집' };
  assert.equal(
    actScore(lecture, ['특강·멘토링'], NOW21).score,
    2,
  );
  assert.equal(
    actScore(contest, ['공모전·대회'], NOW21).score,
    2,
  );
  assert.equal(
    actScore(volunteer, ['봉사·교류'], NOW21).score,
    2,
  );
  assert.equal(
    actScore(lecture, ['공모전·대회'], NOW21).score,
    0,
  );
});

test('actScore: 일정·포인트 선호 가산', () => {
  const closing = { ...openBase, applyEnd: '2026-09-25T23:59:00+09:00' };
  assert.equal(
    actScore(closing, ['마감 임박한 것부터'], NOW21).score,
    2,
  );
  assert.equal(
    actScore(openBase, ['마감 임박한 것부터'], NOW21).score,
    1,
  );
  const highPts = { ...openBase, points: 40 };
  const lowPts = { ...openBase, points: 10 };
  assert.equal(
    actScore(highPts, ['높은 포인트 우선'], NOW21).score,
    2,
  );
  assert.equal(
    actScore(lowPts, ['높은 포인트 우선'], NOW21).score,
    1,
  );
});

test('actScore: 복수 답변은 가중치 누적·근거 중복 제거', () => {
  const a = {
    ...openBase,
    team: '팀',
    points: 50,
    certified: true,
    title: '인재인증 팀 프로젝트 공모전',
  };
  const s = actScore(
    a,
    ['졸업 포인트 채우기', '공모전·대회', '팀 활동', '높은 포인트 우선'],
    NOW21,
  );
  // 2+1(포인트+인증) + 2(공모전) + 2(팀) + 2(높은포인트) = 9
  assert.equal(s.score, 9);
  assert.equal(new Set(s.reasons).size, s.reasons.length);
});

test('actScore: 실제 스냅샷 아이템에도 적용 가능', () => {
  const teamItem = snapshot.items.find((i) => i.team === '팀');
  assert.ok(teamItem, 'snapshot has team activity');
  const s = actScore(teamItem, ['팀 활동'], NOW21);
  assert.ok(s.score >= 2);
  assert.ok(s.reasons.includes('팀 활동'));
});

// ── extToActivity / ACT_STAGES — 직접 등록 활동 ──────────────
const extBase = {
  id: 'ext-abc1',
  title: '데이터분석 공모전',
  org: '00재단',
  applyStart: '2026-09-14',
  applyEnd: '2026-09-25',
  runStart: '2026-10-01',
  runEnd: '2026-10-31',
  points: '50',
  url: 'https://contest.example.com',
  addedAt: '2026-09-10T00:00:00.000Z',
};

test('extToActivity: 날짜를 KST 시각으로 변환 — 종료일은 23:59', () => {
  const a = extToActivity(extBase);
  assert.equal(a.id, 'ext-abc1');
  assert.equal(a.dept, '00재단');
  assert.equal(a.statusLabel, '직접 등록');
  assert.equal(a.points, 50);
  assert.equal(a.applyStart, '2026-09-14T09:00:00+09:00');
  assert.equal(a.applyEnd, '2026-09-25T23:59:59+09:00');
  assert.equal(a.url, 'https://contest.example.com');
  assert.equal(a.cover, null);
});

test('extToActivity: 마감 당일에 liveStatus가 오늘 마감으로 판정', () => {
  const a = extToActivity(extBase);
  // 2026-09-25 15:00 KST — applyEnd 23:59 이전이라 아직 접수중이어야 함
  const s = liveStatus(a, Date.parse('2026-09-25T15:00:00+09:00'));
  assert.equal(s.status, 'closing');
  assert.equal(s.dday, '오늘 마감');
  // 다음 날은 마감
  assert.equal(
    liveStatus(a, Date.parse('2026-09-26T00:00:00+09:00')).status,
    'closed',
  );
});

test('extToActivity: 날짜 없으면 추측하지 않고 직접 등록 상태 유지', () => {
  const a = extToActivity({
    ...extBase,
    applyStart: '',
    applyEnd: '',
    runStart: '',
    runEnd: '',
    points: 'abc',
  });
  const s = liveStatus(a, NOW21);
  assert.equal(s.status, 'unknown');
  assert.equal(s.label, '직접 등록');
  assert.equal(a.points, null); // 비숫자 → null (지어내지 않음)
});

test('extToActivity: org 비어도 dept 폴백', () => {
  const a = extToActivity({ ...extBase, org: '' });
  assert.equal(a.dept, '직접 등록');
});

test('ACT_STAGES: 순서·라벨 고정 — UI 스테퍼가 의존', () => {
  assert.deepEqual(
    ACT_STAGES.map(([k]) => k),
    ['applied', 'joined', 'done', 'credited'],
  );
  assert.deepEqual(
    ACT_STAGES.map(([, l]) => l),
    ['신청함', '참여 중', '수료', '포인트 확인'],
  );
});

// ── pointScore — 졸업 포인트 결핍 기반 추천 ─────────────────
// deficit은 졸업요건 페이지의 '남은 포인트'. 신청 가능한 포인트
// 부여 활동만 점수를 받고, 무관한 활동은 0으로 걸러진다.

test('pointScore: 결핍 없음(<=0)이면 0점 — 추천할 이유가 없다', () => {
  const pts = { ...openBase, points: 50 };
  assert.deepEqual(pointScore(pts, 0, NOW21), { score: 0, reasons: [] });
  assert.deepEqual(pointScore(pts, -10, NOW21), { score: 0, reasons: [] });
});

test('pointScore: 신청 불가 상태·무포인트는 제외', () => {
  const pts = { ...openBase, points: 50 };
  const running = { ...pts, applyStart: null, applyEnd: null, status: 'running' };
  assert.equal(pointScore(running, 100, NOW21).score, 0);
  const closed = {
    ...pts,
    applyStart: '2026-09-01T00:00:00+09:00',
    applyEnd: '2026-09-10T23:59:00+09:00',
  };
  assert.equal(pointScore(closed, 100, NOW21).score, 0);
  // 포인트가 없으면 결핍 해소에 기여하지 않으므로 제외
  assert.equal(pointScore({ ...openBase, points: null }, 100, NOW21).score, 0);
  assert.equal(pointScore({ ...openBase, points: 0 }, 100, NOW21).score, 0);
});

test('pointScore: 접수 중 포인트 활동은 점수+포인트 근거 표시', () => {
  const s = pointScore({ ...openBase, points: 30 }, 100, NOW21);
  assert.ok(s.score > 0);
  assert.ok(s.reasons.includes('포인트 +30'));
  assert.ok(s.reasons.includes('접수 중'));
  // 결핍을 못 채우는 소액이면 '한 번에 충족' 근거는 없다
  assert.ok(!s.reasons.includes('부족분 한 번에 충족'));
});

test('pointScore: 결핍 전부 커버·마감임박·인증이 가산된다', () => {
  const big = pointScore({ ...openBase, points: 100 }, 100, NOW21);
  assert.ok(big.reasons.includes('부족분 한 번에 충족'));
  const closing = {
    ...openBase,
    points: 30,
    applyEnd: '2026-09-25T23:59:00+09:00', // NOW21 기준 마감임박
  };
  const s = pointScore(closing, 100, NOW21);
  assert.ok(s.reasons.includes('마감 임박'));
  // 마감임박은 같은 포인트의 접수중보다 앞에 온다
  const openSame = pointScore({ ...openBase, points: 30 }, 100, NOW21);
  assert.ok(s.score > openSame.score);
  const cert = pointScore({ ...openBase, points: 30, certified: true }, 100, NOW21);
  assert.ok(cert.reasons.includes('인재인증'));
  assert.ok(cert.score > openSame.score);
});

test('pointScore: 접수예정도 낮은 점수로 후보에 포함', () => {
  const upcoming = {
    ...openBase,
    points: 30,
    applyStart: '2026-09-30T00:00:00+09:00',
    applyEnd: '2026-10-10T23:59:00+09:00',
  };
  const s = pointScore(upcoming, 100, NOW21);
  assert.ok(s.score > 0);
  assert.ok(s.reasons.includes('곧 접수'));
  // 접수 중보다는 낮은 우선순위
  const openSame = pointScore({ ...openBase, points: 30 }, 100, NOW21);
  assert.ok(s.score < openSame.score);
});
