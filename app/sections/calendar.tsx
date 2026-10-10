'use client';
import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  MonitorPlay,
} from 'lucide-react';
import type { Data } from './data';
import { currentSemesterStart } from '@/lib/data/lms';
import { staleLabel } from '@/lib/data/freshness';
import { semesterStartTs } from '@/lib/data/catalog';
import {
  WEEKDAYS,
  addMonths,
  collectCalItems,
  dowOf,
  isoOf,
  itemsInRange,
  itemsOnDay,
  kindLabel,
  monthGrid,
  monthKeyOf,
  parseQuickAdd,
  type CalItem,
} from '@/lib/data/calendar';
import { buildIcs } from '@/lib/data/ics';
import { useCatalog, useNow, useSchedule } from './catalog';
import { RetryButton, SkeletonRows } from './skeleton';

const dday = (iso: string, todayIso: string) => {
  const diff = Math.round(
    (new Date(iso + 'T00:00:00').getTime() -
      new Date(todayIso + 'T00:00:00').getTime()) /
      86400000,
  );
  return diff === 0 ? 'D-day' : diff > 0 ? `D-${diff}` : `D+${-diff}`;
};

const fmtRange = (start: string, end?: string) =>
  end && end !== start ? `${start.slice(5)} ~ ${end.slice(5)}` : start.slice(5);

export function CalendarSection({
  data,
  persist,
  detail,
  go,
}: {
  data: Data;
  persist: (next: Data, msg?: string) => Promise<boolean>;
  detail?: string;
  go: (route: string) => void;
}) {
  const { snap, failed, retry } = useSchedule();
  const { catalog } = useCatalog();
  const now = useNow(30000);
  const todayIso = isoOf(new Date(now));
  const [selected, setSelected] = useState(todayIso);
  const [month, setMonth] = useState(todayIso.slice(0, 7));
  const [quick, setQuick] = useState('');
  const [preview, setPreview] = useState<{
    title: string;
    date: string;
    dateFound: boolean;
  } | null>(null);
  const [eventErr, setEventErr] = useState('');

  const before =
    (catalog?.semester ? semesterStartTs(catalog.semester) : null) ??
    currentSemesterStart(now);

  const items = useMemo(
    () =>
      collectCalItems({
        schedule: snap?.items,
        lms: data.lms,
        events: data.events,
        lmsBefore: before,
      }),
    [snap, data.lms, data.events, before],
  );

  const cells = useMemo(() => monthGrid(month), [month]);
  const rangeItems = useMemo(
    () => itemsInRange(items, cells[0].iso, cells[41].iso),
    [items, cells],
  );
  const dayItems = useMemo(
    () => itemsOnDay(items, selected),
    [items, selected],
  );

  const selectDay = (iso: string) => {
    setSelected(iso);
    if (monthKeyOf(iso) !== month) setMonth(monthKeyOf(iso));
    setPreview(null);
    setQuick('');
  };
  const moveMonth = (n: number) => {
    const next = addMonths(month, n);
    setMonth(next);
    setSelected(`${next}-01`);
    setPreview(null);
    setQuick('');
  };

  const submitQuick = () => {
    const p = parseQuickAdd(quick, selected);
    if (!p) {
      setEventErr('일정 내용을 입력해 주세요.');
      return;
    }
    setEventErr('');
    setPreview(p);
  };
  const confirmQuick = async () => {
    if (!preview) return;
    const ok = await persist(
      {
        ...data,
        events: [...data.events, { title: preview.title, date: preview.date }]
          .sort((a, b) => a.date.localeCompare(b.date)),
      },
      '개인 일정을 저장했습니다.',
    );
    if (ok) {
      setQuick('');
      setPreview(null);
    }
  };

  const exportIcs = () => {
    const planned = data.planned
      .map((id) => catalog?.sections.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s);
    const semesterStartIso =
      before != null ? isoOf(new Date(before)) : undefined;
    const text = buildIcs({
      items,
      planned,
      semester: catalog?.semester,
      semesterStartIso,
    });
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hansung-calendar.ics';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // /calendar/:id — 공식 학사일정 상세
  if (detail) {
    const e = snap?.items.find((x) => x.id === detail);
    const fetched = snap?.fetchedAt.slice(0, 10);
    const stale = snap ? staleLabel(snap.fetchedAt, now) : null;
    return (
      <section className="card pad">
        <button className="link" onClick={() => go('calendar')}>
          ← 학사일정
        </button>
        {!snap && !failed && <SkeletonRows n={3} />}
        {snap && !e && <h2>일정을 찾지 못했습니다.</h2>}
        {e && (
          <>
            <h2>{e.title}</h2>
            <p>
              공식 학사일정 · {e.start}
              {e.end && e.end !== e.start ? ` ~ ${e.end}` : ''}
            </p>
            <p className="meta">
              hansung.ac.kr 수집 · {fetched} 기준
              {stale ? ` · ` : ''}
              {stale && <span className="badge orange">{stale}</span>}
              {' '}· 일정은 학교 사정으로 변동될 수 있습니다.
            </p>
            <a
              className="link"
              href="https://www.hansung.ac.kr/hansung/6096/subview.do"
              target="_blank"
              rel="noreferrer"
            >
              원본 페이지에서 확인 <ArrowUpRight size={16} />
            </a>
          </>
        )}
        {failed && !e && (
          <p className="meta">
            학사일정을 불러오지 못했습니다. 원본 페이지에서 확인해 주세요.{' '}
            <RetryButton onRetry={retry} />
          </p>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="card pad">
        <div className="between">
          <h2>학사 캘린더</h2>
          <div className="cal-head-actions">
            <button
              className="link"
              onClick={exportIcs}
              title="학사일정·수업 마감·개인 일정·계획 시간표를 캘린더 앱으로 내보내기"
            >
              <Download size={15} /> 내보내기(.ics)
            </button>
            <a
              className="link"
              href="https://www.hansung.ac.kr/hansung/6096/subview.do"
              target="_blank"
              rel="noreferrer"
            >
              원본 <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
        <p className="meta">
          공식 학사일정
          {snap && (
            <>
              {' '}· {snap.fetchedAt.slice(0, 10)} 수집
              {staleLabel(snap.fetchedAt, now) && (
                <>
                  {' '}
                  <span className="badge orange">
                    {staleLabel(snap.fetchedAt, now)}
                  </span>
                </>
              )}
            </>
          )}
          {data.lms && <> · 수업 마감(COSMOS 수집) · 개인 일정을 함께 표시</>}
        </p>
        {failed && (
          <p className="meta">
            학사일정을 불러오지 못했습니다.{' '}
            <RetryButton onRetry={retry} />
          </p>
        )}
        <div className="cal-wrap">
          <div className="cal-main">
            <div className="cal-nav">
              <button
                className="icon"
                aria-label="이전 달"
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <b className="cal-ym">
                {Number(month.slice(0, 4))}년 {Number(month.slice(5))}월
              </b>
              <button
                className="icon"
                aria-label="다음 달"
                onClick={() => moveMonth(1)}
              >
                <ChevronRight size={18} />
              </button>
              <button
                className="link cal-today"
                onClick={() => selectDay(todayIso)}
              >
                오늘
              </button>
            </div>
            <div className="cal-weekdays" aria-hidden="true">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div
              className="cal-grid"
              role="grid"
              aria-label={`${Number(month.slice(5))}월 달력`}
            >
              {cells.map((cell) => {
                const onDay = itemsOnDay(rangeItems, cell.iso);
                const bands = onDay.filter((i) => i.kind === 'academic');
                const chips = onDay.filter((i) => i.kind !== 'academic');
                const showChips = Math.max(0, 3 - Math.min(bands.length, 2));
                const isSel = cell.iso === selected;
                const isToday = cell.iso === todayIso;
                return (
                  <button
                    type="button"
                    key={cell.iso}
                    aria-pressed={isSel}
                    aria-label={`${Number(cell.iso.slice(5, 7))}월 ${Number(cell.iso.slice(8))}일 ${WEEKDAYS[dowOf(cell.iso)]}요일${isToday ? ' 오늘' : ''}`}
                    className={[
                      'cal-cell',
                      cell.inMonth ? '' : 'outside',
                      isToday ? 'today' : '',
                      isSel ? 'selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => selectDay(cell.iso)}
                  >
                    <span className="cal-dayno">
                      {Number(cell.iso.slice(8))}
                      {isToday && <i>오늘</i>}
                    </span>
                    <div className="cal-bands" aria-hidden="true">
                      {bands.slice(0, 2).map((b) => (
                        <span
                          key={b.id}
                          className={[
                            'cal-band',
                            b.start === cell.iso ? 'begins' : '',
                            (b.end ?? b.start) === cell.iso ? 'ends' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          title={b.title}
                        >
                          {(b.start === cell.iso || dowOf(cell.iso) === 0) &&
                            b.title}
                        </span>
                      ))}
                      {bands.length > 2 && (
                        <span className="cal-more">+{bands.length - 2}</span>
                      )}
                    </div>
                    <div className="cal-chips">
                      {chips.slice(0, showChips).map((c) => (
                        <span
                          key={c.id}
                          className={`cal-chip ${c.kind}`}
                          title={`${kindLabel(c.kind)} · ${c.title}`}
                        >
                          {c.title}
                        </span>
                      ))}
                      {chips.length > showChips && showChips > 0 && (
                        <span className="cal-more">
                          +{chips.length - showChips}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <aside className="cal-side" aria-label="선택한 날짜의 일정">
            <h3 className="cal-side-date">
              {Number(selected.slice(5, 7))}월 {Number(selected.slice(8))}일{' '}
              {WEEKDAYS[dowOf(selected)]}요일
              {selected === todayIso && <em>오늘</em>}
            </h3>
            <div className="cal-agenda">
              {dayItems.length === 0 && (
                <p className="meta">이 날짜에 등록된 일정이 없습니다.</p>
              )}
              {(['academic', 'lms', 'personal'] as const).map((kind) => {
                const list = dayItems.filter((i) => i.kind === kind);
                if (!list.length) return null;
                return (
                  <div className="cal-agenda-group" key={kind}>
                    <small className="cal-agenda-kind">
                      {kindLabel(kind)}
                    </small>
                    {list.map((it) => (
                      <AgendaRow
                        key={it.id}
                        item={it}
                        todayIso={todayIso}
                        go={go}
                        onDelete={
                          it.kind === 'personal' && it.index !== undefined
                            ? async () =>
                                await persist(
                                  {
                                    ...data,
                                    events: data.events.filter(
                                      (_, j) => j !== it.index,
                                    ),
                                  },
                                  '일정을 삭제했습니다.',
                                )
                            : undefined
                        }
                      />
                    ))}
                  </div>
                );
              })}
            </div>
            <form
              className="cal-quick"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (preview) void confirmQuick();
                else submitQuick();
              }}
            >
              <input
                value={quick}
                onChange={(e) => {
                  setQuick(e.target.value);
                  setPreview(null);
                }}
                placeholder={`${Number(selected.slice(8))}일 일정 — "내일 팀플", "11/3 보고서"`}
                aria-label="개인 일정 빠른 추가"
                maxLength={80}
                aria-invalid={!!eventErr}
              />
              <button className="primary" type="submit">
                {preview ? '추가' : <Plus size={16} />}
              </button>
            </form>
            {preview && (
              <p className="cal-preview meta">
                {preview.dateFound ? '일정' : '날짜 미인식 — 선택일'} ·{' '}
                <b>{preview.date}</b> — {preview.title}
                <button
                  className="link"
                  onClick={() => {
                    setPreview(null);
                  }}
                >
                  다시 입력
                </button>
              </p>
            )}
            {eventErr && (
              <p className="meta form-error" role="alert">
                {eventErr}
              </p>
            )}
          </aside>
        </div>
        {!snap && !failed && <SkeletonRows n={3} />}
        {snap && !items.length && (
          <p className="meta">표시할 일정이 없습니다.</p>
        )}
      </section>
    </>
  );
}

function AgendaRow({
  item,
  todayIso,
  go,
  onDelete,
}: {
  item: CalItem;
  todayIso: string;
  go: (route: string) => void;
  onDelete?: () => Promise<unknown>;
}) {
  return (
    <div className={`cal-agenda-row ${item.kind}`}>
      <div>
        {item.kind === 'academic' ? (
          <button
            className="link title-link"
            onClick={() => go('calendar/' + item.id.slice(3))}
          >
            {item.title}
          </button>
        ) : item.url ? (
          <a
            className="link title-link"
            href={item.url}
            target="_blank"
            rel="noreferrer"
          >
            {item.title}
          </a>
        ) : (
          <b>{item.title}</b>
        )}
        <small>
          {item.kind === 'academic'
            ? fmtRange(item.start, item.end)
            : item.meta ?? item.start.slice(5)}
          {item.kind === 'lms' && ` · ${dday(item.start, todayIso)}`}
        </small>
      </div>
      {item.kind === 'lms' && <MonitorPlay size={14} />}
      {onDelete && (
        <button className="icon" aria-label="일정 삭제" onClick={onDelete}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
