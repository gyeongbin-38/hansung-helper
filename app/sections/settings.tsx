'use client';
import { Layers } from 'lucide-react';
import type { Data } from './data';
import type { Account } from '../account-flow';

export function SettingsSection({
  account,
  data,
  persist,
  go,
  onDeleteAccount,
}: {
  account: Account | null;
  data: Data;
  persist: (next: Data, msg?: string) => Promise<boolean>;
  go: (route: string) => void;
  onDeleteAccount: () => void;
}) {
  return (
    <section className="card detail settings">
      <h2>데이터 연결과 체험 설정</h2>
      {[
        '한성대학교 종합정보시스템',
        '스마트자기관리시스템',
        '코스모스 / e-Class',
      ].map((n) => {
        const isLms = n === '코스모스 / e-Class';
        const verified =
          (account && n === '한성대학교 종합정보시스템') ||
          (account &&
            isLms &&
            account.snapshot.lms === 'connected' &&
            !!account.snapshot.lmsData &&
            !account.snapshot.lmsFailedAt);
        return (
          <div className="event-line" key={n}>
            <Layers size={22} />
            <div>
              <b>{n}</b>
              <small>
                {account
                  ? '로그인 시 확인한 상태입니다. 전체 이수 내역과 성적은 수집하지 않습니다.'
                  : '학교 계정을 연결하면 조회 가능한 정보를 확인합니다.'}
              </small>
            </div>
            <span className={verified ? 'badge green' : 'badge'}>
              {account && n === '한성대학교 종합정보시스템'
                ? '인증 확인'
                : account && isLms
                  ? account.snapshot.lmsPending
                    ? '수집 중…'
                    : account.snapshot.lms !== 'connected'
                      ? '연결 실패'
                      : account.snapshot.lmsFailedAt ||
                          !account.snapshot.lmsData
                        ? '수집 실패'
                        : '강의 조회 완료'
                  : '미연결'}
            </span>
          </div>
        );
      })}
      <div className="between">
        <p>
          학교 비밀번호는 로그인 확인에만 사용하며 저장하지 않습니다. 로그인한
          계정의 프로필과 계획은 기기 간 유지됩니다. 학교 정보는 로그인 시
          조회하며 상시 자동 수집하지 않습니다.
        </p>
        <button className="secondary" onClick={() => go('profile')}>
          {account ? '내 프로필 수정' : '체험 프로필 직접 입력'}
        </button>
      </div>
      <div className="divider" />
      <h3>{account ? '내 계정의 정보' : '이 브라우저의 저장 공간'}</h3>
      <div className="between">
        <p>
          {account
            ? '프로필, 선호, 계획과 강의 조회 결과를 내 계정에 보관합니다.'
            : '체험 정보는 이 브라우저에만 저장합니다.'}{' '}
          분석 쿠키는 사용하지 않습니다.
        </p>
        {!account && (
          <button
            className="secondary"
            onClick={() => persist({ ...data, consent: false }, '')}
          >
            저장 안내 다시 보기
          </button>
        )}
      </div>
      {account && (
        <div className="between">
          <p>
            계정 자료를 삭제하면 프로필·설문·계획·강의 조회 결과와 모든 로그인
            세션이 삭제됩니다.
          </p>
          <button className="secondary danger" onClick={onDeleteAccount}>
            내 계정 자료 삭제
          </button>
        </div>
      )}
    </section>
  );
}
