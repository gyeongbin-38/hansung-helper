'use client';
import { useState, useEffect, useRef } from 'react';
import { SignIn, Onboarding, type Account } from './account-flow';
import { Logo } from './logo';
import { menus, empty, type Data } from './sections/data';
import { useCatalog, useActivities, useSchedule } from './sections/catalog';
import {
  Sidebar,
  Topbar,
  PageHeading,
  AccountBar,
  ToastStack,
  useToasts,
  CookieBanner,
} from './sections/chrome';
import { Home } from './sections/home';
import { Activities } from './sections/activities';
import { ProfileSection } from './sections/profile';
import { Graduation } from './sections/graduation';
import { Courses } from './sections/courses';
import { SemesterPlan } from './sections/semester-plan';
import { Timetable } from './sections/timetable';
import { CalendarSection } from './sections/calendar';
import { LmsSection } from './sections/lms';
import { Advisor } from './sections/advisor';
import { Notifications, NotifPanel } from './sections/notifications';
import { deriveNotifs, reminderTargets } from '@/lib/data/notifs';
import { SearchResults } from './sections/search';
import { SettingsSection } from './sections/settings';
import { SurveyDialog } from './sections/survey-dialog';

/** 계정 프로필 + 로그인 시 서버 수집 LMS 스냅샷을 Data로 병합.
 *  더 최신 fetchedAt 쪽이 이김 (수동 가져오기 파일이 최신이면 유지). */
function accountData(result: Account): Data {
  const merged = { ...empty, ...result.profile };
  const serverLms = result.snapshot?.lmsData;
  if (
    serverLms &&
    (!merged.lms?.fetchedAt || serverLms.fetchedAt > merged.lms.fetchedAt)
  )
    merged.lms = serverLms;
  return merged;
}

export default function App() {
  const [data, setData] = useState<Data>(empty),
    [ready, setReady] = useState(false),
    [route, setRoute] = useState('home'),
    [drawer, setDrawer] = useState(false),
    [filter, setFilter] = useState('전체'),
    [query, setQuery] = useState(''),
    [survey, setSurvey] = useState(false),
    [notifOpen, setNotifOpen] = useState(false),
    [step, setStep] = useState(0),
    [draft, setDraft] = useState<string[]>([]);
  const { items: toasts, push: setToast, dismiss: dismissToast } =
    useToasts();
  const [account, setAccount] = useState<Account | null>(null);
  const [demo, setDemo] = useState(false);
  const [accountError, setAccountError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const { catalog, failed: catalogFailed, retry: retryCatalog } = useCatalog();
  const { snap: actsSnap } = useActivities();
  const { snap: schedSnap } = useSchedule();
  const [notifNow] = useState(() => Date.now());
  // Browser storage is read after hydration to keep the initial server render stable.
  /* oxlint-disable react/react-compiler -- Hydrate device-local browser state after server render. */
  useEffect(() => {
    let active = true;
    fetch('/api/account', { cache: 'no-store' })
      .then(async (response) => {
        if (response.ok) {
          const result: Account = await response.json();
          if (active) {
            setAccount(result);
            setData(accountData(result));
            setDraft(result.profile.prefs || []);
          }
        } else if (response.status !== 401 && active)
          setAccountError(
            '계정 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          );
      })
      .catch(() => {
        if (active) setAccountError('계정 서버에 연결하지 못했습니다.');
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const sync = () => setRoute(location.hash.slice(1) || 'home');
    sync();
    addEventListener('hashchange', sync);
    return () => {
      active = false;
      removeEventListener('hashchange', sync);
    };
  }, []);
  // 서버 스냅샷의 lmsData가 로컬보다 새로우면 흡수한다 — 로그인 응답에
  // 실린 데이터, 지연 수집 완료, 재수집 결과 모두 이 경로로 반영된다.
  useEffect(() => {
    const serverLms = account?.snapshot.lmsData;
    if (!serverLms) return;
    setData((prev) =>
      !prev.lms?.fetchedAt || serverLms.fetchedAt > prev.lms.fetchedAt
        ? { ...prev, lms: serverLms }
        : prev,
    );
  }, [account?.snapshot.lmsData]);
  // 서버 지연 수집(waitUntil) 진행 중이면 완료/실패까지 짧게 폴링해
  // 결과를 즉시 반영한다. 기존 lms 데이터가 있어도 재로그인 수집은
  // lmsPending으로 표시되므로 갱신을 놓치지 않는다.
  const lmsPending = account?.snapshot.lmsPending === true;
  useEffect(() => {
    if (!lmsPending) return;
    let cancelled = false,
      tries = 0,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      tries += 1;
      try {
        const res = await fetch('/api/account', { cache: 'no-store' });
        if (res.ok) {
          const result: Account = await res.json();
          setAccount(result);
          const serverLms = result.snapshot?.lmsData;
          if (serverLms)
            setData((prev) =>
              !prev.lms?.fetchedAt || serverLms.fetchedAt > prev.lms.fetchedAt
                ? { ...prev, lms: serverLms }
                : prev,
            );
          // 수집이 끝났으면(성공·실패 무관) 폴링 중단
          if (!result.snapshot?.lmsPending || result.snapshot?.lmsFailedAt)
            return;
        }
      } catch {
        /* 다음 주기에 재시도 */
      }
      if (!cancelled && tries < 8) timer = setTimeout(poll, 8000);
    };
    timer = setTimeout(poll, 6000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lmsPending]);
  // 수집 예산(60s)+여유를 넘긴 pending은 워커 중도 종료로 간주 — 무한
  // "수집 중" 대신 지연 안내로 전환한다. 마커 도입 전의 스냅샷은
  // connected인데 lmsData·pending이 없는 상태로 남을 수 있어 그것도
  // 실패로 분류한다.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const checkedAt = account?.snapshot.checkedAt;
    if (!lmsPending || !checkedAt) return;
    const remaining = Date.parse(checkedAt) + 5 * 60e3 - Date.now();
    if (remaining <= 0) {
      setNowTick(Date.now());
      return;
    }
    const timer = setTimeout(() => setNowTick(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [lmsPending, account?.snapshot.checkedAt]);
  const collectStale =
    lmsPending &&
    !!account?.snapshot.checkedAt &&
    Date.parse(account.snapshot.checkedAt) + 5 * 60e3 <= nowTick;
  const lmsFailed =
    !!account?.snapshot.lmsFailedAt ||
    collectStale ||
    (account?.snapshot.lms === 'connected' &&
      !account.snapshot.lmsData &&
      !account.snapshot.lmsPending);
  useEffect(() => {
    if (survey) dialog.current?.showModal();
    else dialog.current?.close();
  }, [survey]);
  // 브라우저 마감 알림 — opt-in + 권한 부여된 경우에만, 앱이 열려 있는 동안
  // 예약된다(푸시 아님). 발송분은 notifiedIds에 기록해 중복 발송을 막는다.
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    const d = data;
    if (
      !d.notifEnabled ||
      !d.lms ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    )
      return;
    const fired = new Set(d.notifiedIds ?? []);
    const timers = reminderTargets(d.lms, Date.now())
      .filter((r) => !fired.has(r.id))
      .map((r) =>
        setTimeout(() => {
          new Notification(r.title, { body: r.body });
          const cur = dataRef.current;
          void persist(
            {
              ...cur,
              notifiedIds: [...(cur.notifiedIds ?? []), r.id].slice(-200),
            },
            '',
          );
        }, Math.max(0, r.fireAt - Date.now())),
      );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist는 안정 함수
  }, [data.notifEnabled, data.lms]);
  async function persist(
    next: Data,
    msg = '저장했습니다.',
    complete?: boolean,
  ) {
    try {
      if (account) {
        const response = await fetch('/api/account/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...next,
            onboarded: complete ?? account.onboarded,
          }),
        });
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          setToast(result.error || '저장하지 못했습니다.');
          return false;
        }
        setAccount({
          ...account,
          profile: next,
          onboarded: complete ?? account.onboarded,
        });
      } else localStorage.setItem('hansung-demo-v1', JSON.stringify(next));
      setData(next);
      if (msg) setToast(msg);
      return true;
    } catch {
      setToast('저장하지 못했습니다. 입력 내용은 유지됩니다.');
      return false;
    }
  }
  async function logout() {
    try {
      const response = await fetch('/api/account/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error();
      setAccount(null);
      setDemo(false);
      setData(empty);
      setDraft([]);
      go('home');
    } catch {
      setToast('로그아웃하지 못했습니다. 다시 시도해 주세요.');
    }
  }
  async function deleteAccount() {
    if (
      !window.confirm(
        '학사 도우미에 저장한 내 계정 자료를 모두 삭제할까요? 학교 원본 정보는 변경되지 않습니다.',
      )
    )
      return;
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error();
      setAccount(null);
      setData(empty);
      setDraft([]);
      go('home');
    } catch {
      setToast('삭제하지 못했습니다. 다시 시도해 주세요.');
    }
  }
  function go(r: string) {
    location.hash = r;
    setRoute(r);
    setDrawer(false);
    scrollTo(0, 0);
  }
  function save(id: string) {
    void persist(
      {
        ...data,
        saved: data.saved.includes(id)
          ? data.saved.filter((x) => x !== id)
          : [...data.saved, id],
      },
      data.saved.includes(id)
        ? '활동 저장을 해제했습니다.'
        : '활동을 저장했습니다.',
    );
  }
  function plan(id: string) {
    void persist(
      {
        ...data,
        planned: data.planned.includes(id)
          ? data.planned.filter((x) => x !== id)
          : [...data.planned, id],
      },
      '개인 학기 계획을 변경했습니다. 공식 수강신청과는 별개입니다.',
    );
  }
  function swapPlan(fromId: string, toId: string) {
    if (!data.planned.includes(fromId)) return;
    void persist(
      {
        ...data,
        planned: data.planned
          .filter((x) => x !== fromId && x !== toId)
          .concat(toId),
      },
      '',
    );
  }
  function exitDemo() {
    setDemo(false);
    setData(empty);
  }
  const section = route.split('/')[0],
    detail = route.split('/')[1],
    planned = (catalog?.sections ?? []).filter((s) =>
      data.planned.includes(s.id),
    );
  const notifItems = deriveNotifs({
    account,
    data,
    planned,
    acts: actsSnap,
    sched: schedSnap,
    now: notifNow,
  });
  const unread = notifItems.filter(
    (n) => !(data.readIds ?? []).includes(n.id),
  ).length;
  const label =
    menus.find((m) => m[0] === section)?.[1] ||
    (
      {
        profile: '내 정보',
        settings: '설정',
        notifications: '알림함',
        search: '검색',
      } as Record<string, string>
    )[section] ||
    '상세 정보';
  if (!ready)
    return (
      <div className="auth-page">
        <div className="auth-brand">
          <Logo />
          한성 학사 도우미
        </div>
        <p>내 정보를 확인하고 있어요…</p>
      </div>
    );
  if (!account && !demo)
    return (
      <>
        <SignIn
          notice={accountError || undefined}
          onAuthenticated={(result) => {
            setAccount(result);
            setData(accountData(result));
            setDraft(result.profile.prefs || []);
            go('home');
          }}
          onDemo={() => {
            setDemo(true);
            try {
              const raw = localStorage.getItem('hansung-demo-v1');
              if (raw) {
                const d = JSON.parse(raw);
                if (
                  Array.isArray(d.saved) &&
                  Array.isArray(d.planned) &&
                  Array.isArray(d.events) &&
                  (d.completed === undefined || Array.isArray(d.completed)) &&
                  (d.ruleOverrides === undefined ||
                    (d.ruleOverrides && typeof d.ruleOverrides === 'object')) &&
                  (d.readIds === undefined || Array.isArray(d.readIds)) &&
                  (d.notifiedIds === undefined ||
                    Array.isArray(d.notifiedIds)) &&
                  (d.lms === undefined || typeof d.lms === 'object')
                )
                  setData({ ...empty, ...d });
              }
            } catch {
              setData(empty);
            }
            go('home');
          }}
        />
      </>
    );
  if (account && !account.onboarded)
    return (
      <Onboarding
        profile={data}
        onSave={(next, complete) => persist(next, '', complete)}
      />
    );
  return (
    <div className="shell">
      <Sidebar
        section={section}
        drawer={drawer}
        go={go}
        account={account}
        data={data}
        onExit={() => {
          if (account) void logout();
          else exitDemo();
        }}
        onCloseDrawer={() => setDrawer(false)}
      />
      <div className="workspace">
        <Topbar
          query={query}
          setQuery={setQuery}
          go={go}
          data={data}
          unread={unread}
          onMenu={() => setDrawer(true)}
          onSearch={() => go('search')}
          onBell={() => setNotifOpen(true)}
        />
        <main>
          <PageHeading
            section={section}
            label={label}
            name={data.name}
            account={account}
          />
          <AccountBar account={account} go={go} onConnect={exitDemo} />
          {section === 'home' ? (
            <Home data={data} account={account} go={go} planned={planned} />
          ) : section === 'activities' ? (
            <Activities
              detail={detail}
              filter={filter}
              setFilter={setFilter}
              query={query}
              setQuery={setQuery}
              data={data}
              go={go}
              save={save}
            />
          ) : section === 'profile' ? (
            <ProfileSection
              data={data}
              account={account}
              persist={persist}
              onOpenSurvey={() => setSurvey(true)}
            />
          ) : section === 'graduation' ? (
            <Graduation
              data={data}
              go={go}
              catalog={catalog}
              planned={planned}
              persist={persist}
              detail={detail}
            />
          ) : section === 'courses' ? (
            <Courses
              data={data}
              plan={plan}
              swap={swapPlan}
              detail={detail}
              go={go}
              catalog={catalog}
              failed={catalogFailed}
              retry={retryCatalog}
              notify={setToast}
            />
          ) : section === 'semester-plan' ? (
            <SemesterPlan
              planned={planned}
              plan={plan}
              go={go}
              semester={catalog?.semester}
            />
          ) : section === 'timetable' ? (
            <Timetable
              catalog={catalog}
              failed={catalogFailed}
              retry={retryCatalog}
              planned={planned}
              data={data}
              plan={plan}
              swap={swapPlan}
              notify={setToast}
            />
          ) : section === 'calendar' ? (
            <CalendarSection
              data={data}
              persist={persist}
              detail={detail}
              go={go}
            />
          ) : section === 'lms' ? (
            <LmsSection
              data={data}
              persist={persist}
              notify={setToast}
              detail={detail}
              serverCollecting={lmsPending && !collectStale}
              collectFailed={lmsFailed}
              lmsUnavailable={account?.snapshot.lms === 'unavailable'}
              studentMask={account?.studentMask}
              onAccount={setAccount}
            />
          ) : section === 'advisor' ? (
            <Advisor
              data={data}
              planned={planned}
              catalog={catalog}
              go={go}
            />
          ) : section === 'search' ? (
            <SearchResults
              query={query}
              data={data}
              catalog={catalog}
              plan={plan}
              notify={setToast}
              go={go}
            />
          ) : section === 'notifications' ? (
            <Notifications
              account={account}
              data={data}
              planned={planned}
              persist={persist}
              go={go}
            />
          ) : section === 'settings' ? (
            <SettingsSection
              account={account}
              data={data}
              persist={persist}
              go={go}
              onDeleteAccount={() => void deleteAccount()}
            />
          ) : (
            <section className="card pad">
              <h2>페이지를 찾을 수 없어요.</h2>
              <button className="primary" onClick={() => go('home')}>
                홈으로 이동
              </button>
            </section>
          )}
          <footer>
            <span>한성 학사 도우미</span>
            <span>나만의 속도로, 다음 학기를 향해.</span>
            <span>한성대학교 비공식 서비스</span>
          </footer>
        </main>
      </div>
      <NotifPanel
        items={notifItems}
        readIds={data.readIds ?? []}
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onMarkAll={() =>
          void persist(
            { ...data, readIds: notifItems.map((i) => i.id) },
            '알림을 읽음으로 표시했습니다.',
          )
        }
        go={go}
      />
      <ToastStack toasts={toasts} onClose={dismissToast} />
      {ready && !account && !data.consent && (
        <CookieBanner
          onConfirm={() => persist({ ...data, consent: true }, '')}
        />
      )}
      <SurveyDialog
        dialogRef={dialog}
        step={step}
        draft={draft}
        setDraft={setDraft}
        setStep={setStep}
        onClose={() => setSurvey(false)}
        onSubmit={(prefs) => {
          void persist(
            { ...data, prefs },
            '수업 선호를 저장했습니다.',
          ).then((ok) => {
            if (ok) setSurvey(false);
          });
        }}
      />
    </div>
  );
}
