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
    const p = path.trim().replace(/^\/+/, '');
    const l = label.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!p || /[:\\]/.test(p) || p.length > 80) return;
    const key = p + '|' + l;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ label: l, path: p });
  };
  // 태그 단위 스캔 — 속성 안의 경로 + 같은 태그의 라벨(alt/title/value/본문)
  for (const m of html.matchAll(/<(a|area|img|input|td|li)\b([^>]*)>([\s\S]*?)<\/\1>|<(a|area|img|input)\b([^>]*)\/?\s*>/gi)) {
    const attrs = m[2] ?? m[5] ?? '';
    const inner = m[3] ?? '';
    const pathMatch = attrs.match(PATH_RE);
    PATH_RE.lastIndex = 0;
    if (!pathMatch) continue;
    const full = pathMatch[0];
    const path = full.startsWith('servlet/') ? full.slice(8) : full;
    const label =
      attrs.match(/(?:alt|title|value)="([^"]{1,60})"/)?.[1] ??
      attrs.match(/(?:alt|title|value)='([^']{1,60})'/)?.[1] ??
      plainText(inner).slice(0, 60);
    push(label, path);
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
      /누적\s*성적|전체\s*성적|이수\s*(과목|내역|현황)/,
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
 *  과목명 컬럼과 학점 컬럼이 같은 헤더에 있어야 데이터 테이블로 인정한다. */
export function parseGrades(html: string): {
  completed: InfoCourse[];
  credits?: number;
  gpa?: number;
} {
  const completed: InfoCourse[] = [];
  const seen = new Set<string>();
  let credits: number | undefined;
  let gpa: number | undefined;
  // 테이블 앞 텍스트에서 학기 헤더를 찾는다 (예: "2024학년도 1학기")
  const chunks = html.split(/<table\b/i);
  for (let ti = 1; ti < chunks.length; ti++) {
    const block = chunks[ti].split(/<\/table>/i)[0] ?? '';
    const before = plainText(chunks[ti - 1].slice(-800));
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
        /(교과목명|과목명|강좌명|과목\s*명|교과목)/.test(joined) &&
        /학점/.test(joined)
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
    const iName = col(head, [/교과목명|과목명|강좌명|과목\s*명|교과목/]);
    const iCat = col(head, [/이수\s*구분|구분|이수구분/]);
    const iCredits = col(head, [/취득\s*학점|학점수|학점/]);
    const iGrade = col(head, [/등급|성적/]);
    const iSem = col(head, [/학기|년도/]);
    if (iName === -1 || iCredits === -1) continue;
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
      if (!name || cr === null || /^(소계|합계|총계|계)$/.test(name))
        continue;
      // 미이수 등급(F·NP·U·낙제 등)은 이수 목록에서 제외 — D학점까지는 이수.
      const gradeCell = iGrade !== -1 ? (cells[iGrade] ?? '').trim() : '';
      if (/^(F|FA|NP|N|U|I|낙제|불합격|미이수|포기)/i.test(gradeCell))
        continue;
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

/** 학적 요약 — 라벨/값 테이블 쌍과 본문 패턴에서 이름·소속·학번을 찾는다. */
export function parseIdentity(html: string): {
  name?: string;
  dept?: string;
  admitYear?: number;
} {
  const out: { name?: string; dept?: string; admitYear?: number } = {};
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
  const idm = idText.match(/\d{7,10}/) || idText.match(/\d{6,10}/);
  const year = idm ? parseInt(idm[0].slice(0, 4), 10) : 0;
  if (year >= 1990 && year <= 2100) out.admitYear = year;
  return out;
}

/** 세션으로 발견된 목표 페이지를 병렬로 가져와 스냅샷을 조립한다.
 *  예외는 밖으로 던지지 않는다 — 모든 실패는 diag.ok로 표현한다. */
export async function collectInfo(
  session: InfoSession,
  ctx: { menuHtml: string; mainHtml: string },
): Promise<InfoSnapshot> {
  const menu = [...parseInfoMenu(ctx.menuHtml)];
  for (const m of parseInfoMenu(ctx.mainHtml))
    if (!menu.some((x) => x.path === m.path)) menu.push(m);
  const targets = pickTargets(menu);
  const pages: { slot: string; path: string; ok: boolean }[] = [];
  const fetched: Record<string, string> = {};
  await Promise.all(
    Object.entries(targets).map(async ([slot, path]) => {
      const url = toUrl(path);
      try {
        const res = await session.follow(await session.request(url), url);
        const html = await decode(res);
        if (isLoginWall(html)) {
          pages.push({ slot, path, ok: false });
          return;
        }
        fetched[slot] = html;
        pages.push({ slot, path, ok: true });
      } catch {
        pages.push({ slot, path, ok: false });
      }
    }),
  );
  const identity = {
    ...parseIdentity(ctx.mainHtml),
    ...parseIdentity(ctx.menuHtml),
    ...(fetched.grades ? parseIdentity(fetched.grades) : {}),
  };
  const grades = fetched.grades
    ? parseGrades(fetched.grades)
    : { completed: [] };
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
