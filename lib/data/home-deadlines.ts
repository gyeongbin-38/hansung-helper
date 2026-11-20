import { kstDateNumber, parseDue } from './lms.ts';

/** 날짜 표시의 D-day는 24시간 간격이 아니라 한국의 달력 날짜로 계산한다. */
export const deadlineDays = (deadline: number, now: number) =>
  kstDateNumber(deadline) - kstDateNumber(now);

/** 날짜만 제공되는 일정은 한국 날짜의 마지막 시각을 기준으로 한다. */
export function dateDeadlineDays(date: string | null | undefined, now: number): number | null {
  const deadline = parseDue(date?.slice(0, 10) ?? null);
  return deadline === null ? null : deadlineDays(deadline, now);
}

/** 긴급 항목은 완료 상태가 확인됐고 마감이 남아 있는 오늘·내일 항목만 포함한다. */
export function isUpcomingUrgent(item: { dueTs: number; uncertain?: boolean; rangeUncertain?: boolean }, now: number): boolean {
  const days = deadlineDays(item.dueTs, now);
  return !item.uncertain && !item.rangeUncertain && item.dueTs >= now && days >= 0 && days <= 1;
}

/** 신청 이후 단계는 더 이상 신청 마감으로 안내하지 않는다. */
export function needsApplication(stages: Record<string, string> | undefined, id: string): boolean {
  return !stages?.[id];
}

/**
 * 학사일정 제목 → 홈 마감 위젯 분류.
 * 졸업·수강신청·휴복학·등록처럼 신청 창구가 긴 행정 일정은
 * 7일만 보고는 놓치므로 45일 전부터 보여주고, 일반 일정은 7일을 유지한다.
 */
export function scheduleDeadlineKind(title: string): {
  kind: '졸업' | '신청' | '학사일정';
  windowDays: number;
  route: string;
} {
  if (/졸업|학위|수료/.test(title)) return { kind: '졸업', windowDays: 45, route: 'calendar' };
  if (/수강|장바구니|휴학|복학|재입학|전과|등록/.test(title))
    return { kind: '신청', windowDays: 45, route: /수강|장바구니/.test(title) ? 'timetable' : 'calendar' };
  return { kind: '학사일정', windowDays: 7, route: 'calendar' };
}
