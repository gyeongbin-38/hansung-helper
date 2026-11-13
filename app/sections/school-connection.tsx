'use client';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Check, Hourglass, LockKeyhole, RefreshCw, School, X } from 'lucide-react';
import type { Account } from '../account-flow';
import { apiData, apiFetch, getAccountContext } from '@/lib/data/api';
import { isQueuedResponse, waitForCollectTurn, type CollectQueueState } from '@/lib/data/collect-queue';

type ConnectionStatus = {
  configured: boolean;
  available: boolean;
  expiresAt: number | null;
};

/** School credentials travel only to the authenticated school endpoint. */
export function SchoolConnection({ signedIn, onAccount, onSignIn, pending = false }: {
  signedIn: boolean;
  onAccount?: (account: Account) => void;
  onSignIn?: () => void;
  pending?: boolean;
}) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<CollectQueueState>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checked, setChecked] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const currentRequest = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    apiFetch('/api/account/lms-refresh-session', { signal: controller.signal, cache: 'no-store' })
      .then(response => apiData<ConnectionStatus>(response))
      .then(result => { if (!controller.signal.aborted) setStatus(result); })
      .catch(() => {
        if (!controller.signal.aborted) setError('학교 연결 상태를 확인하지 못했어요. 다시 확인해 주세요.');
      });
    return () => controller.abort();
  }, [signedIn, checked]);

  useEffect(() => () => {
    currentRequest.current?.abort();
    form.current?.reset();
  }, []);

  useEffect(() => {
    if (!status?.expiresAt) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, status.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [status]);

  async function refresh(event?: SubmitEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (currentRequest.current || pending || !onAccount) return;
    const context = getAccountContext();
    const controller = new AbortController();
    currentRequest.current = controller;
    let body = '{}';
    if (event) {
      const fields = new FormData(event.currentTarget);
      body = JSON.stringify({ studentId: fields.get('studentId'), password: fields.get('password'), keepVault: fields.get('keepVault') === 'on' });
      fields.delete('password');
      const password = event.currentTarget.elements.namedItem('password');
      if (password instanceof HTMLInputElement) password.value = '';
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      // 대기열에 들어가면 순번이 올 때까지 상태를 폴링한 뒤 같은 요청을 다시 보낸다.
      // 비밀번호 본문은 메모리 안에서만 재사용한다.
      const post = async () => {
        const response = await apiFetch(event ? '/api/account/lms-refresh' : '/api/account/lms-refresh-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75000)]),
        }, 75000);
        const schoolExpired = response.headers.get('X-Hansung-School-Session') === 'expired';
        if (schoolExpired && !controller.signal.aborted && getAccountContext() === context) {
          setStatus(previous => previous ? { ...previous, available: false, expiresAt: null } : previous);
          setOpen(true);
        }
        return apiData<Account>(response);
      };
      let result = await post();
      const queueDeadline = Date.now() + 360_000;
      while (isQueuedResponse(result)) {
        // queued면 순번이 올 때까지, running(다른 탭·기기의 같은 계정 수집)이면
        // 끝날 때까지 폴링한다. 끝나면 재요청이 cooldown으로 직전 결과를 돌려받는다.
        const turn = await waitForCollectTurn({
          signal: controller.signal,
          onUpdate: state => { if (!controller.signal.aborted) setQueue(state); },
          timeoutMs: Math.max(1000, queueDeadline - Date.now()),
        });
        if (controller.signal.aborted || getAccountContext() !== context) return;
        if (turn?.status === 'waiting' || turn?.status === 'running') {
          setError('수집 대기가 길어지고 있어요. 잠시 후 다시 시도해 주세요.');
          return;
        }
        result = await post();
      }
      setQueue(null);
      if (controller.signal.aborted || getAccountContext() !== context) return;
      onAccount(result);
      setOpen(false);
      form.current?.reset();
      setChecked(value => value + 1);
      setNotice('학교 연결을 확인했어요. 학사 정보는 수집이 끝나면 반영됩니다.');
    } catch (failure) {
      if (controller.signal.aborted || getAccountContext() !== context) return;
      setError(failure instanceof Error ? failure.message : '학교 연결을 확인하지 못했어요. 다시 시도해 주세요.');
    } finally {
      body = '';
      if (currentRequest.current === controller) currentRequest.current = null;
      if (!controller.signal.aborted && getAccountContext() === context) setBusy(false);
    }
  }

  const canReuse = status?.available && status.expiresAt !== null && status.expiresAt > now;
  return (
    <section className="school-connection" aria-labelledby="school-connection-title" aria-busy={busy}>
      <div className="school-connection-heading">
        <School size={18} aria-hidden="true" />
        <h3 id="school-connection-title">학교 연결</h3>
        {signedIn && <span className="badge">{canReuse ? '세션 보관 중' : '학교 계정 로그인됨'}</span>}
      </div>
      <p className="meta">
        {!signedIn ? '학교 계정을 연결하면 내 학사 정보를 확인하며 준비할 수 있어요.'
          : canReuse ? '저장된 세션으로 종합정보·COSMOS를 다시 확인할 수 있어요.'
          : status?.configured === false ? '학교 정보는 비밀번호로 다시 연결할 수 있어요.'
          : '학사 정보가 오래됐다면 학교 계정으로 다시 연결해 주세요.'}
      </p>
      {canReuse && status.expiresAt && <p className="meta">세션 보관 기한 {new Date(status.expiresAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · 학교에서 먼저 만료될 수 있어요.</p>}
      {!signedIn ? <button type="button" className="secondary" onClick={onSignIn} disabled={!onSignIn || pending}>학교 계정 연결</button>
        : <div className="school-connection-actions">
          {canReuse && <button type="button" className="secondary" disabled={busy || pending || !onAccount} onClick={() => void refresh()}><RefreshCw size={14} aria-hidden="true" />{busy ? '학교 확인 중…' : '학교 정보 새로고침'}</button>}
          <button type="button" className="link" disabled={busy || pending || !onAccount} aria-expanded={open} aria-controls="school-reconnect-form" onClick={() => { form.current?.reset(); setOpen(value => !value); setError(''); }}>비밀번호로 다시 연결</button>
          {!status && <button type="button" className="link" disabled={busy} onClick={() => { setError(''); setChecked(value => value + 1); }}>상태 다시 확인</button>}
        </div>}
      {queue && <output className="collect-queue-card" aria-live="polite">
        {/* eslint-disable-next-line next/no-img-element -- reuse the bundled service mascot */}
        <img src="/illustrations/academic-owl.png" alt="" className="collect-queue-owl" />
        <div>
          <b>{queue.status === 'running' ? '학교에서 정보를 가져오고 있어요'
            : queue.position <= 1 ? '곧 수집을 시작해요'
            : `수집 대기 ${queue.position}번째입니다`}</b>
          <p className="meta">조금만 기다려 주세요. 학교 서버에 무리가 가지 않게 순서대로 수집하고 있어요.</p>
        </div>
        <Hourglass size={16} aria-hidden="true" className="collect-queue-spin" />
      </output>}
      {open && signedIn && <form ref={form} id="school-reconnect-form" className="school-connection-form" onSubmit={event => void refresh(event)}>
        <p className="meta"><LockKeyhole size={13} aria-hidden="true" /> 학교 인증용 입력이에요. 비밀번호는 AI에 보내거나 저장하지 않아요.</p>
        <label>학번<input className="field" name="studentId" inputMode="numeric" autoComplete="username" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required disabled={busy || pending} /></label>
        <label>학교 비밀번호<input className="field" name="password" type="password" autoComplete="current-password" maxLength={128} required disabled={busy || pending} /></label>
        <label className="school-connection-keep"><input type="checkbox" name="keepVault" disabled={busy || pending} /> 자동 연결 유지 — 세션을 최대 3일 보관해 비밀번호 없이 새로고침해요</label>
        <p className="meta">연결 성공 시 학교 세션 쿠키만 암호화해 보관해요(선택 안 하면 2시간). 로그아웃하면 삭제돼요.</p>
        <div className="school-connection-actions"><button className="primary" disabled={busy || pending}>{busy ? '학교 인증 중…' : '학교 연결 확인'}</button><button type="button" className="link" disabled={busy} onClick={() => { form.current?.reset(); setOpen(false); }}><X size={14} aria-hidden="true" />취소</button></div>
      </form>}
      <p className="meta">비교과 접수 사이트는 별도 로그인 후 신청 내용을 확인해 주세요.</p>
      {notice && <output className="meta school-connection-notice"><Check size={14} aria-hidden="true" />{notice}</output>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
