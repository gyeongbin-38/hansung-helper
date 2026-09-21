'use client';
import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import type { Data } from './data';
import type { Account } from '../account-flow';

/** 졸업요건 계산에 필요한 프로필 필드 — 누락 안내·포커스 대상 */
const GRAD_FIELDS: [string, string][] = [
  ['dept', '소속 학과'],
  ['year', '입학연도'],
];

export function ProfileSection({
  data,
  account,
  persist,
  onOpenSurvey,
  onOpenActSurvey,
  focus,
}: {
  data: Data;
  account: Account | null;
  persist: (next: Data, msg?: string) => Promise<boolean>;
  onOpenSurvey: () => void;
  /** 비교과 취향 설문을 연다 */
  onOpenActSurvey?: () => void;
  /** 홈 CTA 등에서 넘긴 필드명 — 해당 입력으로 포커스+안내 표시 */
  focus?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const focusField =
    focus === 'dept' || focus === 'year' ? focus : null;
  useEffect(() => {
    if (!focusField) return;
    const input = formRef.current?.querySelector<HTMLInputElement>(
      `input[name="${focusField}"]`,
    );
    input?.focus();
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusField]);
  const gradMissing = GRAD_FIELDS.filter(([k]) =>
    k === 'dept'
      ? !data.dept || data.dept === '소속 미입력'
      : !data.year,
  ).map(([, l]) => l);
  return (
    <section className="card detail profile">
      <div className="profile-mini">
        <span className="avatar large">{data.name.slice(0, 1)}</span>
        <div>
          <h2>{data.name}님의 프로필</h2>
          <span className={account ? 'badge green' : 'badge'}>
            {account ? '학교 계정 확인됨' : '학교 인증 미완료'}
          </span>
        </div>
      </div>
      <p>
        {account
          ? '프로필과 계획은 내 계정에 저장됩니다. 직접 입력한 학점·포인트는 학교 검증 자료와 구분됩니다.'
          : '체험 정보는 이 브라우저에만 저장됩니다.'}
      </p>
      {gradMissing.length > 0 && (
        <p className="meta profile-hint">
          졸업요건 계산에 필요: {gradMissing.join('·')}
          {focusField ? '. 아래 해당 칸에 입력해 주세요.' : ''}
        </p>
      )}
      <form
        ref={formRef}
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          await persist({
            ...data,
            name: d.get('name') as string,
            year: d.get('year') as string,
            dept: d.get('dept') as string,
            credits: d.get('credits') as string,
            points: d.get('points') as string,
          });
        }}
      >
        <div className="form-grid">
          {[
            ['name', '표시 이름', data.name, 'text'],
            ['year', '입학연도', data.year, 'number'],
            ['dept', '소속 학과·학부 (직접 입력)', data.dept, 'text'],
            [
              'credits',
              '이수학점 (모르면 비워두세요)',
              data.credits,
              'number',
            ],
            [
              'points',
              '비교과 포인트 (모르면 비워두세요)',
              data.points,
              'number',
            ],
          ].map(([key, l, v, t]) => (
            <label key={key}>
              {l}
              <input
                name={key}
                defaultValue={v}
                type={t}
                min="0"
                required={key === 'name'}
                maxLength={50}
              />
            </label>
          ))}
        </div>
        <button className="primary">
          프로필 저장 <Check size={17} />
        </button>
      </form>
      <div className="divider" />
      <h3>나의 활동 기록</h3>
      <p>
        저장한 활동 {data.saved.length}개 · 계획한 과목 {data.planned.length}개
        · 수업 선호 {data.prefs.length ? '설정 완료' : '미설정'}
        · 비교과 선호 {(data.actPrefs ?? []).length ? '설정 완료' : '미설정'}
      </p>
      <div className="actions">
        <button className="secondary" onClick={onOpenSurvey}>
          수업 선호 설정
        </button>
        {onOpenActSurvey && (
          <button className="secondary" onClick={onOpenActSurvey}>
            비교과 취향 설정
          </button>
        )}
      </div>
    </section>
  );
}
