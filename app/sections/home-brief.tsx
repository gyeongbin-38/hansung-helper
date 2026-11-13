'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { Account } from '../account-flow';
import type { Data } from './data';
import type { ActivitySnapshot } from '@/lib/data/activities';
import { activityNeedsVerification } from '@/lib/data/activities';
import type { ScheduleSnapshot } from '@/lib/data/schedule';
import { buildHomeBrief, type BriefItem } from '@/lib/data/home-brief';
import { formatLmsTime } from '@/lib/data/lms';

type Source = {
  name: string;
  fetchedAt?: string;
  status: string;
  warning?: boolean;
  action: string;
  open: () => void;
};

function BriefRow({ item, go }: { item: BriefItem; go: (route: string) => void }) {
  return (
    <li className="brief-row">
      <div className="brief-date">
        <b>{item.timing}</b>
        <small>{item.kind}</small>
      </div>
      <div className="brief-content">
        {item.url ? (
          <a className="link title-link" href={item.url} target="_blank" rel="noreferrer">
            {item.title} <ArrowUpRight size={14} aria-hidden="true" />
            <span className="sr-only"> (COSMOS 새 탭)</span>
          </a>
        ) : (
          <button className="link title-link" onClick={() => go(item.route)}>{item.title}</button>
        )}
        <small>{item.context}</small>
        {item.at !== null && item.kind !== '학사일정' && (
          <small>{item.kind === '개인 일정' ? '일정' : '마감'} {formatLmsTime(new Date(item.at).toISOString())}</small>
        )}
        {item.caution && <small className="brief-caution">{item.caution}</small>}
      </div>
      {item.url && (
        <button className="link brief-detail" aria-label={`${item.title} 수업 상세 보기`} onClick={() => go(item.route)}>수업 상세</button>
      )}
    </li>
  );
}

export function HomeBrief({
  data, account, activities, schedule, activitiesFailed, scheduleFailed,
  retryActivities, retrySchedule, now, go,
}: {
  data: Data;
  account: Account | null;
  activities: ActivitySnapshot | null;
  schedule: ScheduleSnapshot | null;
  activitiesFailed: boolean;
  scheduleFailed: boolean;
  retryActivities: () => void;
  retrySchedule: () => void;
  now: number;
  go: (route: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { deadlines, checks } = buildHomeBrief({
    now, lms: data.lms, activities, schedule, saved: data.saved,
    actStatus: data.actStatus, extActivities: data.extActivities, events: data.events,
  });
  const fetched = data.lms ? Date.parse(data.lms.fetchedAt) : NaN;
  const staleLms = !Number.isFinite(fetched) || fetched > now || now - fetched >= 86400000;
  const partial = data.lms?.courses.some((c) => c.errors?.length || c.retainedAt || c.assigns.some((t) => t.uncertain) || c.quizzes.some((t) => t.uncertain) || c.vods.some((t) => t.uncertain));
  const collecting = account?.snapshot.lmsPending;
  const failed = !!account?.snapshot.lmsError || !!account?.snapshot.lmsFailedAt;
  const collectingAt = Date.parse(account?.snapshot.checkedAt ?? '');
  const delayed = collecting && (!Number.isFinite(collectingAt) || now - collectingAt > 120000);
  const sources: Source[] = [
    {
      name: 'COSMOS', fetchedAt: data.lms?.fetchedAt,
      status: delayed ? '수집 상태 확인 필요' : collecting ? '수집 중' : failed ? '최근 수집 실패' : !data.lms ? '수업 정보 미연결' : partial ? '일부 항목 확인 필요' : staleLms ? '현재 상태 재확인 필요' : '수집본 기준',
      warning: !!delayed || failed || partial || staleLms,
      action: '수업 정보 확인', open: () => go('lms'),
    },
    {
      name: '비교과', fetchedAt: activities?.fetchedAt,
      status: activitiesFailed ? '불러오기 실패' : !activities ? '불러오는 중' : activityNeedsVerification(activities.fetchedAt, now) ? '현재 접수 여부 확인 필요' : '수집본 기준',
      warning: activitiesFailed || (!!activities && activityNeedsVerification(activities.fetchedAt, now)),
      action: activitiesFailed ? '다시 불러오기' : '비교과 보기', open: activitiesFailed ? retryActivities : () => go('activities'),
    },
    {
      name: '학사일정', fetchedAt: schedule?.fetchedAt,
      status: scheduleFailed ? '불러오기 실패' : !schedule ? '불러오는 중' : activityNeedsVerification(schedule.fetchedAt, now) ? '학교 원문 재확인 필요' : '수집본 기준',
      warning: scheduleFailed || (!!schedule && activityNeedsVerification(schedule.fetchedAt, now)),
      action: scheduleFailed ? '다시 불러오기' : '일정 보기', open: scheduleFailed ? retrySchedule : () => go('calendar'),
    },
  ];
  const shown = expanded ? deadlines : deadlines.slice(0, 5);
  return (
    <section className="card pad home-brief" aria-labelledby="home-brief-title">
      <div className="section-heading">
        <h2 id="home-brief-title">놓치기 쉬운 할 일</h2>
        <button className="link" onClick={() => go('lms')}>수업 현황 <ArrowRight size={15} aria-hidden="true" /></button>
      </div>
      <p className="meta">7일 이내 마감과 일정, 최근 기한이 지난 수업을 모았어요. 학사일정은 본인 해당 여부를 확인해 주세요.</p>
      {shown.length ? (
        <ul className="brief-list" id="home-deadlines">
          {shown.map((item) => <BriefRow key={item.id} item={item} go={go} />)}
        </ul>
      ) : (
        <p className="brief-empty">가져온 정보에서 가까운 마감을 찾지 못했어요. 아래 수집 상태와 마감 미기재 항목도 확인해 주세요.</p>
      )}
      {deadlines.length > 5 && (
        <button className="link brief-more" aria-expanded={expanded} aria-controls="home-deadlines" onClick={() => setExpanded((value) => !value)}>
          {expanded ? '접기' : `나머지 ${deadlines.length - 5}건 보기`}
        </button>
      )}
      {checks.length > 0 && (
        <details className="brief-checks">
          <summary>마감·접수 확인이 필요한 항목 {checks.length}건</summary>
          <p className="meta">마감이 없거나 현재 접수 상태를 확인하지 못한 항목이에요. 원문에서 확인해 주세요.</p>
          <ul className="brief-list">{checks.map((item) => <BriefRow key={item.id} item={item} go={go} />)}</ul>
        </details>
      )}
      <details className="brief-sources">
        <summary>학교 정보 확인 상태{sources.some((source) => source.warning) ? ' · 확인 필요' : ''}</summary>
        <p className="meta">자동 수집에서 빠진 항목이 있을 수 있어요. 완료·신청 여부와 변경 사항은 학교 원문이 기준이에요.</p>
        <ul>
          {sources.map((source) => (
            <li key={source.name}>
              <div><b>{source.name}</b><small>{source.status}</small><small>{source.fetchedAt && Number.isFinite(Date.parse(source.fetchedAt)) ? `마지막 수집 ${formatLmsTime(source.fetchedAt)}` : '수집 시각 확인 안 됨'}</small></div>
              <button className="link" onClick={source.open}>{source.action}</button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
