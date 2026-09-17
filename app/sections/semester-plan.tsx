'use client';
import { BookOpen, Plus } from 'lucide-react';
import { slotsLabel, type CourseSection } from '@/lib/data/catalog';

export function SemesterPlan({
  planned,
  plan,
  go,
  semester,
}: {
  planned: CourseSection[];
  plan: (id: string) => void;
  go: (route: string) => void;
  semester?: string;
}) {
  const credits = planned.reduce((n, s) => n + s.credits, 0);
  const semLabel = semester
    ? semester.replace(/(\d{4})-(\d)/, '$1학년도 $2학기')
    : '다음 학기';
  return (
    <section className="card detail plan">
      <div className="between">
        <span className="badge purple">개인 계획</span>
        <span className="badge">공식 수강신청 아님</span>
      </div>
      <h2>{semLabel} 계획</h2>
      <div className="plan-summary">
        <div>
          <strong>{credits}</strong>
          <span>계획 학점</span>
        </div>
        <div>
          <strong>{planned.length}</strong>
          <span>담은 과목</span>
        </div>
        <div>
          <strong>
            {new Set(
              planned.flatMap((s) => s.slots.map((sl) => sl.d)),
            ).size || 0}
          </strong>
          <span>등교 요일</span>
        </div>
      </div>
      <p>계획 학점은 이수학점에 포함되지 않습니다.</p>
      {planned.map((s) => (
        <div className="event-line" key={s.id}>
          <BookOpen />
          <div>
            <b>{s.name}</b>
            <small>
              {s.dept} · {s.section}분반 · {slotsLabel(s)}
            </small>
          </div>
          <span className="badge">
            {s.category} · {s.credits}학점
          </span>
          <button className="secondary" onClick={() => plan(s.id)}>
            제거
          </button>
        </div>
      ))}
      {!planned.length && (
        <p className="empty-small">아직 계획한 과목이 없어요.</p>
      )}
      <button className="primary" onClick={() => go('timetable')}>
        시간표에서 담기 <Plus size={17} />
      </button>
    </section>
  );
}
