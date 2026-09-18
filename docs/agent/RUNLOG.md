# Agent Run Log

Each autonomous session appends one entry here using the required
end-of-run format. Next session: read this + BACKLOG.md first, verify
`needs-verification` items before starting new work.

---

## 2026-09-17 — loop iteration (Devin/Paseo session)

DONE:
- Consolidated the prior session's uncommitted work into commit b304e21
  (ISSUE-1/3/4 verified code: catalog, timetable builder, graduation v0,
  dept normalization, sections/styles split).
- Verified ISSUE-4 as independent fresh session → PASS (unmatched dept
  shows "학과 매칭 확인 필요", never wrong results).
- ISSUE-7 implemented: deleted unused starter kit (components/ ~90
  files, hooks/, components.json, lib/utils.ts) in both repos; pruned
  14 starter-only deps; root tsconfig now excludes published-personal/
  (it was silently type-checking the nested repo against root paths).
- ISSUE-8 implemented: replaced 2 vacuous assertions with pinned
  outcomes (AI융합 → unresolved; 융합 → exactly 2 candidates).
- ISSUE-2 implemented (snapshot variant): hsportal public list is
  server-rendered → plain-HTTP crawler scripts/crawl-activities.mts →
  lib/data/activities.json (39 items) → GET /api/activities →
  activities.tsx rewired (real covers, status tabs, provenance).
- ISSUE-11 implemented: advisor answers from real plan/catalog/
  activity data; free-text keyword search returns routable hits.
- Fixed _sync.py: /XO /XN /XC meant it never copied modified files —
  deploy repo was silently stale. Now /MIR mirroring. Also stopped
  cloudflared.exe leaking into the deploy repo.
- Both repos committed; published-personal rebuilt independently.

IN PROGRESS: nothing — working tree clean in both repos.

NEXT:
1. Verify ISSUE-2, ISSUE-7, ISSUE-8, ISSUE-11 in a fresh session
   (verifier must not be this session).
2. ISSUE-6 (dept×year rulesets + 수강중) — blocked on official 졸업
   규정 data (needs-human input).
3. ISSUE-10 — toolchain bumps with compat verification.
4. Re-run crawler periodically to refresh activities.json.

BLOCKER: ISSUE-5 (remote D1 + deploy) and ISSUE-9 (stale root
.openai/hosting.json project_id) need human/accounts. Live-deployed
site at https://hansung-campus.gyeongbinb38.chatgpt.site predates all
of this work.

TESTS: tsc, oxlint, build (both repos), catalog 4/4, school 5/5,
graduation 4/4, ux-utils 24/24, activities 5/5, http-check PASS,
account-db PASS.

REPO SCOUT: none needed this run (plain HTTP sufficed for hsportal —
Playwright rejected; recorded in ISSUE-2).

VERIFICATION STATUS: ISSUE-2/7/8/11 await independent verification.

DEPENDENCIES/REPOS REVIEWED: none added; 14 removed (ISSUE-7).

---

## 2026-09-17 — loop iteration 2 (verification + ISSUE-12)

DONE:
- Verified ISSUE-7 (starter-kit removal) → PASS: dirs gone, no imports,
  deps minimal, gates green.
- Verified ISSUE-8 (test assertions) → PASS: pins real outcomes.
- Verified ISSUE-11 (data-driven advisor) → PASS; fixed minor nit:
  failed activities fetch no longer shows "불러오는 중" forever.
- Verified ISSUE-2 (activities pipeline) → **FAIL, then fixed**: cards
  carry extra <time> elements outside date_layer (header run-time pair
  + content duplicate), so positional extraction swapped 신청↔운영 on
  26/39 rows — and the test pinned the bad value. Parser now maps
  date_layer blocks by their 신청/운영 label; test corrected; regression
  test added; snapshot re-crawled (37 items, all sane).
- Implemented ISSUE-12: official 학사일정 ingestion —
  lib/data/schedule.ts + scripts/crawl-schedule.mts (POST month/year2,
  12 months of the academic year) → lib/data/schedule.json (73 events)
  → GET /api/schedule → calendar.tsx shows upcoming official events
  with 공식 학사일정 provenance. tests/schedule.test.mjs 4/4.
- New findings logged: ISSUE-13 (derived notifications + 홈 할일 카운트
  고정값), ISSUE-14 (_sync.py --check mode).
- Both repos committed: f5dfe0d + cf23f56 (root), 277d171 + f6a5967
  (deploy).

IN PROGRESS: nothing — working tree clean in both repos.

NEXT:
1. Re-verify ISSUE-2 date fix + verify ISSUE-12 in a fresh session.
2. ISSUE-13 (derived notifications, home task count), ISSUE-14
   (sync --check).
3. ISSUE-6 still needs official 졸업 규정 data; ISSUE-5/9 need human.

BLOCKER: unchanged — ISSUE-5 (remote D1 + deploy) and ISSUE-9 need
human/accounts.

TESTS: tsc, oxlint, build (both repos), activities 6/6, schedule 4/4,
catalog 4/4, school 5/5, graduation 4/4, ux-utils 24/24.

REPO SCOUT: hansung.ac.kr/hansung/6096/subview.do is public, server-
rendered, UTF-8 — plain HTTP POST suffices for month navigation.

VERIFICATION STATUS: ISSUE-2 fix + ISSUE-12 await independent
verification.

---

## 2026-09-18 — loop iteration 3 (ISSUE-6 partial + 13 + 15 + 16)

DONE:
- Recon'd spec gaps vs implementation (courses/graduation/calendar
  detail routes absent, hero carousel absent, topbar search = activities
  only, 4/6 survey answers unused, no max-credit constraint) and
  confirmed ISSUE-6 is partially unblocked — the school publishes the
  2016학번~ global baseline publicly (교과 130학점 + 비교과 800P,
  학기/프로그램당 200P 상한 at hansung.ac.kr/hansung/6220/subview.do).
- ISSUE-6 partial: GLOBAL_RULE_SOURCE provenance constant; DEFAULT_RULES
  now carry the official global baseline (130 credits + 800P, unit/
  source fields added). evaluate() takes {admitYear, points} — baseline
  applies only for 2016+, pre-2016 and missing points stay UNKNOWN,
  dept-specific rules stay "확인 필요", user overrides still win.
  graduation.tsx renders unit-aware rows + official source link.
  tests 6/6.
- ISSUE-15 implemented: recommend() now scores 우선목표 (졸업요건 충족
  →필수 카테고리, 전공 심화→전필/전선, 진로 탐색→교양/타학과 개방) and
  학기구성 (일정 여유→온라인/무시간대, 공강일 확보→기존 요일 보존,
  고른 배치→요일 균형). 수업방식/평가방식 stay unscored — catalog has no
  such metadata — and timetable rec panel now says so explicitly.
- ISSUE-16 implemented: semester-plan warns (not blocks) when planned
  credits >21, labeled as a conservative threshold, not an official cap.
- ISSUE-13 implemented: notifications derived from real state (planned
  conflicts, activity applyEnd within 7d, official schedule within 7d,
  incomplete profile, account disconnected) + category count badges;
  home tasks derived from actual state instead of hardcoded 3, official
  schedule merged into "다가오는 일정" with provenance labels; empty-
  state shown when nothing outstanding. React Compiler purity:
  Date.now() moved to useState lazy init (mount-time, once).
- Both repos synced + built; commit pending this entry.

IN PROGRESS: nothing — gates all green.

NEXT:
1. Fresh-session verification: ISSUE-2 fix, ISSUE-12, ISSUE-6 partial,
   ISSUE-13, ISSUE-15, ISSUE-16.
2. ISSUE-17 (hero carousel), ISSUE-18 (detail routes), ISSUE-19
   (global search), ISSUE-14 (sync --check).
3. ISSUE-6 remainder: dept×year rulesets need per-dept official rule
   pages collected/validated; 수강중 state still absent.

BLOCKER: unchanged — ISSUE-5 (remote D1 + deploy) and ISSUE-9 need
human/accounts. Public deployment still predates all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, build (both repos),
http-check PASS, account-db PASS.

REPO SCOUT: none adopted this run (node-html-parser stays a candidate
for crawler parsing — recorded earlier; Date.now purity forced a
useState pattern, no dep needed).

VERIFICATION STATUS: ISSUE-2 fix, ISSUE-12, ISSUE-6 partial, ISSUE-13,
ISSUE-15, ISSUE-16 await independent verification.

---

## 2026-09-18 — loop iteration 4 (verification + 14 + 17 + 19)

DONE:
- Verified ISSUE-2 date-label fix → PASS (label-based date_layer mapping,
  regression test for missing 신청 layer, re-crawled snapshot sane).
- Verified ISSUE-12 schedule pipeline → PASS (row parser, fnv ids,
  anomaly guard, API + calendar UI provenance).
- Verified ISSUE-6 partial → PASS (2016+ baseline applies, pre-2016 →
  UNKNOWN, missing points → UNKNOWN, profile year/points inputs exist,
  official source link rendered).
- Verified ISSUE-15 → PASS (우선목표/학기구성 scored; 수업방식·평가방식
  explicitly disclosed as unscored).
- Verified ISSUE-16 → PASS (21-credit soft warning, no fake official cap).
- Verified ISSUE-13 → PASS **with two verifier-found bugs fixed**:
  1. `read: boolean` made "모두 읽음" permanently mark all future
     notifications read — now `readIds: string[]`; derivation extracted
     to `deriveNotifs()` shared by the section and the Topbar bell dot
     (now shows real unread count). Profile schema + API validation +
     demo shape-check updated.
  2. profile route rejected ruleOverrides >300 while the UI allows ≤2000
     and 800P is the official target — cap raised to 2000.
- ISSUE-14 implemented: `_sync.py --check` — robocopy /L list-only drift
  detection, DRIFT report + exit 1 on mismatch. Detected the real
  6-file drift, then parity OK post-sync.
- ISSUE-17 implemented: home hero carousel — top 5 actionable activities
  (closing→open→upcoming, soonest deadline), manual prev/next +
  position dots, cover/D-day/points/deadline, provenance line, hidden
  when snapshot empty. CSS .hero-carousel in home.css.
- ISSUE-19 implemented: 통합 검색 — new `search` route, grouped results
  (courses/activities/schedule, koreanMatch, cap 8 each), course rows
  have "담기" buttons, activity → detail route, topbar placeholder
  updated.
- Both repos synced + built; commits pending this entry.

IN PROGRESS: nothing — gates all green.

NEXT:
1. Fresh-session verification: ISSUE-13 readIds fix + override cap,
   ISSUE-14, ISSUE-17, ISSUE-19.
2. ISSUE-18 (detail routes /courses/:id, /graduation/:id,
   /calendar/:id), ISSUE-10 (toolchain audit bumps).
3. ISSUE-6 remainder: dept×year rulesets (per-dept official pages
   exist, e.g. CSE/1564 — needs per-dept collection+validation),
   수강중 state.

BLOCKER: unchanged — ISSUE-5 (remote D1 + deploy), ISSUE-9 (stale root
hosting.json) need human/accounts. Public deployment still predates
all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, build (both repos),
http-check PASS, account-db PASS, sync --check parity OK.

REPO SCOUT: none needed — carousel/search built from existing deps.

VERIFICATION STATUS: ISSUE-13 fixes, ISSUE-14, ISSUE-17, ISSUE-19
await independent verification.

---

## 2026-09-18 — loop iteration 6 (verification + 21 + 22 + 18-partial + 20-scout)

DONE:
- Verified ISSUE-13 readIds fix, ISSUE-14, ISSUE-17, ISSUE-19 → all PASS
  (code review: per-item read state consistent across schema/API/demo
  shape-check; sync --check live-verified with real drift then parity OK;
  carousel + unified search confirmed via review + gates).
- ISSUE-21 implemented: advisor free-text search now includes official
  schedule events — searchAll(query, catalog, activities, schedEvents),
  koreanMatch on event titles, route 'calendar', `공식 학사일정` subtitle
  with dates. Limitation documented: title-substring matching only.
- ISSUE-22 implemented: saved activities prioritized in deadline
  notifications — sort puts data.saved first, purple tone + '저장한 활동'
  label; unsaved keep status label. Prioritization, not restriction.
- ISSUE-18 partially implemented: /courses/:id detail route — breadcrumb,
  full section metadata, plan/remove with conflict display, sibling
  분반 list with add + swap-when-planned, timetable link, provenance
  disclaimers. Course names in list + unified search link to detail.
  /graduation/:id + /calendar/:id remain in backlog.
- ISSUE-20 explored: CSE dept page (CSE/1564/subview.do) confirmed to
  have a real admission-year-column rules table (UTF-8 server-rendered).
  Blocker identified: no dept-link discovery path — college index pages
  6082-6088 are nav chrome only; 6081 (대학·대학원) is a candidate dept
  directory needing deeper parse; dept slug + 졸업요건 subview id differ
  per dept → manual registry or per-dept nav crawl needed. Probe script
  kept at scripts/_probe-dept-rules.py (root-local, sync-excluded).
- Gates all green; both repos synced (parity OK) + built; commits pending.

IN PROGRESS: nothing.

NEXT:
1. Fresh-session verification: ISSUE-21, ISSUE-22, ISSUE-18 courses/:id.
2. ISSUE-18 remainder (/graduation/:id, /calendar/:id), ISSUE-10
   (toolchain audit bumps).
3. ISSUE-20 implementation: dept directory discovery (6081 parse or
   per-dept nav crawl) → dept registry → ruleset JSON for consistent-
   format depts; unknown preserved for the rest.

BLOCKER: unchanged — ISSUE-5 (remote D1 + deploy), ISSUE-9 (stale root
hosting.json) need human/accounts. Public deployment still predates
all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, build (both repos),
http-check PASS, account-db PASS, sync --check parity OK.

REPO SCOUT: none needed — all three features built from existing deps.

VERIFICATION STATUS: ISSUE-21, ISSUE-22, ISSUE-18 (courses/:id) await
independent verification.

---

## 2026-09-18 — loop iteration 7 (test coverage + synonyms + 18-complete + 20-path)

DONE:
- Test coverage (improvement #4): extracted pure modules —
  `searchAll` → `lib/data/search.ts`, `deriveNotifs` →
  `lib/data/notifs.ts` (minimal structural input types, no lib→app deps),
  `courseMatch` → `lib/data/catalog.ts` (domain function alongside
  conflicts/gradGroup; 4 importers updated). New suites:
  `tests/search.test.mjs` 10/10, `tests/notifs.test.mjs` 11/11 —
  deep-link routes, synonym matching, caps, ordering, saved-first
  deadline sort, window filters, conflict/profile/connection notifs.
- Advisor synonyms (improvement #5): `SCHED_ALIASES` in search.ts —
  schedule-query alias table (시험→중간·기말, 납부→등록, 휴학/복학,
  졸업/학위, 방학/계절, 성적). Rule-based expansion, honestly scoped.
- ISSUE-18 completed: `/graduation/:id` (rule detail — status,
  progress, official-source vs uncollected-rule wording, override
  editor, points-rule input guidance, contributing completed/planned
  course breakdown; rule card titles link) and `/calendar/:id` (event
  detail — title, range, collection date, official-page link,
  breadcrumb; event titles link). Schedule hits in searchAll +
  search.tsx now deep-link `calendar/<id>`; advisor course hits
  deep-link `courses/<id>`. Shared `.title-link` class added
  (globals.css) — replaces undefined `course-title`/`rule-link`
  classes so heading links inherit parent title styling.
- ISSUE-20 path confirmed: 6081 (대학·대학원) → college slugs
  (CreCon/Design/HmnArt/LibArt/SclScn/cncschool/futureplus/global)
  → college home navs directly expose 학과소개 + 졸업요건 links
  (CreCon 2772/2781/2791/2800, Design 트랙졸업요건 5108/5115/5122/5124,
  HmnArt 5596 + 예술학부 트랙별). Registry builder + 학번-column table
  parser is the remaining work — recorded in backlog.
- Gates all green; both repos synced (parity OK) + built.

IN PROGRESS: nothing.

NEXT:
1. Fresh-session verification: ISSUE-18 전 라우트, ISSUE-21/22,
   추출/동의어/테스트 변경분.
2. ISSUE-20 implementation: dept↔rules-page registry (nav 순서 쌍),
   학번-컬럼 표 파서, ruleset JSON + 엔진 연동, 미수집 unknown 유지.
3. ISSUE-10 toolchain audit bumps.

BLOCKER: unchanged — ISSUE-5 (remote D1 + deploy), ISSUE-9 (stale root
hosting.json) need human/accounts. Public deployment still predates
all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, search 10/10,
notifs 11/11, build (both repos), http-check PASS, account-db PASS,
sync --check parity OK.

REPO SCOUT: none needed — all changes built from existing deps.

VERIFICATION STATUS: ISSUE-18 (all routes), ISSUE-21, ISSUE-22, and
the search/notifs extraction + synonym layer await independent
verification.

## 2026-09-18 — loop iteration 8 (ISSUE-20 pipeline: dept rulesets + UI)

DONE:
- ISSUE-20 partially implemented — 학과별 공식 졸업요건 수집 파이프라인:
  - `lib/data/dept-rules.ts` — parseSitemapLinks / pairDeptRules
    (두 갱신 경로: 학과명 라벨 + '학과 소개' URL 첫 라벨) /
    extractRulesText (CMS `contentsEditHtml` 본문 격리, 제목-앵커
    폴백) / extractAttachment / inferDeptLabel / isMultiDeptPage /
    isRulesetAnomalous. 규정 문구는 **원문 그대로** — 수치 해석 없음.
  - `scripts/crawl-dept-rules.mts` — 7개 사이트 슬러그 사이트맵 순회,
    700ms 간격, 본문 없으면 이상감지로 제외, 전체 0건이면 기존 유지.
  - `lib/data/dept-rules.json` — 19 rulesets (sourceUrl/fetchedAt 보존):
    CreCon 4 (문콘은 hwp 첨부만), HmnArt 7, futureplus 1(multiDept),
    CSE 1(컴퓨터공학부 — 카탈로그 미연결), global 6 전원 해석.
    미수집·제외: Design 3(빈 본문), HmnArt 2(빈 본문),
    SclScn(졸업요건 링크 자체 없음) — 지어내지 않음.
  - `/api/dept-rules` 라우트 + `useDeptRules()` 훅 (스냅샷 패턴 동일).
  - 졸업 섹션 UI: "내 학과 공식 졸업요건" 카드 — data.dept→카탈로그
    해석→ruleset 매칭 시 원문 24줄+링크+수집일+첨부 안내; 수집 페이지
    전체 인덱스 `<details>` (전체 학과 공통/문서 첨부/카탈로그 미연결
    배지). "학교 공식 사정을 대체하지 않음" 문구 유지.
- tests/dept-rules.test.mjs — 23/23 (사이트맵 파싱, 쌍 연결 양 경로,
  본문 격리/폴백/빈 본문, 첨부 감지, 학과 추정, multiDept, 이상감지).
- Gates all green; both repos synced (parity OK) + built.

IN PROGRESS: nothing.

NEXT:
1. Fresh-session verification: ISSUE-18 전 라우트, ISSUE-21/22,
   추출/동의어 변경분 + ISSUE-20 파이프라인·UI 카드.
2. ISSUE-20 잔여: CSE형 학번-컬럼 표의 구조화 파싱(신뢰 가능 시에만
   엔진 연동), Design/HmnArt 빈 본문 페이지 원인(이미지?) 확인,
   SclScn 등 미수집 사이트 졸업규정 위치 탐색, multiDept 페이지의
   학과별 분할.
3. ISSUE-10 toolchain audit bumps.

BLOCKER: unchanged — ISSUE-5 (remote D1 + deploy), ISSUE-9 (stale root
hosting.json) need human/accounts. Public deployment still predates
all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, search 10/10,
notifs 11/11, dept-rules 23/23, build (both repos), http-check PASS,
account-db PASS, sync --check parity OK.

REPO SCOUT: none needed — all changes built from existing deps.

VERIFICATION STATUS: ISSUE-18 (all routes), ISSUE-21, ISSUE-22,
search/notifs extraction + synonym layer, and the ISSUE-20 dept-rules
pipeline (parser, crawler, snapshot, API, UI card) await independent
verification.
  
