import {
  GraduationCap,
  Home,
  LayoutGrid,
  Compass,
  CalendarDays,
  Sparkles,
  Layers,
  BookOpen,
} from 'lucide-react';
export const menus = [
  ['home', '홈', Home],
  ['timetable', '시간표 짜기', LayoutGrid],
  ['activities', '비교과·대외활동', Compass],
  ['calendar', '학사일정', CalendarDays],
  ['advisor', 'AI 상담', Sparkles],
  ['graduation', '졸업요건', GraduationCap],
  ['semester-plan', '학기별 계획', Layers],
  ['courses', '과목 추천', BookOpen],
] as const;
export const acts = [
  {
    id: 'creative',
    type: '교내 비교과',
    title: '아이디어가 프로젝트가 되는 순간',
    name: '창의융합 프로젝트 워크숍',
    desc: '관심 있는 문제를 발견하고, 팀과 함께 나만의 해결책을 만들어 보세요.',
    date: '2026-09-25',
    period: '10. 5. — 10. 23.',
    tag: '프로젝트 · 진로 탐색',
    art: 'CREATE',
    en: 'DESIGN YOUR NEXT STEP',
  },
  {
    id: 'career',
    type: '교내 비교과',
    title: '나의 다음 커리어를 발견하세요',
    name: '직무 탐색 & 포트폴리오 클래스',
    desc: '실무자의 이야기에서 하고 싶은 일을 발견하고, 나만의 포트폴리오를 구상해 보세요.',
    date: '2026-09-28',
    period: '10. 6. — 10. 8.',
    tag: '커리어 · 포트폴리오',
    art: 'NEXT',
    en: 'FIND YOUR DIRECTION',
  },
  {
    id: 'outside',
    type: '대외활동',
    title: '캠퍼스 밖으로, 한 걸음 더',
    name: '대학생 지역문제 해결 챌린지',
    desc: '작은 관찰에서 시작하는 새로운 도전. 다양한 전공의 학생들과 협업을 경험하세요.',
    date: '2026-10-02',
    period: '10. 12. — 11. 6.',
    tag: '협업 · 사회문제 해결',
    art: 'GROW',
    en: 'BEYOND THE CAMPUS',
  },
];
export type Completed = {
  code: string;
  name: string;
  category: string;
  credits: number;
};
export type Data = {
  name: string;
  year: string;
  dept: string;
  credits: string;
  points: string;
  saved: string[];
  planned: string[];
  completed: Completed[];
  ruleOverrides: Record<string, number>;
  events: { title: string; date: string }[];
  prefs: string[];
  read: boolean;
  consent: boolean;
};
export const empty: Data = {
  name: '한성인',
  year: '',
  dept: '소속 미입력',
  credits: '',
  points: '',
  saved: [],
  planned: [],
  completed: [],
  ruleOverrides: {},
  events: [],
  prefs: [],
  read: false,
  consent: false,
};
export const questions = [
  [
    '이번 학기의 우선 목표는 무엇인가요?',
    '졸업요건 충족',
    '전공 심화',
    '진로 탐색',
    '일정 여유',
  ],
  ['선호하는 수업 시간은 언제인가요?', '오전', '오후', '상관없음'],
  ['수업이 어려운 요일이 있나요?', '없음', '월요일', '금요일'],
  ['어떤 수업 방식을 선호하나요?', '이론', '실습', '프로젝트', '상관없음'],
  [
    '선호하는 평가 방식은 무엇인가요?',
    '시험',
    '개인 과제',
    '팀 프로젝트',
    '상관없음',
  ],
  ['어떤 학기 구성을 원하나요?', '공강일 확보', '고른 배치', '상관없음'],
];
