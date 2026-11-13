'use client';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { X } from 'lucide-react';
import type { Data } from './sections/data';

type Pose = 'idle' | 'wave' | 'walk';

/** 3D툰 스타일 HSU 거북이 — 어깨·엉덩이·목 관절로 손발을 움직이는 2D 리깅 캐릭터. */
export function MascotFigure({
  pose = 'idle',
  className = '',
}: {
  pose?: Pose;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const paint = (name: string) => `url(#${uid}-${name})`;
  return (
    <svg
      className={`mascot-figure pose-${pose}${className ? ' ' + className : ''}`}
      viewBox="0 0 240 260"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${uid}-hood`} cx="35%" cy="22%" r="85%">
          <stop offset="0%" stopColor="#2F63AF" />
          <stop offset="52%" stopColor="#103B80" />
          <stop offset="100%" stopColor="#082657" />
        </radialGradient>
        <radialGradient id={`${uid}-face`} cx="42%" cy="28%" r="82%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="68%" stopColor="#F7FAFF" />
          <stop offset="100%" stopColor="#E7EFFA" />
        </radialGradient>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1D4A8B" />
          <stop offset="100%" stopColor="#0A2F73" />
        </linearGradient>
        <radialGradient id={`${uid}-mitten`} cx="38%" cy="26%" r="82%">
          <stop offset="0%" stopColor="#2C5EA8" />
          <stop offset="100%" stopColor="#0A2F73" />
        </radialGradient>
        <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D8E5F7" />
          <stop offset="58%" stopColor="#B7CDEA" />
          <stop offset="100%" stopColor="#8CAEDB" />
        </linearGradient>
        <linearGradient id={`${uid}-bow`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#DEE7F6" />
        </linearGradient>
        <linearGradient id={`${uid}-foot`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E4ECF8" />
        </linearGradient>
        <clipPath id={`${uid}-shell-clip`}>
          <ellipse cx="176" cy="176" rx="46" ry="50" />
        </clipPath>
      </defs>
      <g className="mascot-shadow">
        <ellipse cx="120" cy="246" rx="70" ry="8" fill="#0A2F73" opacity="0.16" />
      </g>
      <g className="mascot-character">
        <g className="mascot-shell">
          <ellipse
            cx="176"
            cy="176"
            rx="46"
            ry="50"
            fill={paint('shell')}
            stroke="#F3F7FE"
            strokeWidth="7"
          />
          <g
            clipPath={`url(#${uid}-shell-clip)`}
            fill="none"
            stroke="#0A2F73"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.78"
          >
            <circle cx="176" cy="176" r="11" />
            <path d="M176 165 L176 124 M187 173 L218 158 M185 186 L208 208 M169 187 L146 206 M165 174 L134 166 M170 164 L158 136" />
          </g>
          <path
            d="M144 140 c 10 -12 30 -16 44 -6"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.5"
          />
        </g>
        <g className="rig-leg rig-leg-l">
          <rect
            x="84"
            y="204"
            width="34"
            height="38"
            rx="16"
            fill={paint('foot')}
          />
          <ellipse cx="101" cy="235" rx="15" ry="7" fill="#C9D8EE" opacity="0.35" />
        </g>
        <g className="rig-leg rig-leg-r">
          <rect
            x="124"
            y="204"
            width="34"
            height="38"
            rx="16"
            fill={paint('foot')}
          />
          <ellipse cx="141" cy="235" rx="15" ry="7" fill="#C9D8EE" opacity="0.35" />
        </g>
        <path
          className="mascot-torso"
          d="M120 138 C86 138 68 156 68 182 L68 204 C68 216 77 224 90 224 L150 224 C163 224 172 216 172 204 L172 182 C172 156 154 138 120 138 Z"
          fill={paint('body')}
        />
        <path
          d="M76 206 C96 216 144 216 164 206 L164 204 C164 216 155 224 142 224 L98 224 C85 224 76 216 76 204 Z"
          fill="#061E4C"
          opacity="0.35"
        />
        <text
          x="120"
          y="204"
          textAnchor="middle"
          fontFamily="'Pretendard Variable', Pretendard, sans-serif"
          fontSize="27"
          fontWeight="800"
          letterSpacing="1"
          fill="#FFFFFF"
        >
          HSU
        </text>
        <g className="rig-head">
          <circle cx="120" cy="100" r="70" fill={paint('hood')} />
          <path
            d="M63 88 C70 54 98 37 126 39"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.16"
          />
          <ellipse cx="120" cy="106" rx="54" ry="46" fill={paint('face')} />
          <path
            d="M111 78 c-7 -1 -10 -7 -6 -11 c4 -3 9 0 8 4 c-1 3 -5 3 -6 0"
            fill="none"
            stroke="#0A2F73"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M88 100 q8 -11 16 0"
            fill="none"
            stroke="#0A2F73"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <path
            d="M136 100 q8 -11 16 0"
            fill="none"
            stroke="#0A2F73"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <circle cx="80" cy="121" r="13" fill="#B7CDEA" opacity="0.92" />
          <circle cx="160" cy="121" r="13" fill="#B7CDEA" opacity="0.92" />
          <path
            d="M113 117 q7 8 14 0"
            fill="none"
            stroke="#0A2F73"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </g>
        <g className="mascot-bow">
          <ellipse
            cx="101"
            cy="155"
            rx="16"
            ry="11"
            transform="rotate(-16 101 155)"
            fill={paint('bow')}
          />
          <ellipse
            cx="139"
            cy="155"
            rx="16"
            ry="11"
            transform="rotate(16 139 155)"
            fill={paint('bow')}
          />
          <path
            d="M113 158 l-7 13 M127 158 l7 13"
            stroke="#E3EBF8"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <circle cx="120" cy="157" r="8" fill="#FFFFFF" />
          <circle cx="117.5" cy="154" r="2.4" fill="#E3EBF8" />
        </g>
        <g className="rig-arm rig-arm-l">
          <ellipse cx="60" cy="187" rx="20" ry="24" fill={paint('mitten')} />
          <ellipse cx="54" cy="179" rx="7" ry="9" fill="#FFFFFF" opacity="0.16" />
        </g>
        <g className="rig-arm rig-arm-r">
          <ellipse cx="180" cy="187" rx="20" ry="24" fill={paint('mitten')} />
          <ellipse cx="174" cy="179" rx="7" ry="9" fill="#FFFFFF" opacity="0.16" />
        </g>
      </g>
    </svg>
  );
}

type GuideAction = {
  label: string;
  primary?: boolean;
  run: () => void;
};

const TIPS: Record<string, string> = {
  home: '오른쪽 위 알림함에서 이번 주 마감을 확인해 보세요.',
  graduation: '요건별 충족 현황에서 부족한 항목부터 채워 보세요.',
  lms: '수업 현황이 오래됐다면 새로 가져오기를 눌러 주세요.',
  timetable: '시간표 안 A·B·C를 저장해 두고 비교해 보세요.',
  'semester-plan': '학기별 계획으로 다음 학기 수강을 미리 그려 보세요.',
  courses: '설문 취향을 저장하면 과목 추천이 더 잘 맞아요.',
  activities: '관심 활동을 저장하면 마감을 알려드려요.',
  calendar: '학사일정에서 시험·수강신청 기간을 확인해 보세요.',
  advisor: 'AI 학사 도우미에게 내 학기 계획을 물어보세요.',
  notifications: '읽지 않은 알림을 확인하고 정리해 보세요.',
  settings: '여기서 저를 잠시 쉬게 하거나 가이드를 다시 볼 수 있어요.',
  profile: '저장하면 졸업요건 계산에 바로 반영돼요.',
  search: '과목·활동·일정을 한 번에 찾을 수 있어요.',
};

const SURVEY_TIP = '설문에는 정답이 없어요. 지금 느낌대로 골라 주세요.';

/** 화면 하단에서 걷고, 설문을 응원하고, 신규 이용자를 안내하는 마스코트. */
export function Mascot({
  enabled,
  guideSeen,
  isNewUser,
  survey,
  route,
  hidden,
  data,
  persist,
  go,
  onOpenSurvey,
}: {
  enabled: boolean;
  guideSeen: boolean;
  isNewUser: boolean;
  survey: false | 'course' | 'act';
  route: string;
  hidden: boolean;
  data: Data;
  persist: (next: Data, msg?: string) => Promise<boolean>;
  go: (route: string) => void;
  onOpenSurvey: (kind: 'course' | 'act') => void;
}) {
  const [guideStep, setGuideStep] = useState(0);
  const [guideClosed, setGuideClosed] = useState(false);
  const [forceGuide, setForceGuide] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const [pose, setPose] = useState<'idle' | 'wave'>('idle');
  const [x, setX] = useState(0);
  const [facing, setFacing] = useState<1 | -1>(-1);
  const [walking, setWalking] = useState(false);
  const [walkMs, setWalkMs] = useState(2400);
  const [placed, setPlaced] = useState(false);
  const [bubbleBox, setBubbleBox] = useState<{
    key: string;
    left: number;
    bottom: number;
    width: number;
    tailX: number;
  } | null>(null);
  const posRef = useRef(0);
  const railRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onReplay = () => {
      setGuideClosed(false);
      setGuideStep(0);
      setForceGuide(true);
      setTip(null);
      setPose('wave');
    };
    window.addEventListener('hsu-mascot-guide', onReplay);
    return () => window.removeEventListener('hsu-mascot-guide', onReplay);
  }, []);

  useEffect(() => {
    if (tip) return;
    if (pose !== 'wave') return;
    const timer = window.setTimeout(() => setPose('idle'), 2400);
    return () => window.clearTimeout(timer);
  }, [tip, pose]);

  useEffect(() => {
    if (!tip) return;
    const timer = window.setTimeout(() => setTip(null), 9000);
    return () => window.clearTimeout(timer);
  }, [tip]);

  useEffect(() => {
    if (!enabled) return;
    const rail = railRef.current;
    if (!rail) return;
    const place = () => {
      const width = rail.offsetWidth || 104;
      const maxX = Math.max(12, window.innerWidth - width - 16);
      const next = posRef.current ? Math.min(posRef.current, maxX) : maxX;
      posRef.current = next;
      setX(next);
      setPlaced(true);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [enabled]);

  const guideActive =
    enabled && !guideClosed && (forceGuide || (!guideSeen && isNewUser));

  const finishGuide = () => {
    setGuideClosed(true);
    setForceGuide(false);
    setTip(null);
    if (!data.mascotGuideSeen)
      void persist({ ...data, mascotGuideSeen: true }, '');
  };

  const guideSteps: {
    text: string;
    actions: GuideAction[];
  }[] = [
    {
      text: '안녕하세요! 학사 도우미 마스코트 한성이에요. 처음 오셨다면 제가 짧게 안내할게요.',
      actions: [
        { label: '다음', primary: true, run: () => setGuideStep(1) },
        { label: '그만 보기', run: finishGuide },
      ],
    },
    {
      text: '내 정보에 학과와 입학연도를 입력하면 졸업요건·시간표 안내가 더 정확해져요.',
      actions: [
        {
          label: '프로필 입력하기',
          primary: true,
          run: () => {
            finishGuide();
            go('profile');
          },
        },
        { label: '다음', run: () => setGuideStep(2) },
      ],
    },
    {
      text: '수업·비교과 설문에 답하면 취향에 맞는 추천을 미리 준비해 둘게요.',
      actions: [
        {
          label: '설문 시작',
          primary: true,
          run: () => {
            finishGuide();
            onOpenSurvey('course');
          },
        },
        { label: '다음', run: () => setGuideStep(3) },
      ],
    },
    {
      text: '저는 화면 아래에서 걷고 있어요. 설정에서 언제든 켜고 끌 수 있고, 안내를 다시 볼 수도 있어요.',
      actions: [{ label: '알겠어요', primary: true, run: finishGuide }],
    },
  ];

  const step = guideSteps[Math.min(guideStep, guideSteps.length - 1)];
  const bubble = guideActive
    ? { text: step.text, actions: step.actions, dismissible: false }
    : survey
      ? {
          text: SURVEY_TIP,
          actions: [] as GuideAction[],
          dismissible: false,
        }
      : tip
        ? { text: tip, actions: [] as GuideAction[], dismissible: true }
        : null;
  const bubbleKey = guideActive
    ? `guide:${guideStep}`
    : survey
      ? 'survey'
      : tip
        ? `tip:${tip}`
        : '';
  const canWalk =
    placed && enabled && !hidden && !guideActive && !survey && !tip;
  const figurePose = walking && canWalk ? 'walk' : survey ? 'wave' : pose;

  function greet() {
    if (guideActive) {
      if (guideStep < guideSteps.length - 1) setGuideStep(guideStep + 1);
      else finishGuide();
      return;
    }
    setPose('wave');
    setTip(survey ? SURVEY_TIP : (TIPS[route] ?? TIPS.home));
  }

  useEffect(() => {
    if (!canWalk) return;
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    let disposed = false;
    let walkTimer = 0;
    let settleTimer = 0;
    const schedule = () => {
      walkTimer = window.setTimeout(() => {
        if (disposed) return;
        const width = railRef.current?.offsetWidth || 104;
        const sidebar = document.querySelector('.sidebar');
        const sidebarRight = sidebar
          ? Math.max(0, sidebar.getBoundingClientRect().right)
          : 0;
        const minX = sidebarRight + 16;
        const maxX = Math.max(minX, window.innerWidth - width - 16);
        const target = minX + Math.random() * (maxX - minX);
        const distance = Math.abs(target - posRef.current);
        if (distance >= 80) {
          const ms = Math.min(4600, Math.max(1400, (distance / 95) * 1000));
          setFacing(target > posRef.current ? 1 : -1);
          setWalkMs(ms);
          setWalking(true);
          posRef.current = target;
          setX(target);
          settleTimer = window.setTimeout(() => setWalking(false), ms + 150);
        }
        schedule();
      }, 3600 + Math.random() * 4200);
    };
    schedule();
    return () => {
      disposed = true;
      window.clearTimeout(walkTimer);
      window.clearTimeout(settleTimer);
    };
  }, [canWalk]);

  useEffect(() => {
    if (!bubbleKey || !placed) return;
    let frame = 0;
    let settle = 0;
    const update = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.left + rect.width / 2 - width / 2),
        window.innerWidth - width - 12,
      );
      setBubbleBox({
        key: bubbleKey,
        left,
        bottom: Math.max(12, window.innerHeight - rect.top + 10),
        width,
        tailX: Math.min(
          width - 18,
          Math.max(18, rect.left + rect.width / 2 - left),
        ),
      });
    };
    frame = window.requestAnimationFrame(update);
    settle = window.setTimeout(update, 90);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [bubbleKey, placed, x]);

  if (!enabled) return null;

  return (
    <div
      className={
        'mascot-layer' +
        (placed ? ' is-placed' : '') +
        (hidden ? ' is-hidden' : '')
      }
      aria-hidden={hidden || undefined}
    >
      <div
        ref={railRef}
        className={'mascot-rail' + (walking ? ' is-walking' : '')}
        style={{
          transform: `translateX(${x}px)`,
          transitionDuration: `${walkMs}ms`,
        }}
      >
        <span
          className="mascot-turn"
          style={{ transform: `scaleX(${facing})` }}
        >
          <button
            ref={buttonRef}
            type="button"
            className="mascot-button"
            aria-label={
              guideActive ? '마스코트 안내 계속' : '마스코트와 인사하기'
            }
            onClick={greet}
          >
            <MascotFigure pose={figurePose} />
          </button>
        </span>
      </div>
      {bubble && bubbleBox && bubbleBox.key === bubbleKey && (
        <output
          className={
            'mascot-bubble' + (bubble.dismissible ? ' has-dismiss' : '')
          }
          style={
            {
              left: bubbleBox.left,
              bottom: bubbleBox.bottom,
              width: bubbleBox.width,
              '--tail-x': `${bubbleBox.tailX}px`,
            } as CSSProperties
          }
        >
          {guideActive && (
            <span className="mascot-step">
              처음 안내 {guideStep + 1} / {guideSteps.length}
            </span>
          )}
          <span className="mascot-text">{bubble.text}</span>
          {bubble.actions.length > 0 && (
            <span className="mascot-actions">
              {bubble.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={'mascot-btn' + (action.primary ? ' primary' : '')}
                  onClick={action.run}
                >
                  {action.label}
                </button>
              ))}
            </span>
          )}
          {bubble.dismissible && (
            <button
              type="button"
              className="mascot-dismiss"
              aria-label="마스코트 말풍선 닫기"
              onClick={() => {
                setTip(null);
                setPose('idle');
              }}
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          )}
        </output>
      )}
    </div>
  );
}
