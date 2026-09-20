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

---

## 2026-09-19 — LMS 실데이터 활용 + 알림 패널 (user-requested 자율)

DONE:
- 홈 "이번 주 수업" 위젯(home.tsx): `dueSoon(data.lms, now, 7)` 상위 4건을
  D-day 칩 + COSMOS 딥링크로 표시. 마감 없으면 미완료 건수 안내,
  `pendingTasks` 0이면 섹션 미렌더. 하단 "학습 일정" 카드도 LMS 데이터
  유무 분기로 갱신(미수집 안내문 제거).
- 캘린더 "수업 마감" 병합(calendar.tsx): `dueSoon(lms, now, 14)` 최대
  8건을 공식 일정 아래 수업 카테고리로 표시 — COSMOS 수집일·과목·kind
  병기, data.lms 없으면 미렌더.
- 알림 슬라이드오버(spec §8): 벨 클릭이 페이지 이동 대신 우측
  `<dialog>` 패널 — 분류 칩 필터(aria-pressed), 읽지 않음 카운트,
  모두 읽음, 항목 이동 시 패널 닫힘, Esc/스크림 닫기, 전체 알림함 링크.
  Topbar에 `onBell` prop 추가, page.tsx가 notifItems를 한 번만 도출해
  배지·패널이 공유. `.notif-panel` CSS — `<dialog>` UA 스타일 리셋 +
  축소 애니메이션(reduced-motion 대응).
- `NotifRow`로 알림 행 마크업 공용화(알림함 페이지·패널 동일 사용).
- 재배포: version d5f85822 라이브.

IN PROGRESS: nothing.

NEXT:
1. 잔여: ISSUE-20 yearTable→졸업엔진, ISSUE-6, BE-3 D1 이관,
   토스트 큐, 수강 과목→시간표 연동, 에러 재시도 표준화 등
   (사용자 리스트업 문서의 A/B/C/D 항목).
2. needs-verification 큐는 fresh-session 독립 검증 필요.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, 전체 매트릭스 11파일 OK
(lms-server 40/40, search 14/14, notifs 11/11), root+deploy 빌드 green.

REPO SCOUT: none.

VERIFICATION STATUS: 신규 UI 3건은 빌드+타입+린트 수준 — 실기기
시각 확인은 미수행. 기존 검증 라벨 상태 불변.

---

## 2026-09-19 — 에러 재시도 표준화 + 토스트 큐 + 주차별 진도 (user-requested 자율)

DONE:
- C15 API 실패 재시도 표준화(spec §13): catalog.ts 4개 훅
  (useCatalog/useActivities/useSchedule/useDeptRules)에 retry() 추가 —
  실패 시 모듈 캐시는 loader가 비우므로 재호출=실제 재요청, tick 상태로
  effect 재실행, unmount 가드 유지. skeleton.tsx에 공용 `RetryButton`
  ("다시 시도" link 버튼) 추가. 배선: courses(상세+헤드), timetable
  (헤드+목록), activities(empty-small에 hsportal 링크와 병기),
  calendar(목록+상세 2곳). advisor 텍스트 답변·graduation의 deptRules
  은닉(graceful)은 표시 대상 아님 — 현행 유지.
- C14 토스트 큐(spec §8): chrome.tsx에 `useToasts` 훅 + `ToastStack`
  컴포넌트. 동일 문구 푸시는 병합(×N 배지, 타이머 재시작 — v 버전 키로
  타이머 교체), 동시 표시 최근 3개(slice -TOAST_MAX), 항목별 5초 자동
  닫힘+개별 닫기. `.toast`를 `.toast-stack` 고정 컨테이너의 플렉스
  아이템으로 변경, 모바일·print 규칙 동기화. push(msg) 시그니처라
  기존 notify=setToast 호출처 무변경.
- A4 LMS 주차별 vod 진도(lms.tsx): lib/data/lms.ts에 `weekProgress(c)`
  추가 — vod.week 그룹화(미기재 항목 제외, 주차를 지어내지 않음),
  주차 오름차순, done/total + 첫 항목 range. 과목 카드 details 안에
  `.lms-weeks` 그리드 — 주차·분수·미니 progress-track·기간 축약
  (MM-DD ~ MM-DD), 완료 주차는 mint 틴트. week 없는 과목은 미렌더.
- 재배포: version 097ac9ad 라이브, _verify_prod 전 엔드포인트 200.

IN PROGRESS: nothing.

NEXT:
1. 잔여: ISSUE-20 yearTable→졸업엔진, ISSUE-6, BE-3 D1 이관,
   수강 과목→시간표 연동(A3), LMS 부분수집 재시도 UX, 사이드바 축약,
   설정 화면/접근성 항목 등.
2. needs-verification 큐는 fresh-session 독립 검증 필요.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, 전체 매트릭스 11파일 OK
(lms 31/31 — weekProgress +6건), root+deploy 빌드 green.

REPO SCOUT: none.

VERIFICATION STATUS: 신규 UI 3건은 빌드+타입+린트+단위테스트 수준 —
실기기 시각 확인 미수행. 기존 검증 라벨 상태 불변.

---

## 2026-09-19 — 스케일 감사 + BE-3 공개 스냅샷 D1 이관 (user-requested, 1000+ 사용자 전제)

DONE:
- 계정 인프라 보안/스케일 감사 — 코드 리뷰로 확인된 기존 방어:
  `__Host-` 쿠키(Secure/HttpOnly/SameSite=Lax), 세션 토큰 SHA-256 해시
  저장·24h 만료·로그아웃 시 서버 삭제, 모든 변경 요청에
  Origin+JSON content-type CSRF 검사, 로그인 레이트리밋 이중화
  (IP 20회·계정 3회/15분, 해시 키), 모든 계정 응답 no-store/private
  +Vary:Cookie, 프로필 PUT 200KB 캡+필드별 엄격 검증, 비밀번호
  미저장·사용 후 즉시 폐기, 학번 해시+마스킹. 공개 API 4종에
  max-age=300 캐시 헤더 이미 존재. 수정 필요 사항 없음 판정.
- BE-3 구현 — 공개 스냅샷(courses/activities/schedule/dept-rules)을
  D1 `public_snapshots(kind,part,payload,fetched_at,updated_at)`로 이관:
  - `lib/server/snapshots.ts` `snapshotGet(kind, bundled, bundledAt)` —
    D1 행이 번들보다 새롭거나 같으면 D1 페이로드를 원문 서빙, 아니면
    번들 JSON 폴백. D1 미바인딩/오류/깨진 페이로드도 번들 폴백.
    아이솔레이트 내 60초 캐시로 D1 읽기 최소화.
  - D1 문장 크기 제한(SQLITE_TOOBIG, 213KB 단일 INSERT 실패) 대응:
    페이로드를 60K자 part 청크로 분할 저장, 읽기 시 ORDER BY part로
    재조립. gzip 대비 SQL로 내용 직접 조회 가능한 장점.
  - `scripts/_publish_snapshots.mjs` — 4개 JSON 형식 검증(필수 키) 후
    DROP/CREATE + DELETE+INSERT를 `--file`로 remote D1에 게시.
    **크롤러→게시만으로 재배포 없이 데이터 갱신** 경로 확보.
  - 4개 라우트를 snapshotGet 호출로 전환, 헤더 동일(max-age=300).
  - drizzle/0001_public_snapshots.sql 스키마 기록(게시 스크립트가
    DROP/CREATE하므로 수동 적용 불필요), AGENTS.md 운영 문서 갱신.
- 재배포: version 627c5e1a 라이브. remote D1에 courses 4part 등
  7행 게시 확인(_d1q.mjs), _verify_prod 전 엔드포인트 200 —
  응답 바이트가 파일 원본과 일치(번들은 compact 재직렬화라 약간 작았음).

IN PROGRESS: nothing.

NEXT:
1. 잔여: ISSUE-20 yearTable→졸업엔진, ISSUE-6, A3 수강 과목→시간표
   연동, LMS 부분수집 재시도 UX, 사이드바 축약, 설정 화면/접근성.
2. 스냅샷 자동 갱신(크론)은 Worker→학교 도달성 검증이 선행 필요 —
   hsportal/hansung.ac.kr이 CF IP를 허용하는지 미확인.
3. needs-verification 큐는 fresh-session 독립 검증 필요.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err(44파일), root+deploy 빌드 green,
_verify_prod 200 전체, remote D1 게시·조회 실측 확인.

REPO SCOUT: none.

VERIFICATION STATUS: D1 경로는 행 존재+fetched_at 비교 로직+응답
바이트 일치로 확인(페이로드 동일 시 경로 구분 불가 — 코드 경로상
D1 우선 확실). 실사용 트래픽 하의 캐시 동작은 미관측.

---

## 2026-09-19 — A3 COSMOS 수강 과목 → 시간표 연동 (user-requested)

DONE:
- `lib/data/lms.ts` `matchEnrollment(lms, catalog)` + `EnrolledMatch`
  타입 추가. normTitle 정규화(괄호/대괄호 장식·학기 라벨·공백 제거,
  소문자)로 카탈로그 과목명 인덱스 구성 — fuzzy/추정 매칭 없이
  결정론적, 동명 과목은 분반 전체를 sections[]로 반환(임의 분반
  배정 안 함), 매칭 없으면 빈 배열(미매칭 유지, 지어내지 않음).
- `app/sections/timetable.tsx` `EnrolledStrip` — builder 헤드 아래
  `<details>` 스트립. 요약 "COSMOS 수강 N과목 · 시간표 반영 M개",
  과목별 상태: 매칭 없음(카탈로그에 없는 과목) / 이미 계획에 있음
  (badge green) / 미반영("분반 N개 보기" → 카탈로그 정식명으로
  setQ 필터). 수집 시점 스냅샷임을 명시하는 meta 문구 포함.
- `learning.css` `.enrolled*` 스타일 추가.
- tests/lms.test.mjs +4 (35/35): 정확 매칭·장식 제거·미매칭 빈 배열·
  전 과목 반환 순서.
- 재배포: version 7a77b266 라이브, _verify_prod 전 엔드포인트 200.

IN PROGRESS: nothing.

NEXT:
1. 잔여: ISSUE-20 yearTable→졸업엔진, ISSUE-6, LMS 부분수집 재시도
   UX, 사이드바 축약, 설정 화면/접근성 항목 등.
2. 스냅샷 자동 갱신(크론)은 Worker→학교 도달성 검증 선행 필요.
3. needs-verification 큐는 fresh-session 독립 검증 필요.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, 전체 매트릭스 11파일 OK
(lms 38/38 — matchEnrollment +7건), root+deploy 빌드 green,
_verify_prod 200 전체.

REPO SCOUT: none.

VERIFICATION STATUS: 실계정 Playwright e2e로 확인 완료 —
스트립 렌더(7과목), 알고리즘 7·선형대수 1·머신러닝 4분반 매칭,
"분반 보기" 클릭 시 검색어=카탈로그 정식명·학과 필터=전체로
초기화되어 분반 목록 표시. 미매칭 4과목은 "카탈로그에 없는
과목"으로 정직 표시(인류문명과지구환경·데이터통신·빅데이터기초·
커뮤니티 — 2026-2 카탈로그에 해당 명칭 없음).

POST-DEPLOY FIXES (같은 날 후속):
- 배포 누락 발견·수정: `_deploy.py`는 빌드 없이 기존 dist를
  배포함 — `_build_pub.py` 미실행으로 A3 코드 없는 번들이
  라이브됐다가 재빌드·재배포로 수정. **교훈: 배포 전
  _build_pub.py 필수 — dist/client 번들에 신규 문자열 grep으로
  확인 습관화.**
- 실데이터로 매칭 로직 수정: 실제 Moodle fullname 형식은
  "교과(오프라인) 학부 과목명[분반] 교수명" — 초기 exact-match는
  전부 미매칭. `lmsKey`가 카테고리 토큰(교과/비교과/커뮤니티/
  학부/대학원/대학/전공/교양, 공백 구분, JS `\b`는 한글에
  무효라 공백 경계 사용)·분반 괄호를 제거하고, 카탈로그
  과목명의 접두어 매칭(최장 이름 우선 — 자료구조및실습 vs
  자료구조 모호 해소)으로 전환.
- "분반 보기" 콜백이 학과 필터를 '전체'로 재설정 — 기본값
  "내 학과 위주"가 목록을 실제 제한하므로 타 학과 분반이
  가려지는 문제 방지.
- 관찰: 짧은 간격 반복 로그인 시 "코스모스 조회 실패" 발생 —
  Moodle 측 연결 실패로 추정, 실패 상태 UI·재로그인 안내는
  정상 동작 확인.

---

## 2026-09-19 — LMS 수집 상태·실패 복구·갱신 반영 (user-audited priority)

DONE:
- **수집 상태 마커**: `SchoolSnapshot`에 `lmsPending`(지연 수집 진행)/
  `lmsFailedAt`(실패 시각) 추가. 로그인·재수집 라우트가 저장 직전
  `lmsPending=true` 설정 → 지연 수집 성공 시 `json_patch`로
  `lmsData` 기록+`lmsPending:null` 해제, 실패 시 `lmsFailedAt` 기록
  + 실패 로그. `checkedAt` 가드 유지 — 이전 waitUntil 쓰기가 새
  스냅샷을 덮지 않음. 비지연 경로(connectSchool 동기 수집) 실패도
  `lmsFailedAt` 기록.
- **무한 "수집 중" 수정**: 이전엔 지연 수집 실패를 아무것도 기록하지
  않아 `lms='connected'`+lmsData 없음이 영구 지속됐음. 이제 실패
  마커로 종료 상태 표현 — 클라이언트 폴링은 `lmsPending` 기준으로
  시작하고 성공·실패 모두에서 종료. 마커 도입 전 스냅샷(connected인데
  lmsData·pending 없음)도 실패로 분류. 수집 예산+5분 초과 pending은
  워커 중도 종료로 간주해 세션 내에서도 실패 전환(타이머 상태).
- **갱신 반영 수정**: 폴링이 `!data.lms` 조건이라 기존 데이터가 있으면
  새 수집 결과를 못 받던 문제 — `snapshot.lmsData`를 항상 최신
  fetchedAt 기준으로 `data.lms`에 병합하는 별도 이펙트로 분리.
  로그인 응답·지연 완료·재수집 결과 모두 같은 경로로 반영.
- **재수집 경로(BE-2 1차)**: `POST /api/account/lms-refresh` — 세션
  인증 후 입력 학번 해시가 계정 id와 일치해야 함(타인 계정 불가),
  `refresh:` 3회/15분 레이트리밋, `connectSchool` 재실행으로 서버
  수집. 비밀번호는 검증 후 즉시 폐기·미저장. 새 수집 실패 시 이전
  lmsData 보존(로그인 라우트도 동일). UI `RefreshForm` — 수업 현황
  섹션에서 학번+비밀번호 재입력으로 재수집, 마스킹 학번 힌트 표시.
- **퀴즈 미응시 오인 수정**: 상세 페이지 fetch 실패가 `submitted:false`
  로 단정되던 것 → `uncertain:true`+`errors:['quiz-check']`로 표현.
  `LmsTask`/`LmsPending`에 `uncertain` 필드, `pendingTasks` 전달,
  `validateLms` 보존, UI "응시 여부 확인 실패" 라벨. 브라우저 수집기
  (public/lms-collect.js)도 동일 의미로 수정.
- **`dueSoon` 과거 하한**: 기존 상한만 있어 오래 지난 미완료가 최신
  마감을 밀어냈음 → `pastDays=7` 하한 추가(마감 지남 표시는 유지하되
  7일 이상 지난 항목 제외). 홈·캘린더·알림 도출 모두 동일 적용.
- **UI 상태 구분**: 수업 현황 빈 상태가 수집 중/수집 실패/COSMOS 연결
  실패를 구분해 표시, snap 있으면 배너로 표현. "다시 가져오기" 버튼이
  실은 파일 업로드였던 것 → "파일로 가져오기"로 정정 + 서버 재수집은
  별도 RefreshForm. `c.errors` 코드 한글 라벨화(vod→강의 등). 사이드바
  (chrome.tsx)·설정(settings.tsx) 연결 상태가 pending/failed/데이터
  유무를 구분 표시 — settings 초록 배지는 lmsData 있고 실패 없을 때만.
- 문서 정합: backend-tasks.md의 BE-1(검증 완료 표기)·BE-2(재인증 방식
  구현)·BE-3(완료) 갱신, 아키텍처 사실의 LMS 수집·공개 스냅샷 설명을
  현재 구현(D1 우선+폴백, 서버 수집+마커)으로 정정. BACKLOG.md
  ISSUE-24 진행 상황 갱신.

IN PROGRESS: nothing.

NEXT:
1. npm audit high 10·low 1 — react-server-dom-webpack이 직접 의존성,
   GHSA-wx67-qw84-cm4g 범위라 배포 경로 영향 확인 후 호환 패치.
2. EnrolledStrip에서 매칭 분반을 바로 계획에 담는 액션(현재는 필터만).
3. 졸업: 신뢰할 학과↔ruleset 매핑 먼저, 검증된 학과부터 엔진 연결.
   yearTable은 19개 중 1개뿐(dept null이라 현재 매칭 제외) — 전 학과
   확대 금지, 확인 필요 유지.
4. LMS 과제·퀴즈·마감 검색(advisor), 알림 예약.
5. 수집 실패율 관측(현재 console.log만), 스냅샷 크론(Worker→학교
   도달성 검증 선행).

BLOCKER: none.

TESTS: 전체 매트릭스 11파일 OK — lms.test 46/46(+8: dueSoon 과거
하한·uncertain 전달), lms-server.test 47/47(+7: 퀴즈 상세 실패→
uncertain/quiz-check, 목록 실패→quiz). tsc clean, oxlint 0 err,
root+deploy 빌드 green.

REPO SCOUT: none.

VERIFICATION STATUS: 단위 테스트로 마커·uncertain·dueSoon 하한 확인.
실계정 e2e로 재수집 폼·실패 상태 렌더는 미검증(배포는 됨 —
실패 상태는 실제 장애 시에만 자연 발생). 라이브 version e645c64f,
_verify_prod 전 엔드포인트 200.

---

## 2026-09-19 — 취약점 감사·패치 (ISSUE-10, user-audited priority 2)

DONE:
- `npm audit` 재실행: high 10·low 1 확인(이전 기록 "전부 빌드 도구"
  은 부정확 — `react-server-dom-webpack`은 직접 의존성+배포 번들
  포함이라 배포 경로 해당. GHSA-wx67-qw84-cm4g Server Functions
  DoS; 앱에 'use server'는 없음).
- 경로별 영향 분류: 배포 경로 = react-server-dom-webpack만.
  dev/build 경로 = vite(dev server), esbuild(dev on Windows),
  miniflare+undici+ws+sharp(로컬 에뮬레이션), image-size(vinext
  빌드 파싱), wrangler(배포 도구).
- 수동 호환 범프(audit fix --force 아님, peer 제약 추적):
  react/react-dom/react-server-dom-webpack 19.2.6→19.3.0,
  vinext 1.0.0-beta.5→beta.10(peer @vitejs/plugin-rsc ^0.5.34 →
  0.5.35로 동반), vite 8.0.13→8.3.0,
  @cloudflare/vite-plugin 1.37.1→1.56.0(peer wrangler ^4.135.0 →
  4.135.0로 동반, 그 peerOptional @cloudflare/workers-types
  5.20260919.1로 동반), @types/react(-dom) 19.3.0.
- 결과: `npm audit` **0 vulnerabilities**, install 양쪽 성공.

IN PROGRESS: nothing.

NEXT:
1. EnrolledStrip 매칭 분반 직접 담기.
2. 졸업 ruleset 매핑 → 검증 학과만 엔진 연결.
3. LMS 과제·마감 검색(advisor), 알림 예약.
4. 나머지: 수집 실패율 관측, 스냅샷 크론(도달성 검증 선행),
   사이드바 축약, 접근성 설정, needs-verification 큐.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, 전체 매트릭스 11파일 OK
(lms 46/46, lms-server 47/47), root 빌드 green, deploy 빌드 green,
_verify_prod 전 엔드포인트 200. 라이브 version ec3280d1 — 새 툴체인
(vinext beta.10 + react 19.3 + vite 8.3 + cf-vite-plugin 1.56 +
wrangler 4.135)으로 프로덕션 동작 확인.

REPO SCOUT: none.

VERIFICATION STATUS: 새 툴체인으로 빌드·테스트·배포·공개 엔드포인트
검증 완료. RSC 렌더 경로(react 19.3)의 실계정 브라우저 e2e는
미수행 — 다음 시각 검증 라운드에서 확인 권장.

---

## 2026-09-19 — EnrolledStrip 분반 직접 담기 (user-audited priority 3)

DONE:
- `tryAdd`를 boolean 반환으로 변경 — 성공 시에만 분반 선택 목록을
  닫도록(충돌·중복·이수 실패 시 선택지 유지).
- `EnrolledStrip`에 `onAdd` prop + 분반 선택 UI: 분반 1개 과목은
  "담기" 즉시 추가, 다분반 과목은 "담기" 토글로 분반 목록
  (분반·교수·시간) 표시 후 선택 추가 — 충돌 검사·이수 검사·
  동일 과목 중복 검사는 기존 tryAdd 경로 그대로(notify로 실패
  원인 표시). "분반 N개 보기" 필터 경로도 유지.
- `.enrolled-item/.enrolled-actions/.enrolled-pick` 스타일 추가 —
  행 내부를 item(row+선택지) 구조로 재구성.

IN PROGRESS: nothing.

NEXT:
1. 졸업 ruleset 매핑 → 검증 학과만 엔진 연결(yearTable 1개뿐,
   dept null — 전 학과 확대 금지).
2. LMS 과제·마감 검색(advisor), 알림 예약.
3. 나머지: 수집 실패율 관측, 스냅샷 크론, 사이드바 축약,
   접근성, needs-verification 큐.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, 전체 매트릭스 11파일 OK,
root+deploy 빌드 green, _verify_prod 전 엔드포인트 200.
라이브 version 82a2ceda.

REPO SCOUT: none.

VERIFICATION STATUS: 코드·빌드·배포 검증. 담기 버튼·분반 선택
목록의 실계정 브라우저 확인은 미수행 — react 19.3 렌더와 함께
다음 e2e 라운드에서 확인 권장.

---

## 2026-09-19 — 졸업 ruleset 매핑 정규화 + 검증 학과 엔진 연결 (user-audited priority 4)

DONE:
- **매핑 검증(조사)**: 19 rulesets 중 yearTable은 컴퓨터공학부(CSE) 1개뿐,
  `dept: null`이던 원인은 카탈로그 개설 단위명 차이. 입학처 모집요강·
  CSE 사이트·카탈로그 교차 확인으로 검증: 컴퓨터공학부 =
  {IT응용시스템공학과(K191, 공통 교과), 모바일소프트웨어트랙(V021),
  빅데이터트랙(V022)}. 산학협력 프로젝트 각주의 과목명이 카탈로그 트랙
  개설과 일치해 매핑 확실. 웹공학·디지털콘텐츠가상현실 트랙은 2026-2
  카탈로그에 개설 단위가 없어 미등록.
- **`lib/data/dept-rules.ts`**:
  - `RULESET_DEPT_FAMILY` — 수집 학과명↔카탈로그 학과 수동 검증 매핑
    (검증된 것만 등록, 현재 컴퓨터공학부 1건).
  - `rulesetMatchesDept(r, userDept, pool)` — ①수집 해석 dept 포함
    ②deptLabel 정규화 일치 ③검증 패밀리(단일 확정 풀에서만 — 모호한
    candidates 풀에는 규정을 붙이지 않음). 어느 쪽도 아니면 매칭 안 함.
  - `deptRuleTargets(ruleset, admitYear)` — yearTable 학번 컬럼 해석:
    '취득/이수/졸업 학점' 행에서 교과 학점→total, 비교과 Npt→points
    ('140학점' 베어 형태도 총 취득 학점으로 해석). 나머지 V/숫자 셀은
    `conditions[]`(원문 라벨+셀, 권장 표기 감지)로 원문 보존 — 자동
    집계하지 않음. 컬럼 없으면 null(추측 금지).
- **`lib/data/graduation.ts`**: `evaluate` opts에 `deptTargets` 추가 —
  우선순위 사용자 override > 학과 규정 > 전역 기준. `RuleResult.
  requiredSource`('override'|'dept'|'global')로 required 출처 추적.
  학과 기준이 있으면 pre-2016 학번도 공식값 확정 가능(컴퓨터공학부
  ~15학번 총 140학점).
- **`app/sections/graduation.tsx`**: myRules를 rulesetMatchesDept로
  교체(컴퓨터공학부 입력·트랙 학과 입력·IT응용시스템공학과 입력 모두
  CSE 규정과 연결). deptTargets → evaluate 연결. 학번 컬럼 표 하이라이트
  (.my-col), "내 학번 기준" 조건 체크리스트(필수/권장 배지 + 자동 집계
  안 함 고지), 입학연도 미입력/컬럼 부재 안내. requiredSource=dept일 때
  카드 노트·상세 출처를 학과 규정표(컬럼 라벨·원문 링크·수집일)로 표시,
  인트로에 "내 학과 규정표 반영" 배지.
- **`progress.css`**: `.dept-conds` 체크리스트·`.my-col` 스타일.
- 미검증 학과는 여전히 엔진 미연결 — yearTable이 있는 ruleset만 이
  경로를 탄다. 나머지 18개는 원문 표시만(기존 동작).

IN PROGRESS: nothing.

NEXT:
1. LMS 과제·마감 검색(advisor), 알림 예약.
2. 나머지: 수집 실패율 관측, 스냅샷 크론(도달성 검증 선행),
   사이드바 축약, 접근성 설정, needs-verification 큐.
3. 수집 공백(Design 빈 본문, SclScn 링크 없음)은 크롤러 개선 과제로.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, 전체 매트릭스 11파일 OK
(dept-rules 61/61 — 매칭 7 + targets 11 신규, graduation 10/10 — 
deptTargets 4 신규), root+deploy 빌드 green, _verify_prod 전 엔드포인트
200. 라이브 version 22e2a286.

REPO SCOUT: none.

VERIFICATION STATUS: 엔진 해석·매칭은 단위 테스트로 검증. 실계정
브라우저에서 컴퓨터공학부 프로필로 규정 카드·학번 컬럼 하이라이트·
조건 체크리스트 렌더 확인은 미수행 — 다음 e2e 라운드 권장.

---

## 2026-09-19 — 코드 감사 기반 개선 라운드 (사용자 요청 "개선점 더 찾아봐")

DONE:
- **데이터 정확도**:
  - `dept.ts`: `CANDIDATE_ALIASES` 추가 — '컴퓨터공학부'(공식 학부명, 카탈로그
    개설 단위 아님) 입력 시 검증 패밀리 {IT응용시스템공학과, 모바일소프트웨어
    트랙, 빅데이터트랙}를 candidates로 반환. 이전엔 학과 필터·추천이 무력화.
  - `dept-rules.ts`: CREDIT_ROW를 '졸업 학점/취득 학점' 행으로 한정('전공 이수
    학점' 행이 total로 오입되는 잠재 버그 차단), NO_REQ에 '해당없음/없음'
    추가, `deptRuleTargets`가 `columnIndex` 직접 반환(라벨 재검색 제거).
  - `graduation.ts`: 이수 완료 코드는 planned 집계에서 제외 — 이수 목록에
    옮겨도 계획에 남아있으면 earned+planned 이중 집계되던 버그 수정.
- **일관성**:
  - `planBlockReason` 공통 가드로 담기 검증 통합 — courses/timetable/
    search 3곳의 중복 검사 제거, 검색 결과 '담기'도 충돌·중복·이수 검사 +
    토스트(이전엔 plan() 직행).
  - `uncertain`(응시 확인 실패) 마커 누락 3곳 추가 — lms DueSoonList,
    home 마감 위젯, calendar 수업 마감.
  - ERROR_LABELS에 'timeout' → '수집 시간 초과' 한글화.
  - 알림함 페이지 분류 배지를 실제 필터 버튼으로(패널과 동일), 선택 분류
    빈 상태 문구 분기. 알림 id에 dueTs 접미(동명 주차별 퀴즈 충돌 방지),
    지난 마감 '마감 지남' 라벨.
  - `myRules`를 richness( yearTable>lines>attachment ) 최선 매칭으로 —
    같은 학과 첨부전용 페이지가 본문 규정을 가리던 문제.
  - `/api/dept-rules` 로드 실패 시 규정 카드가 조용히 사라지던 것 →
    실패 표시 + 재시도 버튼.
- **소규모**: vite.config JSON import 속성 추가, recommend 루프 내
  plannedDays/dayLoad 재계산 호이스트, login/profile/lms-refresh 라우트
  JSON 비객체 입력 400 가드 보강, data.ts lms-collect 주석 정정.

IN PROGRESS: nothing.

NEXT:
1. LMS 과제·마감 검색(advisor), 알림 예약, 수강중 상태 — 기능 갭 후보.
2. 실계정 브라우저 e2e: 검색 담기 차단 토스트, 알림 분류 필터,
   문콘형 학과 규정 카드, 컴퓨터공학부 입력 시 학과 후보 표시.
3. 나머지 18개 규정 yearTable 커버리지(크롤러 개선).

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, 전체 매트릭스 11파일 OK
(dept-rules 66/66 — columnIndex·NO_REQ·세부 학점행 5 신규,
graduation 11/11 — 계획 중복집계 1 신규, ux-utils 26/26 —
컴퓨터공학부 패밀리 2 신규), root+deploy 빌드 green, 번들 신규 코드
마커 확인 후 배포, _verify_prod 전 엔드포인트 200.
라이브 version 903d603c.

REPO SCOUT: none.

VERIFICATION STATUS: 단위 테스트·빌드·배포 검증 완료. UI 동작
(필터 버튼, 토스트, 하이라이트)의 실계정 브라우저 확인은 미수행.

---

## 2026-09-19 — LMS 과제·마감 검색 + advisor 이번 주 마감 (감사 후속)

DONE:
- **`lib/data/search.ts`**: `lmsTaskSearch()` 신규 — LMS 개별
  항목(강의·과제·퀴즈)을 자유질문에서 검색. 종류어 필터
  (과제/숙제, 퀴즈/쪽지시험, 강의/동영상/vod/수업), 토큰 끝 질문
  어미·조사 제거('알고리즘은'→'알고리즘', '언제까지'→drop, 1자 잔여는
  과도 절단으로 보고 원형 유지), 마감 의도어(마감/데드라인/기한/제출)
  = 종류 무관 전 항목. 미완료→마감(범위면 끝)순 정렬, 상태는
  완료/미완료/응시 여부 확인 실패로 구분 표기. 결과는 `lms/{id}` 딥링크.
- **`searchAll`**: LMS 블록을 개별 항목(cap 10) → 과목 제목(cap 12)
  순으로 확장. 과목 hit도 `lms/{id}`로.
- **`lms.tsx`**: `LmsSection`에 `detail` prop — CourseCard에
  `id="lms-c-{id}"` + forceOpen, useEffect로 scrollIntoView.
- **`search.tsx`**: 글로벌 검색에 '수업 현황' 그룹 추가(과제·퀴즈·
  강의 항목 + 과목, cap 8) — 이전엔 LMS를 아예 검색하지 않았음.
- **`advisor.tsx`**: "이번 주에 뭐 해야 해?" 칩 — `dueSoon`(7일)으로
  마감 요약 + uncertain 퀴즈는 COSMOS 직접 확인 안내, 수집일 기준
  명시. 빈 결과 문구에 수업 항목 포함, placeholder에 예시 추가.
- **`lms.ts`**: `parseDue` export(검색 정렬에서 재사용).
- **`page.tsx`**: LmsSection에 detail 배선.

IN PROGRESS: nothing.

NEXT:
1. 실계정 e2e: '알고리즘 과제 언제까지' → task hit → lms/{id} 카드
   펼침·스크롤, advisor 주간 마감 칩.
2. 알림 예약(푸시 인프라 필요), 수강중 상태(LMS에 학점·코드 없어
   제목 매칭만으로는 부정확 — 보류 유지), 나머지 18개 규정 수집.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, 전체 매트릭스 11파일 OK
(search 26/26 — task 검색 12 신규: 종류 필터·질문 어미·마감 의도·
초성·정렬·uncertain·순수 질문어 무매칭), root+deploy 빌드 green,
번들 마커 확인, _verify_prod 전 엔드포인트 200.
라이브 version 38e0db29.

REPO SCOUT: none.

VERIFICATION STATUS: 매칭 로직은 단위 테스트로 검증. 딥링크
펼침·스크롤과 advisor 칩의 실계정 브라우저 확인은 미수행.

---

## 2026-09-20 — 남은 후보 일괄 처리 (수강중 배지 + 규정 이미지 + 알림 예약 + e2e)

DONE:
- **수강중 상태(표시 전용)**: `lms.ts`에 `enrolledSectionIds()` 추가
  (matchEnrollment → 카탈로그 분반 id 집합). courses 목록·상세 카드에
  '수강 중' 배지 + 툴팁(이름 매칭 기반, 공식 확인은 학교 시스템).
  graduation에 '현재 수강 중' 정보 스트립 — COSMOS 스냅샷 출처·이름
  매칭 한계·졸업 학점 미반영 명시. 학점 집계에는 일절 미반영.
- **규정 커버리지(이미지 게시)**: Design 3개·역사문화큐레이션·역사콘텐츠
  트랙 등 규정이 본문 이미지로만 게시된 페이지를 수집하도록 개선.
  `dept-rules.ts`에 `extractContentImage()` — `_contentBuilder` 아티클
  우선 스캔(없으면 contentsEditHtml~body), footer_logo/배너/아이콘 등
  노이즈 필터, 상대경로 절대화 + alt 보존. `isRulesetAnomalous`가
  image를 첨부와 동일하게 정상 간주. `DeptRuleset.image` 타입 추가.
  크롤러 재실행 → ruleset 19→24개(Design 3 + 역사 트랙 2 신규 수집).
  graduation.tsx에 이미지 규정 카드(공식 이미지 인라인 + 원문 링크),
  규정 인덱스에 '이미지 공개' 배지, richness 점수에 image 반영.
  `.rules-image` 스타일.
  - 조사 결과: SclScn은 사이트맵에 졸업 링크 자체가 없음(학교 측 공백),
    무용 전공 1줄 규정은 실제 정식 문구(파서 정상), Design 3개 트랙
    페이지는 학교가 동일한 패션마케팅 이미지를 게시(원본 데이터 오류 —
    수집된 이미지+원문 링크로 그대로 표시하는 것이 정직한 처리).
- **브라우저 마감 알림(푸시 없이 가능한 범위)**: `notifs.ts`에
  `reminderTargets()` — 미래 LMS 마감을 24h 전·당일에 울리는 예약 대상
  도출(캘린더 날짜 기준 오늘/내일/D-n 라벨, uncertain 표기, 알림함 id
  형식 공유). page.tsx에 예약 이펙트 — notifEnabled + granted + lms가
  있을 때 setTimeout 예약, 발송분은 data.notifiedIds에 기록(최근 200
  유지)해 중복 발송 방지. dataRef로 타이머 안에서도 최신 data 접근.
  notifications.tsx에 '마감 브라우저 알림' 설정 블록 — opt-in 토글,
  requestPermission 연결, 미지원/차단 상태 안내, '앱(탭)이 열려 있을
  때만 울림 — 백그라운드 푸시 미지원' 한계 명시. Data에 notifiedIds·
  notifEnabled 추가(데모 복원 가드 포함).
- **e2e(데모 모드, Playwright)**: localStorage 시드(컴퓨터공학부+알고
  리즘/머신러닝 LMS) 후 14항목 검증 전부 통과 — 수강 중 배지, 글로벌
  검색 수업 현황 그룹+과제 항목, lms/c1 딥링크 자동 펼침·스크롤,
  advisor '이번 주에 뭐 해야 해?' 마감 응답, 졸업 현재 수강 중 스트립,
  CSE 학번표 카드, 이미지 공개 배지, 알림 설정 표시, LMS 알림 항목,
  opt-in 토글, 한계 고지 문구. (headless는 Notification.permission이
  denied 고정이라 granted shim으로 검증 — 실제 브라우저 권한 흐름은
  앱 코드 경로와 동일)

IN PROGRESS: nothing.

NEXT:
- 없음(사용자 지정 후보 전부 처리). 잔여 큰 과제: 백그라운드 푸시
  (VAPID+서비스워커+구독 저장 인프라 필요), SclScn 졸업요건은 학교
  사이트 공백으로 수집 불가.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, 전체 매트릭스 11파일 OK
(dept-rules 74/74 — 이미지 추출·노이즈 필터·article 스코프 8 신규,
notifs 20/20 — reminderTargets 9 신규, lms 48/48 — enrolledSectionIds
포함), root+deploy 빌드 green, 번들 마커 5종 확인, _verify_prod 전
엔드포인트 200, /api/dept-rules 라이브 24개·이미지 6건 확인.
e2e 14/14. 라이브 version 46543064.

REPO SCOUT: none.

VERIFICATION STATUS: 단위 테스트·빌드·배포·데모 e2e 완료. 실계정
브라우저 확인은 데모로 대체(로그인 경로만 미검증). 브라우저 알림의
실제 OS 알림 발송은 headless라 시각 확인 불가 — 예약·토글·한계 고지
로직만 검증됨.
