/**
 * 종합정보시스템(info.hansung.ac.kr) 수집 — 로그인 시 열린 SchoolSession으로
 * 성적 조회·비교과 포인트·졸업가사정표·학적 요약을 읽어 InfoSnapshot을 만든다.
 *
 * 페이지 URL을 하드코딩하지 않는다 — 로그인 응답으로 이미 받는
 * dae_top_menu 메뉴 HTML에서 라벨-경로 쌍을 발견한 뒤 키워드로 목표를
 * 고른다. 메뉴 구조가 실제와 다르면 diag에 발견 목록만 기록되고
 * 수집 항목은 비어 있는 채로 돌아간다(실패를 숨기지 않는다).
 */
import { plainText } from './school.ts';
import { infoCategory } from '../data/info.ts';
import type {
  InfoAcademic,
  InfoAuditRow,
  InfoCourse,
  InfoCreditCategory,
  InfoPageFailure,
  InfoRequirementTable,
  InfoSemester,
  InfoSnapshot,
} from '../data/info.ts';

const HOST = 'https://info.hansung.ac.kr';

export interface InfoSession {
  request(url: string, init?: RequestInit): Promise<Response>;
  follow(response: Response, base: string): Promise<Response>;
}

export type InfoMenuItem = { label: string; path: string };

/** 메뉴 HTML에서 "라벨 → 학교 내부 경로" 쌍을 추출한다.
 *  패턴: <a href="servlet/s_x.y">, onclick="go('s_x.y')",
 *  <area href>, <img alt + onclick>, JS 배열 ("라벨","s_x.y"). */
export function parseInfoMenu(html: string): InfoMenuItem[] {
  const items: InfoMenuItem[] = [];
  const seen = new Set<string>();
  const PATH_RE =
    /servlet\/s_[a-z][a-z0-9_]*\.[a-z0-9_]+|h_[a-z][a-z0-9_]*\/[a-z0-9_]+\.html?|[a-z0-9_]+\/[a-z0-9_/]*\.jsp|\bs_[a-z][a-z0-9_]*\.[a-z0-9_]+/gi;
  const push = (label: string, path: string) => {
    // 'kr/x.jsp'는 절대 URL 'info.hansung.ac.kr/x.jsp'의 도메인 꼬리가
    // 경로 패턴에 잡힌 것 — 'kr/' 접두를 떼고 본래 경로로 되돌린다
    const p = path.trim().replace(/^\/+/, '').replace(/^kr\//, '');
    const l = label.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!p || /[:\\]/.test(p) || p.length > 80) return;
    const key = p + '|' + l;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ label: l, path: p });
  };
  const pathOf = (attrs: string) => {
    const m = attrs.match(PATH_RE);
    PATH_RE.lastIndex = 0;
    if (!m) return null;
    const full = m[0];
    return full.startsWith('servlet/') ? full.slice(8) : full;
  };
  // 태그 단위 스캔 — 속성 안의 경로 + 같은 태그의 라벨(alt/title/value/본문).
  // a/area/img/input만 직접 스캔한다 — li/td를 함께 잡으면 컨테이너가
  // 안쪽 앵커를 통째로 삼켜 실제 메뉴(<li><a>)가 전부 누락된다.
  for (const m of html.matchAll(/<(a|area|img|input)\b([^>]*)>([\s\S]*?)<\/\1>|<(a|area|img|input)\b([^>]*)\/?\s*>/gi)) {
    const attrs = m[2] ?? m[5] ?? '';
    const path = pathOf(attrs);
    if (!path) continue;
    const label =
      attrs.match(/(?:alt|title|value)="([^"]{1,60})"/)?.[1] ??
      attrs.match(/(?:alt|title|value)='([^']{1,60})'/)?.[1] ??
      plainText(m[3] ?? '').slice(0, 60);
    push(label, path);
  }
  // li/td 컨테이너 — onclick 등 속성에 경로가 있고 본문이 라벨인 형태
  for (const m of html.matchAll(/<(li|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const path = pathOf(m[2] ?? '');
    if (!path) continue;
    push(plainText(m[3] ?? '').slice(0, 60), path);
  }
  // JS 배열/인자 쌍: "라벨","s_x.y" 또는 '라벨','path.jsp'
  for (const m of html.matchAll(
    /["']([^"'<>()\n]{1,50})["']\s*,\s*["']((?:servlet\/)?s_[a-z][a-z0-9_]*\.[a-z0-9_]+|(?:[a-z0-9_]+\/)*[a-z0-9_]+\.(?:html?|jsp))["']/g,
  )) {
    const p = m[2].startsWith('servlet/') ? m[2].slice(8) : m[2];
    push(m[1], p);
  }
  return items.slice(0, 80);
}

/** 수집 슬롯 → 메뉴 라벨 매칭. 슬롯별 정규식은 우선순위 순 — '누적성적'이
 *  '금학기 성적조회'보다 먼저 시도된다. 라벨 없는 항목은 매칭 안 함. */
const SLOTS: { slot: string; res: RegExp[]; paths?: RegExp[] }[] = [
  {
    slot: 'grades',
    res: [
      /누적|전체\s*성적|이수\s*(내역|현황)/,
      /성적\s*조회|성적표\s*조회|성적/,
    ],
  },
  {
    slot: 'points',
    res: [
      /비교과.*포인트/,
      /포인트.*(조회|내역|현황)/,
      /비교과/,
      /포인트|마일리지|역량\s*점수/,
    ],
    // 라벨이 포맷과 어긋나도 메뉴 링크의 파일명으로 찾는다 —
    // 비교과 포인트 조회는 보통 point/bigyo/mile 이름의 JSP다.
    paths: [/point|mile|bigyo|extra/i],
  },
  {
    slot: 'audit',
    res: [/졸업.*(가?사정|심사)|사정표/, /졸업요건|졸업\s*기준/],
  },
  { slot: 'requirements', res: [/졸업\s*(요건|기준|이수요건)/] },
];

/** 메뉴 라벨이 바뀌어도 수집할 수 있는 직접 경로. 모두 로그인 세션이
 *  있어야 실제 데이터가 오고, 없으면 로그인 벽으로 분류된다. */
const DIRECT_PATHS = {
  grades: ['jsp_21/student/grade/total_grade.jsp?viewMode=oc'],
  semesterGrades: [
    'fuz/seongjeok/seongjeok_new_rwd.jsp',
    'fuz/seongjeok/seongjeok.jsp',
  ],
  academic: ['tonicsoft/jik/register/collage_register_hakjuk_rwd.jsp'],
  audit: [
    'jsp_21/student/graduation/joluprequire_track.jsp?viewMode=oc',
    'jsp_21/student/graduation/graduation_requirement.jsp?viewMode=oc',
  ],
} as const;

export function pickTargets(menu: InfoMenuItem[]) {
  const found: Record<string, string> = {};
  for (const { slot, res, paths } of SLOTS) {
    for (const re of res) {
      const hit = menu.find((m) => re.test(m.label));
      if (hit) {
        found[slot] = hit.path;
        break;
      }
    }
    if (!found[slot] && paths) {
      const hit = menu.find((m) => paths.some((re) => re.test(m.path)));
      if (hit) found[slot] = hit.path;
    }
  }
  return found;
}

/** dae_main 프레임셋에서 프레임 src 목록 — 실제 메뉴는 좌측 프레임(left.jsp),
 *  우측 프레임(포털 메인)에도 같은 사이드바가 박혀 있어 둘 다 메뉴 소스가 된다. */
const frameSrcs = (html: string): string[] => {
  const out: string[] = [];
  for (const m of html.matchAll(/<frame\b([^>]*)>/gi)) {
    const src =
      m[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ??
      m[1].match(/\bsrc\s*=\s*([^\s>]+)/i)?.[1];
    if (!src) continue;
    const p = src.trim().replace(/^\/+/, '');
    if (!p || /^https?:/i.test(p) || p.length > 120 || out.includes(p)) continue;
    out.push(p);
  }
  return out;
};

// 's_x.y' bare servlet명 → servlet/ 접두, 'h_x/y.html'·'x/y.jsp' 경로는 그대로
const toUrl = (path: string) =>
  `${HOST}/${path.includes('.') && !path.includes('/') ? 'servlet/' + path : path}`;

const decode = async (res: Response) => {
  const buf = await res.arrayBuffer();
  // euc-kr 선언이 없으면 utf-8로 먼저 읽고 대체 문자(U+FFFD)가 나오면 euc-kr로 재해석
  const ct = res.headers.get('content-type') ?? '';
  if (/euc-?kr/i.test(ct)) return new TextDecoder('euc-kr').decode(buf);
  const utf8 = new TextDecoder('utf-8').decode(buf);
  return utf8.includes('\uFFFD') ? new TextDecoder('euc-kr').decode(buf) : utf8;
};

/** 로그인 벽 감지 — 세션 만료 시 로그인 폼으로 돌아온다 */
const isLoginWall = (html: string) =>
  /gong_login|name=["']?passwd|로그인이 필요/.test(html) &&
  !/<t[dh][^>]*>[\s\S]{20,}/.test(html);

type Table = { head: string[]; rows: string[][] };

/** HTML → 테이블 배열 (thead/th 우선, 없으면 첫 tr을 헤더 후보로) */
function tables(html: string): Table[] {
  const out: Table[] = [];
  for (const t of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(
      (r) =>
        [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
          (c) => plainText(c[1]),
        ),
    );
    if (rows.length < 2) continue;
    const headerIdx = rows.findIndex((r) =>
      r.some((c) => /과목|교과목|강좌|구분|항목|포인트|학기/.test(c)),
    );
    if (headerIdx === -1) continue;
    out.push({ head: rows[headerIdx], rows: rows.slice(headerIdx + 1) });
  }
  return out;
}

const col = (head: string[], res: RegExp[]) => {
  for (const re of res) {
    const i = head.findIndex((h) => re.test(h));
    if (i !== -1) return i;
  }
  return -1;
};

const num = (s: string) => {
  const m = s.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

/** 누적 성적 페이지 — 학기별 과목 테이블에서 이수 과목을 뽑는다.
 *  실제 페이지(total_grade.jsp)는 학기 카드마다
 *  '구분/교과명/교과코드/학점/성적' 테이블이 있다 — 과목명·학점·성적
 *  세 헤더가 모두 있어야 성적표로 인정한다(요약 테이블 제외). */
export function parseGrades(html: string): {
  completed: InfoCourse[];
  failedCourses: InfoCourse[];
  credits?: number;
  gpa?: number;
  recognized: boolean;
  hasUnconfirmed: boolean;
} {
  const completed: InfoCourse[] = [];
  const failedCourses: InfoCourse[] = [];
  const seen = new Set<string>();
  let credits: number | undefined;
  let gpa: number | undefined;
  let recognized = false;
  let hasUnconfirmed = false;
  // 테이블 앞 텍스트에서 학기 헤더를 찾는다 — 실제로는 카드 헤더
  // ("2026 학년도 1 학기")가 테이블 바로 앞에 온다
  const chunks = html.split(/<table\b/i);
  for (let ti = 1; ti < chunks.length; ti++) {
    const block = chunks[ti].split(/<\/table>/i)[0] ?? '';
    const before = plainText(chunks[ti - 1].slice(-2000));
    const sems = [
      ...before.matchAll(
        /(20\d{2})\s*(?:학년도|년)?\s*(1|2|여름|겨울)\s*학기/g,
      ),
    ];
    const semM = sems[sems.length - 1];
    const semester = semM
      ? `${semM[1]}-${{ '1': '1', '2': '2', '여름': 'S', '겨울': 'W' }[semM[2] as '1' | '2' | '여름' | '겨울']}`
      : undefined;
    const rows = [...block.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(
      (r) =>
        [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
          (c) => plainText(c[1]),
        ),
    );
    const headerIdx = rows.findIndex((r) => {
      const joined = r.join(' ');
      return (
        /(교과목명|과목명|강좌명|과목\s*명|교과목|교과)/.test(joined) &&
        /학점/.test(joined) &&
        /(성적|등급)/.test(joined)
      );
    });
    if (headerIdx === -1) {
      // 새 성적 화면(seongjeok_new_rwd.jsp)은 헤더 없이
      // '교과명 | 학점 | 성적' 행만 오는 경우가 있다 — 등급 셀이
      // 있는 행만 골라 과목으로 인정한다(요약·소계 표 오염 방지).
      const heuristic = parseHeuristicRows(rows, semester);
      if (heuristic.length) {
        recognized = true;
        for (const c of heuristic) {
          if (
            /^(F|FA|NP|N|U|I|낙제|불합격|미이수|포기)/i.test(c.grade ?? '')
          )
            continue;
          const key = normKey(c.name) + '|' + (c.semester ?? '');
          if (seen.has(key)) continue;
          seen.add(key);
          completed.push(c);
        }
      }
      // 소계 테이블 — 총 취득학점/평점만 회수
      const flat = rows.flat().join(' ');
      if (!credits) {
        const cm = flat.match(/(?:취득|이수)\s*학점[^0-9]{0,6}(\d{2,3})/);
        if (cm) credits = parseInt(cm[1], 10);
      }
      if (!gpa) {
        const gm = flat.match(/평점\s*평균[^0-9]{0,6}(\d\.\d{1,2})/);
        if (gm) gpa = parseFloat(gm[1]);
      }
      continue;
    }
    const head = rows[headerIdx];
    const iCode = col(head, [/과목코드|교과목코드|학수번호|과목번호|코드/]);
    const iName = col(head, [/교과목명|과목명|강좌명|과목\s*명|교과목|교과/]);
    const iCat = col(head, [/이수\s*구분|구분|이수구분/]);
    const iCredits = col(head, [/취득\s*학점|학점수|학점/]);
    const iGrade = col(head, [/등급|성적/]);
    const iSem = col(head, [/학기|년도/]);
    const iArea = col(head, [/교양\s*영역|배분\s*영역|이수\s*영역|^영역$/]);
    const iNote = col(head, [/비고|현재트랙/]);
    const courseArea = (cells: string[]) => {
      if (iArea !== -1) return cells[iArea]?.slice(0, 80) || undefined;
      const note = iNote !== -1 ? cells[iNote] ?? '' : '';
      return note.match(/(?:선필교|선택필수교양)\s*\(([^)]{1,80})\)/)?.[1]?.trim() || undefined;
    };
    if (iName === -1 || iCredits === -1) continue;
    recognized = true;
    let curSem = semester;
    for (const cells of rows.slice(headerIdx + 1)) {
      // 학기 중간 헤더 행 (colspan 하나만 있는 행)
      const semInRow = cells
        .join(' ')
        .match(/(20\d{2})\s*(?:학년도|년)?\s*(1|2|여름|겨울)\s*학기/);
      if (cells.length <= 2 && semInRow) {
        curSem = `${semInRow[1]}-${{ '1': '1', '2': '2', '여름': 'S', '겨울': 'W' }[semInRow[2] as '1' | '2' | '여름' | '겨울']}`;
        continue;
      }
      if (cells.length <= Math.max(iName, iCredits)) continue;
      const name = cells[iName];
      const cr = num(cells[iCredits]);
      if (
        !name ||
        cr === null ||
        /^(소\s*계|합\s*계|총\s*계|계)$/.test(name) ||
        !/[가-힣A-Za-z]/.test(name)
      )
        continue;
      const gradeCell = iGrade !== -1 ? (cells[iGrade] ?? '').trim() : '';
      // 전체 행이 빈 경우에도 과목별 확정 여부를 추측하지 않는다.
      if (!gradeCell) {
        hasUnconfirmed = true;
        continue;
      }
      const code = iCode !== -1 ? cells[iCode] || '미확인' : '미확인';
      const sem0 =
        (iSem !== -1 &&
          cells[iSem]?.match(/(20\d{2})\s*(?:-|학년도|년)?\s*(1|2|여름|겨울)/)
            ?.slice(1)
            .join('-')) ||
        curSem;
      if (/^F/i.test(gradeCell)) {
        failedCourses.push({
          code: code.slice(0, 30),
          name: name.slice(0, 100),
          category: infoCategory(iCat !== -1 ? cells[iCat] || '' : ''),
          credits: cr <= 20 ? cr : 0,
          semester: sem0?.slice(0, 10),
          grade: gradeCell.slice(0, 10),
          area: courseArea(cells),
        });
        continue;
      }
      // 미이수 등급(NP·U·낙제 등)은 이수 목록에서 제외 — D학점까지는 이수.
      if (/^(FA|NP|N|U|I|낙제|불합격|미이수|포기)/i.test(gradeCell))
        continue;
      const sem = sem0;
      const key = normKey(name) + '|' + (sem ?? '');
      if (seen.has(key)) continue;
      seen.add(key);
      completed.push({
        code: code.slice(0, 30),
        name: name.slice(0, 100),
        category: infoCategory(iCat !== -1 ? cells[iCat] || '' : ''),
        credits: cr <= 20 ? cr : 0,
        semester: sem?.slice(0, 10),
        grade: gradeCell ? gradeCell.slice(0, 10) : undefined,
        area: courseArea(cells),
      });
    }
  }
  // 테이블에서 못 구했으면 페이지 텍스트 첫 매치를 총계로 사용한다
  // (총 성적 내역 블록이 학기별 카드보다 문서상 먼저 온다)
  const text = plainText(html);
  if (credits === undefined) {
    const cm = text.match(/취득\s*학점[^0-9]{0,8}(\d{1,3})/);
    if (cm) credits = parseInt(cm[1], 10);
  }
  if (gpa === undefined) {
    const gm =
      text.match(/평균\s*평점[^0-9]{0,8}(\d(?:\.\d{1,2})?)/) ??
      text.match(/평점\s*평균[^0-9]{0,8}(\d(?:\.\d{1,2})?)/);
    if (gm) gpa = parseFloat(gm[1]);
  }
  return { completed: completed.slice(0, 300), failedCourses: failedCourses.slice(0, 300), credits, gpa, recognized, hasUnconfirmed };
}

/** 졸업요건은 수치 추정 없이 각 표의 열과 행을 원문 순서대로 보관한다. */
export function parseRequirementTables(html: string): InfoRequirementTable[] {
  const out: InfoRequirementTable[] = [];
  for (const match of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1].matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => {
        const span = (key: string) => Math.min(20, Math.max(1, Number(cell[2].match(new RegExp(`\\b${key}\\s*=\\s*["']?(\\d+)`, 'i'))?.[1] ?? 1)));
        return { text: plainText(cell[3]).slice(0, 200), colspan: span('colspan'), rowspan: span('rowspan'), header: cell[1].toLowerCase() === 'h' };
      }).slice(0, 20),
    ).filter((row) => row.some((cell) => cell.text));
    if (rows.length < 2 || !/졸업|트랙|전공|이수|학점|요건/.test(rows.flat().map((cell) => cell.text).join(' '))) continue;
    const before = html.slice(Math.max(0, (match.index ?? 0) - 1200), match.index);
    const titles = [...before.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|<caption\b[^>]*>([\s\S]*?)<\/caption>/gi)];
    const title = titles.at(-1);
    const caption = match[1].match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i);
    out.push({ heading: plainText(caption?.[1] ?? title?.[1] ?? title?.[2] ?? '').slice(0, 120), rows: rows.slice(0, 80) });
    if (out.length === 12) break;
  }
  return out;
}

const normKey = (s: string) => s.replace(/\s+/g, '');

const GRADE_RE =
  /^(A\+|A0|A-|B\+|B0|B-|C\+|C0|C-|D\+|D0|D-|F|FA|P|NP|N|U|I|S)$/i;
const CATEGORY_RE =
  /^(전필|전선|전기|교필|선필교|일교|일선|교양|전공|일반|기초|토대|핵심|소양|자율|한성인재|소계|합계|총계|이수)$/;
const isCourseName = (s: string) => {
  const t = s.trim();
  return (
    t.length >= 2 &&
    t.length <= 100 &&
    /[가-힣A-Za-z]/.test(t) &&
    !/^(구분|교과목명?|과목명?|교과명|강좌명|학점|성적|등급|이수구분|코드|비고|현재트랙.*)$/.test(
      t,
    ) &&
    !CATEGORY_RE.test(t)
  );
};

/** 헤더 없는 성적 표 — 등급 셀을 기준으로 과목·학점·코드를 역추적한다.
 *  새 성적 화면은 표마다 헤더가 없거나 th에 과목명이 올 수 있어
 *  고정 열 번호 대신 값의 형태로 열을 찾는다. */
function parseHeuristicRows(rows: string[][], semester?: string): InfoCourse[] {
  const out: InfoCourse[] = [];
  for (const cells of rows) {
    if (cells.length < 4) continue;
    const gradeIdx = cells.findIndex((c) => GRADE_RE.test(c.trim()));
    if (gradeIdx < 0) continue;
    const crIdx = cells.findIndex(
      (c, i) =>
        i !== gradeIdx &&
        /^\d{1,2}(?:\.\d)?$/.test(c.trim()) &&
        parseFloat(c) > 0 &&
        parseFloat(c) <= 20,
    );
    if (crIdx < 0) continue;
    const nameIdx = cells.findIndex(
      (c, i) => i !== crIdx && i !== gradeIdx && isCourseName(c),
    );
    if (nameIdx < 0) continue;
    const catIdx = cells.findIndex(
      (c, i) =>
        i < nameIdx &&
        /전필|전선|전기|교필|선필교|일교|일선|교양|전공|일반|기초|토대|핵심|소양|자율|한성인재/.test(
          c,
        ),
    );
    const codeIdx = cells.findIndex(
      (c, i) =>
        i !== nameIdx &&
        i !== crIdx &&
        i !== gradeIdx &&
        /^[A-Z]{1,4}\d{2,5}[A-Z0-9]*$/i.test(c.trim()),
    );
    out.push({
      code: (codeIdx >= 0 ? cells[codeIdx] : '미확인').slice(0, 30),
      name: cells[nameIdx].slice(0, 100),
      category: infoCategory(catIdx >= 0 ? cells[catIdx] : ''),
      credits: parseFloat(cells[crIdx]),
      semester,
      grade: cells[gradeIdx].slice(0, 10),
    });
  }
  return out;
}

/** 비교과 포인트 페이지 — 총점/합계 행 우선, 없으면 표 본문 합산은 하지 않는다(중복 위험). */
export function parsePoints(html: string): number | undefined {
  for (const t of tables(html)) {
    const joined = t.head.join(' ');
    if (!/포인트|점수/.test(joined)) continue;
    for (const cells of t.rows) {
      const rowText = cells.join(' ');
      if (!/총점|합계|총계|총\s*포인트|누적/.test(rowText)) continue;
      const numbers = cells.map(num).filter((n): n is number => n !== null);
      if (numbers.length) return numbers[numbers.length - 1];
    }
  }
  const text = plainText(html);
  const m =
    text.match(/(?:총|취득|누적)\s*비교과?\s*포인트[^0-9]{0,8}(\d[\d,]*)/) ??
    text.match(/비교과\s*포인트[^0-9]{0,10}(\d[\d,]*)\s*(?:P|점)/) ??
    text.match(/총\s*포인트[^0-9]{0,8}(\d[\d,]*)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : undefined;
}

/** 졸업가사정표 — 구분/기준/취득/판정 행을 원문 그대로 뽑는다. */
export function parseAudit(html: string): InfoAuditRow[] | undefined {
  for (const t of tables(html)) {
    const iArea = col(t.head, [/구분|항목|영역|요건/]);
    const iReq = col(t.head, [/기준|필요|요건|목표/]);
    const iGot = col(t.head, [/취득|이수|현황|인정/]);
    const iVerdict = col(t.head, [/판정|결과|충족|가부|심사/]);
    if (iArea === -1 || (iReq === -1 && iGot === -1)) continue;
    const rows = t.rows
      .filter((c) => c.length > iArea && c[iArea])
      .slice(0, 40)
      .map((c) => ({
        area: c[iArea].slice(0, 40),
        required: (iReq !== -1 ? c[iReq] : '').slice(0, 40),
        earned: (iGot !== -1 ? c[iGot] : '').slice(0, 40),
        verdict: (iVerdict !== -1 ? c[iVerdict] : '').slice(0, 40),
      }))
      .filter((r) => r.area && !/구분|항목/.test(r.area));
    if (rows.length) return rows;
  }
  return undefined;
}

const TERM_CODE: Record<string, string> = {
  '1': '1',
  '2': '2',
  여름: 'S',
  겨울: 'W',
};

const semesterCode = (year: string, term: string) =>
  `${year}-${TERM_CODE[term] ?? term}`;

const isoDate = (raw: string) => {
  const m = raw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  return m
    ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    : undefined;
};

/** 학적 페이지 — 학년·재학상태·제1/2트랙·입학일자를 라벨/값 쌍으로 읽는다. */
export function parseAcademic(html: string): InfoAcademic | undefined {
  const text = plainText(html);
  const cellPair = (labelRe: RegExp) => {
    const m = html.match(
      new RegExp(
        `<t[dh][^>]*>\\s*(?:${labelRe.source})\\s*[:：]?\\s*</t[dh]>\\s*<t[dh][^>]*>([\\s\\S]{1,80}?)</t[dh]>`,
        'i',
      ),
    );
    return m?.[1] ? plainText(m[1]) : '';
  };
  const textPair = (labelRe: RegExp) => {
    const m = text.match(
      new RegExp(`(?:${labelRe.source})\\s*[:：]?\\s*([^\\s]{1,40})`),
    );
    return m?.[1] ?? '';
  };
  const gradeRaw = cellPair(/학년/) || textPair(/학년/);
  const gradeMatch = gradeRaw.match(/\d/);
  const statusRaw =
    cellPair(/상태|학적\s*상태/) ||
    text.match(/(재학|휴학|졸업|수료|제적|유예|군휴학)/)?.[1] ||
    '';
  const track1 = cellPair(/제\s*1\s*트랙|트랙\s*1|주전공/);
  const track2 = cellPair(/제\s*2\s*트랙|트랙\s*2|복수전공|부전공/);
  const tracks = [track1, track2]
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 40);
  const admissionDate = isoDate(cellPair(/입학일자|입학일/));
  if (!gradeMatch && !statusRaw && !tracks.length && !admissionDate)
    return undefined;
  return {
    grade: gradeMatch ? parseInt(gradeMatch[0], 10) : undefined,
    status: statusRaw ? statusRaw.slice(0, 20) : undefined,
    tracks: tracks.length ? tracks : undefined,
    admissionDate,
  };
}

/** 누적 이수구분별 취득학점 — 상단 요약 블록의 라벨/숫자만 사용한다.
 *  과목 행의 이수구분과 섞이지 않도록 div_total 블록 안으로 제한한다. */
export function parseCreditCategories(
  html: string,
): InfoCreditCategory[] | undefined {
  const block =
    /id=["']div_total["'][\s\S]*?(?=id=["']main_content["']|$)/i.exec(
      html,
    )?.[0] ?? '';
  if (!block) return undefined;
  const source = plainText(block).slice(0, 3000);
  const labels = [
    '기초(필수)',
    '기초',
    '토대',
    '한성인재',
    '자율',
    '소양',
    '핵심',
    '전필',
    '전기',
    '전지',
    '전선',
    '교필',
    '일교',
    '일선',
    '교직선',
    '교직',
    '부전지',
    '부전선',
    '부전기',
    '복전지',
    '복전선',
    '복전기',
    '연전지',
    '연전선',
    '연전기',
  ].sort((a, b) => b.length - a.length);
  const out: InfoCreditCategory[] = [];
  for (const label of labels) {
    if (out.some((c) => c.label.includes(label))) continue;
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = source.match(
      new RegExp(`${esc}\\s*(?:학점)?\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)`),
    );
    if (!m) continue;
    const credits = parseFloat(m[1]);
    if (Number.isFinite(credits)) out.push({ label, credits });
  }
  return out.length ? out.slice(0, 30) : undefined;
}

/** 학기별 성적 페이지 — 학기 라벨 구간마다 요약 숫자와 과목을 묶는다.
 *  total_grade.jsp와 seongjeok_new_rwd.jsp/seongjeok.jsp의 공통 형태를
 *  모두 처리하도록 표 헤더에 의존하지 않는 parseGrades를 재사용한다. */
export function parseSemesterGrades(html: string): {
  semesters: InfoSemester[];
  creditCategories?: InfoCreditCategory[];
  recognized: boolean;
} {
  const grades = parseGrades(html);
  const text = plainText(html);
  const labelRe = /(20\d{2})\s*(?:학년도|년)?\s*(1|2|여름|겨울)\s*학기/g;
  const labels = [...text.matchAll(labelRe)];
  const recognized = grades.recognized || labels.length > 0;
  if (!labels.length) {
    return {
      semesters: [],
      creditCategories: parseCreditCategories(html),
      recognized,
    };
  }
  const seen = new Set<string>();
  const semesters: InfoSemester[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const code = semesterCode(label[1], label[2]);
    if (seen.has(code)) continue;
    seen.add(code);
    const start = label.index ?? 0;
    const end = labels[i + 1]?.index ?? Math.min(text.length, start + 3000);
    // 라벨 뒤쪽만 본다 — 앞쪽을 포함하면 상단 누적 요약(전체 학점/평점)이
    // 모든 학기의 값으로 복사된다.
    const windowText = text.slice(start, end);
    const n = (re: RegExp) => {
      const hit = windowText.match(re);
      return hit ? parseFloat(hit[1].replace(/,/g, '')) : undefined;
    };
    const applied = n(/신청\s*학점\s*[:：]?\s*([\d,]+(?:\.\d+)?)/);
    const earned = n(/취득\s*학점\s*[:：]?\s*([\d,]+(?:\.\d+)?)/);
    const totalScore = n(/평점\s*총계\s*[:：]?\s*([\d,]+(?:\.\d+)?)/);
    const gpa =
      n(/평균\s*평점\s*[:：]?\s*([\d.]+)/) ??
      n(/평점\s*평균\s*[:：]?\s*([\d.]+)/);
    const percentile = n(/백분위\s*(?:점수)?\s*[:：]?\s*([\d.]+)/);
    const courses = grades.completed.filter((c) => c.semester === code);
    if (
      !courses.length &&
      applied === undefined &&
      earned === undefined &&
      gpa === undefined
    )
      continue;
    semesters.push({
      semester: code,
      applied,
      earned:
        earned ??
        (courses.length
          ? courses.reduce((sum, c) => sum + c.credits, 0)
          : undefined),
      totalScore,
      gpa,
      percentile,
      courses,
    });
  }
  semesters.sort((a, b) => b.semester.localeCompare(a.semester));
  return {
    semesters,
    creditCategories: parseCreditCategories(html),
    recognized,
  };
}

/** 학번 → 입학연도. 한성대 학번은 앞자리가 입학연도다 —
 *  8자리 이상이면 앞 4자리(20241234→2024), 7자리면 앞 2자리+2000(2591037→2025). */
const admitYearOf = (id: string): number | undefined => {
  const d = id.replace(/\D/g, '');
  if (d.length >= 8) {
    const y = parseInt(d.slice(0, 4), 10);
    if (y >= 1990 && y <= 2100) return y;
  }
  if (d.length >= 7) {
    const y = 2000 + parseInt(d.slice(0, 2), 10);
    if (y >= 2000 && y <= 2100) return y;
  }
  return undefined;
};

/** 학적 요약 — 라벨/값 테이블 쌍과 본문 패턴에서 이름·소속·학번을 찾는다.
 *  실제 마크업은 두 형태다 — 헤더 바 '<font>이름 : 홍길동</font>'과
 *  성적 페이지 신원 라인 '홍길동 (2591037) AI응용학과'. */
export function parseIdentity(html: string): {
  name?: string;
  dept?: string;
  track?: string;
  tracks?: string[];
  admitYear?: number;
} {
  const out: { name?: string; dept?: string; track?: string; tracks?: string[]; admitYear?: number } = {};
  let sid = '';
  // <th>라벨</th><td>값</td> 패턴
  const pair = (labelRe: RegExp) => {
    const m = html.match(
      new RegExp(
        `<t[dh][^>]*>\\s*(?:${labelRe.source})\\s*</t[dh]>\\s*<t[dh][^>]*>([\\s\\S]{1,60}?)</t[dh]>`,
        'i',
      ),
    );
    return m?.[1] ? plainText(m[1]) : '';
  };
  const dept = pair(/소속|학과|학부|전공|학부\(과\)/);
  if (dept && /[가-힣]/.test(dept) && dept.length <= 40) out.dept = dept;
  const track1 = pair(/제\s*1\s*트랙|1\s*트랙/);
  const track2 = pair(/제\s*2\s*트랙|2\s*트랙/);
  const tracks = [track1, track2].filter((v) => !!v && /[가-힣]/.test(v) && v.length <= 40);
  if (tracks.length) out.tracks = tracks;
  const track = track2 || track1 || pair(/트랙/);
  if (track && /[가-힣]/.test(track) && track.length <= 40) out.track = track;
  const name = pair(/성명|이름/);
  if (/^[가-힣]{2,5}$/.test(name)) out.name = name;
  const idText = pair(/학번|학번\(사번\)|등록번호/) ||
    html.match(/학번[^0-9]{0,10}(\d{7,10})/)?.[1] || '';
  const idm = idText.match(/\d{6,10}/);
  if (idm) sid = idm[0];
  const text = plainText(html);
  if (!out.track) {
    const m = text.match(/(?:제\s*1\s*트랙|1\s*트랙|트랙)\s*[:：]\s*([가-힣A-Za-z·()]{2,30}?)(?=\s*(?:이름|학부|학번|소속|$))/);
    if (m) out.track = m[1];
  }
  // '이름 : 홍길동' — 다음 라벨이나 끝에서 끊는다 (붙어 있을 수 있음)
  if (!out.name) {
    const m = text.match(
      /이름\s*[:：]\s*([가-힣]{2,5}?)(?=\s*(?:학부|전공|학번|$))/,
    );
    if (m) out.name = m[1];
  }
  // '학부(과) : AI응용학과' — '전공 :' 라벨 앞에서 끊는다
  if (!out.dept) {
    const m =
      text.match(
        /학부\s*\(과\)\s*[:：]\s*([가-힣A-Za-z·()]{2,30}?)(?=\s*(?:전공|이름|학번|$))/,
      ) ??
      text.match(
        /전공\s*[:：]\s*([가-힣A-Za-z·()]{2,30}?)(?=\s*(?:이름|학부|학번|$))/,
      );
    if (m) out.dept = m[1];
  }
  // '홍길동 (2591037) AI응용학과 2 학년' 신원 라인
  const idLine = text.match(
    /([가-힣]{2,5})\s*\(\s*(\d{6,10})\s*\)\s*([가-힣A-Za-z·]{2,30})/,
  );
  if (idLine) {
    out.name ??= idLine[1];
    if (!out.dept) out.dept = idLine[3];
    if (!sid) sid = idLine[2];
  }
  const year = sid ? admitYearOf(sid) : undefined;
  if (year) out.admitYear = year;
  return out;
}

/** 세션으로 발견된 목표 페이지를 가져와 스냅샷을 조립한다.
 *  메뉴는 두 라운드로 찾는다 — ① dae_main 프레임셋의 좌/우 프레임
 *  (left.jsp + 포털 메인의 사이드바) ② 수집된 페이지 안의 사이드바.
 *  예외는 밖으로 던지지 않는다 — 모든 실패는 diag.pages로 표현한다. */
export async function collectInfo(
  session: InfoSession,
  ctx: { menuHtml: string; mainHtml: string; studentId?: string },
): Promise<InfoSnapshot> {
  const pages: NonNullable<InfoSnapshot['diag']>['pages'] = [];
  const fetched: Record<string, string> = {};
  const menuHtmls: string[] = [ctx.menuHtml, ctx.mainHtml];

  const get = async (
    path: string,
  ): Promise<{ html: string | null; reason?: InfoPageFailure }> => {
    const url = toUrl(path);
    // 5xx만 한 번 재시도한다 — 세션 만료·로그인 벽은 재시도해도 같고,
    // 네트워크 타임아웃을 두 번 기다리면 수집 예산을 크게 잡아먹는다.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await session.follow(await session.request(url), url);
        if (!res.ok) {
          if (attempt === 0 && res.status >= 500) {
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          return { html: null, reason: 'upstream' };
        }
        const html = await decode(res);
        return isLoginWall(html)
          ? { html: null, reason: 'session-expired' }
          : { html };
      } catch {
        return { html: null, reason: 'upstream' };
      }
    }
    return { html: null, reason: 'upstream' };
  };

  // 1차 메뉴 소스 — 프레임셋의 프레임들 (left.jsp가 실제 네비게이션).
  // 프레임이 없는 구형 레이아웃이면 레거시 좌측 메뉴 서블릿을 시도한다.
  const frames = frameSrcs(ctx.mainHtml).slice(0, 4);
  const menuSources = frames.length
    ? frames
    : ['s_gong.gong_dae_left_menu'];
  await Promise.all(
    menuSources.map(async (src) => {
      const { html, reason } = await get(src);
      pages.push({ slot: 'menu', path: src, ok: html !== null, ...(reason ? { reason } : {}) });
      if (html) menuHtmls.push(html);
    }),
  );

  const menuItems = () => {
    const seen = new Set<string>();
    const out: InfoMenuItem[] = [];
    for (const h of menuHtmls)
      for (const it of parseInfoMenu(h)) {
        const k = it.path + '|' + it.label;
        if (!seen.has(k)) {
          seen.add(k);
          out.push(it);
        }
      }
    return out;
  };

  const fetchSlot = async (slot: string, path: string) => {
    const { html, reason } = await get(path);
    pages.push({ slot, path, ok: html !== null, ...(reason ? { reason } : {}) });
    if (html !== null) fetched[slot] = html;
  };

  /** 후보 경로를 순서대로 시도하고, accept를 통과한 첫 응답만 채택한다. */
  const tryPaths = async (
    slot: string,
    paths: readonly string[],
    accept: (html: string) => boolean,
    force = false,
  ) => {
    if (fetched[slot] && !force) return true;
    for (const path of paths) {
      const { html, reason } = await get(path);
      const ok = html !== null && accept(html);
      pages.push({ slot, path, ok, ...(reason ? { reason } : {}) });
      if (ok) {
        fetched[slot] = html!;
        return true;
      }
    }
    return false;
  };

  const targets = pickTargets(menuItems());
  await Promise.all(
    Object.entries(targets).map(([slot, path]) => fetchSlot(slot, path)),
  );

  // 메뉴에서 못 찾았거나 라벨이 바뀐 슬롯은 직접 경로로 보완한다.
  // 성적·학적·학기별 성적은 메뉴 구조와 무관하게 항상 시도한다.
  await Promise.all([
    tryPaths('grades', DIRECT_PATHS.grades, (h) => parseGrades(h).recognized),
    tryPaths('semesterGrades', DIRECT_PATHS.semesterGrades, (h) =>
      parseSemesterGrades(h).recognized,
    ),
    tryPaths(
      'academic',
      DIRECT_PATHS.academic,
      (h) => h.trim().length > 0,
    ),
  ]);

  // 2차 탐색 — 가져온 페이지의 사이드바에서 못 찾은 슬롯을 재시도한다
  const deep = new Map<string, InfoMenuItem>();
  for (const h of [...Object.values(fetched), ...menuHtmls])
    for (const it of parseInfoMenu(h))
      if (!deep.has(it.path + '|' + it.label)) deep.set(it.path + '|' + it.label, it);
  const again = pickTargets([...deep.values()]);
  for (const { slot } of SLOTS) {
    if (!targets[slot] && again[slot]) {
      targets[slot] = again[slot];
      await fetchSlot(slot, again[slot]);
    }
  }

  // 사정표는 학교가 '자료 없음'으로 응답하는 경우가 잦다 — 다른 졸업요건
  // 페이지(graduation_requirement.jsp)로 한 번 더 시도한다.
  if (!fetched.audit || !parseAudit(fetched.audit)) {
    // '자료 없음' 응답은 실패가 아니라 빈 사정표다 — fetch 성공 표시는
    // 유지하고, 다른 졸업요건 페이지에서 값이 오면 그쪽으로 교체한다.
    await tryPaths('audit', DIRECT_PATHS.audit, (h) => !!parseAudit(h), true);
  }

  // 메뉴에 없던 직접 수집 슬롯까지 포함해 '찾지 못함'을 표면화한다.
  for (const slot of [
    'grades',
    'points',
    'audit',
    'requirements',
    'semesterGrades',
    'academic',
  ])
    if (!fetched[slot] && !pages.some((p) => p.slot === slot))
      pages.push({ slot, path: '-', ok: false, reason: 'missing' });

  const identity: { name?: string; dept?: string; track?: string; tracks?: string[]; admitYear?: number } = {};
  for (const h of [ctx.mainHtml, ctx.menuHtml, ...Object.values(fetched)]) {
    const id = parseIdentity(h);
    identity.name ??= id.name;
    identity.dept ??= id.dept;
    identity.track ??= id.track;
    identity.tracks ??= id.tracks;
    identity.admitYear ??= id.admitYear;
  }
  // 페이지에서 학번을 못 찾으면 로그인 학번으로 입학연도를 채운다
  if (!identity.admitYear && ctx.studentId)
    identity.admitYear = admitYearOf(ctx.studentId);

  let grades = fetched.grades !== undefined
    ? parseGrades(fetched.grades)
    : { completed: [], failedCourses: [], recognized: false, hasUnconfirmed: false };
  // 메뉴가 구형 성적 페이지를 가리키면 새 누적성적 페이지로 한 번 더 시도한다.
  if (fetched.grades !== undefined && !grades.recognized) {
    const direct = await tryPaths(
      'grades',
      DIRECT_PATHS.grades,
      (h) => parseGrades(h).recognized,
      true,
    );
    if (direct && fetched.grades !== undefined)
      grades = parseGrades(fetched.grades);
  }
  // 정상 HTTP 응답이라도 성적표의 필수 열이 사라지면 빈 이수 목록으로
  // 기존 결과를 교체하지 않는다. 헤더가 있는 빈 표는 정상 빈 목록이다.
  if (fetched.grades !== undefined && (!grades.recognized || grades.hasUnconfirmed)) {
    for (const page of pages) if (page.slot === 'grades' && page.ok) {
      page.ok = false;
      page.reason = grades.recognized ? 'unconfirmed' : 'structure';
    }
  }

  const semesterParsed = fetched.semesterGrades
    ? parseSemesterGrades(fetched.semesterGrades)
    : { semesters: [], creditCategories: undefined, recognized: false };
  if (fetched.semesterGrades && !semesterParsed.recognized) {
    for (const page of pages)
      if (page.slot === 'semesterGrades' && page.ok) {
        page.ok = false;
        page.reason = 'structure';
      }
  }
  const academic = fetched.academic ? parseAcademic(fetched.academic) : undefined;
  const requirements = fetched.requirements
    ? parseRequirementTables(fetched.requirements)
    : undefined;
  if (fetched.requirements !== undefined && !requirements?.length)
    for (const page of pages)
      if (page.slot === 'requirements' && page.ok) {
        page.ok = false;
        page.reason = 'structure';
      }
  const menu = menuItems();
  const fetchedAt = new Date().toISOString();
  const snap: InfoSnapshot = {
    source: 'info-hansung',
    fetchedAt,
    ...identity,
    credits: grades.credits,
    gpa: grades.gpa,
    gpaVerifiedAt:
      grades.recognized && !grades.hasUnconfirmed && grades.gpa !== undefined
        ? fetchedAt
        : undefined,
    points: fetched.points ? parsePoints(fetched.points) : undefined,
    completed: grades.completed,
    failedCourses: grades.failedCourses.length ? grades.failedCourses : undefined,
    requirements,
    academic,
    semesters: semesterParsed.semesters.length
      ? semesterParsed.semesters
      : undefined,
    creditCategories: semesterParsed.creditCategories,
    audit: fetched.audit ? parseAudit(fetched.audit) : undefined,
    diag: { menu, pages },
  };
  console.log(
    '[info] collect:',
    JSON.stringify({
      menu: menu.length,
      pages: pages.map((p) => `${p.slot}:${p.ok ? 'ok' : p.reason ?? 'fail'}`),
      courses: snap.completed.length,
      semesters: snap.semesters?.length ?? 0,
      academic: snap.academic ? 'yes' : 'no',
      name: snap.name ? 'yes' : 'no',
      dept: snap.dept ? 'yes' : 'no',
    }),
  );
  return snap;
}
