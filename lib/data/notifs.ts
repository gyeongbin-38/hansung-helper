import { conflicts, type CourseSection } from './catalog.ts';
import type { ActivitySnapshot } from './activities.ts';
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
};

const DAY = 86400000;

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

  // 활동 신청 마감 임박 (7일 이내) — 저장한 활동을 먼저 강조
  const deadlines = (acts?.items ?? []).filter((a) => {
    if (!a.applyEnd) return false;
    const t = Date.parse(a.applyEnd);
    return (
      t >= now && t <= in7 && (a.status === 'open' || a.status === 'closing')
    );
  });
  deadlines.sort(
    (a, b) => Number(saved.includes(b.id)) - Number(saved.includes(a.id)),
  );
  for (const a of deadlines) {
    if (!a.applyEnd) continue;
    const isSaved = saved.includes(a.id);
    items.push({
      id: 'act-' + a.id,
      tone: isSaved ? 'purple' : 'orange',
      cat: '활동',
      label: isSaved ? '저장한 활동' : a.statusLabel,
      title: a.title,
      desc: `신청 마감 ${a.applyEnd.slice(0, 10)}${a.dday ? ` · ${a.dday}` : ''}`,
      route: 'activities/' + a.id,
    });
  }

  // COSMOS LMS 마감 임박 (7일 이내 미완료, 최대 5건)
  if (data.lms)
    for (const t of dueSoon(data.lms, now, 7).slice(0, 5)) {
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

  // 프로필 미완성
  if (!data.dept || data.dept === '소속 미입력' || !data.year)
    items.push({
      id: 'profile',
      tone: 'purple',
      cat: '시스템',
      label: '정보 필요',
      title: '학과·입학연도가 비어 있습니다.',
      desc: '채우면 과목 추천과 졸업 기준이 더 정확해집니다.',
      route: 'profile',
    });

  return items;
}
