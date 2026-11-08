'use client';
import { useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Layers } from 'lucide-react';
import type { Data } from './data';
import type { Account } from '../account-flow';
import type { Catalog } from '@/lib/data/catalog';
import type { ActivitySnapshot } from '@/lib/data/activities';
import {
  collectionStatus,
  type CollectionStatus,
} from '@/lib/data/collection-status';
import { formatLmsTime } from '@/lib/data/lms';
import { useActivities, useNow, useSchedule } from './catalog';
import { DemoStorage, StoredDataView } from './demo-storage';

function SourceCard({
  title,
  description,
  status,
  fetchedAt,
  note,
  children,
}: {
  title: string;
  description: string;
  status: CollectionStatus;
  fetchedAt?: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <article className="connection-card">
      <div className="connection-title">
        <h4>
          <Layers size={18} aria-hidden="true" />
          {title}
        </h4>
        <span className={`badge${status.warning ? ' orange' : ''}`}>
          {status.label}
        </span>
      </div>
      <p>{description}</p>
      <p className="meta">{status.detail}</p>
      {note && <p className="meta">{note}</p>}
      <p className="meta">
        {fetchedAt && Number.isFinite(Date.parse(fetchedAt))
          ? `마지막 수집 ${formatLmsTime(fetchedAt)}`
          : '수집 시각 확인 안 됨'}
      </p>
      <div className="actions">{children}</div>
    </article>
  );
}

export function SettingsSection({
  account,
  data,
  persist,
  go,
  onDeleteAccount,
  onLogout,
  onResetDemo,
  catalog,
  activities,
}: {
  account: Account | null;
  data: Data;
  persist: (next: Data, msg?: string) => Promise<boolean>;
  go: (route: string) => void;
  onDeleteAccount: () => Promise<void>;
  onLogout: () => Promise<void>;
  onResetDemo: () => boolean;
  catalog: Catalog | null;
  activities: ActivitySnapshot | null;
}) {
  const now = useNow();
  const activityState = useActivities();
  const scheduleState = useSchedule();
  const activity = activityState.snap ?? activities;
  const snapshot = account?.snapshot;
  const [action, setAction] = useState<'logout' | 'delete' | null>(null);
  const actionPending = useRef(false);
  const infoPages = data.info?.diag?.pages ?? [];
  const infoLabels: Record<string, string> = {
    grades: '이수 내역·평점',
    points: '비교과 포인트',
    audit: '졸업가사정표',
    menu: '학교 메뉴',
  };
  const infoIssues = [
    ...new Set(
      infoPages
        .filter(
          (page) =>
            !page.ok &&
            !infoPages.some((other) => other.slot === page.slot && other.ok),
        )
        .map((page) => infoLabels[page.slot] ?? '기타 학교 정보'),
    ),
  ];
  const lmsIssues =
    data.lms?.courses.filter(
      (c) =>
        c.errors?.length ||
        c.retainedAt ||
        c.vods.some((t) => t.uncertain) ||
        c.assigns.some((t) => t.uncertain) ||
        c.quizzes.some((t) => t.uncertain),
    ) ?? [];
  const infoStatus = collectionStatus(
    {
      hasData: !!data.info,
      fetchedAt: data.info?.fetchedAt,
      connected: !!account,
      pending: snapshot?.infoPending,
      startedAt: snapshot?.checkedAt,
      failed: !!snapshot?.infoFailedAt,
      partial: infoIssues.length > 0,
      staleAfterDays: 30, // 졸업요건 화면의 종합정보 수집본 기준과 동일하다.
    },
    now,
  );
  const lmsStatus = collectionStatus(
    {
      hasData: !!data.lms,
      fetchedAt: data.lms?.fetchedAt,
      connected: !!account && snapshot?.lms === 'connected',
      pending: snapshot?.lmsPending,
      startedAt: snapshot?.checkedAt,
      failed:
        !!snapshot?.lmsFailedAt ||
        !!snapshot?.lmsError ||
        (!!account && snapshot?.lms === 'unavailable' && !snapshot.lmsPending),
      partial: lmsIssues.length > 0,
    },
    now,
  );
  const activityStatus = collectionStatus(
    {
      hasData: !!activity,
      fetchedAt: activity?.fetchedAt,
      connected: true,
      pending: !activity && !activityState.failed,
      startedAt: new Date(now).toISOString(),
      failed: activityState.failed,
    },
    now,
  );
  const scheduleStatus = collectionStatus(
    {
      hasData: !!scheduleState.snap,
      fetchedAt: scheduleState.snap?.fetchedAt,
      connected: true,
      pending: !scheduleState.snap && !scheduleState.failed,
      startedAt: new Date(now).toISOString(),
      failed: scheduleState.failed,
    },
    now,
  );
  async function runAction(kind: 'logout' | 'delete') {
    if (actionPending.current) return;
    actionPending.current = true;
    setAction(kind);
    try {
      await (kind === 'logout' ? onLogout() : onDeleteAccount());
    } finally {
      actionPending.current = false;
      setAction(null);
    }
  }
  return (
    <section
      className="card detail settings"
      aria-labelledby="connection-settings-title"
    >
      <h2 id="connection-settings-title">연결 및 저장 정보</h2>
      <p>
        {account
          ? '학교에서 가져온 정보와 내 계정에 보관하는 내용을 확인하세요.'
          : '체험 정보는 이 브라우저에 저장돼요. 학교 계정의 정보와는 별개예요.'}
      </p>
      <section aria-labelledby="school-connections-title">
        <h3 id="school-connections-title">학교에서 가져온 정보</h3>
        <div className="connection-grid">
          <SourceCard
            title="종합정보시스템"
            description="학적·이수 내역·평점·비교과 포인트와 졸업가사정표를 가져와요. 실제로 확인된 항목만 표시해요."
            status={infoStatus}
            fetchedAt={data.info?.fetchedAt}
            note={
              infoIssues.length
                ? `확인 필요: ${infoIssues.join(', ')}`
                : undefined
            }
          >
            <button
              className="secondary"
              onClick={() => go('graduation/completed')}
            >
              학교 이수 내역 확인
            </button>
            <a
              className="link"
              href="https://info.hansung.ac.kr/"
              target="_blank"
              rel="noreferrer"
            >
              학교 원문 <ArrowUpRight size={14} aria-hidden="true" />
              <span className="sr-only"> (새 탭)</span>
            </a>
          </SourceCard>
          <SourceCard
            title="COSMOS / e-Class"
            description="강의·출석·과제·퀴즈를 모아 보여줘요. 완료 여부는 수집 시점 기준이에요."
            status={lmsStatus}
            fetchedAt={data.lms?.fetchedAt}
            note={
              lmsIssues.length
                ? `확인 필요한 수업 ${lmsIssues.length}과목 · 수업 현황에서 항목별로 볼 수 있어요.`
                : undefined
            }
          >
            <button className="secondary" onClick={() => go('lms')}>
              수업 확인·다시 가져오기
            </button>
            <a
              className="link"
              href="https://learn.hansung.ac.kr/"
              target="_blank"
              rel="noreferrer"
            >
              COSMOS 원문 <ArrowUpRight size={14} aria-hidden="true" />
              <span className="sr-only"> (새 탭)</span>
            </a>
          </SourceCard>
        </div>
        <p className="meta">
          종합정보는 학교 계정으로 로그인할 때 조회해요. 수업 현황에서는 서버
          재수집과 가져오기 안내를 확인할 수 있어요. 학교 비밀번호와 학교 로그인
          쿠키는 수집 요청에 사용하며 서비스 계정에 보관하지 않아요.
        </p>
      </section>
      <section aria-labelledby="public-connections-title">
        <h3 id="public-connections-title">학교 공개 자료</h3>
        <p className="meta">
          계정 연결 없이도 이용할 수 있어요. 비교과 공개 목록에는 나의 신청·참여
          내역이 포함되지 않아요.
        </p>
        <div className="connection-grid">
          <SourceCard
            title="비교과 프로그램"
            description="스마트자기관리시스템의 공개 목록이에요. 접수 상태는 학교 원문에서 최종 확인해 주세요."
            status={activityStatus}
            fetchedAt={activity?.fetchedAt}
          >
            {activityState.failed ? (
              <button className="secondary" onClick={activityState.retry}>
                비교과 다시 불러오기
              </button>
            ) : (
              <button className="secondary" onClick={() => go('activities')}>
                비교과 보기
              </button>
            )}
          </SourceCard>
          <SourceCard
            title="학사일정"
            description="학교가 공개한 학사일정이에요. 본인에게 적용되는 일정인지 확인해 주세요."
            status={scheduleStatus}
            fetchedAt={scheduleState.snap?.fetchedAt}
          >
            {scheduleState.failed ? (
              <button className="secondary" onClick={scheduleState.retry}>
                일정 다시 불러오기
              </button>
            ) : (
              <button className="secondary" onClick={() => go('calendar')}>
                학사일정 보기
              </button>
            )}
          </SourceCard>
        </div>
        <p className="meta">
          다시 불러오기는 서비스에 게시된 자료를 다시 읽어요. 학교 원문을
          실시간으로 수집하는 동작은 아니에요.
        </p>
      </section>
      <section
        aria-labelledby="storage-location-title"
        className="settings-storage"
      >
        <h3 id="storage-location-title">어디에 무엇을 보관하나요?</h3>
        <dl className="storage-locations">
          <div>
            <dt>{account ? '내 계정' : '이 브라우저 · 체험 모드'}</dt>
            <dd>
              {account
                ? '프로필·계획·선호·관심 활동·개인 일정과 학교 수집 정보를 서버의 내 계정에 보관해요. 로그인하면 다른 기기에서도 불러올 수 있어요.'
                : '입력한 프로필·계획·선호·관심 활동·개인 일정과 가져온 수업 정보는 이 브라우저에 보관해요. 다른 기기와 자동으로 공유하지 않아요.'}
            </dd>
          </div>
          <div>
            <dt>이 브라우저의 설정</dt>
            <dd>
              화면 설정과 별도 체험 기록은 브라우저마다 따로 보관해요.
              {account
                ? ' 서비스 로그인 유지에는 이 브라우저의 로그인 쿠키를 사용해요.'
                : ''}
            </dd>
          </div>
          <div>
            <dt>학교에서 가져온 값</dt>
            <dd>
              이수 내역·학점·포인트·수업 상태의 수집본이에요. 학교 원본은 이
              서비스에서 수정하지 않아요.
            </dd>
          </div>
          <div>
            <dt>수정 가능한 프로필과 직접 입력 기록</dt>
            <dd>
              프로필은 학교에서 빈칸을 채운 값이 포함될 수 있어요. 직접 입력한
              이수 내역·일정·선호와 계획은 학교 수집본과 구분해 관리해요.
            </dd>
          </div>
          <div>
            <dt>추천·졸업요건 계산</dt>
            <dd>
              저장한 정보와 기준 자료를 바탕으로 계산한 안내예요. 학교의 공식
              이수 판정이나 수강 신청 결과는 아니에요.
            </dd>
          </div>
        </dl>
        <button className="secondary" onClick={() => go('profile')}>
          {account ? '프로필 수정하기' : '체험 프로필 입력하기'}
        </button>
        {!account && (
          <button
            className="link"
            onClick={() => void persist({ ...data, consent: false }, '')}
          >
            체험 저장 안내 다시 보기
          </button>
        )}
        {account && (
          <details className="stored-preview">
            <summary>현재 계정의 정보 펼쳐 보기</summary>
            <p className="meta">
              학교 수집본과 프로필의 현재 표시 내용이에요. 수집본은 위의 시각과
              상태를 함께 확인해 주세요.
            </p>
            <StoredDataView
              data={data}
              catalog={catalog}
              activities={activity}
            />
          </details>
        )}
      </section>
      <section
        className="settings-removal"
        aria-labelledby="settings-removal-title"
      >
        <h3 id="settings-removal-title">로그아웃과 삭제 범위</h3>
        <p className="meta">
          학교에 있는 원본 정보는 어떤 동작으로도 삭제되지 않아요. 학교 수집
          정보만 따로 삭제하거나 연결만 해제하는 기능은 아직 제공하지 않아요.
        </p>
        {account && (
          <>
            <div className="between">
              <p>
                <b>로그아웃</b>
                <br />이 브라우저의 로그인을 종료해요. 계정에 보관한 정보와 다른
                기기의 로그인은 유지돼요.
              </p>
              <button
                className="secondary"
                disabled={action !== null}
                onClick={() => void runAction('logout')}
              >
                {action === 'logout'
                  ? '로그아웃 중…'
                  : '이 브라우저에서 로그아웃'}
              </button>
            </div>
            <div className="between">
              <p>
                <b>내 계정 자료 삭제</b>
                <br />
                프로필·계획·선호·관심 활동·개인 일정·학교 수집 정보와 모든
                기기의 로그인 세션을 삭제해요. 되돌릴 수 없어요. 이 브라우저의
                별도 체험 데이터는 남아요.
              </p>
              <button
                className="secondary danger"
                disabled={action !== null}
                onClick={() => void runAction('delete')}
              >
                {action === 'delete' ? '삭제 중…' : '내 계정 자료 삭제'}
              </button>
            </div>
          </>
        )}
        <DemoStorage
          catalog={catalog}
          activities={activity}
          onReset={onResetDemo}
          revision={data}
        />
        <p className="meta">
          체험 초기화는 이 브라우저의 체험 기록만 지워요. 계정 정보와 학교 원본,
          화면 설정은 유지돼요.
        </p>
      </section>
    </section>
  );
}
