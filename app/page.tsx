'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { SignIn, type Account } from './account-flow';
import { Logo } from './logo';
import {
  menus,
  empty,
  PAIN_QUESTIONS,
  mergeProfile,
  type Data,
} from './sections/data';
import type { ExtActivity } from '@/lib/data/activities';
import {
  useCatalog,
  useActivities,
  useSchedule,
  useNow,
} from './sections/catalog';
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
import { GraduationWorkspace } from './sections/graduation-workspace';
import { Courses } from './sections/courses';
import { SemesterPlan } from './sections/semester-plan';
import { Timetable } from './sections/timetable';
import { CalendarSection } from './sections/calendar';
import { LmsSection } from './sections/lms';
import { Advisor } from './sections/advisor';
import { Notifications, NotifPanel } from './sections/notifications';
import {
  deriveNotifs,
  reminderTargets,
  stageReminderTargets,
  activityReminderTargets,
} from '@/lib/data/notifs';
import { validateLms, currentSemesterStart, mergeLmsSnapshot, canImportExtensionLms } from '@/lib/data/lms';
import { apiData, apiFetch, ApiRequestError, getAccountContext, setAccountContext, shouldResetSession } from '@/lib/data/api';
import { validateInfo, type InfoSnapshot } from '@/lib/data/info';
import { semesterStartTs } from '@/lib/data/catalog';
import { SearchResults } from './sections/search';
import { SettingsSection } from './sections/settings';
import { SurveyPage } from './sections/survey';
import { SurveyDialog } from './sections/survey-dialog';
import { surveyEntryRoute } from '@/lib/data/survey';
import { Mascot } from './mascot';
import { useSlowLoading } from './use-slow-loading';
import { DEMO_STORAGE_KEY } from '@/lib/data/demo-storage';

/** 종합정보 수집 스냅샷을 Data에 반영 — 빈칸 프로필 필드만 채우고
 *  사용자 입력값은 절대 덮어쓰지 않는다. */
function applyInfo(prev: Data, info: InfoSnapshot): Data {
  const next = { ...prev, info };
  if (!next.year && info.admitYear) next.year = String(info.admitYear);
  if ((!next.dept || next.dept === '소속 미입력') && info.dept)
    next.dept = info.dept;
  if ((!next.name || next.name === '한성인') && info.name)
    next.name = info.name;
  return next;
}

/** 계정 프로필 + 로그인 시 서버 수집 LMS·종합정보 스냅샷을 Data로 병합.
 *  LMS는 더 최신 fetchedAt 쪽이 이김 (수동 가져오기 파일이 최신이면 유지).
 *  info는 서버 작성 전용이라 snapshot 값이 유일한 출처다. */
function accountData(result: Account): Data {
  const merged = { ...empty, ...result.profile };
  merged.lms = validateLms(merged.lms) ?? undefined;
  const serverLms = validateLms(result.snapshot?.lmsData);
  if (
    serverLms &&
    (!merged.lms?.fetchedAt || serverLms.fetchedAt > merged.lms.fetchedAt)
  )
    merged.lms = mergeLmsSnapshot(merged.lms, serverLms);
  const info = validateInfo(result.snapshot?.infoData);
  return info ? applyInfo(merged, info) : merged;
}

export default function App() {
  const [data, setData] = useState<Data>(empty),
    [ready, setReady] = useState(false),
    [route, setRoute] = useState('home'),
    [drawer, setDrawer] = useState(false),
    [filter, setFilter] = useState('전체'),
    [query, setQuery] = useState(''),
    [notifOpen, setNotifOpen] = useState(false),
    [painSurvey, setPainSurvey] = useState(false),
    [painStep, setPainStep] = useState(0),
    [painDraft, setPainDraft] = useState<string[]>([]);
  const painDialog = useRef<HTMLDialogElement>(null);
  const openPainSurvey = useCallback(() => {
    setPainStep(0);
    setPainDraft(data.painPrefs ?? []);
    setPainSurvey(true);
  }, [data.painPrefs]);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const { items: toasts, push: setToast, dismiss: dismissToast } =
    useToasts();
  const [account, setAccount] = useState<Account | null>(null);
  // 비동기 요청이 로그아웃·계정 전환 뒤 새 세션에 반영되지 않도록 한다.
  const accountGeneration = useRef(0);
  const renderedGeneration = accountGeneration.current;
  const [demo, setDemo] = useState(false);
  const accountRef = useRef(account);
  accountRef.current = account;
  const demoRef = useRef(demo);
  demoRef.current = demo;
  const allowExtensionImport = useRef(false);
  const sessionChannel = useRef<BroadcastChannel | null>(null);
  const [accountError, setAccountError] = useState('');
  // 데스크톱 사이드바 아이콘 레일 — 로컬 기기 설정으로 영속화
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const { catalog, failed: catalogFailed, retry: retryCatalog } = useCatalog();
  const { snap: actsSnap } = useActivities();
  const { snap: schedSnap } = useSchedule();
  // 벨 배지·패널의 마감 계산도 실제 시각을 따라가도록 주기 갱신
  const notifNow = useNow(30000);
  useEffect(() => {
    const resetSession = () => {
      if (demoRef.current) return;
      accountGeneration.current += 1;
      setAccountContext(null);
      allowExtensionImport.current = false;
      setAccount(null);
      setData(empty);
      setRoute('home');
      location.hash = 'home';
      setAccountError('계정이 변경되었거나 로그인이 만료되었습니다. 새로고침해 현재 계정을 확인해 주세요.');
    };
    window.addEventListener('hansung-session-invalid', resetSession);
    let channel: BroadcastChannel | undefined;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('hansung-session-v1');
        sessionChannel.current = channel;
        channel.onmessage = (event) => {
          const { type, context } = event.data ?? {};
          if (shouldResetSession(type, context, getAccountContext())) resetSession();
        };
      }
    } catch { /* 서버의 세션 검사가 탭 간 알림 실패를 보완한다 */ }
    return () => {
      window.removeEventListener('hansung-session-invalid', resetSession);
      sessionChannel.current = null;
      channel?.close();
    };
  }, []);
  // Browser storage is read after hydration to keep the initial server render stable.
  /* oxlint-disable react/react-compiler -- Hydrate device-local browser state after server render. */
  useEffect(() => {
    let active = true;
    const generation = accountGeneration.current;
    apiFetch('/api/account', { cache: 'no-store' })
      .then(async (response) => {
        if (response.ok) {
          const result = await apiData<Account>(response);
          if (active && generation === accountGeneration.current) {
            setAccountContext(result.sessionContext);
            allowExtensionImport.current = true;
            setAccount(result);
            const next = accountData(result);
            setData(next);
            if ((!location.hash || location.hash === '#home') && surveyEntryRoute(next) === 'survey') {
              location.hash = 'survey';
              setRoute('survey');
            }
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
    try {
      if (localStorage.getItem('hsu-side-collapsed') === '1')
        setSideCollapsed(true);
    } catch {
      /* storage 접근 불가 환경은 접기 상태를 유지하지 않는다 */
    }
    return () => {
      active = false;
      removeEventListener('hashchange', sync);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        'hsu-side-collapsed',
        sideCollapsed ? '1' : '0',
      );
    } catch {
      /* 저장 실패는 무시 — 세션 내 동작은 유지된다 */
    }
  }, [sideCollapsed]);
  // 서버 스냅샷의 lmsData가 로컬보다 새로우면 흡수한다 — 로그인 응답에
  // 실린 데이터, 지연 수집 완료, 재수집 결과 모두 이 경로로 반영된다.
  useEffect(() => {
    const serverLms = validateLms(account?.snapshot.lmsData);
    if (!serverLms) return;
    setData((prev) =>
      !prev.lms?.fetchedAt || serverLms.fetchedAt > prev.lms.fetchedAt
        ? { ...prev, lms: mergeLmsSnapshot(prev.lms, serverLms) }
        : prev,
    );
  }, [account?.snapshot.lmsData]);
  // 서버 지연 수집(waitUntil) 진행 중이면 완료/실패까지 짧게 폴링해
  // 결과를 즉시 반영한다. LMS·종합정보 수집 모두 이 루프가 받는다.
  // 기존 lms 데이터가 있어도 재로그인 수집은 lmsPending으로 표시되므로
  // 갱신을 놓치지 않는다.
  const lmsPending = account?.snapshot.lmsPending === true;
  const infoPending = account?.snapshot.infoPending === true;
  const [pollRetry, setPollRetry] = useState(0);
  const [pollDelayed, setPollDelayed] = useState(false);
  const slowAccount = useSlowLoading(!ready);
  const slowCollect = useSlowLoading(lmsPending || infoPending, 20000);
  useEffect(() => {
    setPollDelayed(false);
    if (!lmsPending && !infoPending) return;
    const generation = accountGeneration.current;
    let cancelled = false,
      tries = 0,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      tries += 1;
      try {
        const res = await apiFetch('/api/account', { cache: 'no-store' });
        if (res.ok) {
          const result = await apiData<Account>(res);
          if (cancelled || generation !== accountGeneration.current) return;
          setAccount(result);
          const serverLms = validateLms(result.snapshot?.lmsData);
          if (serverLms)
            setData((prev) =>
              !prev.lms?.fetchedAt || serverLms.fetchedAt > prev.lms.fetchedAt
                ? { ...prev, lms: mergeLmsSnapshot(prev.lms, serverLms) }
                : prev,
            );
          const info = validateInfo(result.snapshot?.infoData);
          if (info) setData((prev) => applyInfo(prev, info));
          // 수집이 끝났으면(성공·실패 무관) 폴링 중단
          const snap = result.snapshot;
          const doneLms =
            !snap?.lmsPending || !!snap?.lmsFailedAt;
          const doneInfo =
            !snap?.infoPending || !!snap?.infoFailedAt;
          if (doneLms && doneInfo) return;
        }
      } catch {
        /* 다음 주기에 재시도 */
      }
      if (!cancelled && generation === accountGeneration.current) {
        if (tries < 8) timer = setTimeout(poll, 8000);
        else setPollDelayed(true);
      }
    };
    timer = setTimeout(poll, 6000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lmsPending, infoPending, pollRetry]);
  // 수집 예산(60s)+여유를 넘긴 pending은 워커 중도 종료로 간주 — 무한
  // "수집 중" 대신 지연 안내로 전환한다. 마커 도입 전의 스냅샷은
  // connected인데 lmsData·pending이 없는 상태로 남을 수 있어 그것도
  // 실패로 분류한다.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const checkedAt = account?.snapshot.checkedAt;
    if ((!lmsPending && !infoPending) || !checkedAt) return;
    const remaining = Date.parse(checkedAt) + 5 * 60e3 - Date.now();
    if (remaining <= 0) {
      setNowTick(Date.now());
      return;
    }
    const timer = setTimeout(() => setNowTick(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [lmsPending, infoPending, account?.snapshot.checkedAt]);
  const collectStale = (pending: boolean) =>
    pending &&
    !!account?.snapshot.checkedAt &&
    Date.parse(account.snapshot.checkedAt) + 5 * 60e3 <= nowTick;
  const lmsFailed =
    !!account?.snapshot.lmsFailedAt ||
    (account?.snapshot.lms === 'connected' &&
      !account.snapshot.lmsData &&
      !account.snapshot.lmsPending);
  // 종합정보 수집 실패 — 포털은 연결됐는데 infoData가 없는 상태 포함
  const infoFailed =
    !!account?.snapshot.infoFailedAt ||
    (account?.snapshot.portal === 'connected' &&
      !account.snapshot.infoData &&
      !account.snapshot.infoPending);
  // 브라우저 마감 알림 — opt-in + 권한 부여된 경우에만, 앱이 열려 있는 동안
  // 예약된다(푸시 아님). 발송분은 notifiedIds에 기록해 중복 발송을 막는다.
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DEMO_STORAGE_KEY || event.newValue !== null || !demoRef.current || accountRef.current) return;
      dataRef.current = empty;
      setData(empty);
      setQuery('');
      setFilter('전체');
      setToast('다른 탭에서 체험 데이터를 초기화했습니다.');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [setToast]);
  useEffect(() => {
    if (!ready || painSurvey) return;
    if (!account?.onboarded || data.painPrefs !== undefined) return;
    if (route.split('/')[0] !== 'home') return;
    try {
      if (sessionStorage.getItem('hsu-pain-survey-offered')) return;
      sessionStorage.setItem('hsu-pain-survey-offered', '1');
    } catch {
      return;
    }
    openPainSurvey();
  }, [ready, painSurvey, account?.onboarded, data.painPrefs, route, openPainSurvey]);
  useEffect(() => {
    if (painSurvey) painDialog.current?.showModal();
    else painDialog.current?.close();
  }, [painSurvey]);
  const persistRef = useRef<typeof persist | null>(null);
  persistRef.current = persist;
  // 계정 프로필 쓰기를 직렬화 — 같은 탭의 연속 저장이 rev 충돌을
  // 일으키지 않게 순서대로 보낸다.
  const planEditPending = useRef(false);
  const persistSeq = useRef(Promise.resolve());
  const enqueue = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = persistSeq.current.then(job);
    persistSeq.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  // 확장 프로그램(extension/) ↔ 앱 브리지 프로토콜:
  //   수신 hsu-extension-ready / hsu-lms-status / hsu-lms-import
  //   발신 hsu-extension-ping / hsu-lms-refresh-request
  // 상태는 ext 한 곳에 모으고 fetchedAt만 데이터 시각의 근거로 쓴다.
  const [ext, setExt] = useState<{
    installed: boolean;
    version?: string;
    status: 'idle' | 'syncing' | 'success' | 'login-required' | 'failed';
    error?: string;
  }>({ installed: false, status: 'idle' });
  const extRef = useRef(ext);
  extRef.current = ext;
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestLmsRefresh = (force: boolean) => {
    if (!extRef.current.installed) return;
    setExt((p) => ({ ...p, status: 'syncing', error: undefined }));
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    // 수집은 과목당 최대 수십 초 — 응답 없음 2분이면 실패로 간주
    syncTimeout.current = setTimeout(
      () =>
        setExt((p) =>
          p.status === 'syncing'
            ? { ...p, status: 'failed', error: '수집 시간이 초과됐습니다.' }
            : p,
        ),
      120e3,
    );
    window.postMessage(
      { type: 'hsu-lms-refresh-request', force },
      location.origin,
    );
  };
  const clearExtensionCache = () =>
    window.postMessage(
      { type: 'hsu-lms-clear-cache-request' },
      location.origin,
    );
  useEffect(() => {
    const endSync = (patch: Partial<typeof ext>) => {
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      setExt((p) => ({ ...p, ...patch }));
    };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data as
        | {
            type?: string;
            payload?: unknown;
            status?: string;
            error?: string;
            version?: string;
          }
        | null
        | undefined;
      if (d?.type === 'hsu-extension-ready') {
        setExt((p) => ({
          ...p,
          installed: true,
          version:
            typeof d.version === 'string' ? d.version : p.version,
        }));
        return;
      }
      if (d?.type === 'hsu-lms-status') {
        if (d.status === 'syncing')
          setExt((p) => ({ ...p, status: 'syncing', error: undefined }));
        else if (d.status === 'success') endSync({ status: 'success' });
        else if (d.error === 'cosmos-login-required')
          endSync({ status: 'login-required' });
        else
          endSync({
            status: 'failed',
            error: typeof d.error === 'string' ? d.error : '알 수 없는 오류',
          });
        return;
      }
      if (d?.type !== 'hsu-lms-import' || !d.payload) return;
      if (
        !readyRef.current ||
        !allowExtensionImport.current ||
        (!accountRef.current && !demoRef.current)
      )
        return;
      // 확장 데이터에는 검증 가능한 LMS 계정 식별자가 없다. 다른 학생의
      // 세션에서 가져온 자료가 로그인 계정에 저장되지 않도록 차단한다.
      if (!canImportExtensionLms(!!accountRef.current)) {
        endSync({ status: 'failed', error: '확장 프로그램의 학교 계정을 확인할 수 없어 가져오기를 중단했습니다. 학교 계정으로 다시 수집해 주세요.' });
        return;
      }
      const valid = validateLms(d.payload);
      if (!valid) {
        endSync({ status: 'failed', error: '수집 데이터 형식이 올바르지 않습니다.' });
        return;
      }
      const cur = dataRef.current;
      if (cur.lms?.fetchedAt && valid.fetchedAt <= cur.lms.fetchedAt) {
        endSync({ status: 'success' });
        return;
      }
      void persistRef.current?.(
        { ...cur, lms: mergeLmsSnapshot(cur.lms, valid) },
        '확장 프로그램이 최신 수업 현황을 가져왔습니다.',
      ).then((saved) => {
        endSync(
          saved
            ? { status: 'success', error: undefined }
            : { status: 'failed', error: '수집 데이터 저장에 실패했습니다.' },
        );
      });
    };
    addEventListener('message', onMsg);
    // content script가 리스너보다 먼저 ready를 보냈을 수 있으므로 능동 확인
    window.postMessage({ type: 'hsu-extension-ping' }, location.origin);
    const reping = setTimeout(
      () =>
        window.postMessage({ type: 'hsu-extension-ping' }, location.origin),
      2500,
    );
    return () => {
      removeEventListener('message', onMsg);
      clearTimeout(reping);
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs와 안정 상태만 사용
  }, []);
  // 앱이 열려 있고 보이는 동안 15분마다 확장 수집을 요청한다. hidden이면
  // 돌지 않고, 다시 보일 때 fetchedAt 기준으로 오래됐을 때만 즉시 요청 —
  // 백그라운드 5분 캐시·진행 중 공유와 함께 중복 수집을 막는다.
  useEffect(() => {
    const REFRESH_MS = 15 * 60e3;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const s = extRef.current;
      if (!s.installed || s.status === 'syncing') return;
      const at = dataRef.current.lms?.fetchedAt;
      const t = at ? Date.parse(at) : NaN;
      if (Number.isNaN(t) || Date.now() - t >= REFRESH_MS)
        requestLmsRefresh(false);
    };
    const iv = setInterval(tick, 60e3);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs만 사용
  }, []);
  useEffect(() => {
    const d = data;
    if (
      !d.notifEnabled ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    )
      return;
    const fired = new Set(d.notifiedIds ?? []);
    const before =
      (catalog?.semester ? semesterStartTs(catalog.semester) : null) ??
      currentSemesterStart(Date.now());
    const targets = [
      ...activityReminderTargets(actsSnap, d.saved, Date.now(), d.actStatus),
      // 활동 라이프사이클(수료·포인트 확인) + LMS 마감 — 같은 예약 큐
      ...stageReminderTargets({
        actStatus: d.actStatus,
        acts: actsSnap,
        extActivities: d.extActivities,
        now: Date.now(),
      }),
      ...(d.lms
        ? reminderTargets(d.lms, Date.now(), undefined, undefined, before)
        : []),
    ].sort((a, b) => a.fireAt - b.fireAt);
    const timers = targets
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
  }, [data.notifEnabled, data.lms, data.actStatus, data.extActivities, data.saved, catalog, actsSnap]);
  async function persist(
    next: Data,
    msg = '저장했습니다.',
    complete?: boolean,
  ) {
    const generation = accountGeneration.current;
    try {
      if (account) {
        // 호출 시점의 화면 상태를 base로 둔다 — 큐에서 기다리는 동안 앞선
        // 저장이 반영될 수 있으므로 전송 직전에 3-way 병합으로 내 변경분만
        // 얹는다(같은 탭 연속 쓰기가 서로를 덮어쓰지 않게).
        const baseAtCall = dataRef.current;
        return await enqueue(async () => {
          if (generation !== accountGeneration.current) throw new Error('session-changed');
          const send = mergeProfile(baseAtCall, next, dataRef.current);
          const response = await apiFetch('/api/account/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...send,
              // 전송 시점의 최신 rev — 큐에서 기다리는 동안 이전 저장이
              // rev를 올렸을 수 있으므로 next가 아닌 dataRef를 본다.
              rev: dataRef.current.rev ?? send.rev ?? 0,
              onboarded: complete ?? account.onboarded,
            }),
          });
          if (generation !== accountGeneration.current) return false;
          if (!response.ok) {
            let errorMessage = '저장하지 못했습니다.';
            try {
              await apiData(response);
            } catch (error) {
              if (error instanceof ApiRequestError) errorMessage = error.message;
            }
            if (generation !== accountGeneration.current) return false;
            // 충돌 시 자동 재시도는 같은 필드의 상대방 변경을 덮을 수 있다.
            // 서버 저장값은 그대로 두고 현재 입력을 화면에 남긴다.
            if (response.status === 409) {
              setData(send);
              setToast('다른 기기에서 먼저 저장했습니다. 입력 내용을 확인한 뒤 새로고침해 주세요.');
              return false;
            }
            setToast(errorMessage);
            return false;
          }
          const result = await apiData<{ saved: true; rev?: number }>(response);
          if (generation !== accountGeneration.current) return false;
          const stored = { ...send, rev: result.rev ?? send.rev };
          dataRef.current = stored;
          setAccount((current) => current ? {
            ...current,
            profile: stored,
            onboarded: complete ?? account.onboarded,
          } : current);
          setData(stored);
          if (msg) setToast(msg);
          return true;
        });
      }
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
      setData(next);
      if (msg) setToast(msg);
      return true;
    } catch {
      if (generation !== accountGeneration.current) return false;
      setToast('저장하지 못했습니다. 입력 내용은 유지됩니다.');
      return false;
    }
  }
  async function logout() {
    if (!window.confirm('정말 로그아웃하시겠습니까?')) return;
    accountGeneration.current += 1;
    const generation = accountGeneration.current;
    const context = getAccountContext();
    allowExtensionImport.current = false;
    try {
      const response = await apiFetch('/api/account/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (generation !== accountGeneration.current) return;
      if (!response.ok) throw new Error();
      try { sessionChannel.current?.postMessage({ type: 'session-ended', context }); } catch { /* 알림 실패는 로그아웃을 방해하지 않는다 */ }
      clearExtensionCache();
      setAccountContext(null);
      setAccount(null);
      setDemo(false);
      setData(empty);
      go('home');
    } catch {
      if (generation !== accountGeneration.current) return;
      allowExtensionImport.current = true;
      setToast('로그아웃 결과를 확인하지 못했습니다. 다시 확인해 주세요.');
    }
  }
  async function deleteAccount() {
    if (
      !window.confirm(
        '학사 도우미에 저장한 내 계정 자료를 모두 삭제할까요? 학교 원본 정보는 변경되지 않습니다.',
      )
    )
      return;
    accountGeneration.current += 1;
    const generation = accountGeneration.current;
    const context = getAccountContext();
    allowExtensionImport.current = false;
    try {
      const response = await apiFetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (generation !== accountGeneration.current) return;
      if (!response.ok) throw new Error();
      try { sessionChannel.current?.postMessage({ type: 'session-ended', context }); } catch { /* 알림 실패는 탈퇴를 방해하지 않는다 */ }
      clearExtensionCache();
      setAccountContext(null);
      setAccount(null);
      setData(empty);
      go('home');
    } catch {
      if (generation !== accountGeneration.current) return;
      allowExtensionImport.current = true;
      setToast('계정 삭제 결과를 확인하지 못했습니다. 로그인 상태를 확인해 주세요.');
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
  const hasLegacyPlan = data.planned.length > 0 || Object.keys(data.plans ?? {}).length > 0;
  const selectedSemester = data.planSemester ?? (hasLegacyPlan ? 'legacy' : (catalog?.semester ?? 'legacy'));
  const storedPlan = data.semesterPlans?.[selectedSemester];
  const sourceMismatch = !!storedPlan && !!catalog && storedPlan.sourceSemester !== catalog.semester;
  const selectedIds = selectedSemester === 'legacy' ? data.planned : (storedPlan?.planned ?? []);
  const selectedScenarios = selectedSemester === 'legacy' ? (data.plans ?? {}) : (storedPlan?.plans ?? {});
  const visibleIds = sourceMismatch ? [] : selectedIds;
  const planData = { ...data, planned: visibleIds, plans: sourceMismatch ? {} : selectedScenarios };
  const planYears = Number(catalog?.semester.slice(0, 4)) || new Date().getFullYear();
  const semesterOptions = [...new Set([
    ...Array.from({ length: 7 }, (_, i) => [1, 2].map((half) => `${planYears - 2 + i}-${half}`)).flat(),
    ...Object.keys(data.semesterPlans ?? {}),
    ...(selectedSemester === 'legacy' ? [] : [selectedSemester]),
  ])].sort();
  function updatePlan(ids: string[], scenarios = selectedScenarios) {
    if (selectedSemester === 'legacy') return { ...data, planSemester: selectedSemester, planned: ids, plans: scenarios };
    if (!catalog || sourceMismatch) return null;
    return { ...data, planSemester: selectedSemester, semesterPlans: { ...data.semesterPlans, [selectedSemester]: { sourceSemester: catalog.semester, planned: ids, plans: scenarios } } };
  }
  async function runPlanEdit(action: () => Promise<boolean>): Promise<boolean> {
    if (planEditPending.current) {
      setToast('계획을 저장하고 있습니다. 잠시 후 다시 시도해 주세요.');
      return false;
    }
    planEditPending.current = true;
    try { return await action(); } finally { planEditPending.current = false; }
  }
  async function plan(id: string): Promise<boolean> {
    return runPlanEdit(async () => {
      const next = updatePlan(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
      if (!next) { setToast('이 계획의 기준 자료를 불러온 뒤 수정할 수 있습니다.'); return false; }
      return persist(
        next,
        '개인 학기 계획을 변경했습니다. 공식 수강신청과는 별개입니다.',
      );
    });
  }
  async function swapPlan(fromId: string, toId: string): Promise<boolean> {
    return runPlanEdit(async () => {
      if (!selectedIds.includes(fromId)) return false;
      const next = updatePlan(selectedIds.filter((x) => x !== fromId && x !== toId).concat(toId));
      if (!next) return false;
      return persist(
        next,
        '',
      );
    });
  }
  // 시간표 시나리오 — 현재 planned를 슬롯에 저장/복원한다
  async function saveScenario(key: string): Promise<boolean> {
    return runPlanEdit(async () => {
      const next = updatePlan(selectedIds, { ...selectedScenarios, [key]: [...selectedIds] });
      if (!next) return false;
      return persist(
        next,
        `안 ${key}에 현재 시간표를 저장했습니다.`,
      );
    });
  }
  async function loadScenario(key: string): Promise<boolean> {
    return runPlanEdit(async () => {
      const ids = selectedScenarios[key];
      if (!ids) return false;
      const next = updatePlan(ids);
      if (!next) return false;
      return persist(
        next,
        `안 ${key}를 불러왔습니다. 공식 수강신청과는 별개입니다.`,
      );
    });
  }
  async function deleteScenario(key: string): Promise<boolean> {
    return runPlanEdit(async () => {
      const plans = { ...selectedScenarios };
      delete plans[key];
      const next = updatePlan(selectedIds, plans);
      return next ? persist(next, `안 ${key}를 삭제했습니다.`) : false;
    });
  }
  // 활동 진행 단계 — 본인 확인용 기록(저장됨 이후 신청→참여→수료→포인트)
  function setActStage(id: string, stage: string | null) {
    const actStatus = { ...data.actStatus };
    if (stage) actStatus[id] = stage;
    else delete actStatus[id];
    void persist(
      { ...data, actStatus },
      stage
        ? '활동 단계를 기록했습니다. 본인 확인용입니다.'
        : '활동 단계 기록을 지웠습니다.',
    );
  }
  // 직접 등록 활동 — hsportal 목록에 없는 외부 활동(대외활동·공모전 등)
  function addExtActivity(fields: Omit<ExtActivity, 'id' | 'addedAt'>) {
    const entry: ExtActivity = {
      ...fields,
      id: 'ext-' + Date.now().toString(36),
      addedAt: new Date().toISOString(),
    };
    void persist(
      { ...data, extActivities: [...(data.extActivities ?? []), entry] },
      '직접 등록 활동을 추가했습니다.',
    );
    return entry.id;
  }
  function removeExtActivity(id: string) {
    const actStatus = { ...data.actStatus };
    delete actStatus[id];
    void persist(
      {
        ...data,
        extActivities: (data.extActivities ?? []).filter((x) => x.id !== id),
        saved: data.saved.filter((x) => x !== id),
        actStatus,
      },
      '직접 등록 활동을 삭제했습니다.',
    );
  }
  function exitDemo() {
    setDemo(false);
    setData(empty);
  }
  function resetDemoData(): boolean {
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
      if (!accountRef.current && demoRef.current) {
        dataRef.current = empty;
        setData(empty);
        setQuery('');
        setFilter('전체');
      }
      setToast('이 브라우저의 체험 데이터를 초기화했습니다.');
      return true;
    } catch {
      setToast('체험 데이터를 초기화하지 못했습니다. 브라우저 저장 설정을 확인해 주세요.');
      return false;
    }
  }
  const surveyOpen = route.split('/')[0] === 'survey';
  const section = surveyOpen ? 'home' : route.split('/')[0],
    detail = route.split('/')[1],
    planned = (catalog?.sections ?? []).filter((s) =>
      visibleIds.includes(s.id),
    );
  const notifBefore =
    (catalog?.semester ? semesterStartTs(catalog.semester) : null) ??
    currentSemesterStart(notifNow);
  const notifItems = deriveNotifs({
    account,
    data,
    planned,
    acts: actsSnap,
    sched: schedSnap,
    now: notifNow,
    before: notifBefore,
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
        survey: '나를 위한 시작 설문',
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
        {slowAccount && <p aria-live="polite">서버 응답이 늦어지고 있어요. 잠시만 기다려 주세요.</p>}
      </div>
    );
  if (!account && !demo)
    return (
      <>
        <SignIn
          notice={accountError || undefined}
          onAuthenticated={(result) => {
            accountGeneration.current += 1;
            setAccountContext(result.sessionContext);
            try { sessionChannel.current?.postMessage({ type: 'session-changed', context: result.sessionContext }); } catch { /* ignore */ }
            clearExtensionCache();
            allowExtensionImport.current = true;
            setAccount(result);
            const next = accountData(result);
            setData(next);
            go(surveyEntryRoute(next));
          }}
          onDemo={() => {
            accountGeneration.current += 1;
            clearExtensionCache();
            allowExtensionImport.current = false;
            setDemo(true);
            let demoData = empty;
            try {
              const raw = localStorage.getItem(DEMO_STORAGE_KEY);
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
                  (d.actPrefs === undefined || Array.isArray(d.actPrefs)) &&
                  (d.painPrefs === undefined || Array.isArray(d.painPrefs)) &&
                  (d.actStatus === undefined ||
                    (d.actStatus &&
                      typeof d.actStatus === 'object' &&
                      !Array.isArray(d.actStatus))) &&
                  (d.extActivities === undefined ||
                    Array.isArray(d.extActivities)) &&
                  (d.lmsMatch === undefined ||
                    (d.lmsMatch &&
                      typeof d.lmsMatch === 'object' &&
                      !Array.isArray(d.lmsMatch))) &&
                  (d.plans === undefined ||
                    (d.plans &&
                      typeof d.plans === 'object' &&
                      !Array.isArray(d.plans))) &&
                  (d.lms === undefined || typeof d.lms === 'object')
                ) {
                  const next = { ...empty, ...d };
                  next.lms = validateLms(d.lms) ?? undefined;
                  const info = validateInfo(d.info);
                  demoData = info ? applyInfo(next, info) : next;
                }
              }
            } catch {
              demoData = empty;
            }
            setData(demoData);
            go(surveyEntryRoute(demoData));
          }}
        />
      </>
    );
  return (
    <div className={'shell' + (sideCollapsed ? ' side-collapsed' : '')}>
      <Sidebar
        section={surveyOpen ? 'survey' : section}
        drawer={drawer}
        go={go}
        account={account}
        data={data}
        onExit={() => {
          if (account) void logout();
          else exitDemo();
        }}
        onCloseDrawer={() => setDrawer(false)}
        collapsed={sideCollapsed}
        onToggleCollapse={() => setSideCollapsed((v) => !v)}
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
          onExpandSide={
            sideCollapsed ? () => setSideCollapsed(false) : undefined
          }
        />
        <main>
          <PageHeading
            section={section}
            label={section === 'lms' && detail === 'tasks' ? '과제 모아보기' : section === 'graduation' ? ({ outlook: '졸업 전망', requirements: '요건별 충족 현황', completed: '이수한 과목', department: '학과·트랙별 요건' } as Record<string, string>)[detail ?? ''] ?? label : label}
            name={data.name}
          />
          {section !== 'home' && (
            <AccountBar account={account} go={go} onConnect={exitDemo} />
          )}
          {['courses', 'timetable', 'semester-plan'].includes(section) && (
            <div className="card pad" style={{ marginBottom: 20 }}>
              <label>계획 학기{' '}
                <select className="field" aria-label="계획 학기" value={selectedSemester}
                  onChange={(e) => { const semester = e.target.value; void runPlanEdit(() => persist({ ...data, planSemester: semester }, '계획 학기를 변경했습니다.')); }}>
                  {(hasLegacyPlan || selectedSemester === 'legacy') && <option value="legacy">기존 계획 (학기 미지정)</option>}
                  {semesterOptions.map((semester) => <option key={semester} value={semester}>{semester}</option>)}
                </select>
              </label>
              <p className="meta">
                {catalog ? `${catalog.semester} 자료로 계획 연습 중 · 선택한 학기의 실제 개설 여부와 시간표는 학교 공지에서 확인하세요.` : '강의 자료를 불러오는 중입니다.'}
              </p>
              {sourceMismatch && <p className="form-error">이 계획은 {storedPlan?.sourceSemester} 자료로 저장되어 현재 자료로는 표시하거나 수정할 수 없습니다. 저장된 계획은 보존됩니다.</p>}
              {selectedSemester === 'legacy' && hasLegacyPlan && <p className="meta">기존 계획의 학기와 기준 자료는 확인할 수 없어 미지정으로 보존했습니다.</p>}
            </div>
          )}
          {(slowCollect || pollDelayed) && (
            <div className="card pad" aria-live="polite">
              <p>{pollDelayed ? '학교 정보 수집 결과를 아직 확인하지 못했어요. 서버에서 처리가 계속되고 있을 수 있습니다.' : '학교 정보 수집이 평소보다 오래 걸리고 있어요. 기존 자료가 있다면 계속 볼 수 있습니다.'}</p>
              {pollDelayed && <button className="secondary" onClick={() => setPollRetry((n) => n + 1)}>수집 상태 다시 확인</button>}
            </div>
          )}
          {section === 'home' ? (
            <Home
              data={data}
              account={account}
              go={go}
              planned={planned}
              catalog={catalog}
              planSemester={selectedSemester}
              planSourceMismatch={sourceMismatch}
              planSourceSemester={storedPlan?.sourceSemester}
              persist={persist}
              onPainSurvey={openPainSurvey}
            />
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
              setActStage={setActStage}
              addExtActivity={addExtActivity}
              removeExtActivity={removeExtActivity}
            />
          ) : section === 'profile' ? (
            <ProfileSection
              data={data}
              account={account}
              persist={persist}
              focus={detail}
              go={go}
            />
          ) : section === 'graduation' ? (
            <GraduationWorkspace
              data={data}
              go={go}
              catalog={catalog}
              planned={planned}
              persist={persist}
              detail={detail}
              infoPending={
                infoPending && !collectStale(infoPending) && !pollDelayed
              }
              infoFailed={infoFailed}
            />
          ) : section === 'courses' ? (
            <Courses
              data={planData}
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
              semester={selectedSemester === 'legacy' ? undefined : selectedSemester}
            />
          ) : section === 'timetable' ? (
            <Timetable
              key={`${selectedSemester}:${catalog?.semester ?? 'loading'}`}
              catalog={catalog}
              failed={catalogFailed}
              retry={retryCatalog}
              planned={planned}
              data={planData}
              plan={plan}
              swap={swapPlan}
              notify={setToast}
              onSaveScenario={saveScenario}
              onLoadScenario={loadScenario}
              onDeleteScenario={deleteScenario}
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
              serverCollecting={lmsPending && !collectStale(lmsPending) && !pollDelayed}
              collectFailed={lmsFailed}
              collectDelayed={collectStale(lmsPending) || (lmsPending && pollDelayed)}
              lmsUnavailable={account?.snapshot.lms === 'unavailable'}
              lmsError={account?.snapshot.lmsError}
              studentMask={account?.studentMask}
              onAccount={(result) => {
                if (renderedGeneration === accountGeneration.current && accountRef.current)
                  setAccount(result);
              }}
              ext={ext}
              onExtRefresh={() => requestLmsRefresh(true)}
              catalog={catalog}
            />
          ) : section === 'advisor' ? (
            <Advisor
              key={`${renderedGeneration}:${detail ?? ''}`}
              activityId={detail}
              signedIn={!!account}
              data={data}
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
              onDeleteAccount={deleteAccount}
              onLogout={logout}
              onResetDemo={resetDemoData}
              catalog={catalog}
              activities={actsSnap}
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
      <Mascot
        enabled={data.mascotEnabled !== false}
        guideSeen={!!data.mascotGuideSeen}
        isNewUser={!account || !account.onboarded}
        survey={surveyOpen ? 'course' : false}
        route={section}
        hidden={drawer || notifOpen || (!account && !data.consent)}
        data={data}
        persist={persist}
        go={go}
        onOpenSurvey={() => go('survey')}
      />
      {ready && !account && !data.consent && (
        <CookieBanner
          onConfirm={() => persist({ ...data, consent: true }, '')}
        />
      )}
      {surveyOpen && (
        <SurveyPage
          key={renderedGeneration}
          data={data}
          onSave={(answers) => persist(
            { ...dataRef.current, ...answers },
            answers.surveyStatus === 'completed' ? '설문 답변을 저장했습니다.' : '',
          )}
          onExit={() => go('home')}
        />
      )}
      <SurveyDialog
        dialogRef={painDialog}
        label="학습 고민"
        questions={PAIN_QUESTIONS}
        step={painStep}
        draft={painDraft}
        setDraft={setPainDraft}
        setStep={setPainStep}
        mascotEnabled={data.mascotEnabled !== false}
        onClose={() => setPainSurvey(false)}
        onSubmit={(prefs) => {
          void persist(
            { ...dataRef.current, painPrefs: prefs },
            '학습 고민을 저장했어요. 맞춤 안내에 반영할게요.',
          ).then((ok) => {
            if (ok) setPainSurvey(false);
          });
        }}
      />
    </div>
  );
}
