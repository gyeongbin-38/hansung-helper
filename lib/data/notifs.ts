import { conflicts, type CourseSection } from './catalog.ts';
import { liveStatus, type ActivitySnapshot } from './activities.ts';
import type { ScheduleSnapshot } from './schedule.ts';
import { dueSoon, type LmsSnapshot } from './lms.ts';

export type NotifItem = {
  id: string;
  tone: string;
  cat: string;
  label: string;
  title: string;
  desc: string;
  route: string;
};

/** deriveNotifs에 필요한 최소 입력 — 실제 Data/Account가 구조적으로 만족한다. */
export type NotifInputs = {
  /** truthy면 '계정 연결됨' 안내로 도출 */
  account: unknown;
  data: { saved?: string[]; dept?: string; year?: string; lms?: LmsSnapshot };
  planned: CourseSection[];
  acts: ActivitySnapshot | null;
  sched: ScheduleSnapshot | null;
  now: number;
  /** 학기 경계 — 주면 그 이전 마감의 지난 학기 항목은 알림에서 제외 */
  before?: number | null;
};

const DAY = 86400000;

export type Reminder = {
  /** 알림함 항목과 같은 id 형식 — notifiedIds로 중복 발송 방지 */
  id: string;
  /** 발송 시각 (ms epoch) */
  fireAt: number;
  title: string;
  body: string;
};

/**
 * 브라우저 알림 예약 대상 — 앞으로의 LMS 마감을 leadMs(기본 24h) 전에 울린다.
 * lead 시점이 이미 지난 임박 항목은 fireAt=now로 즉시 발송 대상이 된다.
 * 앱이 열려 있는 동안만 유효(푸시 인프라 없음) — notifiedIds로 중복 발송 방지.
 */
export function reminderTargets(
  lms: LmsSnapshot,
  now: number,
  leadMs = DAY,
  horizonDays = 7,
  before?: number | null,
): Reminder[] {
  const out: Reminder[] = [];
  const dayStart = (ts: number) => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  for (const t of dueSoon(lms, now, horizonDays, horizonDays, before)) {
    if (t.dueTs <= now) continue; // 마감이 지난 항목은 울리지 않는다
    // 캘린더 날짜 차이 — 24시간 블록이 아니라 오늘/내일의 일반적 의미
    const dd = Math.round((dayStart(t.dueTs) - dayStart(now)) / DAY);
    const when = dd <= 0 ? '오늘 마감' : dd === 1 ? '내일 마감' : `D-${dd} 마감`;
    out.push({
      id: `lms-${t.course}-${t.kind}-${t.title}-${t.dueTs}`.slice(0, 120),
      fireAt: Math.max(now, t.dueTs - leadMs),
      title: `${when}: ${t.title}`,
      body: `${t.course} · ${t.kind}${t.uncertain ? ' (응시 여부 확인 실패)' : ''}`,
    });
  }
  return out.sort((a, b) => a.fireAt - b.fireAt).slice(0, 10);
}

/**
 * 실제 상태에서 도출되는 알림 목록 — Topbar 벨 배지와 알림함이 공유한다.
 * now는 호출자가 주입한다(render 순수성).
 */
export function deriveNotifs({
  account,
  data,
  planned,
  acts,
  sched,
  now,
  before = null,
}: NotifInputs): NotifItem[] {
  const in7 = now + 7 * DAY;
  const saved = data.saved ?? [];
  const items: NotifItem[] = [
    {
      id: 'connection',
      tone: 'purple',
      cat: '시스템',
      label: '안내',
      title: account
        ? '학교 계정이 연결되어 있습니다.'
        : '학교 데이터 연결 전입니다.',
      desc: '강의 목록 외 학습 일정·전체 이수 내역은 아직 확인되지 않았습니다.',
      route: 'settings/connections',
    },
  ];

  // 계획 과목 시간 충돌
  const clashing = planned.filter((s) => conflicts(s, planned).length);
  if (clashing.length)
    items.push({
      id: 'conflict',
      tone: 'orange',
      cat: '수강신청',
      label: '시간 충돌',
      title: `계획한 과목 ${clashing.length}개의 시간이 겹칩니다.`,
      desc:
        clashing
          .slice(0, 2)
          .map((s) => s.name)
          .join(', ') + (clashing.length > 2 ? ' 외' : ''),
      route: 'timetable',
    });

  // 활동 신청 마감 임박 (7일 이내) — 저장한 활동을 먼저 강조.
  // 상태는 스냅샷 문자열이 아니라 신청 기간+현재 시각으로 재계산한다.
  const deadlines = (acts?.items ?? []).filter((a) => {
    if (!a.applyEnd) return false;
    const t = Date.parse(a.applyEnd);
    const st = liveStatus(a, now).status;
    return t >= now && t <= in7 && (st === 'open' || st === 'closing');
  });
  deadlines.sort(
    (a, b) => Number(saved.includes(b.id)) - Number(saved.includes(a.id)),
  );
  for (const a of deadlines) {
    if (!a.applyEnd) continue;
    const isSaved = saved.includes(a.id);
    const live = liveStatus(a, now);
    items.push({
      id: 'act-' + a.id,
      tone: isSaved ? 'purple' : 'orange',
      cat: '활동',
      label: isSaved ? '저장한 활동' : live.label,
      title: a.title,
      desc: `신청 마감 ${a.applyEnd.slice(0, 10)}${live.dday ? ` · ${live.dday}` : ''}`,
      route: 'activities/' + a.id,
    });
  }

  // COSMOS LMS 마감 임박 (7일 이내 미완료, 최대 5건) — 지난 학기 제외
  if (data.lms)
    for (const t of dueSoon(data.lms, now, 7, 7, before).slice(0, 5)) {
      const dd = Math.ceil((t.dueTs - now) / DAY);
      items.push({
        // 마감 시각을 붙여 같은 과목·제목의 주차별 항목이 id를 공유하지 않게 한다
        id: `lms-${t.course}-${t.kind}-${t.title}-${t.dueTs}`.slice(0, 120),
        tone: 'orange',
        cat: '수업',
        label:
          dd < 0 ? `${t.kind} 마감 지남` : dd === 0 ? `${t.kind} 오늘 마감` : `${t.kind} D-${dd}`,
        title: t.uncertain ? `${t.title} (응시 여부 확인 실패)` : t.title,
        desc: t.course,
        route: 'lms',
      });
    }

  // 다가오는 공식 학사일정 (7일 이내 시작)
  for (const e of sched?.items ?? []) {
    const t = Date.parse(e.start);
    if (t >= now - DAY && t <= in7)
      items.push({
        id: 'sch-' + e.id,
        tone: 'blue',
        cat: '학사일정',
        label: '공식 일정',
        title: e.title,
        desc: `${e.start}${e.end && e.end !== e.start ? ` ~ ${e.end}` : ''}`,
        route: 'calendar',
      });
  }

  // 프로필 미완성 — 실제로 비어 있는 필드만 정확히 표기한다
  const missing = [
    !data.dept || data.dept === '소속 미입력' ? '학과' : '',
    !data.year ? '입학연도' : '',
  ].filter(Boolean);
  if (missing.length)
    items.push({
      id: 'profile',
      tone: 'purple',
      cat: '시스템',
      label: '정보 필요',
      title: `${missing.join('와 ')}가 비어 있습니다.`,
      desc: '채우면 과목 추천과 졸업 기준이 더 정확해집니다.',
      route: `profile/${missing[0] === '학과' ? 'dept' : 'year'}`,
    });

  return items;
}
