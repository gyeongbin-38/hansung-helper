'use client';
import { useMemo, useState } from 'react';
import { ArrowUpRight, BookOpen, Check, Plus, Search } from 'lucide-react';
import {
  conflicts,
  courseMatch,
  deliveryLabel,
  roomLabel,
  sourceDurationLabel,
  slotsLabel,
  yearLabel,
  type Catalog,
  type CourseSection,
} from '@/lib/data/catalog';
import { catGroup, deptMatches, planBlockReason } from './catalog';
import { RetryButton, SkeletonCards, SkeletonDetail } from './skeleton';
import { resolveDept } from '@/lib/data/dept';
import { enrolledSectionIds } from '@/lib/data/lms';
import { courseSuggestion } from '@/lib/data/course-suggestions';
import type { Data } from './data';

const LIMIT = 60;

export function Courses({
  data,
  plan,
  swap,
  detail,
  go,
  catalog,
  failed,
  retry,
  notify,
}: {
  data: Data;
  plan: (id: string) => void;
  swap?: (fromId: string, toId: string) => void;
  detail?: string;
  go: (route: string) => void;
  catalog: Catalog | null;
  failed?: boolean;
  retry?: () => void;
  notify?: (msg: string) => void;
}) {
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [cat, setCat] = useState('전체');
  const [day, setDay] = useState('');
  const [band, setBand] = useState('전체');
  const depts = useMemo(
    () =>
      catalog ? [...new Set(catalog.sections.map((s) => s.dept))].sort() : [],
    [catalog],
  );
  const myDept = data.dept && data.dept !== '소속 미입력' ? data.dept : '';
  const myDeptRes = useMemo(
    () => (myDept ? resolveDept(myDept, depts) : {}),
    [myDept, depts],
  );
  const effectiveDept =
    dept === '' && !myDeptRes.dept && !myDeptRes.candidates?.length
      ? '전체'
      : dept;
  const filtered = useMemo(() => {
    if (!catalog) return [];
    const pool = myDeptRes.dept
      ? [myDeptRes.dept]
      : (myDeptRes.candidates ?? null);
    return catalog.sections.filter((s) => {
      const deptOk = !effectiveDept
        ? !!pool && pool.some((d) => deptMatches(s.dept, d))
        : effectiveDept === '전체'
          ? true
          : s.dept === effectiveDept;
      if (!deptOk) return false;
      const catOk =
        cat === '전체' ||
        (cat === '기타'
          ? !['전필', '전선', '교양·일반'].includes(catGroup(s))
          : catGroup(s) === cat);
      if (!catOk || !courseMatch(s, q)) return false;
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
  }, [catalog, q, effectiveDept, cat, day, band, myDeptRes]);
  const plannedSecs = useMemo(
    () =>
      (catalog?.sections ?? []).filter((s) => data.planned.includes(s.id)),
    [catalog, data.planned],
  );
  const suggestions = useMemo(() => {
    const input = {
      matchedDept: myDeptRes.dept,
      completedCodes: [...data.completed.map((c) => c.code), ...(data.info?.completed ?? []).map((c) => c.code)].filter((code) => code.trim().length > 0 && code !== '미확인'),
      completedNames: [...data.completed.map((c) => c.name), ...(data.info?.completed ?? []).map((c) => c.name)],
      plannedCodes: plannedSecs.map((s) => s.code),
      plannedSections: plannedSecs,
      prefs: data.prefs,
      selectedDay: day,
    };
    return filtered.map((section) => ({ section, ...courseSuggestion(section, input) }))
      .sort((a, b) => b.score - a.score);
  }, [filtered, myDeptRes.dept, data.completed, data.info?.completed, data.prefs, plannedSecs, day]);
  // COSMOS 수강 과목과 매칭된 분반 — 이수 확정이 아닌 표시용.
  // 수업 현황의 수동 매칭 보정(lmsMatch)도 같은 결과에 반영된다.
  const enrolled = useMemo(
    () =>
      data.lms && catalog
        ? enrolledSectionIds(data.lms, catalog, data.lmsMatch)
        : null,
    [data.lms, catalog, data.lmsMatch],
  );
  function toggle(s: CourseSection) {
    if (data.planned.includes(s.id)) return plan(s.id);
    const blocked = planBlockReason(s, data, plannedSecs);
    if (blocked) {
      notify?.(blocked);
      return;
    }
    plan(s.id);
  }

  // ---------- 상세 라우트 (/courses/:id) ----------
  if (detail !== undefined) {
    const s = catalog?.sections.find((x) => x.id === detail);
    if (!catalog)
      return (
        <div className="card pad">
          {failed ? (
            <p>
              개설강의 데이터를 불러오지 못했습니다.{' '}
              {retry && <RetryButton onRetry={retry} />}
            </p>
          ) : (
            <SkeletonDetail />
          )}
        </div>
      );
    if (!s)
      return (
        <div className="card pad">
          <p>과목을 찾을 수 없습니다.</p>
          <div>
            <button className="secondary" onClick={() => go('courses')}>
              과목 목록으로
            </button>
          </div>
        </div>
      );
    const siblings = catalog.sections.filter(
      (x) => x.code === s.code && x.id !== s.id,
    );
    const added = data.planned.includes(s.id);
    const clashes = conflicts(s, plannedSecs);
    const completedHere = data.completed.some((c) => c.code === s.code);
    return (
      <>
        <button
          className="link crumb"
          onClick={() => go('courses')}
          aria-label="과목 목록으로"
        >
          홈 / 과목 추천 / {s.name}
        </button>
        <section className="card detail">
          <div className="course-badges">
            {added && <span className="badge purple">계획에 담김</span>}
            {enrolled?.has(s.id) && (
              <span
                className="badge blue"
                title="COSMOS 수업 현황과 과목명이 일치 · 이수 여부는 학교 시스템 기준"
              >
                수강 중
              </span>
            )}
            <span className="badge">{s.category}</span>
            {s.online && <span className="badge blue">온라인</span>}
            {s.cross && <span className="badge green">교차가능</span>}
            {s.timeFixed && <span className="badge orange">시간 보정됨</span>}
          </div>
          <h2>{s.name}</h2>
          <p>
            {s.dept} · {s.code}-{s.section} · {s.credits}학점
            {s.year ? ` · ${yearLabel(s.year)}` : ''}
          </p>
          <div className="detail-grid">
            {[
              ['이수구분', s.category === catGroup(s) ? s.category : `${s.category} (${catGroup(s)})`],
              ['담당 교수', s.professor || '교수 미정'],
              ['수업 방식', deliveryLabel(s)],
              [
                '강의실',
                roomLabel(s) || '강의실 미기재',
              ],
              [
                '수업 시간',
                slotsLabel(s),
              ],
              ...(sourceDurationLabel(s) ? [['원자료 시간 표기', sourceDurationLabel(s)]] : []),
            ].map(([l, v]) => (
              <div key={l}>
                <small>{l}</small>
                <b>{v}</b>
              </div>
            ))}
          </div>
          {s.online && roomLabel(s) && <p className="meta">원자료에 온라인과 강의실이 함께 표시되어 있습니다. 실제 운영 방식은 교수 공지 또는 COSMOS에서 확인해 주세요.</p>}
          {clashes.length > 0 && !added && (
            <p className="meta">
              현재 계획과 시간이 겹칩니다:{' '}
              {clashes
                .map((h) => h.name)
                .slice(0, 3)
                .join(', ')}
            </p>
          )}
          {completedHere && (
            <p className="meta">이미 이수한 과목으로 입력되어 있습니다.</p>
          )}
          <div className="actions">
            <button className="primary" onClick={() => toggle(s)}>
              {added ? <Check size={17} /> : <Plus size={17} />}{' '}
              {added ? '계획에서 빼기' : '선택한 학기 계획에 담기'}
            </button>
            <button className="secondary" onClick={() => go('timetable')}>
              시간표에서 보기 <ArrowUpRight size={16} />
            </button>
          </div>
          {siblings.length > 0 && (
            <>
              <h3>다른 분반 ({siblings.length})</h3>
              <div className="events">
                {siblings.map((alt) => {
                  const altIn = data.planned.includes(alt.id);
                  return (
                    <div className="event-line" key={alt.id}>
                      <BookOpen />
                      <div>
                        <b>{alt.section}분반</b>
                        <small>
                          {slotsLabel(alt)} · {alt.professor || '교수 미정'}
                          {roomLabel(alt) ? ` · ${roomLabel(alt)}` : ''}
                        </small>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => {
                          if (altIn) return;
                          if (added && swap) return swap(s.id, alt.id);
                          const blocked = planBlockReason(alt, data, plannedSecs);
                          if (blocked) {
                            notify?.(blocked);
                            return;
                          }
                          plan(alt.id);
                        }}
                      >
                        {altIn ? '담김' : added && swap ? '이 분반으로 변경' : '담기'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <p className="meta">
            출처: {catalog.semester} 공식 개설 시간표 · {catalog.source} ·
            공식 수강신청이 아닌 개인 계획용 데이터입니다.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="demo-note">
        {catalog ? (
          <>
            <b>{catalog.semester} 공식 개설 시간표</b> · {catalog.sectionCount}
            개 분반 · {catalog.source}. 수강 가능 여부는 학교 수강신청에서 최종
            확인해 주세요.
          </>
        ) : failed ? (
          <>
            개설강의 데이터를 불러오지 못했습니다.{' '}
            {retry && <RetryButton onRetry={retry} />}
          </>
        ) : (
          '개설강의 데이터를 불러오는 중입니다.'
        )}
      </div>
      <div className="toolbar">
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
          value={effectiveDept}
          onChange={(e) => setDept(e.target.value)}
        >
          {myDeptRes.dept && <option value="">내 학과 위주</option>}
          <option value="전체">전체 학과</option>
          {depts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <div className="tabs">
          {['전체', '전필', '전선', '교양·일반', '기타'].map((f) => (
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
        <select
          aria-label="요일 필터"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        >
          <option value="">요일 전체</option>
          {['월', '화', '수', '목', '금', '토'].map((d, i) => (
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
      {myDept && !myDeptRes.dept && (
        <p className="meta">
          {myDeptRes.candidates
            ? `학과 매칭 확인 필요 · '${myDept}' 후보: ${myDeptRes.candidates.join(' · ')}. 전체 학과를 표시합니다.`
            : `학과 매칭 확인 필요 · '${myDept}'을(를) 카탈로그 학과에서 찾지 못했습니다. 전체 학과를 표시합니다.`}
        </p>
      )}
      <p className="meta">입력한 학과·이수 내역·선호와 선택한 요일을 기준으로 정렬합니다. 이수 내역은 누락될 수 있으며 전필 적용 여부는 학교 기준을 확인해 주세요.</p>
      {!catalog && !failed && <SkeletonCards />}
      <div className="cards">
        {suggestions.slice(0, LIMIT).map(({ section: s, reasons }, i) => {
          const added = data.planned.includes(s.id);
          const overlaps = conflicts(s, plannedSecs);
          return (
            <article className="card pad course" key={s.id}>
              <div className="between course-head">
                <span className={'course-mark cm' + (i % 5)}>
                  <BookOpen size={18} />
                </span>
                <div className="course-badges">
                  {added && <span className="badge purple">계획에 담김</span>}
                  {enrolled?.has(s.id) && (
                    <span
                      className="badge blue"
                      title="COSMOS 수업 현황과 과목명이 일치 · 이수 여부는 학교 시스템 기준"
                    >
                      수강 중
                    </span>
                  )}
                  <span className="badge">{s.category}</span>
                  {s.online && <span className="badge blue">온라인</span>}
                  {s.cross && <span className="badge green">교차가능</span>}
                </div>
              </div>
              <h3>
                <button
                  className="link title-link"
                  onClick={() => go('courses/' + s.id)}
                >
                  {s.name}
                </button>
              </h3>
              <p>
                {s.dept} · {s.section}분반 · {s.credits}학점
                {s.year ? ` · ${yearLabel(s.year)}` : ''}
              </p>
              <p>
                {s.professor || '교수 미정'}
              </p>
              <dl className="course-facts">
                <div><dt>수업 방식</dt><dd>{deliveryLabel(s)}</dd></div>
                <div><dt>수업 시간</dt><dd>{slotsLabel(s)}</dd></div>
                <div><dt>강의실</dt><dd>{roomLabel(s) || '미기재'}</dd></div>
                {sourceDurationLabel(s) && <div><dt>원자료 시간 표기</dt><dd>{sourceDurationLabel(s)}</dd></div>}
              </dl>
              {s.online && roomLabel(s) && <p className="meta">온라인·강의실 병기: 실제 운영 방식 확인 필요</p>}
              {overlaps.length > 0 && !added && <p className="meta">시간 충돌: {overlaps.map((item) => item.name).join(', ')}</p>}
              <p className="meta">{reasons.length ? `추천 근거 · ${reasons.join(' · ')}` : '과목 탐색 결과 · 추천 근거 없음'}</p>
              <button className="secondary full" onClick={() => toggle(s)}>
                {added ? <Check size={17} /> : <Plus size={17} />}{' '}
                {added ? '계획에서 빼기' : '선택한 학기 계획에 담기'}
              </button>
            </article>
          );
        })}
      </div>
      {catalog && !filtered.length && (
        <div className="empty-small card">
          <p>조건에 맞는 과목이 없습니다.</p>
        </div>
      )}
      {catalog && filtered.length > LIMIT && (
        <p className="meta">
          상위 {LIMIT}개만 표시 · {filtered.length}개 결과를 검색으로 좁혀
          주세요.
        </p>
      )}
    </>
  );
}
