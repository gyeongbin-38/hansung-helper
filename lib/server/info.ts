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
  InfoAuditRow,
  InfoCourse,
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
const SLOTS: { slot: string; res: RegExp[] }[] = [
  {
    slot: 'grades',
    res: [
      /누적|전체\s*성적|이수\s*(내역|현황)/,
      /성적\s*조회|성적표\s*조회|성적/,
    ],
  },
  { slot: 'points', res: [/비교과.*포인트/, /포인트.*(조회|내역|현황)/] },
  {
    slot: 'audit',
    res: [/졸업.*(가?사정|심사)|사정표/, /졸업요건|졸업\s*기준/],
  },
];

export function pickTargets(menu: InfoMenuItem[]) {
  const found: Record<string, string> = {};
  for (const { slot, res } of SLOTS)
    for (const re of res) {
      const hit = menu.find((m) => re.test(m.label));
      if (hit) {
        found[slot] = hit.path;
        break;
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
  credits?: number;
  gpa?: number;
} {
  const completed: InfoCourse[] = [];
  const seen = new Set<string>();
  let credits: number | undefined;
  let gpa: number | undefined;
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
    if (iName === -1 || iCredits === -1) continue;
    // 성적 열이 비어 있는 행(미확정)은 이수로 세지 않는다 — 단, 표 전체가
    // 빈 성적 열이면 구형 포맷으로 간주해 행을 버리지 않는다.
    const anyGrade =
      iGrade !== -1 &&
      rows.slice(headerIdx + 1).some((c) => (c[iGrade] ?? '').trim());
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
      // 미이수 등급(F·NP·U·낙제 등)은 이수 목록에서 제외 — D학점까지는 이수.
      if (/^(F|FA|NP|N|U|I|낙제|불합격|미이수|포기)/i.test(gradeCell))
        continue;
      if (anyGrade && !gradeCell) continue;
      const code = iCode !== -1 ? cells[iCode] || '미확인' : '미확인';
      const sem =
        (iSem !== -1 &&
          cells[iSem]?.match(/(20\d{2})\s*(?:-|학년도|년)?\s*(1|2|여름|겨울)/)
            ?.slice(1)
            .join('-')) ||
        curSem;
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
  return { completed: completed.slice(0, 300), credits, gpa };
}

const normKey = (s: string) => s.replace(/\s+/g, '');

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
  admitYear?: number;
} {
  const out: { name?: string; dept?: string; admitYear?: number } = {};
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
  const name = pair(/성명|이름/);
  if (/^[가-힣]{2,5}$/.test(name)) out.name = name;
  const idText = pair(/학번|학번\(사번\)|등록번호/) ||
    html.match(/학번[^0-9]{0,10}(\d{7,10})/)?.[1] || '';
  const idm = idText.match(/\d{6,10}/);
  if (idm) sid = idm[0];
  const text = plainText(html);
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
  const pages: { slot: string; path: string; ok: boolean }[] = [];
  const fetched: Record<string, string> = {};
  const menuHtmls: string[] = [ctx.menuHtml, ctx.mainHtml];

  const get = async (path: string): Promise<string | null> => {
    const url = toUrl(path);
    try {
      const res = await session.follow(await session.request(url), url);
      const html = await decode(res);
      return isLoginWall(html) ? null : html;
    } catch {
      return null;
    }
  };

  // 1차 메뉴 소스 — 프레임셋의 프레임들 (left.jsp가 실제 네비게이션).
  // 프레임이 없는 구형 레이아웃이면 레거시 좌측 메뉴 서블릿을 시도한다.
  const frames = frameSrcs(ctx.mainHtml).slice(0, 4);
  const menuSources = frames.length
    ? frames
    : ['s_gong.gong_dae_left_menu'];
  await Promise.all(
    menuSources.map(async (src) => {
      const html = await get(src);
      pages.push({ slot: 'menu', path: src, ok: html !== null });
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
    const html = await get(path);
    pages.push({ slot, path, ok: html !== null });
    if (html !== null) fetched[slot] = html;
  };

  const targets = pickTargets(menuItems());
  await Promise.all(
    Object.entries(targets).map(([slot, path]) => fetchSlot(slot, path)),
  );

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

  // 못 찾은 슬롯도 diag에 남긴다 — '찾지 못함'과 '가져오기 실패'를 구분
  for (const { slot } of SLOTS)
    if (!fetched[slot] && !pages.some((p) => p.slot === slot))
      pages.push({ slot, path: '-', ok: false });

  const identity: { name?: string; dept?: string; admitYear?: number } = {};
  for (const h of [ctx.mainHtml, ctx.menuHtml, ...Object.values(fetched)]) {
    const id = parseIdentity(h);
    identity.name ??= id.name;
    identity.dept ??= id.dept;
    identity.admitYear ??= id.admitYear;
  }
  // 페이지에서 학번을 못 찾으면 로그인 학번으로 입학연도를 채운다
  if (!identity.admitYear && ctx.studentId)
    identity.admitYear = admitYearOf(ctx.studentId);

  const grades = fetched.grades
    ? parseGrades(fetched.grades)
    : { completed: [] };
  const menu = menuItems();
  const snap: InfoSnapshot = {
    source: 'info-hansung',
    fetchedAt: new Date().toISOString(),
    ...identity,
    credits: grades.credits,
    gpa: grades.gpa,
    points: fetched.points ? parsePoints(fetched.points) : undefined,
    completed: grades.completed,
    audit: fetched.audit ? parseAudit(fetched.audit) : undefined,
    diag: { menu, pages },
  };
  console.log(
    '[info] collect:',
    JSON.stringify({
      menu: menu.length,
      targets,
      pages: pages.map((p) => `${p.slot}:${p.ok ? 'ok' : 'fail'}`),
      courses: snap.completed.length,
      points: snap.points ?? null,
      credits: snap.credits ?? null,
      name: snap.name ? 'yes' : 'no',
      dept: snap.dept ? 'yes' : 'no',
    }),
  );
  return snap;
}
