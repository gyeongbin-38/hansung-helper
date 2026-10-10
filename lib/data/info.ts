/**
 * 종합정보시스템(info.hansung.ac.kr) 수집 스냅샷 — 로그인 시 서버가
 * 학교 세션으로 이수 내역·비교과 포인트·졸업가사정표·학적 요약을
 * 읽어온 결과물. 계정 snapshot.infoData에 저장되며 profile에는
 * 들어가지 않는다(서버 작성 전용 — 클라이언트가 생성할 수 없다).
 */
export type InfoCourse = {
  /** 과목코드 — 없으면 '미확인' */
  code: string;
  name: string;
  /** 앱 이수구분 어휘로 정규화된 값 (전필/전선/교필/일교/일선/…) */
  category: string;
  credits: number;
  /** '2024-1' 형태의 수강 학기 — 파싱 실패 시 없음 */
  semester?: string;
  /** 성적 등급 원문 (A+ 등) — 참고용 */
  grade?: string;
};

/** 졸업가사정표 행 — 구분/기준/취득/판정 원문 (숫자 강제 변환 없음) */
export type InfoAuditRow = {
  area: string;
  required: string;
  earned: string;
  verdict: string;
};

export type InfoSnapshot = {
  source: 'info-hansung';
  fetchedAt: string;
  /** 학적 정보 — 있으면 프로필 빈칸 채움에 사용 */
  name?: string;
  dept?: string;
  admitYear?: number;
  /** 누적 취득학점 총계 */
  credits?: number;
  /** 비교과 포인트 총점 */
  points?: number;
  /** 누적 평점 (있으면) */
  gpa?: number;
  /** 이수 완료 과목 (누적 성적 조회 페이지) */
  completed: InfoCourse[];
  /** 졸업가사정표 행 — 학교 기준 자체를 보여주는 참고표 */
  audit?: InfoAuditRow[];
  /** 이전 수집 대비 바뀐 지표 라벨 — '취득학점'|'평점'|'이수 과목 수'|'수집 시작'.
   *  첫 수집이거나 변동 없으면 없음. 알림 1회 표시 트리거로 사용 */
  changed?: string[];
  /** 수집 진단 — 어떤 메뉴를 찾았고 각 페이지가 파싱됐는지.
   *  실계정 첫 수집 때 실제 메뉴 구조를 알려주는 계측이다. */
  diag?: {
    menu: { label: string; path: string }[];
    pages: { slot: string; path: string; ok: boolean }[];
  };
};

/** 학교 이수구분 원문 → 앱 카테고리 어휘 (gradGroup 입력으로 바로 쓰인다) */
export function infoCategory(raw: string): string {
  const s = raw.replace(/\s+/g, '');
  if (/전공?필수|전필|계필/.test(s)) return '전필';
  if (/전공?선택|전선|MD전선/.test(s)) return '전선';
  if (/전공?기초|전기/.test(s)) return '전기';
  if (/선필교|교양?필수|필수교양|교필/.test(s)) return '교필';
  if (/교양?선택|교선|일반?교양|일교/.test(s)) return '일교';
  if (/일반?선택|자유?선택|일선|자선/.test(s)) return '일선';
  // 모르는 구분은 원문 유지 — gradGroup이 '기타'로 보내고 화면엔 원문이 보인다
  return raw.trim().slice(0, 20);
}

const isCourse = (v: unknown): v is InfoCourse =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as InfoCourse).code === 'string' &&
  (v as InfoCourse).code.length <= 30 &&
  typeof (v as InfoCourse).name === 'string' &&
  (v as InfoCourse).name.length <= 100 &&
  typeof (v as InfoCourse).category === 'string' &&
  (v as InfoCourse).category.length <= 20 &&
  typeof (v as InfoCourse).credits === 'number' &&
  (v as InfoCourse).credits >= 0 &&
  (v as InfoCourse).credits <= 20;

/** 스냅샷 → 클라이언트 수화용 형식 검증. diag는 신뢰 경계 밖 데이터라 제거하지 않고
 *  필드만 제한한다 — 수집 품질 확인용이다. */
export function validateInfo(v: unknown): InfoSnapshot | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Partial<InfoSnapshot>;
  if (s.source !== 'info-hansung' || typeof s.fetchedAt !== 'string')
    return null;
  const num = (x: unknown, max: number) =>
    typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max
      ? x
      : undefined;
  const str = (x: unknown, max: number) =>
    typeof x === 'string' && x.length <= max && x.trim()
      ? x.trim()
      : undefined;
  return {
    source: 'info-hansung',
    fetchedAt: s.fetchedAt,
    name: str(s.name, 30),
    dept: str(s.dept, 80),
    admitYear: num(s.admitYear, 2100),
    credits: num(s.credits, 300),
    points: num(s.points, 10000),
    gpa: num(s.gpa, 10),
    completed: Array.isArray(s.completed)
      ? s.completed.filter(isCourse).slice(0, 300).map((c) => ({
          code: c.code,
          name: c.name,
          category: c.category,
          credits: c.credits,
          semester: str(c.semester, 10),
          grade: str(c.grade, 10),
        }))
      : [],
    changed: Array.isArray(s.changed)
      ? s.changed
          .filter((c): c is string => typeof c === 'string')
          .slice(0, 10)
      : undefined,
    audit: Array.isArray(s.audit)
      ? s.audit
          .filter(
            (r): r is InfoAuditRow =>
              !!r &&
              typeof r === 'object' &&
              typeof r.area === 'string' &&
              typeof r.required === 'string' &&
              typeof r.earned === 'string' &&
              typeof r.verdict === 'string',
          )
          .slice(0, 40)
      : undefined,
    diag:
      s.diag && typeof s.diag === 'object'
        ? {
            menu: Array.isArray(s.diag.menu)
              ? s.diag.menu
                  .filter(
                    (m): m is { label: string; path: string } =>
                      !!m &&
                      typeof m === 'object' &&
                      typeof m.label === 'string' &&
                      typeof m.path === 'string',
                  )
                  .slice(0, 80)
              : [],
            pages: Array.isArray(s.diag.pages)
              ? s.diag.pages
                  .filter(
                    (p): p is { slot: string; path: string; ok: boolean } =>
                      !!p &&
                      typeof p === 'object' &&
                      typeof p.slot === 'string' &&
                      typeof p.path === 'string' &&
                      typeof p.ok === 'boolean',
                  )
                  .slice(0, 20)
              : [],
          }
        : undefined,
  };
}

export type MergedCourse = {
  code: string;
  name: string;
  category: string;
  credits: number;
  /** 'info' = 종합정보 수집본, 'manual' = 사용자 직접 입력 */
  src: 'info' | 'manual';
  semester?: string;
};

/** 부분 수집 병합 — diag.pages에서 fetch가 확인된(ok) 슬롯만 새 값을 믿고,
 *  못 가져온 슬롯은 이전 스냅샷 값을 유지한다. 학교 세션은 계정당 하나라
 *  다른 기기 로그인이 수집 도중 세션을 끊을 수 있다 — 그때 페이지가 200으로
 *  돌아와도 로그인 프레임셋이라 메뉴·슬롯이 통째로 비는데, 이전 데이터를
 *  덮어쓰지 않게 하는 안전장치다. fetchedAt·diag는 항상 이번 수집본을 쓴다. */
export function mergeInfoSnapshot(
  prev: InfoSnapshot | undefined,
  next: InfoSnapshot,
): InfoSnapshot {
  if (!prev) return next;
  const ok = (slot: string) =>
    next.diag?.pages.some((p) => p.slot === slot && p.ok) ?? false;
  const gradesOk = ok('grades');
  return {
    ...next,
    name: next.name ?? prev.name,
    dept: next.dept ?? prev.dept,
    admitYear: next.admitYear ?? prev.admitYear,
    credits: gradesOk ? (next.credits ?? prev.credits) : prev.credits,
    gpa: gradesOk ? (next.gpa ?? prev.gpa) : prev.gpa,
    completed: gradesOk ? next.completed : prev.completed,
    points: ok('points') ? (next.points ?? prev.points) : prev.points,
    audit: ok('audit') ? (next.audit ?? prev.audit) : prev.audit,
    changed: next.changed,
  };
}

const normKey = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 수동 이수 목록 + 수집 목록 병합 — 같은 과목(코드 또는 정규화 이름)이
 *  양쪽에 있으면 수집본을 우선한다. 수동 목록은 절대 수정하지 않는다. */
export function mergeCompleted(
  manual: { code: string; name: string; category: string; credits: number }[],
  info: InfoCourse[] | undefined,
): MergedCourse[] {
  const out: MergedCourse[] = [];
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();
  for (const c of info ?? []) {
    out.push({ ...c, src: 'info' });
    if (c.code && c.code !== '미확인') seenCodes.add(c.code);
    seenNames.add(normKey(c.name));
  }
  for (const c of manual) {
    const codeHit =
      c.code && !c.code.startsWith('수기-') && seenCodes.has(c.code);
    if (codeHit || seenNames.has(normKey(c.name))) continue;
    out.push({ ...c, src: 'manual' });
  }
  return out;
}
