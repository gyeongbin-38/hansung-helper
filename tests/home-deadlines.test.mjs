import assert from 'node:assert/strict';
import { dateDeadlineDays, deadlineDays, isUpcomingUrgent, needsApplication, scheduleDeadlineKind } from '../lib/data/home-deadlines.ts';

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
assert.equal(needsApplication(undefined, 'a'), true);
for (const stage of ['applied', 'joined', 'done', 'credited'])
  assert.equal(needsApplication({ a: stage }, 'a'), false);
assert.equal(needsApplication({ a: 'applied' }, 'b'), true);

// 학사일정 분류 — 긴 신청 창구는 45일, 일반은 7일
assert.deepEqual(scheduleDeadlineKind('졸업예정자 학사학위취득 유예신청'), { kind: '졸업', windowDays: 45, route: 'calendar' });
assert.deepEqual(scheduleDeadlineKind('조기졸업 신청, 학점포기(14학번 이전) 신청'), { kind: '졸업', windowDays: 45, route: 'calendar' });
assert.deepEqual(scheduleDeadlineKind('2025학년도 전기 학위수여식'), { kind: '졸업', windowDays: 45, route: 'calendar' });
assert.deepEqual(scheduleDeadlineKind('4학년 수강신청'), { kind: '신청', windowDays: 45, route: 'timetable' });
assert.deepEqual(scheduleDeadlineKind('수강신청 정정(1차)'), { kind: '신청', windowDays: 45, route: 'timetable' });
assert.deepEqual(scheduleDeadlineKind('휴·복학 신청'), { kind: '신청', windowDays: 45, route: 'calendar' });
assert.deepEqual(scheduleDeadlineKind('등록 기간'), { kind: '신청', windowDays: 45, route: 'calendar' });
assert.deepEqual(scheduleDeadlineKind('초과학기자 등록'), { kind: '신청', windowDays: 45, route: 'calendar' });
assert.deepEqual(scheduleDeadlineKind('수업일수 90일'), { kind: '학사일정', windowDays: 7, route: 'calendar' });
assert.deepEqual(scheduleDeadlineKind('겨울계절학기 개강'), { kind: '학사일정', windowDays: 7, route: 'calendar' });
assert.deepEqual(scheduleDeadlineKind('중간고사'), { kind: '학사일정', windowDays: 7, route: 'calendar' });
console.log('home deadlines: KST dates, expired and uncertain status handled');
