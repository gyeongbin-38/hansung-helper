import { chosungOf, isChosungQuery, koreanMatch } from '../lib/data/hangul.ts';
import { resolveDept } from '../lib/data/dept.ts';
import { daySummaries } from '../lib/data/catalog.ts';

let pass = 0;
let fail = 0;
const t = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL', name);
  }
};

// 초성 검색
t('chosung 자료구조', chosungOf('자료구조') === 'ㅈㄹㄱㅈ');
t('chosung AI융합', chosungOf('AI융합') === 'aiㅇㅎ');
t('초성 매칭', koreanMatch('자료구조', 'ㅈㄹㄱㅈ'));
t('초성 중간 매칭', koreanMatch('알고리즘 설계', 'ㄱㄹ'));
t('일반 부분문자열', koreanMatch('자료구조', '구조'));
t('대소문자·공백 무시', koreanMatch('Data Structure', 'datastructure'));
t('빈 쿼리', koreanMatch('아무거나', ''));
t('비매칭 초성', !koreanMatch('자료구조', 'ㅂㄹ'));
t('isChosungQuery', isChosungQuery('ㄱㄷㅅ') && !isChosungQuery('구조'));

// 학과 정규화
const DEPTS = [
  'AI·소프트웨어학과',
  'AI응용학과',
  'AI로봇융합트랙',
  'IT응용시스템공학과',
  '모바일소프트웨어트랙',
  '빅데이터트랙',
  '전자정보공학과',
  '융합보안학과',
  '뷰티디자인학과',
  '뷰티디자인매니지먼트학과',
  '디지털콘텐츠디자인학과',
  '영어영문학부',
  '한국무용전공',
];
t('별칭 컴공', resolveDept('컴공', DEPTS).dept === 'IT응용시스템공학과');
{
  const r = resolveDept('AI융합', DEPTS);
  t('AI융합 미해석 — 추측하지 않음', !r.dept && !r.candidates);
}
{
  const r = resolveDept('융합', DEPTS);
  t(
    '융합 → 모호 후보 2개',
    !r.dept &&
      r.candidates?.length === 2 &&
      r.candidates.includes('융합보안학과'),
  );
}
t('정확 일치', resolveDept('AI응용학과', DEPTS).dept === 'AI응용학과');
t('공백·특수문자 정규화', resolveDept('ai 소프트웨어', DEPTS).dept === 'AI·소프트웨어학과');
{
  const r = resolveDept('뷰티', DEPTS);
  t('별칭 뷰티', r.dept === '뷰티디자인매니지먼트학과');
}
{
  const r = resolveDept('디자인', DEPTS);
  t('모호 → 후보 반환', !!r.candidates && r.candidates.length >= 2 && !r.dept);
}
{
  const r = resolveDept('철학과', DEPTS);
  t('미매칭 → 빈 결과', !r.dept && !r.candidates);
}
t('빈 입력', !resolveDept('', DEPTS).dept);
{
  // 공식 학부명은 카탈로그 개설 단위가 아니라 패밀리 후보로 해석된다
  const r = resolveDept('컴퓨터공학부', DEPTS);
  t(
    '컴퓨터공학부 → 검증 패밀리 후보',
    !r.dept &&
      r.candidates?.length === 3 &&
      r.candidates.includes('IT응용시스템공학과') &&
      r.candidates.includes('모바일소프트웨어트랙') &&
      r.candidates.includes('빅데이터트랙'),
  );
}
{
  // 카탈로그에 없는 패밀리 단위는 후보에서 빠진다
  const r = resolveDept('컴퓨터공학부', ['IT응용시스템공학과', '국어국문전공']);
  t('패밀리 부분 매칭', !r.dept && r.candidates?.length === 1 && r.candidates[0] === 'IT응용시스템공학과');
}

// 공강 분석
const SEC = (slots) => ({
  id: 'x',
  code: 'X',
  name: 'x',
  section: '1',
  dept: 'x',
  category: '전선',
  credits: 3,
  year: '1',
  professor: '',
  room: '',
  slots,
  untimed: !slots.length,
  online: false,
  cross: false,
});
{
  const sums = daySummaries([
    SEC([{ d: 0, s: 540, e: 615 }, { d: 0, s: 780, e: 855 }]),
    SEC([{ d: 2, s: 540, e: 690 }]),
  ]);
  t('월 2개 수업', sums[0].count === 2);
  t('월 공강 615~780', sums[0].gaps.length === 1 && sums[0].gaps[0].s === 615 && sums[0].gaps[0].e === 780);
  t('화 공강일', sums[1].count === 0);
  t('수 첫수업 9시', sums[2].first === 540 && sums[2].last === 690);
}
{
  const sums = daySummaries([
    SEC([{ d: 1, s: 540, e: 615 }]),
    SEC([{ d: 1, s: 600, e: 675 }]), // 겹치는 슬롯은 병합
  ]);
  t('겹침 병합 — 공강 없음', sums[1].gaps.length === 0 && sums[1].last === 675);
}
{
  const sums = daySummaries([SEC([{ d: 3, s: 540, e: 560 }]), SEC([{ d: 3, s: 575, e: 600 }])]);
  t('30분 미만 틈은 공강 아님', sums[3].gaps.length === 0);
}

console.log(`ux-utils: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
