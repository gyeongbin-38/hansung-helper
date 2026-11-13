'use client';

import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  Clock3,
  Compass,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Data } from './data';
import { ACT_QUESTIONS, questions } from './data';
import '../styles/survey.css';

type SurveyAnswers = {
  prefs: string[];
  actPrefs: string[];
  surveyStatus: 'in-progress' | 'completed' | 'skipped';
};

type SurveyPageProps = {
  data: Pick<Data, 'prefs' | 'actPrefs' | 'surveyStatus'>;
  onSave: (answers: SurveyAnswers) => Promise<boolean>;
  onExit: () => void;
};

const allQuestions = [
  ...questions.map((question, index) => ({
    question,
    index,
    section: 'course' as const,
  })),
  ...ACT_QUESTIONS.map((question, index) => ({
    question,
    index,
    section: 'activities' as const,
  })),
];

function normalizedAnswers(source: string[] | undefined, length: number) {
  return Array.from({ length }, (_, index) => source?.[index] ?? '');
}

function SurveyFrame({
  titleId,
  busy,
  onClose,
  children,
}: {
  titleId: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="survey-overlay"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="survey-frame">
        <div className="survey-close-bar">
          <button
            type="button"
            className="survey-close icon"
            aria-label="설문 닫기"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function SurveyMascot() {
  return (
    // eslint-disable-next-line next/no-img-element -- reuse the bundled service mascot
    <img
      className="survey-mascot"
      src="/illustrations/academic-owl.png"
      width="636"
      height="220"
      alt="학사부기 부엉이 마스코트"
    />
  );
}

export function SurveyPage({ data, onSave, onExit }: SurveyPageProps) {
  const [view, setView] = useState<'intro' | 'question'>('intro');
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState(() =>
    normalizedAnswers(data.prefs, questions.length),
  );
  const [actPrefs, setActPrefs] = useState(() =>
    normalizedAnswers(data.actPrefs, ACT_QUESTIONS.length),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  const answeredCount = [...prefs, ...actPrefs].filter(Boolean).length;
  const hasProgress = answeredCount > 0;
  const current = allQuestions[step];
  const currentValue =
    current.section === 'course'
      ? prefs[current.index]
      : actPrefs[current.index];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step, view]);

  function begin() {
    const firstEmpty = [...prefs, ...actPrefs].findIndex((answer) => !answer);
    setStep(
      data.surveyStatus === 'completed' || firstEmpty === -1 ? 0 : firstEmpty,
    );
    setError('');
    setView('question');
  }

  function selectAnswer(value: string) {
    setError('');
    if (current.section === 'course') {
      setPrefs((answers) =>
        answers.map((answer, index) =>
          index === current.index ? value : answer,
        ),
      );
    } else {
      setActPrefs((answers) =>
        answers.map((answer, index) =>
          index === current.index ? value : answer,
        ),
      );
    }
  }

  async function save(
    nextPrefs: string[],
    nextActPrefs: string[],
    status: SurveyAnswers['surveyStatus'],
  ) {
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        prefs: nextPrefs,
        actPrefs: nextActPrefs,
        surveyStatus: status,
      });
      if (!saved) {
        setError('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
        return false;
      }
      return true;
    } catch {
      setError('저장 중 문제가 생겼어요. 응답은 이 화면에 그대로 남아 있어요.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function moveNext(skip = false) {
    let nextPrefs = prefs;
    let nextActPrefs = actPrefs;
    if (skip) {
      if (current.section === 'course') {
        nextPrefs = prefs.map((answer, index) =>
          index === current.index ? '' : answer,
        );
        setPrefs(nextPrefs);
      } else {
        nextActPrefs = actPrefs.map((answer, index) =>
          index === current.index ? '' : answer,
        );
        setActPrefs(nextActPrefs);
      }
    }

    const isLast = step === allQuestions.length - 1;
    const saved = await save(
      nextPrefs,
      nextActPrefs,
      isLast ? 'completed' : 'in-progress',
    );
    if (!saved) return;
    if (isLast) onExit();
    else setStep((value) => value + 1);
  }

  async function exitForLater() {
    if (view === 'intro' && data.surveyStatus === 'completed') {
      onExit();
      return;
    }
    if (await save(prefs, actPrefs, 'skipped')) onExit();
  }

  if (view === 'intro') {
    return (
      <SurveyFrame
        titleId="survey-intro-title"
        busy={saving}
        onClose={() => void exitForLater()}
      >
        <div className="survey-page survey-intro" id="survey">
          <section
            className="survey-intro-card"
            aria-labelledby="survey-intro-title"
          >
            <SurveyMascot />
            <span className="survey-eyebrow">나에게 맞는 학사 도우미</span>
            <h1 id="survey-intro-title" ref={headingRef} tabIndex={-1}>
              설문조사를 하면 서비스를
              <br />더 알차게 활용할 수 있어요!
            </h1>
            <p className="survey-intro-copy">
              수업 시간·요일과 학기 목표를 알려주면 과목과 비교과 활동을 찾을 때
              참고할 수 있어요. 답변은 언제든 다시 바꿀 수 있어요.
            </p>

            <div className="survey-intro-sections">
              <div>
                <span className="survey-section-icon course" aria-hidden="true">
                  <BookOpen />
                </span>
                <span>
                  <strong>수업 선호</strong>
                  <small>시간대와 학기 목표 · 6문항</small>
                </span>
              </div>
              <div>
                <span
                  className="survey-section-icon activities"
                  aria-hidden="true"
                >
                  <Compass />
                </span>
                <span>
                  <strong>비교과 선호</strong>
                  <small>관심 활동과 참여 방식 · 5문항</small>
                </span>
              </div>
            </div>

            <p className="survey-time">
              <Clock3 aria-hidden="true" /> 약 2분이면 완료해요
            </p>
            {hasProgress && data.surveyStatus !== 'completed' && (
              <p className="survey-resume-note">
                저장된 답변 {answeredCount}개부터 이어서 진행할 수 있어요.
              </p>
            )}
            {error && (
              <p className="survey-error" role="alert">
                {error}
              </p>
            )}
            <div className="survey-intro-actions">
              <button
                className="primary survey-main-action"
                onClick={begin}
                disabled={saving}
              >
                {data.surveyStatus === 'completed'
                  ? '답변 다시 보기'
                  : hasProgress
                    ? '이어서 하기'
                    : '설문 시작하기'}{' '}
                <ArrowRight aria-hidden="true" />
              </button>
              <button
                className="link survey-later"
                onClick={exitForLater}
                disabled={saving}
              >
                {saving
                  ? '저장 중…'
                  : data.surveyStatus === 'completed'
                    ? '홈으로 돌아가기'
                    : '나중에 할게요'}
              </button>
            </div>
          </section>
        </div>
      </SurveyFrame>
    );
  }

  const sectionLabel =
    current.section === 'course' ? '수업 선호' : '비교과 선호';
  const isLast = step === allQuestions.length - 1;

  return (
    <SurveyFrame
      titleId="survey-question-title"
      busy={saving}
      onClose={() => void exitForLater()}
    >
      <div className="survey-page survey-question-page" id="survey">
        <section
          className="survey-question-card"
          aria-labelledby="survey-question-title"
        >
          <SurveyMascot />
          <div className="survey-progress-head">
            <span className={`survey-section-label ${current.section}`}>
              {current.section === 'course' ? <BookOpen /> : <Compass />}
              {sectionLabel}
            </span>
            <span>
              {step + 1} / {allQuestions.length}
            </span>
          </div>
          <progress
            className="survey-progress"
            value={step + 1}
            max={allQuestions.length}
            aria-label={`설문 진행률 ${step + 1}/${allQuestions.length}`}
          />

          <div className="survey-question-copy">
            <span>질문 {step + 1}</span>
            <h1 id="survey-question-title" ref={headingRef} tabIndex={-1}>
              {current.question[0]}
            </h1>
            <p>가장 가까운 답변 하나를 선택해 주세요.</p>
            {current.section === 'course' &&
              (current.index === 3 || current.index === 4) && (
                <p>이 답변은 저장되며, 아직 과목 추천에는 반영되지 않아요.</p>
              )}
          </div>

          <fieldset className="survey-page-options" disabled={saving}>
            <legend className="sr-only">{current.question[0]} 답변</legend>
            {current.question.slice(1).map((option) => {
              const selected = currentValue === option;
              return (
                <label className={selected ? 'selected' : ''} key={option}>
                  <input
                    type="radio"
                    name="survey-answer"
                    value={option}
                    checked={selected}
                    onChange={() => selectAnswer(option)}
                  />
                  <span>{option}</span>
                  <span className="survey-radio-check" aria-hidden="true">
                    {selected && <Check />}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {error && (
            <p className="survey-error" role="alert">
              {error}
            </p>
          )}

          <p className="survey-save-hint">
            다음을 누르면 여기까지의 답변이 저장돼요.
          </p>

          <div className="survey-question-actions">
            <div>
              {step > 0 && (
                <button
                  className="secondary"
                  onClick={() => {
                    setError('');
                    setStep((value) => value - 1);
                  }}
                  disabled={saving}
                >
                  <ChevronLeft aria-hidden="true" /> 이전
                </button>
              )}
              <button
                className="link"
                onClick={() => moveNext(true)}
                disabled={saving}
              >
                이 질문 건너뛰기
              </button>
            </div>
            <button
              className="primary survey-next"
              onClick={() => moveNext()}
              disabled={saving || !currentValue}
            >
              {saving ? '저장 중…' : isLast ? '설문 완료' : '다음'}
              {!saving && !isLast && <ArrowRight aria-hidden="true" />}
            </button>
          </div>

          <button
            className="survey-save-later"
            onClick={exitForLater}
            disabled={saving}
          >
            나중에 이어하기
          </button>
        </section>
      </div>
    </SurveyFrame>
  );
}
