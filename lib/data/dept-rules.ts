/**
 * 학과별 졸업요건 수집 — 공식 학과 사이트의 졸업요건 페이지에서 규정 문구를
 * 그대로(verbatim) 추출한다. 수치 해석 없이 원문을 보존해 오역 위험을 없앤다.
 * provenance: 공식 학과 페이지 · 수집 스냅샷 · 졸업 사정 아님.
 */

export type DeptRuleSource = {
  /** 사이트 슬러그(예: CreCon) */
  slug: string;
  /** 졸업요건 페이지 URL */
  url: string;
  /** 사이트맵에서 연결된 학과명 */
  deptLabel: string;
};

export type DeptRuleset = {
  /** 사이트에 표기된 학과명 (예: 융합보안학과). 미확정이면 '' */
  deptLabel: string;
  /** 카탈로그 학과명으로 해석된 값 — 미해석이면 null */
  dept: string | null;
  url: string;
  /** 페이지에서 추출한 규정 문구 원문 */
  lines: string[];
  /** 본문이 문서 첨부(hwp/pdf)로만 제공될 때 파일 라벨 */
  attachment?: string | null;
  /** 본문이 여러 학과 규정을 나열하는 공통 안내 페이지 */
  multiDept?: boolean;
  /** 학번-컬럼 규정 표가 파싱된 경우의 구조화 데이터 */
  yearTable?: YearTable;
};

export type DeptRulesSnapshot = {
  source: 'hansung-dept-pages';
  sourceUrl: string;
  fetchedAt: string;
  itemCount: number;
  items: DeptRuleset[];
};

export type SitemapLink = { url: string; label: string };

/** 사이트맵 HTML에서 (url, 라벨) 링크를 순서대로 추출한다. */
export function parseSitemapLinks(html: string, slug: string): SitemapLink[] {
  const re = new RegExp(
    `<a[^>]+href="(/${slug}/\\d+/subview\\.do[^"]*)"[^>]*>([\\s\\S]{0,60}?)</a>`,
    'g',
  );
  const strip = (s: string) =>
    s
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  const out: SitemapLink[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ url: m[1], label: strip(m[2]) });
  return out;
}

const RULE_LABEL = /졸업요건|졸업 요건|트랙졸업요건|졸업안내/;
const DEPT_NAME = /(학과|학부|전공|트랙)\)?$/;
const INTRO_LABELS = new Set(['학과소개', '학부소개', '전공소개', '트랙소개']);
const SUBMENU =
  /^(교수소개|교수 소개|교육과정|교육과정소개|교육과정 소개|교육과정 로드맵|교과목 로드맵|교과목로드맵|비교과|비교과프로그램|비교과 프로그램|공지사항|FAQ|Q&A|Q&amp;A|게시판|자료실|캡스톤디자인|창업트랙|이용안내|사이트맵|졸업생 사례|장학 안내|장학안내|기숙사|취업|입학안내|트랙제도|교육목표|교육 목표|연혁|비전|조직도|조직|오시는 ?길|찾아오시는 ?길|교수진|시설|학부 연혁|학과 연혁)/;

/**
 * 사이트맵 링크 순서에서 학과↔졸업요건 페이지를 연결한다.
 * 학과 갱신 경로 두 가지:
 *  - 라벨 자체가 학과명(…학과/학부/전공/트랙으로 끝남)
 *  - '학과 소개/트랙소개' 라벨 → 그 URL의 첫 라벨이 학과명
 *    (글로벌융합대학처럼 학과명이 학과/학부로 끝나지 않는 경우)
 */
export function pairDeptRules(links: SitemapLink[]): DeptRuleSource[] {
  // pass 1: url별 라벨 수집 — '학과 소개' 라벨의 URL 첫(비소개) 라벨이 학과명
  const labelsOfUrl = new Map<string, string[]>();
  for (const { url, label } of links) {
    if (!label) continue;
    if (!labelsOfUrl.has(url)) labelsOfUrl.set(url, []);
    labelsOfUrl.get(url)!.push(label);
  }
  const deptOfUrl = (url: string) =>
    (labelsOfUrl.get(url) ?? []).find((l) => {
      const n = l.replace(/\s+/g, '');
      return (
        !INTRO_LABELS.has(n) && !RULE_LABEL.test(l) && !SUBMENU.test(l)
      );
    });

  // pass 2: 순서대로 학과 갱신 + 졸업요건 링크 연결
  let currentDept: string | null = null;
  const out: DeptRuleSource[] = [];
  const seen = new Set<string>();
  const push = (url: string) => {
    const key = (currentDept ?? '') + '|' + url;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({
        slug: url.split('/')[1],
        url,
        deptLabel: currentDept ?? '',
      });
    }
  };
  for (const { url, label } of links) {
    if (!label) continue;
    const norm = label.replace(/\s+/g, '');
    if (INTRO_LABELS.has(norm)) {
      const d = deptOfUrl(url);
      if (d) currentDept = d;
      continue;
    }
    if (RULE_LABEL.test(label)) {
      push(url);
      continue;
    }
    if (SUBMENU.test(label)) continue;
    if (DEPT_NAME.test(norm)) currentDept = label;
  }
  return out;
}

/** 추출된 규정 문구에서 학과명 추정 — '…학과/학부/전공' 단독 라벨 */
export function inferDeptLabel(lines: string[]): string {
  for (const l of lines.slice(0, 40)) {
    const t = l.trim();
    if (/^[가-힣·&\s]{2,20}(학과|학부|전공)$/.test(t)) return t;
  }
  return '';
}

const STOP_LABEL =
  /^(인쇄|공유|닫기|즐겨찾기|메뉴추가하기|초기화|사이트맵|이용안내|개인정보처리방침|이메일무단수집거부|COPYRIGHT|ALL RIGHTS|TEL|FAX|\[\d{5}\]|서울특별시|TOP$|사무실|트랙사무실|통합운영|.*트랙사무실)/;
const NAV_LABEL =
  /^(졸업요건|졸업 요건|트랙졸업요건|졸업안내|학과소개|학부소개|교수소개|교육과정|비교과프로그램|비교과 프로그램|공지사항|FAQ|Q&A|Q&amp;A|게시판|자료실)$/;
const JUNK = /_JW_|_K2WT|\.(hwp|pdf|docx?)$|_$/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

/**
 * 졸업요건 페이지 HTML에서 규정 문구를 원문으로 추출한다.
 * 우선 CMS 본문 컨테이너(id=contentsEditHtml / _contentBuilder)만 떼어내
 * nav·푸터 오염을 막고, 못 찾으면 제목 앵커 방식으로 폴백한다.
 * nav 라벨·템플릿 토큰·파일명 조각은 제외한다.
 */
export function extractRulesText(html: string): string[] {
  // 본문 컨테이너 우선 — 한성 CMS 공통 id
  const container = html.match(
    /<div[^>]*id="(?:contentsEditHtml|_contentBuilder)"[^>]*>([\s\S]*)<\/body/i,
  );
  const scope = container ? container[1] : html;
  const body = scope
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '\n');
  const lines = body
    .split('\n')
    .map((l) => decodeEntities(l).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // 콘텐츠 시작: 컨테이너를 못 찾았을 때만 제목 앵커 탐색
  let start = 0;
  if (!container) {
    start = lines.findIndex((l) =>
      /(학과|학부|전공|트랙)\s*졸업\s*요건|졸업\s*요건\s*안내/.test(l),
    );
    if (start < 0) {
      const titleIdxs = lines
        .map((l, i) => (NAV_LABEL.test(l) && /졸업/.test(l) ? i : -1))
        .filter((i) => i >= 0);
      start = titleIdxs.length ? titleIdxs[titleIdxs.length - 1] : -1;
    }
    if (start < 0) return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of lines.slice(start)) {
    if (STOP_LABEL.test(l)) break;
    if (l.length < 2 || seen.has(l) || NAV_LABEL.test(l) || JUNK.test(l))
      continue;
    seen.add(l);
    out.push(l);
    if (out.length >= 60) break;
  }
  return out;
}

/** 페이지 내 첨부파일(공식 문서) 다운로드 링크 감지 — hwp/pdf/docx */
export function extractAttachment(html: string): string | null {
  const m = html.match(
    /href="[^"]*(?:\.hwp|\.pdf|\.docx?)[^"]*"[^>]*>([\s\S]{0,80}?)</i,
  );
  if (!m) return null;
  const label = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return label || '첨부 문서';
}

/**
 * 수집 결과 이상 감지 — 의미 있는 규정 문구가 하나도 없으면 실패.
 * 한 줄짜리 정식 규정(예: '창작발표회 2회, 졸업작품')도 유효하므로 0 기준.
 * 첨부 문서가 있는 ruleset은 "공식 문서 참고" 케이스로 정상 간주.
 */
export function isRulesetAnomalous(ruleset: DeptRuleset): boolean {
  if (ruleset.attachment) return false;
  const meaningful = ruleset.lines.filter(
    (l) => l.length >= 6 && /[가-힣]/.test(l),
  );
  return meaningful.length === 0;
}

export type YearColumn = {
  /** 헤더 원문 (예: '17학번 ~23학번') */
  label: string;
  /** 적용 시작 입학연도 (4자리). 미해석이면 undefined */
  from?: number;
  /** 적용 끝 입학연도 (4자리). 미해석이면 undefined */
  to?: number;
};

export type YearTable = {
  /** 학번 컬럼들 (헤더 순서) */
  columns: YearColumn[];
  /** 데이터 행: 라벨 셀 결합 + 학번 컬럼 위치의 원문 값 */
  rows: { label: string; cells: string[] }[];
};

const YEAR_CELL = /학번/;

function cellText(html: string): string {
  return decodeEntities(
    html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  );
}

/** '~ 15학번' → {to:2015}, '16학번' → {from:to:2016}, '17~23학번' → 범위 */
export function parseYearLabel(label: string): Pick<YearColumn, 'from' | 'to'> {
  const t = label.replace(/\s+/g, '');
  const range =
    t.match(/(\d{2})학번[~-](\d{2})학번/) ??
    t.match(/(\d{2})[~-](\d{2})학번/);
  if (range) return { from: 2000 + +range[1], to: 2000 + +range[2] };
  const before = t.match(/^~(\d{2})학번/) ?? t.match(/(\d{2})학번이전|(\d{2})학번까지/);
  if (before) return { to: 2000 + +(before[1] ?? before[2]) };
  const after = t.match(/(\d{2})학번~/);
  if (after) return { from: 2000 + +after[1] };
  const single = t.match(/(\d{2})학번/);
  if (single) return { from: 2000 + +single[1], to: 2000 + +single[1] };
  return {};
}

/**
 * 학번-컬럼 규정 표 파싱 (CSE/1564 형).
 * 헤더 행에서 학번 셀 시작 위치를 찾아 그 이전은 라벨 셀, 이후는 연도 컬럼으로
 * 간주. 데이터 행의 셀 수가 맞지 않으면 그 행은 건너뛰고, 유효 행이 없으면
 * null — 형식이 다른 페이지는 원문 보존 경로로 둔다.
 */
export function parseYearTable(html: string): YearTable | null {
  const container = html.match(
    /<div[^>]*id="(?:contentsEditHtml|_contentBuilder)"[^>]*>([\s\S]*)<\/body/i,
  );
  const scope = container ? container[1] : html;
  const tables = scope.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  for (const table of tables) {
    const trs = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    const grid = trs.map((tr) =>
      (tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) ?? []).map((c) =>
        cellText(c),
      ),
    );
    // 헤더 행: 학번 셀이 2개 이상인 첫 행
    const hi = grid.findIndex(
      (r) => r.filter((c) => YEAR_CELL.test(c)).length >= 2,
    );
    if (hi < 0) continue;
    const header = grid[hi];
    const firstYear = header.findIndex((c) => YEAR_CELL.test(c));
    const columns: YearColumn[] = header
      .slice(firstYear)
      .map((label) => ({ label, ...parseYearLabel(label) }));
    if (columns.length < 2) continue;
    const labelCols = firstYear;
    const rows: YearTable['rows'] = [];
    for (const r of grid.slice(hi + 1)) {
      if (r.length !== labelCols + columns.length) continue; // colspan 등 비규격
      const label = r.slice(0, labelCols).filter(Boolean).join(' / ');
      const cells = r.slice(labelCols);
      if (!label || cells.every((c) => !c)) continue;
      rows.push({ label, cells });
    }
    if (rows.length) return { columns, rows };
  }
  return null;
}

/** 입학연도에 해당하는 학번 컬럼 인덱스 — 범위 밖이면 null */
export function yearColumnIndex(table: YearTable, admitYear: number): number | null {
  for (let i = 0; i < table.columns.length; i++) {
    const c = table.columns[i];
    if (c.from !== undefined && admitYear < c.from) continue;
    if (c.to !== undefined && admitYear > c.to) continue;
    if (c.from === undefined && c.to === undefined) continue;
    return i;
  }
  return null;
}

/**
 * 수집 학과명 ↔ 카탈로그 학과명 수동 검증 매핑.
 * 학과 사이트의 표기(deptLabel)가 카탈로그 개설 단위명과 다를 때만 등록한다.
 * - 컴퓨터공학부(CSE 사이트): 입학처 공식 명칭 그대로이며 카탈로그에서는
 *   공통 교과가 'IT응용시스템공학과'(K191)로, 트랙 교과가
 *   '모바일소프트웨어트랙'·'빅데이터트랙'으로 개설된다.
 *   (모집요강 기준 컴퓨터공학부 트랙 = 모바일SW·빅데이터·디지털콘텐츠가상현실·
 *   웹공학 — 이 중 2026-2 카탈로그에 개설이 확인된 단위만 등록)
 * 검증되지 않은 매핑은 추가하지 않는다.
 */
const RULESET_DEPT_FAMILY: Record<string, string[]> = {
  컴퓨터공학부: ['IT응용시스템공학과', '모바일소프트웨어트랙', '빅데이터트랙'],
};

/**
 * ruleset이 사용자 학과에 적용되는지 판정.
 * 1) 수집 시 해석된 카탈로그 학과명(r.dept)이 사용자 dept 풀에 포함
 * 2) 사용자 입력이 학과 사이트 표기(deptLabel)와 정규화 일치
 * 3) 검증된 학과 패밀리 매핑 — 사용자 풀이 단일 학과로 확정된 경우만 적용
 *    (모호한 입력에 규정을 붙이지 않기 위해 candidates 풀에는 적용하지 않음)
 * 어느 쪽도 해당하지 않으면 false — 규정을 추측해 보여주지 않는다.
 */
export function rulesetMatchesDept(
  r: DeptRuleset,
  userDept: string,
  pool: string[] | null,
): boolean {
  if (r.dept && pool?.includes(r.dept)) return true;
  const label = r.deptLabel.replace(/\s+/g, '');
  if (!label) return false;
  if (label === userDept.replace(/\s+/g, '')) return true;
  const family = RULESET_DEPT_FAMILY[label];
  return !!family && pool?.length === 1 && family.includes(pool[0]);
}

/** 학점이 아닌 조건 요건 행 — 원문 그대로 보존, 자동 집계하지 않는다. */
export type DeptCondition = {
  /** 행 라벨 원문 (예: '트랙 이수 / 이수 트랙 수') */
  label: string;
  /** 해당 학번 컬럼 셀 원문 (예: '2', 'V 캡스톤디자인 수강 필수…') */
  cell: string;
  /** 권장 항목 여부 — 라벨·셀의 '권장' 표기로 판정 */
  recommended: boolean;
};

/** 학번표에서 해석된 학과 기준 — 엔진 입력용 */
export type DeptTargets = {
  /** '총 취득 학점' 계열 셀의 교과 학점 (예: 140, 130) */
  total?: number;
  /** 비교과 포인트 (예: 800) */
  points?: number;
  /** 학점이 아닌 조건 요건 행들 (V/숫자 셀) */
  conditions: DeptCondition[];
  /** 매칭된 학번 컬럼 라벨 (provenance 표시용) */
  columnLabel: string;
};

const CREDIT_ROW = /취득\s*학점|이수\s*학점|졸업\s*학점/;
const NO_REQ = /^[-–—xX✕미적용]+$/;

/**
 * yearTable + 입학연도 → 학과 졸업 기준 해석.
 * 학번 컬럼이 없으면 null(적용 불가 — 추측하지 않음).
 * 학점 행은 엔진 입력(total/points)으로 해석하고, V/숫자 셀의 조건 행은
 * 원문 그대로 conditions에 담아 사용자 확인용으로 돌린다.
 */
export function deptRuleTargets(
  ruleset: DeptRuleset,
  admitYear: number,
): DeptTargets | null {
  const table = ruleset.yearTable;
  if (!table) return null;
  const idx = yearColumnIndex(table, admitYear);
  if (idx === null) return null;
  const out: DeptTargets = {
    conditions: [],
    columnLabel: table.columns[idx].label,
  };
  for (const row of table.rows) {
    const cell = (row.cells[idx] ?? '').trim();
    if (!cell || NO_REQ.test(cell.replace(/\s+/g, ''))) continue;
    if (CREDIT_ROW.test(row.label)) {
      const major = cell.match(/교과\s*(\d+)\s*학점/);
      const nonmajor = cell.match(/비교과\s*(\d+)\s*(?:pt|p|점|포인트)/i);
      if (major) out.total = parseInt(major[1], 10);
      if (nonmajor) out.points = parseInt(nonmajor[1], 10);
      // '140학점'처럼 교과/비교과 표기 없이 학점만 있으면 총 취득 학점으로 해석
      if (!major && !nonmajor) {
        const bare = cell.match(/(\d+)\s*학점/);
        if (bare) out.total = parseInt(bare[1], 10);
      }
      continue;
    }
    out.conditions.push({
      label: row.label,
      cell,
      recommended: /권장/.test(row.label) || /권장/.test(cell),
    });
  }
  return out;
}

/** 본문에 학과명 라벨이 2개 이상이면 전체 학과 공통 안내 페이지로 간주 */
export function isMultiDeptPage(lines: string[]): boolean {
  let n = 0;
  for (const l of lines) {
    if (/^[가-힣·&\s]{2,20}(학과|학부|전공)$/.test(l.trim())) n++;
    if (n >= 2) return true;
  }
  return false;
}
