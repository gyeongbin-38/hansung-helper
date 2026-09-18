'use client';
import { BookOpen, CalendarDays, Compass, Plus, SearchX, Check } from 'lucide-react';
import type { Data } from './data';
import type { Catalog } from '@/lib/data/catalog';
import { useActivities, useSchedule } from './catalog';
import { activityMatch } from '@/lib/data/activities';
import { koreanMatch } from '@/lib/data/hangul';
import { courseMatch, slotsLabel } from '@/lib/data/catalog';

const CAP = 8;

/** 통합 검색 — 과목·비교과 활동·공식 학사일정을 한 번에 찾는다. */
export function SearchResults({
  query,
  data,
  catalog,
  plan,
  go,
}: {
  query: string;
  data: Data;
  catalog: Catalog | null;
  plan: (id: string) => void;
  go: (route: string) => void;
}) {
  const { snap: acts } = useActivities();
  const { snap: sched } = useSchedule();
  const q = query.trim();
  const courses = q
    ? (catalog?.sections ?? []).filter((s) => courseMatch(s, q)).slice(0, CAP)
    : [];
  const activities = q
    ? (acts?.items ?? [])
        .filter((a) => activityMatch(a, q, koreanMatch))
        .slice(0, CAP)
    : [];
  const events = q
    ? (sched?.items ?? [])
        .filter((e) => koreanMatch(e.title, q))
        .slice(0, CAP)
    : [];
  const nothing = q && !courses.length && !activities.length && !events.length;

  return (
    <>
      <section className="card pad">
        <h2>검색 결과</h2>
        <p>
          {q ? (
            <>
              <b>&ldquo;{q}&rdquo;</b> — 과목 {courses.length}
              {courses.length === CAP ? '+' : ''} · 활동 {activities.length}
              {activities.length === CAP ? '+' : ''} · 학사일정 {events.length}
              {events.length === CAP ? '+' : ''}
            </>
          ) : (
            '검색어를 입력하면 과목·활동·학사일정을 함께 찾습니다.'
          )}
        </p>
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
                onClick={() => plan(s.id)}
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
                  {a.statusLabel}
                  {a.dday ? ' · ' + a.dday : ''}
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
