import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeBrief, briefTiming } from '../lib/data/home-brief.ts';

const now = Date.parse('2026-11-08T14:30:00Z'); // KST 11/08 23:30
const course = (changes = {}) => ({ id: 'course', title: '자료구조', vods: [], assigns: [], quizzes: [], ...changes });
const task = (title, due, changes = {}) => ({ title, due, submitted: false, ...changes });
const snapshot = (courses, fetchedAt = new Date(now).toISOString()) => ({ source: 'cosmos-lms', fetchedAt, courses });
const input = (changes = {}) => ({ now, activities: null, schedule: null, saved: [], events: [], ...changes });

test('KST 날짜 경계에서 오늘·내일·지난 기한을 구분한다', () => {
  assert.equal(briefTiming(Date.parse('2026-11-08T14:59:00Z'), now), '오늘');
  assert.equal(briefTiming(Date.parse('2026-11-08T15:10:00Z'), now), '내일');
  assert.equal(briefTiming(now - 60000, now), '기한 지남');
});

test('현재 학기 미완료·미확인 항목만 모으고 원래 순서를 변경하지 않는다', () => {
  const lms = snapshot([
    course({ assigns: [
      task('완료', '2026-11-09 12:00', { submitted: true }),
      task('확인 필요', '2026-11-09 12:00', { submitted: true, uncertain: true }),
      task('최근 지난 마감', '2026-11-07 12:00'),
      task('오래 지난 마감', '2026-10-01 12:00'),
      task('다음 달', '2026-12-01 12:00'),
    ] }),
    course({ id: 'past', assigns: [task('지난 학기', '2026-05-01')] }),
    course({ id: 'community', community: true, assigns: [task('커뮤니티', '2026-11-09')] }),
  ]);
  const before = JSON.stringify(lms);
  const brief = buildHomeBrief(input({ lms }));
  assert.deepEqual(brief.deadlines.map((item) => item.title), ['확인 필요', '최근 지난 마감']);
  assert.equal(brief.deadlines[0].caution, '완료 여부 확인 필요');
  assert.equal(brief.deadlines[0].route, 'lms/course');
  assert.equal(JSON.stringify(lms), before);
});

test('마감 누락·파싱 불가와 강의 수강 기간을 처리한다', () => {
  const lms = snapshot([course({
    assigns: [task('마감 없음', null), task('알 수 없는 마감', '미정')],
    vods: [{ title: '강의', attended: false, range: '2026-11-01 09:00 ~ 2026-11-09 23:00' }],
  })]);
  const brief = buildHomeBrief(input({ lms }));
  assert.deepEqual(brief.checks.map((item) => item.title), ['마감 없음', '알 수 없는 마감']);
  assert.equal(brief.deadlines[0].at, Date.parse('2026-11-09T14:00:00Z'));
});

test('부분 실패에서 보존된 완료 상태를 확정하지 않고 이전 자료를 안내한다', () => {
  const lms = snapshot([course({
    assigns: [task('보존된 과제', '2026-11-09', { submitted: true })],
    errors: ['assign'], retainedAt: '2026-11-06T00:00:00Z',
  })]);
  assert.match(buildHomeBrief(input({ lms })).deadlines[0].caution, /이전 결과/);
  lms.courses[0].errors = [];
  lms.courses[0].retainedAt = undefined;
  lms.courses[0].assigns[0].submitted = false;
  lms.fetchedAt = '2026-11-01T00:00:00Z';
  assert.match(buildHomeBrief(input({ lms })).deadlines[0].caution, /현재 상태 확인/);
});

test('저장한 활동만 노출하고 신청 기록과 실제 마감 시각을 반영한다', () => {
  const activities = {
    fetchedAt: new Date(now).toISOString(),
    items: [
      { id: 'saved', title: '저장함', dept: '학교', applyEnd: '2026-11-09T10:00:00+09:00' },
      { id: 'applied', title: '이미 신청함', dept: '학교', applyEnd: '2026-11-09' },
      { id: 'not-saved', title: '저장 안 함', dept: '학교', applyEnd: '2026-11-09' },
      { id: 'ended', title: '당일 종료됨', dept: '학교', applyEnd: '2026-11-08T18:00:00+09:00' },
    ],
  };
  const brief = buildHomeBrief(input({ activities, saved: ['saved', 'applied', 'ended'], actStatus: { applied: 'applied' } }));
  assert.deepEqual(brief.deadlines.map((item) => item.title), ['저장함']);
  assert.equal(brief.deadlines[0].at, Date.parse('2026-11-09T01:00:00Z'));
});

test('오래된 접수 정보는 긴급 마감 대신 원문 확인으로 분리한다', () => {
  const activities = { fetchedAt: '2026-11-01T00:00:00Z', items: [
    { id: 'saved', title: '오래된 활동', dept: '학교', applyEnd: '2026-11-09' },
  ] };
  const brief = buildHomeBrief(input({ activities, saved: ['saved'] }));
  assert.equal(brief.deadlines.length, 0);
  assert.equal(brief.checks[0].timing, '접수 확인');
});

test('학교 기간 일정·개인 일정·직접 등록 활동을 중복 없이 함께 정렬한다', () => {
  const schedule = { items: [
    { id: 'ongoing', title: '진행 중 신청', start: '2026-11-01', end: '2026-11-09' },
    { id: 'starts', title: '새 일정', start: '2026-11-10', end: '2026-11-30' },
    { id: 'ended', title: '종료됨', start: '2026-11-01', end: null },
    { id: 'far', title: '먼 일정', start: '2026-12-01', end: null },
  ] };
  const brief = buildHomeBrief(input({
    schedule, events: [{ title: '개인 일정', date: '2026-11-08' }],
    extActivities: [{ id: 'ext-1', title: '공모전', org: '외부', applyEnd: '2026-11-11' }],
  }));
  assert.deepEqual(brief.deadlines.map((item) => item.title), ['개인 일정', '진행 중 신청', '새 일정', '공모전']);
  assert.equal(brief.deadlines[1].timing, '내일 종료');
  assert.equal(new Set(brief.deadlines.map((item) => item.id)).size, 4);
});

test('수집 결과가 없다고 할 일을 만들어내지 않는다', () => {
  assert.deepEqual(buildHomeBrief(input()), { deadlines: [], checks: [] });
});
