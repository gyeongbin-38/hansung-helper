# 디자인 기준 — 한성 학사 도우미

실제 학생이 매일 쓰는 인증된 학사 워크스페이스. 마케팅 랜딩이 아니라
정보 밀도와 접근성이 우선인 대시보드다. 기존 URL·라우트·네비게이션·
데이터 계약은 유지한다.

## 토큰 (단일 근거: `app/globals.css`의 `--nt-*`)

- canvas `#ffffff` / surface `#f6f5f4` / surface-soft `#fafaf9`
- hairline `#e5e3df` / hairline-strong `#c8c4be`
- ink `#1a1a1a` / charcoal `#37352f` / slate `#5d5b54` / steel `#6f6c66` / stone `#736f68` / muted `#8a867e`
- primary `#5645d4` / pressed `#4534b3` / deep `#3a2a99`
- navy `#0a1530` / navy-mid `#1a2a52` / link `#0068c4` / link-pressed `#005bab`
- pastel tints: peach `#ffe8d4` rose `#fde0ec` mint `#d9f3e1` lavender `#e6e0f5` sky `#dcecfa` yellow `#fef7d6` cream `#f8f5e8`
- 버튼·입력 radius 8px, 카드 12px, pill은 배지·탭만
- 본문 Pretendard/Inter/system-ui 16px/1.55, 제목 600, 버튼 14px/1.3

## 제약

- 한 가지 라이트 테마, WCAG AA 대비
- 네이비는 구조적 강조 영역(LMS 상태 밴드, 브랜드 아이콘)에만 —
  홈 히어로는 장식 없는 `surface-soft` 카드다
- 퍼플은 주요 행동(CTA)에만 — 글로우·그라디언트 장식 금지
- pastel 면적은 55% 완화본(`color-mix`로 흰색 혼합)을 기본으로 — 원색 tint
  전면 도배는 소음이 된다
- 무한 애니메이션 금지(상태 표시용 pulse/spin만), 과한 장식·가짜
  스크린샷·손그림 아이콘 금지
- 노출 카피에 em dash 금지, 버튼 동사 일관, CTA는 의도 하나
- 모바일 명시적 단일 열 접기, 키보드 포커스 상태 유지

## 레퍼런스 라이브러리 판정

| 라이브러리 | 성격 | 이 프로젝트에서 |
|---|---|---|
| react-three-fiber | 3D 장면 | ❌ 코어 화면 부적합 — 밀도·번들·성능 손해 |
| liquid-glass-js | 글래스모피즘 | ❌ Notion 계열 토큰과 충돌 |
| shadergradient | 움직이는 3D 그라디언트 | △ 로그인/홈 히어로 한정 후보 — `prefers-reduced-motion` 대응 필수, 코어 화면 금지 |
| liquid-logo | 로고 금속 효과 | △ 온보딩 로고 한정 후보 — 우선순위 낮음 |

WebGL 계열은 모두 "있다면 히어로에 절제해서"이지, 데이터 화면에
적용할 이유가 없다. 이 프로젝트의 디자인 승리 조건은 이펙트가 아니라
정보 위계·간격·타이포·상태 설계다.

## 감사 체크리스트 (스크린샷 기반)

캡처 방법: `C:/Users/82107/AppData/Local/Temp/cdp-shot.mjs` — headless
Chrome + CDP로 프로덕션에 데모 LMS 데이터를 주입해 홈/LMS 3탭/모바일을
찍는다. `hansung-demo-v1` localStorage에 `Data` 형태 JSON을 넣고
"연결 없이 둘러보기"를 클릭하면 인증 없이 실제 UI를 볼 수 있다.

점검 항목:
1. **계층** — 한 화면에서 가장 중요한 정보가 가장 먼저 보이는가
2. **정제** — 원문 시스템 문자열(LMS 과목명 등)을 그대로 노출하지 않는가
3. **면적 색** — 같은 색을 배지와 배경에 이중으로 쓰지 않는가
4. **모바일** — flex/grid가 세로 방향에서 의도치 않은 빈 공간을 만들지
   않는가 (`flex-basis`는 column 방향에서 height로 작동한다)
5. **상태** — 로딩/빈 데이터/로그인 필요/stale/실패/부분 성공이 각각
   디자인돼 있는가
6. **일관성** — 동사, radius, 배지 색 의미가 화면마다 같은가
7. **대비** — muted 텍스트가 AA를 통과하는가

## 현재 구조 메모 (2026-09-21 기준)

- LMS 화면: navy `.lms-band`(상태 도트+지표 스트립+CTA) → `lms-grid`
  2열(메인 탭 + 사이드 마감 임박/연결 관리) → 모바일 단일 열.
- 과목명은 `courseDisplay()`로 정제(장식 토큰 제거, `[A]` 분반 배지,
  교수명 중복 제거) — 원문은 title tooltip에 보존.
- 항목 행은 `t-vod/t-assign/t-quiz` pastel 55% 완화본.
- 사이드바: `surface` 회색, 선택 항목은 색이 아니라 `hairline` 회색
  면으로 구분(Notion식). 데스크톱에서 240px ↔ 68px 아이콘 레일
  접기를 지원한다. 상태는 `hsu-side-collapsed` localStorage에
  영속되고, 접힌 상태에서는 탑바의 펼치기 버튼(`side-expand`)이
  유일한 복귀 경로다. 모바일(≤767px)에서는 접기 UI를 숨기고
  기존 오프캔버스 드로어를 유지한다 — 레일은 `min-width:768px`
  안에서만 존재한다.
- 주의: `shell.css`는 `globals.css`에서 `@import`로 앞에 들어가므로
  `.icon` 같은 공통 클래스를 미디어쿼리로 끌 때는
  `.sidebar .side-collapse`처럼 상위 스코프로 특이도를 올려야 한다.
- 텍스트 토큰은 AA(4.5:1) 기준으로 교정됐다 — `steel/stone`은
  surface 위에서도 통과하고, `muted`는 placeholder 전용으로 둔다.
  `link`는 `#0068c4`로 낮춰 surface 위에서도 통과한다.
- 노출 카피의 `—`는 전부 정리했다 — 라벨·수식어는 `·`, 문장 경계는
  마침표로 통일한다(주석·JSDoc은 자유).
- 남은 폴리시 후보: 토스트가 콘텐츠를 덮는 문제, 과목 카드 내부
  섹션 여백 리듬, 홈 대시보드 밀도 재조정, 온보딩 히어로 비주얼.
