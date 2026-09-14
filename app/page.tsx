'use client';
import { useState, useEffect, useRef } from 'react';
import {
  GraduationCap,
  Home,
  LayoutGrid,
  Compass,
  CalendarDays,
  Sparkles,
  Layers,
  BookOpen,
  User,
  Settings,
  Bell,
  Search,
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Check,
  Plus,
} from 'lucide-react';
const menus = [
  ['home', '홈', Home],
  ['timetable', '시간표 짜기', LayoutGrid],
  ['activities', '비교과·대외활동', Compass],
  ['calendar', '학사일정', CalendarDays],
  ['advisor', 'AI 상담', Sparkles],
  ['graduation', '졸업요건', GraduationCap],
  ['semester-plan', '학기별 계획', Layers],
  ['courses', '과목 추천', BookOpen],
] as const;
const acts = [
  {
    id: 'creative',
    type: '교내 비교과',
    title: '아이디어가 프로젝트가 되는 순간',
    name: '창의융합 프로젝트 워크숍',
    desc: '관심 있는 문제를 발견하고, 팀과 함께 나만의 해결책을 만들어 보세요.',
    date: '2026-09-25',
    period: '10. 5. — 10. 23.',
    tag: '프로젝트 · 진로 탐색',
    art: 'CREATE',
    en: 'DESIGN YOUR NEXT STEP',
  },
  {
    id: 'career',
    type: '교내 비교과',
    title: '나의 다음 커리어를 발견하세요',
    name: '직무 탐색 & 포트폴리오 클래스',
    desc: '실무자의 이야기에서 하고 싶은 일을 발견하고, 나만의 포트폴리오를 구상해 보세요.',
    date: '2026-09-28',
    period: '10. 6. — 10. 8.',
    tag: '커리어 · 포트폴리오',
    art: 'NEXT',
    en: 'FIND YOUR DIRECTION',
  },
  {
    id: 'outside',
    type: '대외활동',
    title: '캠퍼스 밖으로, 한 걸음 더',
    name: '대학생 지역문제 해결 챌린지',
    desc: '작은 관찰에서 시작하는 새로운 도전. 다양한 전공의 학생들과 협업을 경험하세요.',
    date: '2026-10-02',
    period: '10. 12. — 11. 6.',
    tag: '협업 · 사회문제 해결',
    art: 'GROW',
    en: 'BEYOND THE CAMPUS',
  },
];
const courses = [
  {
    id: 'web',
    name: '웹 프로그래밍',
    kind: '전공',
    style: '실습',
    day: 0,
    time: 10,
  },
  {
    id: 'data',
    name: '데이터 분석 기초',
    kind: '전공',
    style: '프로젝트',
    day: 2,
    time: 13,
  },
  {
    id: 'writing',
    name: '창의적 사고와 글쓰기',
    kind: '교양',
    style: '이론',
    day: 1,
    time: 10,
  },
  {
    id: 'ux',
    name: '사용자 경험 디자인',
    kind: '전공',
    style: '프로젝트',
    day: 3,
    time: 13,
  },
];
type Data = {
  name: string;
  year: string;
  dept: string;
  credits: string;
  points: string;
  saved: string[];
  planned: string[];
  events: { title: string; date: string }[];
  prefs: string[];
  read: boolean;
  consent: boolean;
};
const empty: Data = {
  name: '한성인',
  year: '2024',
  dept: '소속 미입력',
  credits: '',
  points: '',
  saved: [],
  planned: [],
  events: [],
  prefs: [],
  read: false,
  consent: false,
};
const questions = [
  [
    '이번 학기의 우선 목표는 무엇인가요?',
    '졸업요건 충족',
    '전공 심화',
    '진로 탐색',
    '일정 여유',
  ],
  ['선호하는 수업 시간은 언제인가요?', '오전', '오후', '상관없음'],
  ['수업이 어려운 요일이 있나요?', '없음', '월요일', '금요일'],
  ['어떤 수업 방식을 선호하나요?', '이론', '실습', '프로젝트', '상관없음'],
  [
    '선호하는 평가 방식은 무엇인가요?',
    '시험',
    '개인 과제',
    '팀 프로젝트',
    '상관없음',
  ],
  ['어떤 학기 구성을 원하나요?', '공강일 확보', '고른 배치', '상관없음'],
];
export default function App() {
  const [data, setData] = useState<Data>(empty),
    [ready, setReady] = useState(false),
    [route, setRoute] = useState('home'),
    [drawer, setDrawer] = useState(false),
    [slide, setSlide] = useState(0),
    [filter, setFilter] = useState('전체'),
    [query, setQuery] = useState(''),
    [toast, setToast] = useState(''),
    [survey, setSurvey] = useState(false),
    [step, setStep] = useState(0),
    [draft, setDraft] = useState<string[]>([]),
    [answer, setAnswer] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  // Browser storage is read after hydration to keep the initial server render stable.
  /* oxlint-disable react/react-compiler -- Hydrate device-local browser state after server render. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem('hansung-demo-v1');
      if (raw) {
        const d = JSON.parse(raw);
        if (
          Array.isArray(d.saved) &&
          Array.isArray(d.planned) &&
          Array.isArray(d.events)
        ) {
          setData({ ...empty, ...d });
          setDraft(d.prefs || []);
        }
      }
    } catch {
      setToast('저장 정보를 읽지 못해 새 체험으로 시작합니다.');
    }
    setReady(true);
    const sync = () => setRoute(location.hash.slice(1) || 'home');
    sync();
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (survey) dialog.current?.showModal();
    else dialog.current?.close();
  }, [survey]);
  function persist(next: Data, msg = '이 브라우저에 저장했습니다.') {
    try {
      localStorage.setItem('hansung-demo-v1', JSON.stringify(next));
      setData(next);
      if (msg) setToast(msg);
      return true;
    } catch {
      setToast('저장하지 못했습니다. 브라우저 저장 공간과 설정을 확인하세요.');
      return false;
    }
  }
  function go(r: string) {
    location.hash = r;
    setRoute(r);
    setDrawer(false);
    scrollTo(0, 0);
  }
  function save(id: string) {
    persist(
      {
        ...data,
        saved: data.saved.includes(id)
          ? data.saved.filter((x) => x !== id)
          : [...data.saved, id],
      },
      data.saved.includes(id)
        ? '활동 저장을 해제했습니다.'
        : '활동을 저장했습니다.',
    );
  }
  function plan(id: string) {
    persist(
      {
        ...data,
        planned: data.planned.includes(id)
          ? data.planned.filter((x) => x !== id)
          : [...data.planned, id],
      },
      '개인 학기 계획을 변경했습니다. 공식 수강신청과는 별개입니다.',
    );
  }
  const section = route.split('/')[0],
    detail = route.split('/')[1],
    active = acts[slide],
    planned = courses.filter((c) => data.planned.includes(c.id));
  const label =
    menus.find((m) => m[0] === section)?.[1] ||
    (
      {
        profile: '내 정보',
        settings: '설정',
        notifications: '알림함',
      } as Record<string, string>
    )[section] ||
    '상세 정보';
  const activityCards = (items: typeof acts) => (
    <div className="cards">
      {items.map((a, i) => (
        <article className="card activity" key={a.id}>
          <div className={'mini-art art' + i}>
            <span>{a.en}</span>
            <strong>
              {a.art}
              <span>↗</span>
            </strong>
            <small>HANSUNG · SAMPLE PROGRAM</small>
          </div>
          <div className="pad">
            <div className="between">
              <span className="badge">{a.type}</span>
              <button
                className={'icon ' + (data.saved.includes(a.id) ? 'saved' : '')}
                aria-label="활동 저장 전환"
                onClick={() => save(a.id)}
              >
                <Bookmark size={19} />
              </button>
            </div>
            <h3>
              <button
                className="text-title"
                onClick={() => go('activities/' + a.id)}
              >
                {a.name}
              </button>
            </h3>
            <p>{a.desc}</p>
            <small>모집 마감 {a.date} · 체험용</small>
            <div>
              <button className="link" onClick={() => go('activities/' + a.id)}>
                자세히 보기 <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
  return (
    <div className="shell">
      <aside className={'sidebar ' + (drawer ? 'open' : '')}>
        <button className="brand" onClick={() => go('home')}>
          <span className="brand-icon">
            <GraduationCap size={23} />
          </span>
          <span>
            한성 학사 도우미<small>MY ACADEMIC COMPASS</small>
          </span>
        </button>
        <div className="nav-caption">MY CAMPUS</div>
        <nav>
          {menus.map(([key, name, Icon]) => (
            <button
              key={key}
              className={section === key ? 'selected' : ''}
              onClick={() => go(key)}
            >
              <Icon size={20} />
              {name}
              {key === 'advisor' && <span className="tiny">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-mini">
            <span className="avatar">{data.name.slice(0, 1)}</span>
            <div>
              <b>{data.name}</b>
              <small>체험 프로필 · 학교 인증 미완료</small>
            </div>
          </div>
          <button onClick={() => go('profile')}>
            <User size={19} />내 정보
          </button>
          <button onClick={() => go('settings')}>
            <Settings size={19} />
            설정
          </button>
          <small className="footnote">한성대학교 비공식 학사 계획 도구</small>
        </div>
      </aside>
      {drawer && (
        <button
          className="scrim"
          aria-label="메뉴 닫기"
          onClick={() => setDrawer(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon mobile"
            aria-label="메뉴 열기"
            onClick={() => setDrawer(true)}
          >
            <Menu />
          </button>
          <span className="top-label">나의 대학 생활, 한곳에서</span>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              go('activities');
            }}
          >
            <Search size={18} />
            <input
              placeholder="관심 있는 활동을 찾아보세요"
              aria-label="활동 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <button
            className="icon notification"
            aria-label="알림함"
            onClick={() => go('notifications')}
          >
            <Bell size={20} />
            {!data.read && <i />}
          </button>
          <button
            className="avatar small"
            aria-label="내 정보"
            onClick={() => go('profile')}
          >
            {data.name.slice(0, 1)}
          </button>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                MY CAMPUS / {section === 'home' ? 'OVERVIEW' : label}
              </div>
              <h1>
                {section === 'home' ? `${data.name}님, 반가워요.` : label}
                {section === 'home' && <span className="greeting">✳</span>}
              </h1>
              <p>
                {section === 'home'
                  ? '이번 주의 작은 선택이, 다음 학기를 만들어가요.'
                  : '필요한 정보를 확인하고 다음 계획으로 연결하세요.'}
              </p>
            </div>
            <span className="date-label">
              2026학년도 2학기 <span className="badge">체험용</span>
            </span>
          </div>
          <div className="demo-note">
            <span>
              <b>공개 체험 사이트</b> · 활동·과목은 예시이며 저장 내용은 이
              브라우저에만 남습니다. 실제 학사자료는 입력하지 마세요.
            </span>
            <button onClick={() => go('settings/connections')}>
              연결 상태 <ArrowRight size={15} />
            </button>
          </div>
          {!ready ? (
            <div className="card pad">체험 정보를 불러오고 있습니다…</div>
          ) : section === 'home' ? (
            <>
              <div className="hero-grid">
                <section className="hero card">
                  <div className="hero-copy">
                    <span className="badge blue">
                      {active.type} · 체험 프로그램
                    </span>
                    <h2>{active.title}</h2>
                    <p>{active.desc}</p>
                    <div className="hero-meta">
                      <span>
                        모집 마감 <b>{active.date.replaceAll('-', '. ')}</b>
                      </span>
                      <span>
                        추천 키워드 <b>{active.tag}</b>
                      </span>
                    </div>
                    <div className="actions">
                      <button
                        className="primary"
                        onClick={() => go('activities/' + active.id)}
                      >
                        자세히 보기 <ArrowUpRight size={17} />
                      </button>
                      <button
                        className="secondary"
                        onClick={() => save(active.id)}
                      >
                        <Bookmark size={17} />
                        {data.saved.includes(active.id) ? '저장됨' : '저장'}
                      </button>
                    </div>
                  </div>
                  <div className="hero-art">
                    <span>{active.en}</span>
                    <div className="orb">
                      <div className="orbit" />
                      <span>✳</span>
                    </div>
                    <strong>
                      {active.art}
                      <br />
                      <em>YOUR WAY.</em>
                    </strong>
                    <small>새로운 가능성을 만나는 캠퍼스</small>
                  </div>
                  <div className="carousel">
                    <span>
                      추천 활동 <b>0{slide + 1}</b> / 03
                    </span>
                    <div>
                      <button
                        className="icon"
                        aria-label="이전 활동"
                        onClick={() => setSlide((slide + 2) % 3)}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        className="icon"
                        aria-label="다음 활동"
                        onClick={() => setSlide((slide + 1) % 3)}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </section>
                <section className="card next-card">
                  <div className="between">
                    <h3>나의 다음 한 걸음</h3>
                    <Compass size={21} />
                  </div>
                  <div className="next-symbol">↗</div>
                  <h2>
                    어떤 학기를
                    <br />
                    만들고 싶나요?
                  </h2>
                  <p>
                    수업 선호를 알려주면
                    <br />
                    나에게 맞는 선택을 시작할 수 있어요.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setStep(0);
                      setSurvey(true);
                    }}
                  >
                    {data.prefs.length
                      ? '수업 선호 수정하기'
                      : '맞춤 추천 설정하기'}{' '}
                    <ArrowRight size={17} />
                  </button>
                  <small>6문항 · 선택 입력</small>
                </section>
              </div>
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
                    ],
                    [
                      '총 이수학점',
                      data.credits ? data.credits + ' 학점' : '입력 전',
                      data.credits
                        ? '사용자 입력 · 미검증'
                        : '내 정보에서 입력할 수 있어요',
                    ],
                    [
                      '비교과 포인트',
                      data.points ? data.points + ' P' : '입력 전',
                      data.points
                        ? '사용자 입력 · 미검증'
                        : '학교 인정 내역 확인 필요',
                    ],
                    [
                      '다음 학기 계획',
                      planned.length * 3 + ' 학점',
                      planned.length + '개 과목 · 이수학점과 별도',
                    ],
                  ].map(([l, v, s]) => (
                    <div className="card stat" key={l}>
                      <span>{l}</span>
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
                    코스모스에 연결된 과제·출석 정보는 아직 없습니다. 학교 학습
                    시스템에서 확인해 주세요.
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
          ) : section === 'activities' ? (
            (() => {
              const a = acts.find((x) => x.id === detail);
              if (detail)
                return a ? (
                  <>
                    <button
                      className="link breadcrumb"
                      onClick={() => go('activities')}
                    >
                      홈 / 비교과·대외활동 / {a.name}
                    </button>
                    <section className="card detail">
                      <span className="badge">{a.type} · 체험용 데이터</span>
                      <h2>{a.name}</h2>
                      <p>{a.desc}</p>
                      <div className="detail-grid">
                        {[
                          ['모집 마감', a.date],
                          ['운영 기간', a.period],
                          ['대상', '대학생 · 예시'],
                          ['비교과 인정', '인정 여부 확인 필요'],
                        ].map(([l, v]) => (
                          <div key={l}>
                            <small>{l}</small>
                            <b>{v}</b>
                          </div>
                        ))}
                      </div>
                      <h3>어떤 활동인가요?</h3>
                      <p>
                        관심 분야를 직접 경험하고 결과물을 정리하는 프로그램의
                        체험 예시입니다. 실제 모집 공고가 아니며 신청할 수
                        없습니다.
                      </p>
                      <h3>이런 관심사와 연결돼요</h3>
                      <p>
                        {a.tag}. 개인 학사정보에 근거한 확정 추천은 아닙니다.
                      </p>
                      <div className="actions">
                        <button className="primary" onClick={() => save(a.id)}>
                          <Bookmark size={18} />
                          {data.saved.includes(a.id)
                            ? '저장 해제'
                            : '활동 저장'}
                        </button>
                        <button
                          className="secondary"
                          onClick={() => go('calendar')}
                        >
                          개인 일정 추가
                        </button>
                      </div>
                      <p className="meta">
                        출처: 체험용 예시 · 실제 모집 일정 확인 안 됨
                      </p>
                      <a
                        className="link"
                        href="https://hsportal.hansung.ac.kr/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        학교 스마트자기관리시스템 열기{' '}
                        <ArrowUpRight size={16} />
                      </a>
                    </section>
                  </>
                ) : (
                  <div className="card pad">
                    활동을 찾을 수 없습니다.
                    <button onClick={() => go('activities')}>목록으로</button>
                  </div>
                );
              const items = acts.filter(
                (a) =>
                  (filter === '전체' ||
                    filter === a.type ||
                    (filter === '저장한 활동' && data.saved.includes(a.id))) &&
                  (a.name + a.desc + a.tag).includes(query),
              );
              return (
                <>
                  <div className="toolbar">
                    <div className="tabs">
                      {['전체', '교내 비교과', '대외활동', '저장한 활동'].map(
                        (f) => (
                          <button
                            className={filter === f ? 'active' : ''}
                            key={f}
                            onClick={() => setFilter(f)}
                          >
                            {f}
                            {f === '저장한 활동' ? ' ' + data.saved.length : ''}
                          </button>
                        ),
                      )}
                    </div>
                    <input
                      className="field"
                      aria-label="활동명 검색"
                      placeholder="활동명, 관심 키워드 검색"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  {items.length ? (
                    activityCards(items)
                  ) : (
                    <div className="card empty-small">
                      <Search />
                      <h3>조건에 맞는 활동이 없어요.</h3>
                      <button
                        className="secondary"
                        onClick={() => {
                          setFilter('전체');
                          setQuery('');
                        }}
                      >
                        필터 초기화
                      </button>
                    </div>
                  )}
                </>
              );
            })()
          ) : section === 'profile' ? (
            <section className="card detail">
              <div className="profile-mini">
                <span className="avatar large">{data.name.slice(0, 1)}</span>
                <div>
                  <h2>{data.name}님의 프로필</h2>
                  <span className="badge">학교 인증 미완료</span>
                </div>
              </div>
              <p>
                체험용 별칭과 예시 수치를 입력하세요. 이 브라우저에만
                저장됩니다.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  persist({
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
                저장한 활동 {data.saved.length}개 · 계획한 과목{' '}
                {data.planned.length}개 · 수업 선호{' '}
                {data.prefs.length ? '설정 완료' : '미설정'}
              </p>
              <button className="secondary" onClick={() => setSurvey(true)}>
                수업 선호 설정
              </button>
            </section>
          ) : section === 'graduation' ? (
            <>
              <div className="card pad">
                <span className="badge">확인 필요</span>
                <h2>졸업 준비는 정확한 기준부터.</h2>
                <p>
                  적용 졸업 규정과 이수 분류가 확인되지 않아 충족률을 계산하지
                  않습니다. 학교의 공식 졸업 사정을 대체하지 않습니다.
                </p>
                <button className="secondary" onClick={() => go('profile')}>
                  내 이수 정보 입력
                </button>
              </div>
              <div className="requirement-list">
                {[
                  '총 이수학점',
                  '전공 필수·선택',
                  '교양 영역',
                  '비교과 포인트',
                ].map((r, i) => (
                  <section className="card pad" key={r}>
                    <div className="between">
                      <h3>{r}</h3>
                      <span className="badge">기준 확인 필요</span>
                    </div>
                    <strong>
                      {i === 0
                        ? (data.credits || '미입력') + ' / 기준 미확정'
                        : i === 3
                          ? (data.points || '미입력') + ' / 기준 미확정'
                          : '분류 정보 미입력'}
                    </strong>
                    <div className="progress-track" />
                    <p>적용 규정과 인정 내역 확인 후 계산할 수 있습니다.</p>
                    <a
                      className="link"
                      href="https://info.hansung.ac.kr/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      종합정보시스템에서 확인 <ArrowUpRight size={16} />
                    </a>
                  </section>
                ))}
              </div>
            </>
          ) : section === 'courses' ? (
            <>
              <div className="demo-note">
                개설·시간·학점은 체험용 예시입니다. 실제 개설 정보와 수강 가능
                여부를 확인해 주세요.
              </div>
              <div className="cards">
                {courses.map((c) => (
                  <article className="card pad" key={c.id}>
                    <span className="badge">
                      {c.kind} · {c.style}
                    </span>
                    <h2>{c.name}</h2>
                    <p>
                      3학점 · {'월화수목금'[c.day]}요일 {c.time}:00
                    </p>
                    <small>추천 근거: 분야 탐색용 예시 · 개설 미확인</small>
                    <button
                      className="secondary full"
                      onClick={() => plan(c.id)}
                    >
                      {data.planned.includes(c.id) ? (
                        <Check size={17} />
                      ) : (
                        <Plus size={17} />
                      )}{' '}
                      {data.planned.includes(c.id)
                        ? '계획에서 빼기'
                        : '다음 학기 계획에 담기'}
                    </button>
                  </article>
                ))}
              </div>
            </>
          ) : section === 'semester-plan' ? (
            <section className="card detail">
              <span className="badge">개인 계획</span>
              <h2>2027학년도 1학기</h2>
              <p>
                계획 {planned.length * 3}학점 · {planned.length}개 과목. 계획
                학점은 이수학점에 포함되지 않습니다.
              </p>
              {planned.map((c) => (
                <div className="event-line" key={c.id}>
                  <BookOpen />
                  <div>
                    <b>{c.name}</b>
                    <small>{c.kind} · 3학점 · 개설 미확인</small>
                  </div>
                  <button className="secondary" onClick={() => plan(c.id)}>
                    제거
                  </button>
                </div>
              ))}
              {!planned.length && (
                <p className="empty-small">아직 계획한 과목이 없어요.</p>
              )}
              <button className="primary" onClick={() => go('courses')}>
                과목 찾아 담기 <Plus size={17} />
              </button>
            </section>
          ) : section === 'timetable' ? (
            <section className="card pad scrollable">
              <div className="between">
                <div>
                  <h2>나의 시간표 초안</h2>
                  <p>학기 계획에 담은 예시 과목 · 공식 수강신청 아님</p>
                </div>
                <button className="secondary" onClick={() => go('courses')}>
                  과목 추가 +
                </button>
              </div>
              <div className="timetable">
                <div className="week-head">
                  <span>시간</span>
                  {['월', '화', '수', '목', '금'].map((d) => (
                    <b key={d}>{d}</b>
                  ))}
                </div>
                {[9, 10, 11, 12, 13, 14, 15, 16].map((t) => (
                  <div className="week-row" key={t}>
                    <small>{t}:00</small>
                    {[0, 1, 2, 3, 4].map((d) => (
                      <div key={d}>
                        {planned
                          .filter((c) => c.day === d && c.time === t)
                          .map((c) => (
                            <button
                              className="course-block"
                              key={c.id}
                              onClick={() => go('semester-plan')}
                            >
                              {c.name}
                              <small>체험용 · 1시간 표시</small>
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ) : section === 'calendar' ? (
            <section className="card pad">
              <div className="between">
                <h2>나의 일정</h2>
                <a
                  className="link"
                  href="https://www.hansung.ac.kr/"
                  target="_blank"
                  rel="noreferrer"
                >
                  학교 공식 일정 확인 <ArrowUpRight size={16} />
                </a>
              </div>
              <form
                className="event-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    d = new FormData(form);
                  if (
                    persist(
                      {
                        ...data,
                        events: [
                          ...data.events,
                          {
                            title: d.get('title') as string,
                            date: d.get('date') as string,
                          },
                        ].sort((a, b) => a.date.localeCompare(b.date)),
                      },
                      '개인 일정을 저장했습니다.',
                    )
                  )
                    form.reset();
                }}
              >
                <input
                  name="title"
                  required
                  placeholder="개인 일정 제목"
                  aria-label="일정 제목"
                  maxLength={100}
                />
                <input
                  name="date"
                  type="date"
                  required
                  aria-label="일정 날짜"
                />
                <button className="primary">
                  일정 추가 <Plus size={16} />
                </button>
              </form>
              {data.events.length ? (
                data.events.map((e, i) => (
                  <div className="event-line" key={i}>
                    <span className="event-date">{e.date}</span>
                    <div>
                      <b>{e.title}</b>
                      <small>사용자 입력 · 개인 일정</small>
                    </div>
                    <button
                      className="icon"
                      aria-label="일정 삭제"
                      onClick={() =>
                        persist(
                          {
                            ...data,
                            events: data.events.filter((_, j) => j !== i),
                          },
                          '일정을 삭제했습니다.',
                        )
                      }
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-small">
                  <CalendarDays size={30} />
                  <h3>내 일정을 하나씩 모아보세요.</h3>
                  <p>학교·LMS 일정은 아직 연결되지 않았습니다.</p>
                </div>
              )}
            </section>
          ) : section === 'advisor' ? (
            <section className="card advisor">
              <span className="ai-mark">
                <Sparkles size={30} />
              </span>
              <h2>다음 선택, 함께 정리해 볼까요?</h2>
              <p>
                현재는 AI 연결 전입니다. 아래는 기능을 찾는 데 도움을 주는 고정
                안내 응답입니다.
              </p>
              <div className="chips">
                {[
                  '졸업요건은 어디서 확인해?',
                  '다음 학기 계획을 세우고 싶어',
                  '비교과 활동을 찾고 싶어',
                ].map((q) => (
                  <button
                    className="secondary"
                    key={q}
                    onClick={() =>
                      setAnswer(
                        q.includes('졸업')
                          ? '적용 졸업 규정이 확인되어야 충족 여부를 계산할 수 있습니다. 졸업요건 화면과 학교 종합정보시스템에서 기준을 확인하세요.'
                          : q.includes('계획')
                            ? '과목 추천에서 예시 과목을 담으면 학기별 계획과 시간표에 함께 반영됩니다. 실제 수강신청은 학교 시스템에서 진행하세요.'
                            : '비교과·대외활동에서 활동을 찾아 저장할 수 있습니다. 현재 목록은 체험 예시입니다.',
                      )
                    }
                  >
                    {q}
                  </button>
                ))}
              </div>
              {answer && (
                <div className="answer">
                  <p>{answer}</p>
                  <small>근거: 이 사이트의 기능 안내 · AI 생성 답변 아님</small>
                </div>
              )}
              <div className="actions">
                <button className="link" onClick={() => go('graduation')}>
                  졸업요건 →
                </button>
                <button className="link" onClick={() => go('semester-plan')}>
                  학기별 계획 →
                </button>
              </div>
            </section>
          ) : section === 'notifications' ? (
            <section className="card detail">
              <div className="between">
                <h2>알림함</h2>
                <button
                  className="secondary"
                  onClick={() =>
                    persist(
                      { ...data, read: true },
                      '알림을 읽음으로 표시했습니다.',
                    )
                  }
                >
                  모두 읽음
                </button>
              </div>
              <div className="event-line">
                <Bell />
                <div>
                  <b>학교 데이터 연결 전입니다.</b>
                  <small>
                    학교 인증·학습 일정·이수 내역 연결은 준비 중입니다.
                  </small>
                </div>
                <button
                  className="link"
                  onClick={() => go('settings/connections')}
                >
                  확인 →
                </button>
              </div>
              <p>푸시 알림은 발송되지 않습니다.</p>
            </section>
          ) : section === 'settings' ? (
            <section className="card detail">
              <h2>데이터 연결과 체험 설정</h2>
              {[
                '한성대학교 종합정보시스템',
                '스마트자기관리시스템',
                '코스모스 / e-Class',
              ].map((n) => (
                <div className="event-line" key={n}>
                  <Layers size={22} />
                  <div>
                    <b>{n}</b>
                    <small>
                      연동 승인과 데이터 접근 방식 확인이 필요합니다.
                    </small>
                  </div>
                  <span className="badge">준비 중 · 미연결</span>
                </div>
              ))}
              <p>
                학교 비밀번호를 수집하지 않습니다. 계정 가입과 기기 간 동기화는
                아직 제공하지 않습니다.
              </p>
              <button className="secondary" onClick={() => go('profile')}>
                체험 프로필 직접 입력
              </button>
              <div className="divider" />
              <h3>이 브라우저의 저장 공간</h3>
              <p>
                프로필, 수업 선호, 저장한 활동과 개인 계획만 브라우저에
                저장합니다. 분석 쿠키는 사용하지 않습니다.
              </p>
              <button
                className="secondary"
                onClick={() => persist({ ...data, consent: false }, '')}
              >
                저장 안내 다시 보기
              </button>
            </section>
          ) : (
            <section className="card pad">
              <h2>페이지를 찾을 수 없어요.</h2>
              <button className="primary" onClick={() => go('home')}>
                홈으로 이동
              </button>
            </section>
          )}
          <footer>
            <span>한성 학사 도우미</span>
            <span>나만의 속도로, 다음 학기를 향해.</span>
            <span>비공식 공개 체험 · 학교 연동 전</span>
          </footer>
        </main>
      </div>
      {toast && (
        <output className="toast">
          <Check size={20} />
          {toast}
          <button
            className="icon"
            aria-label="알림 닫기"
            onClick={() => setToast('')}
          >
            <X size={16} />
          </button>
        </output>
      )}
      {ready && !data.consent && (
        <div className="cookie">
          <div>
            <b>이 브라우저에서 계획을 이어가세요.</b>
            <p>
              저장 버튼을 누른 내용은 이 기기에 보관됩니다. 분석·광고 쿠키는
              사용하지 않습니다.
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => persist({ ...data, consent: true }, '')}
          >
            확인
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={() => setSurvey(false)}
        onClose={() => setSurvey(false)}
      >
        <div className="between">
          <span className="badge">수업 선호 · {step + 1} / 6</span>
          <button
            className="icon"
            aria-label="설문 닫기"
            onClick={() => setSurvey(false)}
          >
            <X />
          </button>
        </div>
        <h2>{questions[step][0]}</h2>
        <p>선택하지 않고 건너뛰어도 사이트를 이용할 수 있어요.</p>
        <div className="survey-options">
          {questions[step].slice(1).map((v) => (
            <button
              className={draft[step] === v ? 'chosen' : ''}
              key={v}
              onClick={() => {
                const next = [...draft];
                next[step] = v;
                setDraft(next);
              }}
            >
              {v}
              {draft[step] === v && <Check size={18} />}
            </button>
          ))}
        </div>
        <div className="between">
          <button className="link" onClick={() => setSurvey(false)}>
            나중에 하기
          </button>
          <div className="actions">
            {step > 0 && (
              <button className="secondary" onClick={() => setStep(step - 1)}>
                이전
              </button>
            )}
            <button
              className="primary"
              onClick={() => {
                if (step < 5) setStep(step + 1);
                else if (
                  persist(
                    { ...data, prefs: draft },
                    '수업 선호를 저장했습니다.',
                  )
                )
                  setSurvey(false);
              }}
            >
              {step === 5 ? '완료' : '다음'}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
