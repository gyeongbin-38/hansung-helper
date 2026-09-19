import { courseMatch, type Catalog } from './catalog.ts';
import { activityMatch, type Activity } from './activities.ts';
import type { ScheduleEvent } from './schedule.ts';
import { parseDue, type LmsCourse } from './lms.ts';
import { koreanMatch } from './hangul.ts';

export type SearchHit = { label: string; route: string; sub: string };

/** 질의 속 종류 단어 → LMS 항목 종류 필터 ('과제 언제까지' → 과제만) */
const KIND_WORDS: [RegExp, '강의' | '과제' | '퀴즈'][] = [
  [/과제|숙제|assign/i, '과제'],
  [/퀴즈|쪽지시험|quiz/i, '퀴즈'],
  [/강의|동영상|영상|vod|수업/i, '강의'],
];

/** 토큰 끝의 질문형 어미·조사를 벗긴다 — '알고리즘은' → '알고리즘'.
 *  결과가 2자 미만이면 벗기지 않는다('미니' → '미' 방지). */
const TRAIL =
  /(인가요|인가|인지|언제까지|언제|까지|부터|으로는|으로|에는|에서|에게|한테|습니까|나요|이다|이야|해줘|해야|알려|보여|줘|뭐|있어|있나|있니|어디|어떻게|은|는|이|가|을|를|의|에|도|만|과|와|랑|하고|야|임|요|니|음)+$/;

const stripToken = (w: string) => {
  const out = w.replace(TRAIL, '');
  // 전부 벗겨진 순수 질문어는 빈 토큰으로, 1자만 남으면 과도 절단이므로 원형 유지
  return out === '' || out.length >= 2 ? out : w;
};

/** 마감·기한 질의어 — 종류 지정 없이 "마감 있는 모든 항목" 의도로 본다 */
const DEADLINE_RE = /마감|데드라인|기한|제출일?/;

/** LMS 개별 항목(강의·과제·퀴즈) 검색 — '알고리즘 과제 언제까지' 같은
 *  자유질문에서 마감 단위까지 찾는다. 미완료 항목을 먼저, 마감 빠른 순. */

export function lmsTaskSearch(lms: LmsCourse[], q: string): SearchHit[] {
  const kinds = KIND_WORDS.filter(([re]) => re.test(q)).map(([, k]) => k);
  const tokens = q
    .split(/\s+/)
    .map(stripToken)
    .filter(Boolean)
    .filter((w) => !KIND_WORDS.some(([re]) => re.test(w)))
    .filter((w) => !DEADLINE_RE.test(w));
  const taskIntent = kinds.length > 0 || DEADLINE_RE.test(q);
  if (!taskIntent && !tokens.length) return [];
  type Row = {
    hit: SearchHit;
    done: boolean;
    due: string | null;
  };
  const rows: Row[] = [];
  for (const c of lms) {
    const items: {
      kind: '강의' | '과제' | '퀴즈';
      title: string;
      due: string | null;
      done: boolean;
      uncertain?: boolean;
    }[] = [
      ...c.vods.map((v) => ({
        kind: '강의' as const,
        title: v.title,
        due: v.range ?? null,
        done: v.attended,
      })),
      ...c.assigns.map((a) => ({
        kind: '과제' as const,
        title: a.title,
        due: a.due ?? null,
        done: a.submitted,
      })),
      ...c.quizzes.map((t) => ({
        kind: '퀴즈' as const,
        title: t.title,
        due: t.due ?? null,
        done: t.submitted,
        uncertain: t.uncertain,
      })),
    ];
    for (const t of items) {
      if (kinds.length && !kinds.includes(t.kind)) continue;
      if (
        tokens.length &&
        !tokens.every((w) => koreanMatch(`${c.title} ${t.title}`, w))
      )
        continue;
      const state = t.done
        ? '완료'
        : t.uncertain
          ? '응시 여부 확인 실패'
          : '미완료';
      rows.push({
        done: t.done,
        due: t.due,
        hit: {
          label: t.title,
          route: 'lms/' + c.id,
          sub: `COSMOS ${t.kind} · ${c.title} · ${state}${t.due ? ` · 마감 ${t.due}` : ''}`,
        },
      });
    }
  }
  // 미완료 먼저, 그 안에서 마감(범위면 끝 날짜) 빠른 순 — 마감 미기재는 뒤로
  return rows
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        (parseDue(a.due) ?? Infinity) - (parseDue(b.due) ?? Infinity),
    )
    .map((r) => r.hit);
}

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
 * 학사일정(합산 cap 8) → LMS 개별 항목(합산 cap 10) → LMS 수강 과목
 * (합산 cap 12) 순. 스냅샷이 없으면 해당 그룹은 건너뛴다.
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
  for (const h of lmsTaskSearch(lms ?? [], q)) {
    if (hits.length >= 10) break;
    hits.push(h);
  }
  for (const c of lms ?? []) {
    if (hits.length >= 12) break;
    if (koreanMatch(c.title, q))
      hits.push({
        label: c.title,
        route: 'lms/' + c.id,
        sub: `COSMOS 수업 현황 · 수강 중${c.prof ? ` · ${c.prof}` : ''}`,
      });
  }
  return hits;
}
