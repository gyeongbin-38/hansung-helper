'use client';
import { useState } from 'react';
import {
  CalendarDays,
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { Data } from './data';
import type { Account } from '../account-flow';
import {
  conflicts,
  semesterStartTs,
  type Catalog,
  type CourseSection,
} from '@/lib/data/catalog';
import {
  currentSemesterStart,
  dueSoon,
  matchEnrollment,
  pendingTasks,
} from '@/lib/data/lms';
import { activityNeedsVerification, liveStatus } from '@/lib/data/activities';
import { staleLabel } from '@/lib/data/freshness';
import { scheduleDateLabel, scheduleToday, upcomingSchedule } from '@/lib/data/schedule';
import { gettingStarted } from '@/lib/data/getting-started';
import { useActivities, useNow, useSchedule } from './catalog';

type Planned = CourseSection[];

type Urgent = { label: string; desc: string; route: string };

/** 오늘 처리할 일 — 오늘·내일 마감 수업 + 마감임박인 저장 활동.
 *  최대 3개. 확정된 마감 데이터만 올리고 미확정 데이터는 긴급 표기하지 않는다. */
function TodayStrip({
  lmsDue,
  acts,
  saved,
  now,
  go,
}: {
  lmsDue: { dueTs: number; kind: string; title: string; course: string }[];
  acts: Parameters<typeof liveStatus>[0][];
  saved: string[];
  now: number;
  go: (route: string) => void;
}) {
  const items: Urgent[] = [];
  for (const t of lmsDue) {
    const dd = Math.ceil((t.dueTs - now) / 86400000);
    if (dd <= 1)
      items.push({
        label: `${t.kind} ${dd <= 0 ? '오늘' : '내일'} 마감`,
        desc: `${t.title} · ${t.course}`,
        route: 'lms',
      });
  }
  for (const a of acts) {
    const live = liveStatus(a, now);
    if (live.status === 'closing' && saved.includes(a.id))
      items.push({
        label: `저장한 활동 ${live.dday ?? '마감임박'}`,
        desc: a.title,
        route: 'activities/' + a.id,
      });
  }
  const top = items.slice(0, 3);
  if (!top.length) return null;
  return (
    <section className="today-strip card pad" aria-label="오늘 처리할 일">
      <div className="section-heading">
        <h2>오늘 처리할 일</h2>
      </div>
      {top.map((t, i) => (
        <button className="today-item" key={i} onClick={() => go(t.route)}>
          <span className="badge">{t.label}</span>
          <b>{t.desc}</b>
          <ArrowUpRight size={16} />
        </button>
      ))}
    </section>
  );
}

export function Home({
  data,
  account,
  go,
  planned,
  catalog,
  planSemester,
  planSourceMismatch,
  persist,
}: {
  data: Data;
  account: Account | null;
  go: (route: string) => void;
  planned: Planned;
  catalog: Catalog | null;
  planSemester: string;
  planSourceMismatch: boolean;
  persist: (next: Data, msg?: string, complete?: boolean) => Promise<boolean>;
}) {
  const { snap: sched } = useSchedule();
  const { snap: acts } = useActivities();
  const [slide, setSlide] = useState(0);
  const now = useNow(30000);
  const actsNeedVerification = acts ? activityNeedsVerification(acts.fetchedAt, now) : true;
  const today = scheduleToday(now);
  const lmsSnap = data.lms;
  // 학기 경계 — 지난 학기 항목은 현재 할 일·건수에서 제외한다
  const before =
    (catalog?.semester ? semesterStartTs(catalog.semester) : null) ??
    currentSemesterStart(now);
  const lmsDue = lmsSnap ? dueSoon(lmsSnap, now, 7, 7, before) : [];
  const lmsPending = lmsSnap ? pendingTasks(lmsSnap, before).length : 0;
  // 매칭 미확정 과목 수 — '해당 없음'으로 사용자가 제외한 과목은 위험 신호에서 뺀다
  const lmsUnmatched =
    lmsSnap && catalog
      ? matchEnrollment(lmsSnap, catalog, data.lmsMatch).filter(
          (m) => !m.sections.length && !m.ignored,
        ).length
      : 0;
  // 이번 주 마감 — 수업 과제·퀴즈 + 저장한 비교과 마감 + 학사일정을 D-day 하나로 통합
  type WeekItem = {
    dday: number;
    kind: string;
    title: string;
    sub: string;
    url?: string;
    route: string;
  };
  const week: WeekItem[] = lmsDue.map((t) => ({
    dday: Math.ceil((t.dueTs - now) / 86400000),
    kind: t.kind,
    title: t.title,
    sub: t.course + (t.uncertain ? ' · 응시 여부 확인 실패' : ''),
    url: t.url,
    route: 'lms',
  }));
  for (const a of actsNeedVerification ? [] : (acts?.items ?? [])) {
    if (!data.saved.includes(a.id) || !a.applyEnd) continue;
    const dd = Math.ceil(
      (Date.parse(a.applyEnd.slice(0, 10) + 'T23:59:59') - now) / 86400000,
    );
    if (dd >= 0 && dd <= 7)
      week.push({
        dday: dd,
        kind: '비교과',
        title: a.title,
        sub: a.dept + (a.points != null ? ` · ${a.points}P` : ''),
        route: 'activities/' + a.id,
      });
  }
  // 직접 등록한 외부 활동도 신청 마감이 임박하면 함께 올린다
  for (const e of data.extActivities ?? []) {
    if (!e.applyEnd) continue;
    const dd = Math.ceil(
      (Date.parse(e.applyEnd + 'T23:59:59') - now) / 86400000,
    );
    if (dd >= 0 && dd <= 7)
      week.push({
        dday: dd,
        kind: '비교과',
        title: e.title,
        sub: e.org + ' · 직접 등록',
        route: 'activities/' + e.id,
      });
  }
  for (const e of sched?.items ?? []) {
    const dd = Math.ceil(
      (Date.parse((e.end ?? e.start).slice(0, 10) + 'T23:59:59') - now) /
        86400000,
    );
    if (dd >= 0 && dd <= 7)
      week.push({
        dday: dd,
        kind: '학사일정',
        title: e.title,
        sub: '',
        route: 'calendar',
      });
  }
  week.sort((a, b) => a.dday - b.dday);
  // 마감임박 → 접수중 → 접수예정 순, 마감 빠른 순 — 지금 행동 가능한 것부터
  // 상태는 수집 시점 문자열이 아니라 신청 기간+현재 시각으로 재계산한다
  const rank: Record<string, number> = { closing: 0, open: 1, upcoming: 2 };
  const slides = (acts?.items ?? [])
    .filter((a) => rank[liveStatus(a, now).status] !== undefined)
    .sort(
      (a, b) =>
        rank[liveStatus(a, now).status] - rank[liveStatus(b, now).status] ||
        (a.applyEnd ?? '9999').localeCompare(b.applyEnd ?? '9999'),
    )
    .slice(0, 5);
  const idx = Math.min(slide, Math.max(slides.length - 1, 0));
  const cur = slides[idx];
  const schoolNext = upcomingSchedule(sched?.items ?? [], today).slice(0, 3);
  const personalNext = data.events.filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const hasConflict = planned.some((s) => conflicts(s, planned).length);
  const tasks: [string, string, string, string][] = [];
  const setup = gettingStarted(data);
  const profileRoute = setup.missing.length ? `profile/${setup.missing[0]}` : 'profile';
  if (lmsUnmatched)
    tasks.push([
      '02',
      `수집된 수업 ${lmsUnmatched}과목 매칭 확인`,
      '개설강의와 연결하면 수강 추정과 시간표 표시가 정확해져요.',
      'lms',
    ]);
  if (hasConflict)
    tasks.push([
      '04',
      '시간표 충돌 조정하기',
      '계획한 과목의 시간이 겹쳐요.',
      'timetable',
    ]);
  const shownTasks = tasks.slice(0, 4);
  const plannedCredits = planned.reduce((n, s) => n + s.credits, 0);
  const conflictCount = planned.filter(
    (s) => conflicts(s, planned).length,
  ).length;
  return (
    <>
      {setup.current < 3 && (
        <section className="card pad setup-guide" aria-label="시작하기">
          <h2>시작하기</h2>
          <p className="meta">한 단계씩 진행해 보세요. 설문은 나중에 선택할 수 있어요.</p>
          <ol className="setup-steps">
            {['학적 입력', '이수 내역', '추천 확인'].map((label, i) => (
              <li key={label} aria-current={setup.current === i ? 'step' : undefined}>
                <span>{i + 1}</span> {label} {i < setup.current && <small>{i === 1 && !setup.hasHistory ? (data.setupHistory === 'later' ? '나중에' : '이수 없음') : '완료'}</small>}
              </li>
            ))}
          </ol>
          {setup.current === 0 ? (
            <><p>학과와 입학연도를 입력하면 개인 정보에 맞는 안내를 볼 수 있어요.</p><button className="primary" onClick={() => go(profileRoute)}>학적 입력하기 <ArrowRight size={16} /></button></>
          ) : setup.current === 1 ? (
            <>
              <p>이수한 과목을 확인하거나 직접 입력해 주세요. 아직 모르더라도 추천을 둘러볼 수 있어요.</p>
              <div className="actions">
                <button className="primary" onClick={() => go('graduation/completed')}>이수 내역 확인하기 <ArrowRight size={16} /></button>
                <button className="secondary" onClick={() => void persist({ ...data, setupHistory: 'none' }, '이수 내역 없음으로 선택했습니다.')}>이수 내역 없음</button>
                <button className="link" onClick={() => void persist({ ...data, setupHistory: 'later' }, '이수 내역은 나중에 입력할 수 있습니다.')}>나중에 입력</button>
              </div>
            </>
          ) : (
            <>
              <p>{data.setupHistory === 'later' && !setup.hasHistory ? '이수 내역이 없어 추천이 제한될 수 있어요. ' : ''}과목 추천에서 근거를 확인하고 계획을 세워 보세요.</p>
              <button className="primary" onClick={async () => { if (await persist({ ...data, recommendationsSeen: true }, '', true)) go('courses'); }}>추천 확인하기 <ArrowRight size={16} /></button>
            </>
          )}
        </section>
      )}
      <TodayStrip
        lmsDue={lmsDue}
        acts={actsNeedVerification ? [] : (acts?.items ?? [])}
        saved={data.saved}
        now={now}
        go={go}
      />
      {week.length > 0 && (
        <section>
          <div className="section-heading">
            <h2>
              이번 주 마감 <span className="count">{week.length}</span>
            </h2>
            <button className="link" onClick={() => go('lms')}>
              수업 현황 <ArrowRight size={16} />
            </button>
          </div>
          <div className="card pad week-list">
            {week.slice(0, 5).map((t, i) => (
              <button
                className="event-line as-link"
                key={i}
                onClick={() => go(t.route)}
              >
                <span className="event-date">
                  <b>{t.dday <= 0 ? '오늘' : `D-${t.dday}`}</b>
                  <small>{t.kind}</small>
                </span>
                <div>
                  <b>
                    {t.url ? (
                      <a
                        className="link title-link"
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t.title}
                      </a>
                    ) : (
                      t.title
                    )}
                  </b>
                  {t.sub && <small>{t.sub}</small>}
                </div>
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            ))}
            {week.length > 5 && (
              <p className="meta">외 {week.length - 5}건</p>
            )}
            <p className="meta">
              {lmsSnap
                ? `COSMOS ${lmsSnap.fetchedAt.slice(0, 10)} 수집`
                : ''}
              {lmsSnap && staleLabel(lmsSnap.fetchedAt, now, 7) && (
                <>
                  {' '}
                  <span className="badge orange">
                    {staleLabel(lmsSnap.fetchedAt, now, 7)}
                  </span>
                </>
              )}
              {lmsSnap && acts ? ' · ' : ''}
              {acts ? `hsportal ${acts.fetchedAt.slice(0, 10)} 수집` : ''}
              {acts && staleLabel(acts.fetchedAt, now) && (
                <>
                  {' '}
                  <span className="badge orange">
                    {staleLabel(acts.fetchedAt, now)}
                  </span>
                </>
              )}
            </p>
          </div>
        </section>
      )}
      {!week.length && lmsSnap != null && lmsPending > 0 && (
        <section>
          <div className="card pad">
            <p className="meta">
              7일 이내 마감은 없어요. 미완료 수업 항목 {lmsPending}건이 남아
              있어요.
            </p>
          </div>
        </section>
      )}
      {shownTasks.length > 0 && <section>
        <div className="section-heading">
          <h2>
            확인할 항목 <span className="count">{shownTasks.length}</span>
          </h2>
        </div>
        {shownTasks.length ? (
          <div className="tasks">
            {shownTasks.map(([n, t, d, r]) => (
              <button className="task card" key={t} onClick={() => go(r)}>
                <span className="task-num">{n}</span>
                <span>
                  <b>{t}</b>
                  <small>{d}</small>
                </span>
                <ArrowUpRight size={19} />
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-small card">
            <p>입력하거나 확인할 항목이 없어요. 잘 준비되고 있습니다.</p>
          </div>
        )}
      </section>}
      <section className="card pad">
        <div className="section-heading">
          <h2>{planSemester === 'legacy' ? '기존 계획 (학기 미지정)' : `${planSemester} 계획`}</h2>
          <button className="link" onClick={() => go('timetable')}>
            시간표 <ArrowRight size={16} />
          </button>
        </div>
        {planned.length ? (
          <>
            <div className="plan-stats">
              <div>
                <b>{planned.length}</b>
                <small>담은 과목</small>
              </div>
              <div>
                <b>{plannedCredits}</b>
                <small>계획 학점</small>
              </div>
              <div>
                <b className={conflictCount ? 'warn' : ''}>
                  {conflictCount ? `${conflictCount}건` : '없음'}
                </b>
                <small>시간 충돌</small>
              </div>
            </div>
            <div className="plan-list">
              {planned.slice(0, 4).map((s) => (
                <span className="badge" key={s.id}>
                  {s.name} {s.section}
                </span>
              ))}
              {planned.length > 4 && (
                <span className="badge">외 {planned.length - 4}과목</span>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="meta">
              {planSourceMismatch ? '저장된 계획의 기준 자료가 달라 현재 표시할 수 없습니다.' : '아직 담은 과목이 없어요. 개설강의 자료로 계획을 연습해 보세요.'}
            </p>
            <button className="link" onClick={() => go('courses')}>
              과목 둘러보기 <ArrowUpRight size={15} />
            </button>
          </>
        )}
      </section>
      {acts && slides.length > 0 && cur && (
        <section
          className="hero-carousel"
          aria-roledescription="carousel"
          aria-label="비교과 프로그램"
        >
          <div className="hc-slide" key={cur.id}>
            {cur.cover && (
              <span
                className="hc-cover"
                style={{ backgroundImage: `url(${cur.cover})` }}
                aria-hidden="true"
              />
            )}
            <div className="hc-body">
              <span className="badge blue">
                {actsNeedVerification ? '현재 접수 여부 확인 필요' : liveStatus(cur, now).label}
                {!actsNeedVerification && liveStatus(cur, now).dday
                  ? ' · ' + liveStatus(cur, now).dday
                  : ''}
                {cur.points != null ? ` · ${cur.points}P` : ''}
              </span>
              <h3>{cur.title}</h3>
              <p>
                {cur.dept}
                {cur.applyEnd
                  ? ` · ${actsNeedVerification ? '수집 당시 신청 마감' : '신청 마감'} ${cur.applyEnd.slice(0, 10)}`
                  : ''}
              </p>
              <button
                className="link"
                onClick={() => go('activities/' + cur.id)}
              >
                자세히 보기 <ArrowUpRight size={15} />
              </button>
              <a className="link" href={cur.url || acts.sourceUrl} target="_blank" rel="noreferrer">
                학교 원문 확인 <ArrowUpRight size={15} />
              </a>
            </div>
          </div>
          {slides.length > 1 && (
            <div className="hc-nav">
              <button
                className="hc-arrow"
                aria-label="이전 프로그램"
                onClick={() =>
                  setSlide((idx - 1 + slides.length) % slides.length)
                }
              >
                <ChevronLeft size={18} />
              </button>
              <div className="hc-dots">
                {slides.map((s, j) => (
                  <button
                    key={s.id}
                    aria-label={`${j + 1}번째: ${s.title}`}
                    aria-current={j === idx}
                    onClick={() => setSlide(j)}
                  />
                ))}
              </div>
              <button
                className="hc-arrow"
                aria-label="다음 프로그램"
                onClick={() => setSlide((idx + 1) % slides.length)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
          <p className="hc-src">
            hsportal 공개 목록 · {acts.fetchedAt.slice(0, 10)} 수집
          </p>
        </section>
      )}
      <section>
        <div className="section-heading">
          <h2>나의 학사 현황</h2>
          <button className="link" onClick={() => go('graduation')}>
            자세히 보기 <ArrowRight size={16} />
          </button>
        </div>
        <div className="stats">
          {[
            [
              '졸업요건 체크리스트',
              '계산 대기',
              '적용 졸업 규정 확인 필요',
              'lavender',
            ],
            [
              '총 이수학점',
              data.info?.credits !== undefined
                ? data.info.credits + ' 학점'
                : data.credits
                  ? data.credits + ' 학점'
                  : '입력 전',
              data.info?.credits !== undefined
                ? '학교 수집 · 종합정보'
                : data.credits
                  ? '사용자 입력 · 미검증'
                  : '내 정보에서 입력할 수 있어요',
              'sky',
            ],
            [
              '비교과 포인트',
              data.info?.points !== undefined
                ? data.info.points + ' P'
                : data.points
                  ? data.points + ' P'
                  : '입력 전',
              data.info?.points !== undefined
                ? '학교 수집 · 종합정보'
                : data.points
                  ? '사용자 입력 · 미검증'
                  : '학교 인정 내역 확인 필요',
              'mint',
            ],
          ].map(([l, v, s, tone]) => (
            <div className={'card stat ' + tone} key={l}>
              <span className="stat-tag">{l}</span>
              <strong>{v}</strong>
              <small>{s}</small>
            </div>
          ))}
        </div>
      </section>
      <div className="bottom-grid">
        <section className="card pad">
          <div className="section-heading">
            <h2>다가오는 일정</h2>
            <button className="link" onClick={() => go('calendar')}>
              일정 보기 <ArrowRight size={16} />
            </button>
          </div>
          {schoolNext.map((e) => (
            <div className="event-line" key={e.id}>
              <span className="event-date">{e.start <= today ? '진행 중' : '예정'}</span>
              <div>
                <b>{e.title}</b>
                <small>{scheduleDateLabel(e)}</small>
              </div>
            </div>
          ))}
          {personalNext.length ? (
            personalNext.map((e, i) => (
              <div className="event-line" key={i}>
                <span className="event-date">{e.date.slice(5)}</span>
                <div>
                  <b>{e.title}</b>
                  <small>개인 일정</small>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-small">
              <CalendarDays />
              <p>
                {schoolNext.length
                  ? '다가오는 개인 일정은 없어요.'
                  : '다가오는 일정이 없어요.'}
              </p>
              <button className="link" onClick={() => go('calendar')}>
                첫 일정 추가하기 +
              </button>
            </div>
          )}
        </section>
        <section className="card pad">
          <div className="section-heading">
            <h2>코스모스 강의</h2>
            <a
              className="link"
              href="https://learn.hansung.ac.kr/"
              target="_blank"
              rel="noreferrer"
            >
              코스모스 열기 <ArrowUpRight size={15} />
            </a>
          </div>
          {account && account.snapshot.courses.length ? (
            <>
              {account.snapshot.courses.slice(0, 5).map((c) => (
                <div className="event-line" key={c.id}>
                  <div>
                    <b>
                      <a
                        className="link title-link"
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c.name}
                      </a>
                    </b>
                  </div>
                </div>
              ))}
              <p className="meta">{account.snapshot.courseScope}</p>
            </>
          ) : (
            <>
              <p>
                {account
                  ? '확인된 강의가 없습니다. 코스모스에서 직접 확인해 주세요.'
                  : '학교 계정을 연결하면 코스모스 강의 목록을 볼 수 있어요.'}
              </p>
              <button className="link" onClick={() => go('lms')}>
                수업 현황 열기 <ArrowUpRight size={15} />
              </button>
            </>
          )}
        </section>
      </div>
    </>
  );
}
