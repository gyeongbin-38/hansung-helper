'use client';
import { useEffect, useState } from 'react';
import { DEMO_STORAGE_KEY, parseDemoStorage } from '@/lib/data/demo-storage';
import type { Catalog } from '@/lib/data/catalog';
import type { ActivitySnapshot } from '@/lib/data/activities';
import { ACT_STAGES } from '@/lib/data/activities';
import { DEFAULT_RULES } from '@/lib/data/graduation';

type LoadState = ReturnType<typeof parseDemoStorage> | { status: 'loading' } | { status: 'unavailable' };
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const text = (v: unknown): string => typeof v === 'string' || typeof v === 'number' ? String(v) : '';
const values = (v: unknown): string[] => list(v).map(text).filter(Boolean);

function SavedList({ title, items }: { title: string; items: string[] }) {
  return <details className="stored-group"><summary>{title} · {items.length}건</summary>
    {items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>저장된 항목이 없습니다.</p>}
  </details>;
}

export function StoredDataView({ data, catalog, activities }: {
  data: unknown;
  catalog: Catalog | null;
  activities: ActivitySnapshot | null;
}) {
  const d = object(data);
  const courses = new Map((catalog?.sections ?? []).map((s) => [s.id, `${s.name} · ${s.section}분반`]));
  const acts = new Map((activities?.items ?? []).map((a) => [a.id, a.title]));
  const courseName = (id: string) => courses.get(id) ?? `${id} (과목명 확인 필요)`;
  const activityName = (id: string) => acts.get(id) ?? `${id} (활동명 확인 필요)`;
  const completed = list(d.completed).map((v) => object(v)).map((c) => [text(c.name), text(c.category), text(c.credits) && `${text(c.credits)}학점`].filter(Boolean).join(' · ')).filter(Boolean);
  const events = list(d.events).map((v) => object(v)).map((e) => [text(e.date), text(e.title)].filter(Boolean).join(' · ')).filter(Boolean);
  const ext = list(d.extActivities).map((v) => object(v)).map((e) => [text(e.title), text(e.org)].filter(Boolean).join(' · ')).filter(Boolean);
  const plans = Object.entries(object(d.semesterPlans)).flatMap(([semester, raw]) => {
    const p = object(raw);
    const scenarios = Object.entries(object(p.plans)).map(([key, ids]) => `${semester} · ${key}안: ${values(ids).map(courseName).join(', ') || '비어 있음'}`);
    return [`${semester} · 기준 자료 ${text(p.sourceSemester) || '미확인'}: ${values(p.planned).map(courseName).join(', ') || '비어 있음'}`, ...scenarios];
  });
  const oldPlans = values(d.planned).map((id) => `학기 미지정 · ${courseName(id)}`);
  const oldScenarios = Object.entries(object(d.plans)).map(([key, ids]) => `학기 미지정 · ${key}안: ${values(ids).map(courseName).join(', ') || '비어 있음'}`);
  const lms = object(d.lms);
  const lmsCourses = list(lms.courses).map((c) => object(c)).map((c) => text(c.title)).filter(Boolean);
  const ruleOverrides = Object.entries(object(d.ruleOverrides)).map(([name, value]) => {
    const rule = DEFAULT_RULES.find((item) => item.id === name);
    return `${rule?.label ?? name}: ${text(value)}${rule?.unit ?? (rule ? '학점' : '')}`;
  });
  const profile = [['이름', d.name], ['학과', d.dept], ['입학연도', d.year], ['직접 입력한 이수학점', d.credits], ['직접 입력한 비교과 포인트', d.points]]
    .map(([label, value]) => `${text(label)}: ${text(value) || '미입력'}`);
  const info = object(d.info);
  const schoolCourses = list(info.completed).map((v) => object(v)).map((c) => [text(c.name), text(c.category), text(c.credits) && `${text(c.credits)}학점`].filter(Boolean).join(' · ')).filter(Boolean);
  const schoolSummary = [['수집일', info.fetchedAt], ['취득학점', info.credits], ['비교과 포인트', info.points], ['평점', info.gpa]].filter(([, value]) => value !== undefined && value !== null && value !== '').map(([label, value]) => `${text(label)}: ${text(value)}`);
  const stages = Object.entries(object(d.actStatus)).map(([id, status]) => `${activityName(id)} · ${ACT_STAGES.find(([key]) => key === status)?.[1] ?? text(status)}`);
  return <>
        <SavedList title="프로필 · 수정 가능" items={profile} />
        <SavedList title="직접 입력한 이수 과목" items={completed} />
        <SavedList title="학교에서 수집한 학사 정보" items={schoolSummary} />
        <SavedList title="학교에서 수집한 이수 과목" items={schoolCourses} />
        <SavedList title="학기별 계획 및 시간표 안" items={[...oldPlans, ...oldScenarios, ...plans]} />
        <SavedList title="저장한 활동" items={values(d.saved).map(activityName)} />
        <SavedList title="활동 진행 기록" items={stages} />
        <SavedList title="직접 등록한 활동" items={ext} />
        <SavedList title="개인 일정" items={events} />
        <SavedList title="수업 및 비교과 선호" items={[...values(d.prefs), ...values(d.actPrefs)]} />
        <SavedList title="졸업요건 개인 설정" items={ruleOverrides} />
        <SavedList title={`저장된 COSMOS 과목${text(lms.fetchedAt) ? ` · ${text(lms.fetchedAt).slice(0, 10)} 수집` : ''}`} items={lmsCourses} />
        <p className="meta">과목·활동 이름을 찾지 못한 항목은 저장된 식별자로 표시합니다. 상세 현황은 각 메뉴에서 확인할 수 있습니다.</p>
  </>;
}

export function DemoStorage({ catalog, activities, onReset, revision }: {
  catalog: Catalog | null;
  activities: ActivitySnapshot | null;
  onReset: () => boolean;
  revision: unknown;
}) {
  const [stored, setStored] = useState<LoadState>({ status: 'loading' });
  const read = () => {
    try { setStored(parseDemoStorage(localStorage.getItem(DEMO_STORAGE_KEY))); }
    catch { setStored({ status: 'unavailable' }); }
  };
  /* oxlint-disable react/react-compiler -- 브라우저 저장 공간은 클라이언트에서만 읽는다. */
  useEffect(() => {
    read();
    const onStorage = (event: StorageEvent) => { if (event.key === DEMO_STORAGE_KEY || event.key === null) read(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [revision]);
  /* oxlint-enable react/react-compiler */

  return <section className="demo-storage">
    <h3>이 브라우저의 체험 데이터</h3>
    <p className="meta">이 기기에 저장된 체험 정보입니다. 계정에 저장된 정보와는 별도로 관리됩니다.</p>
    {stored.status === 'loading' ? <p>저장 상태를 확인하고 있습니다.</p>
      : stored.status === 'unavailable' ? <p role="alert">브라우저 저장 공간을 읽지 못했습니다.</p>
      : stored.status === 'empty' ? <p>저장된 체험 정보가 없습니다.</p>
      : stored.status === 'invalid' ? <p role="alert">저장된 체험 정보를 읽을 수 없습니다. 초기화할 수 있습니다.</p>
      : <details className="stored-preview"><summary>저장된 체험 정보 확인</summary>
          <StoredDataView data={stored.value} catalog={catalog} activities={activities} />
        </details>}
    {(stored.status === 'saved' || stored.status === 'invalid') && <button className="secondary danger" onClick={() => {
      if (window.confirm('이 브라우저의 체험 프로필, 이수 내역, 계획, 일정과 저장한 수업 현황을 모두 지울까요?')) {
        if (onReset()) read();
      }
    }}>체험 데이터 초기화</button>}
  </section>;
}
