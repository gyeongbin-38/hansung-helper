'use client';
import { useState } from 'react';
import {
  CalendarDays,
  Clock3,
  GraduationCap,
  Info,
  Link2,
  FileText,
  MonitorPlay,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { Data } from './data';
import type { Account } from '../account-flow';
import { ActivitySummary } from './activity-summary';
import { CreditComposition, ProgressMetric } from './visual-progress';
import { targetProgress } from '@/lib/data/visual-progress';
import {
  conflicts,
  fmtMin,
  placeLabel,
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
import {
  deptPoolOf,
  useActivities,
  useDeptRules,
  useNow,
  useSchedule,
} from './catalog';
import { addDays, dateOf } from '@/lib/data/calendar';
import { scheduleDateLabel, scheduleToday, upcomingSchedule } from '@/lib/data/schedule';
import { gettingStarted } from '@/lib/data/getting-started';
import { evaluate } from '@/lib/data/graduation';
import { mergeCompleted, resolveEarnedCredits } from '@/lib/data/info';
import { deptRuleTargets, rulesetMatchesDept } from '@/lib/data/dept-rules';
import { dateDeadlineDays, deadlineDays, isUpcomingUrgent, needsApplication } from '@/lib/data/home-deadlines';

type Planned = CourseSection[];

type Urgent = { label: string; desc: string; route: string };

/** 오늘 처리할 일 — 오늘·내일 마감 수업 + 마감임박인 저장 활동.
 *  최대 3개. 확정된 마감 데이터만 올리고 미확정 데이터는 긴급 표기하지 않는다. */
function TodayStrip({
  lmsDue,
  acts,
  saved,
  stages,
  now,
  go,
}: {
  lmsDue: { dueTs: number; kind: string; title: string; course: string; uncertain?: boolean }[];
  acts: Parameters<typeof liveStatus>[0][];
  saved: string[];
  stages?: Record<string, string>;
  now: number;
  go: (route: string) => void;
}) {
  const items: Urgent[] = [];
  for (const t of lmsDue) {
    const dd = deadlineDays(t.dueTs, now);
    if (isUpcomingUrgent(t, now))
      items.push({
        label: `${t.kind} ${dd === 0 ? '오늘' : '내일'} 마감`,
        desc: `${t.title} · ${t.course}`,
        route: 'lms',
      });
  }
  for (const a of acts) {
    const live = liveStatus(a, now);
    if (live.status === 'closing' && saved.includes(a.id) && needsApplication(stages, a.id))
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
  planSourceSemester,
  persist,
}: {
  data: Data;
  account: Account | null;
  go: (route: string) => void;
  planned: Planned;
  catalog: Catalog | null;
  planSemester: string;
  planSourceMismatch: boolean;
  planSourceSemester?: string;
  persist: (next: Data, msg?: string, complete?: boolean) => Promise<boolean>;
}) {
  const {
    snap: sched,
    failed: scheduleFailed,
    retry: retrySchedule,
  } = useSchedule();
  const {
    snap: acts,
    failed: activitiesFailed,
    retry: retryActivities,
  } = useActivities();
  const { snap: deptRules } = useDeptRules();
  const [taskFilter, setTaskFilter] = useState('전체');
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [slide, setSlide] = useState(0);
  const now = useNow(30000);
  const actsNeedVerification = acts
    ? activityNeedsVerification(acts.fetchedAt, now)
    : true;
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
    overdue?: boolean;
    kind: string;
    title: string;
    sub: string;
    url?: string;
    route: string;
  };
  const week: WeekItem[] = lmsDue.map((t) => ({
    dday: deadlineDays(t.dueTs, now),
    overdue: t.dueTs < now,
    kind: t.kind,
    title: t.title,
    sub: t.course + (t.uncertain ? ` · ${t.kind === '과제' ? '제출' : t.kind === '퀴즈' ? '응시' : '출석'} 여부 확인 필요` : ''),
    url: t.url,
    route: 'lms',
  }));
  for (const a of actsNeedVerification ? [] : (acts?.items ?? [])) {
    if (!data.saved.includes(a.id) || !needsApplication(data.actStatus, a.id) || !a.applyEnd) continue;
    const dd = dateDeadlineDays(a.applyEnd, now);
    if (dd !== null && dd >= 0 && dd <= 7)
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
    if (!needsApplication(data.actStatus, e.id) || !e.applyEnd) continue;
    const dd = dateDeadlineDays(e.applyEnd, now);
    if (dd !== null && dd >= 0 && dd <= 7)
      week.push({
        dday: dd,
        kind: '비교과',
        title: e.title,
        sub: e.org + ' · 직접 등록',
        route: 'activities/' + e.id,
      });
  }
  for (const e of sched?.items ?? []) {
    const dd = dateDeadlineDays(e.end ?? e.start, now);
    if (dd !== null && dd >= 0 && dd <= 7)
      week.push({
        dday: dd,
        kind: '학사일정',
        title: e.title,
        sub: '',
        route: 'calendar',
      });
  }
  for (const e of data.events) {
    const dd = dateDeadlineDays(e.date, now);
    if (dd !== null && dd >= 0 && dd <= 7)
      week.push({
        dday: dd,
        kind: '개인 일정',
        title: e.title,
        sub: e.date,
        route: 'calendar',
      });
  }
  week.sort((a, b) => a.dday - b.dday);
  // 마감임박 → 접수중 → 접수예정 순, 마감 빠른 순 — 지금 행동 가능한 것부터
  // 상태는 수집 시점 문자열이 아니라 신청 기간+현재 시각으로 재계산한다
  const rank: Record<string, number> = { closing: 0, open: 1, upcoming: 2 };
  const slides = (actsNeedVerification ? [] : (acts?.items ?? []))
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
  const hasConflict = planned.some((s) => conflicts(s, planned).length);
  const setup = gettingStarted(data);
  const tasks: [string, string, string, string][] = [];
  // 누락 필드를 실제로 비어 있는 것만 정확히 표기한다
  const missingProfile = [
    !data.dept || data.dept === '소속 미입력' ? '학과' : '',
    !data.year ? '입학연도' : '',
  ].filter(Boolean);
  const missingKeys = [
    !data.dept || data.dept === '소속 미입력' ? 'dept' : '',
    !data.year ? 'year' : '',
  ].filter(Boolean);
  // CTA는 항상 첫 누락 필드로 딥링크 — 내 정보에서 해당 칸에 포커스된다
  const profileRoute = missingKeys.length
    ? `profile/${missingKeys[0]}`
    : 'profile';
  const missingLabel = missingProfile.join('와 ');
  if (missingProfile.length)
    tasks.push([
      '01',
      '나의 학적 정보 채우기',
      `${missingLabel}가 비어 있어요.`,
      profileRoute,
    ]);
  if (lmsUnmatched)
    tasks.push([
      '02',
      `수집된 수업 ${lmsUnmatched}과목 매칭 확인`,
      '개설강의와 연결하면 수강 추정과 시간표 표시가 정확해져요.',
      'lms',
    ]);
  if (!(data.completed ?? []).length && !data.info?.completed.length)
    tasks.push([
      '03',
      '이수 내역 입력하기',
      '이수한 과목이 없어 졸업 계산이 대기 중이에요.',
      'graduation',
    ]);
  else if (!data.credits && data.info?.credits === undefined)
    tasks.push([
      '03',
      '총 이수학점 입력하기',
      '이수학점이 비어 있어 졸업 진행률이 미확정이에요.',
      'graduation',
    ]);
  if (hasConflict)
    tasks.push([
      '04',
      '시간표 충돌 조정하기',
      '계획한 과목의 시간이 겹쳐요.',
      'timetable',
    ]);
  if (!data.prefs.length)
    tasks.push([
      '05',
      '수업 성향 설문하기',
      '맞춤 추천에 선호가 반영돼요.',
      'profile',
    ]);
  if (!(data.actPrefs ?? []).some((p) => p))
    tasks.push([
      '06',
      '비교과 취향 설문하기',
      '활동 목록에서 맞춤 추천을 받아보세요.',
      'activities',
    ]);
  const plannedCredits = planned.reduce((n, s) => n + s.credits, 0);
  const conflictCount = planned.filter(
    (s) => conflicts(s, planned).length,
  ).length;
  const completed = mergeCompleted(data.completed, data.info?.completed);
  const pool = catalog
    ? deptPoolOf(data.dept, [...new Set(catalog.sections.map((s) => s.dept))])
    : null;
  const richness = (r: NonNullable<typeof deptRules>['items'][number]) =>
    (r.yearTable ? 1e6 : 0) +
    r.lines.length * 100 +
    (r.attachment ? 1 : 0) +
    (r.image ? 1 : 0);
  const myRules = deptRules?.items
    .filter((r) => rulesetMatchesDept(r, data.dept, pool))
    .sort((a, b) => richness(b) - richness(a))[0];
  const year = data.info?.admitYear ?? parseInt(data.year, 10);
  const deptTargets =
    myRules && Number.isInteger(year) ? deptRuleTargets(myRules, year) : null;
  const points =
    data.info?.points ?? (data.points.trim() ? Number(data.points) : undefined);
  const graduation = evaluate(completed, planned, data.ruleOverrides, {
    admissionType: data.admissionType,
    admitYear: Number.isInteger(year) ? year : undefined,
    points:
      points !== undefined && Number.isFinite(points) ? points : undefined,
    deptTargets: deptTargets ?? undefined,
  });
  const total = graduation[0];
  const gradePages = data.info?.diag?.pages.filter((p) => p.slot === 'grades') ?? [];
  const gradesUnverified = gradePages.length > 0 && !gradePages.some((p) => p.ok);
  const credits = resolveEarnedCredits(
    completed,
    data.info?.credits,
    data.credits,
  );
  const hasCredits = credits !== null && Number.isFinite(credits);
  const remaining =
    hasCredits && total.required !== null
      ? Math.max(0, total.required - credits)
      : null;
  const percent = targetProgress(hasCredits ? credits : null, total.required)?.percent ?? null;
  const major = graduation.find((r) => r.rule.id === 'major')!;
  const general = graduation.find((r) => r.rule.id === 'gen')!;
  const weekday = (new Date(now + 9 * 3600_000).getUTCDay() + 6) % 7;
  const monday = addDays(today, -weekday);
  const day = selectedDay ?? weekday;
  const meetings = planned
    .flatMap((s) =>
      s.slots
        .filter((slot) => slot.d === day)
        .map((slot) => ({ section: s, slot })),
    )
    .sort((a, b) => a.slot.s - b.slot.s);
  const showWeekend =
    weekday > 4 || planned.some((s) => s.slots.some((slot) => slot.d > 4));
  const weekdays = showWeekend
    ? ['월', '화', '수', '목', '금', '토', '일']
    : ['월', '화', '수', '목', '금'];
  const pending = lmsSnap ? pendingTasks(lmsSnap, before) : [];
  const homework = pending.filter(
    (t) =>
      taskFilter === '전체' ||
      (taskFilter === '온라인 강의'
        ? t.kind === '강의'
        : t.kind === '과제' || t.kind === '퀴즈'),
  );
  const agenda = week.filter((t) => !['과제', '퀴즈', '강의'].includes(t.kind));
  const taskCount =
    homework.length +
    (taskFilter === '전체' ? tasks.length + agenda.length : 0);
  const taskLimit = showAllTasks ? taskCount : 4;
  const shortDate = (iso: string) => iso.slice(5).replace('-', '.');
  const deadlineLabel = (dd: number, overdue = false) =>
    dd < 0 ? `${Math.abs(dd)}일 지남` : overdue ? '마감 지남' : dd === 0 ? '오늘' : `D-${dd}`;
  return (
    <div className="home-dashboard">
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
      {planSourceMismatch && (
        <output className="card pad" aria-live="polite">
          <p className="form-error">이 계획은 {planSourceSemester ?? planSemester} 자료로 저장되어 현재 자료로는 표시하거나 수정할 수 없습니다. 저장된 계획은 보존됩니다.</p>
        </output>
      )}
      <TodayStrip lmsDue={lmsDue} acts={actsNeedVerification ? [] : (acts?.items ?? [])} saved={data.saved} stages={data.actStatus} now={now} go={go} />
      <div className="home-overview">
        <section
          className="card home-graduation"
          aria-labelledby="home-graduation-title"
        >
          <div className="home-card-heading">
            <h2 id="home-graduation-title">
              <span className="home-heading-icon">
                <GraduationCap size={19} />
              </span>
              나의 졸업 현황
            </h2>
            <button className="link" onClick={() => go('graduation')}>
              자세히 보기 <ArrowRight size={14} />
            </button>
          </div>
          <h3 className="home-grad-message">
            {hasCredits && remaining === null ? <>지금까지 <em>{credits}학점</em> 이수했어요</> : remaining !== null ? (
              remaining > 0 ? (
                <>
                  졸업 학점, <em>{remaining}학점</em> 남았어요
                </>
              ) : (
                <>
                  졸업 <em>학점 기준</em>을 채웠어요
                </>
              )
            ) : (
              <>
                졸업까지, <em>차근차근</em> 준비해요
              </>
            )}
          </h3>
          <p className="home-card-description">
            {hasCredits
              ? data.info?.credits !== undefined
                ? '종합정보 수집값 + 직접 등록한 이수 과목'
                : data.credits.trim()
                  ? '내 정보에 입력한 총 이수학점'
                  : '등록한 이수 과목 학점 합계'
              : '이수 내역을 연결하면 나의 졸업 현황을 볼 수 있어요.'}
          </p>
          {gradesUnverified && (
            <p className="home-card-description">
              최근 성적 확인이 완료되지 않아 이전 이수 내역이 표시될 수 있습니다. 학교 종합정보에서 확인해 주세요.
            </p>
          )}
          <div className="home-progress-caption">
            <span>
              이수 학점 <b>{hasCredits ? `${credits}학점` : '미입력'}</b>
              {total.required !== null && <span> / {total.required}학점</span>}
            </span>
            <b>
              {percent !== null
                ? `${percent}% 이수`
                : total.required === null
                  ? '기준 확인 필요'
                  : '입력 대기'}
            </b>
          </div>
          {percent !== null ? <progress
            className="home-progress"
            aria-label="졸업 학점 이수율"
            value={percent}
            max={100}
          /> : <p className="home-credit-help">{hasCredits ? '이수학점은 반영됐어요. ' : '학점과 기준을 확인해 주세요. '}<button className="link" onClick={() => go('graduation')}>입학 구분·졸업 기준 확인 <ArrowRight size={13} /></button> 후 진행률을 계산해요.</p>}
          <div className="home-grad-breakdown">
            <button onClick={() => go('graduation/major')}>
              <span>
                <i />
                전공 {completed.length ? `${major.earned}학점` : '미입력'}
              </span>
              <small>전공 이수 학점</small>
            </button>
            <button onClick={() => go('graduation/gen')}>
              <span>
                <i />
                교양 {completed.length ? `${general.earned}학점` : '미입력'}
              </span>
              <small>교양 이수 학점</small>
            </button>
            <button onClick={() => go('graduation/points')}>
              <span>
                <i />
                비교과{' '}
                {points !== undefined && Number.isFinite(points)
                  ? `${points}P`
                  : '미입력'}
              </span>
              <small>누적 비교과 포인트</small>
            </button>
          </div>
          <CreditComposition total={credits} major={major.earned} general={general.earned} other={graduation.find(r => r.rule.id === 'free')!.earned} />
          <ProgressMetric label="비교과 포인트 적립" value={points} target={graduation.find(r => r.rule.id === 'points')!.required} unit="P" tone="purple" />
        </section>
        <section
          className="card home-deadlines"
          aria-labelledby="home-deadlines-title"
        >
          <div className="home-card-heading">
            <h2 id="home-deadlines-title">
              <span className="home-heading-icon orange">
                <Clock3 size={18} />
              </span>
              다가오는 마감
            </h2>
            <button className="link" onClick={() => go('calendar')}>
              전체 보기 <ArrowRight size={14} />
            </button>
          </div>
          <p className="home-card-description">
            놓치면 안 되는 수업과 일정을 모았어요.
          </p>
          {week.length ? (
            <div className="home-deadline-list">
              {week.slice(0, 2).map((t, i) => (
                <button
                  key={i}
                  className="home-deadline-row"
                  onClick={() => go(t.route)}
                >
                  <span
                    className={'home-dday' + (t.dday <= 1 ? ' urgent' : '')}
                  >
                    {deadlineLabel(t.dday, t.overdue)}
                  </span>
                  <span>
                    <b>{t.title}</b>
                    <small>{t.sub || t.kind}</small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          ) : (
            <div className="home-inline-empty">
              <CalendarDays size={25} />
              <b>7일 이내 마감 일정이 없어요</b>
              <small>
                {lmsPending
                  ? `완료할 수업 항목은 ${lmsPending}건 있어요.`
                  : lmsSnap
                    ? '새로운 일정이 생기면 여기에 모아드릴게요.'
                    : '수업을 연결하면 과제와 강의 마감도 함께 볼 수 있어요.'}
              </small>
            </div>
          )}
          <button className="home-connection-link" onClick={() => go('lms')}>
            <Link2 size={14} />
            {lmsSnap
              ? `COSMOS 연동 정보${staleLabel(lmsSnap.fetchedAt, now, 7) ? ' · ' + staleLabel(lmsSnap.fetchedAt, now, 7) : ''}`
              : 'COSMOS 수업 연결하기'}
            <ArrowRight size={12} />
          </button>
        </section>
      </div>
      <ActivitySummary data={data} snapshot={acts} now={now} go={go} />
      <div className="home-agenda-heading">
        <h2>
          다가오는 학사 일정{' '}
          <span>
            {shortDate(monday)} — {shortDate(addDays(monday, 6))}
          </span>
        </h2>
        <button className="link" onClick={() => go('calendar')}>
          전체 일정 보기 <ArrowRight size={14} />
        </button>
      </div>
      <div className="home-agenda">
        <section className="card home-tasks" aria-labelledby="home-tasks-title">
          <div className="home-card-heading">
            <h2 id="home-tasks-title">
              해야 할 일 <span className="home-task-count">{taskCount}</span>
            </h2>
            <fieldset className="home-task-filters" aria-label="할 일 종류">
              {['전체', '온라인 강의', '과제'].map((filter) => (
                <button
                  key={filter}
                  aria-pressed={taskFilter === filter}
                  onClick={() => {
                    setTaskFilter(filter);
                    setShowAllTasks(false);
                  }}
                >
                  {filter}
                </button>
              ))}
            </fieldset>
          </div>
          <div className="home-task-list">
            {homework.slice(0, taskLimit).map((t, i) => (
              <button
                className="home-task-row"
                key={`lms-${i}`}
                onClick={() => go('lms')}
              >
                <span className="home-task-icon">
                  {t.kind === '강의' ? (
                    <MonitorPlay size={16} />
                  ) : (
                    <FileText size={16} />
                  )}
                </span>
                <span>
                  <b>{t.title}</b>
                  <small>
                    {t.course}
                    {t.due ? ` · ${t.due} 마감` : ' · 마감일 미지정'}
                    {t.uncertain ? ' · 완료 여부 확인 필요' : ''}
                  </small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
            {taskFilter === '전체' &&
              agenda
                .slice(0, Math.max(0, taskLimit - homework.length))
                .map((t, i) => (
                  <button
                    className="home-task-row"
                    key={`event-${i}`}
                    onClick={() => go(t.route)}
                  >
                    <span className="home-task-icon">
                      <CalendarDays size={16} />
                    </span>
                    <span>
                      <b>{t.title}</b>
                      <small>{t.sub || t.kind}</small>
                    </span>
                    <span
                      className={'home-dday' + (t.dday <= 1 ? ' urgent' : '')}
                    >
                      {deadlineLabel(t.dday, t.overdue)}
                    </span>
                  </button>
                ))}
            {taskFilter === '전체' &&
              tasks
                .slice(
                  0,
                  Math.max(0, taskLimit - homework.length - agenda.length),
                )
                .map(([n, title, desc, route]) => (
                  <button
                    className="home-task-row"
                    key={n}
                    onClick={() => go(route)}
                  >
                    <span className="home-task-icon">
                      <FileText size={16} />
                    </span>
                    <span>
                      <b>{title}</b>
                      <small>{desc}</small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
          </div>
          {!taskCount && (
            <div className="home-inline-empty">
              <FileText size={25} />
              <b>
                {taskFilter === '전체'
                  ? '확인할 일을 모두 살펴봤어요'
                  : `${taskFilter} 항목이 없어요`}
              </b>
              <small>
                {lmsSnap
                  ? '새로운 할 일이 생기면 이곳에서 확인하세요.'
                  : '학교 계정을 연결하면 수업 할 일을 불러올 수 있어요.'}
              </small>
              <button className="link" onClick={() => go('lms')}>
                수업 현황 보기 <ArrowRight size={14} />
              </button>
            </div>
          )}
          {taskCount > 4 && (
            <button
              className="home-show-more link"
              onClick={() => setShowAllTasks((value) => !value)}
            >
              {showAllTasks ? '접기' : `외 ${taskCount - 4}건 더 보기`}{' '}
              <ArrowRight size={13} />
            </button>
          )}
        </section>
        <section
          className="card home-timetable"
          aria-labelledby="home-timetable-title"
        >
          <div className="home-card-heading">
            <h2 id="home-timetable-title">나의 시간표</h2>
            <button className="link" onClick={() => go('timetable')}>
              시간표 보기 <ArrowRight size={14} />
            </button>
          </div>
          <p className="home-card-description">
            계획에 담은 수업을 요일별로 확인하세요.
          </p>
          <fieldset className="home-day-picker" aria-label="시간표 요일">
            {weekdays.map((label, i) => (
              <button
                key={label}
                aria-pressed={day === i}
                onClick={() => setSelectedDay(i)}
              >
                <small>{label}</small>
                <b>{dateOf(addDays(monday, i)).getDate()}</b>
              </button>
            ))}
          </fieldset>
          <div className="home-meetings">
            {meetings.length ? (
              meetings.map(({ section: s, slot }, i) => (
                <button
                  className="home-meeting"
                  key={`${s.id}-${slot.s}-${i}`}
                  onClick={() => go('timetable')}
                >
                  <span>
                    <b>{s.name}</b>
                    <small>{placeLabel(s)}</small>
                  </span>
                  <time>
                    {fmtMin(slot.s)} – {fmtMin(slot.e)}
                  </time>
                </button>
              ))
            ) : (
              <div className="home-inline-empty">
                <b>
                  {planned.length
                    ? '이날은 계획한 수업이 없어요'
                    : '아직 담은 수업이 없어요'}
                </b>
                <button
                  className="link"
                  onClick={() => go(planned.length ? 'timetable' : 'courses')}
                >
                  {planned.length ? '내 시간표 확인' : '과목 둘러보기'}{' '}
                  <Plus size={14} />
                </button>
              </div>
            )}
          </div>
          {planned.some((s) => !s.slots.length) && (
            <button
              className="home-connection-link"
              onClick={() => go('timetable')}
            >
              시간 미정 수업은 전체 시간표에서 확인하세요{' '}
              <ArrowRight size={12} />
            </button>
          )}
        </section>
      </div>
      <p className="home-source-note">
        <Info size={13} />
        <span>
          표시된 학점·수업 정보는 참고용입니다. 실제 이수 내역과 졸업 기준은
          학교에서 확인해 주세요.
          {lmsSnap && ` · COSMOS ${lmsSnap.fetchedAt.slice(0, 10)} 수집`}
        </span>
      </p>
      {scheduleFailed && (
        <p className="home-source-note">
          학사일정을 불러오지 못했어요.{' '}
          <button className="link" onClick={retrySchedule}>
            다시 시도
          </button>
        </p>
      )}
      {activitiesFailed && (
        <p className="home-source-note">
          비교과 정보를 불러오지 못했어요.{' '}
          <button className="link" onClick={retryActivities}>
            다시 시도
          </button>
        </p>
      )}
      <details className="home-more">
        <summary>
          학기 계획과 비교과 둘러보기 <ChevronRight size={15} />
        </summary>
        <div className="home-extras">
          <section className="card pad">
            <div className="section-heading">
              <h2>다음 학기 계획</h2>
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
                  아직 담은 과목이 없어요. 개설강의에서 관심 과목을 골라 다음
                  학기를 미리 그려보세요.
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
              aria-label="지금 신청할 수 있는 비교과 프로그램"
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
                    {liveStatus(cur, now).label}
                    {liveStatus(cur, now).dday
                      ? ' · ' + liveStatus(cur, now).dday
                      : ''}
                    {cur.points != null ? ` · ${cur.points}P` : ''}
                  </span>
                  <h3>{cur.title}</h3>
                  <p>
                    {cur.dept}
                    {cur.applyEnd
                      ? ` · 신청 마감 ${cur.applyEnd.slice(0, 10)}`
                      : ''}
                  </p>
                  <button
                    className="link"
                    onClick={() => go('activities/' + cur.id)}
                  >
                    자세히 보기 <ArrowUpRight size={15} />
                  </button>
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
                  <span className="event-date">{scheduleDateLabel(e)}</span>
                  <div>
                    <b>{e.title}</b>
                  </div>
                </div>
              ))}
              {data.events.length ? (
                data.events.slice(0, 3).map((e, i) => (
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
                      ? '개인 일정은 아직 없어요.'
                      : '아직 등록한 일정이 없어요.'}
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
        </div>
      </details>
    </div>
  );
}
