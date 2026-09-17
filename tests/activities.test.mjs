import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProgramList,
  isAnomalous,
  activityMatch,
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
  assert.match(one.applyStart ?? '', /^2026-09-30/);
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
