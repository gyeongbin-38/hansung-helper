// dept-rules 파서 단위 테스트 — node --experimental-strip-types tests/dept-rules.test.mjs
import {
  deptRuleTargets,
  extractAttachment,
  extractContentImage,
  extractRulesText,
  inferDeptLabel,
  isMultiDeptPage,
  isRulesetAnomalous,
  pairDeptRules,
  parseSitemapLinks,
  parseYearLabel,
  parseYearTable,
  rulesetMatchesDept,
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

// --- extractContentImage (Design형 이미지 게시 규정) ---
const IMG_PAGE = `
<div id="contentsEditHtml">
<article id="_contentBuilder">
<div class="_obj _objHtml"><div class="center">
<img class="imageInfo" src="/sites/Design/images/sub/temp_1.jpg" alt="패션마케팅트랙 졸업인증 요건">
</div></div>
</article>
</div></body>`;
const cimg = extractContentImage(IMG_PAGE);
t('image: src 절대화', cimg?.src === 'https://www.hansung.ac.kr/sites/Design/images/sub/temp_1.jpg');
t('image: alt 보존', cimg?.alt === '패션마케팅트랙 졸업인증 요건');
t('image: article 컨테이너 직접 매칭', extractContentImage(`<article id="_contentBuilder"><img src="/a/b.jpg" alt=""></article></body>`)?.src === 'https://www.hansung.ac.kr/a/b.jpg');
t('image: 컨테이너 밖 img 무시', extractContentImage(`<img src="/sites/x/nav.jpg"><div id="contentsEditHtml"><p>텍스트</p></div></body>`) === null);
t('image: img 없으면 null', extractContentImage('<div id="contentsEditHtml"><p>텍스트</p></div></body>') === null);
// 푸터 로고 노이즈 필터 — 실제 규정 이미지만 선택
const FOOTER_PAGE = `<article id="_contentBuilder"><img src="/sites/x/footer_logo.png" alt="한성대학교"><img src="/sites/x/rule.jpg" alt="규정"></article></body>`;
t('image: 푸터 로고 건너뜀', extractContentImage(FOOTER_PAGE)?.src.endsWith('/rule.jpg'));
t('image: 로고만 있으면 null', extractContentImage(`<article id="_contentBuilder"><img src="/footer_logo.png" alt="한성대학교"></article></body>`) === null);
t('anomaly: 이미지 규정은 유효', !isRulesetAnomalous({ deptLabel: 'x', dept: null, url: 'u', lines: [], image: { src: 'https://www.hansung.ac.kr/a.jpg' } }));

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

// --- rulesetMatchesDept ---
const CSE = {
  deptLabel: '컴퓨터공학부',
  dept: null,
  url: 'https://www.hansung.ac.kr/CSE/1564/subview.do',
  lines: [],
  yearTable: yt,
};
t('match: 수집 해석 dept로 매칭',
  rulesetMatchesDept({ deptLabel: '융합보안학과', dept: '융합보안학과', url: 'u', lines: [] }, '융합보안', ['융합보안학과']));
t('match: 라벨 동일 입력 — 풀 없어도 매칭', rulesetMatchesDept(CSE, '컴퓨터공학부', null));
t('match: 검증 패밀리 — 트랙 학과', rulesetMatchesDept(CSE, '모바일소프트웨어트랙', ['모바일소프트웨어트랙']));
t('match: 검증 패밀리 — 공통 개설 단위', rulesetMatchesDept(CSE, 'IT응용시스템공학과', ['IT응용시스템공학과']));
t('match: 모호 풀(candidates)엔 패밀리 미적용',
  !rulesetMatchesDept(CSE, '소프트웨어', ['AI·소프트웨어학과', '모바일소프트웨어트랙']));
t('match: 무관 학과는 불일치', !rulesetMatchesDept(CSE, '기계시스템공학과', ['기계시스템공학과']));
t('match: 라벨 공백이면 dept 외 매칭 없음',
  !rulesetMatchesDept({ deptLabel: '', dept: null, url: 'u', lines: [] }, '아무학과', ['아무학과']));

// --- deptRuleTargets ---
const d2020 = deptRuleTargets(CSE, 2020);
t('targets: 2020 교과 130', d2020?.total === 130);
t('targets: 2020 비교과 800', d2020?.points === 800);
t('targets: 컬럼 라벨 보존', d2020?.columnLabel === '17학번 ~23학번');
t('targets: 학점 행은 조건에서 제외', !d2020?.conditions.some((c) => c.label.includes('학점')));
t('targets: 2020 조건 2개(캡스톤 V필수+트랙 2)', d2020?.conditions.length === 2);
const d2014 = deptRuleTargets(CSE, 2014);
t('targets: ~15학번 총 140', d2014?.total === 140);
t('targets: ~15학번 비교과 미표기 → undefined', d2014?.points === undefined);
t('targets: X 셀은 조건 제외(트랙)', !d2014?.conditions.some((c) => c.label.includes('트랙')));
t('targets: V 셀은 조건 포함(캡스톤)', d2014?.conditions.some((c) => c.cell === 'V'));
const d2016 = deptRuleTargets(CSE, 2016);
t('targets: 16학번 트랙 수 1', d2016?.conditions.find((c) => c.label.includes('트랙'))?.cell === '1');
t('targets: yearTable 없으면 null',
  deptRuleTargets({ deptLabel: 'x', dept: null, url: 'u', lines: [] }, 2020) === null);
// 권장 표기 감지
const yt2 = {
  columns: yt.columns,
  rows: [...yt.rows, { label: '개발 역량 / GitHub 활동 이력서(권장)', cells: ['X', 'X', 'V', 'V'] }],
};
const dRec = deptRuleTargets({ ...CSE, yearTable: yt2 }, 2020);
t('targets: 권장 항목 감지', dRec?.conditions.find((c) => c.label.includes('GitHub'))?.recommended === true);
t('targets: 필수는 권장 아님', dRec?.conditions.find((c) => c.label.includes('캡스톤'))?.recommended === false);
// 학번 컬럼 공백 → null
const gapTable = {
  columns: [
    { label: '16학번', from: 2016, to: 2016 },
    { label: '18학번', from: 2018, to: 2018 },
  ],
  rows: [{ label: '이수 학점 / 총 취득 학점', cells: ['130학점', '130학점'] }],
};
t('targets: 해당 학번 컬럼 없음 → null', deptRuleTargets({ ...CSE, yearTable: gapTable }, 2017) === null);
t('targets: columnIndex 반환', d2020?.columnIndex === 2 && d2014?.columnIndex === 0);

// 세부 학점 행('전공 이수 학점' 등)은 총 기준으로 오입되지 않고 조건으로 보존
const ytSub = {
  columns: yt.columns,
  rows: [
    { label: '전공 이수 학점', cells: ['45학점', '45학점', '45학점', '45학점'] },
    ...yt.rows,
  ],
};
const dSub = deptRuleTargets({ ...CSE, yearTable: ytSub }, 2020);
t('targets: 세부 학점 행은 조건으로 보존',
  dSub?.conditions.some((c) => c.label === '전공 이수 학점'));
t('targets: 세부 행이 총 기준을 덮지 않음', dSub?.total === 130);

// '해당없음'/'없음' 셀도 요건 없음으로 건너뛴다
const ytNo = {
  columns: yt.columns,
  rows: [{ label: '졸업 작품', cells: ['해당없음', '없음', 'V', 'V'] }],
};
t('targets: 해당없음 셀은 조건 제외',
  !deptRuleTargets({ ...CSE, yearTable: ytNo }, 2014)?.conditions.some((c) => c.label === '졸업 작품'));
t('targets: 없음 셀은 조건 제외',
  !deptRuleTargets({ ...CSE, yearTable: ytNo }, 2016)?.conditions.some((c) => c.label === '졸업 작품'));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
