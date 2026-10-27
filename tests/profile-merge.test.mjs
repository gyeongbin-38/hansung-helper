import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProfile } from '../lib/data/profile-merge.ts';

// 3-way 프로필 병합 — 다른 기기가 먼저 저장해 409가 난 경우와
// 같은 탭의 연속 쓰기가 서로를 덮지 않게 하는 클라이언트 병합기.
// base = 마지막 동기 상태, local = 내 쓰기, remote = 서버 현재 상태.

const base = {
  name: '한성인',
  year: '2025',
  dept: 'AI응용학과',
  credits: '50',
  points: '100',
  saved: ['a1'],
  planned: ['s1'],
  plans: { A: ['s1'] },
  completed: [{ code: 'C1', name: '과목1', category: '전선', credits: 3 }],
  ruleOverrides: {},
  events: [{ title: '상담', date: '2026-10-01' }],
  prefs: ['전공 심화'],
  actPrefs: ['팀 활동'],
  actStatus: { 'hs-1': 'applied' },
  extActivities: [
    {
      id: 'ext-1',
      title: '공모전',
      org: 'x',
      applyStart: '',
      applyEnd: '',
      runStart: '',
      runEnd: '',
      points: '30',
      url: '',
      addedAt: 't',
    },
  ],
  readIds: ['n1'],
  reqChecks: ['capstone'],
  notifiedIds: ['d1'],
  notifEnabled: false,
  lmsMatch: { 'crs-1': 'sec-1' },
  lms: { fetchedAt: 't0' },
  info: { fetchedAt: 't0', name: '한성인' },
  consent: true,
  rev: 5,
};
const d = (over) => ({ ...base, ...over });

test('양쪽 추가분은 모두 살아난다 — 집합 병합', () => {
  const merged = mergeProfile(
    d(),
    d({ saved: ['a1', 'a2'] }), // 내가 a2 추가
    d({ saved: ['a1', 'a3'], rev: 6 }), // 다른 기기가 a3 추가
  );
  assert.deepEqual(new Set(merged.saved), new Set(['a1', 'a2', 'a3']));
});

test('내가 지운 항목은 remote에 남아 있어도 삭제된다', () => {
  const merged = mergeProfile(
    d({ saved: ['a1', 'a2'] }),
    d({ saved: ['a1'] }), // 내가 a2 삭제
    d({ saved: ['a1', 'a2', 'a3'] }), // remote는 a2를 남기고 a3 추가
  );
  assert.deepEqual(new Set(merged.saved), new Set(['a1', 'a3']));
});

test('remote가 지우고 내가 안 건드린 항목은 remote 삭제를 따른다', () => {
  const merged = mergeProfile(
    d({ saved: ['a1', 'a2'] }),
    d({ saved: ['a1', 'a2'] }), // 나는 그대로
    d({ saved: ['a1'] }), // remote가 a2 삭제
  );
  assert.deepEqual(merged.saved, ['a1']);
});

test('스칼라는 local 변경분만 우선 — 손대지 않은 필드는 remote 값', () => {
  const merged = mergeProfile(
    d(),
    d({ points: '150' }), // 나는 포인트만 수정
    d({ dept: '컴퓨터공학부', year: '2024' }), // remote는 소속·연도 수정
  );
  assert.equal(merged.points, '150'); // 내 변경 유지
  assert.equal(merged.dept, '컴퓨터공학부'); // remote 변경 보존
  assert.equal(merged.year, '2024');
});

test('스칼라 양쪽 변경 시 local 우선 — 사용자가 방금 쓴 값', () => {
  const merged = mergeProfile(d(), d({ points: '200' }), d({ points: '300' }));
  assert.equal(merged.points, '200');
});

test('레코드 필드는 키 단위 3-way — 양쪽 키 변경이 공존', () => {
  const merged = mergeProfile(
    d(),
    d({ actStatus: { 'hs-1': 'joined' } }), // 내가 단계 갱신
    d({ actStatus: { 'hs-1': 'applied', 'hs-9': 'done' } }), // remote가 새 키
  );
  assert.equal(merged.actStatus['hs-1'], 'joined'); // 내 갱신 우선
  assert.equal(merged.actStatus['hs-9'], 'done'); // remote 키 보존
  // 내가 지운 키는 삭제
  const del = mergeProfile(
    d(),
    d({ actStatus: {} }),
    d({ actStatus: { 'hs-1': 'done' } }),
  );
  assert.equal(del.actStatus['hs-1'], undefined);
});

test('plans 시나리오도 키 단위 — local 수정본과 remote 신규 안 공존', () => {
  const merged = mergeProfile(
    d(),
    d({ plans: { A: ['s1', 's2'] } }),
    d({ plans: { A: ['s1'], B: ['s9'] } }),
  );
  assert.deepEqual(merged.plans.A, ['s1', 's2']);
  assert.deepEqual(merged.plans.B, ['s9']);
});

test('completed·events·extActivities는 키 기준 집합 병합', () => {
  const merged = mergeProfile(
    d(),
    d({
      completed: [
        ...base.completed,
        { code: 'C2', name: '과목2', category: '전필', credits: 3 },
      ],
      events: [...base.events, { title: '특강', date: '2026-10-05' }],
    }),
    d({
      completed: [
        ...base.completed,
        { code: 'C3', name: '과목3', category: '교양', credits: 2 },
      ],
      events: [...base.events, { title: 'OT', date: '2026-09-01' }],
      extActivities: [],
    }),
  );
  assert.equal(merged.completed.length, 3); // C1+C2+C3
  assert.equal(merged.events.length, 3); // 상담+특강+OT
  assert.equal(merged.extActivities.length, 0); // remote가 지움
});

test('서버 관리 필드는 항상 remote — lms·info·consent·rev', () => {
  const merged = mergeProfile(
    d(),
    d({
      lms: { fetchedAt: 'local-new' },
      info: { fetchedAt: 'local-new', name: 'x' },
      rev: 99,
      name: '내가바꿈',
    }),
    d({
      lms: { fetchedAt: 'remote' },
      info: { fetchedAt: 'remote', name: 'x' },
      rev: 7,
    }),
  );
  assert.equal(merged.lms.fetchedAt, 'remote');
  assert.equal(merged.info.fetchedAt, 'remote');
  assert.equal(merged.rev, 7);
  assert.equal(merged.name, '내가바꿈'); // 사용자 필드는 병합 대상
});

test('읽음·알림·체크 배열도 집합 병합 — notifiedIds 유실 방지', () => {
  const merged = mergeProfile(
    d(),
    d({ readIds: ['n1', 'n2'], notifiedIds: ['d1', 'd2'] }),
    d({ readIds: ['n1', 'n3'], notifiedIds: ['d1', 'd3'] }),
  );
  assert.deepEqual(new Set(merged.readIds), new Set(['n1', 'n2', 'n3']));
  assert.deepEqual(new Set(merged.notifiedIds), new Set(['d1', 'd2', 'd3']));
});

test('같은 탭 연속 쓰기 — 내 변경이 직전 저장(remote) 위에 얹힌다', () => {
  // persist 큐 시나리오: 첫 저장이 끝난 상태(synced=S0+A)에서
  // 두 번째 쓰기는 stale next(S0+B)를 들고 온다 → 병합하면 둘 다 보존
  const s0 = d({ saved: ['a1'] });
  const synced = d({ saved: ['a1', 'a2'] }); // 첫 저장 결과
  const staleNext = { ...s0, saved: ['a1', 'a3'] }; // 두 번째 쓰기(구 data 기준)
  const merged = mergeProfile(s0, staleNext, synced);
  assert.deepEqual(new Set(merged.saved), new Set(['a1', 'a2', 'a3']));
});
