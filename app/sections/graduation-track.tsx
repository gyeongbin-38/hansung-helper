'use client';
import { ArrowRight, BookOpen, CalendarClock, Check, CircleAlert, ClipboardList } from 'lucide-react';
import { planBlockReason, useCourseHistory, useCurriculum, useCurriculumIndex, useEquivalents, useNow, useSchedule } from './catalog';
import { buildRequiredTrack, findRetakeCandidates, pickCurriculumSemester, type TrackCourse, type TrackGroup } from '@/lib/data/curriculum';
import { lastOfferedLabel, offeringLabelFromTerms } from '@/lib/data/course-history';
import { mergeCompleted } from '@/lib/data/info';
import { formatSemesterLabel, generalEducationReference, normalizeSemesterLabel } from '@/lib/data/graduation';
import { earliestRoadmapSemester, nextRegularSemesters, planRoadmap, semesterCalendarIndex } from '@/lib/data/roadmap';
import { scheduleToday, upcomingSchedule } from '@/lib/data/schedule';
import { slotsLabel } from '@/lib/data/catalog';
import { SkeletonRows, RetryButton } from './skeleton';
import type { Catalog, CourseSection } from '@/lib/data/catalog';
import type { Data } from './data';

type Props = {
  data: Data;
  year: number | undefined;
  catalog: Catalog | null;
  planned: CourseSection[];
  go: (route: string) => void;
  onPlan?: (id: string) => Promise<boolean>;
  notify?: (msg: string) => void;
  /** 프로필 저장 — 졸업 목표 빠른 설정에 사용 */
  persist?: (draft: Data, msg?: string) => Promise<boolean>;
};

const STATUS_LABEL: Record<TrackCourse['status'], { text: string; cls: string }> = {
  done: { text: '이수', cls: 'green' },
  planned: { text: '계획 중', cls: '' },
  missing: { text: '미이수', cls: 'orange' },
};

/** 미이수 과목의 개설 리스크 — 정규학기 양쪽 다 열리면(null) 조용히 둔다 */
function offeringWarn(c: TrackCourse, currentSemester: string | undefined): string | null {
  const h = c.hist;
  if (!h || c.status === 'done') return null;
  const restricted = !(h.terms.includes('1') && h.terms.includes('2'));
  const parts = [
    restricted ? offeringLabelFromTerms(h.terms) : null,
    lastOfferedLabel(h, currentSemester),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function CourseRow({ c, warn }: { c: TrackCourse; warn?: string | null }) {
  const st = STATUS_LABEL[c.status];
  return (
    <li className={`track-course ${c.status}`}>
      <span className="track-check" aria-hidden="true">{c.status === 'done' && <Check size={13} />}</span>
      <div className="track-course-body">
        <b>{c.name}</b>
        <small>
          {c.credits}학점{c.matchedName && <> · ‘{c.matchedName}’(으)로 인정</>}
          {c.failed && <> · <em className="track-warn">{c.failed} — 재수강 필요</em></>}
          {c.status === 'missing' && c.offered && <> · <em className="track-offered">이번 학기 개설</em></>}
          {warn && <> · <em className="track-warn">{warn}</em></>}
        </small>
      </div>
      <span className={`badge ${st.cls}`}>{st.text}</span>
    </li>
  );
}

/** 미이수+이번 학기 개설 과목 — 분반 칩으로 바로 계획에 담는다 */
function NowRow({
  c,
  sections,
  planned,
  data,
  onPlan,
  notify,
  retake,
  gain,
}: {
  c: TrackCourse;
  sections: CourseSection[];
  planned: CourseSection[];
  data: Data;
  onPlan?: Props['onPlan'];
  notify?: Props['notify'];
  /** 성적 갱신 재수강 — 이수 완료 과목도 담기 허용 */
  retake?: boolean;
  /** A0 재수강 시 예상 평균평점 상승폭 추정 */
  gain?: number;
}) {
  const st = retake ? { text: '성적 개선', cls: '' } : STATUS_LABEL[c.status];
  return (
    <li className={`track-course ${retake ? 'done' : c.status} track-now-row`}>
      <div className="track-course-body">
        <b>{c.name}</b>
        <small>
          {c.credits}학점
          {c.failed && <> · <em className="track-warn">{c.failed} 재수강</em></>}
          {gain !== undefined && gain > 0 && <> · A0 시 평점 +{gain.toFixed(2)}</>}
          {c.offeredCode && <> · 동일과목 {c.offeredCode}(으)로 개설</>}
        </small>
      </div>
      <span className={`badge ${st.cls}`}>{st.text}</span>
      {!!sections.length && (
        <div className="track-now-secs">
          {sections.map((s) => {
            const inPlan = planned.some((p) => p.id === s.id);
            return (
              <button
                key={s.id}
                className={`track-chip${inPlan ? ' on' : ''}`}
                aria-pressed={inPlan}
                onClick={() => {
                  if (!onPlan) return;
                  if (inPlan) { void onPlan(s.id); return; }
                  const blocked = planBlockReason(s, data, planned, { retake });
                  if (blocked) { notify?.(blocked); return; }
                  void onPlan(s.id);
                }}
              >
                {s.section}분반 {slotsLabel(s)}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

function Group({ g, currentSemester, selProgress }: { g: TrackGroup; currentSemester?: string; selProgress?: string }) {
  const done = g.courses.filter((c) => c.status === 'done').length;
  const years = [...new Set(g.courses.map((c) => c.year))].sort((a, b) => (a ?? '9').localeCompare(b ?? '9'));
  const body = (
    <>
      {years.map((y) => (
        <div className="track-year" key={y ?? 'all'}>
          <span className="track-year-label">{y ? `${y}학년` : '전학년'}</span>
          <ul className="track-courses">
            {g.courses.filter((c) => c.year === y).map((c) => (
              <CourseRow key={c.code} c={c} warn={offeringWarn(c, currentSemester)} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
  if (g.role === 'gen-selective') {
    return (
      <details className="card track-group track-group-selective">
        <summary aria-label={`${g.title} — 이 중 선택 이수, ${selProgress ?? `${done}/${g.courses.length}과목 완료`}`}>
          <span><b>{g.title}</b><small>이 중 선택 이수{selProgress ? ` · ${selProgress}` : ` · ${done}/${g.courses.length}과목 완료`}</small></span>
        </summary>
        {body}
      </details>
    );
  }
  return (
    <section className="card track-group">
      <div className="track-group-head">
        <h3>{g.title}</h3>
        {g.role === 'major-track' && <span className="badge">트랙</span>}
        <span className="track-group-count">{done}/{g.courses.length}</span>
      </div>
      {body}
    </section>
  );
}

export function GraduationTrack({ data, year, catalog, planned, go, onPlan, notify, persist }: Props) {
  const { snap: index, failed: indexFailed, retry: retryIndex } = useCurriculumIndex();
  const semester = pickCurriculumSemester(year, index);
  const { snap: curriculum, failed, retry } = useCurriculum(semester);
  const equiv = useEquivalents();
  const history = useCourseHistory();
  const { snap: schedule } = useSchedule();
  const now = useNow();
  const dept = data.info?.dept || data.dept;

  if (!year)
    return (
      <section className="card track-empty">
        <ClipboardList size={20} aria-hidden="true" />
        <p>입학연도를 확인해야 해당 학번 교육과정을 보여드릴 수 있어요.</p>
        <button className="secondary" onClick={() => go('profile')}>프로필에서 확인 <ArrowRight size={14} /></button>
      </section>
    );

  if (indexFailed || failed)
    return (
      <section className="card track-empty">
        <CircleAlert size={20} aria-hidden="true" />
        <p>교육과정 자료를 불러오지 못했어요.</p>
        <RetryButton onRetry={indexFailed ? retryIndex : retry} />
      </section>
    );

  if (!index || !curriculum)
    return <SkeletonRows n={5} />;

  const completed = mergeCompleted(data.completed, data.info?.completed);
  const track = buildRequiredTrack({
    curriculum,
    deptInput: dept,
    completed,
    plannedCodes: new Set(planned.map((s) => s.code)),
    offeredCodes: new Set(catalog?.sections.map((s) => s.code) ?? []),
    equiv,
    history,
    failed: data.info?.failedCourses,
  });

  // 선택필수교양 진행도 — 학번별 교양 기준 표의 선필교 학점을 파싱한다
  const selEarned = completed
    .filter((c) => c.category === '선필교')
    .reduce((s, c) => s + c.credits, 0);
  const genRef = generalEducationReference(year, data.admissionType ?? 'unknown');
  const selTargetText = genRef?.note.match(/선택필수교양\s*(\d+(?:~\d+)?)학점/)?.[1];
  const selMin = selTargetText ? Number(selTargetText.split('~')[0]) : null;
  const selGap = selMin !== null ? Math.max(0, selMin - selEarned) : 0;
  const selProgress = selTargetText
    ? `이수 ${selEarned}학점 / 기준 ${selTargetText}학점`
    : selEarned > 0 ? `이수 ${selEarned}학점` : undefined;

  // 그룹(공통·트랙·교필 목록)에 걸친 동일 코드는 한 번만 — 담기 카드·로드맵이 중복되지 않게
  const missing = [...new Map(
    track.groups
      .filter((g) => g.role !== 'gen-selective')
      .flatMap((g) => g.courses)
      .filter((c) => c.status !== 'done')
      .map((c) => [c.code, c]),
  ).values()];
  const sectionsOf = (code: string) =>
    catalog?.sections.filter((s) => s.code === code) ?? [];

  // 선택필수 후보 — 선필교 학점이 부족할 때 이번 학기 개설 과목을 보여준다
  const selOffered = selGap > 0
    ? [...new Map(
        track.groups
          .filter((g) => g.role === 'gen-selective')
          .flatMap((g) => g.courses)
          .filter((c) => c.status === 'missing' && c.offered)
          .map((c) => [c.code, c]),
      ).values()]
    : [];

  // 남은 학기 로드맵 — 진짜 미이수만 미래 학기에 배치한다 (계획 중은 이번 학기 처리 중)
  // 트랙이 여럿인 학부는 학생의 트랙 과목만 배치한다 — 모든 트랙을 이수할 필요는 없기 때문
  const myTrack = data.info?.track ?? data.info?.tracks?.[0];
  const roadmapGroups = track.groups.filter((g) => {
    if (g.role !== 'major-track') return g.role !== 'gen-selective';
    if (!myTrack) return false;
    const t = myTrack.replace(/[\s·-]/g, '');
    const title = g.title.replace(/[\s·-]/g, '');
    return title.includes(t) || t.includes(title);
  });
  const roadmapMissing = [...new Map(
    roadmapGroups
      .flatMap((g) => g.courses)
      .filter((c) => c.status === 'missing')
      .map((c) => [c.code, { code: c.code, name: c.name, credits: c.credits, year: c.year, terms: c.hist?.terms }]),
  ).values()];
  const roadmap = planRoadmap({
    missing: roadmapMissing,
    currentSemester: catalog?.semester,
    target: normalizeSemesterLabel(data.graduationTarget),
  });

  // 필수 배치 기준 가장 빠른 졸업 학기 — 목표보다 앞당길 수 있으면 알려준다
  const earliest = earliestRoadmapSemester({
    missing: roadmapMissing,
    currentSemester: catalog?.semester,
  });
  // 계절학기 개설 이력까지 활용하면 더 빨라지는지 — 정규 전용 결과보다 앞설 때만 노출
  const earliestSeasonal = earliestRoadmapSemester({
    missing: roadmapMissing,
    currentSemester: catalog?.semester,
    seasonal: true,
  });
  const seasonalEarlier =
    !!earliestSeasonal?.semester &&
    (!earliest?.semester ||
      (semesterCalendarIndex(earliestSeasonal.semester) ?? 0) <
        (semesterCalendarIndex(earliest.semester) ?? 0));
  const seasonalCourseNames = seasonalEarlier
    ? roadmapMissing
        .filter((c) => c.terms && /[34]/.test(c.terms))
        .map((c) => c.name)
        .slice(0, 4)
        .join('·')
    : '';
  const semIdxOf = (s?: string | null) => {
    const m = s?.match(/^(20\d{2})-([12])$/);
    return m ? Number(m[1]) * 2 + Number(m[2]) : null;
  };
  const earlyGap = earliest?.semester && roadmap.target
    ? (semIdxOf(roadmap.target)! - semIdxOf(earliest.semester)!)
    : 0;

  // 졸업 목표 빠른 설정 — 배치 가능한 가장 빠른 학기부터 선택지를 준다
  const targetOptions = earliest?.semester
    ? [earliest.semester, ...nextRegularSemesters(earliest.semester, null, 2)]
    : nextRegularSemesters(catalog?.semester, null, 3);

  // 성적 갱신 재수강 — 이수했지만 C+ 이하이고 이번 학기 개설된 과목
  const enteredCredits = data.credits.trim() ? Number(data.credits) : undefined;
  const totalCredits = data.info?.credits ?? (Number.isFinite(enteredCredits) ? enteredCredits : undefined);
  const retakes = findRetakeCandidates({
    completed,
    offeredCodes: new Set(catalog?.sections.map((s) => s.code) ?? []),
    plannedCodes: new Set(planned.map((s) => s.code)),
    equiv,
    totalCredits,
  });

  // 수강신청·정정 기간 — 분반 담기 행동과 직접 관련된 창구만 표시
  const todayKst = scheduleToday(now);
  const regEvent = upcomingSchedule(
    (schedule?.items ?? []).filter((e) => /수강신청|정정/.test(e.title)),
    todayKst,
  )[0];
  const regDday = regEvent
    ? Math.round((Date.parse(regEvent.start) - Date.parse(todayKst)) / 86400000)
    : null;
  // 다음 계절학기 개강 — 계절 활용 판정이 뜰 때 함께 보여준다
  const nextSeasonalStart = seasonalEarlier
    ? upcomingSchedule(
        (schedule?.items ?? []).filter((e) => /계절학기.*개강|상상더학기.*개강/.test(e.title)),
        todayKst,
      )[0]
    : undefined;

  // 비교과 포인트 결핍 → 채울 활동 직결
  const ptsTarget = (data.admissionType ?? 'freshman') === 'freshman' ? 800 : 400;
  const entered = data.points.trim() ? Number(data.points) : undefined;
  const ptsHave = data.info?.points ?? (Number.isFinite(entered) ? entered : undefined);
  const ptsGap = ptsHave !== undefined ? Math.max(0, ptsTarget - ptsHave) : 0;

  return (
    <>
      <section className="card track-summary">
        <div>
          <h3><BookOpen size={19} aria-hidden="true" />필수 과목 이수 지도</h3>
          <p className="meta">{semester ? `${formatSemesterLabel(semester)} 교육과정` : '교육과정'} · {dept || '학과 미확인'}</p>
        </div>
        {track.requiredTotal > 0 && (
          <div className="track-total">
            <b>{track.requiredDone}/{track.requiredTotal}</b>
            <span>필수 이수</span>
          </div>
        )}
        {ptsGap > 0 && (
          <button className="track-points-link" onClick={() => go('activities/points')}>
            비교과 포인트 {ptsGap} 부족 — 채울 활동 보기 <ArrowRight size={13} />
          </button>
        )}
      </section>

      {!dept.trim() && (
        <p className="meta conn-warn">소속 학과가 없어 교양 과목만 표시해요. <button className="link" onClick={() => go('profile')}>학과 입력 <ArrowRight size={13} /></button></p>
      )}
      {!!track.ambiguous?.length && (
        <p className="meta conn-warn">학과가 모호해요: {track.ambiguous.join(' · ')} — 프로필에서 정확히 입력하면 좁혀져요.</p>
      )}
      {dept.trim() && !track.groups.some((g) => g.role.startsWith('major')) && !track.ambiguous && (
        <p className="meta conn-warn">이 교육과정에서 ‘{dept}’ 전공을 찾지 못했어요. 표기가 다르면 교양 과목만 표시됩니다.</p>
      )}

      {(!!missing.length && missing.some((c) => c.offered)) || !!selOffered.length || !!retakes.length ? (
        <section className="card track-now">
          <div className="track-group-head"><h3>이번 학기에 들을 수 있는 미이수 필수</h3><span className="badge">{catalog?.semester}</span></div>
          {regEvent && regDday !== null && regDday <= 45 && (
            <p className="meta track-reg">
              <CalendarClock size={13} aria-hidden="true" />
              {regEvent.title} {regDday <= 0 ? '진행 중' : `D-${regDday}`}
            </p>
          )}
          <ul className="track-courses">
            {missing.filter((c) => c.offered).sort((a, b) => Number(!!b.failed) - Number(!!a.failed)).map((c) => (
              <NowRow
                key={c.code}
                c={c}
                sections={sectionsOf(c.offeredCode ?? c.code)}
                planned={planned}
                data={data}
                onPlan={onPlan}
                notify={notify}
              />
            ))}
          </ul>
          {!!selOffered.length && (
            <>
              <div className="track-group-head track-sel-head"><h3>선택필수 후보</h3><span className="badge orange">{selGap}학점 부족</span></div>
              <ul className="track-courses">
                {selOffered.map((c) => (
                  <NowRow
                    key={c.code}
                    c={c}
                    sections={sectionsOf(c.offeredCode ?? c.code)}
                    planned={planned}
                    data={data}
                    onPlan={onPlan}
                    notify={notify}
                  />
                ))}
              </ul>
            </>
          )}
          {!!retakes.length && (
            <>
              <div className="track-group-head track-sel-head"><h3>평점 개선 재수강</h3><span className="badge">C+ 이하</span></div>
              <ul className="track-courses">
                {retakes.map((r) => (
                  <NowRow
                    key={r.offeredCode}
                    c={{ code: r.code, name: r.name, credits: r.credits, year: null, status: 'missing', offered: true, offeredCode: r.offeredCode !== r.code ? r.offeredCode : undefined, failed: r.grade }}
                    sections={sectionsOf(r.offeredCode)}
                    planned={planned}
                    data={data}
                    onPlan={onPlan}
                    notify={notify}
                    retake
                    gain={r.gain}
                  />
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}

      {(!!roadmap.slots.length || !!roadmap.unplaced.length) && (
        <section className="card track-roadmap">
          <div className="track-group-head">
            <h3>남은 학기 로드맵</h3>
            {roadmap.target
              ? <span className="badge">{formatSemesterLabel(roadmap.target)} 목표</span>
              : <button className="link" onClick={() => go('profile')}>졸업 목표 설정 <ArrowRight size={13} /></button>}
          </div>
          {earliest?.semester && (earlyGap > 0 || !roadmap.target) && (
            <p className="meta roadmap-earliest">
              필수 과목 배치 기준 빠른 졸업 <b>{earliest.label}</b>
              {earlyGap > 0 && <> — 목표보다 {earlyGap}학기 앞당길 수 있어요</>}
            </p>
          )}
          {seasonalEarlier && earliestSeasonal?.semester && (
            <p className="meta roadmap-earliest">
              계절학기 개설 이력 활용 시 <b>{earliestSeasonal.label}</b>
              {!!seasonalCourseNames && <> — 계절 개설: {seasonalCourseNames}</>}
              {!!nextSeasonalStart && <> — {nextSeasonalStart.title} {nextSeasonalStart.start}</>}
            </p>
          )}
          {!roadmap.target && !!persist && !!targetOptions.length && (
            <fieldset className="track-target-chips" aria-label="졸업 목표 빠른 설정">
              {targetOptions.map((s) => (
                <button
                  key={s}
                  className="track-chip"
                  onClick={() =>
                    void persist(
                      { ...data, graduationTarget: s },
                      `${formatSemesterLabel(s)} 졸업 목표로 저장했어요`,
                    )
                  }
                >
                  {formatSemesterLabel(s)}
                </button>
              ))}
            </fieldset>
          )}
          {roadmap.slots.map((s) => (
            <div className="roadmap-slot" key={s.semester}>
              <div className="roadmap-sem">
                <b>{s.label}</b>
                <span>{s.courses.length}과목 · {s.credits}학점{s.heavy && <em className="track-warn"> 필수 부하</em>}</span>
              </div>
              <small>{s.courses.map((c) => c.name).join(' · ')}</small>
            </div>
          ))}
          {roadmap.unplaced.map(({ course, reason }) => (
            <p className="meta conn-warn" key={course.code}>{course.name} — {reason}</p>
          ))}
        </section>
      )}

      {track.groups.map((g) => <Group key={g.key} g={g} currentSemester={catalog?.semester} selProgress={g.role === 'gen-selective' ? selProgress : undefined} />)}

      {!track.groups.length && (
        <section className="card track-empty">
          <ClipboardList size={20} aria-hidden="true" />
          <p>이 학번의 교육과정에서 필수 과목을 찾지 못했어요.</p>
        </section>
      )}
      <p className="meta">교육과정은 입학연도 기준이며 학과별 세부 인정은 학교 사정으로 확인해요.</p>
    </>
  );
}
