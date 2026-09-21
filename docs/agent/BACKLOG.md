# Agent Backlog

GitHub Issues/PR access is unavailable (no git remote). This file is the
backlog store per AUTONOMOUS_START_PROMPT §2. Each entry follows the
required issue format. Labels are recorded inline.

Priority order for autonomous selection: verification-failed →
in-progress → needs-verification → p0+agent-ready → p1+agent-ready →
blocking regressions.

---

## ISSUE-1 — 2026-2 실제 개설강의 카탈로그 + 드래그드롭 시간표 빌더

- **Status**: **verified** (fresh verifier PASS + follow-up fixes verified)
- **Labels**: agent-ready, agent-implementing, priority:p0, area:frontend, area:data
- **Objective**: Replace the 4-item mock `courses` fixture with the real
  2026-2 Hansung course catalog (uploaded xlsx) and make the timetable
  section a real builder: drag&drop sections onto a weekly grid, conflict
  detection, per-section alternatives (분반), and a personalized
  recommendation panel.
- **Why**: The timetable/courses/plan features currently show fabricated
  courses ("체험용") — the single largest mock gap. User-supplied
  `hansung_all_departments_2026_2_exact_times.xlsx` (862 sections,
  1,554 day-rows) is the authoritative source.
- **Scope**:
  - `scripts/import-courses.py` normalizes the xlsx →
    `lib/data/catalog-2026-2.json` (documented provenance)
  - `GET /api/courses` serves the catalog (public data, cacheable)
  - `useCatalog()` client hook
  - `timetable.tsx` → builder: catalog browser (search/dept/category
    filters), Mon–Sat minute-precision grid, drag&drop add, conflict
    block + toast, click-block detail popover with 분반 switch + remove,
    untimed/online section tray
  - Rule-based recommendation panel (dept/year/category/survey-prefs/
    conflict-free scoring, reason badges shown)
  - Rewire `courses.tsx` (catalog browser), `semester-plan.tsx`
    (real sections), home planned stats to the catalog
  - `planned: string[]` persists real section ids (`CODE-SECTION`)
- **Out of scope**: crawler pipeline, remote D1 catalog table,
  graduation rule engine, real 알림, school-side 수강신청
- **Dependencies**: `@dnd-kit/core` + `@dnd-kit/utilities` (new deps —
  REPO SCOUT record below)
- **Expected files**: `scripts/import-courses.py`,
  `lib/data/catalog-2026-2.json`, `lib/data/catalog.ts`,
  `app/api/courses/route.ts`, `app/sections/catalog.ts`,
  `app/sections/{timetable,courses,semester-plan,home}.tsx`,
  `app/sections/data.ts`, `app/styles/learning.css`, `tests/catalog.test.mjs`
- **Acceptance Criteria**:
  - `/api/courses` returns ≥850 sections with `semester/source` metadata
  - Every section has unique id, valid 0–6 day slots or explicit
    untimed flag; minutes-precision times
  - Drag or "+" adds a section at its real slots; overlapping drop is
    rejected with a toast; click block opens detail; 분반 alternatives
    switchable; remove works; untimed sections live in a tray
  - Recommendation panel ranks by visible rules with reason badges; no
    fabricated data
  - Provenance labels visible ("공식 시간표 2026-2 · 공식 수강신청 아님")
  - Keyboard-reachable add/remove (buttons, not drag-only)
  - No side accent bars / side-tab cards; responsive
  - tsc, oxlint, build, http-check, catalog test all pass
- **Tests Required**: `tests/catalog.test.mjs` (integrity invariants),
  existing `tests/school.test.mjs`, `account-db.py`, `http-check.py`
- **Verification Gates**: independent fresh-verifier review (verdict
  format); implementer does not self-verify
- **Repo Scout needed**: no (decision recorded inline)

## REPO SCOUT RECORD — ISSUE-1

| Candidate | Verdict | Note |
|---|---|---|
| @dnd-kit/core + utilities | **ADOPT** | MIT, actively maintained, de-facto React DnD; replaces hand-rolled HTML5 DnD for pointer+touch quality |
| openpyxl (import script only) | **ADOPT** | dev-time tool, not shipped |
| FullCalendar | **REJECT** | heavyweight; custom minute-grid is ~150 lines and matches design system |
| TanStack Query | **REJECT (for now)** | single public fetch; module-cache hook suffices. Revisit when API surface grows |

---

## ISSUE-2 — 크롤러 파이프라인 (비교과 공개 목록 → normalized DB → /api/activities)

- **Status**: **verified** (fix 재검증 PASS 2026-09-18 — 라벨 기반
  date_layer 매핑 확인, 회귀 테스트 존재, 재수집 스냅샷 날짜 정상)
- **Verifier note (2026-09-17, fresh session)**: **FAIL → fixed.**
  카드에는 `date_layer` 밖에 `<time>`이 더 있음(헤더 운영시각 쌍 +
  content 중복 쌍). 위치 기반 `times[0..3]` 추출은 신청↔운영을 뒤바꿔
  저장함 — 스냅샷 39건 중 26건 applyEnd > runStart로 이상 확인.
  테스트마저 뒤바뀐 값(14107 applyStart=9.30)을 pin하고 있었다.
  수정: `date_layer` 블록을 `date_title` 라벨(신청/운영)로 매핑하도록
  파서 변경 + 테스트 정정 + 신청 레이어 없는 카드 회귀 테스트 추가.
  재수집 37건 모두 정상. 잔여 과제: fix 자체의 독립 재검증.
- **Labels**: agent-ready, priority:p1, area:crawler, area:backend
- **Objective**: public 비교과 목록 ingestion (fetch → raw → parse →
  validate → upsert with source_system/source_key + last-known-good)
  behind a scheduled/manual trigger — never inside user request path.
  Replace `acts` fixture in `data.ts` via `GET /api/activities`.
- **Scope**: crawler module + fixture parser tests + D1 table migration
  + activities route + UI rewire keeping provenance badges.
- **Out of scope**: 로그인 후 개인 참여 상태 수집 (stays USER_REPORTED),
  push notifications.
- **Dependencies**: ISSUE-1 pattern (generated catalog → API) is the
  interim; this upgrades activities to live ingestion.
- **Acceptance Criteria**: idempotent upsert; abnormal item-count
  detection; fixture-based parser test; provenance `공식 출처` /
  `업데이트 지연` states; no live fetch during user requests.
- **Tests Required**: parser fixtures + route test.
- **Repo Scout result**: plain HTTP sufficient — hsportal list is
  server-rendered (`data-role="item"` cards, ISO `<time>` values, page
  count in `data-total`). Playwright rejected.
- **Shipped (snapshot variant)**: source is
  `hsportal.hansung.ac.kr/ko/program/all/list/all/1[/page]` (public,
  ~4 pages). `lib/data/activities.ts` (types + `parseProgramList` +
  `isAnomalous`), `scripts/crawl-activities.mts` (sequential polite
  fetch, dedupe by key, anomaly→keep-old, writes
  `lib/data/activities.json`), `GET /api/activities`, `useActivities`
  hook, `activities.tsx` rewired to real data (status tabs, cover
  images, 신청/운영 기간, points, 인증, 저장 유지, 출처 표기), demo
  `acts` fixture removed, `tests/activities.test.mjs` + real-HTML
  fixture `tests/fixtures/hsportal-list.html`. 39 items on first run.
- **Deferred (needs deploy access, ISSUE-5)**: D1 `activities` table +
  scheduled worker trigger; snapshot JSON is the interim per the
  catalog pattern.

## ISSUE-3 — 졸업요건 룰엔진 v0 (deterministic, UNKNOWN-safe)

- **Status**: **verified** (fresh verifier PASS; v0 scope noted below)
- **Labels**: agent-ready, priority:p1, area:graduation, area:backend
- **Objective**: deterministic graduation-requirement calculator over a
  versioned ruleset (dept × admission-year). UNKNOWN for missing inputs
  — never 0%. Distinguish 계획/수강중/완료.
- **Acceptance Criteria**: pure function + rule tables with
  `source`/`asOf`; rule fixtures tests; UI keeps "확인 필요" until inputs
  exist; AI layer may explain but never judges.
- **Tests Required**: rule fixtures, edge cases (missing dept/year →
  UNKNOWN).
- **v0 scope actually shipped**: single global `DEFAULT_RULES`
  (`lib/data/graduation.ts`) with required:null → 'unknown'; user
  `ruleOverrides` for targets; `completed[]` (완료) vs `planned[]`
  (계획) separation — no 수강중 state; no dept×year rule variants.
  Verifier flagged the gap vs objective wording → tracked in ISSUE-6.

## ISSUE-6 — 졸업 규칙 버전·학과별 확장 + 수강중 상태

- **Status**: partially implemented — 전역 기준 부분 **verified**
  (2026-09-18: 2016+ 적용·pre-2016 unknown·포인트 미입력 unknown·
  프로필 year/points 입력 경로·출처 링크 확인). 학과별 ruleset은
  검증된 1개 학과(컴퓨터공학부 yearTable)만 엔진 연결
  — ISSUE-20 Engine 연동 참조. 수강중 상태는 2026-09-20부터
  표시 전용으로 구현(LMS 학점·코드 부재로 집계 미반영 — 이름 매칭
  기반 '수강 중' 배지 + 졸업 '현재 수강 중' 정보 스트립).
  잔여: 다른 학과 ruleset 수집·검증, 수강중의 공식 이수 상태 연동
  (COSMOS에 학점·코드 데이터가 없어 추가 소스 필요).
- **Labels**: agent-ready, priority:p2, area:graduation, area:data
- **Objective**: upgrade v0 engine to dept × admission-year versioned
  rulesets (`lib/data/rules/*.json`) with structured `source`/`asOf`
  provenance per rule; add distinct 수강중(in-progress) state between
  완료 and 계획.
- **Dependencies**: ~~official Hansung 졸업 규정 데이터 소스 필요~~
  부분 해제 — `hansung.ac.kr/hansung/6220/subview.do` (공식) 확인:
  2016학번~ 교과 130학점 + 비교과 800P, 학기당/프로그램당 200P 상한.
  학과별 규정은 학과 페이지별 상이 — 미수집분은 unknown 유지.
- **Done (전역 기준)**: `GLOBAL_RULE_SOURCE` 상수(url/label/asOf),
  `DEFAULT_RULES`에 공식 전역 규칙(교과 130학점 + 비교과 800P,
  `unit`/`source` 필드 추가), `evaluate(rules, completed, planned, opts)`
  에 `opts:{admitYear?, points?}` — 2016학번~만 기준 적용, 이전 학번은
  미적용(unknown), points 미입력 시 unknown, UI는 학점/P 단위 구분 +
  공식 출처 링크 + 학과별 요건 "확인 필요" 유지. tests 6/6.
- **Acceptance Criteria**: ruleset selected by dept+입학연도; missing
  ruleset → UNKNOWN, never guessed; 수강중 counts shown separately from
  완료; `source`/`asOf` rendered on rule cards.

## ISSUE-4 — 학과 매핑 정규화 (profile.dept ↔ catalog 전공명)

- **Status**: **verified** (fresh-session verifier PASS 2026-09-17;
  deploy still pending under ISSUE-5)
- **Labels**: agent-ready, priority:p2, area:data
- **Objective**: canonical dept-name map so profile free-text
  ("AI응용학과", "AI융합"…) matches catalog `dept`; used by recs + 내 학과
  filter. Fuzzy but deterministic (alias table + exact-normalized match).
- **Acceptance Criteria**: no silent mismatch — unmatched dept shows
  "학과 매칭 확인 필요" state, not wrong results.
- **Done**: `lib/data/dept.ts` (normalize + ALIASES + resolveDept with
  dept/candidates/none states), `deptPoolOf` in `app/sections/catalog.ts`,
  wired into recommend + courses/timetable 내 학과 필터, "학과 매칭 확인
  필요" notices, tests in `tests/ux-utils.test.mjs`.
- **Verifier note (2026-09-17, independent fresh session)**: PASS.
  Unmatched → `deptPool === null` + notice (timetable.tsx:488,
  courses.tsx:184); ambiguous → candidates + notice; alias/exact/single-
  candidate resolve correctly (ux-utils 24/24). Minor: two assertions in
  `tests/ux-utils.test.mjs` are vacuous — tracked in ISSUE-8.
- **Follow-up (2026-09-19)**: `CANDIDATE_ALIASES` 추가 — 공식 학부명
  '컴퓨터공학부'(카탈로그 개설 단위 아님) 입력 시 검증 패밀리
  {IT응용시스템공학과, 모바일소프트웨어트랙, 빅데이터트랙}를 candidates로
  반환. 이전엔 pool=null로 학과 필터·추천 무력화. ux-utils 26/26.

## ISSUE-5 — Remote D1 seeding + deploy parity check

- **Status**: backlog — needs-human (deploy/credentials approval)
- **Labels**: priority:p1, area:infra, needs-human
- **Objective**: apply `drizzle/` migrations + catalog to remote D1;
  verify `published-personal/.openai/hosting.json` deploy target still
  serves API routes with bound DB.

## ISSUE-7 — 미사용 starter kit 제거 (components/, hooks/, components.json)

- **Status**: **verified** (fresh-session verifier PASS 2026-09-17 —
  components/hooks/lib/utils/components.json 삭제 확인, import 참조 0건,
  deps 14개 정리 후 tsc/oxlint/tests 통과)
- **Labels**: agent-ready, priority:p2, area:infra
- **Objective**: delete the unused shadcn starter kit — `components/`
  (~90 files), `hooks/`, `components.json`, and any deps only they need.
  Nothing under `app/` or `lib/` imports them (verified 2026-09-17).
- **Why**: dead code misleads agents into reusing unstyled starter
  components; the kit also carries the repo's only lint debt (starter
  files are excluded from `oxlint app/ lib/` scope).
- **Acceptance Criteria**: no import references anywhere; tsc/oxlint/
  build/tests all pass; `package.json` deps pruned to what the app uses.
- **Done**: removed `components/` (~90 files), `hooks/`,
  `components.json`, `lib/utils.ts` in BOTH repos; pruned 14
  starter-only deps (@base-ui, @shadcn, cva, clsx, cmdk, date-fns,
  embla, input-otp, day-picker, resizable-panels, recharts, shadcn,
  tailwind-merge, tw-animate-css); root tsconfig now excludes
  `published-personal/` + bootstrap dir (was silently type-checking the
  nested repo's kit against root paths).
- **Out of scope**: redesign or replacement of `app/sections/*` UI.

## ISSUE-8 — ux-utils.test.mjs 허위 assertion 교정

- **Status**: **verified** (fresh-session verifier PASS 2026-09-17 —
  AI융합→미해석, 융합→후보 2개 pin 확인, 회귀 시 실패하는 assertion)
- **Labels**: agent-ready, priority:p2, area:data
- **Objective**: replace the two always-true assertions
  (`t(..., true)` and `!r.dept || r.dept.length > 0`, ~lines 41–45) with
  checks that actually pin down `resolveDept('AI융합')` behavior —
  either exact candidates list or an explicit documented outcome.
- **Acceptance Criteria**: assertions fail when resolution regresses;
  suite still 100% pass.
- **Done**: pinned `AI융합` → unresolved `{}` (no fabricated match) and
  `융합` → exactly 2 candidates incl. 융합보안학과. 24/24 pass.

## ISSUE-9 — root `.openai/hosting.json` 정리

- **Status**: backlog — needs-human (account/deploy decision)
- **Labels**: priority:p3, area:infra, needs-human
- **Objective**: root hosting.json still points at the previous
  account's project_id (`...6aa7a5a3...` vs current `...6aa7b18f...`).
  `vite.config.ts` only consumes `d1`/`r2` binding names so builds are
  unaffected, but the stale id invites accidental deploys to the wrong
  project. Decide: repoint to current project, or split local-binding
  config out of hosting.json entirely.

## ISSUE-11 — AI 상담: 고정 응답 → 실데이터 기반 규칙 응답

- **Status**: **verified** (fresh-session verifier PASS 2026-09-17 —
  계획/학점/충돌/활동 수 실데이터 반영, 자유질문 매칭 링크, 비AI 명시,
  졸업 판정 주장 없음 확인. minor nit 수정: 활동 fetch 실패 시
  '불러오는 중' 무한 표시 → 실패 메시지로 구분)
- **Labels**: agent-ready, priority:p2, area:ai, area:frontend
- **Objective**: advisor는 현재 고정 안내 문자열 3개뿐. 이미 있는
  데이터(카탈로그·비교과 스냅샷·계획/충돌/완료 목록)로 개인화된
  규칙 기반 답변을 만들고, 자유 질문은 키워드 매칭으로 카탈로그·활동을
  찾아 보여준다. AI 생성을 사칭하지 않고 "사이트 데이터 기반 안내"로
  명시.
- **Acceptance Criteria**: 각 고정 질문이 실제 사용자 상태(계획 과목
  수·학점·충돌, 신청 가능 활동 수, 졸업 입력 완결성)를 반영; 자유 질문은
  매칭된 과목/활동 링크 또는 정직한 "찾지 못함" 응답; 프로필 없으면
  안내형 폴백.

## ISSUE-12 — 학사일정 실데이터 수집 (공식 학사일정 → snapshot → 캘린더)

- **Status**: **verified** (fresh verifier PASS 2026-09-18 —
  라벨 무관 행 파싱·fnv id·이상감지·API·UI provenance 확인)
- **Done**: `lib/data/schedule.ts` (parseScheduleMonth 라벨 무관 행 파싱:
  첫 셀 날짜/범위 + 마지막 셀 일정명, fnv 해시 id, isScheduleAnomalous),
  `scripts/crawl-schedule.mts` (month/year2 POST로 학년도 3월~익년 2월
  12개월 순차 수집, dedupe, 이상 시 기존 유지), `lib/data/schedule.json`
  (73건), `GET /api/schedule`, `useSchedule` hook, calendar.tsx에 공식
  일정 블록 추가(공식 학사일정 provenance·수집일 표기·원본 링크),
  fixture `tests/fixtures/hs-schedule-m3.html` + `tests/schedule.test.mjs`
  4건.
- **Labels**: agent-ready, priority:p1, area:crawler, area:frontend
- **Objective**: 학사일정 섹션은 개인 일정 수동 입력뿐이고 학교 일정은
  외부 링크뿐. `www.hansung.ac.kr/hansung/6096/subview.do`(학부 학사일정)
  는 공개·서버렌더링·UTF-8이며 `날짜범위 | 설명` 행 구조 —
  activities와 같은 snapshot 파이프라인으로 수집해 캘린더에 병합 표시
  (개인 일정과 공식 일정 출처 구분 유지).
- **Repo Scout**: plain HTTP sufficient — 페이지가 서버렌더링된
  table 행 (`2026.08.31(월) ~ 2026.09.04(금)` + 일정명). 월별 보기
  구조이므로 학기 범위 월들을 순차 수집. Playwright 불필요.
- **Acceptance Criteria**: 공식 일정에 `공식 학사일정` provenance,
  개인 일정과 시각 구분, 수집 실패 시 last-known-good 유지,
  사용자 요청 경로에서 라이브 fetch 없음.

## ISSUE-13 — 알림함·홈 위젯 실데이터 도출

- **Status**: **verified** (2026-09-18 이터레이션 5 — readIds per-item
  읽음·deriveNotifs 공유·API/UI 상한 일치·스키마 전파 확인)
- **Labels**: agent-ready, priority:p2, area:frontend
- **Objective**: 알림함은 고정 1건(연결 안내)뿐이고 홈 "지금 할 일"은
  완료 여부와 무관하게 카운트 `3` 고정. 실제 상태에서 알림을 도출:
  계획 과목 시간충돌, 활동 신청마감 임박(applyEnd D-7 이내),
  프로필/졸업 입력 미완성. 홈 할일 카운트도 완료 상태 반영.
- **Done**: notifications.tsx — `planned` prop + useActivities/useSchedule로
  충돌·신청마감 임박·공식일정 7일 이내·프로필 미완성·계정 미연결 알림 도출,
  카테고리 카운트 배지, 푸시 미지원 명시 유지, 읽음 영속화 유지.
  home.tsx — useSchedule로 공식 일정 표시(개인 일정과 출처 구분),
  "지금 할 일"을 실제 상태에서 도출(프로필 미완성·충돌·완료과목 없음·
  계획 없음·설문 미작성), 완료 시 빈 상태 문구, 카운트는 shownTasks.length.
  page.tsx — Notifications에 planned 전달. React Compiler 순수성 규칙상
  `Date.now()`는 useState lazy init으로 마운트 시점 1회 평가.
- **Verifier-found fixes (2026-09-18)**: `read: boolean`은 "모두 읽음" 후
  신규 알림도 영구 읽음 처리 → `readIds: string[]`로 교체, 도출 로직을
  `deriveNotifs()`로 추출해 Topbar 벨이 실제 unread 수 반영. profile
  route의 ruleOverrides 상한 300→2000 (UI ≤2000, 800P 공식 목표와
  불일치였음). 프로필 스키마·API 검증·데모 shape-check 전파.
- **Follow-up (2026-09-21)**: 프로필 누락 CTA·알림이 항상 첫 누락 필드로
  딥링크(profile/dept|year) → 해당 입력 자동 포커스. 누락 2개일 때도
  동작(이전엔 단일 누락만). 조사 조합 '학과와 입학연도를/가'로 정정.

## ISSUE-15 — 설문 선호 추천 반영 + 미반영 항목 명시

- **Status**: **verified** (2026-09-18 — 우선목표/학기구성 점수화 확인,
  수업방식·평가방식 미반영 고지 timetable.tsx:675 확인)
- **Labels**: agent-ready, priority:p2, area:frontend, area:data
- **Objective**: 설문 6문항 중 4개(우선목표·수업방식·평가방식·학기구성)
  가 추천 점수에 미반영이었다. 점수화 가능한 것은 반영하고, 카탈로그에
  메타데이터가 없어 점수화 불가한 것은 명시적으로 고지.
- **Done**: `recommend()` — 우선목표(졸업요건 충족→필수 카테고리 부족분,
  전공 심화→전필/전선 가점, 진로 탐색→교양/타학과 개방 가점),
  학기구성(일정 여유→온라인/무시간대 가점, 공강일 확보→기존 계획 요일
  보존, 고른 배치→요일별 균형) 점수 반영. 수업방식·평가방식은 카탈로그에
  해당 메타데이터가 없어 timetable 추천 패널에 "아직 반영되지 않음"
  고지 추가.

## ISSUE-16 — 과도 학점 soft warning

- **Status**: **verified** (2026-09-18 — semester-plan.tsx:46 21학점 초과
  soft 경고, 공식 한도 사칭 없음 확인)
- **Labels**: agent-ready, priority:p2, area:frontend
- **Objective**: spec §9 요구 최대학점 제약 부재. 공식 한성대 학점 상한
  데이터 미수집 — 임의 숫자를 공식처럼 주장하지 않고, 21학점 초과 시
  "수강신청 학점 상한을 초과할 수 있음, 공식 수강신청 안내 확인 필요"
  soft warning(차단 아님).
- **Done**: semester-plan.tsx — planned 학점 >21 시 경고 배너.
  21은 공식 한도가 아니라 보수적 임계값으로 표기.

## ISSUE-17 — 홈 Hero 캐러셀 (spec §5.3/§12.10)

- **Status**: **verified** (2026-09-18 이터레이션 5 — 슬라이드 정렬·
  수동 넘김·dots·출처·빈 상태 미렌더 확인)
- **Labels**: agent-ready, priority:p2, area:frontend
- **Objective**: spec이 요구하는 홈 중심 Hero 캐러셀 부재. 실데이터 있음:
  활동 스냅샷(커버이미지·D-day·포인트·상태). 수동 넘김 + 위치 표시,
  항목 0개 시 정적 안내 폴백.
- **Done**: home.tsx — 마감임박→접수중→접수예정 순(마감 빠른 순) 상위 5개
  슬라이드, 수동 prev/next + 위치 dots(aria-current), 커버 이미지·D-day·
  포인트·신청마감 표시, 상세 라우트 이동, 수집 출처 표기, 0개 또는 스냅샷
  미로드 시 섹션 미렌더. CSS: home.css .hero-carousel 계열.

## ISSUE-18 — 상세 라우트 부재 (spec §6)

- **Status**: implemented — **needs-verification** (전 라우트)
- **Labels**: agent-ready, priority:p3, area:frontend
- **Objective**: `/courses/:id`, `/graduation/:id`, `/calendar/:id` 상세
  라우트 없음(activities/:id만 존재). 브레드크럼 포함.
- **Done (courses/:id)**: courses.tsx에 detail 분기 — id로 분반 해석,
  브레드크럼(← 과목 목록), 전체 메타데이터(과목명·학과·코드/분반·학점·
  대상학년·교수·강의실·시간대·이수구분/정규화·온라인/교차/시간보정
  표시), 담기/빼기(plan 토글 + 충돌 표시 + 완료 과목 차단), 동일 코드
  분반 목록(시간·교수·강의실·담기 + 현재 분반 계획 중이면 swap 교체),
  시간표 이동 링크, 학기/출처/비공식 수강신청 고지. 목록·통합검색의 과목명
  클릭 → 상세 라우트. page.tsx에 swap/detail/go 전달.
- **Done (2026-09-18 이터레이션 7)**: `/graduation/:id` — 규정 상세
  (상태·진행률·공식 출처/미수집 고지·override 편집·포인트 규정은 입력
  안내), 규정에 잡히는 이수/계획 과목 분해 목록; 규정 카드 제목 링크.
  `/calendar/:id` — 공식 일정 상세(제목·기간·수집일·원본 링크·브레드
  크럼), 일정 제목 링크. 검색/advisor 일정 히트도 `calendar/<id>`
  딥링크로 변경. 제목-링크 공용 클래스 `.title-link` 추가(globals.css).
- **Logic extraction**: `searchAll`→`lib/data/search.ts`,
  `deriveNotifs`→`lib/data/notifs.ts`, `courseMatch`→`lib/data/catalog.ts`
  (순수 모듈로 이동 — 테스트 가능). 새 테스트 `tests/search.test.mjs`
  (10건) + `tests/notifs.test.mjs` (11건).
- **Advisor synonym layer**: `SCHED_ALIASES` — 학사일정 질의 동의어
  (시험→중간·기말, 납부→등록, 휴학/복학, 졸업/학위, 방학/계절, 성적).
  규칙 기반 확장으로 명시, 의미 검색 사칭 없음.

## ISSUE-19 — 전체 검색 범위 확대

- **Status**: **verified** (2026-09-18 이터레이션 5 — 라우트 배선·그룹
  결과·담기 버튼이 실제 plan() 호출 확인)
- **Labels**: agent-ready, priority:p3, area:frontend
- **Objective**: Topbar 검색이 활동만 검색 → 과목·공식일정 포함.
- **Done**: `app/sections/search.tsx` — 통합 검색 라우트(과목 cap 8·
  활동 cap 8·학사일정 cap 8, koreanMatch 기반, 그룹별 섹션, 과목 행에
  "담기" 버튼, 활동→상세 라우트, 일정→캘린더). page.tsx에 search 라우트
  추가, Topbar onSearch → 'search', placeholder/aria-label 통합 검색으로.
- **Follow-up (2026-09-19)**: 검색 범위에 COSMOS 수업 현황 추가 —
  `lmsTaskSearch()`가 개별 과제·퀴즈·강의 항목을 찾는다(질의 종류어
  필터 + 질문 어미·마감 의도어 정리, 미완료→마감순 정렬, `lms/{id}`
  딥링크). LmsSection이 `detail` prop으로 해당 과목 카드를 펼치고
  스크롤. advisor의 `searchAll`도 같은 경로 사용. search 26/26.
- **Follow-up (2026-09-21)**: 범위 칩(전체/과목/활동·일정/수업 현황,
  fieldset) + '미완료만' 토글(done 플래그) + 지난 학기 LMS 항목 기본
  제외(현재 학기 안내 문구) + 활동 라벨 liveStatus + LMS 과목 hit에
  '지난 학기' 라벨. search 30/30.

## ISSUE-14 — `_sync.py` parity check 모드

- **Status**: **verified** (2026-09-18 이터레이션 5 — 실제 드리프트
  감지·exit 1·동기화 후 parity OK 확인)
- **Done**: `--check` 플래그 — robocopy /L(list-only)로 드리프트 감지,
  파일 목록 행만 추려 DRIFT 리포트, 불일치 시 exit 1. 실제 미동기
  상태에서 6개 파일 정확히 감지 + 동기화 후 parity OK 확인.
- **Labels**: agent-ready, priority:p2, area:infra
- **Objective**: 이번에 발견된 stale-sync 버그(/XO /XN /XC 조합으로
  수정 파일 미복사) 재발 방지. `--check` 모드로 루트↔published-personal
  간 동기화 대상 파일 diff를 출력하고 불일치 시 non-zero exit.

## ISSUE-20 — 학과별 졸업 규정 수집 파이프라인 (ISSUE-6 잔여)

- **Status**: partially implemented — needs-verification (2026-09-19:
  학번표→엔진 연결을 검증된 1개 학과에 한정해 구현. 2026-09-20: 이미지
  게시 규정 수집으로 Design·역사 트랙 커버). 잔여: 다른 학과의 학번표
  포맷 확인, SclScn(학교 사이트에 졸업 링크 없음 — 수집 불가).
- **Engine 연동 (2026-09-19)**: `rulesetMatchesDept`(dept 해석·라벨 일치·
  `RULESET_DEPT_FAMILY` 검증 매핑 — 현재 컴퓨터공학부
  →{IT응용시스템공학과, 모바일소프트웨어트랙, 빅데이터트랙} 1건, 입학처
  요강·사이트·카탈로그 교차 확인)로 ruleset↔사용자 학과 연결.
  `deptRuleTargets`가 yearTable 학번 컬럼을 해석해 total/points를
  `evaluate`에 공급(override > 학과 > 전역), `requiredSource`로 출처
  추적 — pre-2016 학번도 학과 공식값 확정 가능(~15학번 140학점).
  학점 외 조건(캡스톤·트랙 수·GitHub·산학협력)은 `conditions[]`로 원문
  보존해 "내 학번 기준" 체크리스트로 표시(자동 집계 안 함 고지).
  yearTable 없는 18개 ruleset은 원문 표시만 — 엔진 확대는 수집 검증 후.
- **Labels**: agent-ready, priority:p2, area:crawler, area:data
- **Objective**: 학과별 졸업요건 페이지가 학번-컬럼 표 구조로 공개됨
  (예: hansung.ac.kr/CSE/1564/subview.do — 총학점·캡스톤·트랙수·산학
  요건을 입학연도별로 표기). 단과대 인덱스(hansung/6082~6088)에서 학과
  링크를 수집해 각 학과 졸업요건 페이지를 크롤 → dept×year ruleset JSON.
- **Acceptance Criteria**: 학과 URL 레지스트리 + 페이지별 파서 +
  학번 컬럼 매핑(~15학번/16학번/17~23/24~ 범위 파싱); 수집 못한 학과는
  unknown 유지(현행 DEFAULT_RULES 폴백); 규정형 요건(캡스톤/트랙수)은
  학점과 다른 rule source로 모델링; source/asOf 보존.
- **Scope note**: 학과별 CMS 구조가 다를 수 있어 포맷 일치 학과부터
  커버, 나머지는 미수집으로 명시.
- **Exploration findings (2026-09-18)**: `www.hansung.ac.kr/CSE/1564/
  subview.do` — 실제 학번-컬럼 규정 표 확인 (총학점·캡스톤·트랙수·산학
  요건 × ~15/16/17~23/24~학번), UTF-8 서버렌더링.
- **Discovery path confirmed (2026-09-18 이터레이션 7)**: 6081
  (대학·대학원) → 단과대 슬러그 (`/CreCon`, `/Design`, `/HmnArt`,
  `/LibArt`, `/SclScn`, `/cncschool`, `/futureplus`, `/global`)
  → 각 단과대 홈 nav에 학과소개 + 졸업요건 링크 직접 노출 확인:
  CreCon — 상상력인재학부(2772), 문학문화콘텐츠학과(2781),
  AI응용학과(2791), 융합보안학과(2800); Design — 글로벌패션산업학부
  트랙졸업요건(5108/5115/5122), ICT디자인학부(5124); HmnArt —
  크리에이티브인문학부(5596), 예술학부 트랙별(5667/5674/5681 등);
  futureplus — 학과소개 링크만 확인(졸업요건은 하위 페이지 탐색 필요).
  LibArt는 교양학부(규정 없음). SclScn/cncschool/global은 nav 라벨
  미매칭 — 추가 파싱 필요.
- **Progress (2026-09-18 이터레이션 8)**: `lib/data/dept-rules.ts`
  파서 + `scripts/crawl-dept-rules.mts` 크롤러 + `lib/data/
  dept-rules.json` 스냅샷(19 rulesets) + `/api/dept-rules` +
  졸업 섹션 "내 학과 공식 졸업요건" 카드(원문 표시) + 전체 수집
  페이지 인덱스. 발견 경로: `/sitemap/{slug}/view.do` — 학과 블록
  (학과명 라벨 또는 '학과 소개' URL 첫 라벨) 내 졸업요건 링크 연결.
  본문은 CMS `contentsEditHtml` 컨테이너에서 **원문 추출** — 수치
  해석 없음. `tests/dept-rules.test.mjs` 23/23.
- **학번-컬럼 표 파서 추가 (이터레이션 9)**: `parseYearTable` —
  헤더 행의 학번 셀 위치로 라벨/연도 컬럼 구분, 셀 원문 보존,
  비규격 행(colspan) 건너뜀, 유효 행 없으면 null. `parseYearLabel`
  (~15/16/17~23/24~ 범위→연도) + `yearColumnIndex`(입학연도→컬럼).
  실제 CSE/1564에서 4컬럼×5행 정확 파싱 확인 → `yearTable` 필드로
  스냅샷 저장, 카드 UI에 실제 표 렌더링(표 셀과 동일한 라인은
  중복 제외). tests 40/40. 엔진 연동은 미해석 학과(컴퓨터공학부)
  해소 후 — 현재는 구조화 데이터 보존 단계.
- **수집 현황 (2026-09-20 재수집 — 24 rulesets)**: CreCon 4(문콘은
  hwp 첨부+규정 이미지), HmnArt 9, futureplus 1(multiDept), CSE 1
  (컴퓨터공학부 — 패밀리 매핑으로 엔진 연결), global 6 전원 해석,
  Design 3. **이미지 게시 규정 수집**: `extractContentImage`가
  `_contentBuilder` 아티클 내 콘텐츠 이미지를 절대 URL+alt로 수집
  (footer_logo 등 노이즈 필터). 이미지 규정 6건 — 문콘(이미지+첨부),
  Design 3(트랙별 졸업인증 요건 — 학교가 3페이지에 동일한 패션마케팅
  이미지를 게시한 원본 오류, 그대로 표시), 역사문화큐레이션·역사콘텐츠.
  미수집: SclScn(사이트에 졸업요건 링크 자체 없음 — 학교 측 공백).
  무용 전공 1줄 규정은 실제 정식 문구로 파서 정상.
- **Next step**: 학과↔졸업요건 페이지 쌍을 nav 순서(학과소개 뒤
  졸업요건)로 연결하는 레지스트리 빌더 → 각 규정 페이지의 학번-컬럼
  표 파서 → ruleset JSON + 엔진 연동. 미수집 학과 unknown 유지.
  탐색 스크립트 `scripts/_probe-dept-rules.py` (root-local, sync 제외).

## ISSUE-21 — advisor 자유질문에 학사일정 검색 포함

- **Status**: implemented — **needs-verification**
- **Labels**: agent-ready, priority:p3, area:frontend
- **Objective**: advisor.tsx의 searchAll이 과목·활동만 검색 — "수강신청
  언제" 같은 질문에 공식 학사일정 타이틀 매칭이 안 됨. useSchedule
  결과를 검색 대상에 추가(route: 'calendar').
- **Done**: `searchAll(query, catalog, activities, schedEvents)` —
  과목 cap 4 → 활동(합산 cap 6) → 공식 학사일정(합산 cap 8) 순으로
  `koreanMatch(e.title, q)` 매칭, 결과는 `route: 'calendar'` +
  `공식 학사일정 · 시작일[~종료일]` 부제. advisor 컴포넌트가
  `useSchedule()` 호출해 `sched?.items` 전달.
- **Known limitation**: 제목 문자열 매칭 + 규칙 기반 동의어 확장
  (이터레이션 7의 `SCHED_ALIASES`) — 의미 검색은 아니며 AI 사칭 없이
  검색 결과로만 응답. 과목 히트는 이터레이션 7부터 `courses/<id>`
  딥링크.

## ISSUE-22 — 저장한 활동 우선 마감 알림

- **Status**: implemented — **needs-verification**
- **Labels**: agent-ready, priority:p3, area:frontend
- **Objective**: deriveNotifs의 활동 마감 알림이 전체 open/closing
  대상 — 저장한 활동(data.saved)은 별도 강조하거나, 저장 활동만으로
  제한하는 옵션 검토. 개인화 우선순위.
- **Done**: notifications.tsx — 마감 후보(applyEnd 있고 now~+7일,
  open/closing)를 `data.saved` 포함 여부로 정렬해 저장 활동 우선.
  저장 활동은 purple 톤 + `저장한 활동` 라벨, 비저장은 기존 상태
  라벨 유지. 제한이 아닌 우선순위 — 모든 마감 알림 표시 유지.
- **Done (2026-09-21)**: 활동 상태를 수집 시점 스냅샷 문자열 대신
  `liveStatus()`로 재계산(9/20 종료 활동이 9/21에 '마감' 표시) +
  `useNow(30000)`로 주기 갱신 + 지난 학기 LMS 마감 알림 제외.

## ISSUE-23 — COSMOS LMS 수업 현황 연동 (돋부기 참조)

- **Status**: implemented — **needs-verification** (2026-09-18 이터레이션 10)
- **Labels**: agent-ready, priority:p1, area:frontend, area:data
- **Objective**: 학교 LMS(COSMOS, learn.hansung.ac.kr, Moodle 기반)의
  수강 상태를 앱에서 확인 — 수강한/남은 온라인 강의, 미제출 과제,
  미응시 퀴즈, 마감 임박 항목. 오픈소스 확장 "돋부기"(hs-shell/dotbugi)
  의 DOM 스크래핑 접근을 참조 — 서버가 COSMOS 세션에 접근할 수 없으므로
  사용자 브라우저 안에서 수집하는 구조가 유일한 정직한 경로.
- **Done**:
  - `public/lms-collect.js` — 브라우저 수집 스크립트 (`/lms-collect.js`
    정적 제공). 대시보드 `.my-course-lists` 과목 목록 → 과목별
    `mod/assign/index.php`(generaltable), `mod/quiz/index.php` +
    `quizattemptsummary` 제출 판정, `report/ubcompletion/user_progress[_a].php`
    출석부(thead 동적 컬럼 매칭 + rowspan 평탄화, 일괄출석인정 처리),
    `course/view.php` VOD 링크/수강기간. `Promise.allSettled` 부분 실패
    보존 + `errors` 필드. 결과 `lms-data.json` 다운로드 — 외부 전송 없음.
  - `lib/data/lms.ts` — `LmsSnapshot` 타입 + `validateLms`(형식 검증),
    `courseProgress`, `pendingTasks`, `dueSoon`(range 끝날짜 파싱).
  - `app/sections/lms.tsx` + 사이드바 '수업 현황' 메뉴 — 3단계 수집 안내,
    스크립트 복사 버튼/파일 링크, JSON 업로드 가져오기(검증 실패 시
    오류), 과목별 카드(강의 진행률 바 + 미완료 목록 + COSMOS 딥링크 +
    부분 수집 고지), 7일 마감 임박 목록, 데이터 삭제.
  - `Data.lms` 필드 + demo shape-check + account profile API에
    `validateLms` 검증 추가 (body 한도 30KB→200KB — 스냅샷 크기 대응).
  - `deriveNotifs` — LMS 마감 ≤7일 미완료 항목 알림(cat '수업', 최대 5).
  - `tests/lms.test.mjs` 21/21 — 검증/진행률/미완료/dueSoon/알림 도출.
- **Done (2026-09-19)**: `extension/` — Chrome MV3 확장(돋부기 접근의
  정식화). MAIN world content script가 LMS 페이지에 '학사도우미 수집'
  버튼을 띄워 클릭 한 번으로 lms-data.json 다운로드. 실제 DOM 파서라
  서버 정규식보다 견고 + 커뮤니티 과목 `.course_label_ec` 정상 감지 +
  시청시간(watched)/요구시간(required) 수집. 서버 측도 보완: parseCourses
  커뮤니티 감지 + 과목 유형별 출석부 URL 우선순위. `LmsVod.watched`/
  `required` 필드 추가.
- **Done (2026-09-19, v0.2.0)**: 확장 자동 수집 — 앱을 열면 background
  서비스 워커가 LMS 탭(없으면 비활성 생성)에서 `__hsCollect`를 실행해
  postMessage로 앱에 전달, page.tsx가 validateLms 후 persist로 저장.
  alarms 4h 주기 수집 + storage 마지막 스냅샷 즉시 표시. COSMOS 미로그인
  시 'cosmos-login-required' 상태 메시지 → 데이터 없을 때만 안내 토스트.
- **Done (2026-09-19, v0.3.0 하드닝)**: 사용자 LMS 탭 납치 제거(대시보드
  탭만 재사용, 아니면 자체 탭 생성+수집 후 폐쇄), inflight 중복 수집 공유
  + 5분 캐시 + 브리지 30분 스로틀, alarms 재생성 리셋 버그 수정(get으로
  없을 때만), 설치 전 열린 탭에 content.js 직접 주입 복구, runCollect
  throw 격리, /login 경로 감지, 앱 수신 origin 체크.
- **Done (2026-09-19, v0.3.1)**: 과목 셀렉터 폴백 — .my-course-lists
  없으면 Moodle 표준 course/view.php 링크 스캔(서버 파서와 동일, 실계정
  검증 접근) + payload.diag(coursesVia 등) + 실패 시 셀렉터별 매칭 수
  콘솔 덤프. 확장 quiz uncertain/'quiz-check' 복구. 알람 createTab
  'known'(수집 이력 있는 사용자만 탭 생성 — 갱신 공백 해소). 수집 실패
  hsuLmsErr 기록. watched/required UI 표시(BingeItem 패스스루 +
  BingeRow·TaskRow).
- **Out of scope**: LMS 로그인 자동화, 돋부기 자체 배포.
- **Note**: 셀렉터 계약은 dotbugi 소스(fetchCourseData/fetchAssign/
  fetchQuiz/fetchVodAttendance/fetchVodList/lmsKeywords)에서 확인한
  실제 COSMOS DOM 구조 기반 — 페이지 구조 변경 시 수집 실패로 표면화
  (조용한 오류 아님). 수집 시점 스냅샷 — 이후 LMS 변경은 재수집 필요.
- **Follow-up candidates**: 북마클릿 형태(콘솔 붙여넣기 대체), 수집
  주기 알림(stale 경고), 강의별 시청 시간(%) 표시, 학사일정/캘린더에
  LMS 마감 병합, ~~advisor 검색에 LMS 과목 포함~~(2026-09-19 완료).
- **Done (2026-09-20)**: 브라우저 마감 알림 — `reminderTargets()`로
  미래 마감 24h 전·당일 OS 알림 예약(opt-in, `notifiedIds` 중복 방지).
  앱이 열려 있을 때만 동작 — 백그라운드 푸시는 VAPID+서비스워커+
  구독 저장 인프라가 필요한 별도 과제. `enrolledSectionIds`로 LMS
  과목↔카탈로그 이름 매칭 '수강 중' 배지(표시 전용, 집계 미반영).
  LMS 섹션 뷰 탭 추가 — '제출·응시'(`submissionItems`: 과제·퀴즈
  완료 포함 통합 현황, uncertain은 확정 미응시와 구분)와 '몰아듣기'
  (`bingeQueue`: 미시청 강의 기한순 큐 + COSMOS 링크, 자동 재생/
  출석 조작 아님).
- **Done (2026-09-21, UX/QA 감사 P0/P1/P2)**:
  - 지난 학기 분리 — `currentSemesterStart(now)` + `isPast`/
    `courseIsPast`; pendingTasks·submissionItems·bingeQueue·dueSoon에
    `before` 파라미터(카탈로그 semester 우선). 지난 학기 과목·항목
    배지 + 몰아듣기/제출·응시 보관 영역(details.lms-past), 카드
    '남은 N건'·홈·알림·캘린더·advisor·검색은 현재 학기만 집계.
    마감 미기재는 과거로 추측하지 않음.
  - 동기화 시각 일치 — `useNow(30000)` 공유(마운트 고정 now 제거),
    SyncBand·ConnCard가 같은 snap.fetchedAt에서 relTime+절대시각
    병기, stale ≥1일 '오래된 데이터' 배지 + band stale 임계 동일화,
    새로고침 disabled 사유 표기.
  - 카탈로그 매칭 경고 상단 배치 — lms-match-warn 카드(N 중 M 미매칭
    + 졸업 계산 제외) + 졸업 수강 스트립에 집계 경고.
- **Done (2026-09-21, v0.4.0 + UI 리디자인)**: 확장↔앱 프로토콜 정식화
  + 동기화 상태 단일화 + LMS 화면 재설계.
  - 브리지 계약: `hsu-extension-ready`(버전, ping 재요청 가능),
    `hsu-lms-status`(syncing/success/login-required/failed+error),
    `hsu-lms-import`, 앱→확장 `hsu-lms-refresh-request{force}` —
    전부 origin 검증 + validateLms 통과분만 반영.
  - page.tsx: ext 상태 단일화 + 수집 타임아웃(2분 무응답→failed)
    + visible 전용 15분 갱신 루프(visibilitychange로 중지/재개,
    fetchedAt 기준 stale 판정) + 수동 새로고침 force(5분 캐시
    우회, inflight 공유 유지).
  - `LmsSnapshot.diag` 타입+검증 통과 보존(coursesVia/pagePath/
    scanned) — 수집 경로·진단을 제품 UI에서 확인 가능.
  - lms.tsx 재설계: navy 동기화 상태 밴드(상태 도트·마지막 동기화
    relTime·과목 수·남은 항목·수집 경로·자동 갱신 간격·CTA),
    asymmetric 2열 그리드(메인 탭 뷰 + 사이드 마감 임박/연결 관리),
    연결 관리 카드(동기화 상태·경로·진단·마지막 오류·카탈로그 매칭
    실패 과목 노출 + 확장/서버/파일 수집 수단), 확장 우선 설치 안내
    (F12 지침 제거, 스크립트는 details 보조 수단), 항목 유형별
    pastel 행(강의 sky/과제 peach/퀴즈 lavender), 모바일 단일 열.
  - 테스트: 실계정 7과목 형태 익명 fixture(diag/weeklyStatus/
    watched/required/uncertain/community/quiz-check) + relTime
    단위 — lms.test 78/78.
- **Done (2026-09-21, 디자인 패스)**: 실제 렌더 스크린샷 감사 후 수정.
  모바일 밴드 거대 공백 버그(flex-basis가 column 방향에서 height로
  작동), 지표 구겨짐 → grid 3열+hairline 구분선+자동 갱신을 CTA 아래
  노트로. LMS 원문 과목명 정제(courseDisplay — '교과(온라인) 학부
  데이터분석[01] 김교수' → '데이터분석'+[01] 배지+교수 메타, 원문은
  tooltip). pastel 행 55% 완화(color-mix), '미완료·완료' 중복 수치
  제거, 모바일 CTA nowrap. `docs/design.md` 기준 문서 추가 — 토큰,
  WebGL 레퍼런스 판정(코어 화면 부적합 명시), 스크린샷 감사 절차.

## ISSUE-24 — BE 업무 패키지 (팀원 핸드오프)

- **Status**: handed-off — `docs/backend-tasks.md` (2026-09-18)
- **Labels**: priority:p1, area:backend
- **Objective**: 백엔드 작업을 팀원에게 위임 — BE-1 로그인 시 서버 측
  COSMOS 수집(`connectSchool`의 기존 LMS 세션 재사용, 최우선), BE-2
  재수집 경로 설계(자격 증명 비저장 제약), BE-3 공개 스냅샷 D1 이관+
  갱신 파이프라인, BE-4 프로필 검증 모듈화, BE-5 보안/운영 하드닝,
  BE-6 배포·원격 D1(권한 필요).
- **Note**: 서버가 로그인 시 COSMOS 세션을 이미 확보함(school.ts) —
  브라우저 수동 수집(ISSUE-23)은 백업 경로로 유지, 서버 수집이 본선.
- **Progress**: BE-6 ✅ 완료 (2026-09-18) — Cloudflare Workers 프로덕션
  라이브 `https://hansung-helper.gyeongbin-38.workers.dev`, 원격 D1 생성+
  마이그레이션, `scripts/_deploy.py` 재배포 경로 확립. GitHub 정리 완료:
  `hansung-helper` public, `-`(빈 repo) 삭제, deploy repo private 유지.
  BE-1 ✅ 완료 (2026-09-18, 실계정 검증 09-19) — `lib/server/lms.ts`
  서버 측 수집기(정규식 파서, dotbugi 계약): 로그인 시 과목별
  과제/퀴즈/출석부/수강기간 수집 → `snapshot.lmsData` → 클라이언트가
  최신 fetchedAt 기준 `data.lms` 승격. 24s 수집 예산, 부분 실패
  errors[] 보존. 실계정 7과목 수집·시간표 매칭 브라우저 검증 완료.
  BE-3 ✅ 완료 — `public_snapshots` D1 테이블(60K자 청크 분할,
  SQLITE_TOOBIG 우회) + `lib/server/snapshots.ts` D1 우선·번들 폴백
  + `scripts/_publish_snapshots.mjs` 재배포 없는 게시 경로.
  BE-2 ✅ 1차 구현 — 비밀번호 재인증 재수집 `POST /api/account/lms-refresh`
  (세션 유지, 학번 해시 일치, 3회/15분 제한). 수집 상태 마커
  `lmsPending`/`lmsFailedAt`로 실패를 영구 "수집 중"과 구분 — 지연 수집
  성공·실패 모두 D1에 기록, checkedAt 가드 유지. 클라이언트 폴링은
  마커 기준으로 종료하고 스냅샷 lmsData를 항상 최신 fetchedAt으로 병합.
  퀴즈 응시 확인 실패는 `uncertain`+`quiz-check` 오류로 표현(미응시
  단정 금지), `dueSoon`에 과거 7일 하한 추가(오래 지난 항목이 최신
  마감을 밀어내지 않도록). 브라우저 수집기(lms-collect.js)도 동일
  의미로 갱신. UI: 수집 중/실패/미연결 상태 구분, 서버 재수집 폼
  (RefreshForm), 파일 가져오기 라벨 정정.
  잔여: 수집 실패율 관측(로그만 있음), 클라이언트 측 자동 갱신(설계
  필요), BE-4/BE-5 미착수.

## ISSUE-10 — 빌드 툴체인 취약점 주기 갱신

- **Status**: ✅ resolved (2026-09-19) — `npm audit` 0 vulnerabilities
- **Labels**: agent-ready, priority:p3, area:infra
- **Objective**: `npm audit` (2026-09-17) reports 8 high items, all in
  build tooling — vinext, vite, wrangler, @cloudflare/vite-plugin,
  react-server-dom-webpack (RSC DoS), miniflare, sharp, undici, ws,
  image-size. None reach shipped app code (app deps are only
  react/react-dom/@dnd-kit/lucide), but bump toolchain versions
  periodically and re-audit. Do not `audit fix --force` blindly —
  verify vinext/vite compatibility per bump.
- **Resolution (2026-09-19)**: 재감사에서 high 10·low 1로 증가 확인 —
  `react-server-dom-webpack@19.2.6`은 직접 의존성이고 RSC 런타임이
  워커 번들에 포함되므로 배포 경로에 해당(GHSA-wx67-qw84-cm4g,
  Server Functions DoS — 앱에 'use server' 없지만 패키지는 번들에
  존재). 나머지는 dev/build 경로(vite dev server, miniflare 로컬
  에뮬레이션, esbuild dev on Windows, image-size 빌드 시 파싱).
  수동 호환 범프 적용(audit fix --force 아님):
  react/react-dom/react-server-dom-webpack 19.2.6→19.3.0,
  vinext beta.5→beta.10, vite 8.0.13→8.3.0,
  @vitejs/plugin-rsc 0.5.26→0.5.35(vinext peer ^0.5.34),
  @cloudflare/vite-plugin 1.37.1→1.56.0, wrangler 4.92.0→4.135.0
  (peer 요구), @cloudflare/workers-types 4.x→5.20260919.1
  (wrangler peerOptional), @types/react(-dom) 19.3.0.
  결과: **npm audit 0건**, tsc/oxlint/전체 테스트/양쪽 빌드/배포
  검증 통과, 라이브 version ec3280d1. 이전 "전부 빌드 도구라 영향
  없음" 메모는 부정확했음 — 직접 의존성 패키지는 별도 추적 필요.

## ISSUE-25 — 졸업·비교과 사용성: 미입입력/0 분리 + 요건 체크리스트 + 포인트 연결

- **Status**: **verified** (2026-09-21 — tsc/oxlint/매트릭스/양쪽 빌드/
  _verify_prod 전부 통과, 프로덕션 스크린샷으로 미입입력 표기·체크리스트
  렌더·포인트 밴드 확인, 라이브 4e03acec)
- **Labels**: agent-ready, priority:p0, area:frontend, area:data
- **Objective**: 외부 사용성 시뮬레이션(종합 2/5)의 핵심 지적 해결 —
  데이터 부재가 0으로 표시되는 문제, 학과 규정 원문 나열, 졸업↔비교과
  연결 부재, 필터 결과 건수 불일치.
- **Resolution**:
  - 미입입력 vs 0: `completed` 공백·`points` 미입입력 시 규정 카드·인트로·
    상세가 "미입입력 / N 필요" + "입력 필요" 배지로 표시(진행률 aria도
    '미입입력'). "0학점이 아니라 미입입력 상태" 문구 추가.
  - 비학점 요건 체크리스트: yearTable 조건(dept-conds)과 원문 라인의
    `N. [필수] 항목` 패턴 모두 checkbox + 확인 완료 배지로 변환. 세부
    라인(-/*)은 항목 세부로 묶음. `data.reqChecks`로 영속화 — profile
    route에 배열 검증 추가.
  - 졸업↔비교과 연결: 활동 목록 상단 act-band(현재/필요/잔여 포인트 +
    졸업요건 이동), 활동 상세에 완료 시 +N P·누적 예상, 포인트 규정
    상세에 '포인트 채울 활동 보기' 버튼. 활동 상세에 커버 이미지와
    공고 원문 확인 안내.
  - 건수 버그: 필터된 목록 푸터가 "조건에 맞는 N건 표시 중 · 전체 M건".
  - 상세 배지 '마감 · 마감' 중복 제거(label===dday 생략).
- **Follow-ups**: 매칭 실패 LMS 과목의 수동 매핑 UX, 활동 상세의 공고
  본문 크롤링(현재 목록 데이터만), 학과 규정 라인 파서의 다른 학과
  포맷 커버리지.

## ISSUE-26 — 페이지별 설문 진입점 + 비교과 전용 취향 설문

- **Status**: **verified** (2026-09-21 — tsc/oxlint/매트릭스/양쪽 빌드/
  _verify_prod 통과, 프로덕션 CDP 캡처로 두 설문 다이얼로그·취향 추천
  탭·빈 상태 프롬프트 확인, 라이브 51f4f8b8)
- **Labels**: agent-ready, priority:p1, area:frontend, area:data
- **Objective**: 설문이 프로필에서만 열리던 것을 각 페이지 문맥에서
  열 수 있게 하고, 비교과 활동에는 별도 취향 설문을 둔다
  ("비교과는 비교과 설문이 있어야지").
- **Resolution**:
  - `SurveyDialog` 범용화 — `label`/`questions` props로 받고 문항 수를
    `questions.length`에서 파생(6 하드코딩 제거). 수업 선호·비교과
    선호가 같은 렌더러를 공유.
  - `ACT_QUESTIONS` 5문항(목표·유형·개인/팀·일정·포인트) 추가,
    `data.actPrefs: string[]` 신규 필드로 `prefs`와 분리 저장 —
    서버 profile route 검증(≤20항목·각 ≤100자), Profile 타입,
    데모 수화 검증, 로그아웃/삭제 리셋 모두 반영.
  - 진입점: `PageHeading`에 섹션별 설문 버튼(비교과→비교과 설문,
    그 외→수업 선호 설문)으로 전 페이지 접근 + 활동 포인트 밴드에
    '비교과 취향 설문/다시하기' CTA + 프로필에 두 설문 버튼.
  - 취향 추천 탭: TABS에 '취향 추천' 추가, `actScore()`(lib/data/
    activities.ts) 규칙 기반 스코어링 — 포인트·인증·유형 키워드·
    개인/팀·일정 상태 가산, 근거 문자열 반환. 점수>0만 표시·정렬,
    카드에 '맞춤 N' 배지+툴팁 근거. 미응답 시 설문 시작 프롬프트.
  - 홈 태스크: actPrefs 미설정 시 '비교과 취향 설문하기' → activities.
- **Follow-ups**: 설문 답변을 AI 상담·알림 개인화에도 연결(ISSUE-15
  후속), 추천 근거를 카드에 상시 노출할지 여부, 설문 완료율 계측 없음.

## ISSUE-27 — 시간표 시나리오 저장 + LMS 수동 매칭 + 온보딩 이수 단계

- **Status**: **verified** (2026-09-21 — tsc/oxlint/매트릭스/양쪽 빌드/
  _verify_prod 통과, 프로덕션 CDP 캡처로 시나리오 슬롯 렌더 확인,
  라이브 ae91c70d)
- **Labels**: agent-ready, priority:p1, area:frontend, area:data
- **Objective**: 시간표를 단일 planned에서 시나리오 비교로 확장하고,
  LMS 과목명 매칭 실패를 사용자가 수동 보정할 수 있게 하며, 온보딩에
  이수 과목 입력 단계를 추가한다 (ISSUE-1/ISSUE-23 후속).
- **Resolution**:
  - `plans: Record<string,string[]>` — 안 A/B/C 슬롯 카드(과목 수·
    학점·공강 일수 요약, 불러오기/덮어쓰기/삭제). 현재 planned와
    슬롯이 서로 덮어쓰지 않음을 콜백 분리로 보장. "개인 계획이며
    공식 수강신청과는 별개" 문구 유지.
  - `lmsMatch: Record<string,string>` — 'ignore' 또는 카탈로그 분반
    id. matchEnrollment overrides가 자동 매칭보다 우선. lms/courses/
    graduation 3곳이 동일 매핑을 소비해 불일치 없음. 서버·클라이언트
    양쪽 shape 검증.
  - 온보딩 stage 1 — 카탈로그 검색으로 이수 과목 추가(진급 계산의
    기초 데이터). 진행 단계 7→8.
  - 홈 '이번 주 마감' — LMS dueSoon + 활동 마감 + 학사일정 통합.
- **Follow-ups**: 시나리오 이름 자유 입력(현재 A/B/C 고정), 시나리오
  간 과목 diff 뷰, lmsMatch 매핑의 신뢰도 표시(수동=확정/자동=추정),
  온보딩 이수 단계의 학점 자동 합산 표시.
