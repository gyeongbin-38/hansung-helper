'use client';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  BookOpen,
  Download,
  GripVertical,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  conflicts,
  courseMatch,
  DAY_SHORT,
  daySummaries,
  fmtMin,
  deliveryLabel,
  roomLabel,
  slotLabel,
  slotsLabel,
  sourceDurationLabel,
  yearLabel,
  type Catalog,
  type CourseSection,
} from '@/lib/data/catalog';
import {
  catGroup,
  deptMatches,
  deptPoolOf,
  planBlockReason,
} from './catalog';
import { recommend } from '@/lib/data/timetable-recommendations';
import { matchEnrollment } from '@/lib/data/lms';
import { filterRecommendationCandidates } from '@/lib/data/recommendation';
import { RetryButton, SkeletonRows } from './skeleton';
import type { Data } from './data';

const GRID_START = 540; // 09:00
const GRID_END = 1350; // 22:30
const PPM = 0.9; // px per minute
const HOURS = [
  ...Array.from(
    { length: Math.floor((GRID_END - GRID_START) / 60) + 1 },
    (_, i) => GRID_START + i * 60,
  ),
  GRID_END,
];
const CAT_FILTERS = ['전체', '전필', '전선', '교양·일반', '기타'];
const EXPORT_COLORS: [string, string][] = [
  ['#e6e0f5', '#391c57'],
  ['#dcecfa', '#005bab'],
  ['#d9f3e1', '#1a6b68'],
  ['#ffe8d4', '#793400'],
  ['#fde0ec', '#a02e6d'],
];

function catMatch(s: CourseSection, f: string) {
  if (f === '전체') return true;
  if (f === '기타') return !['전필', '전선', '교양·일반'].includes(catGroup(s));
  return catGroup(s) === f;
}

function DragCard({ s }: { s: CourseSection }) {
  return (
    <div className="drag-card">
      <b>{s.name}</b>
      <small>
        {s.section}분반 · {slotsLabel(s)}
      </small>
    </div>
  );
}

function DropArea({ id, className, children, describedBy }: {
  id: string;
  className: string;
  children: ReactNode;
  describedBy?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className + (isOver ? ' drop-over' : '')} aria-describedby={describedBy}>
      {children}
    </div>
  );
}

function CatRow({
  s,
  added,
  busy,
  onAdd,
}: {
  s: CourseSection;
  added: boolean;
  busy: boolean;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'cat:' + s.id,
    data: { section: s },
    disabled: added || busy,
  });
  return (
    <div
      ref={setNodeRef}
      data-section-id={s.id}
      className={
        'cat-row' +
        (!added ? ' can-drag' : '') +
        (isDragging ? ' dragging' : '')
      }
      {...(!added && !busy ? listeners : {})}
    >
      <button
        type="button"
        className="cat-grip"
        aria-label={s.name + ' 끌어서 시간표에 추가'}
        disabled={added || busy}
        {...attributes}
      >
        <GripVertical size={15} />
      </button>
      <div className="cat-main">
        <b>{s.name}</b>
        <small>
          {s.section}분반 · {s.credits}학점 · {s.professor || '교수 미정'}
        </small>
        <small>{slotsLabel(s)}</small>
      </div>
      <div className="cat-side">
        <span className="badge">{s.dept}</span>
        {s.cross && <span className="badge blue">교차가능</span>}
        {s.timeFixed && <span className="badge pink">시간 확인 필요</span>}
        <button
          className="icon"
          aria-label={s.name + (added ? ' 계획에서 제거' : ' 계획에 담기')}
          aria-pressed={added}
          disabled={busy}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={onAdd}
        >
          {added ? <X size={16} /> : <Plus size={16} />}
        </button>
      </div>
    </div>
  );
}

/** COSMOS 수강 과목 ↔ 카탈로그 매칭 스트립 — 시간표 반영 여부를 보여준다.
 *  수업 현황의 수동 매칭 보정(overrides)도 같은 결과에 반영된다. */
function EnrolledStrip({
  lms,
  catalog,
  planned,
  overrides,
  onFilter,
  onAdd,
  busy,
}: {
  lms: NonNullable<Data['lms']>;
  catalog: Catalog;
  planned: CourseSection[];
  /** 수동 매칭 보정 — course.id → section.id 또는 'ignore' */
  overrides?: Record<string, string>;
  onFilter: (title: string) => void;
  /** 분반을 계획에 담기 — 충돌·중복·이수 검사는 호출처가 처리, 성공 여부 반환 */
  onAdd: (s: CourseSection) => Promise<boolean>;
  busy: boolean;
}) {
  const matches = useMemo(
    () => matchEnrollment(lms, catalog, overrides),
    [lms, catalog, overrides],
  );
  const [picking, setPicking] = useState<string | null>(null);
  if (!matches.length) return null;
  const plannedIds = new Set(planned.map((p) => p.id));
  const covered = matches.filter((m) =>
    m.sections.some((s) => plannedIds.has(s.id)),
  ).length;
  return (
    <details className="enrolled">
      <summary>
        COSMOS 수강 {matches.length}과목 · 계획에 담긴 수강 과목 {covered}개
      </summary>
      <div className="enrolled-rows">
        {matches.map(({ course, sections, manual, ignored }) => {
          const inPlan = sections.filter((s) => plannedIds.has(s.id));
          return (
            <div className="enrolled-item" key={course.id}>
              <div className="enrolled-row">
                <div>
                  <b>{course.title}</b>
                  <small>
                    {course.prof || '교수 미기재'}
                    {course.community ? ' · 커뮤니티' : ''}
                    {manual ? ' · 직접 연결' : ''}
                  </small>
                </div>
                {ignored ? (
                  <span className="badge">매칭 제외</span>
                ) : sections.length === 0 ? (
                  <span className="meta">카탈로그에 없는 과목</span>
                ) : inPlan.length ? (
                  <span className="badge green">계획에 있음</span>
                ) : (
                  <span className="enrolled-actions">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (sections.length === 1) void onAdd(sections[0]);
                        else
                          setPicking(
                            picking === course.id ? null : course.id,
                          );
                      }}
                    >
                      <Plus size={13} /> 담기
                    </button>
                    {sections.length > 1 && (
                      <button
                        className="link"
                        onClick={() => onFilter(sections[0].name)}
                      >
                        분반 {sections.length}개 보기
                      </button>
                    )}
                  </span>
                )}
              </div>
              {picking === course.id && sections.length > 1 && (
                <div className="enrolled-pick">
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      className="enrolled-pick-row"
                      disabled={busy}
                      onClick={async () => {
                        if (await onAdd(s)) setPicking(null);
                      }}
                    >
                      <b>{s.section}분반</b>
                      <small>
                        {s.professor || '교수 미정'} · {slotsLabel(s)}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="meta">
        수강 상태는 COSMOS 수집 시점 기준이며 최종 수강 여부는 학교 시스템에서
        확인하세요.
      </p>
    </details>
  );
}

/** 저장된 시간표 안의 지표 — 과목 수·학점·충돌·공강일을 비교용으로 계산.
 *  카탈로그 재생성으로 사라진 분반은 missing으로 별도 집계한다. */
function scenarioStats(ids: string[], catalog: Catalog | null) {
  const secs = (catalog?.sections ?? []).filter((s) => ids.includes(s.id));
  const credits = secs.reduce((n, s) => n + s.credits, 0);
  const conflicts_ = secs.filter((s) => conflicts(s, secs).length).length;
  const sums = daySummaries(secs);
  const freeDays = secs.some((s) => s.slots.length)
    ? [0, 1, 2, 3, 4].filter((d) => sums[d].count === 0).length
    : 0;
  return { secs, credits, conflicts: conflicts_, freeDays, missing: ids.length - secs.length };
}

export function Timetable({
  catalog,
  failed,
  retry,
  planned,
  data,
  plan,
  swap,
  notify,
  onSaveScenario,
  onLoadScenario,
  onDeleteScenario,
  onOpenSurvey,
}: {
  catalog: Catalog | null;
  failed?: boolean;
  retry?: () => void;
  planned: CourseSection[];
  data: Data;
  plan: (id: string) => Promise<boolean>;
  swap: (fromId: string, toId: string) => void;
  notify: (msg: string) => void;
  /** 시나리오 슬롯 저장·불러오기·삭제 — 키는 'A'|'B'|'C' */
  onSaveScenario: (key: string) => void;
  onLoadScenario: (key: string) => void;
  onDeleteScenario: (key: string) => void;
  onOpenSurvey: () => void;
}) {
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const comparisonRef = useRef<HTMLDetailsElement>(null);
  const [dept, setDept] = useState('');
  const [cat, setCat] = useState('전체');
  const [day, setDay] = useState('');
  const [band, setBand] = useState('전체');
  const [selected, setSelected] = useState<CourseSection | null>(null);
  const [dragging, setDragging] = useState<CourseSection | null>(null);
  const [dragPlan, setDragPlan] = useState(false);
  const [dragStatus, setDragStatus] = useState('');
  const [avoidedDays, setAvoidedDays] = useState<number[]>([]);
  const [maxCreditsInput, setMaxCreditsInput] = useState('');
  const [lastRemoved, setLastRemoved] = useState<CourseSection | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = useRef(false);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const dayColumns = useRef<(HTMLDivElement | null)[]>([]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
  );

  const depts = useMemo(
    () =>
      catalog
        ? [...new Set(catalog.sections.map((s) => s.dept))].sort()
        : [],
    [catalog],
  );
  const myDept = data.dept && data.dept !== '소속 미입력' ? data.dept : '';
  const deptPool = myDept ? deptPoolOf(myDept, depts) : null;
  const filtered = useMemo(() => {
    if (!catalog) return [];
    return catalog.sections.filter((s) => {
      const deptOk = !dept
        ? !myDept || !deptPool || deptPool.some((d) => deptMatches(s.dept, d))
        : dept === '전체'
          ? true
          : s.dept === dept;
      if (!deptOk || !catMatch(s, cat) || !courseMatch(s, q)) return false;
      if (day === '' && band === '전체') return true;
      if (!s.slots.length) return false;
      const dayOk = day === '' || s.slots.some((sl) => sl.d === +day);
      const bandOk =
        band === '전체' ||
        s.slots.some((sl) =>
          band === '오전'
            ? sl.s < 720
            : band === '오후'
              ? sl.s >= 720 && sl.s < 1080
              : sl.s >= 1080,
        );
      return dayOk && bandOk;
    });
  }, [catalog, dept, cat, q, day, band, myDept, deptPool]);
  const maxCreditsNumber = Number(maxCreditsInput);
  const maxCreditsValid =
    maxCreditsInput === '' ||
    (Number.isInteger(maxCreditsNumber) &&
      maxCreditsNumber >= 1 &&
      maxCreditsNumber <= 30);
  const maxCredits =
    maxCreditsInput !== '' && maxCreditsValid ? maxCreditsNumber : undefined;
  const recs = useMemo(() => {
    if (!catalog) return [];
    const ranked = recommend(
      catalog.sections,
      data,
      planned,
      catalog.sections.length,
      { selectedDay: day, sourceSemester: catalog.semester },
    );
    return filterRecommendationCandidates(ranked, planned, {
      avoidedDays,
      maxCredits,
    }).slice(0, 6);
  }, [catalog, data, planned, day, avoidedDays, maxCredits]);
  const untimedPlanned = planned.filter((s) => s.untimed);
  const credits = planned.reduce((n, s) => n + s.credits, 0);
  const curConflicts = planned.filter(
    (s) => conflicts(s, planned).length,
  ).length;
  const sums = daySummaries(planned);
  const hasTimed = planned.some((s) => s.slots.length > 0);
  const freeDays = hasTimed
    ? [0, 1, 2, 3, 4].filter((d) => sums[d].count === 0)
    : [];
  const alternatives = selected
    ? (catalog?.sections.filter(
        (x) => x.code === selected.code && x.id !== selected.id,
      ) ?? [])
    : [];
  const preview = dragging && !dragPlan ? dragging : null;
  const previewBlocked = preview ? planBlockReason(preview, data, planned) : null;

  async function changePlan(id: string): Promise<boolean> {
    if (editing.current) return false;
    editing.current = true;
    setBusy(true);
    try {
      return await plan(id);
    } catch {
      notify('계획을 저장하지 못했습니다. 다시 시도해 주세요.');
      return false;
    } finally {
      editing.current = false;
      setBusy(false);
    }
  }
  async function tryAdd(s: CourseSection): Promise<boolean> {
    if (planned.some((p) => p.id === s.id)) {
      setDragStatus(`${s.name}은 이미 시간표에 있습니다.`);
      return false;
    }
    const blocked = planBlockReason(s, data, planned);
    if (blocked) {
      setDragStatus(blocked);
      notify(blocked);
      return false;
    }
    if (!await changePlan(s.id)) return false;
    setSelected(null);
    setDragStatus(`${s.name}을 공식 개설 요일과 시간에 추가했습니다.`);
    return true;
  }
  async function removeCourse(s: CourseSection) {
    if (!planned.some((p) => p.id === s.id)) {
      setSelected(null);
      return;
    }
    if (!await changePlan(s.id)) return;
    setLastRemoved(s);
    setSelected((current) => current?.id === s.id ? null : current);
    setDragStatus(`${s.name}을 시간표에서 제거했습니다. 실행 취소로 다시 담을 수 있습니다.`);
  }
  async function undoRemoval() {
    if (lastRemoved && await tryAdd(lastRemoved)) setLastRemoved(null);
  }
  function scrollToDay(dayIndex: number) {
    const grid = gridScrollRef.current;
    const column = dayColumns.current[dayIndex];
    if (!grid || !column) return;
    const offset = column.getBoundingClientRect().left - grid.getBoundingClientRect().left;
    grid.scrollTo({ left: grid.scrollLeft + offset - 52, behavior: 'instant' });
  }
  function onDragStart(e: DragStartEvent) {
    const payload = e.active.data.current as
      | { section: CourseSection; planned?: boolean }
      | undefined;
    setDragging(payload?.section ?? null);
    setDragPlan(!!payload?.planned);
    setDragStatus(
      payload?.planned
        ? `${payload.section.name}을 시간표에서 제거하려면 아래 제거 영역에 놓으세요.`
        : payload
          ? planBlockReason(payload.section, data, planned) ??
            `${payload.section.name} · ${slotsLabel(payload.section)}. 시간표에 놓으면 계획에 추가됩니다.`
          : '',
    );
  }
  function resetDrag() {
    setDragging(null);
    setDragPlan(false);
  }
  function onDragEnd(e: DragEndEvent) {
    const payload = e.active.data.current as
      | { section: CourseSection; planned?: boolean }
      | undefined;
    resetDrag();
    if (!payload) return;
    if (e.over?.id === 'tt-grid' && !payload.planned) {
      void tryAdd(payload.section);
      return;
    }
    if (e.over?.id === 'tt-trash' && payload.planned) {
      void removeCourse(payload.section);
      return;
    }
    setDragStatus(
      payload.planned
        ? `${payload.section.name}을 그대로 두었습니다.`
        : `${payload.section.name}을 추가하지 않았습니다. 시간표 영역에 놓아 주세요.`,
    );
  }

  function exportPng() {
    const colW = 152;
    const timeW = 48;
    const headH = 34;
    const titleH = 58;
    const footH = 34;
    const days = 6;
    const gridH = (GRID_END - GRID_START) * PPM;
    const unH = untimedPlanned.length ? 20 + untimedPlanned.length * 18 : 0;
    const W = timeW + days * colW;
    const H = titleH + headH + gridH + unH + footH;
    const cv = document.createElement('canvas');
    cv.width = W * 2;
    cv.height = H * 2;
    const ctx = cv.getContext('2d');
    if (!ctx) {
      notify('이미지 저장을 지원하지 않는 브라우저입니다.');
      return;
    }
    ctx.scale(2, 2);
    const font = (w: number, px: number) =>
      `${w} ${px}px Pretendard, 'Malgun Gothic', sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0a1530';
    ctx.font = font(700, 17);
    ctx.fillText(`${catalog?.semester ?? ''} 시간표`, timeW, 30);
    ctx.fillStyle = '#6b6560';
    ctx.font = font(500, 12);
    ctx.fillText(`${credits}학점 · ${planned.length}과목`, timeW, 48);
    const gy = titleH + headH;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1a1a1a';
    ctx.font = font(600, 13);
    DAY_SHORT.slice(0, days).forEach((d, i) =>
      ctx.fillText(d, timeW + i * colW + colW / 2, titleH + 22),
    );
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#eae6df';
    ctx.fillStyle = '#9b948c';
    ctx.font = font(400, 10);
    for (const h of HOURS) {
      const y = gy + (h - GRID_START) * PPM;
      ctx.beginPath();
      ctx.moveTo(timeW, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.fillText(fmtMin(h), 8, y + 3);
    }
    for (let i = 0; i <= days; i++) {
      const x = timeW + i * colW;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x, gy + gridH);
      ctx.stroke();
    }
    planned.forEach((s, si) => {
      const [bg, fg] = EXPORT_COLORS[si % EXPORT_COLORS.length];
      for (const sl of s.slots) {
        if (sl.d >= days) continue;
        const x = timeW + sl.d * colW + 3;
        const y = gy + (sl.s - GRID_START) * PPM + 1;
        const h = (sl.e - sl.s) * PPM - 2;
        ctx.fillStyle = bg;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, colW - 6, h, 6);
        else ctx.rect(x, y, colW - 6, h);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 2, y, colW - 10, h);
        ctx.clip();
        ctx.fillStyle = fg;
        ctx.font = font(600, 11);
        ctx.fillText(`${s.name} (${s.section})`, x + 6, y + 14);
        ctx.font = font(400, 10);
        ctx.fillText(`${fmtMin(sl.s)}~${fmtMin(sl.e)}`, x + 6, y + 26);
        ctx.restore();
      }
    });
    if (untimedPlanned.length) {
      let y = gy + gridH + 16;
      ctx.font = font(500, 11);
      ctx.fillStyle = '#6b6560';
      ctx.fillText('온라인 · 시간 미정', timeW, y);
      for (const s of untimedPlanned) {
        y += 18;
        ctx.fillText(
          `· ${s.name} (${s.section}분반, ${s.credits}학점)`,
          timeW,
          y,
        );
      }
    }
    ctx.font = font(400, 11);
    ctx.fillStyle = '#9b948c';
    ctx.fillText(
      `학사 도우미 개인 계획. 공식 수강신청이 아닙니다. ${catalog?.source ?? ''}`,
      timeW,
      H - 10,
    );
    cv.toBlob((b) => {
      if (!b) {
        notify('이미지 저장에 실패했습니다.');
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `hansung-timetable-${catalog?.semester ?? 'plan'}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  }

  return (
    <section className="builder">
      <div className="between builder-head">
        <p className="meta">
          {catalog ? (
            `${catalog.semester} 공식 개설 시간표 ${catalog.sectionCount}개 분반 · ${catalog.source}`
          ) : failed ? (
            <>
              개설강의 데이터를 불러오지 못했습니다.{' '}
              {retry && <RetryButton onRetry={retry} />}
            </>
          ) : (
            '개설강의 데이터를 불러오는 중입니다.'
          )}{' '}
          · 개인 계획이며 공식 수강신청이 아닙니다.
        </p>
        <div className="builder-actions">
          <button className="secondary" onClick={() => {
            if (!comparisonRef.current) return;
            comparisonRef.current.open = true;
            comparisonRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
            comparisonRef.current.querySelector('summary')?.focus({ preventScroll: true });
          }}>A/B/C 비교</button>
          <button
            className="secondary"
            onClick={exportPng}
            disabled={!planned.length}
          >
            <Download size={15} /> 이미지 저장
          </button>
          <div className="builder-sum">
            <strong>{credits}</strong>
            <span>계획 학점 · {planned.length}개 과목</span>
          </div>
        </div>
      </div>
      {hasTimed && (
        <div className="gap-chips">
          {freeDays.length > 0 && (
            <span className="badge green">
              {freeDays.map((d) => DAY_SHORT[d]).join('·')} 공강
            </span>
          )}
          {[0, 1, 2, 3, 4, 5].flatMap((d) =>
            sums[d].gaps.map((g) => (
              <span className="badge" key={d + '-' + g.s}>
                {DAY_SHORT[d]} 공강 {fmtMin(g.s)}~{fmtMin(g.e)}
              </span>
            )),
          )}
          {untimedPlanned.length > 0 && (
            <span className="badge blue">
              온라인 {untimedPlanned.length}과목 · 시간 자유
            </span>
          )}
        </div>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          resetDrag();
          setDragStatus('드래그를 취소했습니다.');
        }}
      >
        <p className="meta builder-drag-help" id="timetable-drag-help">
          강의 카드를 시간표로 끌어 놓으면 학교에서 정한 요일과 시간에
          배치됩니다. 강의 시간은 드롭 위치에 따라 바뀌지 않습니다.
        </p>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {dragStatus}
        </p>
        {preview && <p className={'meta' + (previewBlocked ? ' form-error' : '')}>
          {previewBlocked ?? `${preview.name} · ${slotsLabel(preview)}${preview.untimed || !preview.slots.length ? ' · 계획에 추가되며 시간표 칸에는 표시되지 않습니다.' : ''}`}
        </p>}
        {lastRemoved && !planned.some((s) => s.id === lastRemoved.id) && (
          <output className="tt-undo">
            <span>{lastRemoved.name}을 계획에서 제거했습니다.</span>
            <button type="button" className="link" disabled={busy} onClick={() => void undoRemoval()}>실행 취소</button>
            <button type="button" className="icon" aria-label="삭제 안내 닫기" onClick={() => setLastRemoved(null)}><X size={14} /></button>
          </output>
        )}
        <div className="builder-cols" aria-busy={busy}>
          <div className="builder-list card">
            <div className="builder-filters">
              <label className="cat-search">
                <Search size={15} aria-hidden="true" />
                <input
                  ref={searchRef}
                  aria-label="과목 검색"
                  placeholder="과목명 · 교수 · 코드 검색"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <select
                aria-label="학과 필터"
                value={dept}
                onChange={(e) => setDept(e.target.value)}
              >
                <option value="">내 학과 위주</option>
                <option value="전체">전체 학과</option>
                {depts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <div className="tabs">
                {CAT_FILTERS.map((f) => (
                  <button
                    key={f}
                    className={cat === f ? 'active' : ''}
                    aria-pressed={cat === f}
                    onClick={() => setCat(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="builder-filters sub">
                <select
                  aria-label="요일 필터"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                >
                  <option value="">요일 전체</option>
                  {DAY_SHORT.slice(0, 6).map((d, i) => (
                    <option key={d} value={i}>
                      {d}요일
                    </option>
                  ))}
                </select>
                <select
                  aria-label="시간대 필터"
                  value={band}
                  onChange={(e) => setBand(e.target.value)}
                >
                  {['전체', '오전', '오후', '저녁'].map((b) => (
                    <option key={b} value={b}>
                      {b === '전체' ? '시간대 전체' : b}
                    </option>
                  ))}
                </select>
              </div>
              {!dept && myDept && !deptPool && (
                <p className="meta">
                  {`학과 매칭 확인 필요 · '${myDept}'을(를) 카탈로그 학과에서 찾지 못했습니다. 전체 학과를 표시합니다.`}
                </p>
              )}
              {!dept && myDept && deptPool && deptPool.length > 1 && (
                <p className="meta">
                  {`학과 매칭 확인 필요 · '${myDept}' 후보: ${deptPool.join(' · ')}`}
                </p>
              )}
            </div>
            <div className="cat-rows scrollable">
              {!catalog && !failed && <SkeletonRows n={8} />}
              {!catalog && failed && (
                <div className="empty-small">
                  불러오기에 실패했습니다.{' '}
                  {retry && <RetryButton onRetry={retry} />}
                </div>
              )}
              {catalog &&
                filtered.slice(0, 80).map((s) => (
                  <CatRow
                    key={s.id}
                    s={s}
                    busy={busy}
                    added={planned.some((p) => p.id === s.id)}
                    onAdd={() =>
                      planned.some((p) => p.id === s.id)
                        ? removeCourse(s)
                        : tryAdd(s)
                    }
                  />
                ))}
              {catalog && filtered.length > 80 && (
                <p className="meta">
                  상위 80개만 표시 · {filtered.length}개 결과를 검색으로 좁혀
                  주세요.
                </p>
              )}
              {catalog && !filtered.length && (
                <div className="empty-small">
                  <p>조건에 맞는 과목이 없습니다.</p>
                </div>
              )}
            </div>
          </div>

          <div className="builder-grid card scrollable" ref={gridScrollRef}>
            <p className="meta timetable-scroll-hint">
              시간표를 좌우로 밀어 요일을 확인하세요.
            </p>
            <nav className="tt-day-nav" aria-label="시간표 요일로 이동">
              {DAY_SHORT.slice(0, 6).map((dayName, index) => (
                <button type="button" key={dayName} onClick={() => scrollToDay(index)} aria-label={`${dayName}요일 시간표로 이동`}>{dayName}</button>
              ))}
            </nav>
            <div className="tt-head">
              <span>시간</span>
              {DAY_SHORT.slice(0, 6).map((d) => (
                <b key={d}>{d}</b>
              ))}
            </div>
            <DropArea
              id="tt-grid"
              className={'tt-body' + (dragging && !dragPlan ? ' drop-ready' : '')}
              describedBy="timetable-drag-help"
            >
              <div className="tt-hours" aria-hidden="true">
                {HOURS.map((h) => (
                  <small key={h} style={{ top: (h - GRID_START) * PPM }}>
                    {fmtMin(h)}
                  </small>
                ))}
              </div>
              {DAY_SHORT.slice(0, 6).map((_, d) => (
                <div className="tt-col" key={d} ref={(node) => { dayColumns.current[d] = node; }}>
                  {planned
                    .filter((s) => !s.untimed && s.slots.some((x) => x.d === d))
                    .map((s) => {
                      const slots = s.slots.filter((x) => x.d === d);
                      return slots.map((sl) => (
                        <BlockCell
                          key={s.id + '-' + sl.s}
                          s={s}
                          sl={sl}
                          color={planned.indexOf(s) % 5}
                          onSelect={setSelected}
                          selected={selected?.id === s.id}
                          disabled={busy}
                          onRemove={() => void removeCourse(s)}
                        />
                      ));
                    })}
                  {preview?.slots.filter((sl) => sl.d === d).map((sl) => (
                    <div
                      key={'preview-' + preview.id + '-' + sl.s}
                      className={'tt-preview' + (previewBlocked ? ' blocked' : '')}
                      style={{ top: (sl.s - GRID_START) * PPM, height: Math.max((sl.e - sl.s) * PPM, 24) }}
                      aria-hidden="true"
                    >
                      <b>{preview.name}</b>
                      <small>{previewBlocked ? '추가 불가' : '추가 미리보기'}</small>
                    </div>
                  ))}
                </div>
              ))}
              {!preview && planned.every((s) => s.untimed || !s.slots.length) && (
                <div className="tt-empty">
                  <BookOpen size={28} aria-hidden="true" />
                  <p>
                    과목 목록에서 끌어다 놓거나
                    <br />+ 버튼으로 담아 보세요.
                  </p>
                </div>
              )}
            </DropArea>
            <DropArea id="tt-trash" className={'tt-trash' + (dragPlan ? ' visible' : '')}>
              <Trash2 size={15} aria-hidden="true" /> 여기에 놓으면 제거
            </DropArea>
          </div>

          <div className="builder-recs card pad">
            {selected ? (
              <div className="block-pop">
                <div className="between">
                  <span className="badge purple">{selected.category}</span>
                  <button
                    className="icon"
                    aria-label="상세 닫기"
                    onClick={() => setSelected(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <h3>{selected.name}</h3>
                <p>
                  {selected.dept} · {selected.section}분반 ·{' '}
                  {selected.credits}학점
                  {selected.year ? ` · ${yearLabel(selected.year)}` : ''}
                </p>
                <div className="detail-grid">
                  <div>
                    <small>교수</small>
                    <b>{selected.professor || '미정'}</b>
                  </div>
                  <div>
                    <small>수업 방식</small>
                    <b>{deliveryLabel(selected)}</b>
                  </div>
                  <div>
                    <small>강의실</small>
                    <b>{roomLabel(selected) || '미정'}</b>
                  </div>
                  <div>
                    <small>시간</small>
                    <b>{slotsLabel(selected)}</b>
                  </div>
                  {sourceDurationLabel(selected) && (
                    <div>
                      <small>원자료 시간 표기</small>
                      <b>{sourceDurationLabel(selected)}</b>
                    </div>
                  )}
                  <div>
                    <small>타학과 수강</small>
                    <b>{selected.cross ? '가능' : '불가'}</b>
                  </div>
                </div>
                {selected.online && roomLabel(selected) && (
                  <p className="meta">
                    온라인 강좌인데 강의실({roomLabel(selected)})이 함께
                    표기된 원자료입니다. 실제 운영 방식은 교수 공지 또는
                    COSMOS 강의실에서 확인하세요.
                  </p>
                )}
                {alternatives.length > 0 && (
                  <>
                    <h3>다른 분반</h3>
                    <div className="alt-list">
                      {alternatives.map((a) => {
                        const hits = conflicts(
                          a,
                          planned.filter((p) => p.id !== selected.id),
                        );
                        return (
                          <button
                            key={a.id}
                            className="secondary"
                            disabled={busy || !!hits.length}
                            title={
                              hits.length
                                ? `겹침: ${hits[0].name}`
                                : '이 분반으로 변경'
                            }
                            onClick={() => {
                              swap(selected.id, a.id);
                              setSelected(a);
                              notify('분반을 변경했습니다.');
                            }}
                          >
                            {a.section}분반 · {slotsLabel(a)}
                            {hits.length ? ' · 겹침' : ''}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                <div className="actions">
                  <button
                    className="secondary danger"
                    disabled={busy}
                    onClick={() => void removeCourse(selected)}
                  >
                    시간표에서 제거
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3>
                  <Sparkles size={17} aria-hidden="true" /> 맞춤 추천
                </h3>
                <button type="button" className="link" onClick={onOpenSurvey}>
                  수업 선호 설문 {data.prefs.some(Boolean) ? '다시 설정' : '시작하기'}
                </button>
                <p className="meta">
                  입력한 이수 내역·학과·선택한 요일·설문 선호와 확인된 시간의 충돌을 반영합니다. 전필의 개인 적용 여부와 미확인 시간은 학교에서 확인해 주세요.
                  {data.prefs.some((p) =>
                    [
                      '이론',
                      '실습',
                      '프로젝트',
                      '시험',
                      '개인 과제',
                      '팀 프로젝트',
                    ].includes(p),
                  ) &&
                    ' 수업방식·평가방식 선호는 과목별 평가 정보가 없어 아직 반영하지 않습니다.'}
                </p>
                <fieldset className="rec-constraints">
                  <legend>추가 추천 조건</legend>
                  <div className="rec-condition-row">
                    <span className="rec-condition-label">피할 요일</span>
                    <div
                      className="rec-day-buttons"
                      aria-label="피할 요일 선택"
                    >
                      {DAY_SHORT.map((label, dayIndex) => {
                        const active = avoidedDays.includes(dayIndex);
                        return (
                          <button
                            type="button"
                            className={active ? 'active' : ''}
                            aria-pressed={active}
                            key={label}
                            onClick={() =>
                              setAvoidedDays((days) =>
                                active
                                  ? days.filter((day) => day !== dayIndex)
                                  : [...days, dayIndex],
                              )
                            }
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="rec-credit-limit">
                    <span className="rec-condition-label">최대 학점</span>
                    <span className="rec-credit-input">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        step="1"
                        inputMode="numeric"
                        value={maxCreditsInput}
                        aria-invalid={!maxCreditsValid}
                        aria-describedby="rec-credit-help"
                        placeholder="미적용"
                        onChange={(event) =>
                          setMaxCreditsInput(event.target.value)
                        }
                      />
                      <span>학점</span>
                    </span>
                  </label>
                  <p
                    id="rec-credit-help"
                    className={'meta' + (!maxCreditsValid ? ' error' : '')}
                    role={!maxCreditsValid ? 'alert' : undefined}
                  >
                    {maxCreditsValid
                      ? '계획에 담은 학점을 포함해 계산합니다. 비워 두면 적용하지 않습니다.'
                      : '1~30 사이의 정수를 입력해 주세요.'}
                  </p>
                  <div className="rec-condition-foot">
                    <span className="meta">
                      이 조건은 현재 화면에서만 임시로 적용됩니다.
                    </span>
                    {(avoidedDays.length > 0 || maxCreditsInput !== '') && (
                      <button
                        type="button"
                        className="link"
                        onClick={() => {
                          setAvoidedDays([]);
                          setMaxCreditsInput('');
                        }}
                      >
                        조건 초기화
                      </button>
                    )}
                  </div>
                </fieldset>
                {avoidedDays.length > 0 &&
                  recs.some(
                    ({ section }) => section.untimed || !section.slots.length,
                  ) && (
                    <p className="rec-unknown-note">
                      시간 미정 과목은 피할 요일을 확인할 수 없어 후보에
                      남겼습니다. 수강신청 전에 요일을 확인해 주세요.
                    </p>
                  )}
                {recs.map((r) => (
                  <div className="rec" key={r.section.id}>
                    <div>
                      <b>{r.section.name}</b>
                      <small>
                        {r.section.section}분반 · {slotsLabel(r.section)}
                      </small>
                      <div className="rec-reasons">
                        {r.reasons.map((x) => (
                          <span className="badge purple" key={x}>
                            {x}
                          </span>
                        ))}
                        {avoidedDays.length > 0 &&
                          (r.section.untimed || !r.section.slots.length) && (
                            <span className="badge">피할 요일 확인 불가</span>
                          )}
                      </div>
                    </div>
                    <button
                      className="icon"
                      aria-label={r.section.name + ' 계획에 담기'}
                      disabled={busy}
                      onClick={() => tryAdd(r.section)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                ))}
                {!recs.length && catalog && (
                  <p className="meta">
                    {avoidedDays.length > 0 || maxCredits !== undefined
                      ? '선택한 요일·학점 조건에 맞는 추천이 없습니다. 조건을 조정하거나 초기화해 보세요.'
                      : '추천할 과목이 없습니다. 필터나 계획을 조정해 보세요.'}
                  </p>
                )}
              </>
            )}
            {untimedPlanned.length > 0 && (
              <>
                <div className="divider" />
                <h3>온라인 · 시간 미정</h3>
                {untimedPlanned.map((s) => (
                  <div className="rec" key={s.id}>
                    <div>
                      <b>{s.name}</b>
                      <small>
                        {s.dept} · {s.credits}학점
                      </small>
                    </div>
                    <button
                      className="icon"
                      aria-label={s.name + ' 계획에서 제거'}
                      disabled={busy}
                      onClick={() => void removeCourse(s)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        <DragOverlay style={{ pointerEvents: 'none' }}>
          {dragging ? <DragCard s={dragging} /> : null}
        </DragOverlay>
      </DndContext>
      {data.lms && catalog && (
        <EnrolledStrip
          lms={data.lms}
          catalog={catalog}
          planned={planned}
          overrides={data.lmsMatch}
          onFilter={(name) => {
            setQ(name);
            setDept('전체');
            setCat('전체');
            setDay('');
            setBand('전체');
            searchRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            searchRef.current?.focus({ preventScroll: true });
          }}
          onAdd={tryAdd}
          busy={busy}
        />
      )}
      <details ref={comparisonRef} className="plan-comparison card">
        <summary>시간표 A/B/C 비교 <span className="meta">저장된 안 {['A', 'B', 'C'].filter((key) => data.plans?.[key]).length}개</span></summary>
        <fieldset className="plan-slots" aria-label="시간표 시나리오 비교">
          <div className="plan-slot current">
            <div className="plan-slot-head">
              <b>현재 작업 중</b>
              <span className="meta">
                {planned.length}과목 · {credits}학점
                {curConflicts ? ` · 충돌 ${curConflicts}건` : ''}
                {freeDays.length ? ` · 공강 ${freeDays.length}일` : ''}
              </span>
            </div>
          </div>
          {['A', 'B', 'C'].map((k) => {
            const ids = data.plans?.[k];
            const st = ids ? scenarioStats(ids, catalog) : null;
            return (
              <div className={'plan-slot' + (st ? '' : ' empty')} key={k}>
                <div className="plan-slot-head">
                  <b>안 {k}</b>
                  {st ? (
                    <button
                      className="icon"
                      aria-label={`안 ${k} 삭제`}
                      onClick={() => onDeleteScenario(k)}
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </div>
                {st ? (
                  <>
                    <span className="meta">
                      {st.secs.length}과목 · {st.credits}학점
                      {st.conflicts ? ` · 충돌 ${st.conflicts}건` : ''}
                      {st.freeDays ? ` · 공강 ${st.freeDays}일` : ''}
                    </span>
                    {st.missing > 0 && (
                      <span className="meta">
                        현재 카탈로그에 없는 과목 {st.missing}개 포함
                      </span>
                    )}
                    <div className="plan-slot-actions">
                      <button
                        className="secondary"
                        onClick={() => onLoadScenario(k)}
                      >
                        불러오기
                      </button>
                      <button
                        className="link"
                        onClick={() => onSaveScenario(k)}
                      >
                        현재 안으로 덮어쓰기
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="meta">비어 있음</span>
                    <div className="plan-slot-actions">
                      <button
                        className="secondary"
                        disabled={!planned.length}
                        onClick={() => onSaveScenario(k)}
                      >
                        현재 안 저장
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </fieldset>
      </details>
    </section>
  );
}

function BlockCell({
  s,
  sl,
  color,
  onSelect,
  selected,
  onRemove,
  disabled,
}: {
  s: CourseSection;
  sl: { d: number; s: number; e: number };
  color: number;
  onSelect: (s: CourseSection) => void;
  selected: boolean;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'plan:' + s.id + ':' + sl.d + ':' + sl.s,
    data: { planned: true, section: s },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={'tt-block cb' + color + (isDragging ? ' dragging' : '') + (selected ? ' selected' : '')}
      style={{
        top: (sl.s - GRID_START) * PPM,
        height: Math.max((sl.e - sl.s) * PPM, 24),
      }}
    >
      <button className="tt-block-select" onClick={() => onSelect(s)}
        disabled={disabled}
        aria-label={s.name + ' ' + slotLabel(sl) + ', 눌러서 상세 보기'}
        title={s.name + ' · ' + slotLabel(sl)}
        {...listeners} {...attributes}>
        <b>{s.name}</b>
        <small>{fmtMin(sl.s)}~{fmtMin(sl.e)}</small>
      </button>
      <button className="tt-block-remove" disabled={disabled} onClick={onRemove} aria-label={s.name + ' 시간표에서 제거'}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
