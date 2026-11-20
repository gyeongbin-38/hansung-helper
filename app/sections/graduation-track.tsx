'use client';
import { ArrowRight, BookOpen, Check, CircleAlert, ClipboardList } from 'lucide-react';
import { useCurriculum, useCurriculumIndex, useEquivalents } from './catalog';
import { buildRequiredTrack, pickCurriculumSemester, type TrackCourse, type TrackGroup } from '@/lib/data/curriculum';
import { mergeCompleted } from '@/lib/data/info';
import { formatSemesterLabel } from '@/lib/data/graduation';
import { SkeletonRows, RetryButton } from './skeleton';
import type { Catalog, CourseSection } from '@/lib/data/catalog';
import type { Data } from './data';

type Props = {
  data: Data;
  year: number | undefined;
  catalog: Catalog | null;
  planned: CourseSection[];
  go: (route: string) => void;
};

const STATUS_LABEL: Record<TrackCourse['status'], { text: string; cls: string }> = {
  done: { text: '이수', cls: 'green' },
  planned: { text: '계획 중', cls: '' },
  missing: { text: '미이수', cls: 'orange' },
};

function CourseRow({ c }: { c: TrackCourse }) {
  const st = STATUS_LABEL[c.status];
  return (
    <li className={`track-course ${c.status}`}>
      <span className="track-check" aria-hidden="true">{c.status === 'done' && <Check size={13} />}</span>
      <div className="track-course-body">
        <b>{c.name}</b>
        <small>
          {c.credits}학점{c.matchedName && <> · ‘{c.matchedName}’(으)로 인정</>}
          {c.status === 'missing' && c.offered && <> · <em className="track-offered">이번 학기 개설</em></>}
        </small>
      </div>
      <span className={`badge ${st.cls}`}>{st.text}</span>
    </li>
  );
}

function Group({ g }: { g: TrackGroup }) {
  const done = g.courses.filter((c) => c.status === 'done').length;
  const years = [...new Set(g.courses.map((c) => c.year))].sort((a, b) => (a ?? '9').localeCompare(b ?? '9'));
  const body = (
    <>
      {years.map((y) => (
        <div className="track-year" key={y ?? 'all'}>
          <span className="track-year-label">{y ? `${y}학년` : '전학년'}</span>
          <ul className="track-courses">
            {g.courses.filter((c) => c.year === y).map((c) => <CourseRow key={c.code} c={c} />)}
          </ul>
        </div>
      ))}
    </>
  );
  if (g.role === 'gen-selective') {
    return (
      <details className="card track-group track-group-selective">
        <summary aria-label={`${g.title} — 이 중 선택 이수, ${done}/${g.courses.length}과목 완료`}>
          <span><b>{g.title}</b><small>이 중 선택 이수 · {done}/{g.courses.length}과목 완료</small></span>
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

export function GraduationTrack({ data, year, catalog, planned, go }: Props) {
  const { snap: index, failed: indexFailed, retry: retryIndex } = useCurriculumIndex();
  const semester = pickCurriculumSemester(year, index);
  const { snap: curriculum, failed, retry } = useCurriculum(semester);
  const equiv = useEquivalents();
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
  });

  const missing = track.groups
    .filter((g) => g.role !== 'gen-selective')
    .flatMap((g) => g.courses)
    .filter((c) => c.status !== 'done');

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

      {!!missing.length && missing.some((c) => c.offered) && (
        <section className="card track-now">
          <div className="track-group-head"><h3>이번 학기에 들을 수 있는 미이수 필수</h3><span className="badge">{catalog?.semester}</span></div>
          <ul className="track-courses">
            {missing.filter((c) => c.offered).map((c) => <CourseRow key={c.code} c={c} />)}
          </ul>
          <button className="secondary" onClick={() => go('courses')}>과목 찾아 담기 <ArrowRight size={15} /></button>
        </section>
      )}

      {track.groups.map((g) => <Group key={g.key} g={g} />)}

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
