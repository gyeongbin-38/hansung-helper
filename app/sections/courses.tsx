'use client';
import { useMemo, useState } from 'react';
import { BookOpen, Check, Plus, Search } from 'lucide-react';
import {
  conflicts,
  slotsLabel,
  type Catalog,
  type CourseSection,
} from '@/lib/data/catalog';
import { catGroup, courseMatch, deptMatches } from './catalog';
import { resolveDept } from '@/lib/data/dept';
import type { Data } from './data';

const LIMIT = 60;

export function Courses({
  data,
  plan,
  catalog,
  failed,
  notify,
}: {
  data: Data;
  plan: (id: string) => void;
  catalog: Catalog | null;
  failed?: boolean;
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
  const filtered = useMemo(() => {
    if (!catalog) return [];
    const pool = myDeptRes.dept
      ? [myDeptRes.dept]
      : (myDeptRes.candidates ?? null);
    return catalog.sections.filter((s) => {
      const deptOk = !dept
        ? !myDept || !pool || pool.some((d) => deptMatches(s.dept, d))
        : dept === '전체'
          ? true
          : s.dept === dept;
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
  }, [catalog, q, dept, cat, day, band, myDept, myDeptRes]);
  const plannedSecs = useMemo(
    () =>
      (catalog?.sections ?? []).filter((s) => data.planned.includes(s.id)),
    [catalog, data.planned],
  );
  function toggle(s: CourseSection) {
    if (data.planned.includes(s.id)) return plan(s.id);
    if (data.completed.some((c) => c.code === s.code)) {
      notify?.('이미 이수한 과목입니다. 이수 내역은 졸업요건에서 관리하세요.');
      return;
    }
    const dup = plannedSecs.find((p) => p.code === s.code);
    if (dup) {
      notify?.(
        `같은 과목의 ${dup.section}분반이 이미 담겨 있습니다. 시간표에서 분반을 변경하세요.`,
      );
      return;
    }
    const hits = conflicts(s, plannedSecs);
    if (hits.length) {
      notify?.(
        `시간이 겹칩니다: ${hits
          .map((h) => h.name)
          .slice(0, 2)
          .join(', ')}`,
      );
      return;
    }
    plan(s.id);
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
          '개설강의 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
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
      {!dept && myDept && !myDeptRes.dept && (
        <p className="meta">
          {myDeptRes.candidates
            ? `학과 매칭 확인 필요 — '${myDept}' 후보: ${myDeptRes.candidates.join(' · ')}`
            : `학과 매칭 확인 필요 — '${myDept}'을(를) 카탈로그 학과에서 찾지 못했습니다. 전체 학과를 표시합니다.`}
        </p>
      )}
      <div className="cards">
        {filtered.slice(0, LIMIT).map((s, i) => {
          const added = data.planned.includes(s.id);
          return (
            <article className="card pad course" key={s.id}>
              <div className="between course-head">
                <span className={'course-mark cm' + (i % 5)}>
                  <BookOpen size={18} />
                </span>
                <div className="course-badges">
                  {added && <span className="badge purple">계획에 담김</span>}
                  <span className="badge">{s.category}</span>
                  {s.online && <span className="badge blue">온라인</span>}
                  {s.cross && <span className="badge green">교차가능</span>}
                </div>
              </div>
              <h3>{s.name}</h3>
              <p>
                {s.dept} · {s.section}분반 · {s.credits}학점
                {s.year ? ` · ${s.year}학년` : ''}
              </p>
              <p>
                {s.professor || '교수 미정'} · {slotsLabel(s)}
              </p>
              <small>{s.room || '강의실 미정'}</small>
              <button className="secondary full" onClick={() => toggle(s)}>
                {added ? <Check size={17} /> : <Plus size={17} />}{' '}
                {added ? '계획에서 빼기' : '다음 학기 계획에 담기'}
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
