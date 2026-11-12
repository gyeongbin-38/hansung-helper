import test from 'node:test';
import assert from 'node:assert/strict';
import { gettingStarted } from '../lib/data/getting-started.ts';

const blank = { dept: '소속 미입력', year: '', completed: [] };
test('학적 → 이수 내역 → 추천 확인 순서로 진행한다', () => {
  assert.equal(gettingStarted(blank).current, 0);
  const profile = { ...blank, dept: '컴퓨터공학부', year: '2025' };
  assert.equal(gettingStarted(profile).current, 1);
  assert.equal(gettingStarted({ ...profile, completed: [{ code: 'x' }] }).current, 2);
  assert.equal(gettingStarted({ ...profile, info: { completed: [{}] } }).current, 2);
  assert.equal(gettingStarted({ ...profile, setupHistory: 'none' }).current, 2);
  assert.equal(gettingStarted({ ...profile, setupHistory: 'later' }).current, 2);
  assert.equal(gettingStarted({ ...profile, setupHistory: 'later', recommendationsSeen: true }).current, 3);
});

test('추천을 봤더라도 학적이나 이수 내역 확인이 빠지면 해당 단계부터 안내한다', () => {
  assert.equal(gettingStarted({ ...blank, recommendationsSeen: true }).current, 0);
  assert.equal(gettingStarted({ ...blank, dept: '컴퓨터공학부', year: '2025', recommendationsSeen: true }).current, 1);
  assert.equal(gettingStarted({ ...blank, dept: '  ', year: '2025' }).current, 0);
});
