'use client';
import { Check, X } from 'lucide-react';
import type { RefObject } from 'react';

export function SurveyDialog({
  dialogRef,
  label,
  questions,
  step,
  draft,
  setDraft,
  setStep,
  onClose,
  onSubmit,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** 배지 라벨 — '수업 선호' / '비교과 선호' 등 */
  label: string;
  /** [질문, ...선택지] 배열 — 문항 수는 questions.length에서 파생 */
  questions: readonly (readonly string[])[];
  step: number;
  draft: string[];
  setDraft: (value: string[]) => void;
  setStep: (value: number) => void;
  onClose: () => void;
  onSubmit: (prefs: string[]) => void;
}) {
  const total = questions.length;
  const last = total - 1;
  return (
    <dialog
      ref={dialogRef}
      className="survey-dialog"
      aria-labelledby="survey-question"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="between">
        <span className="badge purple">
          {label} · {step + 1} / {total}
        </span>
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
                { length: total },
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
              if (step < last) setStep(step + 1);
              else onSubmit(draft);
            }}
          >
            {step === last ? '완료' : '다음'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
