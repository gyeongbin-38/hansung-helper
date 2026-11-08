import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionStatus } from '../lib/data/collection-status.ts';

const now = Date.parse('2026-11-08T12:00:00Z');
const fresh = { hasData: true, fetchedAt: new Date(now).toISOString() };

test('인증 확인을 수집 성공으로 표시하지 않는다', () => {
  assert.equal(
    collectionStatus({ hasData: false, connected: true }, now).label,
    '가져온 정보 없음',
  );
  assert.equal(
    collectionStatus({ hasData: false, connected: false }, now).label,
    '미연결',
  );
});

test('수집 중에도 이전 자료 유무를 구분하고 지연·시각 미상을 안내한다', () => {
  const pending = {
    ...fresh,
    pending: true,
    startedAt: new Date(now - 30000).toISOString(),
  };
  assert.equal(collectionStatus(pending, now).label, '수집 중');
  assert.match(collectionStatus(pending, now).detail, /기존에 가져온 정보/);
  assert.doesNotMatch(
    collectionStatus({ ...pending, hasData: false }, now).detail,
    /기존에 가져온 정보/,
  );
  for (const startedAt of [
    undefined,
    'invalid',
    new Date(now - 120000).toISOString(),
    new Date(now + 1000).toISOString(),
  ]) {
    assert.equal(
      collectionStatus({ ...pending, startedAt }, now).label,
      '수집 상태 확인 필요',
    );
  }
});

test('실패 표시가 남은 pending과 이전 자료를 수집 성공으로 오해하지 않게 한다', () => {
  const status = collectionStatus(
    { ...fresh, failed: true, pending: true },
    now,
  );
  assert.equal(status.label, '최근 수집 실패');
  assert.equal(status.warning, true);
  assert.match(status.detail, /기존에 가져온 정보/);
});

test('방금 받은 데이터라도 부분 실패는 별도로 안내한다', () => {
  const status = collectionStatus({ ...fresh, partial: true }, now);
  assert.equal(status.label, '일부 항목 확인 필요');
  assert.equal(status.warning, true);
});

test('24시간 경계와 잘못된·미래 수집 시각을 구분한다', () => {
  assert.equal(
    collectionStatus(
      { ...fresh, fetchedAt: new Date(now - 86400000).toISOString() },
      now,
    ).label,
    '현재 정보 재확인 필요',
  );
  assert.equal(
    collectionStatus(
      {
        ...fresh,
        fetchedAt: new Date(now - 86400000).toISOString(),
        staleAfterDays: 14,
      },
      now,
    ).label,
    '수집본 있음',
  );
  for (const fetchedAt of ['', 'invalid', new Date(now + 1000).toISOString()]) {
    assert.equal(
      collectionStatus({ ...fresh, fetchedAt }, now).label,
      '수집 시각 확인 필요',
    );
  }
});

test('수집본이 있어도 현재 학교 상태를 확인했다고 단정하지 않는다', () => {
  const status = collectionStatus(fresh, now);
  assert.equal(status.label, '수집본 있음');
  assert.equal(status.warning, false);
  assert.match(status.detail, /이후 변경/);
});
