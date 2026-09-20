import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProgramList,
  isAnomalous,
  activityMatch,
  liveStatus,
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
