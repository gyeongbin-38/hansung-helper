'use client';

import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  kstDateNumber,
  parseDue,
  submissionItems,
  type LmsSnapshot,
  type SubmissionItem,
} from '../../lib/data/lms';

const DAY = 86_400_000;
const KST_OFFSET = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

type Filter = 'all' | 'today' | 'week' | 'completed' | 'check';
type Sort = 'due' | 'course' | 'title';

type CalendarMonth = { year: number; month: number };

export type LmsTasksProps = {
  snap: LmsSnapshot;
  now: number;
  before?: number | null;
  sidebar?: ReactNode;
};

function kstParts(timestamp: number) {
  const date = new Date(timestamp + KST_OFFSET);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function dayNumber(year: number, month: number, day: number) {
  return Math.floor(Date.UTC(year, month, day) / DAY);
}

function weekBounds(timestamp: number) {
  const shifted = new Date(timestamp + KST_OFFSET);
  const sundayBased = shifted.getUTCDay();
  const start = kstDateNumber(timestamp) - ((sundayBased + 6) % 7);
  return { start, end: start + 6 };
}

function safeTaskUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.origin === 'https://learn.hansung.ac.kr' &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function isComplete(item: SubmissionItem) {
  return item.submitted && !item.uncertain;
}

function isOverdue(item: SubmissionItem, now: number) {
  return (
    !item.uncertain &&
    !item.submitted &&
    item.dueTs !== null &&
    item.dueTs < now
  );
}

function dueDay(item: SubmissionItem) {
  const timestamp = item.dueTs ?? parseDue(item.due);
  return timestamp === null ? null : kstDateNumber(timestamp);
}

function formatDue(item: SubmissionItem, now: number) {
  if (item.dueTs === null) return '마감 없음';
  const due = kstParts(item.dueTs);
  const time = new Date(item.dueTs + KST_OFFSET);
  const dateLabel = `${due.month + 1}.${String(due.day).padStart(2, '0')}`;
  const timeLabel = `${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')}`;
  const distance = kstDateNumber(item.dueTs) - kstDateNumber(now);
  const relative = item.uncertain
    ? ''
    : isOverdue(item, now)
      ? '지연'
      : distance === 0
        ? '오늘'
        : distance > 0
          ? `D-${distance}`
          : '';
  return [dateLabel, timeLabel, relative].filter(Boolean).join(' · ');
}

function shiftMonth(value: CalendarMonth, amount: number): CalendarMonth {
  const date = new Date(Date.UTC(value.year, value.month + amount, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

function calendarDays({ year, month }: CalendarMonth) {
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const leading = (firstDay + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
}

function TaskRow({ item, now }: { item: SubmissionItem; now: number }) {
  const href = safeTaskUrl(item.url);
  const complete = isComplete(item);
  const overdue = isOverdue(item, now);
  const status = item.uncertain
    ? '확인 필요'
    : complete
      ? '완료'
      : overdue
        ? '지연'
        : '미완료';

  return (
    <article className={`lms-task-page__row ${complete ? 'is-complete' : ''}`}>
      <span
        className={`lms-task-page__kind is-${item.kind === '과제' ? 'assignment' : 'quiz'}`}
      >
        {item.kind}
      </span>
      <div className="lms-task-page__row-copy">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {item.title}
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        ) : (
          <strong>{item.title}</strong>
        )}
        <span>{item.course}</span>
      </div>
      <span className="lms-task-page__due">{formatDue(item, now)}</span>
      <span
        className={`lms-task-page__status is-${item.uncertain ? 'check' : complete ? 'done' : overdue ? 'late' : 'pending'}`}
      >
        {status}
      </span>
    </article>
  );
}

export function LmsTasks({ snap, now, before, sidebar }: LmsTasksProps) {
  const allItems = useMemo(() => submissionItems(snap, before), [snap, before]);
  const current = useMemo(
    () => allItems.filter((item) => !item.past),
    [allItems],
  );
  const past = useMemo(() => allItems.filter((item) => item.past), [allItems]);
  const today = kstDateNumber(now);
  const week = weekBounds(now);
  const initialMonth = kstParts(now);
  const [filter, setFilter] = useState<Filter>('all');
  const [course, setCourse] = useState('all');
  const [sort, setSort] = useState<Sort>('due');
  const [month, setMonth] = useState<CalendarMonth>({
    year: initialMonth.year,
    month: initialMonth.month,
  });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const courses = useMemo(
    () =>
      [...new Set(current.map((item) => item.course))].sort((a, b) =>
        a.localeCompare(b, 'ko'),
      ),
    [current],
  );
  const metrics = useMemo(() => {
    const completed = current.filter(isComplete).length;
    const todayItems = current.filter(
      (item) =>
        !isComplete(item) &&
        item.dueTs !== null &&
        item.dueTs >= now &&
        dueDay(item) === today,
    ).length;
    const weekItems = current.filter((item) => {
      const day = dueDay(item);
      return day !== null && day >= week.start && day <= week.end;
    }).length;
    return {
      remaining: current.length - completed,
      today: todayItems,
      week: weekItems,
      completed,
      check: current.filter((item) => item.uncertain).length,
      overdue: current.filter((item) => isOverdue(item, now)).length,
    };
  }, [current, now, today, week.end, week.start]);

  const filtered = useMemo(() => {
    const result = current.filter((item) => {
      const day = dueDay(item);
      if (course !== 'all' && item.course !== course) return false;
      if (selectedDay !== null && day !== selectedDay) return false;
      if (filter === 'today')
        return (
          !isComplete(item) &&
          item.dueTs !== null &&
          item.dueTs >= now &&
          day === today
        );
      if (filter === 'week')
        return day !== null && day >= week.start && day <= week.end;
      if (filter === 'completed') return isComplete(item);
      if (filter === 'check') return !!item.uncertain;
      return true;
    });
    return result.sort((a, b) => {
      if (sort === 'course')
        return (
          a.course.localeCompare(b.course, 'ko') ||
          a.title.localeCompare(b.title, 'ko')
        );
      if (sort === 'title') return a.title.localeCompare(b.title, 'ko');
      if (a.dueTs === null && b.dueTs === null) return 0;
      if (a.dueTs === null) return 1;
      if (b.dueTs === null) return -1;
      return a.dueTs - b.dueTs;
    });
  }, [
    course,
    current,
    filter,
    now,
    selectedDay,
    sort,
    today,
    week.end,
    week.start,
  ]);

  const groups = useMemo(() => {
    const output: { key: string; label: string; items: SubmissionItem[] }[] = [
      { key: 'overdue', label: '지연', items: [] },
      { key: 'today', label: '오늘', items: [] },
      { key: 'week', label: '이번 주', items: [] },
      { key: 'later', label: '이후', items: [] },
      { key: 'undated', label: '날짜 없음', items: [] },
      { key: 'check', label: '확인 필요', items: [] },
      { key: 'earlier', label: '이전 마감 · 완료', items: [] },
    ];
    for (const item of filtered) {
      const day = dueDay(item);
      if (item.uncertain) output[5].items.push(item);
      else if (day === null) output[4].items.push(item);
      else if (isOverdue(item, now)) output[0].items.push(item);
      else if (day < today) output[6].items.push(item);
      else if (day === today) output[1].items.push(item);
      else if (day >= week.start && day <= week.end) output[2].items.push(item);
      else output[3].items.push(item);
    }
    return output.filter((group) => group.items.length > 0);
  }, [filtered, now, today, week.end, week.start]);

  const dueCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of current) {
      const day = dueDay(item);
      if (day !== null) counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [current]);
  const days = calendarDays(month);
  const completedPercent = current.length
    ? Math.round((metrics.completed / current.length) * 100)
    : 0;

  return (
    <section className="lms-task-page" aria-label="과제 모아보기">
      <fieldset className="lms-task-page__toolbar">
        <legend className="sr-only">과제 필터</legend>
        <div className="lms-task-page__filters">
          {(
            [
              ['all', '전체'],
              ['today', '오늘'],
              ['week', '이번 주'],
              ['completed', '완료'],
              ['check', '확인 필요'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              {value === 'check' && metrics.check > 0
                ? ` ${metrics.check}`
                : ''}
            </button>
          ))}
        </div>
        <div className="lms-task-page__selects">
          <label>
            <span className="sr-only">과목</span>
            <select
              value={course}
              onChange={(event) => setCourse(event.target.value)}
            >
              <option value="all">모든 과목</option>
              {courses.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">정렬</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
            >
              <option value="due">마감순</option>
              <option value="course">과목순</option>
              <option value="title">이름순</option>
            </select>
          </label>
        </div>
      </fieldset>

      <div className="lms-task-page__metrics" aria-label="과제 현황">
        <article>
          <ClipboardList aria-hidden="true" />
          <span>남은 항목</span>
          <strong>{metrics.remaining}</strong>
        </article>
        <article>
          <Clock3 aria-hidden="true" />
          <span>오늘</span>
          <strong>{metrics.today}</strong>
        </article>
        <article>
          <CalendarDays aria-hidden="true" />
          <span>이번 주</span>
          <strong>{metrics.week}</strong>
        </article>
        <article>
          <Check aria-hidden="true" />
          <span>완료</span>
          <strong>{metrics.completed}</strong>
        </article>
      </div>

      <div className="lms-task-page__layout">
        <div className="lms-task-page__list">
          {selectedDay !== null && (
            <div className="lms-task-page__date-filter">
              <span>
                {month.month + 1}월{' '}
                {selectedDay - dayNumber(month.year, month.month, 1) + 1}일
              </span>
              <button type="button" onClick={() => setSelectedDay(null)}>
                날짜 해제
              </button>
            </div>
          )}
          {!current.length ? (
            <div className="lms-task-page__empty">
              <ClipboardList size={28} aria-hidden="true" />
              <strong>표시할 과제가 없어요</strong>
              <span>COSMOS 수집 후 과제와 퀴즈가 여기에 모입니다.</span>
            </div>
          ) : groups.length ? (
            groups.map((group) => (
              <section className="lms-task-page__group" key={group.key}>
                <header>
                  <h3>{group.label}</h3>
                  <span>{group.items.length}</span>
                </header>
                <div>
                  {group.items.map((item, index) => (
                    <TaskRow
                      key={`${item.courseId}-${item.kind}-${item.title}-${index}`}
                      item={item}
                      now={now}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="lms-task-page__empty">
              <CircleAlert size={28} aria-hidden="true" />
              <strong>조건에 맞는 항목이 없어요</strong>
              <button
                type="button"
                onClick={() => {
                  setFilter('all');
                  setCourse('all');
                  setSelectedDay(null);
                }}
              >
                필터 초기화
              </button>
            </div>
          )}

          {past.length > 0 && (
            <details className="lms-task-page__past">
              <summary>지난 학기 {past.length}개</summary>
              <div>
                {past.map((item, index) => (
                  <TaskRow
                    key={`past-${item.courseId}-${item.kind}-${item.title}-${index}`}
                    item={item}
                    now={now}
                  />
                ))}
              </div>
            </details>
          )}
        </div>

        <aside className="lms-task-page__side">
          <section className="lms-task-page__status-card">
            <header>
              <h3>제출 현황</h3>
              <strong>{completedPercent}%</strong>
            </header>
            <progress
              value={metrics.completed}
              max={Math.max(current.length, 1)}
              aria-label={`완료율 ${completedPercent}%`}
            />
            <dl>
              <div>
                <dt>완료</dt>
                <dd>{metrics.completed}</dd>
              </div>
              <div>
                <dt>남음</dt>
                <dd>{metrics.remaining}</dd>
              </div>
              <div>
                <dt>지연</dt>
                <dd>{metrics.overdue}</dd>
              </div>
              <div>
                <dt>확인</dt>
                <dd>{metrics.check}</dd>
              </div>
            </dl>
          </section>

          <section className="lms-task-page__calendar" aria-label="마감 달력">
            <header>
              <h3>
                {month.year}년 {month.month + 1}월
              </h3>
              <div>
                <button
                  type="button"
                  aria-label="이전 달"
                  onClick={() => {
                    setMonth((value) => shiftMonth(value, -1));
                    setSelectedDay(null);
                  }}
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="다음 달"
                  onClick={() => {
                    setMonth((value) => shiftMonth(value, 1));
                    setSelectedDay(null);
                  }}
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            </header>
            <div className="lms-task-page__weekdays" aria-hidden="true">
              {WEEKDAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="lms-task-page__calendar-grid">
              {days.map((day, index) => {
                if (day === null) return <span key={`blank-${index}`} />;
                const number = dayNumber(month.year, month.month, day);
                const count = dueCounts.get(number) ?? 0;
                const selected = selectedDay === number;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`${number === today ? 'is-today' : ''} ${count ? 'has-due' : ''}`}
                    aria-pressed={selected}
                    aria-label={`${month.month + 1}월 ${day}일${count ? `, 마감 ${count}개` : ''}`}
                    onClick={() => setSelectedDay(selected ? null : number)}
                  >
                    <span>{day}</span>
                    {count > 0 && <i>{count}</i>}
                  </button>
                );
              })}
            </div>
          </section>
          {sidebar}
        </aside>
      </div>
    </section>
  );
}
