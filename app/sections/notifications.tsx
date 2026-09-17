'use client';
import { Bell } from 'lucide-react';
import type { Data } from './data';
import type { Account } from '../account-flow';

export function Notifications({
  account,
  data,
  persist,
  go,
}: {
  account: Account | null;
  data: Data;
  persist: (next: Data, msg?: string) => Promise<boolean>;
  go: (route: string) => void;
}) {
  const items = [
    {
      id: 'connection',
      tone: 'purple',
      label: '안내',
      title: account
        ? '학교 계정이 연결되어 있습니다.'
        : '학교 데이터 연결 전입니다.',
      desc: '강의 목록 외 학습 일정·전체 이수 내역은 아직 확인되지 않았습니다.',
    },
  ];
  return (
    <section className="card detail">
      <div className="between notif-head">
        <div>
          <h2>알림함</h2>
          <p className="notif-sub">
            읽지 않은 알림은 보라색 점으로 표시돼요.
          </p>
        </div>
        <button
          className="secondary"
          onClick={async () =>
            await persist({ ...data, read: true }, '알림을 읽음으로 표시했습니다.')
          }
        >
          모두 읽음
        </button>
      </div>
      {items.length ? (
        <ul className="notif-list">
          {items.map((n) => (
            <li
              key={n.id}
              className={'notif-item' + (data.read ? '' : ' unread')}
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
                onClick={() => go('settings/connections')}
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
