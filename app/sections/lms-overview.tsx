'use client';
import { useState, type ReactNode } from 'react';
import {
  AlarmClock,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Layers,
  Link2,
  RefreshCw,
} from 'lucide-react';
import {
  courseIsPast,
  courseProgress,
  dueSoon,
  formatLmsTime,
  kstDateNumber,
  lectureRangeStatus,
  parseDue,
  pendingTasks,
  relTime,
  submissionItems,
  type LmsCourse,
  type LmsSnapshot,
} from '@/lib/data/lms';

export type StudyStatus =
  | 'syncing'
  | 'login'
  | 'failed'
  | 'delayed'
  | 'setup'
  | 'stale'
  | 'fresh';
const STATUS: Record<StudyStatus, string> = {
  syncing: '수집 중',
  login: '로그인 필요',
  failed: '수집 실패',
  delayed: '수집 지연',
  setup: '연결 전',
  stale: '업데이트 필요',
  fresh: '수집 완료',
};
const titleOf = (c: LmsCourse) =>
  c.title
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const shortDate = (value: number) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);

export function LmsConnectionSummary({
  snap,
  now,
  status,
  issueCount,
  extInstalled,
  notifications,
  matched,
  total,
  children,
}: {
  snap: LmsSnapshot;
  now: number;
  status: StudyStatus;
  issueCount: number;
  extInstalled: boolean;
  notifications: boolean;
  matched: number | null;
  total: number;
  children: ReactNode;
}) {
  const label =
    status === 'fresh' && issueCount ? '일부 확인 필요' : STATUS[status];
  return (
    <section className="study-connection card">
      <header>
        <h2>
          <Link2 size={17} /> 연결 상태
        </h2>
        <span
          className={
            'study-status ' +
            (status === 'fresh' && !issueCount ? 'good' : 'attention')
          }
        >
          {label}
        </span>
      </header>
      <dl>
        <div>
          <dt>
            <Clock3 size={14} /> 최근 동기화
          </dt>
          <dd title={formatLmsTime(snap.fetchedAt)}>
            {relTime(snap.fetchedAt, now)}
          </dd>
        </div>
        <div>
          <dt>
            <AlarmClock size={14} /> 마감 알림
          </dt>
          <dd>
            {notifications ? '설정 켜짐' : <a href="#settings">설정하기 →</a>}
          </dd>
        </div>
        <div>
          <dt>
            <RefreshCw size={14} /> 수집 방식
          </dt>
          <dd>{extInstalled ? '브라우저 확장 연결됨' : '서버·파일 수집'}</dd>
        </div>
        <div>
          <dt>
            <BookOpen size={14} /> 과목 연결
          </dt>
          <dd>
            {matched === null
              ? '자료 불러오는 중'
              : `${matched} / ${total}과목`}
          </dd>
        </div>
      </dl>
      <details className="study-management">
        <summary>연결 관리</summary>
        {children}
      </details>
    </section>
  );
}

export function LmsOverview({
  snap,
  now,
  before,
  status,
  issueCount,
  detail,
  renderCourse,
  connection,
  attention,
  onRefresh,
  canRefresh,
}: {
  snap: LmsSnapshot;
  now: number;
  before?: number | null;
  status: StudyStatus;
  issueCount: number;
  detail?: string;
  renderCourse: (c: LmsCourse) => ReactNode;
  connection: ReactNode;
  attention?: ReactNode;
  onRefresh?: () => void;
  canRefresh: boolean;
}) {
  const [filter, setFilter] = useState<'all' | 'lecture' | 'task'>('all');
  const [sort, setSort] = useState('due');
  const [showAll, setShowAll] = useState(!!detail);
  const [selected, setSelected] = useState<string | null>(detail ?? null);
  const courses = snap.courses.filter((c) => !courseIsPast(c, before));
  const past = snap.courses.filter((c) => courseIsPast(c, before));
  const submissions = submissionItems(snap, before).filter((t) => !t.past);
  const unfinished = submissions.filter((t) => !t.submitted || t.uncertain);
  const progress = courses.reduce(
    (sum, c) => {
      const p = courseProgress(c);
      return { done: sum.done + p.done, total: sum.total + p.total };
    },
    { done: 0, total: 0 },
  );
  const today = unfinished.filter((t) => {
    const at = t.dueTs;
    return at !== null && at >= now && kstDateNumber(at) === kstDateNumber(now);
  });
  const due = dueSoon(snap, now, 7, 0, before);
  const nextDue = (c: LmsCourse) =>
    Math.min(
      ...pendingTasks({ ...snap, courses: [c] }, before).map(
        (t) => parseDue(t.due) ?? Infinity,
      ),
      Infinity,
    );
  const filtered = courses
    .filter((c) =>
      filter === 'lecture'
        ? c.vods.length > 0
        : filter === 'task'
          ? c.assigns.length + c.quizzes.length > 0
          : true,
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.title.localeCompare(b.title, 'ko')
        : nextDue(a) - nextDue(b),
    );
  const displayed = showAll ? filtered : filtered.slice(0, 5);
  const currentStatus =
    status === 'fresh' && issueCount ? '일부 확인 필요' : STATUS[status];
  return (
    <div className="study-overview">
      <div className="study-metrics">
        <article className="card">
          <span className="study-metric-icon blue">
            <CalendarDays size={22} />
          </span>
          <div>
            <small>온라인 강의</small>
            <strong>
              {progress.done}
              <span> / {progress.total}강</span>
            </strong>
          </div>
        </article>
        <a className="card" href="#lms/tasks">
          <span className="study-metric-icon blue">
            <Layers size={22} />
          </span>
          <div>
            <small>남은 과제·퀴즈</small>
            <strong>
              {unfinished.length}
              <span>건</span>
            </strong>
          </div>
          <ArrowRight size={15} />
        </a>
        <a className="card" href="#lms/tasks">
          <span className="study-metric-icon orange">
            <AlarmClock size={22} />
          </span>
          <div>
            <small>오늘 마감</small>
            <strong>
              {today.length}
              <span>건</span>
            </strong>
          </div>
        </a>
        <article className="card">
          <span
            className={
              'study-metric-icon ' +
              (status === 'fresh' && !issueCount ? 'green' : 'orange')
            }
          >
            <Link2 size={22} />
          </span>
          <div>
            <small>COSMOS 수집 상태</small>
            <strong className="study-metric-status">{currentStatus}</strong>
          </div>
        </article>
      </div>
      <div className="study-layout">
        <div className="study-primary">
          <section
            className={
              'study-sync ' +
              (status === 'fresh' && !issueCount ? '' : 'needs-attention')
            }
            aria-live="polite"
          >
            <span className="study-sync-mark">
              {status === 'fresh' && !issueCount ? (
                <CheckCircle2 size={23} />
              ) : (
                <CircleAlert size={23} />
              )}
            </span>
            <div>
              <h2>{currentStatus}</h2>
              <p>
                {snap.fetchedAt
                  ? `${formatLmsTime(snap.fetchedAt)} 기준`
                  : '확인 시각 없음'}
                {status === 'failed' ||
                status === 'delayed' ||
                status === 'stale'
                  ? ' · 이전 수집값 표시 중'
                  : ''}
              </p>
            </div>
            <div className="study-sync-count">
              <small>수집 과목</small>
              <b>{snap.courses.length}개</b>
            </div>
            {canRefresh && (
              <button
                type="button"
                className="study-refresh"
                aria-label="COSMOS 새로고침"
                onClick={onRefresh}
                disabled={status === 'syncing'}
              >
                <RefreshCw
                  size={17}
                  className={status === 'syncing' ? 'spin' : ''}
                />
              </button>
            )}
          </section>
          <section className="card study-courses">
            <header className="study-list-head">
              <h2>
                과목별 현황 <span>{courses.length}과목</span>
              </h2>
              <div className="study-list-controls">
                <fieldset className="study-segments">
                  <legend className="sr-only">과목 종류</legend>
                  {(
                    [
                      ['all', '전체'],
                      ['lecture', '강의'],
                      ['task', '과제·퀴즈'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      aria-pressed={filter === key}
                      onClick={() => {
                        setFilter(key);
                        setShowAll(false);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </fieldset>
                <select
                  aria-label="과목 정렬"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="due">마감 임박순</option>
                  <option value="name">과목명순</option>
                </select>
              </div>
            </header>
            <div className="study-course-list">
              {displayed.map((c) => {
                const p = courseProgress(c);
                const items = pendingTasks(
                  { ...snap, courses: [c] },
                  before,
                ).sort(
                  (a, b) =>
                    (parseDue(a.due) ?? Infinity) -
                    (parseDue(b.due) ?? Infinity),
                );
                const section = c.title.match(/\[([^\]]{1,8})\]/)?.[1];
                const percent = p.total
                  ? Math.round((p.done / p.total) * 100)
                  : null;
                const uncertain =
                  !!c.errors?.length ||
                  c.vods.some(
                    (v) =>
                      v.uncertain || lectureRangeStatus(c, v).rangeUncertain,
                  ) ||
                  [...c.assigns, ...c.quizzes].some((t) => t.uncertain);
                return (
                  <article
                    className={
                      'study-course' + (selected === c.id ? ' expanded' : '')
                    }
                    key={c.id}
                    id={`study-course-${c.id}`}
                  >
                    <button
                      className="study-course-toggle"
                      type="button"
                      aria-expanded={selected === c.id}
                      aria-controls={`study-detail-${c.id}`}
                      onClick={() =>
                        setSelected(selected === c.id ? null : c.id)
                      }
                    >
                      <span className="study-section">
                        {section ?? <BookOpen size={17} />}
                      </span>
                      <span className="study-course-name">
                        <b title={c.title}>{titleOf(c)}</b>
                        <small>
                          {c.prof || '교수 미기재'}
                          {uncertain ? ' · 확인 필요' : ''}
                        </small>
                      </span>
                      <span className="study-course-progress">
                        {percent !== null ? (
                          <>
                            <span>
                              강의 {p.done} / {p.total}
                              <b>{percent}%</b>
                            </span>
                            <progress
                              value={p.done}
                              max={p.total}
                              aria-label={`${titleOf(c)} 강의 수강률`}
                            />
                          </>
                        ) : (
                          <small>온라인 강의 없음</small>
                        )}
                      </span>
                      <span className="study-course-preview">
                        {items.length ? (
                          items.slice(0, 2).map((t, i) => {
                            const at = parseDue(t.due);
                            return (
                              <span key={i}>
                                <em
                                  className={
                                    'study-tag ' +
                                    (t.kind === '강의'
                                      ? 'lecture'
                                      : 'assignment')
                                  }
                                >
                                  {t.kind}
                                </em>
                                <b>{t.title}</b>
                                <small>
                                  {t.uncertain || t.rangeUncertain
                                    ? '확인 필요'
                                    : at === null
                                      ? '마감 미정'
                                      : shortDate(at)}
                                </small>
                              </span>
                            );
                          })
                        ) : (
                          <small>
                            {uncertain
                              ? '수집 결과를 확인해 주세요'
                              : '남은 항목 없음'}
                          </small>
                        )}
                      </span>
                      <ChevronRight
                        size={17}
                        className="study-course-chevron"
                      />
                    </button>
                    {selected === c.id && (
                      <div
                        className="study-course-detail"
                        id={`study-detail-${c.id}`}
                      >
                        {renderCourse(c)}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {!filtered.length && (
              <p className="study-empty">
                {courses.length
                  ? '해당하는 과목이 없어요.'
                  : '현재 학기 수업이 없어요.'}
              </p>
            )}
            {filtered.length > 5 && (
              <button
                type="button"
                className="study-more"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll
                  ? '간단히 보기'
                  : `전체 과목 보기 (${filtered.length})`}{' '}
                <ArrowRight size={15} />
              </button>
            )}
            {!!past.length && (
              <details
                className="study-archive"
                open={past.some((c) => c.id === detail)}
              >
                <summary>지난 학기 {past.length}과목</summary>
                {past.map((c) => (
                  <div key={c.id}>{renderCourse(c)}</div>
                ))}
              </details>
            )}
          </section>
        </div>
        <aside className="study-side">
          <section className="card study-due">
            <header>
              <h2>
                <AlarmClock size={17} /> 마감 임박
              </h2>
              <a href="#lms/tasks">
                전체 보기 <ArrowRight size={13} />
              </a>
            </header>
            {due.length ? (
              due.slice(0, 4).map((t, i) => {
                const d = kstDateNumber(t.dueTs) - kstDateNumber(now);
                return (
                  <div className="study-due-row" key={i}>
                    <span
                      className={
                        'study-tag ' +
                        (t.kind === '강의' ? 'lecture' : 'assignment')
                      }
                    >
                      {t.kind}
                    </span>
                    <div>
                      {t.url ? (
                        <a href={t.url} target="_blank" rel="noreferrer">
                          {t.title}
                        </a>
                      ) : (
                        <b>{t.title}</b>
                      )}
                      <small>
                        {t.course.replace(/\[[^\]]*\]/g, '').trim()}
                      </small>
                      <small>
                        {shortDate(t.dueTs)}
                        {t.uncertain || t.rangeUncertain ? ' · 확인 필요' : ''}
                      </small>
                    </div>
                    <span className={'study-dday ' + (d === 0 ? 'today' : '')}>
                      {d === 0 ? '오늘' : `D-${d}`}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="study-empty">7일 내 마감이 없어요.</p>
            )}
          </section>
          {connection}
          {attention}
        </aside>
      </div>
    </div>
  );
}
