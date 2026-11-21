'use client';
import { BookOpen, Bookmark, Plus } from 'lucide-react';
import { planBlockReason, useCourseHistory, useEquivalents } from './catalog';
import { slotsLabel, type Catalog, type CourseSection } from '@/lib/data/catalog';
import { equivCodeIndex } from '@/lib/data/curriculum';
import { lastOfferedLabel, offeringLabel } from '@/lib/data/course-history';
import type { Data } from './data';

export function SemesterPlan({
  data,
  planned,
  plan,
  go,
  semester,
  catalog,
  persist,
  notify,
}: {
  data: Data;
  planned: CourseSection[];
  plan: (id: string) => void;
  go: (route: string) => void;
  semester?: string;
  catalog: Catalog | null;
  persist?: (draft: Data, msg?: string) => Promise<boolean>;
  notify?: (msg: string) => void;
}) {
  const credits = planned.reduce((n, s) => n + s.credits, 0);
  const semNames: Record<string, string> = { 3: '여름', 4: '겨울' };
  const semLabel = semester
    ? semester.replace(/(\d{4})-(\d)/, (_, y, n) => `${y}학년도 ${semNames[n] ?? n}학기`)
    : '학기 미지정';
  // 졸업 지도 로드맵에서 담아둔 과목 — 해당 학기가 오면 분반으로 옮긴다
  const wishes = semester ? (data.semesterWishes?.[semester] ?? []) : [];
  const isCurrent = !!catalog && !!semester && catalog.semester === semester;
  const wishCredits = wishes.reduce((n, w) => n + w.credits, 0);
  // 개설 이력 — 미래 학기에 담아둔 과목이 실제 그 학기에 열리는지 패턴으로 힌트
  const history = useCourseHistory(wishes.length > 0);
  const equiv = useEquivalents();
  const { siblingCodes } = equivCodeIndex(equiv);
  const wishHint = (code: string) => {
    const entry = [code, ...siblingCodes(code)]
      .map((c) => history?.courses[c])
      .find(Boolean);
    return { pattern: offeringLabel(entry), stale: lastOfferedLabel(entry, catalog?.semester) };
  };
  const removeWish = (w: (typeof wishes)[number]) => {
    if (!persist || !semester) return;
    const list = { ...data.semesterWishes };
    const next = wishes.filter((x) => x.code !== w.code);
    if (next.length) list[semester] = next;
    else delete list[semester];
    void persist({ ...data, semesterWishes: list }, `${w.name}을(를) 담아둔 과목에서 뺐어요`);
  };
  return (
    <>
      <section className="card detail plan">
        <div className="between">
          <span className="badge purple">개인 계획</span>
          <span className="badge">공식 수강신청 아님</span>
        </div>
        <h2>{semLabel} 계획</h2>
        <div className="plan-summary">
          <div>
            <strong>{credits}</strong>
            <span>계획 학점</span>
          </div>
          <div>
            <strong>{planned.length}</strong>
            <span>담은 과목</span>
          </div>
          <div>
            <strong>
              {new Set(
                planned.flatMap((s) => s.slots.map((sl) => sl.d)),
              ).size || 0}
            </strong>
            <span>등교 요일</span>
          </div>
        </div>
        <p>계획 학점은 이수학점에 포함되지 않습니다.</p>
        {credits > 21 && (
          <p className="meta">
            계획 {credits}학점 — 학기 수강 상한을 넘었을 수 있어요.
          </p>
        )}
        {planned.map((s) => (
          <div className="event-line" key={s.id}>
            <BookOpen />
            <div>
              <b>{s.name}</b>
              <small>
                {s.dept} · {s.section}분반 · {slotsLabel(s)}
              </small>
            </div>
            <span className="badge">
              {s.category} · {s.credits}학점
            </span>
            <button className="secondary" onClick={() => plan(s.id)}>
              제거
            </button>
          </div>
        ))}
        {!planned.length && (
          <p className="empty-small">아직 계획한 과목이 없어요.</p>
        )}
        <button className="primary" onClick={() => go('timetable')}>
          시간표에서 확인·담기 <Plus size={17} />
        </button>
      </section>
      {!!wishes.length && (
        <section className="card detail plan">
          <div className="between">
            <span className="badge">담아둔 과목</span>
            <span className="badge">{wishes.length}과목 · {wishCredits}학점</span>
          </div>
          {wishes.map((w) => {
            const secs = isCurrent ? catalog!.sections.filter((s) => s.code === w.code) : [];
            const hint = wishHint(w.code);
            return (
              <div className="event-line plan-wish" key={w.code}>
                <Bookmark />
                <div>
                  <b>{w.name}</b>
                  <small>
                    {w.credits}학점
                    {isCurrent && <> · {secs.length ? `${secs.length}개 분반 개설` : '이번 학기 미개설'}</>}
                    {hint.pattern && <> · {hint.pattern}</>}
                    {hint.stale && <> · <em className="track-warn">{hint.stale}</em></>}
                  </small>
                  {!!secs.length && (
                    <span className="plan-wish-secs">
                      {secs.map((s) => {
                        const inPlan = planned.some((p) => p.id === s.id);
                        return (
                          <button
                            key={s.id}
                            className={`track-chip${inPlan ? ' on' : ''}`}
                            aria-pressed={inPlan}
                            onClick={() => {
                              if (inPlan) { plan(s.id); return; }
                              const blocked = planBlockReason(s, data, planned);
                              if (blocked) { notify?.(blocked); return; }
                              plan(s.id);
                            }}
                          >
                            {s.section}분반 {slotsLabel(s)}
                          </button>
                        );
                      })}
                    </span>
                  )}
                </div>
                {!!persist && (
                  <button className="secondary" onClick={() => removeWish(w)}>
                    빼기
                  </button>
                )}
              </div>
            );
          })}
          {!isCurrent && (
            <p className="meta">{semLabel} 개설 자료가 나오면 분반을 고를 수 있어요.</p>
          )}
        </section>
      )}
    </>
  );
}
