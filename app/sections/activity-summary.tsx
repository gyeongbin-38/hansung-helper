'use client';
import { ArrowRight, Bell, ChevronDown, Compass } from 'lucide-react';
import type { Data } from './data';
import type { ActivitySnapshot } from '@/lib/data/activities';
import { activityDigest } from '@/lib/data/activity-assistant';
import { activityStageCounts } from '@/lib/data/visual-progress';
import { ProgressMetric } from './visual-progress';
import { ACT_STAGES } from '@/lib/data/activities';

export function ActivitySummary({ data, snapshot, now, go }: {
  data: Data; snapshot: ActivitySnapshot | null; now: number; go: (route: string) => void;
}) {
  const digest = activityDigest(data, snapshot, now);
  const stages = activityStageCounts(data.saved, data.extActivities ?? [], data.actStatus ?? {});
  return <details className="card activity-summary">
    <summary className="activity-summary-heading">
      <span className="activity-summary-heading-main">
        <span className="activity-summary-icon"><Compass size={18} /></span>
        <span>
          <b>나의 비교과 브리핑</b>
          <small>저장 {digest.saved}개 · {digest.stale ? '공고 재확인 필요' : `7일 이내 마감 ${digest.closing}개`}</small>
        </span>
      </span>
      <ChevronDown className="activity-summary-chevron" size={18} aria-hidden="true" />
    </summary>
    <div className="activity-summary-content">
    <div className="activity-summary-tools">
      <p>마감·포인트 현황을 한눈에 확인해요.</p>
      <button className="secondary" onClick={() => go('notifications')}><Bell size={15} />마감 알림 설정</button>
    </div>
    <div className="activity-summary-stats">
      <div><small>저장한 활동</small><b>{digest.saved}개</b></div>
      <div><small>{digest.stale ? '마감 재확인 필요' : '7일 이내 관심 활동 마감'}</small><b>{digest.stale ? '공고 확인' : `${digest.closing}개`}</b></div>
      <div><small>참여 중 · 포인트 확인 대기</small><b>{digest.participating}개 · {digest.awaitingPoints}개</b></div>
      <div><small>누적 비교과 포인트</small><b>{digest.points === null ? '미입력' : `${digest.points}P`}</b></div>
    </div>
    <div className="activity-summary-progress-grid">
      <ProgressMetric label="졸업 비교과 포인트" value={digest.points} target={digest.requiredPoints} unit="P" tone="purple" />
      {stages.total > 0 ? <ProgressMetric label="포인트 확인까지 마친 활동" value={stages.counts[3]} target={stages.total} unit="개" tone="teal" /> : <div className="activity-progress-empty">관심 활동을 저장하면 진행률을 보여드려요.</div>}
    </div>
    {stages.total > 0 && <div className="activity-stage-overview" aria-label="나의 활동 단계별 현황">
      <div>{ACT_STAGES.map(([id, label], i) => <span key={id}><b>{stages.counts[i]}</b>{label}</span>)}</div>
      <p className="meta">미기록 {stages.pending}개 · 본인 기록 기준</p>
    </div>}
    {digest.remainingPoints !== null && <p className="meta">졸업 기준 {digest.requiredPoints}P까지 {digest.remainingPoints}P 남았어요.</p>}
    {digest.stale && <p className="meta">최신 접수 여부는 학교 공고에서 확인해 주세요.{snapshot ? ` 수집일 ${snapshot.fetchedAt.slice(0, 10)}` : ' 목록을 불러오는 중이에요.'}</p>}
    <div className="activity-summary-picks">{digest.picks.map(a => <div key={a.id}>
      <button className="activity-summary-title" onClick={() => go(`activities/${a.id}`)}><b>{a.title}</b><small>{a.applyEnd ? `신청 마감 ${a.applyEnd.slice(0, 10)}` : '신청 기간 확인 필요'} · {a.points === null ? '포인트 확인 필요' : `${a.points}P`} · {data.saved.includes(a.id) ? '관심 활동' : '공개 목록에서 제안'}</small></button>
      <button className="secondary" onClick={() => go(`activities/recommend/${a.id}`)}>AI 추천</button>
    </div>)}</div>
    <div className="actions"><button className="link" onClick={() => go('activities/recommend')}>AI 추천 <ArrowRight size={14} /></button><button className="link" onClick={() => go('activities')}>전체 활동 보기 <ArrowRight size={14} /></button></div>
    <p className="meta">브라우저 알림을 켜면 앱이 열려 있을 때 마감을 알려드려요.</p>
    </div>
  </details>;
}
