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

- **Status**: implemented — needs-verification (fix 재검증 필요, 2026-09-17)
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

- **Status**: backlog
- **Labels**: agent-ready, priority:p2, area:graduation, area:data
- **Objective**: upgrade v0 engine to dept × admission-year versioned
  rulesets (`lib/data/rules/*.json`) with structured `source`/`asOf`
  provenance per rule; add distinct 수강중(in-progress) state between
  완료 and 계획.
- **Dependencies**: official Hansung 졸업 규정 데이터 소스 필요
  (없으면 dept rules stay "확인 필요" placeholders).
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

- **Status**: implemented — needs-verification (2026-09-17)
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

- **Status**: backlog — agent-ready
- **Labels**: agent-ready, priority:p2, area:frontend
- **Objective**: 알림함은 고정 1건(연결 안내)뿐이고 홈 "지금 할 일"은
  완료 여부와 무관하게 카운트 `3` 고정. 실제 상태에서 알림을 도출:
  계획 과목 시간충돌, 활동 신청마감 임박(applyEnd D-7 이내),
  프로필/졸업 입력 미완성. 홈 할일 카운트도 완료 상태 반영.

## ISSUE-14 — `_sync.py` parity check 모드

- **Status**: backlog — agent-ready
- **Labels**: agent-ready, priority:p2, area:infra
- **Objective**: 이번에 발견된 stale-sync 버그(/XO /XN /XC 조합으로
  수정 파일 미복사) 재발 방지. `--check` 모드로 루트↔published-personal
  간 동기화 대상 파일 diff를 출력하고 불일치 시 non-zero exit.

## ISSUE-10 — 빌드 툴체인 취약점 주기 갱신

- **Status**: backlog
- **Labels**: agent-ready, priority:p3, area:infra
- **Objective**: `npm audit` (2026-09-17) reports 8 high items, all in
  build tooling — vinext, vite, wrangler, @cloudflare/vite-plugin,
  react-server-dom-webpack (RSC DoS), miniflare, sharp, undici, ws,
  image-size. None reach shipped app code (app deps are only
  react/react-dom/@dnd-kit/lucide), but bump toolchain versions
  periodically and re-audit. Do not `audit fix --force` blindly —
  verify vinext/vite compatibility per bump.
