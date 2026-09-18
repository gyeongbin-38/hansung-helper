// dept-rules 파서 단위 테스트 — node --experimental-strip-types tests/dept-rules.test.mjs
import {
  extractAttachment,
  extractRulesText,
  inferDeptLabel,
  isMultiDeptPage,
  isRulesetAnomalous,
  pairDeptRules,
  parseSitemapLinks,
  parseYearLabel,
  parseYearTable,
  yearColumnIndex,
} from '../lib/data/dept-rules.ts';

let pass = 0, fail = 0;
const t = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL:', name);
  }
};

// --- parseSitemapLinks ---
const SITEMAP = `
  <a href="/CreCon/2772/subview.do">문학문화콘텐츠학과</a>
  <a href="/CreCon/2772/subview.do">학과소개</a>
  <a href="/CreCon/2773/subview.do">교수소개</a>
  <a href="/CreCon/2772/subview.do">졸업요건</a>
  <a href="/Design/5103/subview.do">글로벌패션산업학부</a>
  <a href="/Design/5108/subview.do">트랙졸업요건</a>
  <a href="/other/1/subview.do">외부링크</a>
`;
const links = parseSitemapLinks(SITEMAP, 'CreCon');
t('sitemap: slug 내 링크만 수집', links.every((l) => l.url.startsWith('/CreCon/')));
t('sitemap: 링크 수', links.length === 4);
t('sitemap: 라벨 보존', links[0].label === '문학문화콘텐츠학과');

// --- pairDeptRules: 학과명 라벨 경로 ---
const pairs1 = pairDeptRules(links);
t('pair: 학과명→졸업요건 연결', pairs1.some((p) => p.deptLabel === '문학문화콘텐츠학과' && p.url === '/CreCon/2772/subview.do'));
// 트랙졸업요건은 다른 slug라 링크 자체가 없음 — 같은 slug로 재구성
const links2 = [
  { url: '/Design/5103/subview.do', label: '글로벌패션산업학부' },
  { url: '/Design/5108/subview.do', label: '트랙졸업요건' },
];
const pairs2 = pairDeptRules(links2);
t('pair: DEPT_NAME 라벨 경로', pairs2.length === 1 && pairs2[0].deptLabel === '글로벌패션산업학부');

// --- pairDeptRules: 학과 소개 라벨 경로 (학과명이 학과/학부로 안 끝남) ---
const links3 = [
  { url: '/global/1511/subview.do', label: '학과 소개' },
  { url: '/global/1511/subview.do', label: '한국언어문화교육' },
  { url: '/global/1512/subview.do', label: '교수 소개' },
  { url: '/global/7579/subview.do', label: '졸업 요건' },
  { url: '/global/1516/subview.do', label: '글로벌K비즈니스' },
  { url: '/global/1516/subview.do', label: '학과 소개' },
  { url: '/global/7580/subview.do', label: '졸업 요건' },
];
const pairs3 = pairDeptRules(links3);
t('pair: intro-라벨 경로(첫 라벨이 소개 자체)', pairs3[0]?.deptLabel === '한국언어문화교육' && pairs3[0]?.url === '/global/7579/subview.do');
t('pair: intro-라벨 경로(학과명 먼저)', pairs3[1]?.deptLabel === '글로벌K비즈니스' && pairs3[1]?.url === '/global/7580/subview.do');

// 학과 없는 사이트 → 빈 라벨로 pair
const pairs4 = pairDeptRules([{ url: '/CSE/1564/subview.do', label: '졸업 요건' }]);
t('pair: 학과 미확정도 수집', pairs4.length === 1 && pairs4[0].deptLabel === '');

// --- extractRulesText: 본문 컨테이너 ---
const PAGE = `
<html><body>
<nav><a>졸업요건</a><a>공지사항</a></nav>
<div id="contentsEditHtml">
  <p>융합보안학과 졸업요건</p>
  <p>&bull; 보안 엔지니어링 역량(5개 중 택 1)</p>
  <p>1. 교외 학술대회 발표 (1저자)</p>
  <p>&nbsp;- 공인 영어 성적 취득</p>
</div>
<footer><p>개인정보처리방침</p><p>COPYRIGHT</p></footer>
</body></html>`;
const ex = extractRulesText(PAGE);
t('extract: 본문만 추출(nav 제외)', !ex.includes('공지사항'));
t('extract: 규정 라인 포함', ex.some((l) => l.includes('교외 학술대회')));
t('extract: 엔티티 디코드', ex.some((l) => l.startsWith('- 공인 영어')));
t('extract: 푸터 제외', !ex.some((l) => l.includes('개인정보처리방침') || l.includes('COPYRIGHT')));

// nav만 있고 본문 비어있으면 빈 배열(Design형)
const EMPTY_PAGE = `<div id="contentsEditHtml"></div><footer>개인정보처리방침</footer>`;
t('extract: 빈 본문 → []', extractRulesText(EMPTY_PAGE).length === 0);

// 컨테이너 없을 때 제목 앵커 폴백
const NO_CONTAINER = `<body><p>공지사항</p><p>AI응용학과 졸업요건</p><p>필수요건 만족 필요</p><p>개인정보처리방침</p></body>`;
const exF = extractRulesText(NO_CONTAINER);
t('extract: 폴백 앵커', exF[0] === 'AI응용학과 졸업요건' && exF.includes('필수요건 만족 필요') && !exF.includes('개인정보처리방침'));

// --- extractAttachment ---
t('attach: hwp 라벨', extractAttachment(`<a href="/file/x.hwp">졸업요건 안내.hwp</a>`) === '졸업요건 안내.hwp');
t('attach: 없으면 null', extractAttachment('<p>본문</p>') === null);

// --- inferDeptLabel / isMultiDeptPage / isRulesetAnomalous ---
t('infer: 학과명 추정', inferDeptLabel(['~ 15학번', '컴퓨터공학부', '이수 학점']) === '컴퓨터공학부');
t('infer: 없으면 빈값', inferDeptLabel(['규정1', '규정2']) === '');
t('multi: 복수 학과 라벨', isMultiDeptPage(['융합행정학과', '규정', '호텔외식경영학과']));
t('multi: 단일 학과', !isMultiDeptPage(['융합보안학과 졸업요건', '규정1', '규정2']));
t('anomaly: 규정 없음', isRulesetAnomalous({ deptLabel: 'x', dept: null, url: 'u', lines: ['TOP'] }));
t('anomaly: 한 줄 규정은 유효', !isRulesetAnomalous({ deptLabel: 'x', dept: null, url: 'u', lines: ['창작발표회 2회 졸업작품'] }));
t('anomaly: 첨부 있으면 유효', !isRulesetAnomalous({ deptLabel: 'x', dept: null, url: 'u', lines: [], attachment: '규정.hwp' }));

// --- parseYearLabel ---
t('year: ~15학번', parseYearLabel('~ 15학번').to === 2015 && parseYearLabel('~ 15학번').from === undefined);
t('year: 16학번', parseYearLabel('16학번').from === 2016 && parseYearLabel('16학번').to === 2016);
t('year: 17~23학번', parseYearLabel('17학번 ~23학번').from === 2017 && parseYearLabel('17학번 ~23학번').to === 2023);
t('year: 24학번~', parseYearLabel('24학번 ~').from === 2024 && parseYearLabel('24학번 ~').to === undefined);
t('year: 학번 없음', !parseYearLabel('이수 학점').from);

// --- parseYearTable (CSE/1564 형 fixture) ---
const CSE_PAGE = `
<div id="contentsEditHtml">
<table>
<tr><th>항목</th><th>졸업요건</th><th>~ 15학번</th><th>16학번</th><th>17학번 ~23학번</th><th>24학번 ~</th></tr>
<tr><td>이수 학점</td><td>총 취득 학점</td><td>140학점</td><td>교과 130학점, 비교과 800pt</td><td>교과 130학점, 비교과 800pt</td><td>교과 130학점, 비교과 800pt</td></tr>
<tr><td>캡스톤</td><td>작품 출품</td><td>V</td><td>V</td><td>V 필수</td><td>V 필수</td></tr>
<tr><td>트랙 이수</td><td>이수 트랙 수</td><td>X</td><td>1</td><td>2</td><td>2</td></tr>
</table>
</div>`;
const yt = parseYearTable(CSE_PAGE);
t('table: 파싱 성공', !!yt);
t('table: 컬럼 4개', yt?.columns.length === 4);
t('table: 컬럼 범위', yt?.columns[0].to === 2015 && yt?.columns[2].from === 2017 && yt?.columns[2].to === 2023);
t('table: 행 수', yt?.rows.length === 3);
t('table: 행 라벨 결합', yt?.rows[0].label === '이수 학점 / 총 취득 학점');
t('table: 셀 원문', yt?.rows[0].cells[1] === '교과 130학점, 비교과 800pt');
t('table: 학번 없는 표 → null', parseYearTable('<table><tr><td>a</td></tr></table>') === null);
t('table: 표 없음 → null', parseYearTable('<div>텍스트만</div>') === null);

// --- yearColumnIndex ---
t('col: 2014 → 0', yearColumnIndex(yt, 2014) === 0);
t('col: 2016 → 1', yearColumnIndex(yt, 2016) === 1);
t('col: 2020 → 2', yearColumnIndex(yt, 2020) === 2);
t('col: 2026 → 3', yearColumnIndex(yt, 2026) === 3);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
