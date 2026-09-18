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

## 2026-09-18 — loop iteration 9 (ISSUE-20 yearTable parser + table UI)

DONE:
- Verified pending items by code review (dept-rules module, UI card,
  crawler) — consistent with gates; full matrix re-run.
- ISSUE-20 yearTable parser implemented:
  - `parseYearLabel` — '~ 15학번'→{to:2015}, '16학번'→{2016},
    '17학번 ~23학번'→{2017–2023}, '24학번 ~'→{from:2024}; 학번 없으면 {}.
  - `parseYearTable` — CMS 본문 컨테이너 내 <table> 탐색, 헤더 행의
    학번 셀 위치로 라벨/연도 컬럼 분리, 셀은 **원문 보존**,
    셀 수 불일치(colspan) 행 건너뜀, 유효 행 없으면 null.
  - `yearColumnIndex` — 입학연도→해당 컬럼 (엔진 연동 준비물).
  - `DeptRuleset.yearTable` 필드 추가, 크롤러 연결 (+학번표 로그).
  - 실제 CSE/1564 검증: 4컬럼(~15/16/17~23/24~)×5행(총학점·캡스톤·
    트랙수·GitHub·산학협력) 정확 파싱 — 공식 표와 일치 확인.
- UI: 학과 규정 카드에 yearTable 있으면 실제 <table> 렌더링 +
  표 셀/라벨과 동일한 라인은 중복 제외한 나머지 안내만 표시
  (표 외 프로즈 보존).
- tests: dept-rules 40/40 (parseYearLabel 5, parseYearTable 8,
  yearColumnIndex 4 추가).
- Gates all green; both repos synced (parity OK) + built.

IN PROGRESS: nothing.

NEXT:
1. Fresh-session verification: ISSUE-18, 21, 22, ISSUE-20 파이프라인
   전체(파서·크롤러·스냅샷·API·UI 카드·yearTable).
2. ISSUE-20 잔여: 컴퓨터공학부↔카탈로그 학과 매칭 확인(개편 여부,
   공식 근거 필요 — 추정 연결 금지), Design/HmnArt 빈 본문 원인,
   SclScn 규정 위치, multiDept 분할, yearTable→엔진 연동(해석된
   학과 + 신뢰된 매핑 있을 때만).
3. ISSUE-10 toolchain audit bumps.

BLOCKER: unchanged — ISSUE-5 (remote D1 + deploy), ISSUE-9 (stale root
hosting.json) need human/accounts. Public deployment still predates
all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, search 10/10,
notifs 11/11, dept-rules 40/40, build (both repos), http-check PASS,
account-db PASS, sync --check parity OK.

REPO SCOUT: none needed — all changes built from existing deps.

VERIFICATION STATUS: ISSUE-18 (all routes), ISSUE-21, ISSUE-22,
search/notifs extraction + synonym layer, ISSUE-20 dept-rules pipeline
(parser·crawler·snapshot·API·UI card·yearTable parser) await
independent verification.
  
## 2026-09-18 — loop iteration 10 (Devin/Paseo session)

DONE:
- ISSUE-23 implemented — COSMOS LMS 수업 현황 연동 (돋부기 hs-shell/dotbugi
  참조). 서버가 COSMOS 세션에 접근 불가 → 사용자 브라우저 안에서 수집하는
  구조 채택 (외부 전송·로그인 자동화 없음).
- `public/lms-collect.js` — 브라우저 수집 스크립트, `/lms-collect.js`
  정적 제공. dotbugi 셀렉터 계약 기반: `.my-course-lists` 과목 목록,
  `mod/assign/index.php`(generaltable), `mod/quiz/index.php` +
  `quizattemptsummary` 제출 판정, `report/ubcompletion/user_progress[_a].php`
  출석부(thead 동적 컬럼 + rowspan 평탄화 + 일괄출석인정),
  `course/view.php` VOD 링크/수강기간. `Promise.allSettled` 부분 실패
  보존 + `errors` 필드. 출력 `lms-data.json` 다운로드.
- `lib/data/lms.ts` — LmsSnapshot 타입 + validateLms(엄격 형식 검증),
  courseProgress, pendingTasks, dueSoon(range 끝날짜 파싱).
- `app/sections/lms.tsx` + '수업 현황' 사이드바 메뉴 — 3단계 수집 안내,
  스크립트 복사 버튼/파일 링크, JSON 업로드(검증), 과목별 카드(강의
  진행률 + 미완료 목록 + COSMOS 딥링크 + 부분 수집 고지), 7일 마감
  임박, 데이터 삭제.
- `Data.lms` 필드 + demo shape-check + account profile API에
  `validateLms` 검증 + body 한도 30KB→200KB(스냅샷 크기 대응).
- `deriveNotifs` — LMS 마감 ≤7일 미완료 알림(cat '수업', 최대 5건,
  D-day 라벨).
- `tests/lms.test.mjs` 21/21.
- Gates all green; both repos synced (parity OK) + built.

IN PROGRESS: nothing.

NEXT:
1. Fresh-session verification: ISSUE-23 전체(수집 스크립트·검증·UI·
   알림·API 한도) + 이전 needs-verification 잔여(ISSUE-18, 21, 22,
   ISSUE-20 파이프라인).
2. ISSUE-23 후속 후보: 북마클릿 형태, stale 경고, 시청시간(%) 표시,
   캘린더 병합, advisor 검색에 LMS 과목 포함. 실제 COSMOS 계정으로
   수집 스크립트 실동작 확인(needs-human — 로그인 필요).
3. ISSUE-20 잔여(카탈로그 매칭·빈 본문·엔진 연동) + ISSUE-10.

BLOCKER: unchanged — ISSUE-5 (remote D1 + deploy), ISSUE-9 need
human/accounts. COSMOS 실계정 수집 검증도 사용자 로그인 필요.

TESTS: tsc clean, oxlint 0 err, lms 21/21, catalog 4/4, school 5/5,
notifs 11/11, search 10/10, dept-rules 40/40, build (both repos),
http-check PASS, account-db PASS, sync --check parity OK.

REPO SCOUT: none needed — 브라우저 표준 API만 사용(외부 의존성 없음).

VERIFICATION STATUS: ISSUE-23 (collect script·validateLms·section UI·
notifs 통합·profile API 검증/한도) awaits independent verification;
prior items (ISSUE-18, 21, 22, ISSUE-20) still pending.


---

## 2026-09-18 — deploy + GitHub consolidation (user-directed session)

DONE:
- GitHub push 완료: gyeongbin-38/hansung-helper (main source, master),
  gyeongbin-38/hansung-helper-deploy (deploy snapshot, master).
- Deploy repo git history에서 scripts/cloudflared.exe (52MB) 제거 —
  filter-branch 20 commits 재작성 + force push (GH001 경고 해소).
- GitHub 정리: 빈 repo gyeongbin-38/- 삭제 (size 0, 커밋 없음),
  hansung-helper → PUBLIC 전환 (팀원 collaborator 불필요),
  hansung-helper-deploy private 유지.
- Cloudflare 프로덕션 배포 ✅ (BE-6 완료): wrangler OAuth 로그인
  (gyeongbinb38@gmail.com, account 49fee188…), 원격 D1 site-creator-d1
  생성 (27aa326b-5433-4bcb-bc38-1b63bd66f67b, APAC), workers.dev
  서브도메인 gyeongbin-38 등록, 워커 hansung-helper 배포 →
  https://hansung-helper.gyeongbin-38.workers.dev (버전 02bc60c9).
- 원격 D1 마이그레이션 적용 (3 테이블).
- scripts/_deploy.py — 재배포 헬퍼: 생성 wrangler.json의 placeholder
  DB ID + 워커명을 실값으로 패치 후 wrangler deploy (매 빌드 후 필수).
- scripts/_verify_prod.py — 라이브 검증: /, /lms-collect.js,
  /api/courses|schedule|dept-rules|activities, favicon 전부 200.
- docs 갱신: team-tasks 공유 주소→프로덕션 URL + B-6 완료 표기,
  backend-tasks BE-6 완료 섹션, AGENTS.md 프로덕션 섹션, BACKLOG
  ISSUE-24 진행 기록.

IN PROGRESS: nothing.

NEXT:
1. 원격 실계정 회원가입→프로필 저장→재로그인 수동 확인 (needs-human).
2. COSMOS 실계정 수집 스크립트 실동작 확인 (G-1, needs-human).
3. Fresh-session verification: ISSUE-23 전체 + 잔여 (18, 21, 22, 20).
4. ISSUE-24 BE-1 서버 측 COSMOS 수집 (팀원 핸드오프 진행 상황 추적).

BLOCKER: 해소됨 — ISSUE-5/9 (remote D1 + deploy 권한) 완료. 잔여
needs-human: 실계정 프로덕션 한 바퀴 + COSMOS 수집 실동작.

TESTS: 배포 후 라이브 검증 PASS (_verify_prod.py 전체 200).
빌드: published-personal npm run build green (lms-collect.js 포함).

REPO SCOUT: none.

VERIFICATION STATUS: 프로덕션 배포 + 원격 D1 마이그레이션은 라이브
검증됨. 실계정 end-to-end (가입→저장→재로그인) + COSMOS 수집은
사람 확인 대기. 이전 needs-verification 항목들 계류 중.


---

## 2026-09-18 — BE-1 서버 측 COSMOS 수집 구현 (user-requested)

DONE:
- 사용자 확인: COSMOS 연결은 이미 connectSchool에 존재(로그인 시
  포털+LMS 세션 + 과목 목록 파싱) — BE-1 본격 구현.
- `lib/server/lms.ts` 신규 — Workers DOM 없이 정규식으로 dotbugi
  셀렉터 계약 포팅: parseAssigns/parseQuizList(generaltable c0~c3),
  hasQuizAttempt(quizattemptsummary), parseProgress(thead 동적 컬럼
  + 출석인정 요구시간 컬럼 제외 + rowspan/colspan 평탄화 + 일괄출석
  인정), parseVodRanges(modtype_vod li·dimmed 제외·accesshide 제거),
  collectLms(과목 순차 + 24s 예산 + allSettled 부분 실패 errors[]).
  normDate는 년월일/年月日 양식 모두 지원(collector 확장).
- `school.ts`: SchoolSnapshot.lmsData?: LmsSnapshot + connectSchool이
  LMS 연결 성공 시 collectLms 호출(실패해도 로그인 유지).
- `page.tsx`: accountData() — profile과 snapshot.lmsData 병합,
  최신 fetchedAt 승자 (수동 가져오기가 최신이면 유지).
- `scripts/cosmos-live.mts` — 실계정 연결 검증 도구(학번/비번
  프롬프트 → connectSchool 실행 → 과목/수집 요약 + lms-data.json
  저장; gitignore 처리됨).
- `scripts/_run_tests.py` — 전체 테스트 매트릭스 러너.
- 재배포: hansung-helper f4c193ce 라이브 (verify_prod 전체 200).

IN PROGRESS: nothing.

NEXT:
1. 실계정 end-to-end: cosmos-live.mts로 실제 학번 검증(needs-human —
  자격증명). 셀렉터 불일치 발견 시 파서 보정.
2. 프로덕션 실계정 한 바퀴(가입→저장→재로그인→수업 현황 자동 채움).
3. needs-verification: ISSUE-23 + BE-1 + 잔여(18, 21, 22, 20).
4. 로그인 지연 관찰 — 수집 예산 24s가 UX에 주는 영향 검토(과목 많을
  때 ~15-25s). 필요하면 ctx.waitUntil 비동기 수집 설계(BE-2와 연계).

BLOCKER: 실계정 검증만 남음 — credentials는 사용자만 보유.

TESTS: lms-server 35/35, 전체 매트릭스 11파일 OK(_run_tests.py),
tsc clean, oxlint 0 err, root+deploy build green, prod verify PASS.

REPO SCOUT: none.

VERIFICATION STATUS: BE-1 파서는 fixture 테스트로 검증됐으나 실제
COSMOS 페이지 대비 검증 미완 — 실계정 확인 전까지 needs-verification.


---

## 2026-09-18 — 로그인 지연 비동기화 + 브랜드/로딩/PWA 개선 (user-requested)

DONE:
- 로그인 지연 해소(BE-2 선행): `connectSchool`에 `deferLms` 옵션 추가 —
  포털+LMS 인증까지만 동기로 끝내고 상세 수집은 클로저로 이관.
  `login/route.ts`가 `cloudflare:workers` `waitUntil`로 수집 후
  `json_patch`로 `snapshot.lmsData` 병합 — `checkedAt` 가드로 지연
  쓰기가 새 로그인 스냅샷을 덮지 않게 방지. 기존 호출자는 동기 수집 유지.
  `page.tsx`는 `lms==='connected' && !data.lms`일 때 `/api/account`를
  6s 후 8s 간격 ×8회 폴링, 최신 `fetchedAt`만 반영. `lms.tsx`에
  `serverCollecting` "서버에서 수집 중입니다…" 상태.
- 스켈레톤 로딩: `app/sections/skeleton.tsx` 신규(SkeletonCards/
  SkeletonRows/SkeletonDetail, `<output>` status role + sr-only +
  reduced-motion 대응) + globals.css `.sk-*` 프리미티브. 적용:
  courses 목록/상세, activities, calendar 목록/상세, timetable 과목
  목록 — 텍스트 "불러오는 중" 대체, 실패·빈 상태는 유지.
- 브랜드 로고 "학사모×나침반": public/logo.svg(그라디언트 타일),
  favicon.svg 교체(템플릿 파란 아이콘 제거), logo-mark.svg,
  `app/logo.tsx`(`currentColor` 공용 컴포넌트) — 사이드바·로그인
  3곳의 Lucide GraduationCap 대체.
- PWA/OG: manifest.webmanifest(standalone, theme #5645d4, 192/512/
  maskable 아이콘), apple-touch-icon.png 180, og.png 1200×630(네이비
  배경+로고타일+한글 타이포, `scripts/_gen_brand_assets.mjs`로 생성 —
  sharp는 --no-save 로컬 전용). layout.tsx: metadataBase, icons.apple,
  manifest, appleWebApp, openGraph + `export const viewport`로
  theme-color. wrangler dev 실서빙에서 태그 출력 확인(OG/트위터 카드
  자동 채움 포함).
- 프린트: globals.css `@media print` — 사이드바/상단바/과목 목록/추천
  패널/버튼류 숨기고 시간표 그리드만 출력, 블록 색상은
  print-color-adjust로 보존.
- ISSUE-23 후속 2건: `staleDays(snap, now)` + 수집 7일 경과 시
  `.lms-stale` 배너(다시 가져오기 버튼). advisor 자유질문
  `searchAll`에 LMS 수강 과목 포함(5번째 인자, 합산 cap 10, route
  'lms', 'COSMOS 수업 현황 · 수강 중' 부제) + 근거 문구에 COSMOS 표기.
- ISSUE-21/22 구현 리뷰: 코드가 Done 스펙과 일치함 확인(테스트 커버
  존재) — 독립 검증 라벨은 별 세션 필요로 유지.
- `published-personal` 동기화 + 독립 빌드 green + 사용자 승인 후
  `_deploy.py` 재배포 — hansung-helper version 567e6236 라이브,
  신규 에셋 15개 업로드(로고/favicon/manifest/icons/og.png).
  `_verify_prod.py` 전체 200 + 라이브 HTML에 OG/theme-color/manifest/
  apple-touch 태그 출력 확인.

IN PROGRESS: nothing.

NEXT:
1. 실계정 end-to-end: cosmos-live.mts 실학번 검증 + 프로덕션
   가입→재로그인→waitUntil 수집 도착 관찰(needs-human).
2. 잔여: ISSUE-20 yearTable→졸업엔진 연동, ISSUE-6 ruleset 선택+
   in-progress, BE-3 공개 스냅샷 D1 이관, 알림 패널/토스트 큐 등
   디자인 스펙 §13 항목.

BLOCKER: 실계정 검증(credentials)은 사용자 영역.

TESTS: 전체 매트릭스 11파일 OK(_run_tests.py — school deferLms 테스트
포함 6/6, search 14/14, lms 25/25), tsc clean, oxlint 0 err,
root+published-personal build green, 로컬 dev 실서빙 메타태그 확인.

REPO SCOUT: none.

VERIFICATION STATUS: deferLms는 mocked fetch 테스트로 검증 —
waitUntil 실동작은 프로덕션/실계정에서 미검증. 스켈레톤·PWA·프린트는
빌드+실서빙 확인. ISSUE-21/22는 구현 리뷰+기존 테스트 확인 수준 —
independent verification 라벨은 fresh session 필요.

---

## 2026-09-19 — 실계정 프로덕션 검증 + 병렬 수집 버그 수정 (user-requested)

DONE:
- 실계정(학번 25•••37) end-to-end 검증 완료 — 로컬 Node connectSchool
  18s 수집 성공(vod 45/55, 과제 7, 퀴즈 4), 프로덕션 waitUntil 경로
  lmsData 도착 확인(응답 5.1s → 수집 완료 ~31s, 폴링으로 승격).
- 프로덕션 수집 0건 버그 수정: 같은 Moodle 세션으로의 병렬 요청
  (Promise.allSettled ×4/과목)이 리다이렉트/빈 페이지를 유발 —
  PHP 세션 락 직렬화 특성. `collectLms`를 과목 내 완전 직렬화로 변경
  + 퀴즈 상세도 직렬. 재배포 후 vod 55·과제 7·퀴즈 4로 로컬과 정확히
  일치(errors 전부 비어있음).
- `collectLms` `html()` 헬퍼가 응답을 검증: 비-200이거나
  /login/logout.php 마커 없으면 [lms] fetch 로그+throw → 세션 만료/
  리다이렉트를 빈 결과로 삼키지 않고 errors[]로 표면화. fetchVods는
  모든 URL 요청 실패 시 throw(=vod 오류), 표 없는 정상 페이지는
  빈 결과 유지로 구분.
- COLLECT_BUDGET_MS 24000→60000 (직렬화로 수집 시간 증가 대응 —
  waitUntil 내라 응답 지연과 무관).
- 임시 [lms] 로깅 정리: 로그인 성공 경로 로그 제거, 실패 진단만 유지
  (connect failed + fetch 비정상 — 상태/호스트만, 개인정보 없음).
- tests/lms-server.test.mjs +4: fixture에 logout 마커 추가, 세션 만료
  →errors 표면화, 표 없음→정상 빈 결과 회귀 커버 (40/40).
- 원격 D1 조회 헬퍼 scripts/_d1q.mjs — wrangler 직접 spawn으로
  Windows 인용 문제 우회(쿼리 결과 JSON 반환).
- 재배포: version 27d739a4 라이브.

IN PROGRESS: nothing.

NEXT:
1. 잔여: ISSUE-20 yearTable→졸업엔진 연동, ISSUE-6 ruleset 선택+
   in-progress, BE-3 공개 스냅샷 D1 이관, 알림 패널/토스트 큐 등
   디자인 스펙 §13 항목.
2. 다른 계정에서도 동일 수집 경로가 동작하는지 관찰(추가 실계정 발생 시).

BLOCKER: none — 실계정 검증 완료.

TESTS: tsc clean, oxlint 0 err, school 6/6, lms-server 40/40,
root+published-personal build green, 프로덕션 실계정 e2e PASS
(45/55 vod = 로컬과 동일).

REPO SCOUT: none.

VERIFICATION STATUS: waitUntil 비동기 수집 + 직렬화 수집이 프로덕션
실계정에서 검증됨. ISSUE-21/22는 여전히 fresh-session 독립 검증 필요.
