import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageDays,
  isStale,
  staleLabel,
  shouldAutoRefreshSchool,
} from '../lib/data/freshness.ts';

test('shouldAutoRefreshSchool: 오래된 학교 확인만 자동 재수집하고 진행 중·쿨다운은 건너뛴다', () => {
  const now = Date.parse('2026-11-13T12:00:00+09:00');
  const at = (minutes) => new Date(now - minutes * 60e3).toISOString();
  assert.equal(shouldAutoRefreshSchool({ checkedAt: at(10), pending: false, now }), false);
  assert.equal(shouldAutoRefreshSchool({ checkedAt: at(31), pending: false, now }), true);
  assert.equal(shouldAutoRefreshSchool({ checkedAt: at(90), pending: true, now }), false);
  assert.equal(shouldAutoRefreshSchool({ checkedAt: at(90), pending: false, lastAttempt: now - 5 * 60e3, now }), false);
  assert.equal(shouldAutoRefreshSchool({ checkedAt: at(90), pending: false, lastAttempt: now - 40 * 60e3, now }), true);
  assert.equal(shouldAutoRefreshSchool({ checkedAt: 'bad', pending: false, now }), true);
  assert.equal(shouldAutoRefreshSchool({ checkedAt: undefined, pending: false, lastAttempt: NaN, now }), true);
});

const NOW = Date.parse('2026-10-09T12:00:00+09:00');

test('ageDays: 경과 일수 계산 — 같은 날은 0', () => {
  assert.equal(ageDays('2026-10-09T01:00:00+09:00', NOW), 0);
  assert.equal(ageDays('2026-09-25T12:00:00+09:00', NOW), 14);
});

test('ageDays: 파싱 불가·빈 값은 null, 미래 시각은 0', () => {
  assert.equal(ageDays('not-a-date', NOW), null);
  assert.equal(ageDays('', NOW), null);
  assert.equal(ageDays(null, NOW), null);
  assert.equal(ageDays(undefined, NOW), null);
  assert.equal(ageDays('2026-10-10T00:00:00+09:00', NOW), 0);
});

test('isStale: 기본 14일 기준 — 13일은 신선, 14일은 stale', () => {
  assert.equal(isStale('2026-09-26T12:00:00+09:00', NOW), false);
  assert.equal(isStale('2026-09-25T12:00:00+09:00', NOW), true);
  assert.equal(isStale('bad', NOW), false); // 판정 불가는 경고하지 않음
});

test('isStale: 임계일 인자 적용 — LMS 7일', () => {
  assert.equal(isStale('2026-10-02T12:00:00+09:00', NOW, 7), true);
  assert.equal(isStale('2026-10-03T12:00:00+09:00', NOW, 7), false);
  assert.equal(isStale('2026-10-03T12:00:00+09:00', NOW, 14), false);
});

test('staleLabel: 신선하면 null, 오래되면 경과 일수 문구', () => {
  assert.equal(staleLabel('2026-10-05T12:00:00+09:00', NOW), null);
  assert.equal(staleLabel(null, NOW), null);
  assert.equal(
    staleLabel('2026-09-25T12:00:00+09:00', NOW),
    '14일 전 수집',
  );
});
