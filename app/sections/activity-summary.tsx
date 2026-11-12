'use client';
import { ArrowRight, Bell, Sparkles } from 'lucide-react';
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
  return <section className="card activity-summary" aria-label="비교과 브리핑">
    <div className="activity-summary-heading"><div><h2><Sparkles size={20} />나의 비교과 브리핑</h2>
      <p>관심 활동의 마감부터 참여·포인트 확인까지 한눈에 확인해요.</p></div>
      <button className="secondary" onClick={() => go('notifications')}><Bell size={15} />마감 알림 설정</button></div>
    <div className="activity-summary-stats">
      <div><small>저장한 활동</small><b>{digest.saved}개</b></div>
      <div><small>{digest.stale ? '마감 재확인 필요' : '7일 이내 관심 활동 마감'}</small><b>{digest.stale ? '공고 확인' : `${digest.closing}개`}</b></div>
      <div><small>참여 중 · 포인트 확인 대기</small><b>{digest.participating}개 · {digest.awaitingPoints}개</b></div>
      <div><small>누적 비교과 포인트</small><b>{digest.points === null ? '미입력' : `${digest.points}P`}</b></div>
    </div>
    <div className="activity-summary-progress-grid">
      <ProgressMetric label="졸업 비교과 포인트" value={digest.points} target={digest.requiredPoints} unit="P" tone="purple" />
      {stages.total > 0 ? <ProgressMetric label="포인트 확인까지 마친 활동" value={stages.counts[3]} target={stages.total} unit="개" tone="teal" /> : <div className="activity-progress-empty">관심 활동을 저장하면 신청부터 포인트 확인까지 진행률을 모아 보여드려요.</div>}
    </div>
    {stages.total > 0 && <div className="activity-stage-overview" aria-label="나의 활동 단계별 현황">
      <div>{ACT_STAGES.map(([id, label], i) => <span key={id}><b>{stages.counts[i]}</b>{label}</span>)}</div>
      <p className="meta">진행 단계 미기록 {stages.pending}개 · 본인 기록 기준이며 학교의 실제 처리 현황과 다를 수 있어요.</p>
    </div>}
    {digest.remainingPoints !== null && <p className="meta">설정한 졸업 기준 {digest.requiredPoints}P까지 {digest.remainingPoints}P 남았어요. 활동 수료·인정 후 반영 여부를 확인해 주세요.</p>}
    {digest.stale && <p className="meta">비교과 목록의 최신 접수 여부를 학교 공고에서 확인해 주세요.{snapshot ? ` 수집일 ${snapshot.fetchedAt.slice(0, 10)}` : ' 목록을 불러오는 중이에요.'}</p>}
    <div className="activity-summary-picks">{digest.picks.map(a => <div key={a.id}>
      <button className="activity-summary-title" onClick={() => go(`activities/${a.id}`)}><b>{a.title}</b><small>{a.applyEnd ? `신청 마감 ${a.applyEnd.slice(0, 10)}` : '신청 기간 확인 필요'} · {a.points === null ? '포인트 확인 필요' : `${a.points}P`} · {data.saved.includes(a.id) ? '관심 활동' : '공개 목록에서 제안'}</small></button>
      <button className="secondary" onClick={() => go(`advisor/${a.id}`)}><Sparkles size={14} />AI와 신청 준비</button>
    </div>)}</div>
    <div className="actions"><button className="link" onClick={() => go('advisor/activities')}>AI와 활동 고르기·요약하기 <ArrowRight size={14} /></button><button className="link" onClick={() => go('activities')}>전체 활동 보기 <ArrowRight size={14} /></button></div>
    <p className="meta">마감 알림은 알림함에서 확인하며, 브라우저 알림을 켜면 앱이 열려 있을 때 알려드려요.</p>
  </section>;
}
