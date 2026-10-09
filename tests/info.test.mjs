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
<tr><th>교과목명</th><th>이수구분</th><th>학점</th></tr>
<tr><td colspan="3">2023학년도 1학기</td></tr>
<tr><td>대학영어</td><td>교양선택</td><td>2</td></tr>
</table>`;
const gi = parseGrades(GRADES_INLINE);
t('grades: 인라인 학기행 인식', gi.completed[0]?.semester === '2023-1');

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
t('collect: diag 페이지 ok', snap.diag?.pages.every((p) => p.ok) === true);

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
