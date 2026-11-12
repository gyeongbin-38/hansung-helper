import { ACT_STAGES } from '@/lib/data/activities';
import { creditDistribution, targetProgress } from '@/lib/data/visual-progress';

export function ProgressMetric({ label, value, target, unit = '', tone = 'blue' }: {
  label: string; value: number | null | undefined; target: number | null | undefined;
  unit?: string; tone?: 'blue' | 'teal' | 'purple';
}) {
  const result = targetProgress(value, target);
  const known = value != null && Number.isFinite(value) && value >= 0;
  return <div className={`visual-progress visual-progress-${tone}`}>
    <div className="visual-progress-caption"><span>{label}</span><strong>{known ? `${value}${unit}` : '미입력'}{result && <small> / {target}{unit}</small>}</strong></div>
    {result ? <>
      <progress className="visual-progress-track" value={Math.min(value!, target!)} max={target!} aria-label={label} aria-valuetext={`${value}${unit} / ${target}${unit}, ${result.percent}%`} />
      <div className="visual-progress-note"><b>{result.percent}%</b><span>{result.remaining > 0 ? `${result.remaining}${unit} 남음` : '목표 수량 도달'}</span></div>
    </> : <div className="visual-progress-pending"><span aria-hidden="true" />{known ? '목표 기준 확인 필요' : '값을 입력하면 진행률을 볼 수 있어요'}</div>}
  </div>;
}

export function CreditComposition({ total, major, general, other }: { total: number | null; major: number; general: number; other: number }) {
  const distribution = creditDistribution(total, major, general, other);
  if (!distribution.size) return null;
  const labels = ['전공', '교양', '일반선택·기타', '분류 확인 필요'];
  const description = distribution.values.map((n, i) => `${labels[i]} ${n}학점`).join(', ');
  return <figure className="credit-composition" aria-label={`이수학점 구성: ${description}`}>
    <figcaption><b>이수학점 구성</b><small>이수 내역 기준</small></figcaption>
    <div className="credit-composition-bar" aria-hidden="true">
      {distribution.values.map((n, i) => n > 0 && <span className={`credit-segment credit-segment-${i}`} key={labels[i]} style={{ flexGrow: n }} aria-hidden="true">{n / distribution.size >= .14 ? n : ''}</span>)}
    </div>
    <div className="credit-composition-key">{distribution.values.map((n, i) => n > 0 && <span key={labels[i]}><i className={`credit-segment-${i}`} />{labels[i]} <b>{n}학점</b></span>)}</div>
    {distribution.inconsistent && <p className="meta">과목별 합계가 총 이수학점보다 커요. 학교 수집값과 직접 입력 내역을 대조해 주세요.</p>}
  </figure>;
}

export function ActivityStageProgress({ title, stage }: { title: string; stage: string | undefined }) {
  const index = ACT_STAGES.findIndex(([id]) => id === stage);
  return <div className="activity-stage-progress">
    <div><span>{index < 0 ? '진행 단계 미기록' : ACT_STAGES[index][1]}</span><small>{index + 1} / {ACT_STAGES.length}단계</small></div>
    <progress className="visual-progress-track" value={index + 1} max={ACT_STAGES.length} aria-label={`${title} 활동 기록 진행`} aria-valuetext={`${index < 0 ? '단계 미기록' : ACT_STAGES[index][1]}, ${index + 1} / ${ACT_STAGES.length}단계`} />
    <small>본인 기록 기준 · 학교 접수·포인트 반영 여부와 구분</small>
  </div>;
}
