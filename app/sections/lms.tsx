'use client';
import {
  ArrowUpRight,
  Copy,
  Download,
  MonitorPlay,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Account } from '../account-flow';
import type { Data } from './data';
import type { Catalog } from '@/lib/data/catalog';
import {
  bingeQueue,
  courseProgress,
  dueSoon,
  matchEnrollment,
  pendingTasks,
  relTime,
  staleDays,
  submissionItems,
  validateLms,
  weekProgress,
  type BingeItem,
  type LmsCourse,
  type LmsSnapshot,
  type SubmissionItem,
} from '@/lib/data/lms';

const LMS_BASE = 'https://learn.hansung.ac.kr';
const DAY = 86400000;

/** 수집 오류 코드 → 화면 표시명 */
const ERROR_LABELS: Record<string, string> = {
  vod: '강의',
  assign: '과제',
  quiz: '퀴즈',
  'quiz-check': '퀴즈 응시 여부',
  timeout: '수집 시간 초과',
};

/** 수강 기간 원문 'YYYY-MM-DD … ~ YYYY-MM-DD …' → 'MM-DD ~ MM-DD' 축약 */
const shortRange = (r?: string) => {
  if (!r) return '';
  const m = r.match(/(\d{4})-(\d{2})-(\d{2}).*?(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}-${m[3]} ~ ${m[5]}-${m[6]}` : r;
};

/** LMS 원문 과목명 → 표시용 정제. '[A]' 분반을 배지로 분리하고
 *  '교과(온라인) 학부 … 김교수' 같은 장식 토큰을 벗긴다.
 *  매칭용 키(lmsKey)와 별개로 표시만 다듬는다. */
const DISPLAY_DECOR =
  /(교과|비교과|커뮤니티|학부|대학원|전공|교양)(\s*\([^)]*\))?(?=\s|$)/g;
const courseDisplay = (c: LmsCourse) => {
  const m = c.title.match(/\[([^\]]{1,8})\]/);
  const section = m?.[1]?.trim();
  let t = c.title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(DISPLAY_DECOR, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (c.prof && t.endsWith(c.prof)) t = t.slice(0, -c.prof.length).trim();
  return { title: t || c.title, section };
};

function TaskRow({
  kind,
  title,
  url,
  due,
  uncertain,
  watched,
  required,
  now,
}: {
  kind: string;
  title: string;
  url?: string;
  due: string | null;
  /** 제출·응시 여부 확인 실패 — 미완료로 단정하지 않고 표시만 한다 */
  uncertain?: boolean;
  /** 시청시간/요구시간 — 강의 항목에서만 온다 */
  watched?: string;
  required?: string;
  now: number;
}) {
  const ts = due ? Date.parse(due.replace(' ', 'T')) : null;
  const dd = ts !== null && !Number.isNaN(ts) ? Math.ceil((ts - now) / DAY) : null;
  const tint =
    kind === '과제' ? 't-assign' : kind === '퀴즈' ? 't-quiz' : 't-vod';
  return (
    <div className={`lms-task ${tint}`}>
      <span className={`badge ${kind === '과제' ? 'orange' : kind === '퀴즈' ? 'purple' : 'blue'}`}>
        {kind}
      </span>
      <div>
        {url ? (
          <a className="link" href={url} target="_blank" rel="noreferrer">
            {title} <ArrowUpRight size={13} />
          </a>
        ) : (
          <b>{title}</b>
        )}
        <small>
          {due
            ? `마감·기간 ${due}${dd !== null ? (dd < 0 ? ' (지남)' : dd === 0 ? ' (오늘)' : ` (D-${dd})`) : ''}`
            : '마감 미기재'}
          {uncertain ? ' · 응시 여부 확인 실패' : ''}
          {watched
            ? ` · 시청 ${watched}${required ? ` / 요구 ${required}` : ''}`
            : ''}
        </small>
      </div>
    </div>
  );
}

function CourseCard({
  c,
  now,
  forceOpen,
}: {
  c: LmsCourse;
  now: number;
  /** 검색·advisor 딥링크(lms/{courseId})로 진입 — 해당 카드를 펼친다 */
  forceOpen?: boolean;
}) {
  const { done, total } = courseProgress(c);
  const weeks = weekProgress(c);
  const pend = [
    ...c.vods
      .filter((v) => !v.attended)
      .map((v) => ({
        kind: '강의',
        title: v.title,
        url: v.url,
        due: v.range ?? null,
        watched: v.watched,
        required: v.required,
      })),
    ...c.assigns
      .filter((a) => !a.submitted)
      .map((a) => ({
        kind: '과제',
        title: a.title,
        url: a.url,
        due: a.due ?? null,
      })),
    ...c.quizzes
      .filter((q) => !q.submitted)
      .map((q) => ({
        kind: '퀴즈',
        title: q.title,
        url: q.url,
        due: q.due ?? null,
        uncertain: q.uncertain,
      })),
  ];
  const disp = courseDisplay(c);
  return (
    <details
      id={`lms-c-${c.id}`}
      className="lms-course"
      open={forceOpen || (pend.length > 0 && pend.length <= 8)}
    >
      <summary>
        <div className="lms-course-head">
          <b title={c.title}>
            {disp.title}
            {disp.section && (
              <span className="lms-sect-badge">{disp.section}</span>
            )}
          </b>
          <small>
            {c.prof || '교수 미기재'}
            {c.community ? ' · 커뮤니티' : ''}
          </small>
        </div>
        <div className="lms-course-stat">
          {total > 0 && (
            <>
              <progress
                className="progress-track"
                value={done}
                max={total}
                aria-label={`온라인 강의 수강률 ${done}/${total}`}
              />
              <small>
                강의 {done}/{total}
              </small>
            </>
          )}
          <small>
            {pend.length ? `남은 ${pend.length}건` : '모두 완료'}
          </small>
        </div>
      </summary>
      {c.errors?.length ? (
        <p className="meta">
          일부 항목을 수집하지 못했습니다:{' '}
          {c.errors.map((e) => ERROR_LABELS[e] ?? e).join(', ')} — COSMOS에서
          직접 확인해 주세요.
        </p>
      ) : null}
      {weeks.length > 0 && (
        <div className="lms-weeks" aria-label="주차별 강의 진도">
          {weeks.map((w) => (
            <div
              className={'lms-week' + (w.done === w.total ? ' done' : '')}
              key={w.week}
            >
              <div className="lms-week-head">
                <b>{w.week}주차</b>
                <span>{w.done}/{w.total}</span>
              </div>
              <progress
                className="progress-track"
                value={w.done}
                max={w.total}
                aria-label={`${w.week}주차 강의 ${w.done}/${w.total} 수강`}
              />
              {w.range && <small>{shortRange(w.range)}</small>}
            </div>
          ))}
        </div>
      )}
      {pend.length ? (
        <div className="lms-tasks">
          {pend.map((t, i) => (
            <TaskRow key={i} {...t} now={now} />
          ))}
        </div>
      ) : (
        <p className="meta">남은 강의·과제·퀴즈가 없습니다.</p>
      )}
      <a
        className="link"
        href={`${LMS_BASE}/course/view.php?id=${c.id}`}
        target="_blank"
        rel="noreferrer"
      >
        COSMOS에서 열기 <ArrowUpRight size={14} />
      </a>
    </details>
  );
}

/** 안 들은 강의 한 줄 — 몰아듣기 큐용 */
function BingeRow({ b, now }: { b: BingeItem; now: number }) {
  const overdue = b.dueTs !== null && b.dueTs <= now;
  const dd = b.dueTs !== null ? Math.ceil((b.dueTs - now) / DAY) : null;
  return (
    <div className="lms-task t-vod">
      <span className={'badge ' + (overdue ? 'orange' : 'blue')}>
        {b.week ? `${b.week}주차` : '강의'}
      </span>
      <div>
        {b.url ? (
          <a className="link" href={b.url} target="_blank" rel="noreferrer">
            {b.title} <ArrowUpRight size={13} />
          </a>
        ) : (
          <b>{b.title}</b>
        )}
        <small>
          {b.course}
          {b.range ? ` · ${shortRange(b.range)}` : ''}
          {dd !== null
            ? dd < 0
              ? ' · 기한 지남'
              : dd === 0
                ? ' · 오늘까지'
                : ` · D-${dd}`
            : ''}
          {b.weeklyStatus
            ? ` · ${b.weeklyStatus}`
            : b.status
              ? ` · 출석 ${b.status}`
              : ''}
          {b.watched
            ? ` · 시청 ${b.watched}${b.required ? ` / 요구 ${b.required}` : ''}`
            : ''}
        </small>
      </div>
    </div>
  );
}

/** 안 들은 온라인 강의를 수강 기간 마감순으로 나열한 몰아듣기 큐 */
function BingeView({ snap, now }: { snap: LmsSnapshot; now: number }) {
  const queue = bingeQueue(snap);
  if (!queue.length)
    return (
      <p className="meta">
        안 들은 온라인 강의가 없습니다 — 모두 수강했거나 강의가 수집되지
        않았습니다.
      </p>
    );
  const urgent = queue.filter(
    (b) => b.dueTs !== null && b.dueTs <= now + 3 * DAY,
  ).length;
  return (
    <>
      <p className="meta">
        안 들은 강의 {queue.length}개{urgent ? ` · 3일 내 기한 ${urgent}개` : ''}
        — 수강 기간 마감이 빠른 순입니다. 링크는 COSMOS 강의로 연결되고,
        수강 반영은 재수집 후 확인됩니다.
      </p>
      <div className="lms-tasks">
        {queue.map((b, i) => (
          <BingeRow key={i} b={b} now={now} />
        ))}
      </div>
    </>
  );
}

/** 과제·퀴즈 한 줄 — 제출·응시 상태 배지 포함 */
function SubmissionRow({ s, now }: { s: SubmissionItem; now: number }) {
  const dd = s.dueTs !== null ? Math.ceil((s.dueTs - now) / DAY) : null;
  return (
    <div className={`lms-task ${s.kind === '과제' ? 't-assign' : 't-quiz'}`}>
      <span className={'badge ' + (s.kind === '과제' ? 'orange' : 'purple')}>
        {s.kind}
      </span>
      <div>
        {s.url ? (
          <a className="link" href={s.url} target="_blank" rel="noreferrer">
            {s.title} <ArrowUpRight size={13} />
          </a>
        ) : (
          <b>{s.title}</b>
        )}
        <small>
          {s.course}
          {s.due
            ? ` · 마감 ${s.due}${dd !== null ? (dd < 0 ? ' (지남)' : dd === 0 ? ' (오늘)' : ` (D-${dd})`) : ''}`
            : ' · 마감 미기재'}
        </small>
      </div>
      <span
        className={
          'badge ' +
          (s.submitted ? 'green' : s.uncertain ? 'purple' : 'orange')
        }
      >
        {s.submitted
          ? s.kind === '퀴즈'
            ? '응시 완료'
            : '제출 완료'
          : s.uncertain
            ? '응시 여부 확인 실패'
            : s.kind === '퀴즈'
              ? '미응시'
              : '미제출'}
      </span>
    </div>
  );
}

/** 전체 과제·퀴즈 — 제출·응시 완료 항목 포함 통합 현황 */
function SubmissionsView({ snap, now }: { snap: LmsSnapshot; now: number }) {
  const items = submissionItems(snap);
  if (!items.length)
    return <p className="meta">수집된 과제·퀴즈가 없습니다.</p>;
  const done = items.filter((i) => i.submitted).length;
  return (
    <>
      <p className="meta">
        과제·퀴즈 {items.length}건 — 완료 {done} · 남은 것{' '}
        {items.length - done}. 링크는 COSMOS 제출·응시 페이지로 연결됩니다.
      </p>
      <div className="lms-tasks">
        {items.map((s, i) => (
          <SubmissionRow key={i} s={s} now={now} />
        ))}
      </div>
    </>
  );
}

/** 확장 프로그램 동기화 상태 — page.tsx의 브리지 이벤트로 갱신된다 */
export type ExtSync = {
  installed: boolean;
  version?: string;
  status: 'idle' | 'syncing' | 'success' | 'login-required' | 'failed';
  error?: string;
};

/** 스냅샷의 수집 경로 표시명 — diag가 있는 수집은 브라우저(확장·콘솔) */
const viaLabel = (snap?: LmsSnapshot) => {
  const v = snap?.diag?.coursesVia;
  if (v === 'dashboard') return '브라우저 수집';
  if (v === 'link-scan') return '브라우저 수집(링크 스캔)';
  if (snap?.diag) return '브라우저 수집';
  return snap ? '서버·파일 수집' : '아직 없음';
};

export function LmsSection({
  data,
  persist,
  notify,
  serverCollecting,
  collectFailed,
  lmsUnavailable,
  studentMask,
  onAccount,
  detail,
  ext,
  onExtRefresh,
  catalog,
}: {
  data: Data;
  persist: (next: Data, msg?: string) => Promise<boolean>;
  notify?: (msg: string) => void;
  /** 로그인 계정의 서버 측 COSMOS 수집이 백그라운드로 진행 중 */
  serverCollecting?: boolean;
  /** 서버 측 수집이 실패/중단된 상태 — 계정 연결 자체는 유지됨 */
  collectFailed?: boolean;
  /** 포털 로그인은 됐지만 COSMOS 접속 자체가 실패한 상태 */
  lmsUnavailable?: boolean;
  /** 연결된 계정의 마스킹된 학번 — 재수집 폼 힌트용 */
  studentMask?: string;
  /** 서버 응답의 최신 계정 스냅샷을 상위 상태에 반영 */
  onAccount?: (account: Account) => void;
  /** 검색·advisor 딥링크의 과목 id — 해당 카드를 펼치고 스크롤 */
  detail?: string;
  /** 확장 프로그램 브리지 상태 */
  ext?: ExtSync;
  /** 확장 수집 즉시 실행 요청 — 미설치면 상위에서 무시된다 */
  onExtRefresh?: () => void;
  /** 개설강의 카탈로그 — LMS 과목 매칭 진단용 */
  catalog?: Catalog | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const [copying, setCopying] = useState(false);
  const [now] = useState(() => Date.now());
  const [view, setView] = useState<'courses' | 'binge' | 'submit'>('courses');
  const snap = data.lms;
  const stale = snap ? staleDays(snap, now) : null;
  const canRefresh = !!onAccount && !!studentMask;
  const extStatus: ExtSync = ext ?? { installed: false, status: 'idle' };
  const syncing = !!serverCollecting || extStatus.status === 'syncing';
  const pendCount = snap ? pendingTasks(snap).length : 0;

  // 단일 동기화 상태 — 밴드와 연결 관리가 같은 판정을 본다
  const band: 'syncing' | 'login' | 'failed' | 'setup' | 'stale' | 'fresh' =
    syncing
      ? 'syncing'
      : extStatus.status === 'login-required'
        ? 'login'
        : extStatus.status === 'failed' || collectFailed || lmsUnavailable
          ? 'failed'
          : !snap
            ? 'setup'
            : stale !== null && stale >= 7
              ? 'stale'
              : 'fresh';
  const lastError =
    extStatus.status === 'failed'
      ? extStatus.error
      : lmsUnavailable
        ? 'COSMOS 접속 실패'
        : collectFailed
          ? '서버 수집 미완료'
          : undefined;

  // 카탈로그 매칭 진단 — 이름이 다른 과목은 조용히 넘기지 않고 집계한다
  const unmatched = snap && catalog
    ? matchEnrollment(snap, catalog)
        .filter((m) => m.sections.length === 0)
        .map((m) => m.course.title)
    : [];

  // 딥링크가 바뀌면 과목별 뷰로 돌아간다 — 대상 카드는 그 뷰에만 있다
  // (렌더 중 상태 조정 패턴 — effect 내 setState 대신)
  const [prevDetail, setPrevDetail] = useState(detail);
  if (detail !== prevDetail) {
    setPrevDetail(detail);
    if (detail) setView('courses');
  }

  useEffect(() => {
    if (!detail || !snap) return;
    document
      .getElementById(`lms-c-${detail}`)
      ?.scrollIntoView({ block: 'start' });
  }, [detail, snap]);

  const importJson = async (raw: string) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      const valid = validateLms(parsed);
      if (!valid) {
        setErr('수집 파일 형식이 아닙니다. lms-data.json을 선택했는지 확인해 주세요.');
        return;
      }
      setErr('');
      await persist({ ...data, lms: valid }, '수업 현황을 가져왔습니다.');
    } catch {
      setErr('JSON 파일을 읽지 못했습니다. 수집 스크립트를 다시 실행해 보세요.');
    }
  };

  const copyScript = async () => {
    setCopying(true);
    try {
      const src = await fetch('/lms-collect.js').then((r) => r.text());
      await navigator.clipboard.writeText(src);
      notify?.('수집 스크립트를 복사했습니다. COSMOS 콘솔에 붙여넣으세요.');
    } catch {
      setErr('복사에 실패했습니다. 스크립트 파일을 열어 직접 복사해 주세요.');
    }
    setCopying(false);
  };

  return (
    <>
      <SyncBand
        band={band}
        snap={snap}
        now={now}
        pending={pendCount}
        error={lastError}
        extInstalled={extStatus.installed}
        serverCollecting={serverCollecting}
        onExtRefresh={onExtRefresh}
      />

      {!snap ? (
        <SetupGuide
          band={band}
          copying={copying}
          copyScript={copyScript}
          onImport={() => fileRef.current?.click()}
          err={err}
          canRefresh={canRefresh}
          studentMask={studentMask}
          onAccount={onAccount}
          notify={notify}
          busy={serverCollecting}
        />
      ) : (
        <div className="lms-grid">
          <section className="card pad lms-main">
            <div className="between">
              <div className="lms-tabs" role="tablist" aria-label="수업 현황 보기">
                <button
                  role="tab"
                  aria-selected={view === 'courses'}
                  className={'badge' + (view === 'courses' ? ' sel' : '')}
                  onClick={() => setView('courses')}
                >
                  과목별
                </button>
                <button
                  role="tab"
                  aria-selected={view === 'binge'}
                  className={'badge' + (view === 'binge' ? ' sel' : '')}
                  onClick={() => setView('binge')}
                >
                  몰아듣기
                </button>
                <button
                  role="tab"
                  aria-selected={view === 'submit'}
                  className={'badge' + (view === 'submit' ? ' sel' : '')}
                  onClick={() => setView('submit')}
                >
                  제출·응시
                </button>
              </div>
              <small className="meta">
                남은 항목 {pendCount}건
              </small>
            </div>
            {view === 'courses' && (
              <div className="lms-courses">
                {snap.courses.map((c) => (
                  <CourseCard
                    key={c.id}
                    c={c}
                    now={now}
                    forceOpen={detail === c.id}
                  />
                ))}
              </div>
            )}
            {view === 'binge' && <BingeView snap={snap} now={now} />}
            {view === 'submit' && <SubmissionsView snap={snap} now={now} />}
          </section>

          <aside className="lms-side">
            <section className="card pad">
              <h3>마감 임박</h3>
              <DueSoonList snap={snap} now={now} />
            </section>
            <ConnCard
              snap={snap}
              now={now}
              ext={extStatus}
              syncing={syncing}
              lastError={lastError}
              unmatched={unmatched}
              catalogReady={!!catalog}
              canRefresh={canRefresh}
              studentMask={studentMask}
              onAccount={onAccount}
              notify={notify}
              busy={serverCollecting}
              onExtRefresh={onExtRefresh}
              onImport={() => fileRef.current?.click()}
              onDelete={async () =>
                await persist(
                  { ...data, lms: undefined },
                  '수업 현황 데이터를 삭제했습니다.',
                )
              }
              err={err}
            />
          </aside>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.currentTarget.files?.[0];
          if (f) await importJson(await f.text());
          e.currentTarget.value = '';
        }}
      />
    </>
  );
}

/** 상단 동기화 상태 밴드 — 현재 상태·마지막 동기화·남은 항목·경로를 한눈에 */
function SyncBand({
  band,
  snap,
  now,
  pending,
  error,
  extInstalled,
  serverCollecting,
  onExtRefresh,
}: {
  band: 'syncing' | 'login' | 'failed' | 'setup' | 'stale' | 'fresh';
  snap?: LmsSnapshot;
  now: number;
  pending: number;
  error?: string;
  extInstalled: boolean;
  serverCollecting?: boolean;
  onExtRefresh?: () => void;
}) {
  const head: Record<typeof band, { t: string; d: string }> = {
    syncing: {
      t: '수업 현황을 수집하고 있습니다',
      d: serverCollecting
        ? '학교 계정으로 서버에서 COSMOS를 수집 중입니다. 완료되면 자동으로 반영됩니다.'
        : '확장 프로그램이 COSMOS에서 최신 데이터를 가져오고 있습니다.',
    },
    login: {
      t: 'COSMOS 로그인이 필요합니다',
      d: 'learn.hansung.ac.kr에 로그인하면 자동 수집이 재개됩니다.',
    },
    failed: {
      t: '마지막 수집에 실패했습니다',
      d: snap
        ? '아래는 이전에 수집된 데이터입니다. 다시 시도해 주세요.'
        : '아직 표시할 데이터가 없습니다. 다시 시도해 주세요.',
    },
    setup: {
      t: 'COSMOS 수업 현황을 연결하세요',
      d: '강의 수강·과제·퀴즈·출석을 한 화면에서 확인할 수 있습니다.',
    },
    stale: {
      t: '수집된 지 오래된 데이터입니다',
      d: 'COSMOS에서 변경된 내용은 재수집해야 반영됩니다.',
    },
    fresh: {
      t: '최신 상태입니다',
      d: '데이터는 수집 시점 기준입니다. 이후 변경은 다음 수집에 반영됩니다.',
    },
  };
  const info = head[band];
  return (
    <section className={`lms-band band-${band}`} aria-live="polite">
      <div className="band-main">
        <span className="band-dot" aria-hidden="true" />
        <div>
          <h2>{info.t}</h2>
          <p>
            {info.d}
            {band === 'failed' && error ? ` 오류: ${error}` : ''}
          </p>
        </div>
      </div>
      {snap && (
        <dl className="band-metrics">
          <div>
            <dt>과목</dt>
            <dd>{snap.courses.length}</dd>
          </div>
          <div>
            <dt>남은 항목</dt>
            <dd>{pending}</dd>
          </div>
          <div>
            <dt>마지막 동기화</dt>
            <dd>{relTime(snap.fetchedAt, now)}</dd>
          </div>
          <div>
            <dt>수집 경로</dt>
            <dd>{viaLabel(snap)}</dd>
          </div>
        </dl>
      )}
      <div className="band-actions">
        {band === 'login' ? (
          <a
            className="band-cta"
            href={`${LMS_BASE}/login/`}
            target="_blank"
            rel="noreferrer"
          >
            COSMOS 로그인 <ArrowUpRight size={15} />
          </a>
        ) : (
          <button
            className="band-cta"
            onClick={onExtRefresh}
            disabled={!extInstalled || band === 'syncing'}
            title={
              extInstalled
                ? '확장 프로그램으로 즉시 수집'
                : '확장 프로그램 설치 시 사용할 수 있습니다'
            }
          >
            <RefreshCw size={15} className={band === 'syncing' ? 'spin' : ''} />
            {band === 'syncing' ? '수집 중…' : '지금 새로고침'}
          </button>
        )}
        <span className="band-note">
          {extInstalled ? '15분 간격 자동 수집' : '확장 설치 시 자동 수집'}
        </span>
        <a
          className="band-link"
          href={LMS_BASE}
          target="_blank"
          rel="noreferrer"
        >
          COSMOS 열기 <ArrowUpRight size={14} />
        </a>
      </div>
    </section>
  );
}

/** 데이터가 없을 때의 설정 가이드 — 확장 우선, 스크립트는 보조 수단 */
function SetupGuide({
  band,
  copying,
  copyScript,
  onImport,
  err,
  canRefresh,
  studentMask,
  onAccount,
  notify,
  busy,
}: {
  band: string;
  copying: boolean;
  copyScript: () => Promise<void>;
  onImport: () => void;
  err: string;
  canRefresh: boolean;
  studentMask?: string;
  onAccount?: (account: Account) => void;
  notify?: (msg: string) => void;
  busy?: boolean;
}) {
  return (
    <section className="card pad">
      <div className="lms-guide-head">
        <MonitorPlay size={26} />
        <div>
          <h2>수업 현황 가져오기</h2>
          <p className="meta">
            수집은 본인 브라우저 안에서만 이뤄지며 로그인 정보는 어디에도
            전송되지 않습니다.
          </p>
        </div>
      </div>
      <ol className="lms-steps">
        <li>
          <b>확장 프로그램 설치(권장)</b> — chrome://extensions에서 개발자 모드를
          켜고 <code>압축해제된 확장 프로그램 로드</code>로 프로젝트의{' '}
          <code>extension/</code> 폴더를 선택합니다. 한 번만 하면 됩니다.
        </li>
        <li>
          <a className="link" href={LMS_BASE} target="_blank" rel="noreferrer">
            learn.hansung.ac.kr
          </a>
          에 로그인하고 내 강의실(대시보드)을 열어 둡니다.
        </li>
        <li>
          이 페이지를 새로고침하면 수집이 자동으로 시작되고, 이후 15분 간격으로
          최신 상태가 반영됩니다.
        </li>
      </ol>
      {canRefresh && (
        <RefreshForm
          studentMask={studentMask!}
          onAccount={onAccount!}
          notify={notify}
          busy={busy}
        />
      )}
      <details className="lms-manual">
        <summary>확장 없이 수동으로 가져오기</summary>
        <p className="meta">
          확장을 설치할 수 없는 환경에서는 COSMOS 페이지의 개발자 도구 콘솔에서
          수집 스크립트를 실행해 결과 파일을 가져올 수 있습니다.
        </p>
        <div className="lms-script-actions">
          <button
            className="secondary"
            onClick={() => void copyScript()}
            disabled={copying}
          >
            <Copy size={14} /> {copying ? '복사 중…' : '스크립트 복사'}
          </button>
          <a
            className="secondary"
            href="/lms-collect.js"
            target="_blank"
            rel="noreferrer"
          >
            <Download size={14} /> 스크립트 파일
          </a>
          <button className="secondary" onClick={onImport}>
            <Upload size={14} /> lms-data.json 가져오기
          </button>
        </div>
      </details>
      {band === 'failed' && (
        <p className="lms-stale">
          마지막 수집이 완료되지 못했습니다. COSMOS 로그인 상태를 확인한 뒤 다시
          시도해 주세요.
        </p>
      )}
      {err && <p className="lms-error">{err}</p>}
    </section>
  );
}

/** 연결 관리 — 동기화 상태·수집 경로·진단·수동 수단을 한 카드에 모은다 */
function ConnCard({
  snap,
  now,
  ext,
  syncing,
  lastError,
  unmatched,
  catalogReady,
  canRefresh,
  studentMask,
  onAccount,
  notify,
  busy,
  onExtRefresh,
  onImport,
  onDelete,
  err,
}: {
  snap: LmsSnapshot;
  now: number;
  ext: ExtSync;
  syncing: boolean;
  lastError?: string;
  unmatched: string[];
  catalogReady: boolean;
  canRefresh: boolean;
  studentMask?: string;
  onAccount?: (account: Account) => void;
  notify?: (msg: string) => void;
  busy?: boolean;
  onExtRefresh?: () => void;
  onImport: () => void;
  onDelete: () => Promise<boolean>;
  err: string;
}) {
  const d = snap.diag;
  return (
    <section className="card pad lms-conn">
      <h3>연결 관리</h3>
      <dl className="conn-rows">
        <div>
          <dt>동기화 상태</dt>
          <dd>
            {syncing
              ? '수집 중'
              : ext.status === 'login-required'
                ? '로그인 필요'
                : ext.status === 'failed'
                  ? '실패'
                  : '정상'}
          </dd>
        </div>
        <div>
          <dt>마지막 동기화</dt>
          <dd>
            {snap.fetchedAt ? relTime(snap.fetchedAt, now) : '없음'}
            {snap.fetchedAt ? ` (${snap.fetchedAt.slice(0, 16).replace('T', ' ')})` : ''}
          </dd>
        </div>
        <div>
          <dt>수집 경로</dt>
          <dd>{viaLabel(snap)}</dd>
        </div>
        <div>
          <dt>확장 프로그램</dt>
          <dd>
            {ext.installed
              ? `설치됨${ext.version ? ` v${ext.version}` : ''} · 15분 간격 자동 수집`
              : '미설치 · 설치하면 자동 수집'}
          </dd>
        </div>
        {d && (
          <div>
            <dt>수집 진단</dt>
            <dd>
              {[
                d.coursesVia ? `경로 ${d.coursesVia}` : '',
                d.pagePath ? `페이지 ${d.pagePath}` : '',
                typeof d.scanned === 'number' ? `스캔 ${d.scanned}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </div>
        )}
        {catalogReady && (
          <div>
            <dt>카탈로그 매칭</dt>
            <dd>
              {snap.courses.length - unmatched.length}/{snap.courses.length} 과목
              {unmatched.length > 0 && (
                <small className="conn-warn">
                  매칭 안 됨: {unmatched.slice(0, 3).join(', ')}
                  {unmatched.length > 3 ? ` 외 ${unmatched.length - 3}` : ''}
                  {' '}(이름이 카탈로그와 달라 연결되지 않았습니다)
                </small>
              )}
            </dd>
          </div>
        )}
        {lastError && (
          <div>
            <dt>마지막 오류</dt>
            <dd className="conn-err">{lastError}</dd>
          </div>
        )}
      </dl>
      <div className="lms-conn-actions">
        {ext.installed ? (
          <button
            className="primary"
            onClick={onExtRefresh}
            disabled={syncing}
          >
            <RefreshCw size={14} /> {syncing ? '수집 중…' : '지금 새로고침'}
          </button>
        ) : (
          <p className="meta">
            확장 프로그램을 설치하면 여기서 바로 수집할 수 있습니다.
          </p>
        )}
        {canRefresh && (
          <RefreshForm
            studentMask={studentMask!}
            onAccount={onAccount!}
            notify={notify}
            busy={busy}
          />
        )}
        <div className="lms-script-actions">
          <button className="secondary" onClick={onImport}>
            <Upload size={14} /> 파일로 가져오기
          </button>
          <button className="secondary" onClick={() => void onDelete()}>
            <Trash2 size={14} /> 데이터 삭제
          </button>
        </div>
      </div>
      {err && <p className="lms-error">{err}</p>}
    </section>
  );
}

/** 학교 비밀번호 재인증으로 서버 수집을 다시 실행한다.
 *  비밀번호는 서버 검증에만 쓰이고 저장되지 않는다. */
function RefreshForm({
  studentMask,
  onAccount,
  notify,
  busy,
}: {
  studentMask: string;
  onAccount: (account: Account) => void;
  notify?: (msg: string) => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (loading) return;
    setErr('');
    setLoading(true);
    try {
      const res = await fetch('/api/account/lms-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, password }),
      });
      const body = (await res.json()) as Account & { error?: string };
      if (!res.ok) {
        setErr(body.error || '재수집에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      onAccount(body);
      setPassword('');
      setOpen(false);
      notify?.('서버에서 수업 현황을 다시 수집합니다. 완료되면 자동으로 반영됩니다.');
    } catch {
      setErr('요청에 실패했습니다. 네트워크를 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  };
  if (!open)
    return (
      <p className="lms-script-actions">
        <button className="secondary" onClick={() => setOpen(true)} disabled={busy}>
          <RefreshCw size={14} />{' '}
          {busy ? '서버 수집 중…' : '서버에서 다시 수집'}
        </button>
      </p>
    );
  return (
    <form
      className="lms-refresh"
      onSubmit={async (e) => {
        e.preventDefault();
        await submit();
      }}
    >
      <p className="meta">
        학교 계정으로 다시 로그인해 COSMOS를 재수집합니다. 비밀번호는 검증에만
        쓰이며 저장되지 않습니다. 연결된 계정: {studentMask}
      </p>
      <div className="lms-refresh-row">
        <input
          value={studentId}
          onChange={(e) => setStudentId(e.currentTarget.value)}
          placeholder="학번"
          inputMode="numeric"
          autoComplete="username"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          placeholder="학교 비밀번호"
          autoComplete="current-password"
          required
        />
        <button className="primary" type="submit" disabled={loading}>
          {loading ? '확인 중…' : '재수집'}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setOpen(false);
            setErr('');
          }}
        >
          취소
        </button>
      </div>
      {err && <p className="lms-error">{err}</p>}
    </form>
  );
}

function DueSoonList({ snap, now }: { snap: LmsSnapshot; now: number }) {
  const soon = dueSoon(snap, now, 7);
  if (!soon.length)
    return <p className="meta">7일 이내 마감되는 미완료 항목이 없습니다.</p>;
  return (
    <div className="lms-tasks">
      {soon.slice(0, 10).map((t, i) => (
        <div
          className={`lms-task ${t.kind === '과제' ? 't-assign' : t.kind === '퀴즈' ? 't-quiz' : 't-vod'}`}
          key={i}
        >
          <span className={`badge ${t.kind === '과제' ? 'orange' : t.kind === '퀴즈' ? 'purple' : 'blue'}`}>
            {t.kind}
          </span>
          <div>
            {t.url ? (
              <a className="link" href={t.url} target="_blank" rel="noreferrer">
                {t.title} <ArrowUpRight size={13} />
              </a>
            ) : (
              <b>{t.title}</b>
            )}
            <small>
              {t.course} ·{' '}
              {t.dueTs < now
                ? '마감 지남'
                : `D-${Math.ceil((t.dueTs - now) / DAY)}`}
              {t.uncertain ? ' · 응시 여부 확인 실패' : ''}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}
