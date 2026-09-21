'use client';
import { useState } from 'react';
import { BookOpen, CalendarDays, Compass, MonitorPlay, Plus, SearchX, Check } from 'lucide-react';
import type { Data } from './data';
import type { Catalog } from '@/lib/data/catalog';
import { useActivities, useNow, useSchedule } from './catalog';
import { activityMatch, liveStatus } from '@/lib/data/activities';
import { koreanMatch } from '@/lib/data/hangul';
import {
  courseMatch,
  semesterStartTs,
  slotsLabel,
  type CourseSection,
} from '@/lib/data/catalog';
import { currentSemesterStart } from '@/lib/data/lms';
import { lmsTaskSearch, type SearchHit } from '@/lib/data/search';
import { planBlockReason } from './catalog';

const CAP = 8;
const SCOPES = ['전체', '과목', '활동·일정', '수업 현황'];

/** 통합 검색 — 과목·비교과 활동·공식 학사일정을 한 번에 찾는다. */
export function SearchResults({
  query,
  data,
  catalog,
  plan,
  notify,
  go,
}: {
  query: string;
  data: Data;
  catalog: Catalog | null;
  plan: (id: string) => void;
  notify?: (msg: string) => void;
  go: (route: string) => void;
}) {
  const { snap: acts } = useActivities();
  const { snap: sched } = useSchedule();
  const now = useNow(30000);
  const [scope, setScope] = useState('전체');
  const [pendingOnly, setPendingOnly] = useState(false);
  const q = query.trim();
  const showCourses = scope === '전체' || scope === '과목';
  const showActs = scope === '전체' || scope === '활동·일정';
  const showLms = scope === '전체' || scope === '수업 현황';
  const courses = q && showCourses
    ? (catalog?.sections ?? []).filter((s) => courseMatch(s, q)).slice(0, CAP)
    : [];
  const activities = q && showActs
    ? (acts?.items ?? [])
        .filter((a) => activityMatch(a, q, koreanMatch))
        .slice(0, CAP)
    : [];
  const events = q && showActs
    ? (sched?.items ?? [])
        .filter((e) => koreanMatch(e.title, q))
        .slice(0, CAP)
    : [];
  // COSMOS 수업 현황 — 개별 과제·퀴즈·강의 항목 + 과목 제목 매칭.
  // 지난 학기 항목은 학기 경계로 기본 제외, '미완료만'은 완료 항목을 추가 제외
  const before =
    (catalog?.semester ? semesterStartTs(catalog.semester) : null) ??
    currentSemesterStart(now);
  const lmsHits: SearchHit[] = q && showLms
    ? [
        ...lmsTaskSearch(data.lms?.courses ?? [], q, before),
        ...(data.lms?.courses ?? [])
          .filter((c) => koreanMatch(c.title, q))
          .map(
            (c): SearchHit => ({
              label: c.title,
              route: 'lms/' + c.id,
              sub: `COSMOS 수업 현황 · 수강 중${c.prof ? ` · ${c.prof}` : ''}`,
            }),
          ),
      ]
        .filter((h) => !pendingOnly || h.done === false)
        .slice(0, CAP)
    : [];
  const nothing =
    q &&
    !courses.length &&
    !activities.length &&
    !events.length &&
    !lmsHits.length;
  const plannedSecs = (catalog?.sections ?? []).filter((s) =>
    data.planned.includes(s.id),
  );
  const toggle = (s: CourseSection) => {
    if (data.planned.includes(s.id)) return plan(s.id);
    const blocked = planBlockReason(s, data, plannedSecs);
    if (blocked) {
      notify?.(blocked);
      return;
    }
    plan(s.id);
  };

  return (
    <>
      <section className="card pad">
        <h2>검색 결과</h2>
        <p>
          {q ? (
            <>
              <b>&ldquo;{q}&rdquo;</b> · 과목 {courses.length}
              {courses.length === CAP ? '+' : ''} · 활동 {activities.length}
              {activities.length === CAP ? '+' : ''} · 학사일정 {events.length}
              {events.length === CAP ? '+' : ''}
              {data.lms
                ? ` · 수업 현황 ${lmsHits.length}${lmsHits.length === CAP ? '+' : ''}`
                : ''}
            </>
          ) : (
            '검색어를 입력하면 과목·활동·학사일정·수업 현황을 함께 찾습니다.'
          )}
        </p>
        <fieldset className="tabs search-scope" aria-label="검색 범위">
          {SCOPES.map((s) => (
            <button
              key={s}
              className={scope === s ? 'active' : ''}
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
            >
              {s}
            </button>
          ))}
          {data.lms && showLms && (
            <button
              className={'badge' + (pendingOnly ? ' sel' : '')}
              aria-pressed={pendingOnly}
              onClick={() => setPendingOnly((v) => !v)}
            >
              미완료만
            </button>
          )}
        </fieldset>
        {data.lms && (
          <p className="meta">
            수업 현황은 현재 학기({catalog?.semester ?? '추정'}) 항목만
            표시됩니다. 지난 학기 항목은 제외됩니다.
          </p>
        )}
      </section>
      {courses.length > 0 && (
        <section className="card pad">
          <h3>
            <BookOpen size={17} /> 과목
          </h3>
          {courses.map((s) => (
            <div className="event-line" key={s.id}>
              <BookOpen />
              <div>
                <b>
                  <button
                    className="link"
                    onClick={() => go('courses/' + s.id)}
                  >
                    {s.name}
                  </button>
                </b>
                <small>
                  {s.dept} · {s.section}분반 · {s.credits}학점 ·{' '}
                  {slotsLabel(s)}
                </small>
              </div>
              <button
                className="secondary"
                onClick={() => toggle(s)}
                aria-label={s.name + ' 계획에 담기'}
              >
                {data.planned.includes(s.id) ? (
                  <>
                    <Check size={14} /> 담김
                  </>
                ) : (
                  <>
                    <Plus size={14} /> 담기
                  </>
                )}
              </button>
            </div>
          ))}
          <button className="link" onClick={() => go('courses')}>
            과목 탐색에서 더 보기 <Compass size={14} />
          </button>
        </section>
      )}
      {activities.length > 0 && (
        <section className="card pad">
          <h3>
            <Compass size={17} /> 비교과·대외활동
          </h3>
          {activities.map((a) => (
            <div className="event-line" key={a.id}>
              <Compass />
              <div>
                <b>{a.title}</b>
                <small>
                  {liveStatus(a, now).label}
                  {liveStatus(a, now).dday
                    ? ' · ' + liveStatus(a, now).dday
                    : ''}
                  {a.points != null ? ` · ${a.points}P` : ''} · {a.dept}
                </small>
              </div>
              <button
                className="secondary"
                onClick={() => go('activities/' + a.id)}
              >
                자세히
              </button>
            </div>
          ))}
        </section>
      )}
      {events.length > 0 && (
        <section className="card pad">
          <h3>
            <CalendarDays size={17} /> 학사일정
          </h3>
          {events.map((e) => (
            <div className="event-line" key={e.id}>
              <CalendarDays />
              <div>
                <b>{e.title}</b>
                <small>
                  {e.start}
                  {e.end && e.end !== e.start ? ` ~ ${e.end}` : ''} · 공식
                  학사일정
                </small>
              </div>
              <button
                className="secondary"
                onClick={() => go('calendar/' + e.id)}
              >
                자세히
              </button>
            </div>
          ))}
        </section>
      )}
      {lmsHits.length > 0 && (
        <section className="card pad">
          <h3>
            <MonitorPlay size={17} /> 수업 현황
          </h3>
          {lmsHits.map((h, i) => (
            <div className="event-line" key={h.route + h.label + i}>
              <MonitorPlay />
              <div>
                <b>{h.label}</b>
                <small>{h.sub}</small>
              </div>
              <button
                className="secondary"
                onClick={() => go(h.route)}
              >
                자세히
              </button>
            </div>
          ))}
        </section>
      )}
      {nothing ? (
        <div className="card empty-small">
          <SearchX />
          <h3>결과가 없어요.</h3>
          <p>다른 표현으로 검색하거나 각 탭에서 직접 찾아보세요.</p>
        </div>
      ) : null}
    </>
  );
}
