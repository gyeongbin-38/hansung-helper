'use client';
import { useState } from 'react';
import {
  Bookmark,
  ArrowUpRight,
  Search,
  Plus,
  Trash2,
} from 'lucide-react';
import type { Data } from './data';
import { useActivities, useNow } from './catalog';
import { RetryButton, SkeletonCards } from './skeleton';
import { koreanMatch } from '@/lib/data/hangul';
import { staleLabel } from '@/lib/data/freshness';
import {
  activityMatch,
  actScore,
  liveStatus,
  extToActivity,
  ACT_STAGES,
  type Activity,
  type ExtActivity,
} from '@/lib/data/activities';

/* '직접 등록'은 필터가 아니라 등록 행동 — 툴바의 액션 버튼으로 뺐다 */
const TABS = [
  '전체',
  '신청 가능',
  '접수예정',
  '운영·마감',
  '저장한 활동',
  '취향 추천',
];

const fmt = (iso: string | null) => (iso ? iso.slice(0, 10) : '미정');
const period = (a: string | null, b: string | null) =>
  a || b ? `${fmt(a)} ~ ${fmt(b)}` : '기간 미정';

const isExt = (a: Activity) => a.id.startsWith('ext-');
const stageLabel = (id: string) =>
  ACT_STAGES.find(([k]) => k === id)?.[1] ?? id;

// 상태는 스냅샷 문자열이 아니라 신청 기간+현재 시각으로 재계산한다
function inTab(a: Activity, tab: string, saved: string[], now: number) {
  if (tab === '직접 등록') return isExt(a);
  if (isExt(a)) return tab === '전체' || tab === '저장한 활동';
  const st = liveStatus(a, now).status;
  if (tab === '신청 가능') return st === 'open' || st === 'closing';
  if (tab === '접수예정') return st === 'upcoming';
  if (tab === '운영·마감')
    return st === 'running' || st === 'closed';
  if (tab === '저장한 활동') return saved.includes(a.id);
  if (tab === '취향 추천') return true; // 정렬은 actScore가 담당
  return true;
}

const EMPTY_EXT = {
  title: '',
  org: '',
  applyStart: '',
  applyEnd: '',
  runStart: '',
  runEnd: '',
  points: '',
  url: '',
};

export function Activities({
  detail,
  filter,
  setFilter,
  query,
  setQuery,
  data,
  go,
  save,
  setActStage,
  addExtActivity,
  removeExtActivity,
  onSurvey,
}: {
  detail: string | undefined;
  filter: string;
  setFilter: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  data: Data;
  go: (route: string) => void;
  save: (id: string) => void;
  /** 활동 진행 단계 기록 (본인 확인용) */
  setActStage: (id: string, stage: string | null) => void;
  /** hsportal 외 외부 활동 직접 등록 */
  addExtActivity: (fields: Omit<ExtActivity, 'id' | 'addedAt'>) => string;
  removeExtActivity: (id: string) => void;
  /** 비교과 취향 설문 다이얼로그를 연다 */
  onSurvey: () => void;
}) {
  const { snap, failed, retry } = useActivities();
  const now = useNow(30000);
  const [extForm, setExtForm] = useState({ ...EMPTY_EXT });
  const [extError, setExtError] = useState('');
  const extItems = (data.extActivities ?? []).map(extToActivity);
  const items = [...(snap?.items ?? []), ...extItems];
  const a = items.find((x) => x.id === detail);
  // 졸업요건 연결 컨텍스트 — 입력된 포인트와 필요량(override>공식 800P)
  const hasActPrefs = (data.actPrefs ?? []).some((p) => p);
  const ptsRaw = parseInt(data.points, 10);
  const ptsSet = Number.isInteger(ptsRaw);
  const ptsReq = data.ruleOverrides?.points ?? 800;
  const actStale = snap ? staleLabel(snap.fetchedAt, now) : null;
  const pointsBand = (
    <div className="card pad act-band">
      <div>
        <b>
          {ptsSet
            ? `비교과 포인트 ${ptsRaw} / ${ptsReq}P`
            : `비교과 포인트 미입력 / ${ptsReq}P 필요`}
        </b>
        <small>
          {ptsSet
            ? ptsRaw >= ptsReq
              ? '졸업 포인트 기준을 채웠습니다'
              : `졸업까지 ${ptsReq - ptsRaw}P 남음`
            : '졸업요건에 누적 포인트를 입력하면 부족분을 계산해 드려요'}
        </small>
      </div>
      <div className="act-band-actions">
        <button className="secondary" onClick={onSurvey}>
          {hasActPrefs ? '취향 설문 다시하기' : '비교과 취향 설문'}
        </button>
        <button className="secondary" onClick={() => go('graduation')}>
          졸업요건에서 확인
        </button>
      </div>
    </div>
  );

  // 진행 단계 스테퍼 — 저장한 활동 또는 직접 등록 활동에 표시
  const stageRow = (a: Activity) => {
    const tracked = data.saved.includes(a.id) || isExt(a);
    if (!tracked) return null;
    const stage = data.actStatus?.[a.id];
    return (
      <fieldset className="act-steps" aria-label="활동 진행 단계">
        <span className={stage ? 'act-step done' : 'act-step active'}>
          저장됨
        </span>
        {ACT_STAGES.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={
              'act-step' +
              (stage === id
                ? ' active'
                : stage &&
                    ACT_STAGES.findIndex(([k]) => k === stage) >
                      ACT_STAGES.findIndex(([k]) => k === id)
                  ? ' done'
                  : '')
            }
            aria-pressed={stage === id}
            onClick={() => setActStage(a.id, stage === id ? null : id)}
          >
            {label}
          </button>
        ))}
      </fieldset>
    );
  };

  function submitExt() {
    const f = extForm;
    if (!f.title.trim() || !f.org.trim())
      return setExtError('활동명과 주최 기관을 입력해 주세요.');
    if (f.url.trim() && !/^https?:\/\//.test(f.url.trim()))
      return setExtError('링크는 http:// 또는 https://로 시작해야 합니다.');
    if (f.points.trim() && !/^\d{1,4}$/.test(f.points.trim()))
      return setExtError('포인트는 숫자만 입력해 주세요.');
    if (f.applyStart && f.applyEnd && f.applyEnd < f.applyStart)
      return setExtError('신청 마감일이 시작일보다 빠릅니다.');
    if (f.runStart && f.runEnd && f.runEnd < f.runStart)
      return setExtError('운영 종료일이 시작일보다 빠릅니다.');
    const id = addExtActivity({
      title: f.title.trim(),
      org: f.org.trim(),
      applyStart: f.applyStart,
      applyEnd: f.applyEnd,
      runStart: f.runStart,
      runEnd: f.runEnd,
      points: f.points.trim(),
      url: f.url.trim(),
    });
    setExtForm({ ...EMPTY_EXT });
    setExtError('');
    go('activities/' + id);
  }

  const extFormNode = (
    <div className="card pad ext-form">
      <h3>외부 활동 직접 등록</h3>
      <p className="meta">
        학교 공개 목록에 없는 대외활동·공모전·외부 프로그램을 기록합니다.
        입력한 내용은 공식 공고가 아닌 본인 메모입니다.
      </p>
      <div className="ext-grid">
        <label>
          활동명 *
          <input
            value={extForm.title}
            onChange={(e) =>
              setExtForm({ ...extForm, title: e.target.value })
            }
            placeholder="예: 00공모전, 해커톤, 서포터즈"
            maxLength={100}
          />
        </label>
        <label>
          주최 기관·출처 *
          <input
            value={extForm.org}
            onChange={(e) =>
              setExtForm({ ...extForm, org: e.target.value })
            }
            placeholder="예: 00재단, 공모전 사이트명"
            maxLength={60}
          />
        </label>
        <label>
          신청 시작
          <input
            type="date"
            value={extForm.applyStart}
            onChange={(e) =>
              setExtForm({ ...extForm, applyStart: e.target.value })
            }
          />
        </label>
        <label>
          신청 마감
          <input
            type="date"
            value={extForm.applyEnd}
            onChange={(e) =>
              setExtForm({ ...extForm, applyEnd: e.target.value })
            }
          />
        </label>
        <label>
          운영 시작
          <input
            type="date"
            value={extForm.runStart}
            onChange={(e) =>
              setExtForm({ ...extForm, runStart: e.target.value })
            }
          />
        </label>
        <label>
          운영 종료
          <input
            type="date"
            value={extForm.runEnd}
            onChange={(e) =>
              setExtForm({ ...extForm, runEnd: e.target.value })
            }
          />
        </label>
        <label>
          포인트(있다면)
          <input
            inputMode="numeric"
            value={extForm.points}
            onChange={(e) =>
              setExtForm({ ...extForm, points: e.target.value })
            }
            placeholder="예: 50"
            maxLength={4}
          />
        </label>
        <label>
          공고 링크
          <input
            type="url"
            value={extForm.url}
            onChange={(e) =>
              setExtForm({ ...extForm, url: e.target.value })
            }
            placeholder="https://…"
            maxLength={300}
          />
        </label>
      </div>
      {extError && <p className="form-error">{extError}</p>}
      <button className="primary" onClick={submitExt}>
        <Plus size={16} /> 활동 추가
      </button>
    </div>
  );

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
          {a.cover && (
            // eslint-disable-next-line next/no-img-element -- 외부 학교 이미지
            <img
              className="detail-cover"
              src={a.cover}
              alt=""
              loading="lazy"
            />
          )}
          <span className="badge blue">
            {liveStatus(a, now).label}
            {liveStatus(a, now).dday &&
            liveStatus(a, now).dday !== liveStatus(a, now).label
              ? ' · ' + liveStatus(a, now).dday
              : ''}
          </span>
          {isExt(a) && <span className="badge">직접 등록</span>}
          <h2>{a.title}</h2>
          <p>
            {isExt(a)
              ? `${a.dept} — 직접 등록한 활동입니다.`
              : `${a.dept}에서 운영하는 비교과 프로그램입니다.`}
          </p>
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
          {a.points != null && !isExt(a) && (
            <p className="meta">
              이 활동 완료 시 +{a.points}P
              {ptsSet
                ? ` · 누적 ${ptsRaw + a.points}P / ${ptsReq}P${
                    ptsRaw + a.points >= ptsReq
                      ? ' (졸업 기준 도달)'
                      : ` (남은 ${Math.max(0, ptsReq - ptsRaw - a.points)}P)`
                  }`
                : ' · 졸업요건에 포인트를 입력하면 잔여분을 계산합니다'}
              . 비교과 포인트 인정 여부는 학교 기준을 따릅니다.
            </p>
          )}
          {stageRow(a)}
          {data.actStatus?.[a.id] === 'credited' && (
            <p className="meta">
              포인트가 반영됐다면{' '}
              <button className="link" onClick={() => go('profile')}>
                내 정보에서 누적 포인트 갱신
              </button>
              으로 졸업요건 계산에 이어집니다.
            </p>
          )}
          <div className="actions">
            {!isExt(a) && (
              <button className="primary" onClick={() => save(a.id)}>
                <Bookmark size={18} />
                {data.saved.includes(a.id) ? '저장 해제' : '활동 저장'}
              </button>
            )}
            {a.url && (
              <a
                className="secondary"
                href={a.url}
                target="_blank"
                rel="noreferrer"
              >
                {isExt(a) ? '등록한 링크 열기 ' : '공고 보기 · 신청은 학교 시스템에서 '}
                <ArrowUpRight size={16} />
              </a>
            )}
            {isExt(a) && (
              <button
                className="secondary"
                onClick={() => {
                  removeExtActivity(a.id);
                  go('activities');
                }}
              >
                <Trash2 size={16} /> 등록 삭제
              </button>
            )}
          </div>
          {/* 안내·출처는 한 줄로 병합 — 면책은 유지하되 설명 블록을 늘리지 않는다 */}
          <p className="meta">
            {isExt(a)
              ? `단계 기록은 본인 확인용 · 직접 등록 ${
                  (data.extActivities ?? [])
                    .find((x) => x.id === a.id)
                    ?.addedAt.slice(0, 10) ?? ''
                } 추가 · 공식 공고가 아니며 포인트 인정 여부는 학교에서 확인`
              : `단계 기록은 본인 확인용 · 세부 조건·신청 절차는 공고 원문 확인 · 출처: hsportal ${
                  snap ? snap.fetchedAt.slice(0, 10) + ' 수집' : ''
                }${actStale ? ` · ${actStale}` : ''} · 신청·승인은 학교 시스템`}
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

  const scored = new Map<string, { score: number; reasons: string[] }>();
  if (filter === '취향 추천' && hasActPrefs)
    for (const x of items) scored.set(x.id, actScore(x, data.actPrefs, now));
  const shown = items
    .filter(
      (x) =>
        inTab(x, filter, data.saved, now) &&
        activityMatch(x, query, koreanMatch),
    )
    .filter((x) => filter !== '취향 추천' || (scored.get(x.id)?.score ?? 0) > 0)
    .sort((x, y) =>
      filter === '취향 추천'
        ? (scored.get(y.id)?.score ?? 0) - (scored.get(x.id)?.score ?? 0)
        : 0,
    );
  return (
    <>
      {pointsBand}
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
                  (data.saved.filter((id) =>
                    items.some((x) => x.id === id),
                  ).length +
                    extItems.length)
                : ''}
            </button>
          ))}
        </div>
        <div className="toolbar-side">
          <input
            className="field"
            aria-label="활동명 검색"
            placeholder="활동명, 운영기관 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="secondary"
            aria-pressed={filter === '직접 등록'}
            onClick={() => setFilter('직접 등록')}
          >
            <Plus size={15} /> 직접 등록
          </button>
        </div>
      </div>
      {filter === '직접 등록' && extFormNode}
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
      ) : !snap && filter !== '직접 등록' ? (
        <SkeletonCards />
      ) : filter === '취향 추천' && !hasActPrefs ? (
        <div className="card empty-small">
          <Search />
          <h3>비교과 취향 설문을 하면 맞춤 추천이 생겨요.</h3>
          <p>목표·활동 유형·일정 취향을 5문항으로 알려주세요.</p>
          <p className="empty-actions">
            <button className="primary" onClick={onSurvey}>
              비교과 설문 시작하기
            </button>
          </p>
        </div>
      ) : shown.length ? (
        <>
          <ActivityCards
            items={shown}
            data={data}
            go={go}
            save={save}
            now={now}
            scores={filter === '취향 추천' ? scored : undefined}
          />
          <p className="meta">
            {shown.length !== (snap?.itemCount ?? 0) + extItems.length &&
            filter === '전체'
              ? `조건에 맞는 ${shown.length}건 표시 중 · 전체 `
              : ''}
            {snap ? `공식 목록 ${snap.itemCount}건` : ''}
            {extItems.length
              ? `${snap ? ' + ' : ''}직접 등록 ${extItems.length}건`
              : ''}
            {snap
              ? ` · hsportal · ${snap.fetchedAt.slice(0, 10)}`
              : ''}
            {actStale ? ` · ${actStale}` : ''}
            {snap ? ' · 신청·승인은 학교 시스템에서 진행' : ''}
          </p>
        </>
      ) : (
        filter !== '직접 등록' && (
          <div className="card empty-small">
            <Search />
            <h3>조건에 맞는 활동이 없어요.</h3>
            <p className="meta">
              학교 공개 목록에 없는 외부 활동은 ‘직접 등록’ 탭에서 추가할 수
              있어요.
            </p>
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
        )
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
  scores,
}: {
  items: Activity[];
  data: Data;
  go: (route: string) => void;
  save: (id: string) => void;
  now: number;
  /** 취향 추천 탭일 때만 전달 — 맞춤 점수·근거를 카드에 표시 */
  scores?: Map<string, { score: number; reasons: string[] }>;
}) {
  return (
    <div className="cards">
      {items.map((a, i) => {
        const live = liveStatus(a, now);
        const sc = scores?.get(a.id);
        const stage = data.actStatus?.[a.id];
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
            <span>{isExt(a) ? '직접 등록' : live.label}</span>
            <strong>
              {live.dday ?? (i + 1).toString().padStart(2, '0')}
              <ArrowUpRight size={34} strokeWidth={1.2} />
            </strong>
            <small>
              {isExt(a) ? a.dept.slice(0, 12) : `HANSUNG · ${a.dept.slice(0, 12)}`}
            </small>
          </div>
          <div className="pad">
            <div className="between">
              <span className="badge">
                {isExt(a) ? '직접 등록' : live.label}
                {a.points != null ? ` · ${a.points}P` : ''}
                {a.certified ? ' · 인증' : ''}
              </span>
              {stage && (
                <span className="badge purple">{stageLabel(stage)}</span>
              )}
              {sc && sc.score > 0 && (
                <span
                  className="badge purple act-match"
                  title={
                    sc.reasons.length
                      ? `취향 매칭: ${sc.reasons.join(' · ')}`
                      : '취향 매칭'
                  }
                >
                  맞춤 {sc.score}
                </span>
              )}
              {!isExt(a) && (
                <button
                  className={'icon ' + (data.saved.includes(a.id) ? 'saved' : '')}
                  aria-label="활동 저장 전환"
                  onClick={() => save(a.id)}
                >
                  <Bookmark size={19} />
                </button>
              )}
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
