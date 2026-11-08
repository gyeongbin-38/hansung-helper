# Design

## Source of truth

Status: Active. Updated: 2026-11-08. Surfaces: student planner and home action brief.
Evidence: `app/sections/home.tsx`, `app/sections/lms.tsx`, `app/globals.css`, `docs/frontend-backend-handoff.md` and the existing design notes below. This contract takes precedence over historical notes.

## Brand

Calm, readable, candid. Trust comes from source dates and clear uncertainty. Keep the existing light surfaces, blue actions and Pretendard typography.

## Product goals

Help students notice deadlines and reach the school action with minimal searching. The home brief combines existing course, saved activity, academic and personal schedule data. Success means users can tell what is due, what is uncertain and where to check it. New graduation criteria and new school crawlers are outside this change.

## Personas and jobs

Enrolled students checking between classes on a phone, or planning on a desktop. Primary job: find near deadlines and overlooked items without opening every school page.

## Information architecture

Preserve navigation. Home: setup if needed → one action brief → matching/conflict checks → planning and discovery. The brief shows deadlines first, then expandable unknown deadlines and source coverage. Course links open school pages or the matching course detail. Avoid duplicate urgent/week lists.

## Design principles

Use existing snapshots; do not fetch school pages on the home request. Missing data never proves there is no work. Preserve user plans and activity progress. Previously recorded applications should not generate another application reminder. Current work uses the current semester, independently of the planning semester.

## Visual language

Reuse `--nt-*` tokens and existing cards, links and icons. White and light gray surfaces, blue primary action, clear text hierarchy. No new font, imagery, motion or token system.

## Components

`HomeBrief` owns the action list, unknown-deadline list and source coverage disclosure. `buildHomeBrief` derives display items without changing stored profiles. Rows contain separate links/buttons; never nest an anchor inside a button.

## Accessibility

Use a labelled section, semantic lists, native disclosure controls, visible keyboard focus and meaningful action names. External course links announce the new tab. Target WCAG 2.2 AA; retain reduced-motion behavior.

## Responsive behavior

Support 320–1440px. Long course titles wrap. At narrow widths the secondary action wraps under the text. Preserve 44px action targets and prevent horizontal page overflow.

## Interaction states

Loading: say information is loading. Failure: keep available information and offer API retry or course collection controls. Empty: say no nearby deadline was found in collected information; do not claim all work is complete. Stale/partial: identify uncertain data and retain source timestamps. Past deadlines say 기한 지남, never 오늘 마감. All day boundaries use KST.

## Content voice

Short Korean action labels. Distinguish 수집본 기준, 확인 필요 and 직접 등록. Do not call uncertain submissions incomplete or academic events universally applicable. Show source coverage once per brief rather than repeating technical details in each row.

## Implementation constraints

React/vinext and existing CSS. No backend schema, storage or collector changes. Reuse current data contracts. Verify KST boundaries, partial results, activity progress, valid empty states, source failures, responsive browser flows, type checking, lint, tests and build.

## Open questions

- [ ] Backend owner: confirm per-list collection timestamps and account matching for extension results. Impact: finer provenance display; until then use conservative uncertainty labels.
- [ ] Product owner: provide verified graduation criteria. Impact: future requirement-to-course recommendations; not required for the home brief.

---

# Active design direction (2026-11-03)

The user requested a Toss-inspired student planner. This section supersedes conflicting visual choices in the historical notes below; the notes remain as project history.

- Use Pretendard Variable and system sans-serif fallbacks for headings, numbers, and body text. Do not include Toss Product Sans without a redistribution licence.
- Use cool, light surfaces: page `#f9fafb`, card `#ffffff`, secondary `#f2f4f6`, and divider `#e5e8eb`. Text uses `#191f28` and `#4e5968`; small secondary text uses `#596574` for contrast.
- Use blue `#1b64da` for primary actions and links, with `#e8f3ff` as a weak surface. The darker blue preserves contrast for small white button text.
- Keep deadlines and next actions easy to find. Do not overlay oversized deadline text on activity posters; show real status and dates in readable card content.
- Preserve existing routes, data provenance, keyboard focus, responsive layouts, and reduced-motion preferences. Reuse existing icons and tokens.

---

## Historical design direction (superseded where inconsistent)

# DESIGN.md — 한성 학사 도우미 디자인 방향

## 방향: B — 학생 노트·플래너 톤 (레퍼런스: Notion)

**대상**: 재학 중인 한성대 학생이 매일 짧게 들러 "지금 해야 할 것"만 확인하고 나가는 개인 학사 작업 공간. 전시용 대시보드가 아니라 **내 플래너**다.

**형용사**: 조용한(quiet), 따뜻한(warm), 정돈된(ordered), 정직한(honest).

**미적 본질**: "따뜻한 종이 위의 잉크". 종이색 뉴트럴과 잉크색 텍스트가 계층을 만들고, 색은 상태 신호와 한성 포인트에만 아낀다.

**시그니처 무브**: **노션 세리프 모드의 학사 노트** — 제목·큰 숫자·D-day는 고운바탕(한글 세리프)으로 인쇄물처럼, 본문·버튼·라벨은 Pretendard 산스로. 문서 계층과 UI 크롬을 서체로 분리하는 것이 이 앱의 얼굴이다.

## 노션에서 가져오는 규칙

1. **기능 전시 금지** — 한 화면에 하나의 주 다음 행동. 나머지는 뒤에 둔다.
2. **점진적 공개(progressive disclosure)** — 설명문·출처·면책은 필요한 사람만 펼치게 한다. 기본 화면엔 결론만.
3. **카드 최소화** — 독립 위젯만 카드. 같은 정보군은 헤어라인 구분으로 나열한다.
4. **타이포가 계층** — 색·박스 대신 크기·굵기·서체로 위계를 만든다.
5. **모든 서피스 1px 헤어라인** — 2px+ 보더와 둥근 모서리 조합 금지(design-slop 하드체크).
6. **문장보다 라벨** — 화면의 글은 산문이 아니라 라벨·수치·날짜로. 두 번 읽히는 문장(배지 + 보조문구 중복 등)은 하나만 남긴다.

## 팔레트 (`app/globals.css` `--nt-*` 단일 계약)

- **Primary**: 잉크 네이비 `#33415c` (구 인디고 `#5645d4` 폐기 — AI-SaaS 수렴 색역)
- **본문 잉크**: `#37352f` (노션 잉크 — 순수 검정 대신 따뜻한 잉크)
- **서피스**: paper `#fbfaf7` (앱 배경) / canvas `#ffffff` (카드) / surface `#f7f6f3` (노션 회색 패널) / 헤어라인 `#e5e3df` 계열
- **액센트**: 네이비 tint(`--nt-tint-sky` + `--nt-primary-deep`)를 기본 강조로. 보라 tint는 브랜드 스펙트럼으로만 잔존
- **의미 색**: success/warning/error는 배지·경고에만

## 한글 타이포그래피 규칙 (한국어 전용 줄바꿈)

Pretendard Variable(본문·UI) + Gowun Batang(디스플레이) 두 패밀리:

- **디스플레이 세리프 (`--nt-font-display`)**: `.page-heading h1`, `.section-heading h2`, `.detail > h2`, 인증·인트로 제목, 큰 수치(`.stat strong`, `.plan-stats b`, `.builder-sum strong`, `.grad-intro > strong`), `.mini-art strong` 대형 글리프, `.event-date b` D-day — 인쇄된 플래너 계층
- **산스**: 본문·버튼·배지·라벨·표 — UI 크롬
- `body`: `word-break: keep-all` — 한글 음절 중간 절개 금지, 어절 단위 줄바꿈
- `body`: `overflow-wrap: break-word` — 긴 영문/URL/연속 문자열은 필요 시 절개(오버플로 방지)
- `body`: `text-wrap: pretty` — 마지막 줄 외톨이 억제 (Chrome 117+, 미지원 무해)
- `h1,h2,h3`: `text-wrap: balance` — 제목 균형 줄바꿈
- `word-break: break-all`은 기술 문자열(URL·코드)에만 제한적 사용
- 줄임표는 `white-space: nowrap` + `text-overflow: ellipsis`가 이미 있는 곳만 (nav-label 등)

## 정보 계층 규칙

- `.meta`(출처·수집일·면책)는 `--nt-muted` + 12px로 리세스 — 읽을 수는 있되 시선을 뺏지 않게
- 동일 데이터의 중복 렌더 금지 (홈 계획 학점 = 계획 카드와 현황 타일 중 하나만)
- 탭 7개 초과 금지 — 부가 행동(직접 등록 등)은 탭이 아니라 액션 버튼으로
- 페이지 크롬 최소화 — 로어 텍스트·상시 배지·중복 인사말·페이지 설명문 제거
- 같은 행에 배지가 말한 것을 보조문구로 반복하지 않는다 (상태 라벨 중복 금지)
- 리스트 행의 출처 라벨은 행 단위가 아니라 섹션 단위 한 줄로 합친다

## 하드 규칙 (design-slop 체크리스트)

- 둥근 카드 + 두꺼운 보더(≥2px) 금지 — 강조는 tint·small indicator·elevation으로
- 장식 그라디언트·글로우·블러 금지 (시간표 그리드 라인·dialog 스크림 같은 기능적 사용만 허용)
- 스크롤 리빌·패럴랙스·hover translate 금지
- `prefers-reduced-motion` 킬스위치 유지
- 빈/로딩/에러/stale 상태는 항상 정의된 패턴 (skeleton/empty-small/badges)
- 가짜 데이터·지원 불가 수치 표시 금지 — 출처와 수집일은 남기되 리세스 처리

## 토큰 규칙

- `globals.css`의 `--nt-*`만 사용. 섹션 CSS에 값 재선언·하드코딩 색상 금지
- `var(--nt-x, fallback)` fallback 리터럴은 토큰값과 동일하게 유지

## 시간표 편집 상호작용

- 과목 삭제는 저장 성공 이후에만 완료로 안내한다. 가장 최근에 삭제한 과목 하나를 실행 취소할 수 있고, 복구 시 현재 이수·계획 충돌 검사를 다시 적용한다.
- 저장 요청 중에는 같은 시간표의 과목 추가·삭제·드래그를 중복 실행하지 않는다. 저장 실패는 삭제 성공 안내로 바꾸지 않는다.
- 실행 취소와 선택 상태는 현재 계획 학기에 속한다. 다른 학기나 기준 자료로 전환하면 초기화한다.
- 좁은 화면에서는 월~토 이동 버튼을 제공한다. 버튼은 시간표를 가로로 이동해도 보이고, 화면의 다른 영역을 스크롤하지 않는다.
- 드래그는 보조 조작이다. 과목 목록의 추가 버튼과 수업 블록 선택·삭제 버튼으로도 같은 결과에 도달할 수 있어야 한다.

## 변경 이력

- **2026-10-10 v3** — 정밀 다듬기 패스: 파스텔 tint를 종이색으로 한 단계 바래 "잿빛 파스텔"로 통일, 탭을 언더라인 인디케이터로, 페이지 헤딩 아래 마스터헤드 룰 추가, `.secondary`·날짜 칩·`today-item` 테두리 제거(무테 로우 + hover 서피스), 필드 포커스를 3px 소프트 링으로 통일(focus-visible 이중 표시 해소), 선택 상태 전부 `--nt-tint-sky`로 수렴(라벤더 잔재 제거), 카드 hover를 `hairline-strong + shadow-1` 하나로 통일, `.task` translate 잔재·`.demo-note` 테두리 제거, dialog radius 20→16.
- **2026-10-09 v2** — 시그니처 무브 확정: 고운바탕 디스플레이 세리프 + 페이퍼 배경(`--nt-paper`) + 라벨 계열 텍스트 대폭 절감(SECTION_SUB 폐지, 행 단위 출처 라벨 제거, 중복 상태 라벨 제거). 퍼플 가구색(아바타·태스크 번호·안읽음·선택 배지)을 네이비 계열로 통일. 브랜드 `::selection`·얇은 스크롤바 추가.
- **2026-10-09 v1** — B방향 확정 + 잉크 네이비 리맵 + 한글 줄바꿈 + 기능 노출 축소.
