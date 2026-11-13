'use client';
import { useState } from 'react';
import { ArrowRight, Check, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Logo } from './logo';
import type { SchoolSnapshot } from '@/lib/server/school';
import { apiData, apiFetch, ApiRequestError } from '@/lib/data/api';
import { useSlowLoading } from './use-slow-loading';

export type Profile = {
  name: string;
  year: string;
  dept: string;
  credits: string;
  points: string;
  saved: string[];
  planned: string[];
  /** 시간표 시나리오 A/B/C — 키 → 카탈로그 section.id 배열 */
  plans?: Record<string, string[]>;
  completed: {
    code: string;
    name: string;
    category: string;
    credits: number;
  }[];
  ruleOverrides: Record<string, number>;
  events: { title: string; date: string }[];
  prefs: string[];
  /** 비교과·대외활동 취향 설문 답변 */
  actPrefs?: string[];
  /** 학습 고민 설문 답변 (PAIN_QUESTIONS 순서) */
  painPrefs?: string[];
  readIds: string[];
  consent: boolean;
  semester?: string;
  graduationTarget?: string;
  onboardingStep?: number;
  /** 수업 현황 수동 매칭 보정 — LMS course.id → 카탈로그 section.id 또는 'ignore' */
  lmsMatch?: Record<string, string>;
  /** 프로필 리비전 — 서버가 저장할 때 +1 (동시 기기 충돌 감지) */
  rev?: number;
};
export type Account = {
  sessionContext: string;
  profile: Partial<Profile>;
  snapshot: SchoolSnapshot;
  onboarded: boolean;
  studentMask: string;
};
function AuthIntro({ compactOnMobile = false }: { compactOnMobile?: boolean }) {
  return (
    <aside
      className={`auth-intro${compactOnMobile ? ' auth-intro--onboarding' : ''}`}
    >
      <div className="auth-brand">
        <span className="auth-brand-mark">
          <Logo size={52} />
        </span>
        <span>학사부기</span>
      </div>
      <div className="auth-intro-copy">
        <h1>
          졸업까지,
          <br />
          <strong>한곳에서</strong> 확인하세요.
        </h1>
        <p>
          졸업 요건, 수업 일정, 학사 정보를{' '}
          <br />한 번에 관리할 수 있는{' '}
          <br />
          한성대학교 학생 지원 서비스입니다.
        </p>
      </div>
      {/* eslint-disable-next-line next/no-img-element -- bundled decorative asset; next/image is unavailable */}
      <img
        className="auth-owl"
        src="/illustrations/academic-owl.png"
        alt=""
        width="329"
        height="193"
      />
    </aside>
  );
}



export function SignIn({
  onAuthenticated,
  onDemo,
  notice,
}: {
  onAuthenticated: (account: Account) => void;
  onDemo: () => void;
  notice?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [showPassword, setShowPassword] = useState(false);
  const slowLogin = useSlowLoading(busy);

  function toggleMode() {
    setError('');
    setShowPassword(false);
    setMode((current) => (current === 'signup' ? 'login' : 'signup'));
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <AuthIntro />
        <section className="auth-panel auth-signin-panel">
        {mode === 'login' && <span className="auth-step-label">다시 만나 반가워요</span>}
        <h1>
          학교 계정으로
          <br />
          간편하게 시작해요
        </h1>
        <p>
          학사 정보와 수업을 한곳에서 확인하고
          <br />
          나에게 맞는 다음 학기를 준비하세요.
        </p>
        {notice && (
          <div className="auth-error" role="alert">
            <p>{notice}</p>
            <button type="button" className="link" onClick={() => location.reload()}>다시 확인</button>
          </div>
        )}
        <form
          className="auth-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            const form = e.currentTarget;
            const fields = new FormData(form);
            try {
              const response = await apiFetch('/api/account/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  studentId: fields.get('studentId'),
                  password: fields.get('password'),
                  agreed: fields.get('agreement') === 'on',
                }),
              }, 60000);
              const password = form.elements.namedItem(
                'password',
              ) as HTMLInputElement;
              password.value = '';
              const result = await apiData<Account>(response);
              onAuthenticated(result);
            } catch (error) {
              setError(
                error instanceof ApiRequestError && error.code === 'TIMEOUT'
                  ? '학교 로그인 응답이 늦어 완료 여부를 확인하지 못했어요. 잠시 후 페이지를 새로고침해 로그인 상태를 확인해 주세요.'
                  : error instanceof ApiRequestError
                  ? error.message
                  : '연결이 끊겼습니다. 잠시 후 다시 시도해 주세요.',
              );
            } finally {
              const passwordField = form.elements.namedItem(
                'password',
              ) as HTMLInputElement | null;
              if (passwordField) passwordField.value = '';
              fields.delete('password');
              setShowPassword(false);
              setBusy(false);
            }
          }}
        >
          <label>
            한성대학교 학번
            <input
              name="studentId"
              inputMode="numeric"
              autoComplete="username"
              pattern="[0-9]{6,10}"
              maxLength={10}
              required
              placeholder="학번을 입력하세요"
              disabled={busy}
            />
          </label>
          <div className="auth-password-field">
            <label htmlFor="school-password">학교 계정 비밀번호</label>
            <div className="auth-password-input">
              <input
                id="school-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                maxLength={128}
                required
                placeholder="종합정보시스템 비밀번호"
                disabled={busy}
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                aria-pressed={showPassword}
                aria-controls="school-password"
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={busy}
              >
                {showPassword ? (
                  <EyeOff size={19} aria-hidden="true" />
                ) : (
                  <Eye size={19} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          <details className="auth-note">
            <summary>어떤 정보를 연결하나요?</summary>
            <p>
              학교 로그인 확인과 함께 코스모스의 강의명·강의 링크와
              종합정보시스템의 이수 과목·비교과 포인트·소속·입학연도·조회 시각을
              가져옵니다. 이 정보와 입력한 프로필·선호·계획을 계정에 보관합니다.
              비밀번호는 학교 인증 요청에만 사용하고 저장하지 않습니다. 학교
              세션 쿠키는 비밀번호 재입력 없이 다시 조회할 수 있도록 암호화해
              최대 2시간만 보관하고, 로그아웃하거나 계정을 삭제하면 즉시
              지웁니다. 가입한 계정은 다음 로그인에도 이어지며, 설정에서 연결
              정보와 계정 자료를 삭제할 수 있습니다.
            </p>
          </details>
          <label>
            <input name="agreement" type="checkbox" required disabled={busy} />
            <span>
              학교 인증 및 강의·학사 정보 조회·계정 보관(암호화된 학교 세션
              최대 2시간 포함)에 동의해요. 동의하지 않으면 연결 없이 체험할 수
              있어요.
            </span>
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {slowLogin && (
            <p className="meta" aria-live="polite">
              학교 응답이 평소보다 오래 걸리고 있어요. 연결을 확인 중이니 잠시만 기다려 주세요.
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? '학교 정보를 확인하고 있어요…'
              : mode === 'signup'
                ? '동의하고 시작하기'
                : '로그인'}{' '}
            {!busy && <ArrowRight size={18} />}
          </button>
        </form>
        <div className="auth-actions auth-links">
          <button
            className="link"
            disabled={busy}
            onClick={toggleMode}
          >
            {mode === 'signup' ? '이미 가입했어요' : '처음 이용해요'}
          </button>
          <button className="link" disabled={busy} onClick={onDemo}>
            연결 없이 둘러보기
          </button>
        </div>
        <p className="meta">
          한성대학교 공식 서비스가 아닌 개인 학사 도우미입니다.
        </p>
        </section>
      </div>
    </div>
  );
}
const questions = [
  [
    '이번 학기 가장 중요한 목표는요?',
    '졸업요건 충족',
    '전공 심화',
    '진로 탐색',
    '일정 여유',
  ],
  ['수업은 언제 듣는 게 좋나요?', '오전', '오후', '상관없음'],
  ['수업이 어려운 요일이 있나요?', '없음', '월요일', '금요일'],
  ['어떤 수업 방식을 좋아하나요?', '이론', '실습', '프로젝트', '상관없음'],
  ['선호하는 평가 방식은요?', '시험', '개인 과제', '팀 프로젝트', '상관없음'],
  ['어떤 시간표를 만들고 싶나요?', '공강일 확보', '고른 배치', '상관없음'],
];
export function Onboarding({
  profile,
  onSave,
  onReturnToLogin,
}: {
  profile: Profile;
  onSave: (profile: Profile, complete: boolean) => Promise<boolean>;
  onReturnToLogin: () => void;
}) {
  const [stage, setStage] = useState(
      profile.onboardingStep === 1 ? 2 : profile.onboardingStep || 0,
    ),
    [draft, setDraft] = useState(profile),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  // 0 기본 정보 → 2..7 수업 성향 설문(기존 저장 인덱스 유지)
  const TOTAL = 8;
  const visibleStep = stage === 0 ? 1 : stage;
  const VISIBLE_TOTAL = 7;
  async function advance(next: Profile, complete = false) {
    setBusy(true);
    setError('');
    if (
      await onSave(
        {
          ...next,
          onboardingStep: complete ? TOTAL : stage === 0 ? 2 : stage + 1,
        },
        complete,
      )
    ) {
      setDraft(next);
      if (!complete) setStage(stage === 0 ? 2 : stage + 1);
    } else
      setError('저장하지 못했습니다. 입력은 유지됩니다. 다시 시도해 주세요.');
    setBusy(false);
  }
  return (
    <div className="auth-page">
      <button
        type="button"
        className="auth-brand"
        aria-label="처음 로그인 화면으로 돌아가기"
        onClick={onReturnToLogin}
        disabled={busy}
      >
        <Logo /> 한성 학사 도우미
      </button>
      <section className="auth-panel">
        <progress
          className="auth-progress"
          aria-label={`초기 설정 ${visibleStep}/${VISIBLE_TOTAL}`}
          value={visibleStep}
          max={VISIBLE_TOTAL}
        />
        <span className="auth-step-label">
          {stage === 0
            ? '02 · 기본 정보'
            : '03 · 수업 성향 ' + (stage - 1) + '/6'}
        </span>
        <h1>
          {stage === 0 ? (
            <>
              어떤 대학 생활을
              <br />
              하고 있나요?
            </>
          ) : (
            questions[stage - 2][0]
          )}
        </h1>
        <p>
          {stage === 0
            ? '학교 계정 연결을 마쳤어요. 필요한 기본 정보만 알려주세요.'
            : '설문은 선택 사항이에요. 답변은 내 정보에서 언제든 바꿀 수 있어요.'}
        </p>
        {stage === 0 ? (
          <form
            className="auth-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              await advance({
                ...draft,
                name: fields.get('name') as string,
                year: fields.get('year') as string,
                dept: fields.get('dept') as string,
                semester: fields.get('semester') as string,
                graduationTarget: fields.get('graduationTarget') as string,
              });
            }}
          >
            <label>
              어떻게 불러드릴까요?
              <input
                name="name"
                required
                maxLength={30}
                defaultValue={draft.name === '한성인' ? '' : draft.name}
                placeholder="이름 또는 별명"
                disabled={busy}
              />
            </label>
            <label>
              입학연도
              <input
                name="year"
                type="number"
                min="1990"
                max="2100"
                required
                defaultValue={draft.year || ''}
                placeholder="예: 2025"
                disabled={busy}
              />
            </label>
            <label>
              학과·학부
              <input
                name="dept"
                maxLength={80}
                defaultValue={draft.dept === '소속 미입력' ? '' : draft.dept}
                placeholder="소속을 입력하세요 (선택)"
                disabled={busy}
              />
            </label>
            <label>
              현재 이수학기
              <select
                name="semester"
                defaultValue={draft.semester || ''}
                disabled={busy}
              >
                <option value="">선택하지 않음</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={String(i + 1)}>
                    {i + 1}학기
                  </option>
                ))}
              </select>
            </label>
            <label>
              목표 졸업학기
              <input
                name="graduationTarget"
                maxLength={30}
                defaultValue={draft.graduationTarget || ''}
                placeholder="예: 2029학년도 2학기 (선택)"
                disabled={busy}
              />
            </label>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? '저장 중…' : '다음 — 수업 성향'}
              <ArrowRight size={18} />
            </button>
          </form>
        ) : (
          <>
            <div className="onboarding-options">
              {questions[stage - 2].slice(1).map((option) => (
                <button
                  key={option}
                  className="onboarding-option"
                  aria-pressed={draft.prefs[stage - 2] === option}
                  disabled={busy}
                  onClick={() => {
                    const prefs = Array.from(
                      { length: 6 },
                      (_, i) => draft.prefs[i] || '',
                    );
                    prefs[stage - 2] = option;
                    setDraft({ ...draft, prefs });
                  }}
                >
                  <span className="option-label">{option}</span>
                  <span className="option-check" aria-hidden="true">
                    {draft.prefs[stage - 2] === option && (
                      <Check size={14} strokeWidth={2.5} />
                    )}
                  </span>
                </button>
              ))}
            </div>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <div className="auth-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setStage(stage === 2 ? 0 : stage - 1)}
              >
                <ArrowLeft size={17} />
                이전
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => advance(draft, stage === 7)}
              >
                {busy ? '저장 중…' : stage === 7 ? '내 학사 홈으로' : '다음'}
                <ArrowRight size={17} />
              </button>
            </div>
            <button
              className="link"
              disabled={busy}
              onClick={() => advance(draft, true)}
            >
              설문은 나중에 할게요
            </button>
          </>
        )}
      </section>
    </div>
  );
}
