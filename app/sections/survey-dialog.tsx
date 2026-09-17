'use client';
import { Check, X } from 'lucide-react';
import type { RefObject } from 'react';
import { questions } from './data';

export function SurveyDialog({
  dialogRef,
  step,
  draft,
  setDraft,
  setStep,
  onClose,
  onSubmit,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  step: number;
  draft: string[];
  setDraft: (value: string[]) => void;
  setStep: (value: number) => void;
  onClose: () => void;
  onSubmit: (prefs: string[]) => void;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="survey-dialog"
      aria-labelledby="survey-question"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="between">
        <span className="badge purple">수업 선호 · {step + 1} / 6</span>
        <button className="icon" aria-label="설문 닫기" onClick={onClose}>
          <X />
        </button>
      </div>
      <h2 id="survey-question">{questions[step][0]}</h2>
      <p>선택하지 않고 건너뛰어도 사이트를 이용할 수 있어요.</p>
      <div className="survey-options">
        {questions[step].slice(1).map((v) => (
          <button
            className={draft[step] === v ? 'chosen' : ''}
            key={v}
            aria-pressed={draft[step] === v}
            onClick={() => {
              const next = Array.from(
                { length: 6 },
                (_, i) => draft[i] || '',
              );
              next[step] = v;
              setDraft(next);
            }}
          >
            <span className="option-label">{v}</span>
            <span className="option-check" aria-hidden="true">
              {draft[step] === v && <Check size={14} strokeWidth={2.5} />}
            </span>
          </button>
        ))}
      </div>
      <div className="between">
        <button className="link" onClick={onClose}>
          나중에 하기
        </button>
        <div className="actions">
          {step > 0 && (
            <button className="secondary" onClick={() => setStep(step - 1)}>
              이전
            </button>
          )}
          <button
            className="primary"
            onClick={() => {
              if (step < 5) setStep(step + 1);
              else onSubmit(draft);
            }}
          >
            {step === 5 ? '완료' : '다음'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
