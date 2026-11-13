import { actScore, liveStatus, type Activity } from './activities.ts';

/**
 * 목표 역량 버킷 — 공개 목록에는 역량 태그가 없으므로 제목·운영 부서의
 * 키워드로 근사한다. 실제 역량 인정 여부는 학교 기준을 따른다.
 */
export const COMPETENCY_GOALS = [
  { id: 'career', label: '취업·진로', hint: '채용·직무·실무',
    match: /취업|진로|직무|채용|인턴|면접|이력|기업|박람회|실무|커리어/ },
  { id: 'global', label: '글로벌·어학', hint: '해외·영어·국제 교류',
    match: /글로벌|글로컬|해외|국제|어학|English|영어|외국|유학|교환|Culture Competition/ },
  { id: 'creative', label: '창의·도전', hint: '공모전·프로젝트·대회',
    match: /공모|대회|경진|해커톤|아이디어|창업|캡스톤|챌린지|콘테스트|Competition|빌더|메이커/ },
  { id: 'comm', label: '소통·협업', hint: '팀·멘토링·모임',
    match: /소모임|멘토|튜터|모임|커뮤니티|토론|간담회|만남|네트워|스터디|칼럼|방송|신문|TED|나눔|북리뷰|독서/ },
  { id: 'lead', label: '리더십·기획', hint: '홍보대사·운영·스태프',
    match: /리더|홍보대사|서포터즈|운영|기획|STAFF|스태프|주관|평가단|큐레이션/ },
  { id: 'major', label: '전공·학업', hint: '학습·기초·연구',
    match: /전공|학술|논문|연구|학습|코딩|프로그래밍|Python|기초|세미나|워크숍|강좌|법제도|LBT|컨설팅|OcO/ },
  { id: 'growth', label: '자기관리·성장', hint: '심리·안전·건강',
    match: /심리|건강|체육|스트레스|습관|마음|명상|안전|예방|정서|중독|폭력|소방/ },
  { id: 'volunteer', label: '봉사·사회', hint: '지역사회·ESG',
    match: /봉사|ESG|지역사회|사회공헌/ },
] as const;

export type CompetencyGoalId = (typeof COMPETENCY_GOALS)[number]['id'];

export function isCompetencyGoalId(id: string): id is CompetencyGoalId {
  return COMPETENCY_GOALS.some((g) => g.id === id);
}

/**
 * 추천 케이스 — 사용자의 포인트 상황과 목표 역량 선택으로 갈린다.
 * - balance: 졸업 포인트가 부족하고 목표 역량도 있음 → 두 조건 병행
 * - points: 포인트만 부족 → 포인트 활동 우선
 * - competency: 포인트 충족(또는 기준 미확인) + 목표 역량 → 역량 매칭 우선
 * - explore: 조건 없음 → 취향 설문과 접수 상태 기반 기본 추천
 */
export type RecommendCase = 'balance' | 'points' | 'competency' | 'explore';

export const CASE_LABEL: Record<RecommendCase, { title: string; hint: string }> = {
  balance: { title: '포인트 + 목표 역량 병행', hint: '부족한 졸업 포인트와 선택한 역량을 함께 반영한 추천이에요.' },
  points: { title: '부족 포인트 우선', hint: '졸업까지 남은 포인트를 채우기 좋은 순서예요. 목표 역량을 고르면 함께 반영해요.' },
  competency: { title: '목표 역량 집중', hint: '키우고 싶은 역량에 맞는 활동이에요. 포인트를 입력하면 함께 반영해요.' },
  explore: { title: '기본 추천', hint: '취향 설문과 접수 상태를 반영했어요. 목표 역량을 고르거나 포인트를 입력하면 더 맞춤화돼요.' },
};

export type Recommended = { activity: Activity; score: number; reasons: string[] };

export function recommendActivities(
  items: readonly Activity[],
  options: {
    /** 누적 비교과 포인트 (학교 수집 또는 직접 입력). 모르면 null */
    points?: number | null;
    /** 졸업 기준 포인트. 기준을 모르면 null */
    requiredPoints?: number | null;
    /** 목표 역량 id 배열 (COMPETENCY_GOALS) */
    goals?: readonly string[];
    /** 비교과 취향 설문 답변 (ACT_QUESTIONS) */
    prefs?: readonly string[];
    /** 활동 진행 단계 — 수료·포인트 확인 완료는 추천에서 제외 */
    stages?: Record<string, string>;
    now?: number;
    limit?: number;
  } = {},
): { case: RecommendCase; deficit: number | null; goals: readonly string[]; results: Recommended[]; matched: number } {
  const now = options.now ?? Date.now();
  const goals = (options.goals ?? []).filter(isCompetencyGoalId);
  const deficit =
    options.points != null && options.requiredPoints != null
      ? Math.max(0, options.requiredPoints - options.points)
      : null;
  const wantPoints = deficit !== null && deficit > 0;
  const wantGoals = goals.length > 0;
  const kase: RecommendCase =
    wantPoints && wantGoals ? 'balance' : wantPoints ? 'points' : wantGoals ? 'competency' : 'explore';

  const scored: Recommended[] = [];
  for (const a of items) {
    const st = liveStatus(a, now).status;
    if (st !== 'open' && st !== 'closing' && st !== 'upcoming') continue;
    const stage = options.stages?.[a.id];
    if (stage === 'done' || stage === 'credited') continue;

    let score = 0;
    const reasons: string[] = [];
    let compHits = 0;
    for (const g of goals) {
      const goal = COMPETENCY_GOALS.find((c) => c.id === g);
      if (goal && goal.match.test(`${a.title} ${a.dept}`)) {
        compHits += 1;
        score += 3;
        reasons.push(goal.label);
      }
    }
    const pts = a.points ?? 0;
    if (wantPoints && pts > 0) {
      score += Math.max(1, Math.min(4, Math.round((pts / deficit) * 4)));
      reasons.push(`포인트 +${pts}`);
      if (pts >= deficit) reasons.push('부족분 한 번에 충족');
    } else if (pts > 0) {
      score += 1;
      reasons.push(`포인트 +${pts}`);
    }
    if (st === 'closing') {
      score += 3;
      reasons.push('마감 임박');
    } else if (st === 'open') {
      score += 2;
      reasons.push('접수 중');
    } else {
      score += 1;
      reasons.push('곧 접수');
    }
    if (a.certified) {
      score += 1;
      reasons.push('인재인증');
    }
    // 취향 설문은 케이스와 무관하게 최대 +2의 보조 신호로만 쓴다.
    score += Math.min(2, actScore(a, options.prefs, now).score * 0.5);

    if (kase === 'points' && pts <= 0) continue;
    if (kase === 'competency' && compHits === 0) continue;
    if (kase === 'balance' && compHits === 0 && pts <= 0) continue;
    if (score > 0) scored.push({ activity: a, score, reasons: [...new Set(reasons)] });
  }
  scored.sort(
    (x, y) =>
      y.score - x.score ||
      (x.activity.applyEnd ?? '9999').localeCompare(y.activity.applyEnd ?? '9999') ||
      x.activity.title.localeCompare(y.activity.title, 'ko'),
  );
  return { case: kase, deficit, goals, results: scored.slice(0, options.limit ?? 8), matched: scored.length };
}
