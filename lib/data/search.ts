import { courseMatch, type Catalog } from './catalog.ts';
import { activityMatch, type Activity } from './activities.ts';
import type { ScheduleEvent } from './schedule.ts';
import type { LmsCourse } from './lms.ts';
import { koreanMatch } from './hangul.ts';

export type SearchHit = { label: string; route: string; sub: string };

/**
 * 자유질문용 학사일정 동의어 표 — 질의어 패턴이 맞으면 추가 제목 키워드로도
 * 매칭한다. 규칙 기반 확장이며 의미 검색이 아니다 (advisor 문구에 명시).
 */
const SCHED_ALIASES: [RegExp, string[]][] = [
  [/수강\s*신청|수강\s*정정|수강/, ['수강신청', '수강']],
  [/등록금|납부|등록/, ['등록', '납부']],
  [/휴학|복학/, ['휴학', '복학']],
  [/졸업|학위|학위수여/, ['졸업', '학위']],
  [/중간고사|중간|기말고사|기말|시험|평가/, ['중간', '기말', '시험', '평가']],
  [/개강/, ['개강']],
  [/방학|계절학기|계절/, ['방학', '계절']],
  [/성적/, ['성적']],
];

function schedMatch(e: ScheduleEvent, q: string): boolean {
  if (koreanMatch(e.title, q)) return true;
  for (const [pat, terms] of SCHED_ALIASES) {
    if (pat.test(q) && terms.some((t) => koreanMatch(e.title, t))) return true;
  }
  return false;
}

/**
 * advisor 자유질문 통합 검색 — 과목(cap 4) → 활동(합산 cap 6) → 공식
 * 학사일정(합산 cap 8) → LMS 수강 과목(합산 cap 10) 순. 스냅샷이 없으면
 * 해당 그룹은 건너뛴다.
 */
export function searchAll(
  q: string,
  catalog: Catalog | null,
  acts: Activity[] | null,
  sched: ScheduleEvent[] | null,
  lms: LmsCourse[] | null = null,
): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const s of catalog?.sections ?? []) {
    if (hits.length >= 4) break;
    if (courseMatch(s, q))
      hits.push({
        label: s.name,
        route: 'courses/' + s.id,
        sub: `${s.dept} · ${s.credits}학점 · ${s.category}`,
      });
  }
  for (const a of acts ?? []) {
    if (hits.length >= 6) break;
    if (activityMatch(a, q, koreanMatch))
      hits.push({
        label: a.title,
        route: 'activities/' + a.id,
        sub: `${a.dept} · ${a.statusLabel}`,
      });
  }
  for (const e of sched ?? []) {
    if (hits.length >= 8) break;
    if (schedMatch(e, q))
      hits.push({
        label: e.title,
        route: 'calendar/' + e.id,
        sub: `공식 학사일정 · ${e.start}${e.end && e.end !== e.start ? ` ~ ${e.end}` : ''}`,
      });
  }
  for (const c of lms ?? []) {
    if (hits.length >= 10) break;
    if (koreanMatch(c.title, q))
      hits.push({
        label: c.title,
        route: 'lms',
        sub: `COSMOS 수업 현황 · 수강 중${c.prof ? ` · ${c.prof}` : ''}`,
      });
  }
  return hits;
}
