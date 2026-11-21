'use client';
import { useMemo, useState } from 'react';
import { BookOpen, Bookmark, Plus } from 'lucide-react';
import { planBlockReason, useCourseHistory, useCurriculum, useCurriculumIndex, useEquivalents } from './catalog';
import { conflicts, slotsLabel, type Catalog, type CourseSection } from '@/lib/data/catalog';
import { buildRequiredTrack, equivCodeIndex, majorLabel, pickCourseCandidate, pickCurriculumSemester, resolveWantedMajorNames } from '@/lib/data/curriculum';
import { findHistoryEntry, lastOfferedLabel, offeringLabel, suggestOfferingSemester } from '@/lib/data/course-history';
import { mergeCompleted } from '@/lib/data/info';
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
  // 계획 내 시간 겹침 쌍 — 추가 시점엔 막지만 과거 저장분·분반 변경으로 남을 수 있다
  const clashCount = planned.reduce((n, s, i) => n + conflicts(s, planned.slice(0, i)).length, 0);
  const semNames: Record<string, string> = { 3: '여름', 4: '겨울' };
  const semLabel = semester
    ? semester.replace(/(\d{4})-(\d)/, (_, y, n) => `${y}학년도 ${semNames[n] ?? n}학기`)
    : '학기 미지정';
  // 졸업 지도 로드맵에서 담아둔 과목 — 해당 학기가 오면 분반으로 옮긴다
  const wishes = semester ? (data.semesterWishes?.[semester] ?? []) : [];
  const isCurrent = !!catalog && !!semester && catalog.semester === semester;
  // 지나간 학기에 남은 위시는 이행이 끝난 기록 — 개설 경고 대신 정리 액션을 둔다
  const isPast = !!catalog && !!semester && semester < catalog.semester;
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
  const doneCodes = useMemo(
    () => new Set(mergeCompleted(data.completed, data.info?.completed).map((c) => c.code)),
    [data.completed, data.info?.completed],
  );
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
    // 미이수 내 학과 → 미이수 나머지 → 이수 완료(재수강 대상이라 남기되 하단)
    return [...map.values()].sort(
      (a, b) =>
        Number(doneCodes.has(a.code)) - Number(doneCodes.has(b.code)) ||
        Number(mine.has(b.code)) - Number(mine.has(a.code)) ||
        a.name.localeCompare(b.name, 'ko'),
    );
  }, [catalog, curriculum, deptInput, doneCodes]);
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
  // 지난 학기에 남은 위시를 한 번에 비운다 — 옮길 수 있는 건 '옮기기'로 먼저 살린다
  const clearPastWishes = () => {
    if (!persist || !semester) return;
    const list = { ...data.semesterWishes };
    delete list[semester];
    void persist({ ...data, semesterWishes: list }, '지난 학기에 담아둔 과목을 비웠어요');
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
  // 자유 담기 — 과목명·코드·'이름 (코드)' 형태로 고르거나 필수 칩으로 바로 담는다
  const addWish = (direct?: { code: string; name: string; credits: number }) => {
    if (!persist || !semester) return;
    const pick = direct ?? pickCourseCandidate(wishCandidates, addQuery);
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
    // 한 과목은 한 학기에만 — 다른 학기에 있으면 중복 대신 위치를 알린다
    const elsewhere = Object.entries(list).find(
      ([s, ws]) => s !== semester && ws.some((w) => w.code === pick!.code),
    );
    if (elsewhere) {
      notify?.(`이미 ${formatSemesterLabel(elsewhere[0])}에 담아둔 과목이에요`);
      return;
    }
    list[semester] = [...cur, { code: pick.code, name: pick.name, credits: pick.credits }];
    void persist(
      { ...data, semesterWishes: list },
      `${pick.name}을(를) ${formatSemesterLabel(semester)}에 담아뒀어요`,
    );
    setAddQuery('');
  };
  // 위시별 힌트·옮기기 대상을 한 번만 계산 — 개별·일괄 옮기기가 공유
  const wishRows = wishes.map((w) => {
    const done = doneCodes.has(w.code);
    const secs = !done && isCurrent ? catalog!.sections.filter((s) => s.code === w.code) : [];
    const hint = wishHint(w);
    // 이수 완료 과목은 개설 패턴 경고·옮기기 제안이 무의미하다
    const moveTarget = !done && hint.mismatch && !secs.length
      ? suggestOfferingSemester(hint.entry, semester, catalog?.semester)
      : null;
    return { w, done, secs, hint, moveTarget };
  });
  // 담기 폼이 열렸을 때 미이수 필수를 바로 담기 칩으로 — 졸업 지도와 같은 트랙 규칙
  const missingRequired = useMemo(() => {
    if (!addOpen || !curriculum || !deptInput?.trim()) return [];
    const track = buildRequiredTrack({
      curriculum,
      deptInput,
      completed: mergeCompleted(data.completed, data.info?.completed),
      plannedCodes: new Set(planned.map((s) => s.code)),
      offeredCodes: new Set(catalog?.sections.map((s) => s.code) ?? []),
      equiv,
      history,
      failed: [...(data.failedCourses ?? []), ...(data.info?.failedCourses ?? [])],
    });
    const wishedAnywhere = new Set(
      Object.values(data.semesterWishes ?? {}).flat().map((w) => w.code),
    );
    const out: { code: string; name: string; credits: number; offered: boolean }[] = [];
    for (const g of track.groups)
      for (const c of g.courses)
        if (c.status === 'missing' && !wishedAnywhere.has(c.code))
          out.push({ code: c.code, name: c.name, credits: c.credits, offered: c.offered });
    // 현재 학기를 볼 때는 지금 열린 필수를 먼저 — 바로 수강할 수 있는 과목 우선
    if (isCurrent) out.sort((a, b) => Number(b.offered) - Number(a.offered));
    return out.slice(0, 4);
  }, [addOpen, curriculum, deptInput, data, planned, catalog, equiv, history, isCurrent]);
  // 현재 학기 담아둔 과목의 실제 개설 요약 — 수강신청 전 확인 배너
  const openedCount = isCurrent ? wishRows.filter((r) => r.secs.length > 0).length : 0;
  const unopenedCount = isCurrent ? wishRows.filter((r) => !r.done && !r.secs.length).length : 0;
  const moveableCount = wishRows.filter((r) => r.moveTarget).length;
  // 개설 패턴과 어긋난 위시 전부를 맞는 학기로 한 번에 옮긴다
  const moveAllWishes = () => {
    if (!persist || !semester) return;
    const list = { ...data.semesterWishes };
    let rest = [...(list[semester] ?? [])];
    for (const { w, moveTarget } of wishRows) {
      if (!moveTarget) continue;
      rest = rest.filter((x) => x.code !== w.code);
      list[moveTarget] = [...(list[moveTarget] ?? []).filter((x) => x.code !== w.code), w];
    }
    if (rest.length) list[semester] = rest;
    else delete list[semester];
    void persist(
      { ...data, semesterWishes: list },
      `개설 학기에 맞게 ${moveableCount}과목을 옮겼어요`,
    );
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
        {clashCount > 0 && (
          <p className="meta">
            <em className="track-warn">시간이 겹치는 분반 {clashCount}쌍</em>
            {' '}· <button type="button" className="track-wish-move" onClick={() => go('timetable')}>시간표에서 확인</button>
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
          {isCurrent && !!wishes.length && (
            <p className="meta plan-wish-status">
              이번 학기 개설 {openedCount}과목
              {unopenedCount > 0 && <> · <em className="track-warn">미개설 {unopenedCount}과목</em></>}
            </p>
          )}
          {isPast && !!wishes.length && (
            <p className="meta plan-wish-status">
              지난 학기에 담아둔 과목이에요
              {!!persist && <> · <button type="button" className="track-wish-move" onClick={clearPastWishes}>모두 비우기</button></>}
            </p>
          )}
          {wishRows.map(({ w, done, secs, hint, moveTarget }) => {
            return (
              <div className="event-line plan-wish" key={w.code}>
                <Bookmark />
                <div>
                  <b>{w.name}</b>
                  <small>
                    {w.credits}학점
                    {done
                      ? <> · 이수 완료</>
                      : isPast
                        ? <> · 지난 학기</>
                        : <>
                          {isCurrent && <> · {secs.length ? `${secs.length}개 분반 개설` : '이번 학기 미개설'}</>}
                          {hint.pattern && (
                            hint.mismatch && !secs.length
                              ? <> · <em className="track-warn">보통 {hint.pattern}</em></>
                              : <> · {hint.pattern}</>
                          )}
                          {hint.stale && <> · <em className="track-warn">{hint.stale}</em></>}
                        </>}
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
          {moveableCount > 1 && (
            <button className="secondary plan-wish-moveall" onClick={moveAllWishes}>
              개설 학기에 맞게 {moveableCount}과목 모두 옮기기
            </button>
          )}
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
              <button className="secondary" onClick={() => addWish()}>담기</button>
              <button className="link" onClick={() => { setAddOpen(false); setAddQuery(''); }}>닫기</button>
            </div>
          ) : (
            <button className="link plan-wish-add-open" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> 과목 담기
            </button>
          )}
          {addOpen && !!missingRequired.length && (
            <div className="plan-wish-req">
              <span className="meta">아직 안 들은 필수</span>
              <span className="plan-wish-secs">
                {missingRequired.map((c) => (
                  <button key={c.code} type="button" className="track-chip" onClick={() => addWish(c)}>
                    {c.name}{isCurrent && c.offered ? ' · 개설' : ''}
                  </button>
                ))}
              </span>
            </div>
          )}
          {!isCurrent && (
            <p className="meta">{semLabel} 개설 자료가 나오면 분반을 고를 수 있어요.</p>
          )}
        </section>
      )}
    </>
  );
}
