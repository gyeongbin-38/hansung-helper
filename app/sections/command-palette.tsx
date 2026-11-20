'use client';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  ArrowRight,
  CornerDownLeft,
  Search,
} from 'lucide-react';
import { menus, type Data } from './data';
import { useActivities, useNow, useRequiredMissing, useSchedule } from './catalog';
import { koreanMatch } from '@/lib/data/hangul';
import { activityMatch, liveStatus } from '@/lib/data/activities';
import {
  courseMatch,
  semesterStartTs,
  slotsLabel,
  type Catalog,
} from '@/lib/data/catalog';
import { currentSemesterStart } from '@/lib/data/lms';
import { lmsTaskSearch } from '@/lib/data/search';

const CAP = 5;

type Item = {
  key: string;
  group: string;
  icon: ComponentType<{ size?: number | string }>;
  label: string;
  sub: string;
  route: string;
};

/** ⌘K 커맨드 팔레트 — 과목·활동·일정·수업 현황·메뉴 이동을 즉시 검색한다.
 *  결과 선택은 해당 상세로 이동하고, '전체 결과'는 기존 검색 페이지로 간다. */
export function CommandPalette({
  open,
  onClose,
  query,
  setQuery,
  data,
  catalog,
  go,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  setQuery: (v: string) => void;
  data: Data;
  catalog: Catalog | null;
  go: (route: string) => void;
}) {
  const { snap: acts } = useActivities();
  const { snap: sched } = useSchedule();
  const required = useRequiredMissing(data, catalog);
  const now = useNow(30000);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const q = query.trim();
  const items = useMemo<Item[]>(() => {
    const nav: Item[] = menus
      .filter(([, label]) => koreanMatch(label, q))
      .map(([route, label, icon]) => ({
        key: 'nav-' + route,
        group: '바로 가기',
        icon,
        label,
        sub: '메뉴 이동',
        route,
      }));
    if (!q) return nav;
    const courses: Item[] = (catalog?.sections ?? [])
      .filter((s) => courseMatch(s, q))
      .slice(0, CAP)
      .map((s) => ({
        key: 'course-' + s.id,
        group: '과목',
        icon: menus.find((m) => m[0] === 'courses')![2],
        label: s.name,
        sub: `${s.dept} · ${s.section}분반 · ${s.credits}학점 · ${slotsLabel(s)}${required?.missing.has(s.code) ? ' · 졸업 필수' : ''}`,
        route: 'courses/' + s.id,
      }));
    const activities: Item[] = (acts?.items ?? [])
      .filter((a) => activityMatch(a, q, koreanMatch))
      .slice(0, CAP)
      .map((a) => ({
        key: 'act-' + a.id,
        group: '비교과·대외활동',
        icon: menus.find((m) => m[0] === 'activities')![2],
        label: a.title,
        sub: `${liveStatus(a, now).label}${a.points != null ? ` · ${a.points}P` : ''} · ${a.dept}`,
        route: 'activities/' + a.id,
      }));
    const events: Item[] = (sched?.items ?? [])
      .filter((e) => koreanMatch(e.title, q))
      .slice(0, CAP)
      .map((e) => ({
        key: 'event-' + e.id,
        group: '학사일정',
        icon: menus.find((m) => m[0] === 'calendar')![2],
        label: e.title,
        sub: `${e.start}${e.end && e.end !== e.start ? ` ~ ${e.end}` : ''}`,
        route: 'calendar/' + e.id,
      }));
    const before =
      (catalog?.semester ? semesterStartTs(catalog.semester) : null) ??
      currentSemesterStart(now);
    const lms: Item[] = [
      ...lmsTaskSearch(data.lms?.courses ?? [], q, before),
      ...(data.lms?.courses ?? [])
        .filter((c) => koreanMatch(c.title, q))
        .map((c) => ({
          label: c.title,
          route: 'lms/' + c.id,
          sub: `COSMOS 수업 · 수강 중${c.prof ? ` · ${c.prof}` : ''}`,
        })),
    ]
      .slice(0, CAP)
      .map((h, i) => ({
        key: 'lms-' + i,
        group: '수업 현황',
        icon: menus.find((m) => m[0] === 'lms')![2],
        label: h.label,
        sub: h.sub,
        route: h.route,
      }));
    return [...nav, ...courses, ...activities, ...events, ...lms];
  }, [q, catalog, acts, sched, data.lms, now, required]);

  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setIndex(0);
  }

  const pick = (route: string) => {
    go(route);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        if (items[index]) {
          e.preventDefault();
          pick(items[index].route);
        } else if (q) {
          e.preventDefault();
          pick('search');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, index, q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  return (
    <>
      <button
        className="palette-backdrop"
        aria-label="검색 닫기"
        onClick={onClose}
      />
      <dialog className="palette" open aria-label="통합 검색">
        <div className="palette-input">
          <Search size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="과목·활동·일정·메뉴 검색"
            aria-label="통합 검색"
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {items.length === 0 && (
            <p className="palette-empty">결과가 없어요 — 다른 표현으로 검색해 보세요.</p>
          )}
          {items.map((item, i) => {
            const heading =
              i === 0 || items[i - 1].group !== item.group ? item.group : null;
            const Icon = item.icon;
            return (
              <div key={item.key}>
                {heading && <p className="palette-group">{heading}</p>}
                <button
                  className="palette-item"
                  data-active={i === index}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => pick(item.route)}
                >
                  <Icon size={16} />
                  <span>
                    <b>{item.label}</b>
                    <small>{item.sub}</small>
                  </span>
                  <CornerDownLeft size={13} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span>↑↓ 이동 · ↵ 선택</span>
          {q && (
            <button className="link" onClick={() => pick('search')}>
              전체 결과 보기 <ArrowRight size={13} />
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
