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
  ClipboardList,
} from 'lucide-react';
import type { LmsSnapshot } from '@/lib/data/lms';
import type { InfoSnapshot } from '@/lib/data/info';
import type { ExtActivity } from '@/lib/data/activities';
/* 사이드바 순서 — chrome.tsx NAV_GROUP_AT의 캡션 경계와 맞춘다 */
export const menus = [
  ['home', '홈', Home],
  ['lms', '수업·과제', MonitorPlay],
  ['graduation', '졸업 요건', GraduationCap],
  ['semester-plan', '학기별 계획', Layers],
  ['timetable', '시간표 짜기', LayoutGrid],
  ['courses', '과목 추천', BookOpen],
  ['activities', '비교과·대외활동', Compass],
  ['calendar', '학사일정', CalendarDays],
  ['advisor', 'AI 학사 도우미', Sparkles],
  ['survey', '설문조사', ClipboardList],
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
  admissionType?: 'unknown' | 'freshman' | 'general-transfer' | 'bachelor-transfer';
  dept: string;
  credits: string;
  points: string;
  saved: string[];
  planned: string[];
  /** 시간표 시나리오 — 'A'|'B'|'C' → 카탈로그 section.id 배열.
   *  planned는 현재 작업 중인 안이며, 시나리오는 저장·불러오기로만 연결된다 */
  plans?: Record<string, string[]>;
  planSemester?: string;
  semesterPlans?: Record<string, { sourceSemester: string; planned: string[]; plans: Record<string, string[]> }>;
  setupHistory?: 'none' | 'later';
  recommendationsSeen?: boolean;
  completed: Completed[];
  ruleOverrides: Record<string, number>;
  events: { title: string; date: string }[];
  prefs: string[];
  /** 비교과·대외활동 취향 설문 답변 (ACT_QUESTIONS 순서) */
  actPrefs?: string[];
  /** 첫 설문 안내와 중단·완료 상태. 기존 답변 배열과 별도로 보관한다. */
  surveyStatus?: 'in-progress' | 'completed' | 'skipped';
  /** 학습 고민(페인포인트) 설문 답변 (PAIN_QUESTIONS 순서) — 홈에서 한 번 제안한다 */
  painPrefs?: string[];
  /** 온보딩에서 저장한 학기 계획과 진행 상태 */
  semester?: string;
  graduationTarget?: string;
  onboardingStep?: number;
  /** 활동 진행 단계(본인 확인용) — activity id → ACT_STAGES 단계 id */
  actStatus?: Record<string, string>;
  /** 직접 등록한 외부 활동 — hsportal 목록 외의 사용자 입력 데이터 */
  extActivities?: ExtActivity[];
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
  /** 종합정보시스템 수집 스냅샷 — 로그인 시 서버가 읽어온 이수 내역·
   *  비교과 포인트·졸업가사정표·학적 요약 (서버 작성 전용) */
  info?: InfoSnapshot;
  /** 프로필 리비전 — 서버가 저장할 때 +1. 낙관적 잠금(충돌 감지)에 사용 */
  rev?: number;
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

// 3-way 프로필 병합 — 순수 로직이라 lib으로 분리해 노드 테스트에서 쓴다.
export { mergeProfile } from '@/lib/data/profile-merge';
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

/** 비교과·대외활동 취향 설문 — 독립 설문 페이지에서 수업 설문과 함께 사용 */
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

/** 학습 고민 설문 — GPAI식 가벼운 톤으로 홈 진입 시 한 번 제안한다.
 *  답변은 맞춤 안내와 AI 학사 도우미 맥락에 참고한다. */
export const PAIN_QUESTIONS = [
  [
    '요즘 공부에서 가장 힘든 순간은 언제인가요?',
    '마감 직전에만 집중돼요',
    '할 일이 쌓여서 밀려요',
    '졸업요건 계산이 헷갈려요',
    '수업 진도를 따라가기 벅차요',
  ],
  [
    '이런 경험, 공감되나요?',
    '동기부여는 마감 12시간 전에 최고조예요',
    '형광펜을 다 칠했는데 남는 게 없어요',
    '검색하려다 딴짓하고 돌아와요',
    '밤을 새우고 6시에 후회해요',
  ],
  [
    'AI 도우미가 가장 잘 도와줄 수 있는 건?',
    '마감 일정 총정리',
    '수업 진도 점검',
    '졸업 경로 설계',
    '비교과·일정 챙김',
  ],
] as const;
