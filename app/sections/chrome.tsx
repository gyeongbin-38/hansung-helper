'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  User,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  Check,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import { menus, type Data } from './data';
import { Logo } from '../logo';
import type { Account } from '../account-flow';

export function Sidebar({
  section,
  drawer,
  go,
  account,
  data,
  onExit,
  onCloseDrawer,
}: {
  section: string;
  drawer: boolean;
  go: (route: string) => void;
  account: Account | null;
  data: Data;
  onExit: () => void;
  onCloseDrawer: () => void;
}) {
  return (
    <>
      <aside className={'sidebar ' + (drawer ? 'open' : '')}>
        <button className="brand" onClick={() => go('home')}>
          <span className="brand-icon">
            <Logo size={20} />
          </span>
          <span>
            한성 학사 도우미<small>MY ACADEMIC COMPASS</small>
          </span>
        </button>
        <div className="nav-caption">MY CAMPUS</div>
        <nav>
          {menus.map(([key, name, Icon]) => (
            <button
              key={key}
              className={section === key ? 'selected' : ''}
              onClick={() => go(key)}
            >
              <Icon size={18} />
              {name}
              {key === 'advisor' && <span className="tiny">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-mini">
            <span className="avatar">{data.name.slice(0, 1)}</span>
            <div>
              <b>{data.name}</b>
              <small>
                {account
                  ? '학교 계정 확인 · ' + account.studentMask
                  : '체험 프로필'}
              </small>
            </div>
          </div>
          <button onClick={() => go('profile')}>
            <User size={18} />내 정보
          </button>
          <button onClick={() => go('settings')}>
            <Settings size={18} />
            설정
          </button>
          <button onClick={onExit}>
            {account ? <LogOut size={18} /> : <ArrowRight size={18} />}
            {account ? '로그아웃' : '학교 계정으로 시작'}
          </button>
          <small className="footnote">한성대학교 비공식 학사 계획 도구</small>
        </div>
      </aside>
      {drawer && (
        <button
          className="scrim"
          aria-label="메뉴 닫기"
          onClick={onCloseDrawer}
        />
      )}
    </>
  );
}

export function Topbar({
  query,
  setQuery,
  go,
  data,
  unread,
  onMenu,
  onSearch,
  onBell,
}: {
  query: string;
  setQuery: (value: string) => void;
  go: (route: string) => void;
  data: Data;
  unread: number;
  onMenu: () => void;
  onSearch: () => void;
  onBell: () => void;
}) {
  return (
    <header className="topbar">
      <button
        className="icon mobile"
        aria-label="메뉴 열기"
        onClick={onMenu}
      >
        <Menu />
      </button>
      <span className="top-label">나의 대학 생활, 한곳에서</span>
      <form
        className="global-search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <Search size={16} />
        <input
          placeholder="과목·활동·학사일정 검색"
          aria-label="통합 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>↵</kbd>
      </form>
      <button
        className="icon notification"
        aria-label={
          unread ? `알림 — 읽지 않은 알림 ${unread}개` : '알림'
        }
        aria-haspopup="dialog"
        onClick={onBell}
      >
        <Bell size={20} />
        {unread > 0 && <i aria-hidden="true" />}
      </button>
      <button
        className="avatar small"
        aria-label="내 정보"
        onClick={() => go('profile')}
      >
        {data.name.slice(0, 1)}
      </button>
    </header>
  );
}

export function PageHeading({
  section,
  label,
  name,
  account,
}: {
  section: string;
  label: string;
  name: string;
  account: Account | null;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">
          MY CAMPUS / {section === 'home' ? 'OVERVIEW' : label}
        </div>
        <h1>{section === 'home' ? `${name}님, 반가워요.` : label}</h1>
        <p>
          {section === 'home'
            ? '오늘 필요한 수업과 다음 계획을 확인하세요.'
            : '필요한 정보를 확인하고 다음 계획으로 연결하세요.'}
        </p>
      </div>
      <span className="date-label">
        2026학년도 2학기{' '}
        <span className="badge">{account ? '내 학사 홈' : '체험용'}</span>
      </span>
    </div>
  );
}

export function AccountBar({
  account,
  go,
  onConnect,
}: {
  account: Account | null;
  go: (route: string) => void;
  onConnect: () => void;
}) {
  if (account)
    return (
      <div className="account-bar">
        <div className="account-id">
          <span className="avatar">
            {(account.profile.name || '한성인').slice(0, 1)}
          </span>
          <div>
            <b>학교 계정 연결됨</b>
            <small>
              코스모스{' '}
              {account.snapshot.lmsPending
                ? '수집 중…'
                : account.snapshot.lms !== 'connected'
                  ? '연결 실패 · 수업 현황에서 재수집 가능'
                  : account.snapshot.lmsFailedAt
                    ? '수집 실패 · 수업 현황에서 재수집 가능'
                    : account.snapshot.lmsData
                      ? '조회 완료'
                      : '수집 실패 · 수업 현황에서 재수집 가능'}{' '}
              · {new Date(account.snapshot.checkedAt).toLocaleString('ko-KR')}
            </small>
          </div>
        </div>
        <button className="link" onClick={() => go('settings/connections')}>
          연결 관리 <ArrowRight size={16} />
        </button>
      </div>
    );
  return (
    <div className="demo-note">
      <span>체험용 예시 · 저장 내용은 이 브라우저에만 남습니다.</span>
      <button className="primary" onClick={onConnect}>
        학교 계정 연결 <ArrowRight size={16} />
      </button>
    </div>
  );
}

export interface ToastItem {
  id: number;
  msg: string;
  count: number;
  /** 병합될 때마다 증가 — 타이머 재시작 키로 사용 */
  v: number;
}

const TOAST_MS = 5000;
const TOAST_MAX = 3;

/** 토스트 큐 — 같은 문구는 병합(×N 표시), 동시 표시는 최근 3개까지. */
export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    timers.current.forEach((t, key) => {
      if (key.startsWith(id + ':')) {
        clearTimeout(t);
        timers.current.delete(key);
      }
    });
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((msg: string) => {
    if (!msg) return;
    setItems((xs) => {
      const dup = xs.find((x) => x.msg === msg);
      if (dup)
        return xs.map((x) =>
          x.id === dup.id ? { ...x, count: x.count + 1, v: x.v + 1 } : x,
        );
      return [...xs, { id: ++idRef.current, msg, count: 1, v: 0 }].slice(
        -TOAST_MAX,
      );
    });
  }, []);

  // 각 토스트의 자동 닫힘 타이머 — 목록·버전에서 빠진 항목의 타이머는 해제
  useEffect(() => {
    const keys = new Set(items.map((x) => `${x.id}:${x.v}`));
    timers.current.forEach((t, key) => {
      if (!keys.has(key)) {
        clearTimeout(t);
        timers.current.delete(key);
      }
    });
    items.forEach((x) => {
      const key = `${x.id}:${x.v}`;
      if (!timers.current.has(key)) {
        timers.current.set(
          key,
          setTimeout(() => dismiss(x.id), TOAST_MS),
        );
      }
    });
  }, [items, dismiss]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    },
    [],
  );

  return { items, push, dismiss };
}

export function ToastStack({
  toasts,
  onClose,
}: {
  toasts: ToastItem[];
  onClose: (id: number) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <output className="toast" key={t.id}>
          <Check size={18} />
          {t.msg}
          {t.count > 1 && (
            <span className="toast-count">×{t.count}</span>
          )}
          <button
            className="icon"
            aria-label="알림 닫기"
            onClick={() => onClose(t.id)}
          >
            <X size={16} />
          </button>
        </output>
      ))}
    </div>
  );
}

export function CookieBanner({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="cookie">
      <div>
        <b>이 브라우저에서 계획을 이어가세요.</b>
        <p>
          저장 버튼을 누른 내용은 이 기기에 보관됩니다. 분석·광고 쿠키는
          사용하지 않습니다.
        </p>
      </div>
      <button className="primary" onClick={onConfirm}>
        확인
      </button>
    </div>
  );
}
