'use client';
import { Sparkles } from 'lucide-react';

export function Advisor({
  answer,
  setAnswer,
  go,
}: {
  answer: string;
  setAnswer: (value: string) => void;
  go: (route: string) => void;
}) {
  return (
    <section className="card advisor">
      <span className="ai-mark">
        <Sparkles size={30} />
      </span>
      <h2>다음 선택, 함께 정리해 볼까요?</h2>
      <p>
        현재는 AI 연결 전입니다. 아래는 기능을 찾는 데 도움을 주는 고정 안내
        응답입니다.
      </p>
      <div className="chips">
        {[
          '졸업요건은 어디서 확인해?',
          '다음 학기 계획을 세우고 싶어',
          '비교과 활동을 찾고 싶어',
        ].map((q) => (
          <button
            className="secondary"
            key={q}
            onClick={() =>
              setAnswer(
                q.includes('졸업')
                  ? '적용 졸업 규정이 확인되어야 충족 여부를 계산할 수 있습니다. 졸업요건 화면과 학교 종합정보시스템에서 기준을 확인하세요.'
                  : q.includes('계획')
                    ? '과목 추천이나 시간표 짜기에서 2026-2 개설 과목을 담으면 학기별 계획과 시간표에 함께 반영됩니다. 실제 수강신청은 학교 시스템에서 진행하세요.'
                    : '비교과·대외활동에서 활동을 찾아 저장할 수 있습니다. 현재 목록은 체험 예시입니다.',
              )
            }
          >
            {q}
          </button>
        ))}
      </div>
      {answer && (
        <div className="answer" aria-live="polite">
          <p>{answer}</p>
          <small>근거: 이 사이트의 기능 안내 · AI 생성 답변 아님</small>
        </div>
      )}
      <div className="actions">
        <button className="link" onClick={() => go('graduation')}>
          졸업요건 →
        </button>
        <button className="link" onClick={() => go('semester-plan')}>
          학기별 계획 →
        </button>
      </div>
    </section>
  );
}
