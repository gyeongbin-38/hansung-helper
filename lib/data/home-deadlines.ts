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
export function isUpcomingUrgent(item: { dueTs: number; uncertain?: boolean }, now: number): boolean {
  const days = deadlineDays(item.dueTs, now);
  return !item.uncertain && item.dueTs >= now && days >= 0 && days <= 1;
}
