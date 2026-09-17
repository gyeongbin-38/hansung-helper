'use client';
import { Bookmark, ArrowUpRight, Search } from 'lucide-react';
import { acts, type Data } from './data';

export function Activities({
  detail,
  filter,
  setFilter,
  query,
  setQuery,
  data,
  go,
  save,
}: {
  detail: string | undefined;
  filter: string;
  setFilter: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  data: Data;
  go: (route: string) => void;
  save: (id: string) => void;
}) {
  const a = acts.find((x) => x.id === detail);
  if (detail)
    return a ? (
      <>
        <button
          className="link breadcrumb"
          onClick={() => go('activities')}
        >
          홈 / 비교과·대외활동 / {a.name}
        </button>
        <section className="card detail">
          <span className="badge">{a.type} · 체험용 데이터</span>
          <h2>{a.name}</h2>
          <p>{a.desc}</p>
          <div className="detail-grid">
            {[
              ['모집 마감', a.date],
              ['운영 기간', a.period],
              ['대상', '대학생 · 예시'],
              ['비교과 인정', '인정 여부 확인 필요'],
            ].map(([l, v]) => (
              <div key={l}>
                <small>{l}</small>
                <b>{v}</b>
              </div>
            ))}
          </div>
          <h3>어떤 활동인가요?</h3>
          <p>
            관심 분야를 직접 경험하고 결과물을 정리하는 프로그램의 체험
            예시입니다. 실제 모집 공고가 아니며 신청할 수 없습니다.
          </p>
          <h3>이런 관심사와 연결돼요</h3>
          <p>{a.tag}. 개인 학사정보에 근거한 확정 추천은 아닙니다.</p>
          <div className="actions">
            <button className="primary" onClick={() => save(a.id)}>
              <Bookmark size={18} />
              {data.saved.includes(a.id) ? '저장 해제' : '활동 저장'}
            </button>
            <button className="secondary" onClick={() => go('calendar')}>
              개인 일정 추가
            </button>
          </div>
          <p className="meta">출처: 체험용 예시 · 실제 모집 일정 확인 안 됨</p>
          <a
            className="link"
            href="https://hsportal.hansung.ac.kr/"
            target="_blank"
            rel="noreferrer"
          >
            학교 스마트자기관리시스템 열기 <ArrowUpRight size={16} />
          </a>
        </section>
      </>
    ) : (
      <div className="card pad">
        <p>활동을 찾을 수 없습니다.</p>
        <div>
          <button className="secondary" onClick={() => go('activities')}>
            목록으로
          </button>
        </div>
      </div>
    );
  const items = acts.filter(
    (x) =>
      (filter === '전체' ||
        filter === x.type ||
        (filter === '저장한 활동' && data.saved.includes(x.id))) &&
      (x.name + x.desc + x.tag).includes(query),
  );
  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          {['전체', '교내 비교과', '대외활동', '저장한 활동'].map((f) => (
            <button
              className={filter === f ? 'active' : ''}
              key={f}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
              {f === '저장한 활동' ? ' ' + data.saved.length : ''}
            </button>
          ))}
        </div>
        <input
          className="field"
          aria-label="활동명 검색"
          placeholder="활동명, 관심 키워드 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {items.length ? (
        <ActivityCards items={items} data={data} go={go} save={save} />
      ) : (
        <div className="card empty-small">
          <Search />
          <h3>조건에 맞는 활동이 없어요.</h3>
          <button
            className="secondary"
            onClick={() => {
              setFilter('전체');
              setQuery('');
            }}
          >
            필터 초기화
          </button>
        </div>
      )}
    </>
  );
}

function ActivityCards({
  items,
  data,
  go,
  save,
}: {
  items: typeof acts;
  data: Data;
  go: (route: string) => void;
  save: (id: string) => void;
}) {
  return (
    <div className="cards">
      {items.map((a, i) => (
        <article className="card activity" key={a.id}>
          <div className={'mini-art art' + (i % 6)}>
            <span>{a.en}</span>
            <strong>
              {String(i + 1).padStart(2, '0')}
              <ArrowUpRight size={34} strokeWidth={1.2} />
            </strong>
            <small>HANSUNG · {a.art}</small>
          </div>
          <div className="pad">
            <div className="between">
              <span className="badge">{a.type}</span>
              <button
                className={'icon ' + (data.saved.includes(a.id) ? 'saved' : '')}
                aria-label="활동 저장 전환"
                onClick={() => save(a.id)}
              >
                <Bookmark size={19} />
              </button>
            </div>
            <h3>
              <button
                className="text-title"
                onClick={() => go('activities/' + a.id)}
              >
                {a.name}
              </button>
            </h3>
            <p>{a.desc}</p>
            <small>모집 마감 {a.date} · 체험용</small>
            <div className="card-foot">
              <button className="link" onClick={() => go('activities/' + a.id)}>
                자세히 보기 <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
