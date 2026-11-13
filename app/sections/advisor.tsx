'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Compass,
  MessageCircle,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Target,
} from 'lucide-react';
import type { Data } from './data';
import { useActivities, useSchedule, useNow } from './catalog';
import { SchoolConnection } from './school-connection';
import type { Account } from '../account-flow';
import type { Catalog } from '@/lib/data/catalog';
import { apiData, apiFetch, ApiRequestError } from '@/lib/data/api';
import {
  guideReply,
  SERVICE_GUIDES,
  type AdvisorMessage,
  type AdvisorReply,
} from '@/lib/data/advisor';
import { advisorQuestionAllowed, ADVISOR_SCOPE_MESSAGE } from '@/lib/data/advisor-policy';
import {
  extToActivity,
  liveStatus,
} from '@/lib/data/activities';
import {
  activityBrief,
  activityDigest,
  activityWorkspaceItems,
  type ActivityWorkspaceFilter,
} from '@/lib/data/activity-assistant';
import {
  CASE_LABEL,
  COMPETENCY_GOALS,
  recommendActivities,
} from '@/lib/data/activity-recommend';

type Turn = { question: string; reply: AdvisorReply };
type Tab = 'goals' | 'recs' | 'chat';
const QUESTIONS = [
  '시간표에 과목을 어떻게 담나요?',
  '과제와 마감은 어디서 확인하나요?',
  '졸업요건 화면은 어떻게 보나요?',
  '비교과 AI 추천은 어떻게 사용하나요?',
];
const date = (value: string | null | undefined) =>
  value ? value.slice(0, 10).replaceAll('-', '.') : '확인 필요';

export function Advisor({
  data,
  catalog,
  go,
  signedIn,
  activityId,
  purpose = 'service',
  onSchoolAccount,
  onSignIn,
  onSaveGoals,
}: {
  data: Data;
  catalog: Catalog | null;
  go: (route: string) => void;
  signedIn: boolean;
  activityId?: string;
  purpose?: 'service' | 'activity';
  onSchoolAccount?: (account: Account) => void;
  onSignIn?: () => void;
  onSaveGoals?: (goals: string[]) => void;
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
  const application = purpose === 'activity';
  const activity = application ? all.find((item) => item.id === activityId) : undefined;
  const external = activity?.id.startsWith('ext-') ?? false;
  const brief = activity
    ? activityBrief(activity, external ? undefined : activities?.fetchedAt, now)
    : null;
  const [tab, setTab] = useState<Tab>('recs');
  const [browse, setBrowse] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ActivityWorkspaceFilter>('available');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [dailyOut, setDailyOut] = useState(false);
  const [mode, setMode] = useState<'ai' | 'guide'>(signedIn ? 'ai' : 'guide');
  const [personal, setPersonal] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ controller: AbortController; id: number } | null>(
    null,
  );
  const generation = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const useAi = mode === 'ai' && signedIn && available === true;
  // 전체 일일 한도 소진 시 AI 입력을 막는다 — 기본 안내 모드는 막지 않는다.
  const aiBlocked = useAi && dailyOut;
  const digest = activityDigest(data, activities, now);
  const goals = data.actGoals ?? [];
  const recs = useMemo(
    () =>
      recommendActivities(all, {
        points: digest.points,
        requiredPoints: digest.requiredPoints,
        goals: data.actGoals ?? [],
        prefs: data.actPrefs ?? [],
        stages: data.actStatus ?? {},
        now,
        limit: 10,
      }),
    [all, digest.points, digest.requiredPoints, data.actGoals, data.actPrefs, data.actStatus, now],
  );
  const quickQuestions = activity
    ? ['이 활동을 요약해 줘', '이 활동이 내 목표와 어떻게 맞는지 알려줘']
    : application
      ? ['추천 기준은 어떻게 정해지나요?', '포인트가 부족하면 어떤 활동이 좋나요?']
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
      .then((r) =>
        apiData<{ available: boolean; dailyExhausted?: boolean }>(r),
      )
      .then((r) => {
        if (!controller.signal.aborted) {
          setAvailable(r.available === true);
          setDailyOut(r.dailyExhausted === true);
        }
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
    if (!q || q.length > 600 || request.current || aiBlocked) return;
    setError('');
    if (!advisorQuestionAllowed(q)) {
      setError(ADVISOR_SCOPE_MESSAGE);
      return;
    }
    if (!useAi) {
      const reply = guideReply(
        q,
        personal ? data : null,
        { catalog, activities, schedule, ...(activity && external ? { selectedActivity: activity } : {}) },
        now,
        activity?.id,
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
            purpose,
            ...(activity ? { activityId: activity.id } : {}),
          }),
        },
        35000,
      );
      const reply = await apiData<AdvisorReply>(response);
      if (id !== generation.current) return;
      setTurns((prev) => [...prev.slice(-9), { question: q, reply }]);
      setQuestion('');
    } catch (caught) {
      if (id === generation.current && !controller.signal.aborted) {
        if (
          caught instanceof ApiRequestError &&
          caught.code === 'DAILY_QUOTA'
        )
          setDailyOut(true);
        setError(
          caught instanceof Error
            ? caught.message
            : '답변을 가져오지 못했어요.',
        );
      }
    } finally {
      if (id === generation.current) {
        request.current = null;
        setPending(false);
      }
    }
  }
  function toggleGoal(id: string) {
    const next = goals.includes(id)
      ? goals.filter((g) => g !== id)
      : [...goals, id];
    onSaveGoals?.(next);
  }
  function summarize() {
    const q = '이 활동을 요약해 줘';
    setQuestion(q);
    setTab('chat');
    void ask(q);
  }

  return (
    <section className={`advisor-workspace${application ? '' : ' advisor-service'}`} aria-labelledby="advisor-title">
      <header className="advisor-workspace-header">
        <div>
          {application && <button className="link advisor-back" onClick={() => go('activities')}>비교과·대외활동으로 돌아가기</button>}
          <span className="eyebrow">
            <Sparkles size={15} /> {application ? 'AI에게 추천받기' : '서비스 이용 안내'}
          </span>
          <h1 id="advisor-title">{application ? '내 포인트와 목표에 맞는 활동을 골라드려요' : '학사부기, 이렇게 사용해 보세요'}</h1>
          <p>
            {application ? '추천은 공개 목록과 입력한 조건 기준이에요. 실제 지원 자격·서류·접수는 공식 공고에서 확인해요.' : '기능을 찾고 사용하는 방법이 궁금할 때, 이용 도우미에게 물어보세요.'}
          </p>
        </div>
        {application ? <SchoolConnection
          signedIn={signedIn}
          onAccount={onSchoolAccount}
          onSignIn={onSignIn}
        /> : <button className="secondary" onClick={() => go('settings')}>내 연결 상태 확인 <ArrowRight size={15} /></button>}
      </header>
      {application && <nav className="advisor-mobile-tabs" aria-label="AI 작업 화면">
        {(
          [
            ['goals', '추천 조건', Target],
            ['recs', '추천 활동', Compass],
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
      </nav>}
      <div className="advisor-workspace-grid">
        {!application && <section className="advisor-service-guides" aria-labelledby="advisor-guide-title">
          <div className="advisor-service-guide-heading"><span className="eyebrow">서비스 가이드</span><h2 id="advisor-guide-title">어떤 기능이 궁금하세요?</h2><p>궁금한 기능을 고르면 사용 방법을 안내해 드려요.</p></div>
          <div className="advisor-service-topics">{SERVICE_GUIDES.map((guide, i) => <button key={guide.route + guide.label} onClick={() => { const q = `${guide.label} 기능은 어떻게 사용하나요?`; setQuestion(q); void ask(q); }} disabled={pending}><span className="advisor-topic-index">{String(i + 1).padStart(2, '0')}</span><span><b>{guide.label}</b><small>사용 방법 알아보기</small></span><ArrowRight size={16} aria-hidden="true" /></button>)}</div>
          <div className="advisor-service-application"><Sparkles size={19} aria-hidden="true" /><div><h3>어떤 활동이 나에게 맞을지 궁금한가요?</h3><p>비교과·대외활동에서 포인트와 목표 역량으로 맞춤 추천을 받아 보세요.</p><button className="link" onClick={() => go('activities/recommend')}>AI에게 추천받기 <ArrowRight size={14} /></button></div></div>
        </section>}
        {application && <><aside
          className={`advisor-finder ${tab === 'goals' ? 'is-mobile-active' : ''}`}
        >
          <div className="advisor-pane-title">
            <div>
              <span>GOALS</span>
              <h2>추천 조건</h2>
            </div>
            <Target size={18} />
          </div>
          <div className="advisor-goal-card">
            <small>누적 비교과 포인트</small>
            <b>
              {digest.points === null
                ? '미입력'
                : `${digest.points}P${digest.requiredPoints !== null ? ` / ${digest.requiredPoints}P` : ''}`}
            </b>
            <span>
              {digest.requiredPoints === null
                ? '입학 구분·졸업 기준을 확인하면 부족 포인트를 계산해요.'
                : digest.remainingPoints !== null && digest.remainingPoints > 0
                  ? `졸업까지 ${digest.remainingPoints}P 남았어요. 포인트 활동을 우선 추천해요.`
                  : '졸업 포인트 기준을 채웠어요.'}
            </span>
            <button className="link" onClick={() => go('graduation')}>
              졸업요건에서 포인트 확인 →
            </button>
          </div>
          <fieldset className="advisor-goals" aria-label="키우고 싶은 역량">
            <legend>키우고 싶은 역량</legend>
            <p>고른 역량에 맞는 활동을 우선 추천해요. 여러 개 고를 수 있어요.</p>
            <div className="advisor-goal-chips">
              {COMPETENCY_GOALS.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  aria-pressed={goals.includes(goal.id)}
                  title={goal.hint}
                  onClick={() => toggleGoal(goal.id)}
                >
                  {goal.label}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="advisor-goals-note">
            추천은 공개 목록의 제목·운영 기관 정보로 근사해요. 실제 역량 인정은
            학교 기준을 따릅니다.
            <button className="link" onClick={() => go('survey')}>
              취향 설문 수정 →
            </button>
          </p>
        </aside>
        <section
          className={`advisor-task ${tab === 'recs' ? 'is-mobile-active' : ''}`}
        >
          <div className="advisor-pane-title">
            <div>
              <span>RECOMMENDED</span>
              <h2>추천 활동</h2>
            </div>
            <Compass size={19} />
          </div>
          {activity && brief && (
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
              <div className="advisor-brief-actions">
                <button className="primary" onClick={summarize} disabled={pending}>
                  <Sparkles size={15} /> AI에게 이 활동 요약받기
                </button>
                {activity.url && (
                  <a
                    className="secondary"
                    href={activity.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    공식 공고 보기 <ArrowUpRight size={15} />
                  </a>
                )}
                <button
                  className="link"
                  onClick={() => go(`activities/${activity.id}`)}
                >
                  활동 상세 보기 →
                </button>
              </div>
            </article>
          )}
          <fieldset className="advisor-rec-toggle" aria-label="활동 목록 방식">
            <legend className="sr-only">활동 목록 방식</legend>
            <button aria-pressed={!browse} onClick={() => setBrowse(false)}>
              맞춤 추천
            </button>
            <button aria-pressed={browse} onClick={() => setBrowse(true)}>
              직접 찾기
            </button>
          </fieldset>
          {browse ? (
            <>
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
                      onClick={() => go(`activities/recommend/${item.id}`)}
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
            </>
          ) : (
            <>
              <p className={`advisor-case is-${recs.case}`}>
                <b>{CASE_LABEL[recs.case].title}</b>
                {CASE_LABEL[recs.case].hint}
              </p>
              <p className="advisor-result-count">추천 {recs.results.length}개{recs.matched > recs.results.length ? ` · 조건 일치 ${recs.matched}개` : ''}</p>
              <div className="advisor-activity-list">
                {recs.results.map(({ activity: item, reasons }) => {
                  const status = liveStatus(item, now);
                  return (
                    <button
                      key={item.id}
                      aria-label={`${item.title} 선택`}
                      className="advisor-activity-item advisor-rec-item"
                      aria-current={activity?.id === item.id ? 'true' : undefined}
                      onClick={() => go(`activities/recommend/${item.id}`)}
                    >
                      <span className={`advisor-status-dot is-${status.status}`} />
                      <span>
                        <b>{item.title}</b>
                        <small>{item.dept}</small>
                        <small>
                          {status.label}
                          {status.dday && status.dday !== status.label
                            ? ` · ${status.dday}`
                            : ''}
                          {' · '}
                          {item.points === null ? '포인트 확인 필요' : `${item.points}P`}
                        </small>
                        <span className="advisor-rec-reasons">
                          {reasons.map((reason) => (
                            <span key={reason}>{reason}</span>
                          ))}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {!recs.results.length && (
                  <p className="advisor-empty">
                    조건에 맞는 추천이 없어요. ‘직접 찾기’에서 전체 목록을
                    확인하거나 추천 조건을 바꿔 보세요.
                  </p>
                )}
              </div>
            </>
          )}
        </section></>}
        <aside
          className={`advisor-chat ${!application || tab === 'chat' ? 'is-mobile-active' : ''}`}
        >
          <div className="advisor-pane-title">
            <div>
              <span>ASSISTANT</span>
              <h2>{application ? 'AI 추천 도우미' : '서비스 이용 도우미'}</h2>
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
                : mode === 'ai' && dailyOut
                  ? '오늘의 AI 상담 이용량이 모두 찼어요. 내일 다시 이용할 수 있어요.'
                : available === false
                  ? 'AI를 쓸 수 없어 기본 안내로 도와드려요.'
                  : application ? '추천 이유와 선택한 활동의 공고 요약을 물어보세요.' : '학사부기 기능과 사용 방법을 물어보세요.'}
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
            AI 상담은 질문·최근 AI 대화{application ? '·선택한 활동 정보' : ''}와 동의 시 학과·입학연도·이수·포인트 요약·계획 과목명·과제와 강의 마감 정보를
            Cloudflare Workers AI에 보내요. 학교 인증 정보는 이 요약에 포함하지
            않으며 대화는 서버에 저장하지 않아요. 질문에 학번·비밀번호를 직접
            입력하지 마세요.
          </p>
          <div className="advisor-conversation" role="log" aria-live="polite">
            {!turns.length && (
              <p className="advisor-chat-welcome">
                {activity
                  ? `${activity.title}이(가) 궁금하면 요약이나 추천 이유를 물어보세요.`
                  : application ? '목표 역량을 고르고 추천 활동을 눌러 보세요. 활동 요약을 알려드려요.' : '시간표 담기, 과제 확인, 졸업요건 화면 이용 등 궁금한 사용 방법을 물어보세요.'}
              </p>
            )}
            {turns.map((turn, i) => (
              <article className="advisor-turn" key={i}>
                <p className="advisor-question">{turn.question}</p>
                <div className="answer">
                  <b>{turn.reply.mode === 'ai' ? 'AI 답변' : '기본 안내'}</b>
                  <p className="advisor-answer-text">{turn.reply.answer}</p>
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
          {aiBlocked && (
            <div className="advisor-error" role="alert">
              <p>오늘의 AI 상담 이용량이 모두 찼어요. 내일 다시 이용하거나 지금은 기본 안내를 써 주세요.</p>
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
          <div className="advisor-chips">
            {quickQuestions.map((q) => (
              <button
                key={q}
                disabled={pending || aiBlocked}
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
              disabled={pending || aiBlocked}
              placeholder={
                aiBlocked
                  ? '오늘의 AI 상담 이용량이 모두 찼어요'
                  : 'AI에게 질문해 보세요'
              }
            />
            <div>
              <span>{question.length}/600</span>
              <button type="button" aria-label="대화 지우기" onClick={clear}>
                <RotateCcw size={15} />
              </button>
              <button
                className="primary"
                aria-label="질문 보내기"
                disabled={pending || aiBlocked || !question.trim()}
              >
                <Send size={16} />
              </button>
            </div>
          </form>
          {error && (
            <div className="advisor-error" role="alert">
              <p>{error}</p>
              {error !== ADVISOR_SCOPE_MESSAGE && <><button className="secondary" onClick={() => void ask(question)}>
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
              </button></>}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
