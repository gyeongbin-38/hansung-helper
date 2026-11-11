import assert from 'node:assert/strict';
import { dateDeadlineDays, deadlineDays, isUpcomingUrgent } from '../lib/data/home-deadlines.ts';

const now = Date.parse('2026-11-11T14:30:00Z'); // 11월 11일 23:30 KST
const today = Date.parse('2026-11-11T14:45:00Z');
const tomorrow = Date.parse('2026-11-11T15:10:00Z');
assert.equal(deadlineDays(today, now), 0);
assert.equal(deadlineDays(tomorrow, now), 1);
assert.equal(dateDeadlineDays('2026-11-11', now), 0);
assert.equal(dateDeadlineDays('2026-11-12', now), 1);
assert.equal(dateDeadlineDays('2026-02-30', now), null);
assert.equal(isUpcomingUrgent({ dueTs: today }, now), true);
assert.equal(isUpcomingUrgent({ dueTs: tomorrow }, now), true);
assert.equal(isUpcomingUrgent({ dueTs: now - 1 }, now), false);
assert.equal(isUpcomingUrgent({ dueTs: today, uncertain: true }, now), false);
console.log('home deadlines: KST dates, expired and uncertain status handled');
