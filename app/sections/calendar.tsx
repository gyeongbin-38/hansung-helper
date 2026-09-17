'use client';
import { CalendarDays, ArrowUpRight, Plus, X } from 'lucide-react';
import type { Data } from './data';

export function CalendarSection({
  data,
  persist,
}: {
  data: Data;
  persist: (next: Data, msg?: string) => Promise<boolean>;
}) {
  return (
    <section className="card pad">
      <div className="between">
        <h2>나의 일정</h2>
        <a
          className="link"
          href="https://www.hansung.ac.kr/"
          target="_blank"
          rel="noreferrer"
        >
          학교 공식 일정 확인 <ArrowUpRight size={16} />
        </a>
      </div>
      <form
        className="event-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            d = new FormData(form);
          if (
            await persist(
              {
                ...data,
                events: [
                  ...data.events,
                  {
                    title: d.get('title') as string,
                    date: d.get('date') as string,
                  },
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
          maxLength={100}
        />
        <input name="date" type="date" required aria-label="일정 날짜" />
        <button className="primary">
          일정 추가 <Plus size={16} />
        </button>
      </form>
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
          <p>학교·LMS 일정은 아직 연결되지 않았습니다.</p>
        </div>
      )}
    </section>
  );
}
