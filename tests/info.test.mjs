// 종합정보 수집 파서·수집기 테스트 — node --experimental-transform-types tests/info.test.mjs
import assert from 'node:assert/strict';
import {
  parseInfoMenu,
  pickTargets,
  parseGrades,
  parsePoints,
  parseAudit,
  parseIdentity,
  collectInfo,
} from '../lib/server/info.ts';
import {
  infoCategory,
  mergeCompleted,
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
t('real targets: 포인트 외부 링크라 미검출', realTargets.points === undefined);

const rg = parseGrades(REAL_GRADES);
t('real grades: 5과목(F·미확정 제외)', rg.completed.length === 5);
t('real grades: 학기 라벨(학년도 공백 형태)', rg.completed[0].semester === '2026-1' && rg.completed[4].semester === '2025-2');
t('real grades: 요약 테이블 오염 없음', !rg.completed.some((c) => c.name.includes('요약') || c.name.includes('계')));
t('real grades: 코드/카테고리', rg.completed[0].code === 'GEN1015' && rg.completed[0].category === '일교' && rg.completed[3].category === '교필');
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
}), { menuHtml: MENU_HTML, mainHtml: ID_HTML });
t('collect: 스냅샷 조립', snap.source === 'info-hansung');
t('collect: 과목 수', snap.completed.length === 4);
t('collect: 포인트', snap.points === 780);
t('collect: 사정표', snap.audit?.length === 3);
t('collect: 학적', snap.name === '홍길동' && snap.admitYear === 2024);
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
t('collect: 포인트는 성공', snap2.points === 780);
t('collect: 학적은 메인에서 보존', snap2.dept === '컴퓨터공학과');

// 실계정 마크업 e2e — 프레임 메뉴 발견 → 누적성적 수집 → 학적 병합
const snap3 = await collectInfo(
  fakeSession({
    'left.jsp': REAL_LEFT,
    'top.jsp': '<html><body>nav</body></html>',
    infohaksamain_portal: REAL_LEFT,
    total_grade: REAL_GRADES,
    joluprequire:
      '<html><body>졸업(가)사정 자료가 존재하지 않습니다.</body></html>',
  }),
  { menuHtml: REAL_TOP_MENU, mainHtml: REAL_MAIN, studentId: '2199999' },
);
t('real collect: 과목 수', snap3.completed.length === 5);
t('real collect: 취득학점/평점', snap3.credits === 50 && snap3.gpa === 2.87);
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

// ── validateInfo ──────────────────────────────────────────
const valid = validateInfo(snap);
t('validate: 정상 통과', valid !== null && valid.completed.length === 4);
t('validate: 잘못된 source 거부', validateInfo({ source: 'x', fetchedAt: 'now' }) === null);
t('validate: 비객체 거부', validateInfo('nope') === null && validateInfo(null) === null);
t('validate: 범위 초과 클램프', validateInfo({ source: 'info-hansung', fetchedAt: 't', points: 999999, completed: [] })?.points === undefined);
t('validate: completed 필터', validateInfo({ source: 'info-hansung', fetchedAt: 't', completed: [{ name: 'x' }, { code: 'A', name: '과목', category: '전필', credits: 3 }] })?.completed.length === 1);
t('validate: 학기/등급 문자열 길이 제한', valid?.completed.every((c) => (c.semester ?? '').length <= 10) === true);

console.log(`info.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
