'use client';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, RotateCcw, ArrowUpRight, Copy } from 'lucide-react';
import type { Data } from './data';
import { useActivities, useSchedule, useNow } from './catalog';
import type { Catalog } from '@/lib/data/catalog';
import { apiData, apiFetch } from '@/lib/data/api';
import { guideReply, type AdvisorMessage, type AdvisorReply } from '@/lib/data/advisor';
import { activityBrief } from '@/lib/data/activity-assistant';

type Turn = { question: string; reply: AdvisorReply };
const QUESTIONS = ['이번 주에 뭐부터 해야 해?', '내 시간표 계획을 점검해 줘', '졸업 준비는 어디서 시작해?', '비교과 활동을 찾고 싶어', '학교 정보가 안 들어와', '저장한 정보는 어떻게 관리해?'];

export function Advisor({ data, catalog, go, signedIn, activityId }: {
  data: Data;
  catalog: Catalog | null;
  go: (route: string) => void;
  signedIn: boolean;
  activityId?: string;
}) {
  const { snap: activities } = useActivities();
  const { snap: schedule } = useSchedule();
  const now = useNow(30000);
  const activity = activities?.items.find(a => a.id === activityId);
  const brief = activity ? activityBrief(activity, activities?.fetchedAt, now) : null;
  const [available, setAvailable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'ai' | 'guide'>(signedIn ? 'ai' : 'guide');
  const [personal, setPersonal] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState(activityId === 'activities' ? '관심 비교과와 참여 현황을 요약하고 다음에 준비할 활동을 추천해 줘.' : '');
  const [draft, setDraft] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ controller: AbortController; id: number } | null>(null);
  const generation = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const useAi = mode === 'ai' && signedIn && available === true;

  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/advisor', { signal: controller.signal })
      .then((r) => apiData<{ available: boolean }>(r))
      .then((r) => { if (!controller.signal.aborted) setAvailable(r.available === true); })
      .catch(() => { if (!controller.signal.aborted) setAvailable(false); });
    return () => { controller.abort(); request.current?.controller.abort(); generation.current += 1; };
  }, []);

  function clear() {
    generation.current += 1;
    request.current?.controller.abort();
    request.current = null;
    setTurns([]);
    setPending(false);
    setError('');
  }

  async function ask(raw: string) {
    const q = raw.trim();
    if (!q || q.length > 600 || request.current) return;
    setError('');
    if (!useAi) {
      const reply = guideReply(q, personal ? data : null, { catalog, activities, schedule }, now, activity?.id);
      setTurns((prev) => [...prev.slice(-9), { question: q, reply }]);
      setQuestion('');
      return;
    }
    const id = ++generation.current;
    const controller = new AbortController();
    request.current = { controller, id };
    setPending(true);
    try {
      const messages: AdvisorMessage[] = turns.filter((t) => t.reply.mode === 'ai').slice(-2)
        .flatMap((t) => [{ role: 'user' as const, content: t.question }, { role: 'assistant' as const, content: t.reply.answer }]);
      messages.push({ role: 'user', content: q });
      const response = await apiFetch('/api/advisor', {
        method: 'POST', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, personal, ...(activity ? { activityId: activity.id } : {}) }),
      }, 35000);
      const reply = await apiData<AdvisorReply>(response);
      if (id !== generation.current) return;
      setTurns((prev) => [...prev.slice(-9), { question: q, reply }]);
      setQuestion('');
    } catch (e) {
      if (id === generation.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : '답변을 가져오지 못했어요. 다시 시도해 주세요.');
    } finally {
      if (id === generation.current) { request.current = null; setPending(false); }
    }
  }

  return (
    <section className="card advisor" aria-labelledby="advisor-title">
      <span className="ai-mark"><Sparkles size={30} aria-hidden="true" /></span>
      <h2 id="advisor-title">AI 학사 도우미</h2>
      <p>학사 계획부터 서비스 사용법까지, 궁금한 것을 물어보세요.</p>
      <label className="advisor-activity-picker">비교과 신청 준비할 활동
        <select aria-label="AI와 준비할 비교과 선택" value={activity?.id ?? ''} onChange={e => go(e.target.value ? `advisor/${e.target.value}` : 'advisor')}>
          <option value="">활동을 선택하거나 아래에서 상담해 주세요</option>
          {activities?.items.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </label>
      {brief && activity && <section className="advisor-activity-context" aria-label="선택한 비교과 신청 준비">
        <span className="badge blue">1 공고 요약 · 2 AI 상담 · 3 신청 내용 검토</span>
        <h3>{brief.title}</h3><p>{brief.department}</p>
        <dl><div><dt>신청 마감</dt><dd>{brief.applicationEnd?.slice(0, 10) ?? '공고 확인 필요'}</dd></div>
          <div><dt>운영 기간</dt><dd>{brief.runStart?.slice(0, 10) ?? '미정'} ~ {brief.runEnd?.slice(0, 10) ?? '미정'}</dd></div>
          <div><dt>안내 포인트</dt><dd>{brief.points === null ? '확인 필요' : `${brief.points}P`}</dd></div></dl>
        <p className="meta">{brief.needsVerification ? '현재 접수 여부 재확인 필요' : brief.status} · 수집일 {brief.asOf?.slice(0, 10)}. 지원 대상·필수 서류와 신청 문항은 학교 공고에서 확인해 주세요.</p>
      </section>}
      <fieldset className="advisor-mode">
        <legend className="sr-only">답변 방식</legend>
        <button className="secondary" aria-pressed={useAi} disabled={!signedIn || available !== true}
          onClick={() => { clear(); setMode('ai'); }}>AI 상담</button>
        <button className="secondary" aria-pressed={!useAi}
          onClick={() => { clear(); setMode('guide'); }}>기본 안내</button>
      </fieldset>
      <output className="meta advisor-status">
        {!signedIn ? '체험 모드에서는 기본 안내를 이용할 수 있어요. AI 상담은 학교 계정으로 로그인해 주세요.'
          : available === null ? 'AI 연결 상태를 확인하고 있어요.'
          : available === false ? 'AI 상담을 준비 중이에요. 지금은 기본 안내를 이용할 수 있어요.'
          : useAi ? 'AI가 제공된 자료를 바탕으로 답해요. 공식 졸업 판정과 신청은 학교에서 확인하세요.'
          : '사이트 데이터로 답하는 기본 안내예요. AI 생성 답변이 아니에요.'}
      </output>
      <label className="advisor-consent">
        <input type="checkbox" checked={personal} disabled={pending}
          onChange={(e) => { clear(); setDraft(''); setCopyStatus(''); setPersonal(e.target.checked); }} />
        내 학사 요약 사용
      </label>
      <p className="meta advisor-privacy">
        {useAi ? '질문·이 대화의 최근 답변을 Cloudflare AI로 보내요. 요약을 선택하면 학과·입학연도·계획·학점·포인트·마감도 사용해요. 이름·학번·성적·비밀번호는 자동 전송하지 않아요.'
          : '기본 안내는 이 브라우저에서 처리해요. 요약을 선택하면 현재 화면의 학사 정보를 함께 확인해요.'}
        {' '}대화는 서버에 저장하지 않으며 화면을 나가면 지워져요. 질문에 학번·비밀번호를 입력하지 마세요.
      </p>
      <div className="chips">
        {activity && ['이 활동의 신청 기간·내용·준비할 것을 요약해 줘', '내가 공유한 학사 정보를 참고해 참여 목적과 신청 메모 초안을 함께 준비해 줘'].map(q => <button className="secondary" key={q} disabled={pending} onClick={() => { setQuestion(q); void ask(q); }}>{q}</button>)}
        {QUESTIONS.map((q) => <button className="secondary" key={q} disabled={pending}
          onClick={() => { setQuestion(q); void ask(q); }}>{q}</button>)}
      </div>
      <div className="advisor-conversation" role="log" aria-label="학사 상담 대화" aria-live="polite" aria-relevant="additions">
        {turns.map((turn, i) => <article className="advisor-turn" key={i}>
          <p className="advisor-question"><b>나</b>{turn.question}</p>
          <div className="answer">
            <b>{turn.reply.mode === 'ai' ? 'AI 답변' : '기본 안내 · AI 생성 아님'}</b>
            <p className="advisor-answer-text">{turn.reply.answer}</p>
            {activity && <button className="link" onClick={() => { setDraft(turn.reply.answer); setCopyStatus(''); }}>이 답변을 신청 준비 메모로 가져오기</button>}
            <small>{turn.reply.personal ? '내 학사 요약 포함' : '개인 학사 정보 사용 안 함'} · 참고 자료와 확인할 화면</small>
            <ul className="advisor-sources">{turn.reply.sources.map((s) => <li key={s.label + s.route}>
              <button className="link" onClick={() => go(s.route)}>{s.label} →</button>
              {s.asOf && <span>{s.asOf.slice(0, 10)} 기준</span>}
            </li>)}</ul>
          </div>
        </article>)}
      </div>
      <form className="advisor-form" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
        <label htmlFor="advisor-question">궁금한 점</label>
        <textarea id="advisor-question" ref={input} className="field" rows={3} value={question}
          onChange={(e) => setQuestion(e.target.value)} maxLength={600} disabled={pending}
          placeholder="예: 시간표에 담은 과목은 실제로 신청된 거야?" />
        <div className="advisor-form-actions">
          <span className="meta">{question.length}/600</span>
          <button type="button" className="secondary" onClick={clear} disabled={!turns.length && !pending && !error}>
            <RotateCcw size={15} aria-hidden="true" /> 대화 지우기</button>
          <button className="primary" disabled={pending || !question.trim()}>
            <Send size={16} aria-hidden="true" />{pending ? '답변 준비 중…' : useAi ? 'AI에게 묻기' : '안내 보기'}</button>
        </div>
      </form>
      {activity && <section className="advisor-application-draft" aria-label="신청 준비 메모">
        <h3>신청 내용 준비</h3><p className="meta">AI와 참여 목적·가능한 시간을 정리하고, 답변을 메모로 가져와 수정하세요. 메모는 이 화면에서만 유지돼요.</p>
        <label>검토할 신청 메모<textarea aria-label="신청 준비 메모" value={draft} maxLength={6000} rows={7} placeholder="AI 답변을 가져오거나 참여 목적·준비할 서류를 적어 주세요." onChange={e => { setDraft(e.target.value); setCopyStatus(''); }} /></label>
        <div className="actions"><button className="secondary" disabled={!draft.trim()} onClick={async () => {
          try { await navigator.clipboard.writeText(draft); setCopyStatus('메모를 복사했어요. 학교 신청 문항에 맞게 검토해 주세요.'); }
          catch { setCopyStatus('자동 복사가 되지 않았어요. 메모를 직접 선택해 복사해 주세요.'); }
        }}><Copy size={15} />메모 복사</button>
          <a className="secondary" href={activity.url} target="_blank" rel="noreferrer">학교 공고·신청 화면 열기 <ArrowUpRight size={15} /></a></div>
        {copyStatus && <output className="meta">{copyStatus}</output>}
        <p className="meta">현재 단계는 신청 준비예요. 학교 신청 화면에서 지원 자격·문항·개인 정보를 확인하고 제출해 주세요. 링크를 열거나 메모를 복사해도 접수 상태는 바뀌지 않아요.</p>
      </section>}
      {pending && <output className="advisor-status">학사 정보와 서비스 안내를 확인하고 있어요…</output>}
      {error && <div className="advisor-error" role="alert"><p>{error}</p>
        <button className="secondary" onClick={() => void ask(question)}>다시 시도</button>{' '}
        <button className="secondary" onClick={() => { clear(); setMode('guide'); input.current?.focus(); }}>기본 안내로 전환</button>
      </div>}
      <div className="actions">
        <button className="link" onClick={() => go('graduation')}>졸업요건 →</button>
        <button className="link" onClick={() => go('settings')}>학교 연결·저장 정보 →</button>
      </div>
    </section>
  );
}
