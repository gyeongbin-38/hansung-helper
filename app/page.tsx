'use client';
import { useState, useEffect, useRef } from 'react';
import { GraduationCap } from 'lucide-react';
import { SignIn, Onboarding, type Account } from './account-flow';
import { menus, empty, type Data } from './sections/data';
import { useCatalog } from './sections/catalog';
import {
  Sidebar,
  Topbar,
  PageHeading,
  AccountBar,
  Toast,
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
import { Advisor } from './sections/advisor';
import { Notifications } from './sections/notifications';
import { SettingsSection } from './sections/settings';
import { SurveyDialog } from './sections/survey-dialog';
export default function App() {
  const [data, setData] = useState<Data>(empty),
    [ready, setReady] = useState(false),
    [route, setRoute] = useState('home'),
    [drawer, setDrawer] = useState(false),
    [filter, setFilter] = useState('전체'),
    [query, setQuery] = useState(''),
    [toast, setToast] = useState(''),
    [survey, setSurvey] = useState(false),
    [step, setStep] = useState(0),
    [draft, setDraft] = useState<string[]>([]),
    [answer, setAnswer] = useState('');
  const [account, setAccount] = useState<Account | null>(null);
  const [demo, setDemo] = useState(false);
  const [accountError, setAccountError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const { catalog, failed: catalogFailed } = useCatalog();
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
            setData({ ...empty, ...result.profile });
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
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (survey) dialog.current?.showModal();
    else dialog.current?.close();
  }, [survey]);
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
  const label =
    menus.find((m) => m[0] === section)?.[1] ||
    (
      {
        profile: '내 정보',
        settings: '설정',
        notifications: '알림함',
      } as Record<string, string>
    )[section] ||
    '상세 정보';
  if (!ready)
    return (
      <div className="auth-page">
        <div className="auth-brand">
          <GraduationCap />
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
            setData({ ...empty, ...result.profile });
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
                    (d.ruleOverrides && typeof d.ruleOverrides === 'object'))
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
          onMenu={() => setDrawer(true)}
          onSearch={() => go('activities')}
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
            />
          ) : section === 'courses' ? (
            <Courses
              data={data}
              plan={plan}
              catalog={catalog}
              failed={catalogFailed}
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
              planned={planned}
              data={data}
              plan={plan}
              swap={swapPlan}
              notify={setToast}
            />
          ) : section === 'calendar' ? (
            <CalendarSection data={data} persist={persist} />
          ) : section === 'advisor' ? (
            <Advisor answer={answer} setAnswer={setAnswer} go={go} />
          ) : section === 'notifications' ? (
            <Notifications
              account={account}
              data={data}
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
      <Toast toast={toast} onClose={() => setToast('')} />
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
