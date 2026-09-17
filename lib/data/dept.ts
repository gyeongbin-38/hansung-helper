/**
 * 학과명 정규화 — 프로필의 자유 입력 학과명을 카탈로그 dept 값으로 해석.
 * 모호한 입력은 추측하지 않고 candidates로 돌려 "학과 매칭 확인 필요" 상태를 만든다.
 */

const NORM = (s: string) =>
  s.replace(/[\s·&()/-]/g, '').toLowerCase();

/** 명확한 축약/통칭만 매핑 — 모호한 것(디자인, 경영 등)은 일부러 둔다. */
const ALIASES: Record<string, string> = {
  컴공: 'IT응용시스템공학과',
  컴퓨터공학과: 'IT응용시스템공학과',
  컴퓨터공학: 'IT응용시스템공학과',
  it응용: 'IT응용시스템공학과',
  소웨: 'AI·소프트웨어학과',
  소프트웨어학과: 'AI·소프트웨어학과',
  ai소웨: 'AI·소프트웨어학과',
  ai소프트웨어학과: 'AI·소프트웨어학과',
  ai응용: 'AI응용학과',
  ai학과: 'AI응용학과',
  무용: '한국무용전공',
  영영: '영어영문학부',
  영문: '영어영문학부',
  국문: '국어국문전공',
  회화: '회화과',
  호텔경영: '호텔외식경영학과',
  외식경영: '호텔외식경영학과',
  기계: '기계시스템공학과',
  기계공학: '기계시스템공학과',
  전자: '전자정보공학과',
  전자공학: '전자정보공학과',
  전정: '전자정보공학과',
  산경: '산업경영공학과',
  산업경영: '산업경영공학과',
  산공: '산업경영공학과',
  뷰티: '뷰티디자인매니지먼트학과',
  뷰티디자인: '뷰티디자인학과',
  패뷰크: '패션뷰티크리에이션학과',
  보안: '융합보안학과',
  융합보안: '융합보안학과',
  융합행정: '융합행정학과',
  스마트제조: '스마트제조혁신컨설팅학과',
  비즈니스컨설팅: '비즈니스컨설팅학과',
  부동산: '부동산세무경영학과',
  부동산세무경영: '부동산세무경영학과',
  벤처창업: '글로벌벤처창업학과',
  글로벌창업: '글로벌벤처창업학과',
  k비즈니스: '글로벌K비즈니스학과',
  모빌리티: '미래모빌리티학과',
  미래모빌리티: '미래모빌리티학과',
  영상엔터: '영상엔터테인먼트학과',
  인엔: '인터랙티브엔터테인먼트',
  디콘디: '디지털콘텐츠디자인학과',
  ict디자인: 'ICT융합디자인학과',
  ict융합디자인: 'ICT융합디자인학과',
  문콘: '문학문화콘텐츠학과',
  한국어교육: '한국어교육트랙',
  한언교: '한국언어문화교육학과',
};

export type DeptResolution = {
  /** 확정된 카탈로그 학과명 */
  dept?: string;
  /** 모호해서 후보가 여럿일 때 */
  candidates?: string[];
};

export function resolveDept(
  input: string,
  depts: string[],
): DeptResolution {
  const n = NORM(input);
  if (!n) return {};
  const alias = ALIASES[n];
  if (alias && depts.includes(alias)) return { dept: alias };
  const exact = depts.find((d) => NORM(d) === n);
  if (exact) return { dept: exact };
  const cands = depts.filter(
    (d) => NORM(d).includes(n) || n.includes(NORM(d)),
  );
  if (cands.length === 1) return { dept: cands[0] };
  if (cands.length > 1) return { candidates: cands };
  return {};
}
