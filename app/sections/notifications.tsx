'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Bell, X } from 'lucide-react';
import type { Data } from './data';
import type { Account } from '../account-flow';
import {
  useActivities,
  useCatalog,
  useNow,
  useSchedule,
} from './catalog';
import {
  semesterStartTs,
  type CourseSection,
} from '@/lib/data/catalog';
import { currentSemesterStart } from '@/lib/data/lms';
import { deriveNotifs, type NotifItem } from '@/lib/data/notifs';

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
  const { catalog } = useCatalog();
  // 주기 갱신 — 탭을 오래 열어 둬도 마감·상대시간이 실제 시각을 따라간다
  const now = useNow(30000);
  const [cat, setCat] = useState('전체');
  const before =
    (catalog?.semester ? semesterStartTs(catalog.semester) : null) ??
    currentSemesterStart(now);
  const items = deriveNotifs({ account, data, planned, acts, sched, now, before });
  const readIds = data.readIds ?? [];

  const cats = ['전체', ...new Set(items.map((i) => i.cat))];
  const shown = cat === '전체' ? items : items.filter((i) => i.cat === cat);

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
          <button
            className={'badge' + (cat === c ? ' sel' : '')}
            key={c}
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
          >
            {c} {c === '전체' ? items.length : items.filter((i) => i.cat === c).length}
          </button>
        ))}
      </div>
      {shown.length ? (
        <ul className="notif-list">
          {shown.map((n) => (
            <NotifRow
              key={n.id}
              n={n}
              unread={!readIds.includes(n.id)}
              onOpen={() => go(n.route)}
            />
          ))}
        </ul>
      ) : (
        <div className="empty-small notif-empty">
          <Bell />
          <p>{cat === '전체' ? '도착한 알림이 없어요.' : '이 분류의 알림이 없어요.'}</p>
        </div>
      )}
      <DeadlineNotifSetting
        enabled={!!data.notifEnabled}
        onChange={async (on) => {
          if (!on) {
            await persist(
              { ...data, notifEnabled: false },
              '마감 알림을 껐습니다.',
            );
            return;
          }
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') return;
          await persist(
            { ...data, notifEnabled: true },
            '마감 알림을 켰습니다 — 이 페이지가 열려 있는 동안 울립니다.',
          );
        }}
      />
    </section>
  );
}

/** 브라우저 마감 알림 설정 — 푸시 인프라가 없어 앱이 열려 있을 때만 울리는
 *  제한을 명시한다. 권한 거부·미지원 상태도 안내한다. */
function DeadlineNotifSetting({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (on: boolean) => Promise<void>;
}) {
  const supported = typeof Notification !== 'undefined';
  const denied = supported && Notification.permission === 'denied';
  return (
    <div className="notif-native">
      <div className="between">
        <div>
          <b>마감 브라우저 알림</b>
          <p className="notif-sub">
            수업 마감 24시간 전·당일에 운영체제 알림을 표시합니다.
          </p>
        </div>
        {supported && !denied && (
          <button
            className={'badge' + (enabled ? ' sel' : '')}
            aria-pressed={enabled}
            onClick={() => void onChange(!enabled)}
          >
            {enabled ? '켜짐' : '꺼짐'}
          </button>
        )}
      </div>
      <p className="notif-foot">
        {!supported
          ? '이 브라우저는 알림을 지원하지 않습니다.'
          : denied
            ? '브라우저에서 알림이 차단되어 있습니다 — 주소창 왼쪽 아이콘에서 허용으로 바꿀 수 있습니다.'
            : '앱(탭)이 열려 있을 때만 울립니다 — 탭을 닫으면 알림이 오지 않습니다. 백그라운드 푸시는 지원하지 않습니다.'}
      </p>
    </div>
  );
}

function NotifRow({
  n,
  unread,
  onOpen,
}: {
  n: NotifItem;
  unread: boolean;
  onOpen: () => void;
}) {
  return (
    <li className={'notif-item' + (unread ? ' unread' : '')}>
      <span className="notif-ico" aria-hidden="true">
        <Bell size={16} />
      </span>
      <div className="notif-body">
        <span className={'badge ' + n.tone}>{n.label}</span>
        <b>{n.title}</b>
        <small>{n.desc}</small>
      </div>
      <button className="link" onClick={onOpen}>
        확인 →
      </button>
    </li>
  );
}

/** 상단 벨의 우측 슬라이드오버 — 알림함 페이지(/notifications)의 요약 뷰.
 *  항목 이동·모두 읽음·분류 필터를 제공하고 전체 목록은 알림함으로 보낸다. */
export function NotifPanel({
  items,
  readIds,
  open,
  onClose,
  onMarkAll,
  go,
}: {
  items: NotifItem[];
  readIds: string[];
  open: boolean;
  onClose: () => void;
  onMarkAll: () => void;
  go: (route: string) => void;
}) {
  const [cat, setCat] = useState('전체');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const unreadCount = items.filter((i) => !readIds.includes(i.id)).length;
  const cats = ['전체', ...new Set(items.map((i) => i.cat))];
  const shown = cat === '전체' ? items : items.filter((i) => i.cat === cat);
  return (
    <>
      <button
        className="notif-scrim"
        aria-label="알림 패널 닫기"
        onClick={onClose}
      />
      <dialog className="notif-panel" open aria-label="알림">
        <div className="notif-panel-head">
          <div>
            <h2>알림</h2>
            <small>
              {unreadCount ? `읽지 않음 ${unreadCount}개` : '모두 읽었어요'}
            </small>
          </div>
          <button className="secondary" onClick={onMarkAll}>
            모두 읽음
          </button>
          <button className="icon" aria-label="닫기" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="notif-cats">
          {cats.map((c) => (
            <button
              key={c}
              className={'badge' + (cat === c ? ' sel' : '')}
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
            >
              {c}{' '}
              {c === '전체'
                ? items.length
                : items.filter((i) => i.cat === c).length}
            </button>
          ))}
        </div>
        <div className="notif-panel-list">
          {shown.length ? (
            <ul className="notif-list">
              {shown.map((n) => (
                <NotifRow
                  key={n.id}
                  n={n}
                  unread={!readIds.includes(n.id)}
                  onOpen={() => {
                    onClose();
                    go(n.route);
                  }}
                />
              ))}
            </ul>
          ) : (
            <div className="empty-small notif-empty">
              <Bell />
              <p>이 분류의 알림이 없어요.</p>
            </div>
          )}
        </div>
        <button
          className="link notif-panel-foot"
          onClick={() => {
            onClose();
            go('notifications');
          }}
        >
          전체 알림함 보기 <ArrowRight size={14} />
        </button>
      </dialog>
    </>
  );
}
