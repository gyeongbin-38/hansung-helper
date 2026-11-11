'use client';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, RotateCcw } from 'lucide-react';
import type { Data } from './data';
import { useActivities, useSchedule } from './catalog';
import type { Catalog } from '@/lib/data/catalog';
import { apiData, apiFetch } from '@/lib/data/api';
import { guideReply, type AdvisorMessage, type AdvisorReply } from '@/lib/data/advisor';

type Turn = { question: string; reply: AdvisorReply };
const QUESTIONS = ['이번 주에 뭐부터 해야 해?', '내 시간표 계획을 점검해 줘', '졸업 준비는 어디서 시작해?', '비교과 활동을 찾고 싶어', '학교 정보가 안 들어와', '저장한 정보는 어떻게 관리해?'];

export function Advisor({ data, catalog, go, signedIn }: {
  data: Data;
  catalog: Catalog | null;
  go: (route: string) => void;
  signedIn: boolean;
}) {
  const { snap: activities } = useActivities();
  const { snap: schedule } = useSchedule();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'ai' | 'guide'>(signedIn ? 'ai' : 'guide');
  const [personal, setPersonal] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
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
      const reply = guideReply(q, personal ? data : null, { catalog, activities, schedule });
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
        body: JSON.stringify({ messages, personal }),
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
          onChange={(e) => { clear(); setPersonal(e.target.checked); }} />
        내 학사 요약 사용
      </label>
      <p className="meta advisor-privacy">
        {useAi ? '질문·이 대화의 최근 답변을 Cloudflare AI로 보내요. 요약을 선택하면 학과·입학연도·계획·학점·포인트·마감도 사용해요. 이름·학번·성적·비밀번호는 자동 전송하지 않아요.'
          : '기본 안내는 이 브라우저에서 처리해요. 요약을 선택하면 현재 화면의 학사 정보를 함께 확인해요.'}
        {' '}대화는 서버에 저장하지 않으며 화면을 나가면 지워져요. 질문에 학번·비밀번호를 입력하지 마세요.
      </p>
      <div className="chips">
        {QUESTIONS.map((q) => <button className="secondary" key={q} disabled={pending}
          onClick={() => { setQuestion(q); void ask(q); }}>{q}</button>)}
      </div>
      <div className="advisor-conversation" role="log" aria-label="학사 상담 대화" aria-live="polite" aria-relevant="additions">
        {turns.map((turn, i) => <article className="advisor-turn" key={i}>
          <p className="advisor-question"><b>나</b>{turn.question}</p>
          <div className="answer">
            <b>{turn.reply.mode === 'ai' ? 'AI 답변' : '기본 안내 · AI 생성 아님'}</b>
            <p className="advisor-answer-text">{turn.reply.answer}</p>
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
