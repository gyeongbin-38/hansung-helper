'use client';
import type { ReactNode } from 'react';
import { ArrowRight, ChevronDown, Info } from 'lucide-react';
import { gradGroup, type CourseSection } from '@/lib/data/catalog';
import type { AdmissionType, RuleResult } from '@/lib/data/graduation';
import type { MergedCourse } from '@/lib/data/info';
import { categoryBreakdown, categoryLabel, requirementSegments, semesterBreakdown, targetProgress } from '@/lib/data/visual-progress';

const ADMISSIONS = [
  ['freshman', '신입학', '1학년으로 입학'],
  ['general-transfer', '일반편입', '3학년으로 편입'],
  ['bachelor-transfer', '학사편입', '학사 취득 후 편입'],
] as const;

const groupTone = (category: string) => {
  const group = gradGroup(category);
  return group.startsWith('전공') ? 'major' : group === '교양' ? 'general' : group === '일반선택' ? 'free' : 'other';
};
const unitOf = (result: RuleResult) => result.rule.source === 'points' ? 'P' : '학점';

export function ResultBadge({ result, known }: { result: RuleResult; known: boolean }) {
  const text = !known ? '입력 필요' : result.status === 'met' ? '충족' : result.status === 'unknown' ? '기준 확인 필요' : '진행 중';
  return <span className={`badge ${!known || result.status === 'unknown' ? 'orange' : result.status === 'met' ? 'green' : 'purple'}`}>{text}</span>;
}

export function Ratio({ result, known = true, admissionMissing = false }: { result: RuleResult; known?: boolean; admissionMissing?: boolean }) {
  if (result.uncertainTrack) return <div className="visual-progress-pending">각 트랙의 인정 학점 확인 필요</div>;
  if (result.uncertainAllocation) return <div className="visual-progress-pending">일반선택 배분과 교양 영역 확인 필요</div>;
  const segments = known ? requirementSegments(result.earned, result.planned, result.required) : null;
  if (!segments) return <div className="visual-progress-pending"><span aria-hidden="true" />
    {!known ? '이수 정보 확인 후 진행률 표시' : admissionMissing ? '입학 구분을 선택하면 진행률이 표시돼요' : '기준 확인 후 진행률 표시'}</div>;
  const percent = targetProgress(result.earned, result.required)!.percent;
  return <div className="gm-segment-bar">
    <progress className="sr-only" max={100} value={percent} aria-label={`${result.rule.label} 충족률`}
      aria-valuetext={`${percent}%${segments.plan ? `, 계획 반영 시 ${segments.plan}${unitOf(result)} 추가` : ''}`} />
    <span className="gm-segment-done" aria-hidden="true" style={{ width: `${segments.donePct}%` }} />
    {segments.plan > 0 && <span className="gm-segment-plan" aria-hidden="true" style={{ width: `${segments.planPct}%` }} />}
  </div>;
}

function Ring({ result, known, tone }: { result: RuleResult; known: boolean; tone: string }) {
  const segments = known ? requirementSegments(result.earned, result.planned, result.required) : null;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const arc = (pct: number) => `${circumference * pct / 100} ${circumference}`;
  const unit = unitOf(result);
  const percent = segments ? targetProgress(result.earned, result.required)!.percent : null;
  return <div className={`gm-ring gm-ring-${tone}`}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle className="gm-ring-base" cx="50" cy="50" r={radius} />
      {segments && <>
        <circle className="gm-ring-done" cx="50" cy="50" r={radius} strokeDasharray={arc(segments.donePct)} transform="rotate(-90 50 50)" />
        {segments.plan > 0 && <circle className="gm-ring-plan" cx="50" cy="50" r={radius} strokeDasharray={arc(segments.planPct)}
          strokeDashoffset={-circumference * segments.donePct / 100} transform="rotate(-90 50 50)" />}
      </>}
    </svg>
    <div className="gm-ring-center">
      {percent !== null ? <><b>{percent}<small>%</small></b><span>충족</span></>
        : known ? <><b>{result.earned}<small>{unit}</small></b><span>기준 대기</span></>
        : <><b>–</b><span>미입력</span></>}
    </div>
  </div>;
}

function CategoryBars({ courses }: { courses: MergedCourse[] }) {
  const rows = categoryBreakdown(courses);
  if (!rows.length) return null;
  const max = Math.max(...rows.map(row => row.credits), 1);
  return <figure className="gm-chart">
    <figcaption>이수구분별 학점</figcaption>
    <ul className="gm-category-bars">
      {rows.map(row => <li key={row.category}>
        <span className="gm-category-name">{row.label}</span>
        <span className="gm-category-track" aria-hidden="true"><i className={`gm-tone-${groupTone(row.category)}`} style={{ width: `${Math.max(4, row.credits / max * 100)}%` }} /></span>
        <b>{row.credits}<small>학점 · {row.count}과목</small></b>
      </li>)}
    </ul>
  </figure>;
}

function SemesterColumns({ courses }: { courses: MergedCourse[] }) {
  const { items, undated, max } = semesterBreakdown(courses);
  if (!items.length) return null;
  const shown = items.slice(-8);
  return <figure className="gm-chart">
    <figcaption>학기별 이수 흐름{undated > 0 && <small>학기 미확인 {undated}학점 제외</small>}</figcaption>
    <ol className="gm-semester-columns" aria-label={shown.map(item => `${item.semester} ${item.credits}학점`).join(', ')}>
      {shown.map(item => <li key={item.semester} aria-hidden="true">
        <b>{item.credits}</b>
        <span className="gm-semester-bar"><i style={{ height: `${Math.max(6, item.credits / max * 100)}%` }} /></span>
        <small>{item.semester.slice(2)}</small>
      </li>)}
    </ol>
  </figure>;
}

export function AdmissionQuickPick({ value, busy, onPick, compact = false }: {
  value: AdmissionType; busy: boolean; onPick: (next: AdmissionType) => void; compact?: boolean;
}) {
  return <fieldset className={`admission-pick ${compact ? 'compact' : ''}`} aria-label="입학 구분 선택">
    <div className="admission-pick-copy">
      <b>{compact ? '입학 구분을 고르면 기준이 바로 적용돼요' : '입학 구분만 한 번 선택해 주세요'}</b>
      {!compact && <small>선택하면 학번별 졸업 기준이 모든 카드에 자동으로 적용되고, 언제든 바꿀 수 있어요.</small>}
    </div>
    <div className="admission-pick-options">
      {ADMISSIONS.map(([id, label, note]) => <button type="button" key={id} aria-pressed={value === id} disabled={busy} onClick={() => onPick(id)}>
        <b>{label}</b><small>{note}</small>
      </button>)}
    </div>
  </fieldset>;
}

export function GraduationMetricDetails({ className, icon, title, result, known, value, courses, plannedCourses,
  sourceDate, pointsSource, route, go, admission, onAdmission, busy, yearKnown, foot }: {
  className: string; icon: ReactNode; title: string; result: RuleResult; known: boolean; value: string;
  courses: MergedCourse[]; plannedCourses: CourseSection[]; sourceDate?: string; pointsSource?: 'school' | 'manual';
  route: string; go: (route: string) => void;
  admission: AdmissionType; onAdmission: (next: AdmissionType) => void; busy: boolean; yearKnown: boolean;
  foot?: ReactNode;
}) {
  const unit = unitOf(result);
  const isPoints = result.rule.source === 'points';
  const segments = known ? requirementSegments(result.earned, result.planned, result.required) : null;
  const requiredSource = result.requiredSource === 'override' ? '사용자 조정'
    : result.requiredSource === 'dept' ? '학과·학번 기준' : result.requiredSource === 'global' ? '학교 공통 기준' : '기준 미확정';
  const tone = isPoints ? 'points' : result.rule.id === 'gen' ? 'general' : result.rule.id === 'free' ? 'free' : 'major';
  const schoolCount = courses.filter(course => course.src === 'info').length;
  const recent = [...courses].sort((a, b) => (b.semester ?? '').localeCompare(a.semester ?? '')).slice(0, 6);
  const progress = known ? targetProgress(result.earned, result.required) : null;
  return <details name="gm-metric" className={`${className} gm-details gm-tone-${tone}`}>
    <summary>
      <div className="graduation-metric-heading"><h3>{icon}{title}</h3><span className="gm-toggle" aria-hidden="true"><ChevronDown size={20} /></span></div>
      <strong>{value}</strong>
      <div className="graduation-summary-meta">
        {progress ? <small>{progress.percent}% {isPoints ? '적립' : '이수'}{progress.remaining > 0 ? ` · ${progress.remaining}${unit} 남음` : ' · 기준 도달'}</small>
          : <small>{!known ? '이수 정보가 필요해요' : admission === 'unknown' ? '입학 구분 선택 시 기준 적용' : '적용 기준을 확인해 주세요'}</small>}
      </div>
      <Ratio result={result} known={known} admissionMissing={admission === 'unknown'} />
      {foot}
    </summary>
    <div className="graduation-metric-breakdown">
      <div className="gm-visual">
        <Ring result={result} known={known} tone={tone} />
        <ul className="gm-legend">
          <li><i className={`gm-dot gm-tone-${tone}`} /><span>확정</span><b>{known ? `${result.earned}${unit}` : '미입력'}</b></li>
          {!isPoints && <li><i className="gm-dot gm-dot-plan" /><span>계획</span><b>{result.planned}{unit}</b></li>}
          <li><i className="gm-dot gm-dot-rest" /><span>남음</span><b>{segments ? `${segments.rest}${unit}` : '계산 대기'}</b></li>
          <li><i className="gm-dot gm-dot-target" /><span>기준</span><b>{result.required === null ? '미확정' : `${result.required}${unit}`}</b>{result.required !== null && <small>{requiredSource}</small>}</li>
        </ul>
      </div>
      {result.required === null && (admission === 'unknown'
        ? <AdmissionQuickPick value={admission} busy={busy} onPick={onAdmission} compact />
        : !yearKnown ? <button className="link gm-inline-action" onClick={() => go('profile')}>입학연도를 입력하면 기준이 적용돼요 <ArrowRight size={13} /></button>
        : <p className="graduation-metric-empty">이 항목은 학과·트랙별 기준이 달라 자동 적용하지 않아요. 학과 요건에서 기준을 확인해 주세요.</p>)}
      {segments && segments.over > 0 && <p className="gm-over">기준보다 {segments.over}{unit} 더 {isPoints ? '적립' : '이수'}했어요.</p>}
      {result.uncertainCredits && <p className="graduation-metric-warning"><Info size={14} />재수강·중복 과목 여부를 확인하기 전이라 학점이 달라질 수 있어요.</p>}
      {isPoints ? <div className="graduation-metric-source">
        <b>포인트 출처</b><span>{!known ? '확인된 포인트 없음 — 학교 정보를 연결하면 자동으로 채워져요' : pointsSource === 'school' ? `종합정보 자동 수집${sourceDate ? ` · ${sourceDate}` : ''}` : '내 정보에서 직접 입력'}</span>
      </div> : <>
        <div className="gm-charts">
          <CategoryBars courses={courses} />
          <SemesterColumns courses={courses} />
        </div>
        {recent.length > 0 && <div className="gm-course-chips">
          <span className="gm-chips-title">최근 반영 과목 <small>학교 수집 {schoolCount} · 직접 입력 {courses.length - schoolCount}{sourceDate ? ` · ${sourceDate} 기준` : ''}</small></span>
          <ul>{recent.map(course => <li key={`${course.src}:${course.code}:${course.name}:${course.semester ?? ''}`}>
            <b>{course.name}</b><small>{categoryLabel(course.category)} · {course.credits}학점{course.grade ? ` · ${course.grade}` : ''}</small>
          </li>)}</ul>
          {courses.length > recent.length && <small className="gm-more">외 {courses.length - recent.length}과목</small>}
        </div>}
        {plannedCourses.length > 0 && <p className="graduation-metric-planned">이번 학기 계획: {plannedCourses.map(course => course.name).join(', ')}</p>}
        {!known && <p className="graduation-metric-empty">학교 정보를 연결하면 이수 과목이 자동으로 채워져요.</p>}
      </>}
      <button className="link graduation-metric-route" onClick={() => go(route)}>세부 현황에서 확인 <ArrowRight size={14} /></button>
    </div>
  </details>;
}
