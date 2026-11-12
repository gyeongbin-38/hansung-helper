/** 공식 원문 확인: 2026-11-06. 개인 충족 여부 자동 판정 아님. */
export type VerifiedDeptGuide = {
  department: string; cohorts: string; url: string; checkedAt: string; items: string[];
};
export function verifiedDeptGuide(dept: string, year?: number): VerifiedDeptGuide | null {
  const name = dept.replace(/\s+/g, '');
  if (!Number.isInteger(year) || year! < 1900 || year! > new Date().getFullYear()) return null;
  if (name === 'AI응용학과') return {
    department: 'AI응용학과', cohorts: '입학연도별 적용은 각 항목 참조',
    url: 'https://www.hansung.ac.kr/CreCon/2781/subview.do', checkedAt: '2026-11-06',
    items: [
      '졸업 인증: TOEIC 700점 이상(또는 승인받은 상응 공인영어), 단독 제1저자 논문 실적, 지정 또는 학과장 사전 승인 공모전 참여 중 하나. 기타 세부 인정 조건은 원문 확인.',
      '인공지능 캡스톤디자인: 2027년 2월 졸업예정자부터 적용. 단 2025학년도 1학기 종료 기준 6학기 이상 이수자는 면제.',
      year! >= 2025 ? '기업연계형 프로젝트: 25학번부터 지정 교과 이수 또는 해당 산학 프로젝트 참여·수행 중 하나 필요. 기업 연계 여부와 인정은 학과 확인.' : '기업연계형 프로젝트: 공식 페이지는 25학번부터 적용으로 명시. 개인 적용 여부는 학과에 확인.',
      '모든 요건 충족 후 졸업요건 인정 신청서를 학과에 제출해야 최종 인정.',
    ],
  };
  if (name === '컴퓨터공학부') return {
    department: '컴퓨터공학부', cohorts: year! <= 2015 ? '~15학번' : year === 2016 ? '16학번' : year! <= 2023 ? '17~23학번' : '24학번 이후',
    url: 'https://hansung.ac.kr/CSE/1564/subview.do', checkedAt: '2026-11-06',
    items: [
      '캡스톤디자인 발표회 작품 출품(지도교수 허가), 졸업논문, 전공 관련 자격증 또는 공모전 입상(교수회의 심사) 중 1개 이상. 세부 인정 조건과 제출기한은 원문 확인.',
      year! >= 2017 ? '캡스톤디자인 수강 필수 및 졸업요건 제출기한 내 제출 필요.' : '해당 학번의 캡스톤 관련 적용 조건은 학부 원문과 학부 사무실에서 확인.',
      year! <= 2015 ? '공식 표의 트랙 이수 수: 해당 없음.' : year === 2016 ? '공식 표의 트랙 이수 수: 1개.' : '공식 표의 트랙 이수 수: 2개.',
      '산학협력 프로젝트: 학번과 관계없이 2028년 2월 졸업예정자부터 적용. 인정 경로·증빙 및 제출 공지는 학부 원문 확인.',
      'GitHub 활동 이력서는 권장 사항으로 표기되어 있으며 필수 충족 요건으로 계산하지 않음.',
    ],
  };
  return null;
}
