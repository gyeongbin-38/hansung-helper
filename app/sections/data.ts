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
  ['advisor', '학사 안내', Sparkles],
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
  /** 시간표 시나리오 — 'A'|'B'|'C' → 카탈로그 section.id 배열.
   *  planned는 현재 작업 중인 안이며, 시나리오는 저장·불러오기로만 연결된다 */
  plans?: Record<string, string[]>;
  completed: Completed[];
  ruleOverrides: Record<string, number>;
  events: { title: string; date: string }[];
  prefs: string[];
  /** 비교과·대외활동 취향 설문 답변 (ACT_QUESTIONS 순서) */
  actPrefs?: string[];
  /** 읽음 처리한 알림 id — 새 알림이 오면 다시 unread로 표시된다 */
  readIds: string[];
  /** 졸업 학점 외 요건(인증·캡스톤 등) 본인 확인 체크 — 공식 사정과 무관한 사용자 메모 */
  reqChecks?: string[];
  /** 발송 완료한 마감 알림 id — 브라우저 알림 중복 발송 방지 */
  notifiedIds?: string[];
  /** 브라우저 마감 알림 opt-in — 앱이 열려 있는 동안만 동작 */
  notifEnabled?: boolean;
  /** COSMOS LMS 수집 스냅샷 (/lms-collect.js 콘솔 스크립트 또는 서버 수집 결과물) */
  lms?: LmsSnapshot;
  /** 수업 현황의 수동 매칭 보정 — LMS course.id → 카탈로그 section.id 또는 'ignore'(수업 아님) */
  lmsMatch?: Record<string, string>;
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

/** 비교과·대외활동 취향 설문 — activities 섹션 전용 */
export const ACT_QUESTIONS = [
  [
    '비교과 활동의 목표는 무엇인가요?',
    '졸업 포인트 채우기',
    '경험·스펙 쌓기',
    '사람 만나기',
    '상관없음',
  ],
  [
    '어떤 활동이 끌리나요?',
    '특강·멘토링',
    '공모전·대회',
    '봉사·교류',
    '상관없음',
  ],
  [
    '혼자 하는 게 편한가요, 함께 하는 게 좋나요?',
    '개인 활동',
    '팀 활동',
    '상관없음',
  ],
  [
    '일정은 어떻게 고를까요?',
    '마감 임박한 것부터',
    '여유 있는 것부터',
    '상관없음',
  ],
  [
    '포인트는 얼마나 중요한가요?',
    '높은 포인트 우선',
    '내용이 좋으면 상관없음',
  ],
];
