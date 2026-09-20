'use client';
import { Bookmark, ArrowUpRight, Search } from 'lucide-react';
import type { Data } from './data';
import { useActivities, useNow } from './catalog';
import { RetryButton, SkeletonCards } from './skeleton';
import { koreanMatch } from '@/lib/data/hangul';
import {
  activityMatch,
  liveStatus,
  type Activity,
} from '@/lib/data/activities';

const TABS = ['전체', '신청 가능', '접수예정', '운영·마감', '저장한 활동'];

const fmt = (iso: string | null) => (iso ? iso.slice(0, 10) : '미정');
const period = (a: string | null, b: string | null) =>
  a || b ? `${fmt(a)} ~ ${fmt(b)}` : '기간 미정';

// 상태는 스냅샷 문자열이 아니라 신청 기간+현재 시각으로 재계산한다
function inTab(a: Activity, tab: string, saved: string[], now: number) {
  const st = liveStatus(a, now).status;
  if (tab === '신청 가능') return st === 'open' || st === 'closing';
  if (tab === '접수예정') return st === 'upcoming';
  if (tab === '운영·마감')
    return st === 'running' || st === 'closed';
  if (tab === '저장한 활동') return saved.includes(a.id);
  return true;
}

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
  const { snap, failed, retry } = useActivities();
  const now = useNow(30000);
  const items = snap?.items ?? [];
  const a = items.find((x) => x.id === detail);

  if (detail)
    return a ? (
      <>
        <button
          className="link breadcrumb"
          onClick={() => go('activities')}
        >
          홈 / 비교과·대외활동 / {a.title}
        </button>
        <section className="card detail">
          <span className="badge blue">
            {liveStatus(a, now).label}
            {liveStatus(a, now).dday
              ? ' · ' + liveStatus(a, now).dday
              : ''}
          </span>
          <h2>{a.title}</h2>
          <p>{a.dept}에서 운영하는 비교과 프로그램입니다.</p>
          <div className="detail-grid">
            {[
              ['신청 기간', period(a.applyStart, a.applyEnd)],
              ['운영 기간', period(a.runStart, a.runEnd)],
              [
                '참여 방식',
                (a.team ?? '확인 필요') +
                  (a.capacity
                    ? ` · 정원 ${a.capacity}명(신청 ${a.applicants ?? 0}명)`
                    : a.applicants != null
                      ? ` · 신청 ${a.applicants}명`
                      : ''),
              ],
              [
                '비교과 포인트',
                a.points != null
                  ? `${a.points} P${a.certified ? ' · 인재인증' : ''}`
                  : '공고에서 확인 필요',
              ],
            ].map(([l, v]) => (
              <div key={l}>
                <small>{l}</small>
                <b>{v}</b>
              </div>
            ))}
          </div>
          <div className="actions">
            <button className="primary" onClick={() => save(a.id)}>
              <Bookmark size={18} />
              {data.saved.includes(a.id) ? '저장 해제' : '활동 저장'}
            </button>
            <a
              className="secondary"
              href={a.url}
              target="_blank"
              rel="noreferrer"
            >
              공고 보기 · 신청은 학교 시스템에서{' '}
              <ArrowUpRight size={16} />
            </a>
          </div>
          <p className="meta">
            출처: hsportal.hansung.ac.kr 공개 목록 ·{' '}
            {snap ? snap.fetchedAt.slice(0, 10) : ''} 수집 · 신청·승인은
            학교 시스템이 결정합니다
          </p>
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

  const shown = items.filter(
    (x) =>
      inTab(x, filter, data.saved, now) &&
      activityMatch(x, query, koreanMatch),
  );
  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          {TABS.map((f) => (
            <button
              className={filter === f ? 'active' : ''}
              key={f}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
              {f === '저장한 활동'
                ? ' ' +
                  data.saved.filter((id) =>
                    items.some((x) => x.id === id),
                  ).length
                : ''}
            </button>
          ))}
        </div>
        <input
          className="field"
          aria-label="활동명 검색"
          placeholder="활동명, 운영기관 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {failed ? (
        <div className="card empty-small">
          <Search />
          <h3>활동 목록을 불러오지 못했어요.</h3>
          <p>학교 스마트자기관리시스템에서 최신 공고를 확인할 수 있어요.</p>
          <p className="empty-actions">
            <RetryButton onRetry={retry} />{' '}
            <a
              className="link"
              href="https://hsportal.hansung.ac.kr/ko/program/all"
              target="_blank"
              rel="noreferrer"
            >
              hsportal에서 직접 보기 <ArrowUpRight size={16} />
            </a>
          </p>
        </div>
      ) : !snap ? (
        <SkeletonCards />
      ) : shown.length ? (
        <>
          <ActivityCards
            items={shown}
            data={data}
            go={go}
            save={save}
            now={now}
          />
          <p className="meta">
            공식 출처 hsportal · {snap.fetchedAt.slice(0, 10)} 수집{' '}
            {snap.itemCount}건 · 신청·승인은 학교 시스템에서 진행
          </p>
        </>
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
  now,
}: {
  items: Activity[];
  data: Data;
  go: (route: string) => void;
  save: (id: string) => void;
  now: number;
}) {
  return (
    <div className="cards">
      {items.map((a, i) => {
        const live = liveStatus(a, now);
        return (
        <article className="card activity" key={a.id}>
          <div
            className={'mini-art art' + (i % 6)}
            style={
              a.cover
                ? {
                    backgroundImage: `url(${a.cover})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
          >
            <span>{live.label}</span>
            <strong>
              {live.dday ?? (i + 1).toString().padStart(2, '0')}
              <ArrowUpRight size={34} strokeWidth={1.2} />
            </strong>
            <small>HANSUNG · {a.dept.slice(0, 12)}</small>
          </div>
          <div className="pad">
            <div className="between">
              <span className="badge">
                {live.label}
                {a.points != null ? ` · ${a.points}P` : ''}
                {a.certified ? ' · 인증' : ''}
              </span>
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
                {a.title}
              </button>
            </h3>
            <p>{a.dept}</p>
            <small>
              신청 {period(a.applyStart, a.applyEnd)} · {live.label}
            </small>
            <div className="card-foot">
              <button className="link" onClick={() => go('activities/' + a.id)}>
                자세히 보기 <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </article>
        );
      })}
    </div>
  );
}
