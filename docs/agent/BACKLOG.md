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

- **Status**: backlog
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
- **Repo Scout**: yes — evaluate fetcher vs Playwright need based on
  target pages' rendering (only adopt Playwright if server-rendered HTML
  is insufficient).

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

- **Status**: implemented (source-only; pending deploy)
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

## ISSUE-5 — Remote D1 seeding + deploy parity check

- **Status**: backlog — needs-human (deploy/credentials approval)
- **Labels**: priority:p1, area:infra, needs-human
- **Objective**: apply `drizzle/` migrations + catalog to remote D1;
  verify `published-personal/.openai/hosting.json` deploy target still
  serves API routes with bound DB.
