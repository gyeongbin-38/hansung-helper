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
import { useRef, useState } from 'react';
import type { Data } from './data';
import {
  courseProgress,
  dueSoon,
  pendingTasks,
  staleDays,
  validateLms,
  weekProgress,
  type LmsCourse,
  type LmsSnapshot,
} from '@/lib/data/lms';

const LMS_BASE = 'https://learn.hansung.ac.kr';
const DAY = 86400000;

/** 수강 기간 원문 'YYYY-MM-DD … ~ YYYY-MM-DD …' → 'MM-DD ~ MM-DD' 축약 */
const shortRange = (r?: string) => {
  if (!r) return '';
  const m = r.match(/(\d{4})-(\d{2})-(\d{2}).*?(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}-${m[3]} ~ ${m[5]}-${m[6]}` : r;
};

function TaskRow({
  kind,
  title,
  url,
  due,
  now,
}: {
  kind: string;
  title: string;
  url?: string;
  due: string | null;
  now: number;
}) {
  const ts = due ? Date.parse(due.replace(' ', 'T')) : null;
  const dd = ts !== null && !Number.isNaN(ts) ? Math.ceil((ts - now) / DAY) : null;
  return (
    <div className="lms-task">
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
        </small>
      </div>
    </div>
  );
}

function CourseCard({ c, now }: { c: LmsCourse; now: number }) {
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
      })),
  ];
  const doneCount =
    c.vods.filter((v) => v.attended).length +
    c.assigns.filter((a) => a.submitted).length +
    c.quizzes.filter((q) => q.submitted).length;
  return (
    <details className="lms-course" open={pend.length > 0 && pend.length <= 8}>
      <summary>
        <div className="lms-course-head">
          <b>{c.title}</b>
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
            {pend.length ? `미완료 ${pend.length}건` : '모두 완료'}
            {doneCount ? ` · 완료 ${doneCount}` : ''}
          </small>
        </div>
      </summary>
      {c.errors?.length ? (
        <p className="meta">일부 항목을 수집하지 못했습니다: {c.errors.join(', ')}</p>
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

export function LmsSection({
  data,
  persist,
  notify,
  serverCollecting,
}: {
  data: Data;
  persist: (next: Data, msg?: string) => Promise<boolean>;
  notify?: (msg: string) => void;
  /** 로그인 계정의 서버 측 COSMOS 수집이 백그라운드로 진행 중 */
  serverCollecting?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const [copying, setCopying] = useState(false);
  const [now] = useState(() => Date.now());
  const snap = data.lms;
  const stale = snap ? staleDays(snap, now) : null;

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
      <section className="card pad">
        <div className="between">
          <h2>COSMOS 수업 현황</h2>
          <a className="link" href={LMS_BASE} target="_blank" rel="noreferrer">
            COSMOS 열기 <ArrowUpRight size={16} />
          </a>
        </div>
        <p className="meta">
          학교 LMS(COSMOS)의 수강 상태를 가져와 한눈에 봅니다. 앱이 COSMOS에 직접
          접속할 수 없어, 브라우저에서 수집 스크립트를 실행한 뒤 결과 파일을
          가져오는 방식입니다. 로그인 정보는 본인 브라우저 안에서만 사용되며
          어디에도 전송되지 않습니다.
        </p>
        {snap && (
          <p className="meta">
            {snap.fetchedAt ? `${snap.fetchedAt.slice(0, 10)} 수집` : '수집일 미상'}
            {' · '}
            {snap.courses.length}개 과목 · 데이터는 수집 시점 기준이며 이후 변경은
            재수집해야 반영됩니다.
          </p>
        )}
        {stale !== null && stale >= 7 && (
          <p className="lms-stale">
            수집한 지 {stale}일 지났습니다. 최신 상태가 아닐 수 있으니{' '}
            <button
              className="link"
              onClick={() => fileRef.current?.click()}
            >
              다시 가져오기
            </button>
            를 권장합니다.
          </p>
        )}
        <ol className="lms-steps">
          <li>
            <a className="link" href={LMS_BASE} target="_blank" rel="noreferrer">
              learn.hansung.ac.kr
            </a>
            에 로그인하고 내 강의실(대시보드)로 이동
          </li>
          <li>
            F12 → Console 탭을 열고 수집 스크립트를 붙여넣은 뒤 Enter
            <span className="lms-script-actions">
              <button className="secondary" onClick={() => void copyScript()} disabled={copying}>
                <Copy size={14} /> {copying ? '복사 중…' : '스크립트 복사'}
              </button>
              <a className="secondary" href="/lms-collect.js" target="_blank" rel="noreferrer">
                <Download size={14} /> 스크립트 파일
              </a>
            </span>
          </li>
          <li>
            다운로드된 <code>lms-data.json</code>을 여기에 업로드
            <span className="lms-script-actions">
              <button className="primary" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> 파일 가져오기
              </button>
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
            </span>
          </li>
        </ol>
        {err && <p className="lms-error">{err}</p>}
      </section>

      {!snap && (
        <section className="card pad">
          <div className="empty-small">
            <MonitorPlay size={30} />
            <h3>
              {serverCollecting
                ? '서버에서 수집 중입니다…'
                : '아직 수업 데이터가 없습니다.'}
            </h3>
            <p>
              {serverCollecting
                ? '학교 계정 연결로 COSMOS 수업 현황을 수집하고 있습니다. 완료되면 이 화면에 자동으로 표시됩니다(보통 1분 이내).'
                : '위 순서대로 수집하면 수강한 강의·남은 강의·미제출 과제·미응시 퀴즈를 여기서 확인할 수 있습니다.'}
            </p>
          </div>
        </section>
      )}

      {snap && (
        <>
          <section className="card pad">
            <div className="between">
              <h2>마감 임박</h2>
              <div className="lms-actions">
                <button className="secondary" onClick={() => fileRef.current?.click()}>
                  <RefreshCw size={14} /> 다시 가져오기
                </button>
                <button
                  className="secondary"
                  onClick={async () =>
                    await persist(
                      { ...data, lms: undefined },
                      '수업 현황 데이터를 삭제했습니다.',
                    )
                  }
                >
                  <Trash2 size={14} /> 데이터 삭제
                </button>
              </div>
            </div>
            <DueSoonList snap={snap} now={now} />
          </section>

          <section className="card pad">
            <div className="between">
              <h2>과목별 현황</h2>
              <small className="meta">
                남은 항목 {pendingTasks(snap).length}건
              </small>
            </div>
            <div className="lms-courses">
              {snap.courses.map((c) => (
                <CourseCard key={c.id} c={c} now={now} />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function DueSoonList({ snap, now }: { snap: LmsSnapshot; now: number }) {
  const soon = dueSoon(snap, now, 7);
  if (!soon.length)
    return <p className="meta">7일 이내 마감되는 미완료 항목이 없습니다.</p>;
  return (
    <div className="lms-tasks">
      {soon.slice(0, 10).map((t, i) => (
        <div className="lms-task" key={i}>
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
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}
