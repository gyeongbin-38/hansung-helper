// 종합정보 수집 파서·수집기 테스트 — node --experimental-transform-types tests/info.test.mjs
import assert from 'node:assert/strict';
import {
  parseInfoMenu,
  pickTargets,
  parseGrades,
  parsePoints,
  parseAudit,
  parseRequirementTables,
  parseIdentity,
  parseSemesterGrades,
  parseAcademic,
  collectInfo,
} from '../lib/server/info.ts';
import {
  infoCategory,
  mergeCompleted,
  mergeInfoSnapshot,
  resolveEarnedCredits,
  semestersFromCourses,
  validateInfo,
} from '../lib/data/info.ts';

let pass = 0,
  fail = 0;
const t = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL:', name);
  }
};

// ── 메뉴 파서 ─────────────────────────────────────────────
const MENU_HTML = `<html><body>
<a href="servlet/s_sung.s_sung_grade">누적성적조회</a>
<a href="servlet/s_sung.s_sung_term">금학기 성적조회</a>
<img src="x.gif" alt="비교과 포인트 조회" onclick="go('s_etc.point_view')">
<a href="javascript:menu('h_dae/dae_grad_check.html')">졸업가사정표</a>
<a href="servlet/s_etc.point_view">중복 같은 경로 다른 라벨</a>
<script>var m=["학적부","s_hak.hak_status"];</script>
</body></html>`;

const menu = parseInfoMenu(MENU_HTML);
t('menu: 서블릿 링크 발견', menu.some((m) => m.path === 's_sung.s_sung_grade'));
t('menu: 라벨 캡처', menu.find((m) => m.path === 's_sung.s_sung_grade')?.label === '누적성적조회');
t('menu: img alt+onclick 발견', menu.some((m) => m.path === 's_etc.point_view'));
t('menu: h_dae html 경로 발견', menu.some((m) => m.path === 'h_dae/dae_grad_check.html'));
t('menu: JS 쌍 발견', menu.some((m) => m.path === 's_hak.hak_status'));
t('menu: 같은 path+라벨 중복 없음', new Set(menu.map((m) => m.path + '|' + m.label)).size === menu.length);

const targets = pickTargets(menu);
// 금학기 성적조회보다 누적성적 우선
t('targets: 누적성적 우선', targets.grades === 's_sung.s_sung_grade');
t('targets: 포인트', targets.points === 's_etc.point_view');
t('targets: 사정표', targets.audit === 'h_dae/dae_grad_check.html');
t('targets: 매칭 없으면 없음', Object.keys(pickTargets([])).length === 0);
// 라벨이 예상과 어긋나도 파일명(point/mile/bigyo/extra)으로 포인트 페이지를 찾는다
t(
  'targets: 경로 폴백으로 포인트 검출',
  pickTargets([{ path: 'jsp_21/student/mileage_status.jsp', label: '활동 신청 현황' }]).points ===
    'jsp_21/student/mileage_status.jsp',
);
t(
  'targets: 라벨 매칭이 경로 폴백보다 우선',
  pickTargets([
    { path: 'jsp_21/etc/point_guide.jsp', label: '안내' },
    { path: 's_etc.real_points', label: '비교과 포인트 조회' },
  ]).points === 's_etc.real_points',
);

// ── 누적성적 테이블 ───────────────────────────────────────
const GRADES_HTML = `<html><body>
<p>2024학년도 1학기</p>
<table><tr><th>과목코드</th><th>교과목명</th><th>이수구분</th><th>학점</th><th>등급</th></tr>
<tr><td>CS101</td><td>프로그래밍기초</td><td>전공필수</td><td>3</td><td>A+</td></tr>
<tr><td>GS201</td><td>글쓰기</td><td>교양필수</td><td>2</td><td>B0</td></tr>
<tr><td colspan="5">소계 5</td></tr>
<tr><td>ST301</td><td>통계학개론</td><td>일반선택</td><td>3</td><td>A0</td></tr>
</table>
<p>2024학년도 2학기</p>
<table><tr><th>과목코드</th><th>교과목명</th><th>이수구분</th><th>학점</th><th>등급</th></tr>
<tr><td>CS102</td><td>자료구조</td><td>전공선택</td><td>3</td><td>A+</td></tr>
<tr><td>CS101</td><td>프로그래밍기초</td><td>전공필수</td><td>3</td><td>F</td></tr>
</table>
<table><tr><td>취득학점</td><td>45</td></tr><tr><td>평점평균</td><td>3.85</td></tr></table>
</body></html>`;

const grades = parseGrades(GRADES_HTML);
t('grades: 4과목(소계·F등급 제외, 통계 유지)', grades.completed.length === 4);
t('grades: 첫 학기 라벨', grades.completed[0].semester === '2024-1');
t('grades: 두 번째 학기 라벨', grades.completed[3].semester === '2024-2');
t('grades: 카테고리 정규화', grades.completed[0].category === '전필');
t('grades: F 재수강분 제외', grades.completed.filter((c) => c.name === '프로그래밍기초').length === 1);
t('grades: 취득학점 회수', grades.credits === 45);
t('grades: 평점 회수', grades.gpa === 3.85);
t('grades: 등급 보존', grades.completed[1].grade === 'B0');
t('grades: 통계 과목명 살아있음', grades.completed.some((c) => c.name === '통계학개론'));

// 학기 헤더가 테이블 안 행으로 오는 형태
const GRADES_INLINE = `<table>
<tr><th>교과목명</th><th>이수구분</th><th>학점</th><th>성적</th></tr>
<tr><td colspan="4">2023학년도 1학기</td></tr>
<tr><td>대학영어</td><td>교양선택</td><td>2</td><td>P</td></tr>
</table>`;
const gi = parseGrades(GRADES_INLINE);
t('grades: 인라인 학기행 인식', gi.completed[0]?.semester === '2023-1');
const UNCONFIRMED_GRADES = `<table><tr><th>과목명</th><th>학점</th><th>성적</th></tr>
<tr><td>현재 수강 과목</td><td>3</td><td></td></tr></table>`;
const unconfirmedParsed = parseGrades(UNCONFIRMED_GRADES);
t('grades: 전체 성적이 비어 있어도 미확정 과목을 이수로 계산하지 않음',
  unconfirmedParsed.hasUnconfirmed && unconfirmedParsed.completed.length === 0);
const mixedGrades = parseGrades(`<table><tr><th>과목명</th><th>학점</th><th>성적</th></tr>
<tr><td>확정 과목</td><td>3</td><td>A+</td></tr>
<tr><td>미확정 과목</td><td>3</td><td></td></tr></table>`);
t('grades: 확정 과목과 빈 성적이 섞여 있어도 빈 성적은 제외',
  mixedGrades.hasUnconfirmed && mixedGrades.completed.length === 1 && mixedGrades.completed[0].name === '확정 과목');
const failedOnly = parseGrades('<table><tr><th>과목명</th><th>학점</th><th>성적</th></tr><tr><td>미이수 과목</td><td>3</td><td>F</td></tr></table>');
t('grades: 확정 F만 있는 표는 미확정이 아닌 정상 빈 이수 목록',
  !failedOnly.hasUnconfirmed && failedOnly.recognized && failedOnly.completed.length === 0);
const failedVariants = parseGrades('<table><tr><th>과목명</th><th>학점</th><th>성적</th></tr><tr><td>과목1</td><td>3</td><td>F0</td></tr><tr><td>과목2</td><td>3</td><td>F(재수강)</td></tr></table>');
t('grades: F 변형 표기도 미이수 이력으로 분리', failedVariants.completed.length === 0 && failedVariants.failedCourses.length === 2);

// 새 성적 화면 — 헤더 없이 th에 과목명이 오는 형태
const NEW_STYLE_GRADES = `<div class="panel-heading"><h3>2026 학년도 1 학기</h3></div>
<table><tr><th>인공지능 수학</th><td>전필</td><td>3</td><td>A+</td><td>Y030004</td></tr></table>`;
const newStyle = parseGrades(NEW_STYLE_GRADES);
t(
  'grades: 헤더 없는 새 화면도 과목으로 인식',
  newStyle.recognized &&
    newStyle.completed.length === 1 &&
    newStyle.completed[0].name === '인공지능 수학' &&
    newStyle.completed[0].code === 'Y030004' &&
    newStyle.completed[0].grade === 'A+',
);

// ── 실계정 마크업 (덤프 구조 재현, 익명화) ─────────────────
const REAL_MAIN = `<html><frameset>
<frame src="/fuz/common/include/default/top.jsp" name="top">
<frame src="/fuz/common/include/left/left.jsp" name="left">
<frame src="/jsp/haksa/infohaksamain_portal.jsp" name="right">
</frameset></html>`;

const REAL_TOP_MENU = `<html><body>
<font color="#ffffff">이름 : 홍길동</font>
<font color="#ffffff">학부(과) : 테스트학과</font>
<font color="#ffffff">전공 : 테스트학과</font>
</body></html>`;

// 실제 left.jsp는 li>a 중첩 구조 — 컨테이너가 앵커를 삼키는 회귀 재현용
const REAL_LEFT = `<ul>
<li><a href="/jsp/sugang/h_sungjeok_s01_h.jsp" class="d2" target='right'>성적조회(현학기) 및 이의신청</a></li>
<li><a href="/jsp_21/student/grade/total_grade.jsp?viewMode=oc" class="d2" target='right'>성적조회(누적)</a></li>
<li><a href="https://hsportal.hansung.ac.kr/" class="d2" target='_sub'>비교과포인트조회</a></li>
<li><a href="/jsp_21/student/graduation/joluprequire_track.jsp?viewMode=oc" class="d2" target='right'>졸업(가)사정 결과조회</a></li>
<li><a href="/jsp_21/student/graduation/graduation_requirement.jsp?viewMode=oc" class="d2" target='right'>졸업요건</a></li>
</ul>`;

const REAL_GRADES = `<html><body>
<strong class="objHeading_h3">홍길동 (2199999) 테스트학과 2 학년 재학</strong>
<div class='div_total_subdiv'><li><dl><dt>신청학점</dt> <dd> 53</dd></dl></li></div>
<div class='div_total_subdiv'><li><dl><dt>취득학점</dt> <dd> 50</dd></dl></li></div>
<div class='div_total_subdiv'><li><dl><dt>평균평점</dt> <dd> 2.87</dd></dl></li></div>
<table><thead><tr><th>구분</th><th>교과목</th><th>학점</th><th>교과목</th><th>학점</th></tr></thead>
<tbody><tr><td>이수 과목 요약</td><td>3 / (3)</td><td></td><td></td></tr>
<tr><td class="warning">소 계</td><td colspan="4">13 / (13)</td></tr></tbody></table>
<div class="card-header bgh-blue"><span class="objHeading_h3 text-white">2026 학년도 1 학기</span></div>
<table><thead><tr><th>구분</th><th>교과명</th><th>교과코드</th><th>학점</th><th>성적</th><th>현재트랙(변경시)</th></tr></thead>
<tbody>
<tr><td>일교</td><td>AI로 하는 노코딩 데이터 분석</td><td>GEN1015</td><td>3</td><td>B+</td><td>현재 : 제1트랙</td></tr>
<tr><td>전필</td><td>인공지능 수학</td><td>Y030004</td><td>3</td><td>C+</td><td>현재 : 제1트랙</td></tr>
<tr><td>전선</td><td>C프로그래밍</td><td>Y030008</td><td>3</td><td>F</td><td>현재 : 제1트랙</td></tr>
</tbody></table>
<div class="card-header bgh-blue"><span class="objHeading_h3 text-white">2025 학년도 2 학기</span></div>
<table><thead><tr><th>구분</th><th>교과명</th><th>교과코드</th><th>학점</th><th>성적</th><th>현재트랙(변경시)</th></tr></thead>
<tbody>
<tr><td>교필</td><td>사고와 표현</td><td>GEN0925</td><td>3</td><td>C+</td><td></td></tr>
<tr><td>선필교</td><td>메이커의 이해와 기초</td><td>GEN0729</td><td>3</td><td>A0</td><td>선필교(융합교양 분야)</td></tr>
<tr><td>일선</td><td>UX 디자인의 이해</td><td>CTA0014</td><td>3</td><td>B+</td><td></td></tr>
<tr><td>전기</td><td>Python for AI</td><td>Y030001</td><td>3</td><td></td><td>현재 : 제1트랙</td></tr>
</tbody></table>
</body></html>`;

const realMenu = parseInfoMenu(REAL_LEFT);
t('real menu: jsp 경로 발견', realMenu.some((m) => m.path === 'jsp_21/student/grade/total_grade.jsp'));
t('real menu: 외부 hsportal 링크 제외', !realMenu.some((m) => m.path.includes('hsportal')));
const realTargets = pickTargets(realMenu);
t('real targets: 누적 우선(현학기 아님)', realTargets.grades === 'jsp_21/student/grade/total_grade.jsp');
t('real targets: 사정', realTargets.audit === 'jsp_21/student/graduation/joluprequire_track.jsp');
t('real targets: 별도 졸업요건', realTargets.requirements === 'jsp_21/student/graduation/graduation_requirement.jsp');
t('real targets: 포인트 외부 링크라 미검출', realTargets.points === undefined);

const rg = parseGrades(REAL_GRADES);
t('real grades: 5과목(F·미확정 제외)', rg.completed.length === 5);
t('real grades: 학기 라벨(학년도 공백 형태)', rg.completed[0].semester === '2026-1' && rg.completed[4].semester === '2025-2');
t('real grades: 요약 테이블 오염 없음', !rg.completed.some((c) => c.name.includes('요약') || c.name.includes('계')));
t('real grades: 코드/카테고리', rg.completed[0].code === 'GEN1015' && rg.completed[0].category === '일교' && rg.completed[3].category === '선필교');
t('real grades: 선필교 영역 보존', rg.completed[3].area === '융합교양 분야');
t('real grades: F 별도 보존', rg.failedCourses.some((c) => c.name === 'C프로그래밍' && c.grade === 'F'));
t('F 학점은 이수 목록에 합산되지 않음', !rg.completed.some((c) => c.grade === 'F'));
t('real grades: A0 유지·F 제외', rg.completed.some((c) => c.grade === 'A0') && !rg.completed.some((c) => c.name === 'C프로그래밍'));
t('real grades: 미확정 성적 제외', !rg.completed.some((c) => c.name === 'Python for AI'));
t('real grades: 총 취득학점/평점', rg.credits === 50 && rg.gpa === 2.87);

const rid = parseIdentity(REAL_TOP_MENU);
t('real id: 이름', rid.name === '홍길동');
t('real id: 학부(과)', rid.dept === '테스트학과');
const rid2 = parseIdentity(REAL_GRADES);
t('real id: 신원 라인', rid2.name === '홍길동' && rid2.dept === '테스트학과' && rid2.admitYear === 2021);

// ── 비교과 포인트 ─────────────────────────────────────────
const POINTS_HTML = `<table><tr><th>항목</th><th>포인트</th><th>일자</th></tr>
<tr><td>특강 참여</td><td>50</td><td>2024-03-01</td></tr>
<tr><td>총점</td><td>780</td><td></td></tr>
</table>`;
t('points: 합계 행', parsePoints(POINTS_HTML) === 780);
t('points: 본문 패턴', parsePoints('<p>총 비교과 포인트 1,234점</p>') === 1234);
t('points: 없으면 undefined', parsePoints('<p>nothing</p>') === undefined);

// ── 졸업가사정표 ──────────────────────────────────────────
const AUDIT_HTML = `<table><tr><th>구분</th><th>기준</th><th>취득</th><th>판정</th></tr>
<tr><td>총 취득학점</td><td>130</td><td>98</td><td>진행중</td></tr>
<tr><td>전공</td><td>60</td><td>42</td><td>진행중</td></tr>
<tr><td>비교과 포인트</td><td>800</td><td>780</td><td>미충족</td></tr>
</table>`;
const audit = parseAudit(AUDIT_HTML);
t('audit: 3행', audit?.length === 3);
t('audit: 필드', audit?.[0].area === '총 취득학점' && audit?.[0].required === '130' && audit?.[0].verdict === '진행중');
t('audit: 표 없으면 undefined', parseAudit('<div>none</div>') === undefined);

// ── 학적 요약 ─────────────────────────────────────────────
const ID_HTML = `<table><tr><th>성명</th><td>홍길동</td></tr>
<tr><th>소속</th><td>컴퓨터공학과</td></tr>
<tr><th>학번</th><td>20241234</td></tr></table>`;
const id = parseIdentity(ID_HTML);
t('id: 이름', id.name === '홍길동');
t('id: 소속', id.dept === '컴퓨터공학과');
t('id: 학번→입학연도', id.admitYear === 2024);
t('id: 없으면 빈 객체', Object.keys(parseIdentity('<p>none</p>')).length === 0);
const dualIdentity = parseIdentity('<table><tr><th>학과</th><td>AI응용학과</td></tr><tr><th>제1트랙</th><td>AI응용학과</td></tr><tr><th>제2트랙</th><td>빅데이터트랙</td></tr></table>');
t('id: 학과와 두 트랙 분리', dualIdentity.dept === 'AI응용학과' && dualIdentity.track === '빅데이터트랙' && dualIdentity.tracks?.length === 2);
const reqTables = parseRequirementTables('<h3>트랙별 졸업요건</h3><table><tr><th rowspan="2">구분</th><th colspan="2">전공</th></tr><tr><th>기준</th><th>이수</th></tr><tr><td>빅데이터</td><td>39</td><td>30</td></tr></table>');
t('requirements: 병합 셀과 두 트랙 표 구조 보존', reqTables.length === 1 && reqTables[0].rows[0][0].rowspan === 2 && reqTables[0].rows[0][1].colspan === 2 && reqTables[0].rows[2][0].text === '빅데이터');
t('선필교 구분 보존', infoCategory('선택필수교양') === '선필교');
const oldInfo = { source: 'info-hansung', fetchedAt: '2026-11-01T00:00:00Z', dept: 'AI응용학과', track: '빅데이터트랙', completed: [], failedCourses: grades.failedCourses, requirements: reqTables };
const failedRefresh = { source: 'info-hansung', fetchedAt: '2026-11-02T00:00:00Z', completed: [], diag: { menu: [], pages: [{ slot: 'grades', path: '-', ok: false }, { slot: 'requirements', path: '-', ok: false }] } };
const retainedInfo = mergeInfoSnapshot(oldInfo, failedRefresh);
t('부분 실패 시 학과·트랙·F·졸업요건 표 보존', retainedInfo.dept === oldInfo.dept && retainedInfo.track === oldInfo.track && retainedInfo.failedCourses?.length === 1 && retainedInfo.requirements?.length === 1);
t('수집 스냅샷 검증 후 병합 셀 보존', validateInfo(oldInfo)?.requirements?.[0]?.rows[0][1].colspan === 2);

// ── 학기별 성적/학적 ─────────────────────────────────────
const SEMESTER_GRADES_HTML = `<html><body>
<div id="div_total">
  <div><div class="panel-body">신청학점 53</div></div>
  <div><div class="panel-body">취득학점 50</div></div>
  <div><div class="panel-body">평점총계 145.2</div></div>
  <div><div class="panel-body">평균평점 2.87</div></div>
  <div><div class="panel-body">백분위 78.5</div></div>
  <div><div class="panel-body">기초(필수) 3</div></div>
  <div><div class="panel-body">전필 12</div></div>
  <div><div class="panel-body">전선 15</div></div>
</div>
<div id="main_content">
  <div class="container divOutSide">
    <div class="panel-heading"><h3>2026 학년도 1 학기</h3></div>
    <div class="panel-body">
      <div>신청학점 15 취득학점 15 평점총계 60.0 평균평점 4.0 백분위 90</div>
      <table><thead><tr><th>구분</th><th>교과명</th><th>교과코드</th><th>학점</th><th>성적</th></tr></thead>
      <tbody><tr><td>전필</td><td>인공지능 수학</td><td>Y030004</td><td>3</td><td>A+</td></tr>
      <tr><td>전선</td><td>자료구조</td><td>CS201</td><td>3</td><td>B+</td></tr></tbody></table>
    </div>
  </div>
  <div class="container divOutSide">
    <div class="panel-heading"><h3>2025 학년도 2 학기</h3></div>
    <div class="panel-body">
      <div>신청학점 18 취득학점 15 평점총계 45.0 평균평점 3.0 백분위 70</div>
      <table><thead><tr><th>구분</th><th>교과명</th><th>교과코드</th><th>학점</th><th>성적</th></tr></thead>
      <tbody><tr><td>교필</td><td>사고와 표현</td><td>GEN0925</td><td>3</td><td>C+</td></tr>
      <tr><td>전필</td><td>미확정 과목</td><td>Y030005</td><td>3</td><td></td></tr></tbody></table>
    </div>
  </div>
</div>
</body></html>`;

const semesterGrades = parseSemesterGrades(SEMESTER_GRADES_HTML);
t('semester grades: 2학기', semesterGrades.semesters.length === 2);
t('semester grades: 최신 학기 우선', semesterGrades.semesters[0].semester === '2026-1');
t(
  'semester grades: 학기 요약 숫자',
  semesterGrades.semesters[0].applied === 15 &&
    semesterGrades.semesters[0].earned === 15 &&
    semesterGrades.semesters[0].gpa === 4.0 &&
    semesterGrades.semesters[0].percentile === 90,
);
t(
  'semester grades: 학기별 과목',
  semesterGrades.semesters[0].courses.length === 2 &&
    semesterGrades.semesters[0].courses[0].name === '인공지능 수학',
);
t(
  'semester grades: 미확정 과목 제외',
  semesterGrades.semesters[1].courses.length === 1 &&
    semesterGrades.semesters[1].courses[0].name === '사고와 표현',
);
t(
  'semester grades: 이수구분별 학점',
  semesterGrades.creditCategories?.some((c) => c.label === '기초(필수)' && c.credits === 3) === true &&
    semesterGrades.creditCategories?.some((c) => c.label === '전필' && c.credits === 12) === true,
);

const HAKJUK_HTML = `<table class="table table-condensed">
<tr><td><img name="sajin" src="x.jpg"></td><td>사진</td></tr>
<tr><th>성명</th><td>홍길동</td></tr>
<tr><th>제1트랙</th><td>AI응용학과</td></tr>
<tr><th>제2트랙</th><td>컴퓨터공학</td></tr>
<tr><th>학년</th><td>2</td></tr>
<tr><th>상태</th><td>재학</td></tr>
<tr><th>입학일자</th><td>2025.03.01</td></tr>
</table>`;
const academic = parseAcademic(HAKJUK_HTML);
t(
  'academic: 학년·상태·트랙·입학일',
  academic?.grade === 2 &&
    academic?.status === '재학' &&
    academic?.tracks?.[0] === 'AI응용학과' &&
    academic?.tracks?.[1] === '컴퓨터공학' &&
    academic?.admissionDate === '2025-03-01',
);
t('academic: 빈 문서는 undefined', parseAcademic('<p>none</p>') === undefined);

const grouped = semestersFromCourses([
  { code: 'A', name: '과목A', category: '전필', credits: 3, semester: '2026-1' },
  { code: 'B', name: '과목B', category: '전선', credits: 2, semester: '2026-1' },
  { code: 'C', name: '과목C', category: '교필', credits: 3, semester: '2025-2' },
]);
t(
  'semestersFromCourses: 학기 그룹·학점 합계',
  grouped.length === 2 &&
    grouped[0].semester === '2026-1' &&
    grouped[0].earned === 5 &&
    grouped[1].earned === 3,
);

// ── collectInfo 오케스트레이션 ────────────────────────────
const fakeSession = (routes) => ({
  request: async (url) => {
    const path = new URL(url).pathname + new URL(url).search;
    for (const [key, html] of Object.entries(routes))
      if (path.includes(key)) return new Response(html);
    throw new Error('404: ' + path);
  },
  follow: async (res) => res,
});

const snap = await collectInfo(fakeSession({
  's_sung.s_sung_grade': GRADES_HTML,
  's_etc.point_view': POINTS_HTML,
  'dae_grad_check': AUDIT_HTML,
  'seongjeok_new': SEMESTER_GRADES_HTML,
  'collage_register': HAKJUK_HTML,
}), { menuHtml: MENU_HTML, mainHtml: ID_HTML });
const requirementPage = '<h3>졸업요건</h3><table><tr><th>트랙</th><th>이수학점</th></tr><tr><td>AI응용</td><td>39</td></tr><tr><td>빅데이터</td><td>39</td></tr></table>';
const requirementsSnap = await collectInfo(fakeSession({
  's_sung.s_sung_grade': GRADES_HTML, 's_etc.point_view': POINTS_HTML,
  'dae_grad_check': AUDIT_HTML, 'graduation_requirement.jsp': requirementPage,
}), { menuHtml: MENU_HTML + '<a href="jsp/student/graduation_requirement.jsp">졸업요건</a>', mainHtml: ID_HTML });
t('collect: 졸업요건 슬롯에서 두 트랙 표 수집', requirementsSnap.diag?.pages.some((p) => p.slot === 'requirements' && p.ok) && requirementsSnap.requirements?.[0]?.rows[2]?.[0]?.text === '빅데이터');
const brokenRequirements = await collectInfo(fakeSession({
  's_sung.s_sung_grade': GRADES_HTML, 's_etc.point_view': POINTS_HTML,
  'dae_grad_check': AUDIT_HTML, 'graduation_requirement.jsp': '<div>일시 장애</div>',
}), { menuHtml: MENU_HTML + '<a href="jsp/student/graduation_requirement.jsp">졸업요건</a>', mainHtml: ID_HTML });
t('collect: 잘못된 졸업요건 페이지는 이전 표 보존', brokenRequirements.diag?.pages.some((p) => p.slot === 'requirements' && p.reason === 'structure') && mergeInfoSnapshot(requirementsSnap, brokenRequirements).requirements?.[0]?.rows[2]?.[0]?.text === '빅데이터');
t('collect: 스냅샷 조립', snap.source === 'info-hansung');
t('collect: 과목 수', snap.completed.length === 4);
t('collect: 포인트', snap.points === 780);
t('collect: 사정표', snap.audit?.length === 3);
t('collect: 학적', snap.name === '홍길동' && snap.admitYear === 2024);
t('collect: 학기별 성적', snap.semesters?.length === 2);
t('collect: 학적 상세', snap.academic?.grade === 2 && snap.academic?.status === '재학');
t('collect: diag 메뉴 기록', (snap.diag?.menu.length ?? 0) > 0);
t(
  'collect: diag 대상 페이지 ok',
  snap.diag?.pages
    .filter((p) => p.slot !== 'menu' && p.path !== '-')
    .every((p) => p.ok) === true,
);

// 로그인 벽 + 부분 실패 — 성적 페이지만 세션 만료, 나머지는 정상
const snap2 = await collectInfo(fakeSession({
  's_sung.s_sung_grade': '<form action="s_gong.gong_login_ssl"><input name="passwd"></form>',
  's_etc.point_view': POINTS_HTML,
  'dae_grad_check': AUDIT_HTML,
}), { menuHtml: MENU_HTML, mainHtml: ID_HTML });
t('collect: 로그인벽 → 과목 없음', snap2.completed.length === 0);
t('collect: diag 실패 표면화', snap2.diag?.pages.find((p) => p.slot === 'grades')?.ok === false);
t('collect: 로그인 화면은 재인증 필요로 분류', snap2.diag?.pages.find((p) => p.slot === 'grades')?.reason === 'session-expired');
t('collect: 포인트는 성공', snap2.points === 780);
t('collect: 학적은 메인에서 보존', snap2.dept === '컴퓨터공학과');

// HTTP 200 with a changed grade table must not erase the last known results.
const malformedGrade = await collectInfo(fakeSession({
  's_sung.s_sung_grade': '<table><tr><th>과목명</th><th>학점</th><th>기타</th></tr></table>',
  's_etc.point_view': POINTS_HTML, 'dae_grad_check': AUDIT_HTML,
}), { menuHtml: MENU_HTML, mainHtml: ID_HTML });
t('collect: 필수 성적 열 누락은 수집 실패', malformedGrade.diag?.pages.find((p) => p.slot === 'grades')?.ok === false);
t('collect: 성적 구조 변경 분류', malformedGrade.diag?.pages.find((p) => p.slot === 'grades')?.reason === 'structure');
t('collect: 구조 변경은 이전 이수 내역을 보존', mergeInfoSnapshot(snap, malformedGrade).completed.length === snap.completed.length);
const emptyBody = await collectInfo(fakeSession({
  's_sung.s_sung_grade': '', 's_etc.point_view': POINTS_HTML, 'dae_grad_check': AUDIT_HTML,
}), { menuHtml: MENU_HTML, mainHtml: ID_HTML });
t('collect: HTTP 200 빈 본문은 구조 오류로 분류',
  emptyBody.diag?.pages.find((p) => p.slot === 'grades')?.reason === 'structure');
t('collect: 빈 본문은 기존 이수 내역을 보존',
  mergeInfoSnapshot(snap, emptyBody).completed.length === snap.completed.length);
const emptyGrade = await collectInfo(fakeSession({
  's_sung.s_sung_grade': '<table><tr><th>과목명</th><th>학점</th><th>성적</th></tr></table>',
  's_etc.point_view': POINTS_HTML, 'dae_grad_check': AUDIT_HTML,
}), { menuHtml: MENU_HTML, mainHtml: ID_HTML });
t('collect: 정상 빈 성적표는 성공', emptyGrade.diag?.pages.find((p) => p.slot === 'grades')?.ok === true && emptyGrade.completed.length === 0);
const unconfirmedSnap = await collectInfo(fakeSession({
  's_sung.s_sung_grade': UNCONFIRMED_GRADES,
  's_etc.point_view': POINTS_HTML, 'dae_grad_check': AUDIT_HTML,
}), { menuHtml: MENU_HTML, mainHtml: ID_HTML });
t('collect: 빈 성적 행이 있으면 확인 실패로 분류',
  unconfirmedSnap.diag?.pages.find((p) => p.slot === 'grades')?.reason === 'unconfirmed');
t('collect: 성적 미확정 시 기존 이수 내역 보존',
  mergeInfoSnapshot(snap, unconfirmedSnap).completed.length === snap.completed.length);
t('collect: 확인 실패 분류는 유효성 검사 후에도 유지',
  validateInfo(unconfirmedSnap)?.diag?.pages.find((p) => p.slot === 'grades')?.reason === 'unconfirmed');
const nonOkSession = fakeSession({ 's_etc.point_view': POINTS_HTML, 'dae_grad_check': AUDIT_HTML });
const previousRequest = nonOkSession.request;
nonOkSession.request = async (url) => url.includes('s_sung.s_sung_grade')
  ? new Response('<table><tr><th>과목명</th><th>학점</th><th>성적</th></tr></table>', { status: 500 })
  : previousRequest(url);
const serverError = await collectInfo(nonOkSession, { menuHtml: MENU_HTML, mainHtml: ID_HTML });
t('collect: HTTP 500 성적표는 실패로 표시하고 이전 결과 보존',
  serverError.diag?.pages.find((p) => p.slot === 'grades')?.ok === false && mergeInfoSnapshot(snap, serverError).completed.length === snap.completed.length);
t('collect: HTTP 오류 분류', serverError.diag?.pages.find((p) => p.slot === 'grades')?.reason === 'upstream');
const networkSession = fakeSession({});
networkSession.request = async () => { throw new Error('private upstream detail'); };
const networkError = await collectInfo(networkSession, { menuHtml: MENU_HTML, mainHtml: ID_HTML });
t('collect: 요청 실패는 원문 없이 상위 오류로 분류', networkError.diag?.pages.find((p) => p.slot === 'grades')?.reason === 'upstream' && !JSON.stringify(networkError.diag).includes('private upstream detail'));
t('collect: 요청 실패 시 기존 성적 유지', mergeInfoSnapshot(snap, networkError).completed.length === snap.completed.length);

// 실계정 마크업 e2e — 프레임 메뉴 발견 → 누적성적 수집 → 학적 병합
const snap3 = await collectInfo(
  fakeSession({
    'left.jsp': REAL_LEFT,
    'top.jsp': '<html><body>nav</body></html>',
    infohaksamain_portal: REAL_LEFT,
    total_grade: REAL_GRADES,
    joluprequire:
      '<html><body>졸업(가)사정 자료가 존재하지 않습니다.</body></html>',
    seongjeok_new: SEMESTER_GRADES_HTML,
    collage_register: HAKJUK_HTML,
  }),
  { menuHtml: REAL_TOP_MENU, mainHtml: REAL_MAIN, studentId: '2199999' },
);
t('real collect: 과목 수', snap3.completed.length === 5);
t('real collect: 취득학점/평점', snap3.credits === 50 && snap3.gpa === 2.87);
t('real collect: 학기별 성적', snap3.semesters?.length === 2);
t('real collect: 학적 상세', snap3.academic?.grade === 2);
t(
  'real collect: 학적',
  snap3.name === '홍길동' &&
    snap3.dept === '테스트학과' &&
    snap3.admitYear === 2021,
);
t(
  'real collect: 메뉴 소스 기록',
  snap3.diag?.pages.some((p) => p.slot === 'menu' && p.ok) === true,
);
t(
  'real collect: 사정표 대상 fetch',
  snap3.diag?.pages.find((p) => p.slot === 'audit')?.ok === true,
);
t(
  'real collect: 포인트 미검출 표시',
  snap3.diag?.pages.find((p) => p.slot === 'points')?.path === '-',
);

// ── mergeCompleted ────────────────────────────────────────
const manual = [
  { code: 'CS101', name: '프로그래밍기초', category: '전필', credits: 3 },
  { code: '수기-1', name: '오프라인 특강', category: '일선', credits: 1 },
];
const infoList = [
  { code: 'CS101', name: '프로그래밍 기초', category: '전필', credits: 3, semester: '2024-1' },
  { code: 'MA201', name: '미적분학', category: '전기', credits: 3 },
];
const merged = mergeCompleted(manual, infoList);
t('merge: 수집본 우선 dedup(공백 무시)', merged.filter((c) => c.src === 'info').length === 2);
t('merge: 수동 고유 항목 유지', merged.some((c) => c.name === '오프라인 특강' && c.src === 'manual'));
t('merge: 수동 목록 불변', manual.length === 2 && manual[0].name === '프로그래밍기초');
t('merge: info 없으면 수동만', mergeCompleted(manual, undefined).every((c) => c.src === 'manual'));

t('credits: school total includes supplemental manual courses', resolveEarnedCredits(merged, 45, '') === 46);
t('credits: manual total is used when school total is missing', resolveEarnedCredits(merged, undefined, '70') === 70);
t('credits: completed courses are the fallback', resolveEarnedCredits(merged, undefined, '') === 7);
t('credits: no known value stays missing', resolveEarnedCredits([], undefined, '') === null);

// ── validateInfo ──────────────────────────────────────────
const valid = validateInfo(snap);
t('validate: 정상 통과', valid !== null && valid.completed.length === 4);
t('validate: 알려진 실패 사유 유지', validateInfo(snap2)?.diag?.pages.find((p) => p.slot === 'grades')?.reason === 'session-expired');
const unsafeDiag = structuredClone(snap2);
unsafeDiag.diag.pages.find((p) => p.slot === 'grades').reason = 'private upstream detail';
t('validate: 허용되지 않은 실패 사유 제거', validateInfo(unsafeDiag)?.diag?.pages.find((p) => p.slot === 'grades')?.reason === undefined);
t('validate: 잘못된 source 거부', validateInfo({ source: 'x', fetchedAt: 'now' }) === null);
t('validate: 비객체 거부', validateInfo('nope') === null && validateInfo(null) === null);
t('validate: 범위 초과 클램프', validateInfo({ source: 'info-hansung', fetchedAt: 't', points: 999999, completed: [] })?.points === undefined);
t('validate: completed 필터', validateInfo({ source: 'info-hansung', fetchedAt: 't', completed: [{ name: 'x' }, { code: 'A', name: '과목', category: '전필', credits: 3 }] })?.completed.length === 1);
t('validate: 학기/등급 문자열 길이 제한', valid?.completed.every((c) => (c.semester ?? '').length <= 10) === true);
const richValid = validateInfo({
  source: 'info-hansung',
  fetchedAt: 't',
  completed: [],
  academic: {
    grade: 2,
    status: '재학',
    tracks: ['AI응용학과', '컴퓨터공학'],
    admissionDate: '2025-03-01',
  },
  semesters: [
    {
      semester: '2026-1',
      earned: 15,
      gpa: 4.0,
      percentile: 90,
      courses: [
        { code: 'X', name: '과목', category: '전필', credits: 3, grade: 'A+' },
      ],
    },
  ],
  creditCategories: [{ label: '전필', credits: 12 }],
});
t(
  'validate: 학기별 성적·학적·이수구분 유지',
  richValid?.semesters?.[0].gpa === 4.0 &&
    richValid?.semesters?.[0].courses.length === 1 &&
    richValid?.academic?.tracks?.length === 2 &&
    richValid?.creditCategories?.[0].label === '전필',
);

// ── mergeInfoSnapshot: 부분 수집 보호 ──────────────────────
const prevSnap = {
  source: 'info-hansung',
  fetchedAt: '2026-01-01T00:00:00Z',
  name: '홍길동', dept: 'AI응용학과', admitYear: 2025,
  credits: 50, gpa: 2.87, points: 120,
  completed: [{ code: 'A', name: '과목A', category: '전선', credits: 3 }],
  audit: [{ area: '전공', required: '60', earned: '30', verdict: '진행' }],
};
const degradedNext = {
  source: 'info-hansung',
  fetchedAt: '2026-02-01T00:00:00Z',
  name: '홍길동', dept: 'AI응용학과',
  completed: [],
  diag: {
    menu: [],
    pages: [
      { slot: 'menu', path: 'left.jsp', ok: true },
      { slot: 'grades', path: '-', ok: false },
      { slot: 'points', path: '-', ok: false },
      { slot: 'audit', path: '-', ok: false },
    ],
  },
};
const mg1 = mergeInfoSnapshot(prevSnap, degradedNext);
t('merge-info: 슬롯 실패 시 completed 보존', mg1.completed.length === 1);
t('merge-info: 슬롯 실패 시 학점·평점 보존', mg1.credits === 50 && mg1.gpa === 2.87);
t('merge-info: 슬롯 실패 시 포인트·사정 보존', mg1.points === 120 && mg1.audit.length === 1);
t('merge-info: fetchedAt은 신값', mg1.fetchedAt === '2026-02-01T00:00:00Z');
t('merge-info: 신원은 새 값 우선', mg1.name === '홍길동' && mg1.dept === 'AI응용학과');
t('merge-info: admitYear 폴백', mg1.admitYear === 2025);

const fullNext = {
  source: 'info-hansung',
  fetchedAt: '2026-03-01T00:00:00Z',
  credits: 62, gpa: 3.0,
  completed: [
    { code: 'A', name: '과목A', category: '전선', credits: 3 },
    { code: 'B', name: '과목B', category: '교필', credits: 2 },
  ],
  audit: [{ area: '전공', required: '60', earned: '45', verdict: '진행' }],
  diag: {
    menu: [], pages: [
      { slot: 'grades', path: 'x.jsp', ok: true },
      { slot: 'points', path: 'p.jsp', ok: false },
      { slot: 'audit', path: 'a.jsp', ok: true },
    ],
  },
};
const mg2 = mergeInfoSnapshot(prevSnap, fullNext);
t('merge-info: 성공 슬롯은 새 값', mg2.completed.length === 2 && mg2.credits === 62 && mg2.gpa === 3.0);
t('merge-info: 성공 슬롯 사정 갱신', mg2.audit[0].earned === '45');
t('merge-info: 실패 슬롯 포인트 보존', mg2.points === 120);
t('merge-info: 신원 빈칸은 이전 유지', mg2.name === '홍길동' && mg2.dept === 'AI응용학과');
t('merge-info: prev 없으면 next 그대로', mergeInfoSnapshot(undefined, fullNext) === fullNext);

const prevRich = {
  ...prevSnap,
  academic: {
    grade: 2,
    status: '재학',
    tracks: ['AI응용학과'],
    admissionDate: '2025-03-01',
  },
  semesters: [
    { semester: '2025-2', earned: 15, gpa: 3.0, courses: [] },
  ],
  creditCategories: [{ label: '전필', credits: 12 }],
};
const degradedRich = {
  ...degradedNext,
  diag: {
    menu: [],
    pages: [
      { slot: 'grades', path: '-', ok: false },
      { slot: 'semesterGrades', path: '-', ok: false },
      { slot: 'academic', path: '-', ok: false },
    ],
  },
};
const mg3 = mergeInfoSnapshot(prevRich, degradedRich);
t(
  'merge-info: 학기별 성적·이수구분 학점 보존',
  mg3.semesters?.length === 1 && mg3.creditCategories?.[0].credits === 12,
);
t(
  'merge-info: 학적 상세 보존',
  mg3.academic?.grade === 2 && mg3.academic?.tracks?.[0] === 'AI응용학과',
);

const nextRich = {
  ...fullNext,
  academic: { grade: 3, status: '재학', tracks: ['컴퓨터공학'] },
  semesters: [
    { semester: '2026-1', earned: 18, gpa: 4.0, courses: [] },
  ],
  creditCategories: [{ label: '전선', credits: 21 }],
  diag: {
    menu: [],
    pages: [
      { slot: 'grades', path: 'x.jsp', ok: true },
      { slot: 'semesterGrades', path: 's.jsp', ok: true },
      { slot: 'academic', path: 'a.jsp', ok: true },
    ],
  },
};
const mg4 = mergeInfoSnapshot(prevRich, nextRich);
t(
  'merge-info: 성공한 학기·학적 슬롯은 새 값',
  mg4.semesters?.[0].gpa === 4.0 &&
    mg4.creditCategories?.[0].label === '전선' &&
    mg4.academic?.grade === 3,
);

console.log(`info.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
