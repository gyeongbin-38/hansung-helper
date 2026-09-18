import {
  GraduationCap,
  Home,
  LayoutGrid,
  Compass,
  CalendarDays,
  Sparkles,
  Layers,
  BookOpen,
  MonitorPlay,
} from 'lucide-react';
import type { LmsSnapshot } from '@/lib/data/lms';
export const menus = [
  ['home', '홈', Home],
  ['timetable', '시간표 짜기', LayoutGrid],
  ['activities', '비교과·대외활동', Compass],
  ['calendar', '학사일정', CalendarDays],
  ['lms', '수업 현황', MonitorPlay],
  ['advisor', 'AI 상담', Sparkles],
  ['graduation', '졸업요건', GraduationCap],
  ['semester-plan', '학기별 계획', Layers],
  ['courses', '과목 추천', BookOpen],
] as const;
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
  /** 읽음 처리한 알림 id — 새 알림이 오면 다시 unread로 표시된다 */
  readIds: string[];
  /** COSMOS LMS 수집 스냅샷 (scripts/lms-collect.mjs 결과물) */
  lms?: LmsSnapshot;
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
  readIds: [],
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
