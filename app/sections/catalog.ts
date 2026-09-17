'use client';
import { useEffect, useState } from 'react';
import { resolveDept } from '@/lib/data/dept';
import { koreanMatch } from '@/lib/data/hangul';
import {
  conflicts,
  type Catalog,
  type CourseSection,
} from '@/lib/data/catalog';
import type { Data } from './data';

let cache: Promise<Catalog> | null = null;
function load() {
  cache ??= fetch('/api/courses')
    .then((r) => {
      if (!r.ok) throw new Error('catalog');
      return r.json() as Promise<Catalog>;
    })
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    load()
      .then((c) => on && setCatalog(c))
      .catch(() => on && setFailed(true));
    return () => {
      on = false;
    };
  }, []);
  return { catalog, failed };
}

/** 넓은 카테고리 그룹 (표시는 원본 이수구분 유지). */
export function catGroup(s: CourseSection) {
  if (s.category === '전필') return '전필';
  if (s.category === '전선' || s.category === 'MD전선') return '전선';
  if (s.category === '전기') return '전기';
  return '교양·일반';
}

export function deptMatches(a: string, b: string) {
  const na = a.replace(/\s+/g, '');
  const nb = b.replace(/\s+/g, '');
  return !!na && (na.includes(nb) || nb.includes(na));
}

/**
 * 프로필 학과명을 카탈로그 학과로 해석.
 * - 확정 → [해당 학과]
 * - 모호 → 후보 전체(학과 필터는 후보들로 적용)
 * - 매칭 실패 → null (학과 필터 비활성, 잘못된 결과 대신 전체 표시)
 */
export function deptPoolOf(
  deptInput: string,
  depts: string[],
): string[] | null {
  const r = resolveDept(deptInput, depts);
  if (r.dept) return [r.dept];
  if (r.candidates) return r.candidates;
  return null;
}

export function courseMatch(s: CourseSection, q: string) {
  return koreanMatch(`${s.name} ${s.professor} ${s.code} ${s.dept}`, q);
}

export type Rec = { section: CourseSection; score: number; reasons: string[] };
/**
 * 규칙 기반 추천 — 학과/학년/이수구분/설문 선호/시간 충돌만 사용.
 * 시간이 겹치거나 타학과 수강이 불가한 과목은 후보에서 제외한다.
 */
export function recommend(
  sections: CourseSection[],
  data: Data,
  planned: CourseSection[],
  limit = 6,
): Rec[] {
  const plannedIds = new Set(planned.map((p) => p.id));
  const plannedCodes = new Set(planned.map((p) => p.code));
  const completedCodes = new Set(
    (data.completed ?? []).map((c) => c.code),
  );
  const hasDept = !!data.dept && data.dept !== '소속 미입력';
  const pool = hasDept
    ? deptPoolOf(
        data.dept,
        [...new Set(sections.map((s) => s.dept))],
      )
    : null;
  // data.year은 입학연도(예: '2025') — 2026-2 기준 예상 학년으로 환산
  const admit = parseInt(data.year, 10);
  const grade = admit ? Math.min(Math.max(2026 - admit + 1, 1), 4) : 0;
  const recs: Rec[] = [];
  for (const s of sections) {
    if (
      plannedIds.has(s.id) ||
      plannedCodes.has(s.code) ||
      completedCodes.has(s.code)
    )
      continue;
    if (conflicts(s, planned).length) continue;
    const sameDept = pool ? pool.some((d) => deptMatches(s.dept, d)) : false;
    if (pool && !sameDept && !s.cross) continue;
    let score = 0;
    const reasons: string[] = [];
    if (sameDept) {
      score += 4;
      reasons.push('내 학과');
      if (s.category === '전필') {
        score += 3;
        reasons.push('전공필수');
      }
    }
    if (s.year === '전학년') {
      score += 1;
      reasons.push('전학년 대상');
    } else if (grade && s.year === String(grade)) {
      score += 2;
      reasons.push(`${grade}학년 과목`);
    }
    for (const p of data.prefs) {
      if (p === '오전' && s.slots.length && s.slots.every((sl) => sl.s < 720)) {
        score += 1;
        reasons.push('오전 수업');
      }
      if (
        p === '오후' &&
        s.slots.length &&
        s.slots.every((sl) => sl.s >= 780)
      ) {
        score += 1;
        reasons.push('오후 수업');
      }
      if (p === '금요일' && s.slots.some((sl) => sl.d === 4)) score -= 2;
      if (p === '월요일' && s.slots.some((sl) => sl.d === 0)) score -= 2;
    }
    if (!reasons.length) reasons.push('시간 겹침 없음');
    recs.push({ section: s, score, reasons });
  }
  recs.sort((a, b) => b.score - a.score);
  return recs.slice(0, limit);
}
