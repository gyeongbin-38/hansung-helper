import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseScheduleMonth,
  isScheduleAnomalous,
} from '../lib/data/schedule.ts';
import snapshot from '../lib/data/schedule.json' with { type: 'json' };

const fixture = readFileSync('tests/fixtures/hs-schedule-m3.html', 'utf-8');

test('parser extracts date|title rows from real 학사일정 markup', () => {
  const events = parseScheduleMonth(fixture);
  assert.equal(events.length, 7);

  const single = events.find((e) => e.title === '개강');
  assert.ok(single, '개강 parsed');
  assert.equal(single.start, '2026-03-03');
  assert.equal(single.end, null);

  const ranged = events.find((e) => e.title.includes('수강신청 정정'));
  assert.ok(ranged, 'range event parsed');
  assert.equal(ranged.start, '2026-03-03');
  assert.equal(ranged.end, '2026-03-09');
});

test('parser ignores non-event rows and fabricates nothing', () => {
  const events = parseScheduleMonth(fixture);
  for (const e of events) {
    assert.match(e.start, /^2026-\d{2}-\d{2}$/);
    assert.ok(e.title.length > 0);
    assert.ok(e.id.startsWith('sch-'));
    if (e.end) assert.match(e.end, /^20\d{2}-\d{2}-\d{2}$/);
  }
  assert.equal(parseScheduleMonth('<table></table>').length, 0);
});

test('anomaly check keeps last-known-good on empty/dropped collection', () => {
  const prev = {
    source: 'hansung-homepage',
    sourceUrl: '',
    fetchedAt: '',
    eventCount: 70,
    items: [{}],
  };
  assert.ok(isScheduleAnomalous({ ...prev, eventCount: 0, items: [] }, prev));
  assert.ok(
    isScheduleAnomalous({ ...prev, eventCount: 10, items: Array(10).fill({}) }, prev),
  );
  assert.equal(isScheduleAnomalous({ ...prev, items: prev.items }, prev), null);
  assert.equal(isScheduleAnomalous({ ...prev, eventCount: 3 }, null), null);
});

test('snapshot integrity: unique ids, ISO dates, provenance', () => {
  assert.equal(snapshot.source, 'hansung-homepage');
  assert.ok(snapshot.fetchedAt.length > 0);
  assert.equal(snapshot.eventCount, snapshot.items.length);
  const ids = new Set(snapshot.items.map((i) => i.id));
  assert.equal(ids.size, snapshot.items.length);
  for (const i of snapshot.items) {
    assert.match(i.start, /^\d{4}-\d{2}-\d{2}$/);
    if (i.end) assert.match(i.end, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(i.title.length > 0);
  }
});
