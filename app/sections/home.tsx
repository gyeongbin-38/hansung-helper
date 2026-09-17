'use client';
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Sparkles,
  ArrowUpRight,
  ArrowRight,
} from 'lucide-react';
import type { Data } from './data';
import type { Account } from '../account-flow';
import type { CourseSection } from '@/lib/data/catalog';

type Planned = CourseSection[];

export function Home({
  data,
  account,
  go,
  planned,
}: {
  data: Data;
  account: Account | null;
  go: (route: string) => void;
  planned: Planned;
}) {
  return (
    <>
      <section className="home-summary">
        <div className="between">
          <div>
            <span className="home-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              한성 학사 도우미
            </span>
            <h2>
              {account ? '내 수업부터 확인해요' : '내 학사 정보를 한곳에서'}
            </h2>
            <p>
              {account
                ? '코스모스에서 확인한 강의와 개인 계획을 구분해 관리해요.'
                : '학교 계정을 연결하면 실제 코스모스 강의 목록을 볼 수 있어요.'}
            </p>
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <span className="orb orb-a">
              <BookOpen size={24} />
            </span>
            <span className="orb orb-b">
              <CalendarDays size={17} />
            </span>
            <span className="orb orb-c">
              <GraduationCap size={16} />
            </span>
          </div>
        </div>
      </section>
      {account && (
        <section>
          <div className="section-heading">
            <h2>코스모스 강의</h2>
            <a
              className="link"
              href="https://learn.hansung.ac.kr/"
              target="_blank"
              rel="noreferrer"
            >
              코스모스 열기 <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="live-courses">
            {account.snapshot.courses.slice(0, 4).map((c) => (
              <article className="live-course" key={c.id}>
                <span className="badge blue">코스모스 조회</span>
                <h3>{c.name}</h3>
                <a href={c.url} target="_blank" rel="noreferrer">
                  강의실 열기 <ArrowUpRight size={16} />
                </a>
              </article>
            ))}
          </div>
          {!account.snapshot.courses.length && (
            <p>확인된 강의가 없습니다. 코스모스에서 직접 확인해 주세요.</p>
          )}
          <p className="meta">{account.snapshot.courseScope}</p>
        </section>
      )}
      <section>
        <div className="section-heading">
          <h2>
            지금 할 일 <span className="count">3</span>
          </h2>
          <span>하나씩, 차근차근</span>
        </div>
        <div className="tasks">
          {[
            [
              '01',
              '나의 학적 정보 채우기',
              '기본 프로필을 설정하세요.',
              'profile',
            ],
            [
              '02',
              '졸업 준비 현황 확인하기',
              '적용 규정과 이수 정보를 확인하세요.',
              'graduation',
            ],
            [
              '03',
              '다음 학기 그려보기',
              '관심 과목을 계획에 담아보세요.',
              'courses',
            ],
          ].map(([n, t, d, r]) => (
            <button className="task card" key={n} onClick={() => go(r)}>
              <span className="task-num">{n}</span>
              <span>
                <b>{t}</b>
                <small>{d}</small>
              </span>
              <ArrowUpRight size={19} />
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <h2>나의 학사 현황</h2>
          <button className="link" onClick={() => go('graduation')}>
            자세히 보기 <ArrowRight size={16} />
          </button>
        </div>
        <div className="stats">
          {[
            [
              '졸업요건 체크리스트',
              '계산 대기',
              '적용 졸업 규정 확인 필요',
              'lavender',
            ],
            [
              '총 이수학점',
              data.credits ? data.credits + ' 학점' : '입력 전',
              data.credits
                ? '사용자 입력 · 미검증'
                : '내 정보에서 입력할 수 있어요',
              'sky',
            ],
            [
              '비교과 포인트',
              data.points ? data.points + ' P' : '입력 전',
              data.points
                ? '사용자 입력 · 미검증'
                : '학교 인정 내역 확인 필요',
              'mint',
            ],
            [
              '다음 학기 계획',
              planned.reduce((n, s) => n + s.credits, 0) + ' 학점',
              planned.length + '개 과목 · 이수학점과 별도',
              'peach',
            ],
          ].map(([l, v, s, tone]) => (
            <div className={'card stat ' + tone} key={l}>
              <span className="stat-tag">{l}</span>
              <strong>{v}</strong>
              <small>{s}</small>
            </div>
          ))}
        </div>
      </section>
      <div className="bottom-grid">
        <section className="card pad">
          <div className="section-heading">
            <h2>다가오는 일정</h2>
            <button className="link" onClick={() => go('calendar')}>
              일정 보기 <ArrowRight size={16} />
            </button>
          </div>
          {data.events.length ? (
            data.events.slice(0, 3).map((e, i) => (
              <div className="event-line" key={i}>
                <span className="event-date">{e.date.slice(5)}</span>
                <div>
                  <b>{e.title}</b>
                  <small>개인 일정 · 사용자 입력</small>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-small">
              <CalendarDays />
              <p>아직 등록한 일정이 없어요.</p>
              <button className="link" onClick={() => go('calendar')}>
                첫 일정 추가하기 +
              </button>
            </div>
          )}
        </section>
        <section className="card pad">
          <span className="badge">학습 일정</span>
          <h2>수업의 흐름도 놓치지 않도록</h2>
          <p>
            강의 목록과 별개로 과제·출석 정보는 아직 수집하지 않습니다. 학교
            학습 시스템에서 확인해 주세요.
          </p>
          <a
            className="link"
            href="https://learn.hansung.ac.kr/"
            target="_blank"
            rel="noreferrer"
          >
            한성 e-Class 열기 <ArrowUpRight size={16} />
          </a>
        </section>
      </div>
    </>
  );
}
