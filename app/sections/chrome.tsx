'use client';
import {
  GraduationCap,
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
            <GraduationCap size={20} />
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
}: {
  query: string;
  setQuery: (value: string) => void;
  go: (route: string) => void;
  data: Data;
  unread: number;
  onMenu: () => void;
  onSearch: () => void;
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
          unread ? `알림함 — 읽지 않은 알림 ${unread}개` : '알림함'
        }
        onClick={() => go('notifications')}
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
              {account.snapshot.lms === 'connected'
                ? '조회 완료'
                : '조회 실패 · 재로그인으로 다시 연결'}{' '}
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

export function Toast({
  toast,
  onClose,
}: {
  toast: string;
  onClose: () => void;
}) {
  if (!toast) return null;
  return (
    <output className="toast">
      <Check size={18} />
      {toast}
      <button className="icon" aria-label="알림 닫기" onClick={onClose}>
        <X size={16} />
      </button>
    </output>
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
