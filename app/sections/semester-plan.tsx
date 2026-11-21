'use client';
import { useMemo, useState } from 'react';
import { BookOpen, Bookmark, Plus } from 'lucide-react';
import { planBlockReason, useCourseHistory, useCurriculum, useCurriculumIndex, useEquivalents } from './catalog';
import { slotsLabel, type Catalog, type CourseSection } from '@/lib/data/catalog';
import { equivCodeIndex, majorLabel, pickCourseCandidate, pickCurriculumSemester, resolveWantedMajorNames } from '@/lib/data/curriculum';
import { findHistoryEntry, lastOfferedLabel, offeringLabel, suggestOfferingSemester } from '@/lib/data/course-history';
import { formatSemesterLabel } from '@/lib/data/graduation';
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
  // 자유 담기 — 로드맵 칩 밖의 과목(전선·교양·계절 과목)도 임의 학기에 담을 수 있다.
  // 교육과정은 입력창을 열 때만 불러온다(목록이 커서 지연 로드).
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const { snap: currIndex } = useCurriculumIndex();
  const admitYear = data.info?.admitYear ?? (data.year.trim() ? Number(data.year) : undefined);
  const { snap: curriculum } = useCurriculum(addOpen ? pickCurriculumSemester(admitYear, currIndex) : null);
  const deptInput = data.info?.dept ?? data.dept;
  const wishCandidates = useMemo(() => {
    const map = new Map<string, { code: string; name: string; credits: number }>();
    // 내 학과(패밀리 포함) 전공 과목을 상단에 — 1,400여 건 목록에서 발견성 확보
    const majorNames = Object.values(curriculum?.majors ?? {}).map((m) => majorLabel(m.name));
    const wanted = deptInput?.trim() ? resolveWantedMajorNames(deptInput, majorNames).wanted : null;
    const mine = new Set<string>();
    for (const major of Object.values(curriculum?.majors ?? {})) {
      const own = !!wanted?.has(majorLabel(major.name));
      for (const c of major.courses) {
        map.set(c.code, { code: c.code, name: c.name, credits: c.credits });
        if (own) mine.add(c.code);
      }
    }
    for (const s of catalog?.sections ?? [])
      map.set(s.code, { code: s.code, name: s.name, credits: s.credits });
    return [...map.values()].sort(
      (a, b) => Number(mine.has(b.code)) - Number(mine.has(a.code)) || a.name.localeCompare(b.name, 'ko'),
    );
  }, [catalog, curriculum, deptInput]);
  const equiv = useEquivalents();
  const { siblingCodes } = equivCodeIndex(equiv);
  const wishHint = (w: { code: string; name: string }) => {
    const entry = findHistoryEntry(history, w, siblingCodes);
    // 담아둔 학기가 개설 패턴과 어긋나면 경고 — '1학기 개설' 과목을 2학기에 두면 못 듣는다
    const term = semester?.slice(-1);
    const mismatch = !!entry && !!term && !entry.terms.includes(term);
    return {
      pattern: offeringLabel(entry),
      stale: lastOfferedLabel(entry, catalog?.semester),
      mismatch,
      entry,
    };
  };
  const removeWish = (w: (typeof wishes)[number]) => {
    if (!persist || !semester) return;
    const list = { ...data.semesterWishes };
    const next = wishes.filter((x) => x.code !== w.code);
    if (next.length) list[semester] = next;
    else delete list[semester];
    void persist({ ...data, semesterWishes: list }, `${w.name}을(를) 담아둔 과목에서 뺐어요`);
  };
  // 담아둔 학기가 개설 패턴과 어긋날 때 — 맞는 학기로 한 번에 옮긴다
  const moveWish = (w: (typeof wishes)[number], target: string) => {
    if (!persist || !semester) return;
    const list = { ...data.semesterWishes };
    const next = wishes.filter((x) => x.code !== w.code);
    if (next.length) list[semester] = next;
    else delete list[semester];
    list[target] = [...(list[target] ?? []).filter((x) => x.code !== w.code), w];
    void persist({ ...data, semesterWishes: list }, `${w.name}을(를) ${formatSemesterLabel(target)}로 옮겼어요`);
  };
  // 자유 담기 — 과목명·코드·'이름 (코드)' 형태로 고르고, 포함 검색이 1건면 그걸로 담는다
  const addWish = () => {
    if (!persist || !semester) return;
    const pick = pickCourseCandidate(wishCandidates, addQuery);
    if (!pick) {
      notify?.('일치하는 과목을 찾지 못했어요. 목록에서 골라 주세요.');
      return;
    }
    const list = { ...data.semesterWishes };
    const cur = list[semester] ?? [];
    if (cur.some((w) => w.code === pick!.code)) {
      notify?.('이미 이 학기에 담아둔 과목이에요');
      return;
    }
    list[semester] = [...cur, { code: pick.code, name: pick.name, credits: pick.credits }];
    void persist(
      { ...data, semesterWishes: list },
      `${pick.name}을(를) ${formatSemesterLabel(semester)}에 담아뒀어요`,
    );
    setAddQuery('');
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
      {!!semester && !!persist && (
        <section className="card detail plan">
          <div className="between">
            <span className="badge">담아둔 과목</span>
            {!!wishes.length && <span className="badge">{wishes.length}과목 · {wishCredits}학점</span>}
          </div>
          {wishes.map((w) => {
            const secs = isCurrent ? catalog!.sections.filter((s) => s.code === w.code) : [];
            const hint = wishHint(w);
            const moveTarget = hint.mismatch && !secs.length
              ? suggestOfferingSemester(hint.entry, semester, catalog?.semester)
              : null;
            return (
              <div className="event-line plan-wish" key={w.code}>
                <Bookmark />
                <div>
                  <b>{w.name}</b>
                  <small>
                    {w.credits}학점
                    {isCurrent && <> · {secs.length ? `${secs.length}개 분반 개설` : '이번 학기 미개설'}</>}
                    {hint.pattern && (
                      hint.mismatch && !secs.length
                        ? <> · <em className="track-warn">보통 {hint.pattern}</em></>
                        : <> · {hint.pattern}</>
                    )}
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
                {!!persist && !!moveTarget && (
                  <button className="secondary plan-wish-move" onClick={() => moveWish(w, moveTarget)}>
                    {formatSemesterLabel(moveTarget)}로 옮기기
                  </button>
                )}
                {!!persist && (
                  <button className="secondary" onClick={() => removeWish(w)}>
                    빼기
                  </button>
                )}
              </div>
            );
          })}
          {!wishes.length && (
            <p className="meta">지도의 로드맵 칩이나 아래에서 이 학기에 들을 과목을 담아두세요.</p>
          )}
          {addOpen ? (
            <div className="plan-wish-add">
              <input
                list={`wish-add-${semester}`}
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addWish(); }}
                placeholder="과목명 또는 코드"
                aria-label="담아둘 과목 검색"
              />
              <datalist id={`wish-add-${semester}`}>
                {wishCandidates.map((c) => (
                  <option key={c.code} value={`${c.name} (${c.code})`}>{c.name}</option>
                ))}
              </datalist>
              <button className="secondary" onClick={addWish}>담기</button>
              <button className="link" onClick={() => { setAddOpen(false); setAddQuery(''); }}>닫기</button>
            </div>
          ) : (
            <button className="link plan-wish-add-open" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> 과목 담기
            </button>
          )}
          {!isCurrent && (
            <p className="meta">{semLabel} 개설 자료가 나오면 분반을 고를 수 있어요.</p>
          )}
        </section>
      )}
    </>
  );
}
