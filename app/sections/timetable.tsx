'use client';
import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
  placeLabel,
  slotLabel,
  slotsLabel,
  type Catalog,
  type CourseSection,
} from '@/lib/data/catalog';
import {
  catGroup,
  deptMatches,
  deptPoolOf,
  planBlockReason,
  recommend,
} from './catalog';
import { matchEnrollment } from '@/lib/data/lms';
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

function CatRow({
  s,
  added,
  onAdd,
}: {
  s: CourseSection;
  added: boolean;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'cat:' + s.id,
    data: { section: s },
    disabled: added,
  });
  return (
    <div
      ref={setNodeRef}
      className={'cat-row' + (isDragging ? ' dragging' : '')}
    >
      <button
        className="cat-grip"
        aria-label={s.name + ' 끌어서 시간표에 추가'}
        {...listeners}
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
          onClick={onAdd}
        >
          {added ? <X size={16} /> : <Plus size={16} />}
        </button>
      </div>
    </div>
  );
}

/** COSMOS 수강 과목 ↔ 카탈로그 매칭 스트립 — 시간표 반영 여부를 보여준다. */
function EnrolledStrip({
  lms,
  catalog,
  planned,
  onFilter,
  onAdd,
}: {
  lms: NonNullable<Data['lms']>;
  catalog: Catalog;
  planned: CourseSection[];
  onFilter: (title: string) => void;
  /** 분반을 계획에 담기 — 충돌·중복·이수 검사는 호출처가 처리, 성공 여부 반환 */
  onAdd: (s: CourseSection) => boolean;
}) {
  const matches = useMemo(() => matchEnrollment(lms, catalog), [lms, catalog]);
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
        {matches.map(({ course, sections }) => {
          const inPlan = sections.filter((s) => plannedIds.has(s.id));
          return (
            <div className="enrolled-item" key={course.id}>
              <div className="enrolled-row">
                <div>
                  <b>{course.title}</b>
                  <small>
                    {course.prof || '교수 미기재'}
                    {course.community ? ' · 커뮤니티' : ''}
                  </small>
                </div>
                {sections.length === 0 ? (
                  <span className="meta">카탈로그에 없는 과목</span>
                ) : inPlan.length ? (
                  <span className="badge green">계획에 있음</span>
                ) : (
                  <span className="enrolled-actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        if (sections.length === 1) onAdd(sections[0]);
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
                      onClick={() => {
                        if (onAdd(s)) setPicking(null);
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

export function Timetable({
  catalog,
  failed,
  retry,
  planned,
  data,
  plan,
  swap,
  notify,
}: {
  catalog: Catalog | null;
  failed?: boolean;
  retry?: () => void;
  planned: CourseSection[];
  data: Data;
  plan: (id: string) => void;
  swap: (fromId: string, toId: string) => void;
  notify: (msg: string) => void;
}) {
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [cat, setCat] = useState('전체');
  const [day, setDay] = useState('');
  const [band, setBand] = useState('전체');
  const [selected, setSelected] = useState<CourseSection | null>(null);
  const [dragging, setDragging] = useState<CourseSection | null>(null);
  const [dragPlan, setDragPlan] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const { setNodeRef: gridRef } = useDroppable({ id: 'tt-grid' });
  const { setNodeRef: trashRef } = useDroppable({ id: 'tt-trash' });

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
  const recs = useMemo(
    () => (catalog ? recommend(catalog.sections, data, planned) : []),
    [catalog, data, planned],
  );
  const untimedPlanned = planned.filter((s) => s.untimed);
  const credits = planned.reduce((n, s) => n + s.credits, 0);
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

  function tryAdd(s: CourseSection): boolean {
    if (planned.some((p) => p.id === s.id)) return false;
    const blocked = planBlockReason(s, data, planned);
    if (blocked) {
      notify(blocked);
      return false;
    }
    plan(s.id);
    setSelected(null);
    return true;
  }
  function onDragStart(e: DragStartEvent) {
    const payload = e.active.data.current as
      | { section: CourseSection; planned?: boolean }
      | undefined;
    setDragging(payload?.section ?? null);
    setDragPlan(!!payload?.planned);
  }
  function onDragEnd(e: DragEndEvent) {
    const payload = e.active.data.current as
      | { section: CourseSection; planned?: boolean }
      | undefined;
    setDragging(null);
    setDragPlan(false);
    if (!payload) return;
    if (e.over?.id === 'tt-grid' && !payload.planned) tryAdd(payload.section);
    if (e.over?.id === 'tt-trash' && payload.planned) {
      plan(payload.section.id);
      setSelected(null);
    }
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
        <div>
          <h2>시간표 짜기</h2>
          <p>
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
        </div>
        <div className="builder-actions">
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
      {data.lms && catalog && (
        <EnrolledStrip
          lms={data.lms}
          catalog={catalog}
          planned={planned}
          onFilter={(name) => {
            setQ(name);
            setDept('전체');
            setCat('전체');
            setDay('');
            setBand('전체');
          }}
          onAdd={tryAdd}
        />
      )}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="builder-cols">
          <div className="builder-list card">
            <div className="builder-filters">
              <label className="cat-search">
                <Search size={15} aria-hidden="true" />
                <input
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
                    added={planned.some((p) => p.id === s.id)}
                    onAdd={() =>
                      planned.some((p) => p.id === s.id)
                        ? plan(s.id)
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

          <div className="builder-grid card scrollable">
            <div className="tt-head">
              <span>시간</span>
              {DAY_SHORT.slice(0, 6).map((d) => (
                <b key={d}>{d}</b>
              ))}
            </div>
            <div className="tt-body" ref={gridRef}>
              <div className="tt-hours" aria-hidden="true">
                {HOURS.map((h) => (
                  <small key={h} style={{ top: (h - GRID_START) * PPM }}>
                    {fmtMin(h)}
                  </small>
                ))}
              </div>
              {DAY_SHORT.slice(0, 6).map((_, d) => (
                <div className="tt-col" key={d}>
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
                        />
                      ));
                    })}
                </div>
              ))}
              {planned.every((s) => s.untimed || !s.slots.length) && (
                <div className="tt-empty">
                  <BookOpen size={28} aria-hidden="true" />
                  <p>
                    왼쪽 목록에서 과목을 끌어다 놓거나
                    <br />+ 버튼으로 담아 보세요.
                  </p>
                </div>
              )}
            </div>
            <div
              ref={trashRef}
              className={'tt-trash' + (dragPlan ? ' visible' : '')}
            >
              <Trash2 size={15} aria-hidden="true" /> 여기에 놓으면 제거
            </div>
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
                  {selected.year ? ` · ${selected.year}학년` : ''}
                </p>
                <div className="detail-grid">
                  <div>
                    <small>교수</small>
                    <b>{selected.professor || '미정'}</b>
                  </div>
                  <div>
                    <small>강의실</small>
                    <b>{placeLabel(selected)}</b>
                  </div>
                  <div>
                    <small>시간</small>
                    <b>{slotsLabel(selected)}</b>
                  </div>
                  <div>
                    <small>타학과 수강</small>
                    <b>{selected.cross ? '가능' : '불가'}</b>
                  </div>
                </div>
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
                            disabled={!!hits.length}
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
                    onClick={() => {
                      plan(selected.id);
                      setSelected(null);
                    }}
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
                <p className="meta">
                  학과·학년·설문 선호·시간 충돌을 반영한 규칙 기반 추천입니다.
                  {data.prefs.some((p) =>
                    ['이론', '실습', '프로젝트', '시험', '개인 과제', '팀 프로젝트'].includes(p),
                  ) &&
                    ' 수업방식·평가방식 선호는 과목별 평가 정보가 없어 아직 반영하지 않습니다.'}
                </p>
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
                      </div>
                    </div>
                    <button
                      className="icon"
                      aria-label={r.section.name + ' 계획에 담기'}
                      onClick={() => tryAdd(r.section)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                ))}
                {!recs.length && catalog && (
                  <p className="meta">
                    추천할 과목이 없습니다. 필터나 계획을 조정해 보세요.
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
                      onClick={() => plan(s.id)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        <DragOverlay>
          {dragging ? <DragCard s={dragging} /> : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function BlockCell({
  s,
  sl,
  color,
  onSelect,
}: {
  s: CourseSection;
  sl: { d: number; s: number; e: number };
  color: number;
  onSelect: (s: CourseSection) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'plan:' + s.id + ':' + sl.d + ':' + sl.s,
    data: { planned: true, section: s },
  });
  return (
    <button
      ref={setNodeRef}
      className={'tt-block cb' + color + (isDragging ? ' dragging' : '')}
      style={{
        top: (sl.s - GRID_START) * PPM,
        height: Math.max((sl.e - sl.s) * PPM, 24),
      }}
      onClick={() => onSelect(s)}
      aria-label={s.name + ' ' + slotLabel(sl) + ', 눌러서 상세 보기'}
      {...listeners}
      {...attributes}
    >
      <b>{s.name}</b>
      <small>
        {fmtMin(sl.s)}~{fmtMin(sl.e)}
      </small>
    </button>
  );
}
