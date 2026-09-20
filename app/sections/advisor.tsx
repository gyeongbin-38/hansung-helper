'use client';
import { useState } from 'react';
import { Sparkles, Search } from 'lucide-react';
import type { Data } from './data';
import { useActivities, useSchedule } from './catalog';
import {
  conflicts,
  semesterStartTs,
  type Catalog,
  type CourseSection,
} from '@/lib/data/catalog';
import { liveStatus, type Activity } from '@/lib/data/activities';
import { searchAll, type SearchHit } from '@/lib/data/search';
import {
  currentSemesterStart,
  dueSoon,
  pendingTasks,
} from '@/lib/data/lms';

function planAnswer(data: Data, planned: CourseSection[]) {
  if (!planned.length)
    return '아직 계획에 담긴 과목이 없습니다. 과목 추천이나 시간표 짜기에서 2026-2 개설 과목을 담아 보세요.';
  const credits = planned.reduce((n, s) => n + s.credits, 0);
  const clashing = planned.filter((s) => conflicts(s, planned).length);
  const untimed = planned.filter((s) => s.untimed || !s.slots.length);
  let out = `현재 계획: ${planned.length}개 과목 · ${credits}학점. `;
  if (clashing.length)
    out += `시간이 겹치는 과목이 ${clashing.length}개 있습니다 — 시간표에서 조정하세요. `;
  if (untimed.length)
    out += `시간 미정 과목 ${untimed.length}개는 시간표 아래 트레이에 있습니다. `;
  if (!clashing.length && !untimed.length)
    out += '시간 겹침 없이 구성되어 있습니다. ';
  return out + '실제 수강신청은 학교 시스템에서 진행하세요.';
}

function gradAnswer(data: Data) {
  const missing: string[] = [];
  if (!data.dept || data.dept === '소속 미입력') missing.push('소속 학과');
  if (!data.year) missing.push('입학연도');
  if (!(data.completed ?? []).length) missing.push('이수 완료 과목');
  if (missing.length)
    return `졸업 판정에 필요한 정보가 비어 있습니다: ${missing.join(', ')}. 내 정보에서 입력하면 졸업요건 화면이 계산을 시작합니다. 적용 규정 자체는 학교 종합정보시스템에서 확인하세요.`;
  return '입력된 이수 정보를 바탕으로 졸업요건 화면에서 진행률을 계산 중입니다. 적용 규정은 학과·입학연도별로 달라질 수 있으니 공식 규정도 함께 확인하세요.';
}

/** COSMOS 수집 스냅샷 기준 이번 주 마감 요약 — 수집 시점 데이터임을 명시한다.
 *  지난 학기 항목은 학기 경계(catalog 학기 우선, 없으면 현재 시각 추정)로 제외 */
function weekAnswer(data: Data, catalog: Catalog | null) {
  const snap = data.lms;
  if (!snap)
    return 'COSMOS 수업 현황이 없어 이번 주 마감을 모을 수 없습니다. 수업 현황 화면에서 연결하면 강의·과제·퀴즈 마감을 한 번에 보여드립니다.';
  const now = Date.now();
  const before =
    (catalog?.semester ? semesterStartTs(catalog.semester) : null) ??
    currentSemesterStart(now);
  const due = dueSoon(snap, now, 7, 7, before);
  const uncertain = pendingTasks(snap, before).filter(
    (t) => t.uncertain,
  ).length;
  const suffix = uncertain
    ? ` 응시 여부를 확인하지 못한 퀴즈 ${uncertain}건은 COSMOS에서 직접 확인해 보세요.`
    : '';
  if (!due.length)
    return `이번 주 안에 마감하는 강의·과제·퀴즈가 없습니다. (${snap.fetchedAt ? snap.fetchedAt.slice(0, 10) : '수집일 미상'} 수집 기준)` + suffix;
  const top = due
    .slice(0, 5)
    .map((t) => `${t.course} ${t.kind} "${t.title}"(${t.due ?? '마감 미기재'})`)
    .join(' / ');
  return (
    `이번 주 마감 ${due.length}건 — ${top}${due.length > 5 ? ` 외 ${due.length - 5}건` : ''}. ` +
    `수집일 ${snap.fetchedAt ? snap.fetchedAt.slice(0, 10) : '미상'} 기준이며, 전체 목록은 수업 현황에서 확인하세요.` +
    suffix
  );
}

function actAnswer(items: Activity[] | null, failed: boolean) {
  if (failed)
    return '비교과 목록을 불러오지 못했습니다. 잠시 후 다시 시도하거나 hsportal 공식 목록에서 직접 확인하세요.';
  if (!items)
    return '비교과 목록을 불러오는 중입니다. 잠시 후 다시 확인해 주세요.';
  // 스냅샷 상태 문자열이 아니라 신청 기간+현재 시각으로 재계산한다
  const now = Date.now();
  const open = items.filter((a) => {
    const st = liveStatus(a, now).status;
    return st === 'open' || st === 'closing';
  }).length;
  const soon = items.filter(
    (a) => liveStatus(a, now).status === 'upcoming',
  ).length;
  return `지금 신청 가능한 비교과 ${open}개, 접수 예정 ${soon}개가 있습니다 (hsportal ${'공식 목록'} 기준). 비교과·대외활동 화면에서 저장하거나 공고로 이동할 수 있습니다.`;
}

export function Advisor({
  data,
  planned,
  catalog,
  go,
}: {
  data: Data;
  planned: CourseSection[];
  catalog: Catalog | null;
  go: (route: string) => void;
}) {
  const { snap, failed: actsFailed } = useActivities();
  const { snap: sched } = useSchedule();
  const [answer, setAnswer] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [q, setQ] = useState('');

  const ask = (kind: string) => {
    setHits([]);
    setAnswer(
      kind === 'grad'
        ? gradAnswer(data)
        : kind === 'plan'
          ? planAnswer(data, planned)
          : kind === 'week'
            ? weekAnswer(data, catalog)
            : actAnswer(snap?.items ?? null, actsFailed),
    );
  };

  const askFree = () => {
    const query = q.trim();
    if (!query) return;
    const found = searchAll(
      query,
      catalog,
      snap?.items ?? null,
      sched?.items ?? null,
      data.lms?.courses ?? null,
      Date.now(),
    );
    setHits(found);
    setAnswer(
      found.length
        ? `'${query}' 관련 항목을 ${found.length}개 찾았습니다.`
        : `'${query}'에 맞는 과목·활동·학사일정·수업 항목을 찾지 못했습니다. 다른 키워드로 검색해 보세요.`,
    );
  };

  return (
    <section className="card advisor">
      <span className="ai-mark">
        <Sparkles size={30} />
      </span>
      <h2>다음 선택, 함께 정리해 볼까요?</h2>
      <p>
        사이트에 저장된 내 정보와 공식 수집 데이터를 바탕으로 답하는 규칙
        기반 안내입니다. AI 생성 답변이 아니며, 판정·신청은 학교 시스템이
        담당합니다.
      </p>
      <div className="chips">
        {[
          ['졸업요건은 어디서 확인해?', 'grad'],
          ['다음 학기 계획을 세우고 싶어', 'plan'],
          ['이번 주에 뭐 해야 해?', 'week'],
          ['비교과 활동을 찾고 싶어', 'act'],
        ].map(([label, kind]) => (
          <button
            className="secondary"
            key={kind}
            onClick={() => ask(kind)}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="event-form"
        onSubmit={(e) => {
          e.preventDefault();
          askFree();
        }}
      >
        <input
          className="field"
          placeholder="묻고 싶은 것을 입력 (예: 튜터링, 알고리즘 과제 언제까지)"
          aria-label="자유 질문"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={60}
        />
        <button className="primary">
          <Search size={16} /> 묻기
        </button>
      </form>
      {answer && (
        <div className="answer" aria-live="polite">
          <p>{answer}</p>
          {hits.length > 0 && (
            <ul className="answer-hits">
              {hits.map((h, i) => (
                <li key={h.label + h.route + i}>
                  <button className="link" onClick={() => go(h.route)}>
                    {h.label}
                  </button>
                  <small>{h.sub}</small>
                </li>
              ))}
            </ul>
          )}
          <small>
            근거: 내 계획·입력 정보 + 2026-2 개설과목·hsportal 수집 목록
            {data.lms ? '·COSMOS 수업 현황' : ''} · AI 생성 답변 아님
          </small>
        </div>
      )}
      <div className="actions">
        <button className="link" onClick={() => go('graduation')}>
          졸업요건 →
        </button>
        <button className="link" onClick={() => go('semester-plan')}>
          학기별 계획 →
        </button>
      </div>
    </section>
  );
}
