'use client';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ArrowRight, ArrowUpRight, BookOpen, Check, ClipboardCheck, Clock3,
  ChevronDown, Database, GraduationCap, Info, Layers, Plus, Search, X,
} from 'lucide-react';
import { Graduation } from './graduation';
import { deptPoolOf, useDeptRules } from './catalog';
import { gradGroup, type CourseSection } from '@/lib/data/catalog';
import { evaluate, graduationOutlook, type AdmissionType, type RuleResult } from '@/lib/data/graduation';
import { mergeCompleted, resolveEarnedCredits, type MergedCourse } from '@/lib/data/info';
import { matchEnrollment } from '@/lib/data/lms';
import { deptRuleTargets, rulesetMatchesDept } from '@/lib/data/dept-rules';
import { graduationRuleLink } from '@/lib/data/graduation-links';
import { verifiedDeptGuide } from '@/lib/data/verified-dept-guide';
import reference from '@/lib/data/graduation-reference.json';
import { targetProgress } from '@/lib/data/visual-progress';

type Props = ComponentProps<typeof Graduation>;
const VIEWS = [
  ['', '졸업 요약'], ['outlook', '졸업 전망'], ['requirements', '요건별 충족 현황'],
  ['completed', '이수한 과목'], ['department', '학과 요건·계산 기준'],
] as const;
const MODES = [
  { id: 'fusion1', label: '융합전공 I', area: '전공융합 I' },
  { id: 'fusion2', label: '융합전공 II', area: '전공융합 II' },
  { id: 'advanced', label: '심화전공', area: '심화전공' },
] as const;

function Ratio({ result, known = true }: { result: RuleResult; known?: boolean }) {
  const progress = targetProgress(known ? result.earned : null, result.required);
  if (!progress) return <div className="visual-progress-pending"><span aria-hidden="true" />{known ? '기준 확인 후 진행률 표시' : '이수 정보 확인 후 진행률 표시'}</div>;
  const percent = progress.percent;
  return <progress className="progress-track" max={100} value={percent}
    aria-label={`${result.rule.label} 충족률`}
    aria-valuetext={!known ? '미입력' : result.required === null ? '기준 미확정' : `${percent}%`} />;
}

function ResultBadge({ result, known }: { result: RuleResult; known: boolean }) {
  const text = !known ? '입력 필요' : result.status === 'met' ? '충족' : result.status === 'unknown' ? '기준 확인 필요' : '진행 중';
  return <span className={`badge ${!known || result.status === 'unknown' ? 'orange' : result.status === 'met' ? 'green' : 'purple'}`}>{text}</span>;
}

function GraduationMetricDetails({ className, icon, title, result, known, value, courses, plannedCourses,
  sourceDate, pointsSource, route, go }: {
  className: string; icon: ReactNode; title: string; result: RuleResult; known: boolean; value: string;
  courses: MergedCourse[]; plannedCourses: CourseSection[]; sourceDate?: string; pointsSource?: 'school' | 'manual';
  route: string; go: (route: string) => void;
}) {
  const remaining = known && result.required !== null ? Math.max(0, result.required - result.earned) : null;
  const schoolCount = courses.filter(course => course.src === 'info').length;
  const manualCount = courses.filter(course => course.src === 'manual').length;
  const requiredSource = result.requiredSource === 'override' ? '사용자 조정'
    : result.requiredSource === 'dept' ? '학과·학번 기준' : result.requiredSource === 'global' ? '학교 공통 기준' : '기준 미확정';
  const unit = result.rule.source === 'points' ? 'P' : '학점';
  return <details className={className}>
    <summary>
      <div className="graduation-metric-heading"><h3>{icon}{title}</h3><ResultBadge result={result} known={known} /></div>
      <strong>{value}</strong>
      <div className="graduation-summary-meta">
        {known && targetProgress(result.earned, result.required)
          ? <small>{targetProgress(result.earned, result.required)!.percent}% {result.rule.source === 'points' ? '적립' : '이수'}</small>
          : <small>{known ? '적용 기준을 확인해 주세요' : '이수 정보가 필요해요'}</small>}
      </div>
      <Ratio result={result} known={known} />
      <span className="graduation-metric-toggle"><span>상세 보기</span><ChevronDown size={16} /></span>
    </summary>
    <div className="graduation-metric-breakdown">
      <dl>
        <div><dt>적용 기준</dt><dd>{result.required === null ? '미확정' : `${result.required}${unit}`}</dd><small>{requiredSource}</small></div>
        <div><dt>확정 취득</dt><dd>{known ? `${result.earned}${unit}` : '미입력'}</dd></div>
        <div><dt>남은 수치</dt><dd>{remaining === null ? '계산 대기' : `${remaining}${unit}`}</dd></div>
        <div><dt>계획 중</dt><dd>{result.rule.source === 'points' ? '해당 없음' : `${result.planned}학점`}</dd></div>
      </dl>
      {result.uncertainCredits && <p className="graduation-metric-warning"><Info size={14} />재수강·중복 과목 여부를 확인하기 전이라 학점이 달라질 수 있어요.</p>}
      {result.rule.source === 'points' ? <div className="graduation-metric-source">
        <b>포인트 출처</b><span>{!known ? '확인된 포인트 없음' : pointsSource === 'school' ? `종합정보 수집${sourceDate ? ` · ${sourceDate}` : ''}` : '내 정보에서 직접 입력'}</span>
      </div> : <>
        <div className="graduation-metric-source"><b>이수 근거</b><span>학교 수집 {schoolCount}과목 · 직접 입력 {manualCount}과목{sourceDate ? ` · ${sourceDate} 기준` : ''}</span></div>
        {courses.length > 0 && <ul className="graduation-metric-courses">{courses.slice(0, 6).map(course => <li key={`${course.src}:${course.code}:${course.name}`}><span><b>{course.name}</b><small>{course.category} · {course.src === 'info' ? '학교 수집' : '직접 입력'}{course.semester ? ` · ${course.semester}` : ''}</small></span><strong>{course.credits}학점</strong></li>)}</ul>}
        {courses.length > 6 && <p className="meta">외 {courses.length - 6}과목은 세부 현황에서 확인할 수 있어요.</p>}
        {plannedCourses.length > 0 && <p className="graduation-metric-planned">계획: {plannedCourses.map(course => course.name).join(', ')}</p>}
        {!known && <p className="graduation-metric-empty">학교 이수 내역을 연결하거나 직접 입력하면 근거 과목이 표시됩니다.</p>}
      </>}
      <button className="link graduation-metric-route" onClick={() => go(route)}>세부 현황에서 확인 <ArrowRight size={14} /></button>
    </div>
  </details>;
}

export function GraduationWorkspace(props: Props) {
  const { data, go, planned, catalog, persist, detail, infoPending, infoFailed } = props;
  const [mode, setMode] = useState('fusion1');
  const admission = data.admissionType ?? 'unknown';
  const [pace, setPace] = useState('18');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('recent');
  const [manual, setManual] = useState({ name: '', category: '전선', credits: '3' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function setAdmission(next: AdmissionType) {
    if (busy) return;
    setBusy(true); setError('');
    const saved = await persist({ ...data, admissionType: next }, '입학 구분을 저장했습니다.');
    setBusy(false);
    if (!saved) setError('입학 구분을 저장하지 못했습니다. 다시 선택해 주세요.');
  }
  const { snap: rules } = useDeptRules();
  const completed = useMemo(() => mergeCompleted(data.completed, data.info?.completed), [data.completed, data.info]);
  const year = data.info?.admitYear ?? (data.year.trim() ? Number(data.year) : undefined);
  const pool = catalog ? deptPoolOf(data.dept, [...new Set(catalog.sections.map(s => s.dept))]) : null;
  const myRules = rules?.items.filter(r => rulesetMatchesDept(r, data.dept, pool))
    .sort((a, b) => Number(!!b.yearTable) - Number(!!a.yearTable) || b.lines.length - a.lines.length)[0];
  const targets = myRules && year ? deptRuleTargets(myRules, year) : null;
  const enteredPoints = data.points.trim() ? Number(data.points) : undefined;
  const points = data.info?.points ?? (Number.isFinite(enteredPoints) ? enteredPoints : undefined);
  const earned = resolveEarnedCredits(completed, data.info?.credits, data.credits);
  const results = evaluate(completed, planned, data.ruleOverrides, {
    admitYear: year, admissionType: admission, points, deptTargets: targets ?? undefined,
  }).map(r => r.rule.id !== 'total' || earned === null ? r : {
    ...r, earned,
    status: r.required === null || r.uncertainCredits ? 'unknown' as const : earned >= r.required ? 'met' as const : 'progress' as const,
  });
  const total = results[0];
  const pointResult = results.find(r => r.rule.id === 'points')!;
  const general = results.find(r => r.rule.id === 'gen')!;
  const major = results.find(r => r.rule.id === 'major')!;
  const view = VIEWS.some(([id]) => id === (detail ?? '')) ? detail ?? '' : 'legacy';
  const selectedMode = MODES.find(m => m.id === mode)!;
  const modeReference = reference.sections.common.find(r => r.area === selectedMode.area);
  const ruleLink = graduationRuleLink({ department: data.dept, pool, rule: myRules ?? null,
    guide: verifiedDeptGuide(data.dept, year), admissionType: admission });
  const known = (r: RuleResult) => r.rule.id === 'total' ? earned !== null : r.rule.source === 'points' ? points !== undefined : completed.length > 0;
  const value = (r: RuleResult) => !known(r) ? '미입력' : `${r.earned}${r.required === null ? (r.rule.source === 'points' ? 'P' : '학점') : ` / ${r.required}${r.rule.unit ?? '학점'}`}`;
  const paceValid = Number.isInteger(Number(pace)) && Number(pace) >= 1 && Number(pace) <= 25;
  const outlook = graduationOutlook({ earned: earned ?? 0, required: total.required, planned: total.planned,
    perSemester: Number(pace) >= 1 && Number(pace) <= 25 ? Number(pace) : undefined, semester: catalog?.semester, admitYear: year });
  const enrolled = data.lms && catalog ? matchEnrollment(data.lms, catalog, data.lmsMatch).filter(m => !m.ignored) : [];
  const unmatched = enrolled.filter(m => !m.sections.length).length;
  const checks = new Set(data.reqChecks ?? []);
  const sourceDate = data.info?.fetchedAt.slice(0, 10);
  const gradesUnverified = data.info?.diag?.pages.some(p => p.slot === 'grades' && !p.ok) ?? false;
  const suggestions = query.trim().length < 2 ? [] : (catalog?.sections ?? []).filter(s =>
    !completed.some(c => c.code === s.code || c.name.replace(/\s/g, '') === s.name.replace(/\s/g, '')) &&
    (s.name + s.code).toLowerCase().includes(query.toLowerCase())).filter((s, i, all) => all.findIndex(c => c.code === s.code) === i).slice(0, 5);
  const visible = completed.filter(c => (source === 'all' || c.src === source) &&
    (category === 'all' || (category === 'gen' ? gradGroup(c.category) === '교양' : gradGroup(c.category).startsWith('전공'))))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ko') : (b.semester ?? '').localeCompare(a.semester ?? ''));
  const coursesFor = (result: RuleResult) => completed.filter(course => result.rule.groups.includes(gradGroup(course.category)));
  const plannedFor = (result: RuleResult) => planned.filter(course => result.rule.groups.includes(gradGroup(course.category)));

  async function saveCourse(course: { code: string; name: string; category: string; credits: number }) {
    if (busy) return;
    if (completed.some(c => c.code === course.code || c.name.replace(/\s/g, '') === course.name.replace(/\s/g, ''))) {
      setError('이미 이수 목록에 있는 과목입니다.'); return;
    }
    setBusy(true); setError('');
    const saved = await persist({ ...data, completed: [...data.completed, course] }, '이수 과목을 저장했습니다.');
    setBusy(false);
    if (saved) { setQuery(''); setManual({ name: '', category: '전선', credits: '3' }); }
    else setError('저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.');
  }
  async function addManual() {
    const name = manual.name.trim();
    const credits = Number(manual.credits);
    if (!name || !manual.credits.trim() || !Number.isInteger(credits) || credits < 0 || credits > 20) {
      setError('과목명과 0~20 사이의 학점을 입력해 주세요.'); return;
    }
    const hit = catalog?.sections.find(s => s.name === name);
    await saveCourse(hit ? { code: hit.code, name: hit.name, category: hit.category, credits: hit.credits } :
      { code: `수기-${name}`, name, category: manual.category, credits });
  }
  async function removeCourse(code: string, name: string) {
    if (busy) return;
    const index = data.completed.findIndex(c => c.code === code && c.name === name);
    if (index < 0) return;
    setBusy(true);
    const saved = await persist({ ...data, completed: data.completed.filter((_, i) => i !== index) }, '이수 과목에서 제외했습니다.');
    setBusy(false);
    if (!saved) setError('삭제하지 못했습니다. 다시 시도해 주세요.');
  }
  async function toggleCheck(label: string) {
    if (busy) return;
    const next = new Set(data.reqChecks ?? []);
    if (next.has(label)) next.delete(label); else next.add(label);
    setBusy(true);
    const saved = await persist({ ...data, reqChecks: [...next] }, '확인 상태를 저장했습니다.');
    setBusy(false);
    if (!saved) setError('확인 상태를 저장하지 못했습니다.');
  }
  function addCatalog(course: CourseSection) {
    void saveCourse({ code: course.code, name: course.name, category: course.category, credits: course.credits });
  }

  if (view === 'legacy') return <Graduation {...props} admission={admission} onAdmissionChange={setAdmission} />;
  return <div className="graduation-workspace">
    <fieldset className="graduation-tabs" aria-label="졸업 정보 화면">
      {VIEWS.map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => go(id ? `graduation/${id}` : 'graduation')}>{label}</button>)}
    </fieldset>
    {view === 'department' ? <Graduation {...props} detail={undefined} admission={admission} onAdmissionChange={setAdmission} /> : <>
      {view !== 'completed' && <div className="graduation-context">
        <span className="badge">{year ? `${year}학번 기준 확인` : '입학연도 확인 필요'}</span>
        {sourceDate ? <span className={`badge ${gradesUnverified ? 'orange' : 'green'}`}>종합정보 {sourceDate} {gradesUnverified ? '확인 필요' : '수집'}</span> : <span className="badge">{infoPending ? '학교 정보 수집 중' : '직접 입력 기반'}</span>}
        <label>입학 구분 <select value={admission} disabled={busy} onChange={e => void setAdmission(e.target.value as AdmissionType)} aria-label="졸업 계산 입학 구분">
          <option value="unknown">선택해 주세요</option><option value="freshman">신입학</option>
          <option value="general-transfer">일반편입</option><option value="bachelor-transfer">학사편입</option>
        </select></label>
      </div>}
      {gradesUnverified && <p className="meta conn-warn">최근 성적 확인이 완료되지 않아 이전 이수 내역이 표시될 수 있습니다. 학교 종합정보에서 확인해 주세요.</p>}
      {(view === '' || view === 'requirements') && <>
        <fieldset className="graduation-mode-tabs" aria-label="졸업 전공 유형">
          {MODES.map(m => <button key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>)}
        </fieldset>
        <section className={`card graduation-mode-guide ${view === '' ? 'expanded' : ''}`} aria-label="전공 유형 안내">
          {view === '' ? MODES.map(m => <div key={m.id}><Layers size={21} /><div><b>{m.label}</b><small>{reference.sections.common.find(r => r.area === m.area)?.requirement}</small></div></div>) :
            <div><Layers size={21} /><b>{selectedMode.label}</b><span>{modeReference?.requirement}</span></div>}
        </section>
      </>}
      {view === '' && <>
        <section className="card graduation-summary-hero">
          <div className="graduation-summary-hero-grid">
            <GraduationMetricDetails className="graduation-summary-metric" icon={<GraduationCap size={19} />} title="총 이수학점"
              result={total} known={known(total)} value={value(total)} courses={coursesFor(total)} plannedCourses={plannedFor(total)}
              sourceDate={sourceDate} route="graduation/completed" go={go} />
            <div className="graduation-summary-divider" aria-hidden="true" />
            <GraduationMetricDetails className="graduation-summary-metric" icon={<Database size={18} />} title="비교과 포인트"
              result={pointResult} known={known(pointResult)} value={value(pointResult)} courses={[]} plannedCourses={[]}
              sourceDate={sourceDate} pointsSource={data.info?.points !== undefined ? 'school' : 'manual'} route="profile" go={go} />
          </div>
        </section>
        <div className="graduation-area-grid">
          <GraduationMetricDetails className="card graduation-area-card" icon={<BookOpen size={19} />} title="교양"
            result={general} known={known(general)} value={value(general)} courses={coursesFor(general)} plannedCourses={plannedFor(general)}
            sourceDate={sourceDate} route="graduation/gen" go={go} />
          <GraduationMetricDetails className="card graduation-area-card" icon={<Layers size={19} />} title="전공"
            result={major} known={known(major)} value={value(major)} courses={coursesFor(major)} plannedCourses={plannedFor(major)}
            sourceDate={sourceDate} route="graduation/major" go={go} />
        </div>
        <section className="graduation-major-requirements">
          <div className="graduation-section-heading"><h2>전공별 졸업요건</h2><button className="secondary" onClick={() => go('graduation/requirements')}>전체 요건 확인 <ArrowRight size={15} /></button></div>
          <div className="graduation-requirement-grid">
            {results.map(r => <section className="card graduation-requirement-card" key={r.rule.id}>
              <div className="graduation-section-heading"><h3><BookOpen size={20} /><button className="link title-link" onClick={() => go(`graduation/${r.rule.id}`)}>{r.rule.label}</button></h3><ResultBadge result={r} known={known(r)} /></div>
              <strong>{r.required === null && known(r) ? `계산 대기 · ${value(r)} ${r.rule.source === 'points' ? '적립함' : '이수함'}` : value(r)}</strong><Ratio result={r} known={known(r)} />
              <div className="graduation-requirement-foot"><span>필요 {r.rule.unit === 'P' ? '포인트' : '학점'}</span><button className="secondary" onClick={() => go(`graduation/${r.rule.id}`)}>{r.required ?? '미확정'} <ArrowRight size={12} /></button>{r.planned > 0 && <small>+{r.planned}학점 계획 중</small>}</div>
            </section>)}
          </div>
        </section>
        <div className="graduation-overview-bottom">
          <section className="card graduation-checklist"><div className="graduation-section-heading"><h3><ClipboardCheck size={19} />공통 졸업 체크리스트</h3><small>계산 결과와 확인 메모를 함께 확인하세요.</small></div>
            {[total, pointResult, general].map(r => <div className="graduation-check-row" key={r.rule.id}><label><input type="checkbox" checked={checks.has(r.rule.label)} disabled={busy} onChange={() => void toggleCheck(r.rule.label)} />{r.rule.label}</label><small>{value(r)}</small><ResultBadge result={r} known={known(r)} /></div>)}
            <div className="graduation-check-row"><label><input type="checkbox" checked={checks.has('교양 영역 세부 기준 확인')} disabled={busy} onChange={() => void toggleCheck('교양 영역 세부 기준 확인')} />교양 영역 세부 기준 확인</label><button className="link" onClick={() => go('graduation/requirements')}>세부 현황 확인 <ArrowRight size={14} /></button></div>
            <p className="meta">체크는 본인 확인 메모이며 계산 결과를 바꾸지 않습니다.</p>
          </section>
          <section className="card graduation-department-card"><h3><Layers size={21} />개인 전공/트랙 요건</h3><p>학과(전공) 또는 트랙별 졸업 요건은 별도 섹션에서 자세히 확인할 수 있습니다.</p><button className="secondary" onClick={() => go('graduation/department')}>전공/트랙 요건 자세히 보기 <ArrowRight size={16} /></button><a className="link" href={ruleLink.url} target="_blank" rel="noreferrer">{ruleLink.departmentSpecific ? '학과 공식 졸업 요건' : '학교 공식 졸업 안내'} <ArrowUpRight size={14} /></a></section>
        </div>
      </>}
      {view === 'outlook' && <>
        <p className="graduation-view-description">남은 교과 학점과 계획 과목을 바탕으로 졸업 시점을 예측하고, 필요한 점검 항목을 확인할 수 있습니다.</p>
        <div className="graduation-outlook-grid"><section className="card graduation-outlook-card"><h3><Layers size={21} />졸업 예상</h3>
          <h2>{outlook.ok && earned !== null && paceValid ? <>남은 교과 학점 <em>{outlook.remaining}학점</em></> : '이수 내역과 졸업 기준을 확인해 주세요.'}</h2>
          <p>{outlook.ok && earned !== null && paceValid ? `학기당 ${outlook.perSemester}학점 기준 약 ${outlook.semestersLeft}학기 더 필요${outlook.estLabel ? ` · ${outlook.estLabel}학기 이수 완료 전망` : ''}` : '입학 구분을 선택하고 필요한 학점 기준을 확인하면 전망을 볼 수 있습니다.'}</p>
          <label>학기당 목표 학점 <input className="field" type="number" min={1} max={25} step={1} value={pace} aria-label="학기당 목표 이수 학점" onChange={e => setPace(e.target.value)} /></label>
          {(!Number.isInteger(Number(pace)) || Number(pace) < 1 || Number(pace) > 25) && <p className="form-error">1~25 사이의 정수를 입력해 주세요.</p>}
          <p className="meta"><Info size={14} />계획 과목 전부 이수·학기당 균등 이수 가정에 따른 예상치이며, 학교의 공식 졸업 사정이 아닙니다.</p>
        </section><section className="card graduation-checkpoints"><h3><ClipboardCheck size={20} />졸업까지 남은 체크 포인트</h3>
          {[['비교과 포인트 확인', points === undefined ? '누적 비교과 포인트를 입력해 주세요.' : `${points}P 적립 · 인정 기준과 부족 포인트를 확인하세요.`, 'profile'], ['교양 영역 확인', '선택필수교양과 이수 영역을 확인합니다.', 'graduation/requirements'], ['전공/트랙 기준 확인', '본인 전공의 졸업 요건과 개인 적용 조건을 확인해 주세요.', 'graduation/department']].map(([title, note, route]) => <button key={title} onClick={() => go(route)}><span className="graduation-round-icon"><BookOpen size={20} /></span><span><b>{title}</b><small>{note}</small></span><ArrowRight size={15} /></button>)}
        </section></div>
        <section className="card graduation-enrolled"><div className="graduation-section-heading"><h3><GraduationCap size={22} />현재 수강 중 {data.lms && <span className="badge">COSMOS {data.lms.fetchedAt.slice(0, 10)} 수집</span>}</h3><button className="secondary" onClick={() => go('lms')}>{unmatched ? `${enrolled.length}과목 중 ${unmatched}과목 매칭 필요` : '수업 현황 확인'} <ArrowUpRight size={14} /></button></div>
          <p className="meta">수강 중인 과목은 이수 완료에 포함되지 않습니다. 계획에 담은 과목은 전망 계산에만 반영합니다.</p>
          {enrolled.map((m, i) => <button className="graduation-enrolled-row" key={m.course.id} onClick={() => go('lms')}><span className="graduation-row-index">{i + 1}</span><b>{m.course.title}</b><span className={`badge ${m.sections.length ? 'green' : ''}`}>{m.sections.length ? `매칭: ${m.sections[0].name}` : '카탈로그 매칭 없음'}</span><ArrowRight size={14} /></button>)}
          {!enrolled.length && <div className="empty-small">확인된 수강 과목이 없습니다. 수업 현황에서 학교 연결 상태를 확인해 주세요.</div>}
        </section>
      </>}
      {view === 'requirements' && <>
        <div className="graduation-requirement-grid">{results.map(r => <section className="card graduation-requirement-card" key={r.rule.id}>
          <div className="graduation-section-heading"><h3><BookOpen size={20} /><button className="link title-link" onClick={() => go(`graduation/${r.rule.id}`)}>{r.rule.label}</button></h3><ResultBadge result={r} known={known(r)} /></div>
          <strong>{r.required === null && known(r) ? `계산 대기 · ${value(r)} ${r.rule.source === 'points' ? '적립함' : '이수함'}` : value(r)}</strong><Ratio result={r} known={known(r)} />
          <div className="graduation-requirement-foot"><span>필요 {r.rule.unit === 'P' ? '포인트' : '학점'}</span><button className="secondary" onClick={() => go(`graduation/${r.rule.id}`)}>{r.required ?? '미확정'} <ArrowRight size={12} /></button>{r.planned > 0 && <small>+{r.planned}학점 계획 중</small>}</div>
        </section>)}</div>
        <section className="card graduation-general-guide"><h3><Info size={20} />교양 세부 요건</h3><p>교양 이수 기준과 세부 학점을 확인하세요.</p><button className="secondary" onClick={() => go('graduation/gen')}>교양 요건 자세히 보기 <ArrowRight size={15} /></button><a className="link" href={ruleLink.url} target="_blank" rel="noreferrer">학교 원문 확인 <ArrowUpRight size={14} /></a></section>
      </>}
      {view === 'completed' && <>
        <p className="graduation-view-description">수집된 학교 기록과 직접 입력한 과목을 함께 사용하여 졸업 요건 계산에 반영합니다.</p>
        <section className="card graduation-course-form"><label className="cat-search"><Search size={17} /><input value={query} aria-label="이수한 과목 검색" placeholder="과목명·코드로 검색해 이수 과목 추가" onChange={e => setQuery(e.target.value)} /></label>
          {suggestions.length > 0 && <div className="graduation-course-suggestions">{suggestions.map(s => <button key={s.id} onClick={() => addCatalog(s)} disabled={busy}><span><b>{s.name}</b><small>{s.code} · {s.category} · {s.credits}학점</small></span><Plus size={17} /></button>)}</div>}
          <form className="manual-add" onSubmit={e => { e.preventDefault(); void addManual(); }}><input aria-label="과목명 직접 입력" placeholder="과목명 (카탈로그에 없는 과목)" value={manual.name} disabled={busy} onChange={e => setManual({ ...manual, name: e.target.value })} /><select aria-label="이수구분" value={manual.category} disabled={busy} onChange={e => setManual({ ...manual, category: e.target.value })}>{['전필', '전선', '전기', '교필', '선필교', '일교', '일선'].map(c => <option key={c}>{c}</option>)}</select><input aria-label="학점" type="number" min={0} max={20} step={1} value={manual.credits} disabled={busy} onChange={e => setManual({ ...manual, credits: e.target.value })} /><button className="secondary" disabled={busy || !manual.name.trim()}><Plus size={15} />추가</button></form>
        </section>
        <div className="graduation-course-filters"><fieldset aria-label="이수 과목 출처">{[['all', '전체'], ['info', '학교 수집'], ['manual', '직접 입력']].map(([id, label]) => <button key={id} aria-pressed={source === id} onClick={() => setSource(id)}>{label}</button>)}</fieldset><fieldset aria-label="이수 과목 영역">{[['all', '모든 영역'], ['gen', '교양'], ['major', '전공']].map(([id, label]) => <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</fieldset><select aria-label="이수 과목 정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="recent">최근 학기</option><option value="name">과목명순</option></select></div>
        <section className="card graduation-course-summary"><h3><GraduationCap size={23} />총 {earned === null ? '이수학점 미입력' : `${earned}학점 반영`}</h3><span>교양 <b>{general.earned}학점</b></span><span>전공 <b>{major.earned}학점</b></span>{sourceDate && <span><Clock3 size={15} />최근 동기화 <b>{sourceDate}</b></span>}</section>
        <section className="card graduation-course-list" aria-label="이수 과목 목록">{visible.map((c, i) => <div className="graduation-course-row" key={`${c.src}-${c.code}-${i}`}><span className="graduation-round-icon"><Check size={18} /></span><div><b>{c.name}</b><small>이수 구분 · {c.src === 'info' ? '학교 수집' : '직접 입력'} · {c.credits}학점 · {gradGroup(c.category)}{c.semester ? ` · ${c.semester}` : ''}</small></div><span className={`badge ${gradGroup(c.category) === '교양' ? 'blue' : 'green'}`}>{gradGroup(c.category)}</span><span className="graduation-source"><Database size={13} />{c.src === 'info' ? '학교 수집' : '직접 입력'}</span>{c.src === 'manual' && <button className="icon" aria-label={`${c.name} 이수 목록에서 제거`} disabled={busy} onClick={() => void removeCourse(c.code, c.name)}><X size={15} /></button>}</div>)}{!visible.length && <div className="empty-small">{infoPending ? '학교에서 이수 내역을 불러오는 중입니다…' : completed.length ? '선택한 조건에 맞는 이수 과목이 없습니다.' : '아직 입력한 이수 과목이 없어요.'}</div>}</section>
        {infoFailed && <p className="meta conn-warn">최근 학교 수집에 실패했습니다. 보관된 내역을 확인하거나 직접 입력할 수 있습니다.</p>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="graduation-footnote"><Info size={14} />표시한 현황과 전공 유형은 계획 참고용입니다. 학과별 기준과 개인 적용 조건은 <a href={ruleLink.url} target="_blank" rel="noreferrer">학교 원문</a>에서 확인해 주세요. · 자료 확인일 {reference.asOf}</p>
    </>}
  </div>;
}
