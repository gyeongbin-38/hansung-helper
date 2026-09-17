'use client';
import { useState } from 'react';
import { Bell } from 'lucide-react';
import type { Data } from './data';
import type { Account } from '../account-flow';
import { useActivities, useSchedule } from './catalog';
import { conflicts, type CourseSection } from '@/lib/data/catalog';
import type { ActivitySnapshot } from '@/lib/data/activities';
import type { ScheduleSnapshot } from '@/lib/data/schedule';

type Item = {
  id: string;
  tone: string;
  cat: string;
  label: string;
  title: string;
  desc: string;
  route: string;
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
}: {
  account: Account | null;
  data: Data;
  planned: CourseSection[];
  acts: ActivitySnapshot | null;
  sched: ScheduleSnapshot | null;
  now: number;
}): Item[] {
  const in7 = now + 7 * DAY;
  const items: Item[] = [
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
      desc: clashing
        .slice(0, 2)
        .map((s) => s.name)
        .join(', ') + (clashing.length > 2 ? ' 외' : ''),
      route: 'timetable',
    });

  // 활동 신청 마감 임박 (7일 이내)
  for (const a of acts?.items ?? []) {
    if (!a.applyEnd) continue;
    const t = Date.parse(a.applyEnd);
    if (t >= now && t <= in7 && (a.status === 'open' || a.status === 'closing'))
      items.push({
        id: 'act-' + a.id,
        tone: 'orange',
        cat: '활동',
        label: a.statusLabel,
        title: a.title,
        desc: `신청 마감 ${a.applyEnd.slice(0, 10)}${a.dday ? ` · ${a.dday}` : ''}`,
        route: 'activities/' + a.id,
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

export function Notifications({
  account,
  data,
  planned,
  persist,
  go,
}: {
  account: Account | null;
  data: Data;
  planned: CourseSection[];
  persist: (next: Data, msg?: string) => Promise<boolean>;
  go: (route: string) => void;
}) {
  const { snap: acts } = useActivities();
  const { snap: sched } = useSchedule();
  // 마운트 시점 기준으로 도출 — 알림 신선도는 세션 단위면 충분
  const [now] = useState(() => Date.now());
  const items = deriveNotifs({ account, data, planned, acts, sched, now });
  const readIds = data.readIds ?? [];

  const cats = ['전체', ...new Set(items.map((i) => i.cat))];

  return (
    <section className="card detail">
      <div className="between notif-head">
        <div>
          <h2>알림함</h2>
          <p className="notif-sub">
            읽지 않은 알림은 보라색 점으로 표시돼요. 실제 계획·일정·마감에서
            도출됩니다.
          </p>
        </div>
        <button
          className="secondary"
          onClick={async () =>
            await persist(
              { ...data, readIds: items.map((i) => i.id) },
              '알림을 읽음으로 표시했습니다.',
            )
          }
        >
          모두 읽음
        </button>
      </div>
      <div className="notif-cats">
        {cats.map((c) => (
          <span className="badge" key={c}>
            {c} {c === '전체' ? items.length : items.filter((i) => i.cat === c).length}
          </span>
        ))}
      </div>
      {items.length ? (
        <ul className="notif-list">
          {items.map((n) => (
            <li
              key={n.id}
              className={
                'notif-item' + (readIds.includes(n.id) ? '' : ' unread')
              }
            >
              <span className="notif-ico" aria-hidden="true">
                <Bell size={16} />
              </span>
              <div className="notif-body">
                <span className={'badge ' + n.tone}>{n.label}</span>
                <b>{n.title}</b>
                <small>{n.desc}</small>
              </div>
              <button
                className="link"
                onClick={() => go(n.route)}
              >
                확인 →
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-small notif-empty">
          <Bell />
          <p>도착한 알림이 없어요.</p>
        </div>
      )}
      <p className="notif-foot">푸시 알림은 발송되지 않습니다.</p>
    </section>
  );
}
