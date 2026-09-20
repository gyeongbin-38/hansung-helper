'use client';
import { useState } from 'react';
import { CalendarDays, ArrowRight, ArrowUpRight, Plus, X } from 'lucide-react';
import type { Data } from './data';
import { currentSemesterStart, dueSoon } from '@/lib/data/lms';
import { semesterStartTs } from '@/lib/data/catalog';
import { useCatalog, useNow, useSchedule } from './catalog';
import { RetryButton, SkeletonRows } from './skeleton';

const fmtRange = (start: string, end: string | null) =>
  end && end !== start ? `${start.slice(5)} ~ ${end.slice(5)}` : start.slice(5);

export function CalendarSection({
  data,
  persist,
  detail,
  go,
}: {
  data: Data;
  persist: (next: Data, msg?: string) => Promise<boolean>;
  detail?: string;
  go: (route: string) => void;
}) {
  const { snap, failed, retry } = useSchedule();
  const { catalog } = useCatalog();
  const now = useNow(30000);
  const [eventErr, setEventErr] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (snap?.items ?? [])
    .filter((e) => (e.end ?? e.start) >= today)
    .slice(0, 12);
  // COSMOS 수업 마감 — 14일 이내 미완료 항목을 학사일정 아래에 병합 표시.
  // 지난 학기 항목은 학기 경계로 제외한다.
  const before =
    (catalog?.semester ? semesterStartTs(catalog.semester) : null) ??
    currentSemesterStart(now);
  const lmsDue = data.lms ? dueSoon(data.lms, now, 14, 7, before).slice(0, 8) : [];

  // /calendar/:id — 공식 학사일정 상세
  if (detail) {
    const e = snap?.items.find((x) => x.id === detail);
    const fetched = snap?.fetchedAt.slice(0, 10);
    return (
      <section className="card pad">
        <button className="link" onClick={() => go('calendar')}>
          ← 학사일정
        </button>
        {!snap && !failed && <SkeletonRows n={3} />}
        {snap && !e && <h2>일정을 찾지 못했습니다.</h2>}
        {e && (
          <>
            <h2>{e.title}</h2>
            <p>
              공식 학사일정 · {e.start}
              {e.end && e.end !== e.start ? ` ~ ${e.end}` : ''}
            </p>
            <p className="meta">
              hansung.ac.kr 수집 · {fetched} 기준 · 일정은
              학교 사정으로 변동될 수 있습니다.
            </p>
            <a
              className="link"
              href="https://www.hansung.ac.kr/hansung/6096/subview.do"
              target="_blank"
              rel="noreferrer"
            >
              원본 페이지에서 확인 <ArrowUpRight size={16} />
            </a>
          </>
        )}
        {failed && !e && (
          <p className="meta">
            학사일정을 불러오지 못했습니다. 원본 페이지에서 확인해 주세요.{' '}
            <RetryButton onRetry={retry} />
          </p>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="card pad">
        <div className="between">
          <h2>학교 학사일정</h2>
          <a
            className="link"
            href="https://www.hansung.ac.kr/hansung/6096/subview.do"
            target="_blank"
            rel="noreferrer"
          >
            원본 페이지 <ArrowUpRight size={16} />
          </a>
        </div>
        {snap && (
          <p className="meta">
            공식 학사일정 · hansung.ac.kr 수집 ·{' '}
            {snap.fetchedAt.slice(0, 10)} 기준 · 일정은 학교 사정으로 변동될
            수 있습니다.
          </p>
        )}
        {failed && (
          <p className="meta">
            학사일정을 불러오지 못했습니다. 원본 페이지에서 확인해 주세요.{' '}
            <RetryButton onRetry={retry} />
          </p>
        )}
        {!snap && !failed && <SkeletonRows />}
        {snap && !upcoming.length && (
          <p className="meta">앞으로 예정된 공식 일정이 없습니다.</p>
        )}
        <div className="events">
          {upcoming.map((e) => (
            <div className="event-line" key={e.id}>
              <span className="event-date" title={e.start}>
                <b>{Number(e.start.slice(8))}</b>
                <small>{Number(e.start.slice(5, 7))}월</small>
              </span>
              <div>
                <b>
                  <button
                    className="link title-link"
                    onClick={() => go('calendar/' + e.id)}
                  >
                    {e.title}
                  </button>
                </b>
                <small>공식 학사일정 · {fmtRange(e.start, e.end)}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
      {data.lms && (
        <section className="card pad">
          <div className="between">
            <h2>수업 마감</h2>
            <button className="link" onClick={() => go('lms')}>
              수업 현황 <ArrowRight size={16} />
            </button>
          </div>
          <p className="meta">
            COSMOS 수집 {data.lms.fetchedAt.slice(0, 10)} 기준 · 미제출
            과제·미응시 퀴즈·미수강 강의의 마감입니다.
          </p>
          {lmsDue.length ? (
            <div className="events">
              {lmsDue.map((t, i) => {
                const d = new Date(t.dueTs);
                return (
                  <div className="event-line" key={i}>
                    <span className="event-date" title={t.due ?? ''}>
                      <b>{d.getDate()}</b>
                      <small>{d.getMonth() + 1}월</small>
                    </span>
                    <div>
                      <b>
                        {t.url ? (
                          <a
                            className="link title-link"
                            href={t.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t.title}
                          </a>
                        ) : (
                          t.title
                        )}
                      </b>
                      <small>
                        {t.kind} · {t.course} ·{' '}
                        {t.dueTs < now
                          ? '마감 지남'
                          : `D-${Math.ceil((t.dueTs - now) / 86400000)}`}
                        {t.uncertain ? ' · 응시 여부 확인 실패' : ''}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="meta">14일 이내 마감되는 수업 항목이 없습니다.</p>
          )}
        </section>
      )}
      <section className="card pad">
        <div className="between">
          <h2>나의 일정</h2>
        </div>
        <form
          className="event-form"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              d = new FormData(form);
            const title = (d.get('title') as string).trim();
            const date = d.get('date') as string;
            // 빈 값은 인라인 오류로 안내 — 입력값과 공식 일정 목록을 그대로 둔다
            if (!title || !date) {
              setEventErr(
                !title ? '일정 제목을 입력해 주세요.' : '날짜를 선택해 주세요.',
              );
              form
                .querySelector<HTMLInputElement>(
                  !title ? 'input[name="title"]' : 'input[name="date"]',
                )
                ?.focus();
              return;
            }
            setEventErr('');
            if (
              await persist(
                {
                  ...data,
                  events: [
                    ...data.events,
                    { title, date },
                  ].sort((a, b) => a.date.localeCompare(b.date)),
                },
                '개인 일정을 저장했습니다.',
              )
            )
              form.reset();
          }}
        >
          <input
            name="title"
            required
            placeholder="개인 일정 제목"
            aria-label="일정 제목"
            aria-invalid={!!eventErr}
            maxLength={100}
          />
          <input
            name="date"
            type="date"
            required
            aria-label="일정 날짜"
            aria-invalid={!!eventErr}
          />
          <button className="primary">
            일정 추가 <Plus size={16} />
          </button>
        </form>
        {eventErr && (
          <p className="meta form-error" role="alert">
            {eventErr}
          </p>
        )}
        {data.events.length ? (
          <div className="events">
            {data.events.map((e, i) => {
              const parts = e.date.split('-');
              const parsed =
                parts.length === 3 && parts.every((p) => /^\d+$/.test(p));
              return (
                <div className="event-line" key={i}>
                  <span className="event-date" title={e.date}>
                    {parsed ? (
                      <>
                        <b>{Number(parts[2])}</b>
                        <small>{Number(parts[1])}월</small>
                      </>
                    ) : (
                      e.date
                    )}
                  </span>
                  <div>
                    <b>{e.title}</b>
                    <small>사용자 입력 · 개인 일정</small>
                  </div>
                  <button
                    className="icon"
                    aria-label="일정 삭제"
                    onClick={async () =>
                      await persist(
                        {
                          ...data,
                          events: data.events.filter((_, j) => j !== i),
                        },
                        '일정을 삭제했습니다.',
                      )
                    }
                  >
                    <X size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-small">
            <CalendarDays size={30} />
            <h3>내 일정을 하나씩 모아보세요.</h3>
            <p>학교 공식 일정은 위에서 자동으로 보여드립니다.</p>
          </div>
        )}
      </section>
    </>
  );
}
