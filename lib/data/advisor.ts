import type { Data } from '../../app/sections/data';
import { conflicts, semesterStartTs, type Catalog } from './catalog.ts';
import { currentSemesterStart, dueSoon, pendingTasks } from './lms.ts';
import { liveStatus, type ActivitySnapshot } from './activities.ts';
import { scheduleToday, upcomingSchedule, type ScheduleSnapshot } from './schedule.ts';
import { searchAll } from './search.ts';

export const SERVICE_GUIDES = [
  { label: '로그인·학교 연결', route: 'settings', keywords: /로그인|연결|연동|수집|코스모스|COSMOS|오류|안돼|안되/i,
    text: '학교 계정으로 로그인한 뒤 설정에서 종합정보와 COSMOS의 수집 상태·시각을 확인하세요. 수업 현황에서 다시 가져올 수 있어요. 비밀번호는 저장하지 않으며, 브라우저 체험은 학교 계정과 별도로 저장돼요.' },
  { label: '시간표 짜기', route: 'timetable', keywords: /시간표|충돌|수강|과목|공강|계획/,
    text: '시간표 짜기에서 학기를 고르고 개설 과목을 검색해 담으세요. 겹치는 시간과 시간 미정 과목을 확인하고, 학기별 계획에서 학기마다 계획을 관리할 수 있어요. 담은 과목은 수강신청이 아니며 실제 신청은 학교 시스템에서 해야 해요.' },
  { label: '졸업요건 확인', route: 'graduation', keywords: /졸업|학점|이수|전공|교양|포인트/,
    text: '내 정보의 소속·입학연도와 졸업요건 화면의 학교 이수 내역을 먼저 확인하세요. 직접 입력한 이수 과목과 학교 수집값은 구분돼요. 기준 미확정 항목은 학과에 확인해야 하며, 화면의 계산만으로 졸업 가능 여부를 확정할 수 없어요.' },
  { label: '과제·강의·퀴즈', route: 'lms', keywords: /과제|강의|퀴즈|마감|이번 주|이번주|할 일|출석/,
    text: '수업 현황에서 강의·과제·퀴즈와 마감을 확인하세요. 수집 시각과 확인 필요 표시를 함께 보세요. 제출·응시·출석 여부가 불명확한 항목은 COSMOS 원문에서 확인해야 해요.' },
  { label: '비교과·대외활동', route: 'activities', keywords: /비교과|활동|프로그램|튜터링|봉사/,
    text: '비교과·대외활동에서 공개 모집 목록을 검색하고 관심 활동을 저장하세요. 신청 기간·대상·인정 포인트는 학교 공고에서 최종 확인하고 신청하세요. 공개 목록에는 개인 참여 내역이 포함되지 않아요.' },
  { label: '학사일정·개인 일정', route: 'calendar', keywords: /일정|캘린더|날짜|알림|방학|시험/,
    text: '학사일정에서 학교 일정과 개인 일정을 볼 수 있어요. 빠른 추가에 날짜와 제목을 입력한 뒤 미리보기를 확인하고 등록하세요. 알림함에서 마감 알림을 설정할 수 있으며 브라우저 알림은 앱이 열려 있을 때 동작해요.' },
  { label: '저장 정보·삭제', route: 'settings', keywords: /저장|삭제|탈퇴|체험|로그아웃|개인정보/,
    text: '설정에서 계정 정보와 이 브라우저의 체험 정보를 구분해 볼 수 있어요. 로그아웃은 현재 브라우저의 세션을 끝내고, 내 계정 자료 삭제는 계정과 모든 세션을 삭제해요. 체험 초기화는 이 브라우저의 체험 기록만 지워요.' },
] as const;

export type AdvisorSource = { label: string; route: string; asOf?: string };
export type AdvisorReply = {
  mode: 'ai' | 'guide';
  answer: string;
  sources: AdvisorSource[];
  personal: boolean;
};
export type AdvisorMessage = { role: 'user' | 'assistant'; content: string };
export type AdvisorPublicData = {
  catalog: Catalog | null;
  activities: ActivitySnapshot | null;
  schedule: ScheduleSnapshot | null;
};

/** Only these academic fields reach the model. No name, student ID, grades,
 * credentials, cookies, raw school pages or personal event text is included. */
export function advisorContext(
  data: Partial<Data> | null,
  publicData: AdvisorPublicData,
  now = Date.now(),
) {
  const { catalog, activities, schedule } = publicData;
  const open = activities?.items.filter((a) => ['open', 'closing'].includes(liveStatus(a, now).status)) ?? [];
  const sources: AdvisorSource[] = [
    { label: '서비스 사용 안내', route: 'settings' },
    ...(catalog ? [{ label: `${catalog.semester} 개설 과목`, route: 'courses', asOf: catalog.generatedAt }] : []),
    ...(activities ? [{ label: '학교 비교과 공개 목록', route: 'activities', asOf: activities.fetchedAt }] : []),
    ...(schedule ? [{ label: '학교 학사일정', route: 'calendar', asOf: schedule.fetchedAt }] : []),
  ];
  const publicFacts = {
    today: scheduleToday(now),
    courseSemester: catalog?.semester ?? null,
    openActivities: open.slice(0, 8).map((a) => ({ title: a.title, end: a.applyEnd, points: a.points })),
    openActivityCount: activities ? open.length : null,
    upcomingSchedule: schedule ? upcomingSchedule(schedule.items, scheduleToday(now)).slice(0, 8)
      .map((e) => ({ title: e.title, start: e.start, end: e.end })) : null,
  };
  if (!data) return { publicFacts, personalFacts: null, sources };

  // A future plan may use an older source catalog. Label both explicitly.
  const planIds = new Set(Array.isArray(data.planned) ? data.planned : []);
  const planned = catalog?.sections.filter((s) => planIds.has(s.id)) ?? [];
  const before = (catalog?.semester ? semesterStartTs(catalog.semester) : null) ?? currentSemesterStart(now);
  const lms = data.lms;
  const completed = data.completed ?? [];
  const personalFacts = {
    department: typeof data.dept === 'string' ? data.dept.slice(0, 100) : null,
    admissionYear: typeof data.year === 'string' ? data.year.slice(0, 4) : null,
    plan: {
      semester: data.planSemester ?? data.semester ?? null,
      sourceSemester: catalog?.semester ?? null,
      count: planned.length,
      credits: planned.reduce((sum, s) => sum + s.credits, 0),
      conflictingCourses: planned.filter((s) => conflicts(s, planned).length).length,
      untimedCourses: planned.filter((s) => s.untimed || !s.slots.length).length,
      courses: planned.slice(0, 30).map((s) => ({ name: s.name, credits: s.credits })),
      note: '사용자가 담은 계획이며 수강신청·취득학점이 아님',
    },
    userEntered: {
      completedCourseCount: completed.length,
      completedCredits: completed.reduce((sum, c) => sum + c.credits, 0),
      creditMemo: typeof data.credits === 'string' ? data.credits.slice(0, 10) : null,
      pointMemo: typeof data.points === 'string' ? data.points.slice(0, 10) : null,
      note: '직접 입력한 값이며 학교 수집값과 합산하지 말 것',
    },
    schoolSummary: data.info ? {
      credits: data.info.credits ?? null, points: data.info.points ?? null,
      asOf: data.info.fetchedAt,
      note: '수집 시점 요약이며 학과별 졸업 기준 충족을 의미하지 않음',
    } : null,
    lms: lms ? {
      asOf: lms.fetchedAt,
      deadlines: dueSoon(lms, now, 7, 20, before).map((t) => ({ title: t.title, course: t.course, kind: t.kind, due: t.due })),
      uncertainItems: pendingTasks(lms, before).filter((t) => t.uncertain).length,
      note: '수집 시점 기준. 확인 불명확·이전 결과 보존 항목은 학교 원문에서 확인',
    } : null,
  };
  sources.push({ label: '내 계정에 저장한 계획·직접 입력값', route: 'profile' });
  if (data.info) sources.push({ label: '종합정보 수집 요약', route: 'graduation', asOf: data.info.fetchedAt });
  if (lms) sources.push({ label: 'COSMOS 수집본', route: 'lms', asOf: lms.fetchedAt });
  return { publicFacts, personalFacts, sources };
}

/** An explicitly labelled local guide remains available without model access. */
export function guideReply(question: string, data: Partial<Data> | null, publicData: AdvisorPublicData, now = Date.now()): AdvisorReply {
  const guides = SERVICE_GUIDES.filter((g) => g.keywords.test(question));
  const selected = guides.length ? guides.slice(0, 3) : SERVICE_GUIDES.slice(0, 3);
  const context = advisorContext(data, publicData, now);
  const hits = searchAll(question, publicData.catalog, publicData.activities?.items ?? null,
    publicData.schedule?.items ?? null, data?.lms?.courses ?? null, now).slice(0, 6);
  const facts = context.personalFacts;
  const notes: string[] = [];
  if (facts && /계획|시간표|수강/.test(question))
    notes.push(`현재 자료에서 확인한 계획은 ${facts.plan.count}과목 · ${facts.plan.credits}학점이며, 시간이 겹치는 과목은 ${facts.plan.conflictingCourses}개예요. 실제 수강신청 결과와는 별개예요.`);
  if (facts && /이번.?주|과제|마감/.test(question))
    notes.push(facts.lms
      ? `COSMOS 수집본 기준 7일 안에 마감하는 항목은 ${facts.lms.deadlines.length}건이에요. 수집 시각: ${facts.lms.asOf}. 확인이 불명확한 항목은 COSMOS에서 직접 확인하세요.`
      : '가져온 COSMOS 정보가 없어 개인 마감을 확인할 수 없어요. 수업 현황에서 연결 상태를 확인하세요.');
  return { mode: 'guide', personal: !!data, answer: [...notes, ...selected.map((g) => g.text),
      ...(hits.length ? [`관련 항목 ${hits.length}개를 찾았어요. 아래 화면에서 확인해 보세요.`] : [])].join('\n\n'),
    sources: [...selected.map((g) => ({ label: g.label, route: g.route })), ...hits.map((h) => ({ label: h.label, route: h.route }))] };
}
