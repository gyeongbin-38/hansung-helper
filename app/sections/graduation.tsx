'use client';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, Plus, Search, X } from 'lucide-react';
import { gradGroup, type Catalog, type CourseSection } from '@/lib/data/catalog';
import { evaluate, GLOBAL_RULE_SOURCE } from '@/lib/data/graduation';
import type { Completed, Data } from './data';

const CATEGORIES = ['전필', '전선', '전기', '교필', '선필교', '일교', '일선'];

export function Graduation({
  data,
  go,
  catalog,
  planned,
  persist,
}: {
  data: Data;
  go: (route: string) => void;
  catalog: Catalog | null;
  planned: CourseSection[];
  persist: (next: Data, msg?: string) => Promise<boolean>;
}) {
  const [q, setQ] = useState('');
  const [withPlan, setWithPlan] = useState(false);
  const [manual, setManual] = useState({ name: '', category: '전선', credits: '3' });
  const results = useMemo(() => {
    const year = parseInt(data.year, 10);
    const pts = parseInt(data.points, 10);
    return evaluate(data.completed, planned, data.ruleOverrides, {
      admitYear: Number.isInteger(year) ? year : undefined,
      points: Number.isInteger(pts) ? pts : undefined,
    });
  }, [data.completed, planned, data.ruleOverrides, data.year, data.points]);
  const total = results[0];
  const matches = useMemo(() => {
    if (!catalog || q.length < 2) return [];
    const done = new Set(data.completed.map((c) => c.code));
    return catalog.sections
      .filter(
        (s) =>
          !done.has(s.code) &&
          (s.name + s.code + s.dept).includes(q),
      )
      .slice(0, 8);
  }, [catalog, q, data.completed]);

  function addFromCatalog(s: CourseSection) {
    const entry: Completed = {
      code: s.code,
      name: s.name,
      category: s.category,
      credits: s.credits,
    };
    void persist(
      { ...data, completed: [...data.completed, entry] },
      '이수 과목을 저장했습니다.',
    );
    setQ('');
  }
  function addManual() {
    const name = manual.name.trim();
    const credits = parseInt(manual.credits, 10);
    if (!name || !Number.isInteger(credits) || credits < 0 || credits > 20)
      return;
    // 같은 이름의 카탈로그 과목이 있으면 실제 코드로 연결해 추천/중복 가드와 연동
    const hit = catalog?.sections.find((s) => s.name === name);
    const entry: Completed = hit
      ? {
          code: hit.code,
          name: hit.name,
          category: hit.category,
          credits: hit.credits,
        }
      : { code: '수기-' + name, name, category: manual.category, credits };
    void persist(
      { ...data, completed: [...data.completed, entry] },
      '이수 과목을 저장했습니다.',
    );
    setManual({ name: '', category: '전선', credits: '3' });
  }
  function removeCompleted(idx: number) {
    void persist(
      { ...data, completed: data.completed.filter((_, i) => i !== idx) },
      '이수 과목에서 제외했습니다.',
    );
  }
  function setRequired(id: string, value: string) {
    const n = parseInt(value, 10);
    const next = { ...data.ruleOverrides };
    if (Number.isInteger(n) && n > 0 && n <= 2000) next[id] = n;
    else delete next[id];
    void persist(
      { ...data, ruleOverrides: next },
      '졸업 기준을 저장했습니다. 입력값이며 공식 기준이 아닙니다.',
    );
  }

  const shown = (r: (typeof results)[number]) =>
    withPlan ? r.earned + r.planned : r.earned;
  const pct = (r: (typeof results)[number]) =>
    r.required ? Math.min(100, Math.round((shown(r) / r.required) * 100)) : 0;

  return (
    <>
      <div className="card pad grad-intro">
        <span className="badge green">공식 전역 기준 적용</span>
        <span className="badge">사용자 입력 기반</span>
        <h2>졸업 준비는 정확한 기준부터.</h2>
        <p>
          입력한 이수 과목으로 이수구분별 충족률을 계산합니다. 총 이수학점·
          비교과 포인트는 학교 공식 전역 기준(2016학번 이후)을 적용하고,
          학과별 세부 요건은 확인이 필요합니다. 학교의 공식 졸업 사정을
          대체하지 않습니다.
        </p>
        <p className="meta">
          기준 출처:{' '}
          <a href={GLOBAL_RULE_SOURCE.url} target="_blank" rel="noreferrer">
            {GLOBAL_RULE_SOURCE.label}
          </a>{' '}
          · 확인일 {GLOBAL_RULE_SOURCE.asOf}
          {!data.year && ' · 입학연도 미입력 — 2016학번 이후 기준을 참고값으로 표시 중'}
        </p>
        <progress
          className="progress-track"
          aria-label="전체 졸업요건 충족률"
          aria-valuetext={
            total.required === null ? '기준 미확정' : `${pct(total)}%`
          }
          max={100}
          value={pct(total)}
        />
        <strong>
          {shown(total)}
          {total.required === null ? ' 이수 / 기준 미확정' : ` / ${total.required} 이수`}
        </strong>
        {total.planned > 0 && !withPlan && (
          <p className="meta">+{total.planned}학점 계획 중</p>
        )}
        <label className="check-line">
          <input
            type="checkbox"
            checked={withPlan}
            onChange={(e) => setWithPlan(e.target.checked)}
          />
          계획 과목까지 포함해서 보기
        </label>
        <button className="secondary" onClick={() => go('profile')}>
          프로필에서 소속·입학연도 수정
        </button>
      </div>

      <div className="requirement-list">
        {results.map((r) => (
          <section className="card pad" key={r.rule.id}>
            <div className="between">
              <h3>{r.rule.label}</h3>
              {r.status === 'met' ? (
                <span className="badge green">충족</span>
              ) : r.status === 'unknown' ? (
                <span className="badge orange">기준 확인 필요</span>
              ) : (
                <span className="badge purple">진행 중</span>
              )}
            </div>
            <strong>
              {shown(r)}
              {r.required === null
                ? ` ${r.rule.unit ?? '학점'}`
                : ` / ${r.required}${r.rule.unit ?? '학점'}`}
            </strong>
            <progress
              className="progress-track"
              aria-label={r.rule.label + ' 충족률'}
              aria-valuetext={
                r.required === null ? '기준 미확정' : `${pct(r)}%`
              }
              max={100}
              value={pct(r)}
            />
            {r.planned > 0 && !withPlan && (
              <p className="meta">+{r.planned}학점 계획 중</p>
            )}
            {r.rule.source === 'points' && !(data.points ?? '').trim() && (
              <p className="meta">
                누적 포인트 미입력 — 내 정보에서 입력하면 계산됩니다.
              </p>
            )}
            <label className="rule-target">
              필요 {r.rule.unit ?? '학점'}
              <input
                type="number"
                min={1}
                max={2000}
                defaultValue={r.required ?? ''}
                placeholder="미확정"
                aria-label={r.rule.label + ' 필요 학점'}
                key={r.rule.id + ':' + (r.required ?? '')}
                onBlur={(e) => setRequired(r.rule.id, e.target.value)}
              />
            </label>
            {r.rule.note && <p className="meta">{r.rule.note}</p>}
          </section>
        ))}
      </div>

      <section className="card pad">
        <div className="between">
          <h3>이수한 과목</h3>
          <span className="badge">사용자 입력</span>
        </div>
        <p>
          이미 이수한 과목을 입력하면 졸업 충족률과 과목 추천에 반영됩니다.
          학교 기록과 다를 수 있으니 정확한 내역은 종합정보시스템에서 확인하세요.
        </p>
        <label className="cat-search">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="이수한 과목 검색"
            placeholder="과목명·코드로 검색해 이수 과목 추가"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {matches.map((s) => (
          <div className="event-line" key={s.id}>
            <Check />
            <div>
              <b>{s.name}</b>
              <small>
                {s.dept} · {s.category} · {s.credits}학점
              </small>
            </div>
            <button
              className="secondary"
              onClick={() => addFromCatalog(s)}
              aria-label={s.name + ' 이수 완료로 추가'}
            >
              이수 완료로 추가
            </button>
          </div>
        ))}
        {catalog && q.length >= 2 && !matches.length && (
          <p className="meta">카탈로그에서 찾지 못했습니다 — 아래에서 직접 추가하세요.</p>
        )}
        <div className="manual-add">
          <input
            aria-label="과목명 직접 입력"
            placeholder="과목명 (카탈로그에 없는 과목)"
            value={manual.name}
            onChange={(e) => setManual({ ...manual, name: e.target.value })}
          />
          <select
            aria-label="이수구분"
            value={manual.category}
            onChange={(e) => setManual({ ...manual, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            aria-label="학점"
            type="number"
            min={0}
            max={20}
            value={manual.credits}
            onChange={(e) => setManual({ ...manual, credits: e.target.value })}
          />
          <button
            className="secondary"
            onClick={addManual}
            disabled={!manual.name.trim()}
          >
            <Plus size={15} /> 추가
          </button>
        </div>
        {data.completed.map((c, i) => (
          <div className="event-line" key={c.code + i}>
            <Check />
            <div>
              <b>{c.name}</b>
              <small>
                {c.category} · {c.credits}학점 · {gradGroup(c.category)}
              </small>
            </div>
            <button
              className="secondary"
              onClick={() => removeCompleted(i)}
              aria-label={c.name + ' 이수 목록에서 제거'}
            >
              <X size={15} />
            </button>
          </div>
        ))}
        {!data.completed.length && (
          <p className="empty-small">아직 입력한 이수 과목이 없어요.</p>
        )}
        <a
          className="link"
          href="https://info.hansung.ac.kr/"
          target="_blank"
          rel="noreferrer"
        >
          종합정보시스템에서 이수 내역 확인 <ArrowUpRight size={16} />
        </a>
      </section>
    </>
  );
}
