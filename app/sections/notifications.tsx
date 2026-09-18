'use client';
import { useState } from 'react';
import { Bell } from 'lucide-react';
import type { Data } from './data';
import type { Account } from '../account-flow';
import { useActivities, useSchedule } from './catalog';
import type { CourseSection } from '@/lib/data/catalog';
import { deriveNotifs } from '@/lib/data/notifs';

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
