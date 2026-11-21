'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { Data } from './data';
import type { Account } from '../account-flow';
import { formatSemesterLabel, normalizeSemesterLabel } from '@/lib/data/graduation';
import { useCurriculum, useCurriculumIndex } from './catalog';
import { majorLabel, pickCurriculumSemester } from '@/lib/data/curriculum';
import { resolveDept } from '@/lib/data/dept';
import { RULESET_DEPT_FAMILY } from '@/lib/data/dept-rules';

/** 졸업요건 계산에 필요한 프로필 필드 — 누락 안내·포커스 대상 */
const GRAD_FIELDS: [string, string][] = [
  ['dept', '소속 학과'],
  ['year', '입학연도'],
];

export function ProfileSection({
  data,
  account,
  persist,
  focus,
  go,
}: {
  data: Data;
  account: Account | null;
  persist: (next: Data, msg?: string) => Promise<boolean>;
  /** 홈 CTA 등에서 넘긴 필드명 — 해당 입력으로 포커스+안내 표시 */
  focus?: string;
  go: (route: string) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const focusField =
    focus === 'dept' || focus === 'year' || focus === 'points' ? focus : null;
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
  // 소속 학과 — 입학연도 교육과정의 개설 단위 목록으로 자동완성 + 해석 힌트.
  // 오타·별칭 입력은 resolveDept가 잡아 '지도 기준/후보/매칭 없음'을 보여준다.
  const { snap: currIndex } = useCurriculumIndex();
  const admitYear = data.info?.admitYear ?? (data.year.trim() ? Number(data.year) : undefined);
  const { snap: curriculum } = useCurriculum(pickCurriculumSemester(admitYear, currIndex));
  const deptOptions = useMemo(
    () =>
      curriculum
        ? [...new Set([
            ...Object.keys(RULESET_DEPT_FAMILY),
            ...Object.values(curriculum.majors).map((m) => majorLabel(m.name)),
          ])].sort((a, b) => a.localeCompare(b, 'ko'))
        : [],
    [curriculum],
  );
  const [deptText, setDeptText] = useState<string | null>(null);
  const deptVal = deptText ?? data.dept;
  const deptRes = deptVal.trim() && deptOptions.length ? resolveDept(deptVal, deptOptions) : undefined;
  const deptHint = !deptVal.trim() || !deptOptions.length ? null
    : deptRes?.dept ? { text: `졸업 지도 기준: ${deptRes.dept}`, warn: false }
    : deptRes?.candidates ? { text: `개설 단위 후보 ${deptRes.candidates.length}개 — 트랙은 지도에서 선택`, warn: false }
    : { text: '매칭되는 학과가 없어요 — 목록에서 골라 주세요', warn: true };
  // 목표 졸업학기 — 온보딩 자유 입력도 'YYYY-S'로 정규화해 선택지와 맞춘다
  const curYear = new Date().getFullYear();
  const savedTarget = normalizeSemesterLabel(data.graduationTarget);
  const targetOptions = [...new Set([
    ...Array.from({ length: 6 }, (_, i) => [`${curYear + i}-1`, `${curYear + i}-2`]).flat(),
    ...(savedTarget ? [savedTarget] : []),
  ])].sort();
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
      {data.info?.track && <p className="meta">학교 수집 트랙·전공: {data.info.tracks?.join(' · ') || data.info.track} · 소속 학과와 별도로 표시합니다.</p>}
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
            admissionType: d.get('admissionType') as Data['admissionType'],
            dept: d.get('dept') as string,
            credits: d.get('credits') as string,
            points: d.get('points') as string,
            graduationTarget: d.get('graduationTarget') as string,
          });
        }}
      >
        <div className="form-grid">
          <label>입학 구분
            <select name="admissionType" defaultValue={data.admissionType ?? 'unknown'}>
              <option value="unknown">선택해 주세요</option><option value="freshman">신입학</option>
              <option value="general-transfer">일반편입</option><option value="bachelor-transfer">학사편입</option>
            </select>
          </label>
          {[
            ['name', '표시 이름', data.name, 'text'],
            ['year', '입학연도 (연결 시 자동 입력)', data.year, 'number'],
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
          <label>
            소속 학과·학부 (연결 시 자동 입력)
            <input
              name="dept"
              defaultValue={data.dept}
              type="text"
              maxLength={50}
              list="profile-dept-options"
              onInput={(e) => setDeptText(e.currentTarget.value)}
            />
            <datalist id="profile-dept-options">
              {deptOptions.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </datalist>
            {deptHint && (
              <small className={`meta profile-dept-hint${deptHint.warn ? ' warn' : ''}`}>
                {deptHint.text}
              </small>
            )}
          </label>
          {[
            [
              'credits',
              '이수학점 (학교 수집값이 우선입니다)',
              data.credits,
              'number',
            ],
            [
              'points',
              '비교과 포인트 (학교 수집값이 우선입니다)',
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
          <label>
            목표 졸업학기
            <select name="graduationTarget" defaultValue={savedTarget ?? ''}>
              <option value="">선택하지 않음</option>
              {targetOptions.map((v) => (
                <option key={v} value={v}>
                  {formatSemesterLabel(v)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="primary">
          프로필 저장 <Check size={17} />
        </button>
        {focusField && <button type="button" className="secondary" onClick={() => go('home')}>홈에서 다음 단계 확인</button>}
      </form>
      <div className="divider" />
      <h3>나의 활동 기록</h3>
      <p>
        저장한 활동 {data.saved.length}개 · 계획한 과목 {data.planned.length}개
        · 수업 선호 {data.prefs.some(Boolean) ? '설정 완료' : '미설정'}
        · 비교과 선호 {(data.actPrefs ?? []).some(Boolean) ? '설정 완료' : '미설정'}
      </p>
      <div className="actions">
        <button className="secondary" onClick={() => go('survey')}>
          나의 설문 답변 {data.prefs.some(Boolean) || data.actPrefs?.some(Boolean) ? '확인·수정' : '시작하기'}
        </button>
      </div>
    </section>
  );
}
