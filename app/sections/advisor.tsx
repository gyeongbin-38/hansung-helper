'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ClipboardCheck,
  Copy,
  ListTodo,
  MessageCircle,
  RotateCcw,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import type { Data } from './data';
import { useActivities, useSchedule, useNow } from './catalog';
import { SchoolConnection } from './school-connection';
import type { Account } from '../account-flow';
import type { Catalog } from '@/lib/data/catalog';
import { apiData, apiFetch } from '@/lib/data/api';
import {
  guideReply,
  type AdvisorMessage,
  type AdvisorReply,
} from '@/lib/data/advisor';
import {
  extToActivity,
  liveStatus,
  type Activity,
} from '@/lib/data/activities';
import {
  activityBrief,
  activityWorkspaceItems,
  type ActivityWorkspaceFilter,
} from '@/lib/data/activity-assistant';

type Turn = { question: string; reply: AdvisorReply };
type Tab = 'find' | 'prepare' | 'chat';
type Prep = {
  purpose: string;
  experience: string;
  schedule: string;
  notes: string;
};
const EMPTY: Prep = { purpose: '', experience: '', schedule: '', notes: '' };
const QUESTIONS = [
  '이번 주에는 무엇부터 해야 해?',
  '다음 학기 계획을 점검해 줘',
  '졸업 준비는 어디서 시작해?',
  '나에게 맞는 비교과 활동을 찾아 줘',
];
const date = (value: string | null | undefined) =>
  value ? value.slice(0, 10).replaceAll('-', '.') : '확인 필요';

function prepText(draft: Prep, activity: Activity) {
  return [
    `[활동] ${activity.title}`,
    `[참여 목적]\n${draft.purpose || '(작성 전)'}`,
    `[관련 경험·강점]\n${draft.experience || '(작성 전)'}`,
    `[참여 가능 시간·일정]\n${draft.schedule || '(작성 전)'}`,
    `[확인할 사항]\n${draft.notes || '(작성 전)'}`,
  ].join('\n\n');
}

export function Advisor({
  data,
  catalog,
  go,
  signedIn,
  activityId,
  onSchoolAccount,
  onSignIn,
}: {
  data: Data;
  catalog: Catalog | null;
  go: (route: string) => void;
  signedIn: boolean;
  activityId?: string;
  onSchoolAccount?: (account: Account) => void;
  onSignIn?: () => void;
}) {
  const { snap: activities } = useActivities();
  const { snap: schedule } = useSchedule();
  const now = useNow(30000);
  const all = useMemo(
    () => [
      ...(activities?.items ?? []),
      ...(data.extActivities ?? []).map(extToActivity),
    ],
    [activities?.items, data.extActivities],
  );
  const activity = all.find((item) => item.id === activityId);
  const external = activity?.id.startsWith('ext-') ?? false;
  const brief = activity
    ? activityBrief(activity, external ? undefined : activities?.fetchedAt, now)
    : null;
  const [tab, setTab] = useState<Tab>(activity ? 'prepare' : 'find');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ActivityWorkspaceFilter>('available');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'ai' | 'guide'>(signedIn ? 'ai' : 'guide');
  const [personal, setPersonal] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [draft, setDraft] = useState<Prep>(EMPTY);
  const [confirmed, setConfirmed] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ controller: AbortController; id: number } | null>(
    null,
  );
  const generation = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const useAi = mode === 'ai' && signedIn && available === true;
  const started = Object.values(draft).some((value) => value.trim());
  const quickQuestions = activity
    ? ['이 활동의 신청 기간과 준비할 것을 요약해 줘', '참여 목적을 준비하려면 어떤 정보를 정리해야 해?']
    : QUESTIONS;
  const visible = activityWorkspaceItems(all, {
    query,
    filter,
    saved: new Set(data.saved ?? []),
    now,
  });

  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/advisor', { signal: controller.signal })
      .then((r) => apiData<{ available: boolean }>(r))
      .then((r) => {
        if (!controller.signal.aborted) setAvailable(r.available === true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailable(false);
      });
    return () => {
      controller.abort();
      request.current?.controller.abort();
      generation.current += 1;
    };
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
      const reply = guideReply(
        q,
        personal ? data : null,
        { catalog, activities, schedule },
        now,
        activity && !external ? activity.id : undefined,
      );
      setTurns((prev) => [...prev.slice(-9), { question: q, reply }]);
      setQuestion('');
      return;
    }
    const id = ++generation.current,
      controller = new AbortController();
    request.current = { controller, id };
    setPending(true);
    try {
      const messages: AdvisorMessage[] = turns
        .filter((t) => t.reply.mode === 'ai')
        .slice(-2)
        .flatMap((t) => [
          { role: 'user' as const, content: t.question },
          { role: 'assistant' as const, content: t.reply.answer },
        ]);
      messages.push({ role: 'user', content: q });
      const response = await apiFetch(
        '/api/advisor',
        {
          method: 'POST',
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(35000),
          ]),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages,
            personal,
            ...(activity && !external ? { activityId: activity.id } : {}),
          }),
        },
        35000,
      );
      const reply = await apiData<AdvisorReply>(response);
      if (id !== generation.current) return;
      setTurns((prev) => [...prev.slice(-9), { question: q, reply }]);
      setQuestion('');
    } catch (caught) {
      if (id === generation.current && !controller.signal.aborted)
        setError(
          caught instanceof Error
            ? caught.message
            : '답변을 가져오지 못했어요.',
        );
    } finally {
      if (id === generation.current) {
        request.current = null;
        setPending(false);
      }
    }
  }
  async function copy() {
    if (!activity || !started) return;
    try {
      await navigator.clipboard.writeText(prepText(draft, activity));
      setCopyStatus('준비 내용을 복사했어요.');
    } catch {
      setCopyStatus('자동 복사하지 못했어요. 직접 선택해 복사해 주세요.');
    }
  }
  const steps = [
    ['학교 계정 연결', signedIn],
    ['활동 선택', !!activity],
    ['신청 내용 준비', started],
    ['내용 확인', confirmed],
  ] as const;
  const field = (
    key: keyof Prep,
    label: string,
    placeholder: string,
    rows = 3,
  ) => (
    <label>
      {label}
      <textarea
        aria-label={label}
        value={draft[key]}
        maxLength={1500}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft({ ...draft, [key]: e.target.value });
          setConfirmed(false);
          setCopyStatus('');
        }}
      />
    </label>
  );

  return (
    <section className="advisor-workspace" aria-labelledby="advisor-title">
      <header className="advisor-workspace-header">
        <div>
          <span className="eyebrow">
            <Sparkles size={15} /> AI 활동 워크스페이스
          </span>
          <h1 id="advisor-title">활동을 찾고, 신청 전까지 함께 준비해요</h1>
          <p>
            공개 정보를 정리하고 최종 접수는 학교 공식 화면에서 본인이 확인해요.
          </p>
        </div>
        <SchoolConnection
          signedIn={signedIn}
          onAccount={onSchoolAccount}
          onSignIn={onSignIn}
        />
      </header>
      <nav className="advisor-mobile-tabs" aria-label="AI 작업 화면">
        {(
          [
            ['find', '활동 찾기', Search],
            ['prepare', '신청 준비', ListTodo],
            ['chat', 'AI 상담', MessageCircle],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>
      <div className="advisor-workspace-grid">
        <aside
          className={`advisor-finder ${tab === 'find' ? 'is-mobile-active' : ''}`}
        >
          <div className="advisor-pane-title">
            <div>
              <span>ACTIVITIES</span>
              <h2>활동 찾기</h2>
            </div>
            <Search size={18} />
          </div>
          <label className="advisor-search">
            <Search size={16} />
            <input
              aria-label="활동 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="활동명·운영 부서 검색"
            />
          </label>
          <div className="advisor-filter">
            {(
              [
                ['available', '접수 중·예정'],
                ['saved', '관심 활동'],
                ['all', '전체'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="advisor-result-count">{visible.length}개 활동</p>
          <div className="advisor-activity-list">
            {visible.map((item) => {
              const status = liveStatus(item, now);
              return (
                <button
                  key={item.id}
                  aria-label={`${item.title} 선택`}
                  className="advisor-activity-item"
                  aria-current={activity?.id === item.id ? 'true' : undefined}
                  onClick={() => go(`advisor/${item.id}`)}
                >
                  <span className={`advisor-status-dot is-${status.status}`} />
                  <span>
                    <b>{item.title}</b>
                    <small>{item.dept}</small>
                    <small>
                      {status.label} · {date(item.applyEnd)}까지
                    </small>
                  </span>
                </button>
              );
            })}
            {!visible.length && (
              <p className="advisor-empty">조건에 맞는 활동이 없어요.</p>
            )}
          </div>
        </aside>
        <section
          className={`advisor-task ${tab === 'prepare' ? 'is-mobile-active' : ''}`}
        >
          <div className="advisor-pane-title">
            <div>
              <span>TASK</span>
              <h2>신청 준비</h2>
            </div>
            <ClipboardCheck size={19} />
          </div>
          <ol className="advisor-stepper">
            {steps.map(([label, done], index) => (
              <li key={label} className={done ? 'is-done' : ''}>
                <span>{done ? <Check size={13} /> : index + 1}</span>
                <small>{label}</small>
              </li>
            ))}
          </ol>
          {!activity || !brief ? (
            <div className="advisor-task-empty">
              <Search size={28} />
              <h3>준비할 활동을 선택해 주세요</h3>
              <p>
                접수 중인 비교과와 직접 등록한 대외활동을 함께 찾을 수 있어요.
              </p>
              <button className="primary" onClick={() => setTab('find')}>
                활동 찾기
              </button>
            </div>
          ) : (
            <>
              <article className="advisor-brief">
                <div className="advisor-brief-heading">
                  <span className="badge blue">
                    {external ? '직접 등록' : '학교 공개 공고'}
                  </span>
                  <span>
                    {brief.needsVerification
                      ? '최신 정보 확인 필요'
                      : `${date(brief.asOf)} 수집`}
                  </span>
                </div>
                <h3>{brief.title}</h3>
                <p>{brief.department}</p>
                <dl>
                  <div>
                    <dt>신청 마감</dt>
                    <dd>{date(brief.applicationEnd)}</dd>
                  </div>
                  <div>
                    <dt>운영 기간</dt>
                    <dd>
                      {date(brief.runStart)} ~ {date(brief.runEnd)}
                    </dd>
                  </div>
                  <div>
                    <dt>포인트</dt>
                    <dd>
                      {brief.points === null ? '확인 필요' : `${brief.points}P`}
                    </dd>
                  </div>
                </dl>
                <p className="advisor-boundary">
                  지원 자격·필수 서류·실시간 접수 여부는 공식 공고에서 확인해야
                  해요.
                </p>
              </article>
              <section className="advisor-prep-form">
                <div className="advisor-section-heading">
                  <div>
                    <small>APPLICATION NOTES</small>
                    <h3>신청 내용 정리</h3>
                  </div>
                  <span>{Object.values(draft).join('').length}/6000</span>
                </div>
                {field(
                  'purpose',
                  '참여 목적',
                  '이 활동에서 얻고 싶은 것을 적어 보세요.',
                )}
                {field(
                  'experience',
                  '관련 경험·강점',
                  '관련 수업, 프로젝트, 관심사를 적어 보세요.',
                )}
                {field(
                  'schedule',
                  '참여 가능 시간·일정',
                  '수업·시험 일정과 겹치는지 확인해 보세요.',
                  2,
                )}
                {field(
                  'notes',
                  '공식 화면에서 확인할 사항',
                  '자격, 서류, 모집 인원 등을 적어 보세요.',
                )}
                <button
                  className="secondary advisor-copy"
                  disabled={!started}
                  onClick={() => void copy()}
                >
                  <Copy size={15} />
                  준비 내용 복사
                </button>
                <button
                  className="secondary advisor-copy"
                  disabled={!started || pending}
                  onClick={() => {
                    const prompt = '내가 작성한 신청 메모야. 없는 경험을 추가하지 말고 참여 목적을 다듬을 점을 알려 줘.\n';
                    setQuestion((prompt + prepText(draft, activity)).slice(0, 600));
                    setTab('chat');
                    window.requestAnimationFrame(() => input.current?.focus());
                  }}
                >
                  <MessageCircle size={15} /> 이 메모로 상담하기
                </button>
                {copyStatus && <output className="meta">{copyStatus}</output>}
              </section>
              <section className="advisor-review">
                <h3>최종 확인</h3>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={!started}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    내용을 검토했고, 자격·서류·접수 완료는 공식 화면에서 직접
                    확인할게요.
                  </span>
                </label>
                {activity.url ? (
                  <a
                    className={`primary advisor-handoff${confirmed ? '' : ' is-disabled'}`}
                    href={confirmed ? activity.url : undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!confirmed}
                    onClick={(e) => {
                      if (!confirmed) e.preventDefault();
                    }}
                  >
                    {external
                      ? '출처 사이트로 이동'
                      : '학교 공식 신청 화면으로 이동'}{' '}
                    <ArrowUpRight size={16} />
                  </a>
                ) : (
                  <p className="advisor-no-link">등록된 신청 링크가 없어요.</p>
                )}
                <p className="meta">
                  이 도우미는 신청서를 자동 제출하지 않으며, 링크를 연 것만으로
                  접수 상태가 바뀌지 않아요.
                </p>
              </section>
            </>
          )}
        </section>
        <aside
          className={`advisor-chat ${tab === 'chat' ? 'is-mobile-active' : ''}`}
        >
          <div className="advisor-pane-title">
            <div>
              <span>ASSISTANT</span>
              <h2>AI 학사 상담</h2>
            </div>
            <Sparkles size={18} />
          </div>
          <fieldset className="advisor-mode">
            <legend className="sr-only">답변 방식</legend>
            <button
              aria-pressed={useAi}
              disabled={!signedIn || available !== true}
              onClick={() => {
                clear();
                setMode('ai');
              }}
            >
              AI 상담
            </button>
            <button
              aria-pressed={!useAi}
              onClick={() => {
                clear();
                setMode('guide');
              }}
            >
              기본 안내
            </button>
          </fieldset>
          <p className="advisor-ai-state">
            {!signedIn
              ? '학교 계정을 연결하면 AI 상담을 쓸 수 있어요.'
              : available === null
                ? 'AI 연결을 확인하고 있어요…'
                : available === false
                  ? 'AI를 쓸 수 없어 기본 안내로 도와드려요.'
                  : '활동 준비와 일반 학사 질문을 물어보세요.'}
          </p>
          <label className="advisor-consent">
            <input
              type="checkbox"
              checked={personal}
              disabled={pending}
              onChange={(e) => {
                clear();
                setPersonal(e.target.checked);
              }}
            />
            내 학사 요약 참고
          </label>
          <p className="advisor-privacy">
            AI 상담은 질문·최근 AI 대화와 선택 시 학과·이수·포인트 요약을
            Cloudflare Workers AI에 보내요. 학교 인증 정보는 이 요약에 포함하지
            않으며 대화는 서버에 저장하지 않아요. 질문에 학번·비밀번호를 직접
            입력하지 마세요.
          </p>
          <div className="advisor-conversation" role="log" aria-live="polite">
            {!turns.length && (
              <p className="advisor-chat-welcome">
                {activity
                  ? `${activity.title}을(를) 준비하며 궁금한 것을 물어보세요.`
                  : '졸업 요건, 학기 계획, 활동 탐색을 물어보세요.'}
              </p>
            )}
            {turns.map((turn, i) => (
              <article className="advisor-turn" key={i}>
                <p className="advisor-question">{turn.question}</p>
                <div className="answer">
                  <b>{turn.reply.mode === 'ai' ? 'AI 답변' : '기본 안내'}</b>
                  <p className="advisor-answer-text">{turn.reply.answer}</p>
                  {activity && (
                    <button
                      className="link"
                      onClick={() => {
                        setDraft((d) => ({
                          ...d,
                          notes: turn.reply.answer.slice(0, 1500),
                        }));
                        setConfirmed(false);
                        setTab('prepare');
                      }}
                    >
                      확인할 사항에 가져오기
                    </button>
                  )}
                  <ul className="advisor-sources">
                    {turn.reply.sources.map((s) => (
                      <li key={s.label + s.route}>
                        <button className="link" onClick={() => go(s.route)}>
                          {s.label} →
                        </button>
                        {s.asOf && <span>{date(s.asOf)} 기준</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
            {pending && (
              <p className="advisor-thinking">답변을 정리하고 있어요…</p>
            )}
          </div>
          <div className="advisor-chips">
            {quickQuestions.map((q) => (
              <button
                key={q}
                disabled={pending}
                onClick={() => {
                  setQuestion(q);
                  void ask(q);
                }}
              >
                {q}
              </button>
            ))}
          </div>
          <form
            className="advisor-form"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <textarea
              ref={input}
              aria-label="궁금한 점"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={600}
              disabled={pending}
              placeholder="AI에게 질문해 보세요"
            />
            <div>
              <span>{question.length}/600</span>
              <button type="button" aria-label="대화 지우기" onClick={clear}>
                <RotateCcw size={15} />
              </button>
              <button
                className="primary"
                aria-label="질문 보내기"
                disabled={pending || !question.trim()}
              >
                <Send size={16} />
              </button>
            </div>
          </form>
          {error && (
            <div className="advisor-error" role="alert">
              <p>{error}</p>
              <button className="secondary" onClick={() => void ask(question)}>
                다시 시도
              </button>
              <button
                className="link"
                onClick={() => {
                  clear();
                  setMode('guide');
                  input.current?.focus();
                }}
              >
                기본 안내로 전환
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
