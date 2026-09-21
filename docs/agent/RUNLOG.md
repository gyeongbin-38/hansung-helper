# Agent Run Log

Each autonomous session appends one entry here using the required
end-of-run format. Next session: read this + BACKLOG.md first, verify
`needs-verification` items before starting new work.

---

## 2026-09-17 ��� loop iteration (Devin/Paseo session)

DONE:
- Consolidated the prior session's uncommitted work into commit b304e21
  (ISSUE-1/3/4 verified code: catalog, timetable builder, graduation v0,
  dept normalization, sections/styles split).
- Verified ISSUE-4 as independent fresh session �넂 PASS (unmatched dept
  shows "�븰怨� 留ㅼ묶 �솗�씤 �븘�슂", never wrong results).
- ISSUE-7 implemented: deleted unused starter kit (components/ ~90
  files, hooks/, components.json, lib/utils.ts) in both repos; pruned
  14 starter-only deps; root tsconfig now excludes published-personal/
  (it was silently type-checking the nested repo against root paths).
- ISSUE-8 implemented: replaced 2 vacuous assertions with pinned
  outcomes (AI�쑖�빀 �넂 unresolved; �쑖�빀 �넂 exactly 2 candidates).
- ISSUE-2 implemented (snapshot variant): hsportal public list is
  server-rendered �넂 plain-HTTP crawler scripts/crawl-activities.mts �넂
  lib/data/activities.json (39 items) �넂 GET /api/activities �넂
  activities.tsx rewired (real covers, status tabs, provenance).
- ISSUE-11 implemented: advisor answers from real plan/catalog/
  activity data; free-text keyword search returns routable hits.
- Fixed _sync.py: /XO /XN /XC meant it never copied modified files ���
  deploy repo was silently stale. Now /MIR mirroring. Also stopped
  cloudflared.exe leaking into the deploy repo.
- Both repos committed; published-personal rebuilt independently.

IN PROGRESS: nothing ��� working tree clean in both repos.

NEXT:
1. Verify ISSUE-2, ISSUE-7, ISSUE-8, ISSUE-11 in a fresh session
   (verifier must not be this session).
2. ISSUE-6 (dept횞year rulesets + �닔媛뺤쨷) ��� blocked on official 議몄뾽
   洹쒖젙 data (needs-human input).
3. ISSUE-10 ��� toolchain bumps with compat verification.
4. Re-run crawler periodically to refresh activities.json.

BLOCKER: ISSUE-5 (remote D1 + deploy) and ISSUE-9 (stale root
.openai/hosting.json project_id) need human/accounts. Live-deployed
site at https://hansung-campus.gyeongbinb38.chatgpt.site predates all
of this work.

TESTS: tsc, oxlint, build (both repos), catalog 4/4, school 5/5,
graduation 4/4, ux-utils 24/24, activities 5/5, http-check PASS,
account-db PASS.

REPO SCOUT: none needed this run (plain HTTP sufficed for hsportal ���
Playwright rejected; recorded in ISSUE-2).

VERIFICATION STATUS: ISSUE-2/7/8/11 await independent verification.

DEPENDENCIES/REPOS REVIEWED: none added; 14 removed (ISSUE-7).

---

## 2026-09-17 ��� loop iteration 2 (verification + ISSUE-12)

DONE:
- Verified ISSUE-7 (starter-kit removal) �넂 PASS: dirs gone, no imports,
  deps minimal, gates green.
- Verified ISSUE-8 (test assertions) �넂 PASS: pins real outcomes.
- Verified ISSUE-11 (data-driven advisor) �넂 PASS; fixed minor nit:
  failed activities fetch no longer shows "遺덈윭�삤�뒗 以�" forever.
- Verified ISSUE-2 (activities pipeline) �넂 **FAIL, then fixed**: cards
  carry extra <time> elements outside date_layer (header run-time pair
  + content duplicate), so positional extraction swapped �떊泥��넄�슫�쁺 on
  26/39 rows ��� and the test pinned the bad value. Parser now maps
  date_layer blocks by their �떊泥�/�슫�쁺 label; test corrected; regression
  test added; snapshot re-crawled (37 items, all sane).
- Implemented ISSUE-12: official �븰�궗�씪�젙 ingestion ���
  lib/data/schedule.ts + scripts/crawl-schedule.mts (POST month/year2,
  12 months of the academic year) �넂 lib/data/schedule.json (73 events)
  �넂 GET /api/schedule �넂 calendar.tsx shows upcoming official events
  with 怨듭떇 �븰�궗�씪�젙 provenance. tests/schedule.test.mjs 4/4.
- New findings logged: ISSUE-13 (derived notifications + �솃 �븷�씪 移댁슫�듃
  怨좎젙媛�), ISSUE-14 (_sync.py --check mode).
- Both repos committed: f5dfe0d + cf23f56 (root), 277d171 + f6a5967
  (deploy).

IN PROGRESS: nothing ��� working tree clean in both repos.

NEXT:
1. Re-verify ISSUE-2 date fix + verify ISSUE-12 in a fresh session.
2. ISSUE-13 (derived notifications, home task count), ISSUE-14
   (sync --check).
3. ISSUE-6 still needs official 議몄뾽 洹쒖젙 data; ISSUE-5/9 need human.

BLOCKER: unchanged ��� ISSUE-5 (remote D1 + deploy) and ISSUE-9 need
human/accounts.

TESTS: tsc, oxlint, build (both repos), activities 6/6, schedule 4/4,
catalog 4/4, school 5/5, graduation 4/4, ux-utils 24/24.

REPO SCOUT: hansung.ac.kr/hansung/6096/subview.do is public, server-
rendered, UTF-8 ��� plain HTTP POST suffices for month navigation.

VERIFICATION STATUS: ISSUE-2 fix + ISSUE-12 await independent
verification.

---

## 2026-09-18 ��� loop iteration 3 (ISSUE-6 partial + 13 + 15 + 16)

DONE:
- Recon'd spec gaps vs implementation (courses/graduation/calendar
  detail routes absent, hero carousel absent, topbar search = activities
  only, 4/6 survey answers unused, no max-credit constraint) and
  confirmed ISSUE-6 is partially unblocked ��� the school publishes the
  2016�븰踰�~ global baseline publicly (援먭낵 130�븰�젏 + 鍮꾧탳怨� 800P,
  �븰湲�/�봽濡쒓렇�옩�떦 200P �긽�븳 at hansung.ac.kr/hansung/6220/subview.do).
- ISSUE-6 partial: GLOBAL_RULE_SOURCE provenance constant; DEFAULT_RULES
  now carry the official global baseline (130 credits + 800P, unit/
  source fields added). evaluate() takes {admitYear, points} ��� baseline
  applies only for 2016+, pre-2016 and missing points stay UNKNOWN,
  dept-specific rules stay "�솗�씤 �븘�슂", user overrides still win.
  graduation.tsx renders unit-aware rows + official source link.
  tests 6/6.
- ISSUE-15 implemented: recommend() now scores �슦�꽑紐⑺몴 (議몄뾽�슂嫄� 異⑹”
  �넂�븘�닔 移댄뀒怨좊━, �쟾怨� �떖�솕�넂�쟾�븘/�쟾�꽑, 吏꾨줈 �깘�깋�넂援먯뼇/����븰怨� 媛쒕갑) and
  �븰湲곌뎄�꽦 (�씪�젙 �뿬�쑀�넂�삩�씪�씤/臾댁떆媛꾨��, 怨듦컯�씪 �솗蹂닳넂湲곗〈 �슂�씪 蹂댁〈,
  怨좊Ⅸ 諛곗튂�넂�슂�씪 洹좏삎). �닔�뾽諛⑹떇/�룊媛�諛⑹떇 stay unscored ��� catalog has no
  such metadata ��� and timetable rec panel now says so explicitly.
- ISSUE-16 implemented: semester-plan warns (not blocks) when planned
  credits >21, labeled as a conservative threshold, not an official cap.
- ISSUE-13 implemented: notifications derived from real state (planned
  conflicts, activity applyEnd within 7d, official schedule within 7d,
  incomplete profile, account disconnected) + category count badges;
  home tasks derived from actual state instead of hardcoded 3, official
  schedule merged into "�떎媛��삤�뒗 �씪�젙" with provenance labels; empty-
  state shown when nothing outstanding. React Compiler purity:
  Date.now() moved to useState lazy init (mount-time, once).
- Both repos synced + built; commit pending this entry.

IN PROGRESS: nothing ��� gates all green.

NEXT:
1. Fresh-session verification: ISSUE-2 fix, ISSUE-12, ISSUE-6 partial,
   ISSUE-13, ISSUE-15, ISSUE-16.
2. ISSUE-17 (hero carousel), ISSUE-18 (detail routes), ISSUE-19
   (global search), ISSUE-14 (sync --check).
3. ISSUE-6 remainder: dept횞year rulesets need per-dept official rule
   pages collected/validated; �닔媛뺤쨷 state still absent.

BLOCKER: unchanged ��� ISSUE-5 (remote D1 + deploy) and ISSUE-9 need
human/accounts. Public deployment still predates all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, build (both repos),
http-check PASS, account-db PASS.

REPO SCOUT: none adopted this run (node-html-parser stays a candidate
for crawler parsing ��� recorded earlier; Date.now purity forced a
useState pattern, no dep needed).

VERIFICATION STATUS: ISSUE-2 fix, ISSUE-12, ISSUE-6 partial, ISSUE-13,
ISSUE-15, ISSUE-16 await independent verification.

---

## 2026-09-18 ��� loop iteration 4 (verification + 14 + 17 + 19)

DONE:
- Verified ISSUE-2 date-label fix �넂 PASS (label-based date_layer mapping,
  regression test for missing �떊泥� layer, re-crawled snapshot sane).
- Verified ISSUE-12 schedule pipeline �넂 PASS (row parser, fnv ids,
  anomaly guard, API + calendar UI provenance).
- Verified ISSUE-6 partial �넂 PASS (2016+ baseline applies, pre-2016 �넂
  UNKNOWN, missing points �넂 UNKNOWN, profile year/points inputs exist,
  official source link rendered).
- Verified ISSUE-15 �넂 PASS (�슦�꽑紐⑺몴/�븰湲곌뎄�꽦 scored; �닔�뾽諛⑹떇쨌�룊媛�諛⑹떇
  explicitly disclosed as unscored).
- Verified ISSUE-16 �넂 PASS (21-credit soft warning, no fake official cap).
- Verified ISSUE-13 �넂 PASS **with two verifier-found bugs fixed**:
  1. `read: boolean` made "紐⑤몢 �씫�쓬" permanently mark all future
     notifications read ��� now `readIds: string[]`; derivation extracted
     to `deriveNotifs()` shared by the section and the Topbar bell dot
     (now shows real unread count). Profile schema + API validation +
     demo shape-check updated.
  2. profile route rejected ruleOverrides >300 while the UI allows �돞2000
     and 800P is the official target ��� cap raised to 2000.
- ISSUE-14 implemented: `_sync.py --check` ��� robocopy /L list-only drift
  detection, DRIFT report + exit 1 on mismatch. Detected the real
  6-file drift, then parity OK post-sync.
- ISSUE-17 implemented: home hero carousel ��� top 5 actionable activities
  (closing�넂open�넂upcoming, soonest deadline), manual prev/next +
  position dots, cover/D-day/points/deadline, provenance line, hidden
  when snapshot empty. CSS .hero-carousel in home.css.
- ISSUE-19 implemented: �넻�빀 寃��깋 ��� new `search` route, grouped results
  (courses/activities/schedule, koreanMatch, cap 8 each), course rows
  have "�떞湲�" buttons, activity �넂 detail route, topbar placeholder
  updated.
- Both repos synced + built; commits pending this entry.

IN PROGRESS: nothing ��� gates all green.

NEXT:
1. Fresh-session verification: ISSUE-13 readIds fix + override cap,
   ISSUE-14, ISSUE-17, ISSUE-19.
2. ISSUE-18 (detail routes /courses/:id, /graduation/:id,
   /calendar/:id), ISSUE-10 (toolchain audit bumps).
3. ISSUE-6 remainder: dept횞year rulesets (per-dept official pages
   exist, e.g. CSE/1564 ��� needs per-dept collection+validation),
   �닔媛뺤쨷 state.

BLOCKER: unchanged ��� ISSUE-5 (remote D1 + deploy), ISSUE-9 (stale root
hosting.json) need human/accounts. Public deployment still predates
all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, build (both repos),
http-check PASS, account-db PASS, sync --check parity OK.

REPO SCOUT: none needed ��� carousel/search built from existing deps.

VERIFICATION STATUS: ISSUE-13 fixes, ISSUE-14, ISSUE-17, ISSUE-19
await independent verification.

---

## 2026-09-18 ��� loop iteration 6 (verification + 21 + 22 + 18-partial + 20-scout)

DONE:
- Verified ISSUE-13 readIds fix, ISSUE-14, ISSUE-17, ISSUE-19 �넂 all PASS
  (code review: per-item read state consistent across schema/API/demo
  shape-check; sync --check live-verified with real drift then parity OK;
  carousel + unified search confirmed via review + gates).
- ISSUE-21 implemented: advisor free-text search now includes official
  schedule events ��� searchAll(query, catalog, activities, schedEvents),
  koreanMatch on event titles, route 'calendar', `怨듭떇 �븰�궗�씪�젙` subtitle
  with dates. Limitation documented: title-substring matching only.
- ISSUE-22 implemented: saved activities prioritized in deadline
  notifications ��� sort puts data.saved first, purple tone + '����옣�븳 �솢�룞'
  label; unsaved keep status label. Prioritization, not restriction.
- ISSUE-18 partially implemented: /courses/:id detail route ��� breadcrumb,
  full section metadata, plan/remove with conflict display, sibling
  遺꾨컲 list with add + swap-when-planned, timetable link, provenance
  disclaimers. Course names in list + unified search link to detail.
  /graduation/:id + /calendar/:id remain in backlog.
- ISSUE-20 explored: CSE dept page (CSE/1564/subview.do) confirmed to
  have a real admission-year-column rules table (UTF-8 server-rendered).
  Blocker identified: no dept-link discovery path ��� college index pages
  6082-6088 are nav chrome only; 6081 (����븰쨌����븰�썝) is a candidate dept
  directory needing deeper parse; dept slug + 議몄뾽�슂嫄� subview id differ
  per dept �넂 manual registry or per-dept nav crawl needed. Probe script
  kept at scripts/_probe-dept-rules.py (root-local, sync-excluded).
- Gates all green; both repos synced (parity OK) + built; commits pending.

IN PROGRESS: nothing.

NEXT:
1. Fresh-session verification: ISSUE-21, ISSUE-22, ISSUE-18 courses/:id.
2. ISSUE-18 remainder (/graduation/:id, /calendar/:id), ISSUE-10
   (toolchain audit bumps).
3. ISSUE-20 implementation: dept directory discovery (6081 parse or
   per-dept nav crawl) �넂 dept registry �넂 ruleset JSON for consistent-
   format depts; unknown preserved for the rest.

BLOCKER: unchanged ��� ISSUE-5 (remote D1 + deploy), ISSUE-9 (stale root
hosting.json) need human/accounts. Public deployment still predates
all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, build (both repos),
http-check PASS, account-db PASS, sync --check parity OK.

REPO SCOUT: none needed ��� all three features built from existing deps.

VERIFICATION STATUS: ISSUE-21, ISSUE-22, ISSUE-18 (courses/:id) await
independent verification.

---

## 2026-09-18 ��� loop iteration 7 (test coverage + synonyms + 18-complete + 20-path)

DONE:
- Test coverage (improvement #4): extracted pure modules ���
  `searchAll` �넂 `lib/data/search.ts`, `deriveNotifs` �넂
  `lib/data/notifs.ts` (minimal structural input types, no lib�넂app deps),
  `courseMatch` �넂 `lib/data/catalog.ts` (domain function alongside
  conflicts/gradGroup; 4 importers updated). New suites:
  `tests/search.test.mjs` 10/10, `tests/notifs.test.mjs` 11/11 ���
  deep-link routes, synonym matching, caps, ordering, saved-first
  deadline sort, window filters, conflict/profile/connection notifs.
- Advisor synonyms (improvement #5): `SCHED_ALIASES` in search.ts ���
  schedule-query alias table (�떆�뿕�넂以묎컙쨌湲곕쭚, �궔遺��넂�벑濡�, �쑕�븰/蹂듯븰,
  議몄뾽/�븰�쐞, 諛⑺븰/怨꾩젅, �꽦�쟻). Rule-based expansion, honestly scoped.
- ISSUE-18 completed: `/graduation/:id` (rule detail ��� status,
  progress, official-source vs uncollected-rule wording, override
  editor, points-rule input guidance, contributing completed/planned
  course breakdown; rule card titles link) and `/calendar/:id` (event
  detail ��� title, range, collection date, official-page link,
  breadcrumb; event titles link). Schedule hits in searchAll +
  search.tsx now deep-link `calendar/<id>`; advisor course hits
  deep-link `courses/<id>`. Shared `.title-link` class added
  (globals.css) ��� replaces undefined `course-title`/`rule-link`
  classes so heading links inherit parent title styling.
- ISSUE-20 path confirmed: 6081 (����븰쨌����븰�썝) �넂 college slugs
  (CreCon/Design/HmnArt/LibArt/SclScn/cncschool/futureplus/global)
  �넂 college home navs directly expose �븰怨쇱냼媛� + 議몄뾽�슂嫄� links
  (CreCon 2772/2781/2791/2800, Design �듃�옓議몄뾽�슂嫄� 5108/5115/5122/5124,
  HmnArt 5596 + �삁�닠�븰遺� �듃�옓蹂�). Registry builder + �븰踰�-column table
  parser is the remaining work ��� recorded in backlog.
- Gates all green; both repos synced (parity OK) + built.

IN PROGRESS: nothing.

NEXT:
1. Fresh-session verification: ISSUE-18 �쟾 �씪�슦�듃, ISSUE-21/22,
   異붿텧/�룞�쓽�뼱/�뀒�뒪�듃 蹂�寃쎈텇.
2. ISSUE-20 implementation: dept�넄rules-page registry (nav �닚�꽌 �뙇),
   �븰踰�-而щ읆 �몴 �뙆�꽌, ruleset JSON + �뿏吏� �뿰�룞, 誘몄닔吏� unknown �쑀吏�.
3. ISSUE-10 toolchain audit bumps.

BLOCKER: unchanged ��� ISSUE-5 (remote D1 + deploy), ISSUE-9 (stale root
hosting.json) need human/accounts. Public deployment still predates
all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, search 10/10,
notifs 11/11, build (both repos), http-check PASS, account-db PASS,
sync --check parity OK.

REPO SCOUT: none needed ��� all changes built from existing deps.

VERIFICATION STATUS: ISSUE-18 (all routes), ISSUE-21, ISSUE-22, and
the search/notifs extraction + synonym layer await independent
verification.

## 2026-09-18 ��� loop iteration 8 (ISSUE-20 pipeline: dept rulesets + UI)

DONE:
- ISSUE-20 partially implemented ��� �븰怨쇰퀎 怨듭떇 議몄뾽�슂嫄� �닔吏� �뙆�씠�봽�씪�씤:
  - `lib/data/dept-rules.ts` ��� parseSitemapLinks / pairDeptRules
    (�몢 媛깆떊 寃쎈줈: �븰怨쇰챸 �씪踰� + '�븰怨� �냼媛�' URL 泥� �씪踰�) /
    extractRulesText (CMS `contentsEditHtml` 蹂몃Ц 寃⑸━, �젣紐�-�빑而�
    �뤃諛�) / extractAttachment / inferDeptLabel / isMultiDeptPage /
    isRulesetAnomalous. 洹쒖젙 臾멸뎄�뒗 **�썝臾� 洹몃��濡�** ��� �닔移� �빐�꽍 �뾾�쓬.
  - `scripts/crawl-dept-rules.mts` ��� 7媛� �궗�씠�듃 �뒳�윭洹� �궗�씠�듃留� �닚�쉶,
    700ms 媛꾧꺽, 蹂몃Ц �뾾�쑝硫� �씠�긽媛먯��濡� �젣�쇅, �쟾泥� 0嫄댁씠硫� 湲곗〈 �쑀吏�.
  - `lib/data/dept-rules.json` ��� 19 rulesets (sourceUrl/fetchedAt 蹂댁〈):
    CreCon 4 (臾몄퐯��� hwp 泥⑤��留�), HmnArt 7, futureplus 1(multiDept),
    CSE 1(而댄벂�꽣怨듯븰遺� ��� 移댄깉濡쒓렇 誘몄뿰寃�), global 6 �쟾�썝 �빐�꽍.
    誘몄닔吏뫢룹젣�쇅: Design 3(鍮� 蹂몃Ц), HmnArt 2(鍮� 蹂몃Ц),
    SclScn(議몄뾽�슂嫄� 留곹겕 �옄泥� �뾾�쓬) ��� 吏��뼱�궡吏� �븡�쓬.
  - `/api/dept-rules` �씪�슦�듃 + `useDeptRules()` �썒 (�뒪�깄�꺑 �뙣�꽩 �룞�씪).
  - 議몄뾽 �꽮�뀡 UI: "�궡 �븰怨� 怨듭떇 議몄뾽�슂嫄�" 移대뱶 ��� data.dept�넂移댄깉濡쒓렇
    �빐�꽍�넂ruleset 留ㅼ묶 �떆 �썝臾� 24以�+留곹겕+�닔吏묒씪+泥⑤�� �븞�궡; �닔吏� �럹�씠吏�
    �쟾泥� �씤�뜳�뒪 `<details>` (�쟾泥� �븰怨� 怨듯넻/臾몄꽌 泥⑤��/移댄깉濡쒓렇 誘몄뿰寃�
    諛곗��). "�븰援� 怨듭떇 �궗�젙�쓣 ���泥댄븯吏� �븡�쓬" 臾멸뎄 �쑀吏�.
- tests/dept-rules.test.mjs ��� 23/23 (�궗�씠�듃留� �뙆�떛, �뙇 �뿰寃� �뼇 寃쎈줈,
  蹂몃Ц 寃⑸━/�뤃諛�/鍮� 蹂몃Ц, 泥⑤�� 媛먯��, �븰怨� 異붿젙, multiDept, �씠�긽媛먯��).
- Gates all green; both repos synced (parity OK) + built.

IN PROGRESS: nothing.

NEXT:
1. Fresh-session verification: ISSUE-18 �쟾 �씪�슦�듃, ISSUE-21/22,
   異붿텧/�룞�쓽�뼱 蹂�寃쎈텇 + ISSUE-20 �뙆�씠�봽�씪�씤쨌UI 移대뱶.
2. ISSUE-20 �옍�뿬: CSE�삎 �븰踰�-而щ읆 �몴�쓽 援ъ“�솕 �뙆�떛(�떊猶� 媛��뒫 �떆�뿉留�
   �뿏吏� �뿰�룞), Design/HmnArt 鍮� 蹂몃Ц �럹�씠吏� �썝�씤(�씠誘몄��?) �솗�씤,
   SclScn �벑 誘몄닔吏� �궗�씠�듃 議몄뾽洹쒖젙 �쐞移� �깘�깋, multiDept �럹�씠吏��쓽
   �븰怨쇰퀎 遺꾪븷.
3. ISSUE-10 toolchain audit bumps.

BLOCKER: unchanged ��� ISSUE-5 (remote D1 + deploy), ISSUE-9 (stale root
hosting.json) need human/accounts. Public deployment still predates
all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, search 10/10,
notifs 11/11, dept-rules 23/23, build (both repos), http-check PASS,
account-db PASS, sync --check parity OK.

REPO SCOUT: none needed ��� all changes built from existing deps.

VERIFICATION STATUS: ISSUE-18 (all routes), ISSUE-21, ISSUE-22,
search/notifs extraction + synonym layer, and the ISSUE-20 dept-rules
pipeline (parser, crawler, snapshot, API, UI card) await independent
verification.

## 2026-09-18 ��� loop iteration 9 (ISSUE-20 yearTable parser + table UI)

DONE:
- Verified pending items by code review (dept-rules module, UI card,
  crawler) ��� consistent with gates; full matrix re-run.
- ISSUE-20 yearTable parser implemented:
  - `parseYearLabel` ��� '~ 15�븰踰�'�넂{to:2015}, '16�븰踰�'�넂{2016},
    '17�븰踰� ~23�븰踰�'�넂{2017���2023}, '24�븰踰� ~'�넂{from:2024}; �븰踰� �뾾�쑝硫� {}.
  - `parseYearTable` ��� CMS 蹂몃Ц 而⑦뀒�씠�꼫 �궡 <table> �깘�깋, �뿤�뜑 �뻾�쓽
    �븰踰� ��� �쐞移섎줈 �씪踰�/�뿰�룄 而щ읆 遺꾨━, ������ **�썝臾� 蹂댁〈**,
    ��� �닔 遺덉씪移�(colspan) �뻾 嫄대꼫���, �쑀�슚 �뻾 �뾾�쑝硫� null.
  - `yearColumnIndex` ��� �엯�븰�뿰�룄�넂�빐�떦 而щ읆 (�뿏吏� �뿰�룞 以�鍮꾨Ъ).
  - `DeptRuleset.yearTable` �븘�뱶 異붽��, �겕濡ㅻ윭 �뿰寃� (+�븰踰덊몴 濡쒓렇).
  - �떎�젣 CSE/1564 寃�利�: 4而щ읆(~15/16/17~23/24~)횞5�뻾(珥앺븰�젏쨌罹≪뒪�넠쨌
    �듃�옓�닔쨌GitHub쨌�궛�븰�삊�젰) �젙�솗 �뙆�떛 ��� 怨듭떇 �몴��� �씪移� �솗�씤.
- UI: �븰怨� 洹쒖젙 移대뱶�뿉 yearTable �엳�쑝硫� �떎�젣 <table> �젋�뜑留� +
  �몴 ���/�씪踰④낵 �룞�씪�븳 �씪�씤��� 以묐났 �젣�쇅�븳 �굹癒몄�� �븞�궡留� �몴�떆
  (�몴 �쇅 �봽濡쒖쫰 蹂댁〈).
- tests: dept-rules 40/40 (parseYearLabel 5, parseYearTable 8,
  yearColumnIndex 4 異붽��).
- Gates all green; both repos synced (parity OK) + built.

IN PROGRESS: nothing.

NEXT:
1. Fresh-session verification: ISSUE-18, 21, 22, ISSUE-20 �뙆�씠�봽�씪�씤
   �쟾泥�(�뙆�꽌쨌�겕濡ㅻ윭쨌�뒪�깄�꺑쨌API쨌UI 移대뱶쨌yearTable).
2. ISSUE-20 �옍�뿬: 而댄벂�꽣怨듯븰遺��넄移댄깉濡쒓렇 �븰怨� 留ㅼ묶 �솗�씤(媛쒗렪 �뿬遺�,
   怨듭떇 洹쇨굅 �븘�슂 ��� 異붿젙 �뿰寃� 湲덉��), Design/HmnArt 鍮� 蹂몃Ц �썝�씤,
   SclScn 洹쒖젙 �쐞移�, multiDept 遺꾪븷, yearTable�넂�뿏吏� �뿰�룞(�빐�꽍�맂
   �븰怨� + �떊猶곕맂 留ㅽ븨 �엳�쓣 �븣留�).
3. ISSUE-10 toolchain audit bumps.

BLOCKER: unchanged ��� ISSUE-5 (remote D1 + deploy), ISSUE-9 (stale root
hosting.json) need human/accounts. Public deployment still predates
all of this work.

TESTS: tsc clean, oxlint 0 err, catalog 4/4, school 5/5, graduation
6/6, activities 6/6, schedule 4/4, ux-utils 24/24, search 10/10,
notifs 11/11, dept-rules 40/40, build (both repos), http-check PASS,
account-db PASS, sync --check parity OK.

REPO SCOUT: none needed ��� all changes built from existing deps.

VERIFICATION STATUS: ISSUE-18 (all routes), ISSUE-21, ISSUE-22,
search/notifs extraction + synonym layer, ISSUE-20 dept-rules pipeline
(parser쨌crawler쨌snapshot쨌API쨌UI card쨌yearTable parser) await
independent verification.
  
## 2026-09-18 ��� loop iteration 10 (Devin/Paseo session)

DONE:
- ISSUE-23 implemented ��� COSMOS LMS �닔�뾽 �쁽�솴 �뿰�룞 (�룍遺�湲� hs-shell/dotbugi
  李몄“). �꽌踰꾧�� COSMOS �꽭�뀡�뿉 �젒洹� 遺덇�� �넂 �궗�슜�옄 釉뚮씪�슦��� �븞�뿉�꽌 �닔吏묓븯�뒗
  援ъ“ 梨꾪깮 (�쇅遺� �쟾�넚쨌濡쒓렇�씤 �옄�룞�솕 �뾾�쓬).
- `public/lms-collect.js` ��� 釉뚮씪�슦��� �닔吏� �뒪�겕由쏀듃, `/lms-collect.js`
  �젙�쟻 �젣怨�. dotbugi ����젆�꽣 怨꾩빟 湲곕컲: `.my-course-lists` 怨쇰ぉ 紐⑸줉,
  `mod/assign/index.php`(generaltable), `mod/quiz/index.php` +
  `quizattemptsummary` �젣異� �뙋�젙, `report/ubcompletion/user_progress[_a].php`
  異쒖꽍遺�(thead �룞�쟻 而щ읆 + rowspan �룊�깂�솕 + �씪愿꾩텧�꽍�씤�젙),
  `course/view.php` VOD 留곹겕/�닔媛뺢린媛�. `Promise.allSettled` 遺�遺� �떎�뙣
  蹂댁〈 + `errors` �븘�뱶. 異쒕젰 `lms-data.json` �떎�슫濡쒕뱶.
- `lib/data/lms.ts` ��� LmsSnapshot ����엯 + validateLms(�뾼寃� �삎�떇 寃�利�),
  courseProgress, pendingTasks, dueSoon(range �걹�궇吏� �뙆�떛).
- `app/sections/lms.tsx` + '�닔�뾽 �쁽�솴' �궗�씠�뱶諛� 硫붾돱 ��� 3�떒怨� �닔吏� �븞�궡,
  �뒪�겕由쏀듃 蹂듭궗 踰꾪듉/�뙆�씪 留곹겕, JSON �뾽濡쒕뱶(寃�利�), 怨쇰ぉ蹂� 移대뱶(媛뺤쓽
  吏꾪뻾瑜� + 誘몄셿猷� 紐⑸줉 + COSMOS �뵦留곹겕 + 遺�遺� �닔吏� 怨좎��), 7�씪 留덇컧
  �엫諛�, �뜲�씠�꽣 �궘�젣.
- `Data.lms` �븘�뱶 + demo shape-check + account profile API�뿉
  `validateLms` 寃�利� + body �븳�룄 30KB�넂200KB(�뒪�깄�꺑 �겕湲� ����쓳).
- `deriveNotifs` ��� LMS 留덇컧 �돞7�씪 誘몄셿猷� �븣由�(cat '�닔�뾽', 理쒕�� 5嫄�,
  D-day �씪踰�).
- `tests/lms.test.mjs` 21/21.
- Gates all green; both repos synced (parity OK) + built.

IN PROGRESS: nothing.

NEXT:
1. Fresh-session verification: ISSUE-23 �쟾泥�(�닔吏� �뒪�겕由쏀듃쨌寃�利씲톃I쨌
   �븣由셋텮PI �븳�룄) + �씠�쟾 needs-verification �옍�뿬(ISSUE-18, 21, 22,
   ISSUE-20 �뙆�씠�봽�씪�씤).
2. ISSUE-23 �썑�냽 �썑蹂�: 遺곷쭏�겢由� �삎�깭, stale 寃쎄퀬, �떆泥��떆媛�(%) �몴�떆,
   罹섎┛�뜑 蹂묓빀, advisor 寃��깋�뿉 LMS 怨쇰ぉ �룷�븿. �떎�젣 COSMOS 怨꾩젙�쑝濡�
   �닔吏� �뒪�겕由쏀듃 �떎�룞�옉 �솗�씤(needs-human ��� 濡쒓렇�씤 �븘�슂).
3. ISSUE-20 �옍�뿬(移댄깉濡쒓렇 留ㅼ묶쨌鍮� 蹂몃Ц쨌�뿏吏� �뿰�룞) + ISSUE-10.

BLOCKER: unchanged ��� ISSUE-5 (remote D1 + deploy), ISSUE-9 need
human/accounts. COSMOS �떎怨꾩젙 �닔吏� 寃�利앸룄 �궗�슜�옄 濡쒓렇�씤 �븘�슂.

TESTS: tsc clean, oxlint 0 err, lms 21/21, catalog 4/4, school 5/5,
notifs 11/11, search 10/10, dept-rules 40/40, build (both repos),
http-check PASS, account-db PASS, sync --check parity OK.

REPO SCOUT: none needed ��� 釉뚮씪�슦��� �몴以� API留� �궗�슜(�쇅遺� �쓽議댁꽦 �뾾�쓬).

VERIFICATION STATUS: ISSUE-23 (collect script쨌validateLms쨌section UI쨌
notifs �넻�빀쨌profile API 寃�利�/�븳�룄) awaits independent verification;
prior items (ISSUE-18, 21, 22, ISSUE-20) still pending.


---

## 2026-09-18 ��� deploy + GitHub consolidation (user-directed session)

DONE:
- GitHub push �셿猷�: gyeongbin-38/hansung-helper (main source, master),
  gyeongbin-38/hansung-helper-deploy (deploy snapshot, master).
- Deploy repo git history�뿉�꽌 scripts/cloudflared.exe (52MB) �젣嫄� ���
  filter-branch 20 commits �옱�옉�꽦 + force push (GH001 寃쎄퀬 �빐�냼).
- GitHub �젙由�: 鍮� repo gyeongbin-38/- �궘�젣 (size 0, 而ㅻ컠 �뾾�쓬),
  hansung-helper �넂 PUBLIC �쟾�솚 (����썝 collaborator 遺덊븘�슂),
  hansung-helper-deploy private �쑀吏�.
- Cloudflare �봽濡쒕뜒�뀡 諛고룷 �쐟 (BE-6 �셿猷�): wrangler OAuth 濡쒓렇�씤
  (gyeongbinb38@gmail.com, account 49fee188���), �썝寃� D1 site-creator-d1
  �깮�꽦 (27aa326b-5433-4bcb-bc38-1b63bd66f67b, APAC), workers.dev
  �꽌釉뚮룄硫붿씤 gyeongbin-38 �벑濡�, �썙而� hansung-helper 諛고룷 �넂
  https://hansung-helper.gyeongbin-38.workers.dev (踰꾩쟾 02bc60c9).
- �썝寃� D1 留덉씠洹몃젅�씠�뀡 �쟻�슜 (3 �뀒�씠釉�).
- scripts/_deploy.py ��� �옱諛고룷 �뿬�띁: �깮�꽦 wrangler.json�쓽 placeholder
  DB ID + �썙而ㅻ챸�쓣 �떎媛믪쑝濡� �뙣移� �썑 wrangler deploy (留� 鍮뚮뱶 �썑 �븘�닔).
- scripts/_verify_prod.py ��� �씪�씠釉� 寃�利�: /, /lms-collect.js,
  /api/courses|schedule|dept-rules|activities, favicon �쟾遺� 200.
- docs 媛깆떊: team-tasks 怨듭쑀 二쇱냼�넂�봽濡쒕뜒�뀡 URL + B-6 �셿猷� �몴湲�,
  backend-tasks BE-6 �셿猷� �꽮�뀡, AGENTS.md �봽濡쒕뜒�뀡 �꽮�뀡, BACKLOG
  ISSUE-24 吏꾪뻾 湲곕줉.

IN PROGRESS: nothing.

NEXT:
1. �썝寃� �떎怨꾩젙 �쉶�썝媛��엯�넂�봽濡쒗븘 ����옣�넂�옱濡쒓렇�씤 �닔�룞 �솗�씤 (needs-human).
2. COSMOS �떎怨꾩젙 �닔吏� �뒪�겕由쏀듃 �떎�룞�옉 �솗�씤 (G-1, needs-human).
3. Fresh-session verification: ISSUE-23 �쟾泥� + �옍�뿬 (18, 21, 22, 20).
4. ISSUE-24 BE-1 �꽌踰� 痢� COSMOS �닔吏� (����썝 �빖�뱶�삤�봽 吏꾪뻾 �긽�솴 異붿쟻).

BLOCKER: �빐�냼�맖 ��� ISSUE-5/9 (remote D1 + deploy 沅뚰븳) �셿猷�. �옍�뿬
needs-human: �떎怨꾩젙 �봽濡쒕뜒�뀡 �븳 諛뷀�� + COSMOS �닔吏� �떎�룞�옉.

TESTS: 諛고룷 �썑 �씪�씠釉� 寃�利� PASS (_verify_prod.py �쟾泥� 200).
鍮뚮뱶: published-personal npm run build green (lms-collect.js �룷�븿).

REPO SCOUT: none.

VERIFICATION STATUS: �봽濡쒕뜒�뀡 諛고룷 + �썝寃� D1 留덉씠洹몃젅�씠�뀡��� �씪�씠釉�
寃�利앸맖. �떎怨꾩젙 end-to-end (媛��엯�넂����옣�넂�옱濡쒓렇�씤) + COSMOS �닔吏묒��
�궗�엺 �솗�씤 ���湲�. �씠�쟾 needs-verification �빆紐⑸뱾 怨꾨쪟 以�.


---

## 2026-09-18 ��� BE-1 �꽌踰� 痢� COSMOS �닔吏� 援ы쁽 (user-requested)

DONE:
- �궗�슜�옄 �솗�씤: COSMOS �뿰寃곗�� �씠誘� connectSchool�뿉 議댁옱(濡쒓렇�씤 �떆
  �룷�꽭+LMS �꽭�뀡 + 怨쇰ぉ 紐⑸줉 �뙆�떛) ��� BE-1 蹂멸꺽 援ы쁽.
- `lib/server/lms.ts` �떊洹� ��� Workers DOM �뾾�씠 �젙洹쒖떇�쑝濡� dotbugi
  ����젆�꽣 怨꾩빟 �룷�똿: parseAssigns/parseQuizList(generaltable c0~c3),
  hasQuizAttempt(quizattemptsummary), parseProgress(thead �룞�쟻 而щ읆
  + 異쒖꽍�씤�젙 �슂援ъ떆媛� 而щ읆 �젣�쇅 + rowspan/colspan �룊�깂�솕 + �씪愿꾩텧�꽍
  �씤�젙), parseVodRanges(modtype_vod li쨌dimmed �젣�쇅쨌accesshide �젣嫄�),
  collectLms(怨쇰ぉ �닚李� + 24s �삁�궛 + allSettled 遺�遺� �떎�뙣 errors[]).
  normDate�뒗 �뀈�썡�씪/亮닸쐢�뿥 �뼇�떇 紐⑤몢 吏��썝(collector �솗�옣).
- `school.ts`: SchoolSnapshot.lmsData?: LmsSnapshot + connectSchool�씠
  LMS �뿰寃� �꽦怨� �떆 collectLms �샇異�(�떎�뙣�빐�룄 濡쒓렇�씤 �쑀吏�).
- `page.tsx`: accountData() ��� profile怨� snapshot.lmsData 蹂묓빀,
  理쒖떊 fetchedAt �듅�옄 (�닔�룞 媛��졇�삤湲곌�� 理쒖떊�씠硫� �쑀吏�).
- `scripts/cosmos-live.mts` ��� �떎怨꾩젙 �뿰寃� 寃�利� �룄援�(�븰踰�/鍮꾨쾲
  �봽濡ы봽�듃 �넂 connectSchool �떎�뻾 �넂 怨쇰ぉ/�닔吏� �슂�빟 + lms-data.json
  ����옣; gitignore 泥섎━�맖).
- `scripts/_run_tests.py` ��� �쟾泥� �뀒�뒪�듃 留ㅽ듃由��뒪 �윭�꼫.
- �옱諛고룷: hansung-helper f4c193ce �씪�씠釉� (verify_prod �쟾泥� 200).

IN PROGRESS: nothing.

NEXT:
1. �떎怨꾩젙 end-to-end: cosmos-live.mts濡� �떎�젣 �븰踰� 寃�利�(needs-human ���
  �옄寃⑹쬆紐�). ����젆�꽣 遺덉씪移� 諛쒓껄 �떆 �뙆�꽌 蹂댁젙.
2. �봽濡쒕뜒�뀡 �떎怨꾩젙 �븳 諛뷀��(媛��엯�넂����옣�넂�옱濡쒓렇�씤�넂�닔�뾽 �쁽�솴 �옄�룞 梨꾩��).
3. needs-verification: ISSUE-23 + BE-1 + �옍�뿬(18, 21, 22, 20).
4. 濡쒓렇�씤 吏��뿰 愿�李� ��� �닔吏� �삁�궛 24s媛� UX�뿉 二쇰뒗 �쁺�뼢 寃��넗(怨쇰ぉ 留롮쓣
  �븣 ~15-25s). �븘�슂�븯硫� ctx.waitUntil 鍮꾨룞湲� �닔吏� �꽕怨�(BE-2��� �뿰怨�).

BLOCKER: �떎怨꾩젙 寃�利앸쭔 �궓�쓬 ��� credentials�뒗 �궗�슜�옄留� 蹂댁쑀.

TESTS: lms-server 35/35, �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK(_run_tests.py),
tsc clean, oxlint 0 err, root+deploy build green, prod verify PASS.

REPO SCOUT: none.

VERIFICATION STATUS: BE-1 �뙆�꽌�뒗 fixture �뀒�뒪�듃濡� 寃�利앸릱�쑝�굹 �떎�젣
COSMOS �럹�씠吏� ���鍮� 寃�利� 誘몄셿 ��� �떎怨꾩젙 �솗�씤 �쟾源뚯�� needs-verification.


---

## 2026-09-18 ��� 濡쒓렇�씤 吏��뿰 鍮꾨룞湲고솕 + 釉뚮옖�뱶/濡쒕뵫/PWA 媛쒖꽑 (user-requested)

DONE:
- 濡쒓렇�씤 吏��뿰 �빐�냼(BE-2 �꽑�뻾): `connectSchool`�뿉 `deferLms` �샃�뀡 異붽�� ���
  �룷�꽭+LMS �씤利앷퉴吏�留� �룞湲곕줈 �걹�궡怨� �긽�꽭 �닔吏묒�� �겢濡쒖��濡� �씠愿�.
  `login/route.ts`媛� `cloudflare:workers` `waitUntil`濡� �닔吏� �썑
  `json_patch`濡� `snapshot.lmsData` 蹂묓빀 ��� `checkedAt` 媛��뱶濡� 吏��뿰
  �벐湲곌�� �깉 濡쒓렇�씤 �뒪�깄�꺑�쓣 �뜮吏� �븡寃� 諛⑹��. 湲곗〈 �샇異쒖옄�뒗 �룞湲� �닔吏� �쑀吏�.
  `page.tsx`�뒗 `lms==='connected' && !data.lms`�씪 �븣 `/api/account`瑜�
  6s �썑 8s 媛꾧꺽 횞8�쉶 �뤃留�, 理쒖떊 `fetchedAt`留� 諛섏쁺. `lms.tsx`�뿉
  `serverCollecting` "�꽌踰꾩뿉�꽌 �닔吏� 以묒엯�땲�떎���" �긽�깭.
- �뒪耳덈젅�넠 濡쒕뵫: `app/sections/skeleton.tsx` �떊洹�(SkeletonCards/
  SkeletonRows/SkeletonDetail, `<output>` status role + sr-only +
  reduced-motion ����쓳) + globals.css `.sk-*` �봽由щ�명떚釉�. �쟻�슜:
  courses 紐⑸줉/�긽�꽭, activities, calendar 紐⑸줉/�긽�꽭, timetable 怨쇰ぉ
  紐⑸줉 ��� �뀓�뒪�듃 "遺덈윭�삤�뒗 以�" ���泥�, �떎�뙣쨌鍮� �긽�깭�뒗 �쑀吏�.
- 釉뚮옖�뱶 濡쒓퀬 "�븰�궗紐㉲쀫굹移⑤컲": public/logo.svg(洹몃씪�뵒�뼵�듃 ����씪),
  favicon.svg 援먯껜(�뀥�뵆由� �뙆��� �븘�씠肄� �젣嫄�), logo-mark.svg,
  `app/logo.tsx`(`currentColor` 怨듭슜 而댄룷�꼳�듃) ��� �궗�씠�뱶諛붋룸줈洹몄씤
  3怨녹쓽 Lucide GraduationCap ���泥�.
- PWA/OG: manifest.webmanifest(standalone, theme #5645d4, 192/512/
  maskable �븘�씠肄�), apple-touch-icon.png 180, og.png 1200횞630(�꽕�씠鍮�
  諛곌꼍+濡쒓퀬����씪+�븳湲� ����씠�룷, `scripts/_gen_brand_assets.mjs`濡� �깮�꽦 ���
  sharp�뒗 --no-save 濡쒖뺄 �쟾�슜). layout.tsx: metadataBase, icons.apple,
  manifest, appleWebApp, openGraph + `export const viewport`濡�
  theme-color. wrangler dev �떎�꽌鍮숈뿉�꽌 �깭洹� 異쒕젰 �솗�씤(OG/�듃�쐞�꽣 移대뱶
  �옄�룞 梨꾩�� �룷�븿).
- �봽由고듃: globals.css `@media print` ��� �궗�씠�뱶諛�/�긽�떒諛�/怨쇰ぉ 紐⑸줉/異붿쿇
  �뙣�꼸/踰꾪듉瑜� �닲湲곌퀬 �떆媛꾪몴 洹몃━�뱶留� 異쒕젰, 釉붾줉 �깋�긽���
  print-color-adjust濡� 蹂댁〈.
- ISSUE-23 �썑�냽 2嫄�: `staleDays(snap, now)` + �닔吏� 7�씪 寃쎄낵 �떆
  `.lms-stale` 諛곕꼫(�떎�떆 媛��졇�삤湲� 踰꾪듉). advisor �옄�쑀吏덈Ц
  `searchAll`�뿉 LMS �닔媛� 怨쇰ぉ �룷�븿(5踰덉㎏ �씤�옄, �빀�궛 cap 10, route
  'lms', 'COSMOS �닔�뾽 �쁽�솴 쨌 �닔媛� 以�' 遺��젣) + 洹쇨굅 臾멸뎄�뿉 COSMOS �몴湲�.
- ISSUE-21/22 援ы쁽 由щ럭: 肄붾뱶媛� Done �뒪�럺怨� �씪移섑븿 �솗�씤(�뀒�뒪�듃 而ㅻ쾭
  議댁옱) ��� �룆由� 寃�利� �씪踰⑥�� 蹂� �꽭�뀡 �븘�슂濡� �쑀吏�.
- `published-personal` �룞湲고솕 + �룆由� 鍮뚮뱶 green + �궗�슜�옄 �듅�씤 �썑
  `_deploy.py` �옱諛고룷 ��� hansung-helper version 567e6236 �씪�씠釉�,
  �떊洹� �뿉�뀑 15媛� �뾽濡쒕뱶(濡쒓퀬/favicon/manifest/icons/og.png).
  `_verify_prod.py` �쟾泥� 200 + �씪�씠釉� HTML�뿉 OG/theme-color/manifest/
  apple-touch �깭洹� 異쒕젰 �솗�씤.

IN PROGRESS: nothing.

NEXT:
1. �떎怨꾩젙 end-to-end: cosmos-live.mts �떎�븰踰� 寃�利� + �봽濡쒕뜒�뀡
   媛��엯�넂�옱濡쒓렇�씤�넂waitUntil �닔吏� �룄李� 愿�李�(needs-human).
2. �옍�뿬: ISSUE-20 yearTable�넂議몄뾽�뿏吏� �뿰�룞, ISSUE-6 ruleset �꽑�깮+
   in-progress, BE-3 怨듦컻 �뒪�깄�꺑 D1 �씠愿�, �븣由� �뙣�꼸/�넗�뒪�듃 �걧 �벑
   �뵒�옄�씤 �뒪�럺 짠13 �빆紐�.

BLOCKER: �떎怨꾩젙 寃�利�(credentials)��� �궗�슜�옄 �쁺�뿭.

TESTS: �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK(_run_tests.py ��� school deferLms �뀒�뒪�듃
�룷�븿 6/6, search 14/14, lms 25/25), tsc clean, oxlint 0 err,
root+published-personal build green, 濡쒖뺄 dev �떎�꽌鍮� 硫뷀���깭洹� �솗�씤.

REPO SCOUT: none.

VERIFICATION STATUS: deferLms�뒗 mocked fetch �뀒�뒪�듃濡� 寃�利� ���
waitUntil �떎�룞�옉��� �봽濡쒕뜒�뀡/�떎怨꾩젙�뿉�꽌 誘멸��利�. �뒪耳덈젅�넠쨌PWA쨌�봽由고듃�뒗
鍮뚮뱶+�떎�꽌鍮� �솗�씤. ISSUE-21/22�뒗 援ы쁽 由щ럭+湲곗〈 �뀒�뒪�듃 �솗�씤 �닔以� ���
independent verification �씪踰⑥�� fresh session �븘�슂.

---

## 2026-09-19 ��� �떎怨꾩젙 �봽濡쒕뜒�뀡 寃�利� + 蹂묐젹 �닔吏� 踰꾧렇 �닔�젙 (user-requested)

DONE:
- �떎怨꾩젙(�븰踰� 25��™�™��37) end-to-end 寃�利� �셿猷� ��� 濡쒖뺄 Node connectSchool
  18s �닔吏� �꽦怨�(vod 45/55, 怨쇱젣 7, ��댁쫰 4), �봽濡쒕뜒�뀡 waitUntil 寃쎈줈
  lmsData �룄李� �솗�씤(�쓳�떟 5.1s �넂 �닔吏� �셿猷� ~31s, �뤃留곸쑝濡� �듅寃�).
- �봽濡쒕뜒�뀡 �닔吏� 0嫄� 踰꾧렇 �닔�젙: 媛숈�� Moodle �꽭�뀡�쑝濡쒖쓽 蹂묐젹 �슂泥�
  (Promise.allSettled 횞4/怨쇰ぉ)�씠 由щ떎�씠�젆�듃/鍮� �럹�씠吏�瑜� �쑀諛� ���
  PHP �꽭�뀡 �씫 吏곷젹�솕 �듅�꽦. `collectLms`瑜� 怨쇰ぉ �궡 �셿�쟾 吏곷젹�솕濡� 蹂�寃�
  + ��댁쫰 �긽�꽭�룄 吏곷젹. �옱諛고룷 �썑 vod 55쨌怨쇱젣 7쨌��댁쫰 4濡� 濡쒖뺄怨� �젙�솗�엳
  �씪移�(errors �쟾遺� 鍮꾩뼱�엳�쓬).
- `collectLms` `html()` �뿬�띁媛� �쓳�떟�쓣 寃�利�: 鍮�-200�씠嫄곕굹
  /login/logout.php 留덉빱 �뾾�쑝硫� [lms] fetch 濡쒓렇+throw �넂 �꽭�뀡 留뚮즺/
  由щ떎�씠�젆�듃瑜� 鍮� 寃곌낵濡� �궪�궎吏� �븡怨� errors[]濡� �몴硫댄솕. fetchVods�뒗
  紐⑤뱺 URL �슂泥� �떎�뙣 �떆 throw(=vod �삤瑜�), �몴 �뾾�뒗 �젙�긽 �럹�씠吏��뒗
  鍮� 寃곌낵 �쑀吏�濡� 援щ텇.
- COLLECT_BUDGET_MS 24000�넂60000 (吏곷젹�솕濡� �닔吏� �떆媛� 利앷�� ����쓳 ���
  waitUntil �궡�씪 �쓳�떟 吏��뿰怨� 臾닿��).
- �엫�떆 [lms] 濡쒓퉭 �젙由�: 濡쒓렇�씤 �꽦怨� 寃쎈줈 濡쒓렇 �젣嫄�, �떎�뙣 吏꾨떒留� �쑀吏�
  (connect failed + fetch 鍮꾩젙�긽 ��� �긽�깭/�샇�뒪�듃留�, 媛쒖씤�젙蹂� �뾾�쓬).
- tests/lms-server.test.mjs +4: fixture�뿉 logout 留덉빱 異붽��, �꽭�뀡 留뚮즺
  �넂errors �몴硫댄솕, �몴 �뾾�쓬�넂�젙�긽 鍮� 寃곌낵 �쉶洹� 而ㅻ쾭 (40/40).
- �썝寃� D1 議고쉶 �뿬�띁 scripts/_d1q.mjs ��� wrangler 吏곸젒 spawn�쑝濡�
  Windows �씤�슜 臾몄젣 �슦�쉶(荑쇰━ 寃곌낵 JSON 諛섑솚).
- �옱諛고룷: version 27d739a4 �씪�씠釉�.

IN PROGRESS: nothing.

NEXT:
1. �옍�뿬: ISSUE-20 yearTable�넂議몄뾽�뿏吏� �뿰�룞, ISSUE-6 ruleset �꽑�깮+
   in-progress, BE-3 怨듦컻 �뒪�깄�꺑 D1 �씠愿�, �븣由� �뙣�꼸/�넗�뒪�듃 �걧 �벑
   �뵒�옄�씤 �뒪�럺 짠13 �빆紐�.
2. �떎瑜� 怨꾩젙�뿉�꽌�룄 �룞�씪 �닔吏� 寃쎈줈媛� �룞�옉�븯�뒗吏� 愿�李�(異붽�� �떎怨꾩젙 諛쒖깮 �떆).

BLOCKER: none ��� �떎怨꾩젙 寃�利� �셿猷�.

TESTS: tsc clean, oxlint 0 err, school 6/6, lms-server 40/40,
root+published-personal build green, �봽濡쒕뜒�뀡 �떎怨꾩젙 e2e PASS
(45/55 vod = 濡쒖뺄怨� �룞�씪).

REPO SCOUT: none.

VERIFICATION STATUS: waitUntil 鍮꾨룞湲� �닔吏� + 吏곷젹�솕 �닔吏묒씠 �봽濡쒕뜒�뀡
�떎怨꾩젙�뿉�꽌 寃�利앸맖. ISSUE-21/22�뒗 �뿬�쟾�엳 fresh-session �룆由� 寃�利� �븘�슂.

---

## 2026-09-19 ��� LMS �떎�뜲�씠�꽣 �솢�슜 + �븣由� �뙣�꼸 (user-requested �옄�쑉)

DONE:
- �솃 "�씠踰� 二� �닔�뾽" �쐞�젽(home.tsx): `dueSoon(data.lms, now, 7)` �긽�쐞 4嫄댁쓣
  D-day 移� + COSMOS �뵦留곹겕濡� �몴�떆. 留덇컧 �뾾�쑝硫� 誘몄셿猷� 嫄댁닔 �븞�궡,
  `pendingTasks` 0�씠硫� �꽮�뀡 誘몃젋�뜑. �븯�떒 "�븰�뒿 �씪�젙" 移대뱶�룄 LMS �뜲�씠�꽣
  �쑀臾� 遺꾧린濡� 媛깆떊(誘몄닔吏� �븞�궡臾� �젣嫄�).
- 罹섎┛�뜑 "�닔�뾽 留덇컧" 蹂묓빀(calendar.tsx): `dueSoon(lms, now, 14)` 理쒕��
  8嫄댁쓣 怨듭떇 �씪�젙 �븘�옒 �닔�뾽 移댄뀒怨좊━濡� �몴�떆 ��� COSMOS �닔吏묒씪쨌怨쇰ぉ쨌kind
  蹂묎린, data.lms �뾾�쑝硫� 誘몃젋�뜑.
- �븣由� �뒳�씪�씠�뱶�삤踰�(spec 짠8): 踰� �겢由��씠 �럹�씠吏� �씠�룞 ����떊 �슦痢�
  `<dialog>` �뙣�꼸 ��� 遺꾨쪟 移� �븘�꽣(aria-pressed), �씫吏� �븡�쓬 移댁슫�듃,
  紐⑤몢 �씫�쓬, �빆紐� �씠�룞 �떆 �뙣�꼸 �떕�옒, Esc/�뒪�겕由� �떕湲�, �쟾泥� �븣由쇳븿 留곹겕.
  Topbar�뿉 `onBell` prop 異붽��, page.tsx媛� notifItems瑜� �븳 踰덈쭔 �룄異쒗빐
  諛곗��쨌�뙣�꼸�씠 怨듭쑀. `.notif-panel` CSS ��� `<dialog>` UA �뒪����씪 由ъ뀑 +
  異뺤냼 �븷�땲硫붿씠�뀡(reduced-motion ����쓳).
- `NotifRow`濡� �븣由� �뻾 留덊겕�뾽 怨듭슜�솕(�븣由쇳븿 �럹�씠吏�쨌�뙣�꼸 �룞�씪 �궗�슜).
- �옱諛고룷: version d5f85822 �씪�씠釉�.

IN PROGRESS: nothing.

NEXT:
1. �옍�뿬: ISSUE-20 yearTable�넂議몄뾽�뿏吏�, ISSUE-6, BE-3 D1 �씠愿�,
   �넗�뒪�듃 �걧, �닔媛� 怨쇰ぉ�넂�떆媛꾪몴 �뿰�룞, �뿉�윭 �옱�떆�룄 �몴以��솕 �벑
   (�궗�슜�옄 由ъ뒪�듃�뾽 臾몄꽌�쓽 A/B/C/D �빆紐�).
2. needs-verification �걧�뒗 fresh-session �룆由� 寃�利� �븘�슂.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK
(lms-server 40/40, search 14/14, notifs 11/11), root+deploy 鍮뚮뱶 green.

REPO SCOUT: none.

VERIFICATION STATUS: �떊洹� UI 3嫄댁�� 鍮뚮뱶+����엯+由고듃 �닔以� ��� �떎湲곌린
�떆媛� �솗�씤��� 誘몄닔�뻾. 湲곗〈 寃�利� �씪踰� �긽�깭 遺덈��.

---

## 2026-09-19 ��� �뿉�윭 �옱�떆�룄 �몴以��솕 + �넗�뒪�듃 �걧 + 二쇱감蹂� 吏꾨룄 (user-requested �옄�쑉)

DONE:
- C15 API �떎�뙣 �옱�떆�룄 �몴以��솕(spec 짠13): catalog.ts 4媛� �썒
  (useCatalog/useActivities/useSchedule/useDeptRules)�뿉 retry() 異붽�� ���
  �떎�뙣 �떆 紐⑤뱢 罹먯떆�뒗 loader媛� 鍮꾩슦誘�濡� �옱�샇異�=�떎�젣 �옱�슂泥�, tick �긽�깭濡�
  effect �옱�떎�뻾, unmount 媛��뱶 �쑀吏�. skeleton.tsx�뿉 怨듭슜 `RetryButton`
  ("�떎�떆 �떆�룄" link 踰꾪듉) 異붽��. 諛곗꽑: courses(�긽�꽭+�뿤�뱶), timetable
  (�뿤�뱶+紐⑸줉), activities(empty-small�뿉 hsportal 留곹겕��� 蹂묎린),
  calendar(紐⑸줉+�긽�꽭 2怨�). advisor �뀓�뒪�듃 �떟蹂�쨌graduation�쓽 deptRules
  ����땳(graceful)��� �몴�떆 ����긽 �븘�떂 ��� �쁽�뻾 �쑀吏�.
- C14 �넗�뒪�듃 �걧(spec 짠8): chrome.tsx�뿉 `useToasts` �썒 + `ToastStack`
  而댄룷�꼳�듃. �룞�씪 臾멸뎄 �뫖�떆�뒗 蹂묓빀(횞N 諛곗��, ����씠癒� �옱�떆�옉 ��� v 踰꾩쟾 �궎濡�
  ����씠癒� 援먯껜), �룞�떆 �몴�떆 理쒓렐 3媛�(slice -TOAST_MAX), �빆紐⑸퀎 5珥� �옄�룞
  �떕�옒+媛쒕퀎 �떕湲�. `.toast`瑜� `.toast-stack` 怨좎젙 而⑦뀒�씠�꼫�쓽 �뵆�젆�뒪
  �븘�씠�뀥�쑝濡� 蹂�寃�, 紐⑤컮�씪쨌print 洹쒖튃 �룞湲고솕. push(msg) �떆洹몃땲泥섎씪
  湲곗〈 notify=setToast �샇異쒖쿂 臾대��寃�.
- A4 LMS 二쇱감蹂� vod 吏꾨룄(lms.tsx): lib/data/lms.ts�뿉 `weekProgress(c)`
  異붽�� ��� vod.week 洹몃９�솕(誘멸린�옱 �빆紐� �젣�쇅, 二쇱감瑜� 吏��뼱�궡吏� �븡�쓬),
  二쇱감 �삤由꾩감�닚, done/total + 泥� �빆紐� range. 怨쇰ぉ 移대뱶 details �븞�뿉
  `.lms-weeks` 洹몃━�뱶 ��� 二쇱감쨌遺꾩닔쨌誘몃땲 progress-track쨌湲곌컙 異뺤빟
  (MM-DD ~ MM-DD), �셿猷� 二쇱감�뒗 mint �떞�듃. week �뾾�뒗 怨쇰ぉ��� 誘몃젋�뜑.
- �옱諛고룷: version 097ac9ad �씪�씠釉�, _verify_prod �쟾 �뿏�뱶�룷�씤�듃 200.

IN PROGRESS: nothing.

NEXT:
1. �옍�뿬: ISSUE-20 yearTable�넂議몄뾽�뿏吏�, ISSUE-6, BE-3 D1 �씠愿�,
   �닔媛� 怨쇰ぉ�넂�떆媛꾪몴 �뿰�룞(A3), LMS 遺�遺꾩닔吏� �옱�떆�룄 UX, �궗�씠�뱶諛� 異뺤빟,
   �꽕�젙 �솕硫�/�젒洹쇱꽦 �빆紐� �벑.
2. needs-verification �걧�뒗 fresh-session �룆由� 寃�利� �븘�슂.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK
(lms 31/31 ��� weekProgress +6嫄�), root+deploy 鍮뚮뱶 green.

REPO SCOUT: none.

VERIFICATION STATUS: �떊洹� UI 3嫄댁�� 鍮뚮뱶+����엯+由고듃+�떒�쐞�뀒�뒪�듃 �닔以� ���
�떎湲곌린 �떆媛� �솗�씤 誘몄닔�뻾. 湲곗〈 寃�利� �씪踰� �긽�깭 遺덈��.

---

## 2026-09-19 ��� �뒪耳��씪 媛먯궗 + BE-3 怨듦컻 �뒪�깄�꺑 D1 �씠愿� (user-requested, 1000+ �궗�슜�옄 �쟾�젣)

DONE:
- 怨꾩젙 �씤�봽�씪 蹂댁븞/�뒪耳��씪 媛먯궗 ��� 肄붾뱶 由щ럭濡� �솗�씤�맂 湲곗〈 諛⑹뼱:
  `__Host-` 荑좏궎(Secure/HttpOnly/SameSite=Lax), �꽭�뀡 �넗�겙 SHA-256 �빐�떆
  ����옣쨌24h 留뚮즺쨌濡쒓렇�븘�썐 �떆 �꽌踰� �궘�젣, 紐⑤뱺 蹂�寃� �슂泥��뿉
  Origin+JSON content-type CSRF 寃��궗, 濡쒓렇�씤 �젅�씠�듃由щ컠 �씠以묓솕
  (IP 20�쉶쨌怨꾩젙 3�쉶/15遺�, �빐�떆 �궎), 紐⑤뱺 怨꾩젙 �쓳�떟 no-store/private
  +Vary:Cookie, �봽濡쒗븘 PUT 200KB 罹�+�븘�뱶蹂� �뾼寃� 寃�利�, 鍮꾨��踰덊샇
  誘몄���옣쨌�궗�슜 �썑 利됱떆 �룓湲�, �븰踰� �빐�떆+留덉뒪�궧. 怨듦컻 API 4醫낆뿉
  max-age=300 罹먯떆 �뿤�뜑 �씠誘� 議댁옱. �닔�젙 �븘�슂 �궗�빆 �뾾�쓬 �뙋�젙.
- BE-3 援ы쁽 ��� 怨듦컻 �뒪�깄�꺑(courses/activities/schedule/dept-rules)�쓣
  D1 `public_snapshots(kind,part,payload,fetched_at,updated_at)`濡� �씠愿�:
  - `lib/server/snapshots.ts` `snapshotGet(kind, bundled, bundledAt)` ���
    D1 �뻾�씠 踰덈뱾蹂대떎 �깉濡�嫄곕굹 媛숈쑝硫� D1 �럹�씠濡쒕뱶瑜� �썝臾� �꽌鍮�, �븘�땲硫�
    踰덈뱾 JSON �뤃諛�. D1 誘몃컮�씤�뵫/�삤瑜�/源⑥쭊 �럹�씠濡쒕뱶�룄 踰덈뱾 �뤃諛�.
    �븘�씠�넄�젅�씠�듃 �궡 60珥� 罹먯떆濡� D1 �씫湲� 理쒖냼�솕.
  - D1 臾몄옣 �겕湲� �젣�븳(SQLITE_TOOBIG, 213KB �떒�씪 INSERT �떎�뙣) ����쓳:
    �럹�씠濡쒕뱶瑜� 60K�옄 part 泥��겕濡� 遺꾪븷 ����옣, �씫湲� �떆 ORDER BY part濡�
    �옱議곕┰. gzip ���鍮� SQL濡� �궡�슜 吏곸젒 議고쉶 媛��뒫�븳 �옣�젏.
  - `scripts/_publish_snapshots.mjs` ��� 4媛� JSON �삎�떇 寃�利�(�븘�닔 �궎) �썑
    DROP/CREATE + DELETE+INSERT瑜� `--file`濡� remote D1�뿉 寃뚯떆.
    **�겕濡ㅻ윭�넂寃뚯떆留뚯쑝濡� �옱諛고룷 �뾾�씠 �뜲�씠�꽣 媛깆떊** 寃쎈줈 �솗蹂�.
  - 4媛� �씪�슦�듃瑜� snapshotGet �샇異쒕줈 �쟾�솚, �뿤�뜑 �룞�씪(max-age=300).
  - drizzle/0001_public_snapshots.sql �뒪�궎留� 湲곕줉(寃뚯떆 �뒪�겕由쏀듃媛�
    DROP/CREATE�븯誘�濡� �닔�룞 �쟻�슜 遺덊븘�슂), AGENTS.md �슫�쁺 臾몄꽌 媛깆떊.
- �옱諛고룷: version 627c5e1a �씪�씠釉�. remote D1�뿉 courses 4part �벑
  7�뻾 寃뚯떆 �솗�씤(_d1q.mjs), _verify_prod �쟾 �뿏�뱶�룷�씤�듃 200 ���
  �쓳�떟 諛붿씠�듃媛� �뙆�씪 �썝蹂멸낵 �씪移�(踰덈뱾��� compact �옱吏곷젹�솕�씪 �빟媛� �옉�븯�쓬).

IN PROGRESS: nothing.

NEXT:
1. �옍�뿬: ISSUE-20 yearTable�넂議몄뾽�뿏吏�, ISSUE-6, A3 �닔媛� 怨쇰ぉ�넂�떆媛꾪몴
   �뿰�룞, LMS 遺�遺꾩닔吏� �옱�떆�룄 UX, �궗�씠�뱶諛� 異뺤빟, �꽕�젙 �솕硫�/�젒洹쇱꽦.
2. �뒪�깄�꺑 �옄�룞 媛깆떊(�겕濡�)��� Worker�넂�븰援� �룄�떖�꽦 寃�利앹씠 �꽑�뻾 �븘�슂 ���
   hsportal/hansung.ac.kr�씠 CF IP瑜� �뿀�슜�븯�뒗吏� 誘명솗�씤.
3. needs-verification �걧�뒗 fresh-session �룆由� 寃�利� �븘�슂.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err(44�뙆�씪), root+deploy 鍮뚮뱶 green,
_verify_prod 200 �쟾泥�, remote D1 寃뚯떆쨌議고쉶 �떎痢� �솗�씤.

REPO SCOUT: none.

VERIFICATION STATUS: D1 寃쎈줈�뒗 �뻾 議댁옱+fetched_at 鍮꾧탳 濡쒖쭅+�쓳�떟
諛붿씠�듃 �씪移섎줈 �솗�씤(�럹�씠濡쒕뱶 �룞�씪 �떆 寃쎈줈 援щ텇 遺덇�� ��� 肄붾뱶 寃쎈줈�긽
D1 �슦�꽑 �솗�떎). �떎�궗�슜 �듃�옒�뵿 �븯�쓽 罹먯떆 �룞�옉��� 誘멸��痢�.

---

## 2026-09-19 ��� A3 COSMOS �닔媛� 怨쇰ぉ �넂 �떆媛꾪몴 �뿰�룞 (user-requested)

DONE:
- `lib/data/lms.ts` `matchEnrollment(lms, catalog)` + `EnrolledMatch`
  ����엯 異붽��. normTitle �젙洹쒗솕(愿꾪샇/���愿꾪샇 �옣�떇쨌�븰湲� �씪踰㉱룰났諛� �젣嫄�,
  �냼臾몄옄)濡� 移댄깉濡쒓렇 怨쇰ぉ紐� �씤�뜳�뒪 援ъ꽦 ��� fuzzy/異붿젙 留ㅼ묶 �뾾�씠
  寃곗젙濡좎쟻, �룞紐� 怨쇰ぉ��� 遺꾨컲 �쟾泥대�� sections[]濡� 諛섑솚(�엫�쓽 遺꾨컲
  諛곗젙 �븞 �븿), 留ㅼ묶 �뾾�쑝硫� 鍮� 諛곗뿴(誘몃ℓ移� �쑀吏�, 吏��뼱�궡吏� �븡�쓬).
- `app/sections/timetable.tsx` `EnrolledStrip` ��� builder �뿤�뱶 �븘�옒
  `<details>` �뒪�듃由�. �슂�빟 "COSMOS �닔媛� N怨쇰ぉ 쨌 �떆媛꾪몴 諛섏쁺 M媛�",
  怨쇰ぉ蹂� �긽�깭: 留ㅼ묶 �뾾�쓬(移댄깉濡쒓렇�뿉 �뾾�뒗 怨쇰ぉ) / �씠誘� 怨꾪쉷�뿉 �엳�쓬
  (badge green) / 誘몃컲�쁺("遺꾨컲 N媛� 蹂닿린" �넂 移댄깉濡쒓렇 �젙�떇紐낆쑝濡�
  setQ �븘�꽣). �닔吏� �떆�젏 �뒪�깄�꺑�엫�쓣 紐낆떆�븯�뒗 meta 臾멸뎄 �룷�븿.
- `learning.css` `.enrolled*` �뒪����씪 異붽��.
- tests/lms.test.mjs +4 (35/35): �젙�솗 留ㅼ묶쨌�옣�떇 �젣嫄걔룸�몃ℓ移� 鍮� 諛곗뿴쨌
  �쟾 怨쇰ぉ 諛섑솚 �닚�꽌.
- �옱諛고룷: version 7a77b266 �씪�씠釉�, _verify_prod �쟾 �뿏�뱶�룷�씤�듃 200.

IN PROGRESS: nothing.

NEXT:
1. �옍�뿬: ISSUE-20 yearTable�넂議몄뾽�뿏吏�, ISSUE-6, LMS 遺�遺꾩닔吏� �옱�떆�룄
   UX, �궗�씠�뱶諛� 異뺤빟, �꽕�젙 �솕硫�/�젒洹쇱꽦 �빆紐� �벑.
2. �뒪�깄�꺑 �옄�룞 媛깆떊(�겕濡�)��� Worker�넂�븰援� �룄�떖�꽦 寃�利� �꽑�뻾 �븘�슂.
3. needs-verification �걧�뒗 fresh-session �룆由� 寃�利� �븘�슂.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK
(lms 38/38 ��� matchEnrollment +7嫄�), root+deploy 鍮뚮뱶 green,
_verify_prod 200 �쟾泥�.

REPO SCOUT: none.

VERIFICATION STATUS: �떎怨꾩젙 Playwright e2e濡� �솗�씤 �셿猷� ���
�뒪�듃由� �젋�뜑(7怨쇰ぉ), �븣怨좊━利� 7쨌�꽑�삎����닔 1쨌癒몄떊�윭�떇 4遺꾨컲 留ㅼ묶,
"遺꾨컲 蹂닿린" �겢由� �떆 寃��깋�뼱=移댄깉濡쒓렇 �젙�떇紐끒룻븰怨� �븘�꽣=�쟾泥대줈
珥덇린�솕�릺�뼱 遺꾨컲 紐⑸줉 �몴�떆. 誘몃ℓ移� 4怨쇰ぉ��� "移댄깉濡쒓렇�뿉 �뾾�뒗
怨쇰ぉ"�쑝濡� �젙吏� �몴�떆(�씤瑜섎Ц紐낃낵吏�援ы솚寃승룸뜲�씠�꽣�넻�떊쨌鍮낅뜲�씠�꽣湲곗큹쨌
而ㅻ�ㅻ땲�떚 ��� 2026-2 移댄깉濡쒓렇�뿉 �빐�떦 紐낆묶 �뾾�쓬).

POST-DEPLOY FIXES (媛숈�� �궇 �썑�냽):
- 諛고룷 �늻�씫 諛쒓껄쨌�닔�젙: `_deploy.py`�뒗 鍮뚮뱶 �뾾�씠 湲곗〈 dist瑜�
  諛고룷�븿 ��� `_build_pub.py` 誘몄떎�뻾�쑝濡� A3 肄붾뱶 �뾾�뒗 踰덈뱾�씠
  �씪�씠釉뚮릱�떎媛� �옱鍮뚮뱶쨌�옱諛고룷濡� �닔�젙. **援먰썕: 諛고룷 �쟾
  _build_pub.py �븘�닔 ��� dist/client 踰덈뱾�뿉 �떊洹� 臾몄옄�뿴 grep�쑝濡�
  �솗�씤 �뒿愿��솕.**
- �떎�뜲�씠�꽣濡� 留ㅼ묶 濡쒖쭅 �닔�젙: �떎�젣 Moodle fullname �삎�떇���
  "援먭낵(�삤�봽�씪�씤) �븰遺� 怨쇰ぉ紐�[遺꾨컲] 援먯닔紐�" ��� 珥덇린 exact-match�뒗
  �쟾遺� 誘몃ℓ移�. `lmsKey`媛� 移댄뀒怨좊━ �넗�겙(援먭낵/鍮꾧탳怨�/而ㅻ�ㅻ땲�떚/
  �븰遺�/����븰�썝/����븰/�쟾怨�/援먯뼇, 怨듬갚 援щ텇, JS `\b`�뒗 �븳湲��뿉
  臾댄슚�씪 怨듬갚 寃쎄퀎 �궗�슜)쨌遺꾨컲 愿꾪샇瑜� �젣嫄고븯怨�, 移댄깉濡쒓렇
  怨쇰ぉ紐낆쓽 �젒�몢�뼱 留ㅼ묶(理쒖옣 �씠由� �슦�꽑 ��� �옄猷뚭뎄議곕컦�떎�뒿 vs
  �옄猷뚭뎄議� 紐⑦샇 �빐�냼)�쑝濡� �쟾�솚.
- "遺꾨컲 蹂닿린" 肄쒕갚�씠 �븰怨� �븘�꽣瑜� '�쟾泥�'濡� �옱�꽕�젙 ��� 湲곕낯媛�
  "�궡 �븰怨� �쐞二�"媛� 紐⑸줉�쓣 �떎�젣 �젣�븳�븯誘�濡� ��� �븰怨� 遺꾨컲�씠
  媛��젮吏��뒗 臾몄젣 諛⑹��.
- 愿�李�: 吏㏃�� 媛꾧꺽 諛섎났 濡쒓렇�씤 �떆 "肄붿뒪紐⑥뒪 議고쉶 �떎�뙣" 諛쒖깮 ���
  Moodle 痢� �뿰寃� �떎�뙣濡� 異붿젙, �떎�뙣 �긽�깭 UI쨌�옱濡쒓렇�씤 �븞�궡�뒗
  �젙�긽 �룞�옉 �솗�씤.

---

## 2026-09-19 ��� LMS �닔吏� �긽�깭쨌�떎�뙣 蹂듦뎄쨌媛깆떊 諛섏쁺 (user-audited priority)

DONE:
- **�닔吏� �긽�깭 留덉빱**: `SchoolSnapshot`�뿉 `lmsPending`(吏��뿰 �닔吏� 吏꾪뻾)/
  `lmsFailedAt`(�떎�뙣 �떆媛�) 異붽��. 濡쒓렇�씤쨌�옱�닔吏� �씪�슦�듃媛� ����옣 吏곸쟾
  `lmsPending=true` �꽕�젙 �넂 吏��뿰 �닔吏� �꽦怨� �떆 `json_patch`濡�
  `lmsData` 湲곕줉+`lmsPending:null` �빐�젣, �떎�뙣 �떆 `lmsFailedAt` 湲곕줉
  + �떎�뙣 濡쒓렇. `checkedAt` 媛��뱶 �쑀吏� ��� �씠�쟾 waitUntil �벐湲곌�� �깉
  �뒪�깄�꺑�쓣 �뜮吏� �븡�쓬. 鍮꾩���뿰 寃쎈줈(connectSchool �룞湲� �닔吏�) �떎�뙣�룄
  `lmsFailedAt` 湲곕줉.
- **臾댄븳 "�닔吏� 以�" �닔�젙**: �씠�쟾�뿏 吏��뿰 �닔吏� �떎�뙣瑜� �븘臾닿쾬�룄 湲곕줉�븯吏�
  �븡�븘 `lms='connected'`+lmsData �뾾�쓬�씠 �쁺援� 吏��냽�릱�쓬. �씠�젣 �떎�뙣
  留덉빱濡� 醫낅즺 �긽�깭 �몴�쁽 ��� �겢�씪�씠�뼵�듃 �뤃留곸�� `lmsPending` 湲곗���쑝濡�
  �떆�옉�븯怨� �꽦怨돠룹떎�뙣 紐⑤몢�뿉�꽌 醫낅즺. 留덉빱 �룄�엯 �쟾 �뒪�깄�꺑(connected�씤�뜲
  lmsData쨌pending �뾾�쓬)�룄 �떎�뙣濡� 遺꾨쪟. �닔吏� �삁�궛+5遺� 珥덇낵 pending���
  �썙而� 以묐룄 醫낅즺濡� 媛꾩＜�빐 �꽭�뀡 �궡�뿉�꽌�룄 �떎�뙣 �쟾�솚(����씠癒� �긽�깭).
- **媛깆떊 諛섏쁺 �닔�젙**: �뤃留곸씠 `!data.lms` 議곌굔�씠�씪 湲곗〈 �뜲�씠�꽣媛� �엳�쑝硫�
  �깉 �닔吏� 寃곌낵瑜� 紐� 諛쏅뜕 臾몄젣 ��� `snapshot.lmsData`瑜� �빆�긽 理쒖떊
  fetchedAt 湲곗���쑝濡� `data.lms`�뿉 蹂묓빀�븯�뒗 蹂꾨룄 �씠�럺�듃濡� 遺꾨━.
  濡쒓렇�씤 �쓳�떟쨌吏��뿰 �셿猷뙿룹옱�닔吏� 寃곌낵 紐⑤몢 媛숈�� 寃쎈줈濡� 諛섏쁺.
- **�옱�닔吏� 寃쎈줈(BE-2 1李�)**: `POST /api/account/lms-refresh` ��� �꽭�뀡
  �씤利� �썑 �엯�젰 �븰踰� �빐�떆媛� 怨꾩젙 id��� �씪移섑빐�빞 �븿(����씤 怨꾩젙 遺덇��),
  `refresh:` 3�쉶/15遺� �젅�씠�듃由щ컠, `connectSchool` �옱�떎�뻾�쑝濡� �꽌踰�
  �닔吏�. 鍮꾨��踰덊샇�뒗 寃�利� �썑 利됱떆 �룓湲걔룸�몄���옣. �깉 �닔吏� �떎�뙣 �떆 �씠�쟾
  lmsData 蹂댁〈(濡쒓렇�씤 �씪�슦�듃�룄 �룞�씪). UI `RefreshForm` ��� �닔�뾽 �쁽�솴
  �꽮�뀡�뿉�꽌 �븰踰�+鍮꾨��踰덊샇 �옱�엯�젰�쑝濡� �옱�닔吏�, 留덉뒪�궧 �븰踰� �엺�듃 �몴�떆.
- **��댁쫰 誘몄쓳�떆 �삤�씤 �닔�젙**: �긽�꽭 �럹�씠吏� fetch �떎�뙣媛� `submitted:false`
  濡� �떒�젙�릺�뜕 寃� �넂 `uncertain:true`+`errors:['quiz-check']`濡� �몴�쁽.
  `LmsTask`/`LmsPending`�뿉 `uncertain` �븘�뱶, `pendingTasks` �쟾�떖,
  `validateLms` 蹂댁〈, UI "�쓳�떆 �뿬遺� �솗�씤 �떎�뙣" �씪踰�. 釉뚮씪�슦��� �닔吏묎린
  (public/lms-collect.js)�룄 �룞�씪 �쓽誘몃줈 �닔�젙.
- **`dueSoon` 怨쇨굅 �븯�븳**: 湲곗〈 �긽�븳留� �엳�뼱 �삤�옒 吏��궃 誘몄셿猷뚭�� 理쒖떊
  留덇컧�쓣 諛��뼱�깉�쓬 �넂 `pastDays=7` �븯�븳 異붽��(留덇컧 吏��궓 �몴�떆�뒗 �쑀吏��븯�릺
  7�씪 �씠�긽 吏��궃 �빆紐� �젣�쇅). �솃쨌罹섎┛�뜑쨌�븣由� �룄異� 紐⑤몢 �룞�씪 �쟻�슜.
- **UI �긽�깭 援щ텇**: �닔�뾽 �쁽�솴 鍮� �긽�깭媛� �닔吏� 以�/�닔吏� �떎�뙣/COSMOS �뿰寃�
  �떎�뙣瑜� 援щ텇�빐 �몴�떆, snap �엳�쑝硫� 諛곕꼫濡� �몴�쁽. "�떎�떆 媛��졇�삤湲�" 踰꾪듉�씠
  �떎��� �뙆�씪 �뾽濡쒕뱶����뜕 寃� �넂 "�뙆�씪濡� 媛��졇�삤湲�"濡� �젙�젙 + �꽌踰� �옱�닔吏묒��
  蹂꾨룄 RefreshForm. `c.errors` 肄붾뱶 �븳湲� �씪踰⑦솕(vod�넂媛뺤쓽 �벑). �궗�씠�뱶諛�
  (chrome.tsx)쨌�꽕�젙(settings.tsx) �뿰寃� �긽�깭媛� pending/failed/�뜲�씠�꽣
  �쑀臾대�� 援щ텇 �몴�떆 ��� settings 珥덈줉 諛곗���뒗 lmsData �엳怨� �떎�뙣 �뾾�쓣 �븣留�.
- 臾몄꽌 �젙�빀: backend-tasks.md�쓽 BE-1(寃�利� �셿猷� �몴湲�)쨌BE-2(�옱�씤利� 諛⑹떇
  援ы쁽)쨌BE-3(�셿猷�) 媛깆떊, �븘�궎�뀓泥� �궗�떎�쓽 LMS �닔吏뫢룰났媛� �뒪�깄�꺑 �꽕紐낆쓣
  �쁽�옱 援ы쁽(D1 �슦�꽑+�뤃諛�, �꽌踰� �닔吏�+留덉빱)�쑝濡� �젙�젙. BACKLOG.md
  ISSUE-24 吏꾪뻾 �긽�솴 媛깆떊.

IN PROGRESS: nothing.

NEXT:
1. npm audit high 10쨌low 1 ��� react-server-dom-webpack�씠 吏곸젒 �쓽議댁꽦,
   GHSA-wx67-qw84-cm4g 踰붿쐞�씪 諛고룷 寃쎈줈 �쁺�뼢 �솗�씤 �썑 �샇�솚 �뙣移�.
2. EnrolledStrip�뿉�꽌 留ㅼ묶 遺꾨컲�쓣 諛붾줈 怨꾪쉷�뿉 �떞�뒗 �븸�뀡(�쁽�옱�뒗 �븘�꽣留�).
3. 議몄뾽: �떊猶고븷 �븰怨쇄넄ruleset 留ㅽ븨 癒쇱��, 寃�利앸맂 �븰怨쇰���꽣 �뿏吏� �뿰寃�.
   yearTable��� 19媛� 以� 1媛쒕퓧(dept null�씠�씪 �쁽�옱 留ㅼ묶 �젣�쇅) ��� �쟾 �븰怨�
   �솗��� 湲덉��, �솗�씤 �븘�슂 �쑀吏�.
4. LMS 怨쇱젣쨌��댁쫰쨌留덇컧 寃��깋(advisor), �븣由� �삁�빟.
5. �닔吏� �떎�뙣�쑉 愿�痢�(�쁽�옱 console.log留�), �뒪�깄�꺑 �겕濡�(Worker�넂�븰援�
   �룄�떖�꽦 寃�利� �꽑�뻾).

BLOCKER: none.

TESTS: �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK ��� lms.test 46/46(+8: dueSoon 怨쇨굅
�븯�븳쨌uncertain �쟾�떖), lms-server.test 47/47(+7: ��댁쫰 �긽�꽭 �떎�뙣�넂
uncertain/quiz-check, 紐⑸줉 �떎�뙣�넂quiz). tsc clean, oxlint 0 err,
root+deploy 鍮뚮뱶 green.

REPO SCOUT: none.

VERIFICATION STATUS: �떒�쐞 �뀒�뒪�듃濡� 留덉빱쨌uncertain쨌dueSoon �븯�븳 �솗�씤.
�떎怨꾩젙 e2e濡� �옱�닔吏� �뤌쨌�떎�뙣 �긽�깭 �젋�뜑�뒗 誘멸��利�(諛고룷�뒗 �맖 ���
�떎�뙣 �긽�깭�뒗 �떎�젣 �옣�븷 �떆�뿉留� �옄�뿰 諛쒖깮). �씪�씠釉� version e645c64f,
_verify_prod �쟾 �뿏�뱶�룷�씤�듃 200.

---

## 2026-09-19 ��� 痍⑥빟�젏 媛먯궗쨌�뙣移� (ISSUE-10, user-audited priority 2)

DONE:
- `npm audit` �옱�떎�뻾: high 10쨌low 1 �솗�씤(�씠�쟾 湲곕줉 "�쟾遺� 鍮뚮뱶 �룄援�"
  ��� 遺��젙�솗 ��� `react-server-dom-webpack`��� 吏곸젒 �쓽議댁꽦+諛고룷 踰덈뱾
  �룷�븿�씠�씪 諛고룷 寃쎈줈 �빐�떦. GHSA-wx67-qw84-cm4g Server Functions
  DoS; �빋�뿉 'use server'�뒗 �뾾�쓬).
- 寃쎈줈蹂� �쁺�뼢 遺꾨쪟: 諛고룷 寃쎈줈 = react-server-dom-webpack留�.
  dev/build 寃쎈줈 = vite(dev server), esbuild(dev on Windows),
  miniflare+undici+ws+sharp(濡쒖뺄 �뿉裕щ젅�씠�뀡), image-size(vinext
  鍮뚮뱶 �뙆�떛), wrangler(諛고룷 �룄援�).
- �닔�룞 �샇�솚 踰뷀봽(audit fix --force �븘�떂, peer �젣�빟 異붿쟻):
  react/react-dom/react-server-dom-webpack 19.2.6�넂19.3.0,
  vinext 1.0.0-beta.5�넂beta.10(peer @vitejs/plugin-rsc ^0.5.34 �넂
  0.5.35濡� �룞諛�), vite 8.0.13�넂8.3.0,
  @cloudflare/vite-plugin 1.37.1�넂1.56.0(peer wrangler ^4.135.0 �넂
  4.135.0濡� �룞諛�, 洹� peerOptional @cloudflare/workers-types
  5.20260919.1濡� �룞諛�), @types/react(-dom) 19.3.0.
- 寃곌낵: `npm audit` **0 vulnerabilities**, install �뼇履� �꽦怨�.

IN PROGRESS: nothing.

NEXT:
1. EnrolledStrip 留ㅼ묶 遺꾨컲 吏곸젒 �떞湲�.
2. 議몄뾽 ruleset 留ㅽ븨 �넂 寃�利� �븰怨쇰쭔 �뿏吏� �뿰寃�.
3. LMS 怨쇱젣쨌留덇컧 寃��깋(advisor), �븣由� �삁�빟.
4. �굹癒몄��: �닔吏� �떎�뙣�쑉 愿�痢�, �뒪�깄�꺑 �겕濡�(�룄�떖�꽦 寃�利� �꽑�뻾),
   �궗�씠�뱶諛� 異뺤빟, �젒洹쇱꽦 �꽕�젙, needs-verification �걧.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK
(lms 46/46, lms-server 47/47), root 鍮뚮뱶 green, deploy 鍮뚮뱶 green,
_verify_prod �쟾 �뿏�뱶�룷�씤�듃 200. �씪�씠釉� version ec3280d1 ��� �깉 �댋泥댁씤
(vinext beta.10 + react 19.3 + vite 8.3 + cf-vite-plugin 1.56 +
wrangler 4.135)�쑝濡� �봽濡쒕뜒�뀡 �룞�옉 �솗�씤.

REPO SCOUT: none.

VERIFICATION STATUS: �깉 �댋泥댁씤�쑝濡� 鍮뚮뱶쨌�뀒�뒪�듃쨌諛고룷쨌怨듦컻 �뿏�뱶�룷�씤�듃
寃�利� �셿猷�. RSC �젋�뜑 寃쎈줈(react 19.3)�쓽 �떎怨꾩젙 釉뚮씪�슦��� e2e�뒗
誘몄닔�뻾 ��� �떎�쓬 �떆媛� 寃�利� �씪�슫�뱶�뿉�꽌 �솗�씤 沅뚯옣.

---

## 2026-09-19 ��� EnrolledStrip 遺꾨컲 吏곸젒 �떞湲� (user-audited priority 3)

DONE:
- `tryAdd`瑜� boolean 諛섑솚�쑝濡� 蹂�寃� ��� �꽦怨� �떆�뿉留� 遺꾨컲 �꽑�깮 紐⑸줉�쓣
  �떕�룄濡�(異⑸룎쨌以묐났쨌�씠�닔 �떎�뙣 �떆 �꽑�깮吏� �쑀吏�).
- `EnrolledStrip`�뿉 `onAdd` prop + 遺꾨컲 �꽑�깮 UI: 遺꾨컲 1媛� 怨쇰ぉ���
  "�떞湲�" 利됱떆 異붽��, �떎遺꾨컲 怨쇰ぉ��� "�떞湲�" �넗湲�濡� 遺꾨컲 紐⑸줉
  (遺꾨컲쨌援먯닔쨌�떆媛�) �몴�떆 �썑 �꽑�깮 異붽�� ��� 異⑸룎 寃��궗쨌�씠�닔 寃��궗쨌
  �룞�씪 怨쇰ぉ 以묐났 寃��궗�뒗 湲곗〈 tryAdd 寃쎈줈 洹몃��濡�(notify濡� �떎�뙣
  �썝�씤 �몴�떆). "遺꾨컲 N媛� 蹂닿린" �븘�꽣 寃쎈줈�룄 �쑀吏�.
- `.enrolled-item/.enrolled-actions/.enrolled-pick` �뒪����씪 異붽�� ���
  �뻾 �궡遺�瑜� item(row+�꽑�깮吏�) 援ъ“濡� �옱援ъ꽦.

IN PROGRESS: nothing.

NEXT:
1. 議몄뾽 ruleset 留ㅽ븨 �넂 寃�利� �븰怨쇰쭔 �뿏吏� �뿰寃�(yearTable 1媛쒕퓧,
   dept null ��� �쟾 �븰怨� �솗��� 湲덉��).
2. LMS 怨쇱젣쨌留덇컧 寃��깋(advisor), �븣由� �삁�빟.
3. �굹癒몄��: �닔吏� �떎�뙣�쑉 愿�痢�, �뒪�깄�꺑 �겕濡�, �궗�씠�뱶諛� 異뺤빟,
   �젒洹쇱꽦, needs-verification �걧.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK,
root+deploy 鍮뚮뱶 green, _verify_prod �쟾 �뿏�뱶�룷�씤�듃 200.
�씪�씠釉� version 82a2ceda.

REPO SCOUT: none.

VERIFICATION STATUS: 肄붾뱶쨌鍮뚮뱶쨌諛고룷 寃�利�. �떞湲� 踰꾪듉쨌遺꾨컲 �꽑�깮
紐⑸줉�쓽 �떎怨꾩젙 釉뚮씪�슦��� �솗�씤��� 誘몄닔�뻾 ��� react 19.3 �젋�뜑��� �븿猿�
�떎�쓬 e2e �씪�슫�뱶�뿉�꽌 �솗�씤 沅뚯옣.

---

## 2026-09-19 ��� 議몄뾽 ruleset 留ㅽ븨 �젙洹쒗솕 + 寃�利� �븰怨� �뿏吏� �뿰寃� (user-audited priority 4)

DONE:
- **留ㅽ븨 寃�利�(議곗궗)**: 19 rulesets 以� yearTable��� 而댄벂�꽣怨듯븰遺�(CSE) 1媛쒕퓧,
  `dept: null`�씠�뜕 �썝�씤��� 移댄깉濡쒓렇 媛쒖꽕 �떒�쐞紐� 李⑥씠. �엯�븰泥� 紐⑥쭛�슂媛빧�
  CSE �궗�씠�듃쨌移댄깉濡쒓렇 援먯감 �솗�씤�쑝濡� 寃�利�: 而댄벂�꽣怨듯븰遺� =
  {IT�쓳�슜�떆�뒪�뀥怨듯븰怨�(K191, 怨듯넻 援먭낵), 紐⑤컮�씪�냼�봽�듃�썾�뼱�듃�옓(V021),
  鍮낅뜲�씠�꽣�듃�옓(V022)}. �궛�븰�삊�젰 �봽濡쒖젥�듃 媛곸＜�쓽 怨쇰ぉ紐낆씠 移댄깉濡쒓렇 �듃�옓
  媛쒖꽕怨� �씪移섑빐 留ㅽ븨 �솗�떎. �쎒怨듯븰쨌�뵒吏��꽭肄섑뀗痢좉���긽�쁽�떎 �듃�옓��� 2026-2
  移댄깉濡쒓렇�뿉 媛쒖꽕 �떒�쐞媛� �뾾�뼱 誘몃벑濡�.
- **`lib/data/dept-rules.ts`**:
  - `RULESET_DEPT_FAMILY` ��� �닔吏� �븰怨쇰챸�넄移댄깉濡쒓렇 �븰怨� �닔�룞 寃�利� 留ㅽ븨
    (寃�利앸맂 寃껊쭔 �벑濡�, �쁽�옱 而댄벂�꽣怨듯븰遺� 1嫄�).
  - `rulesetMatchesDept(r, userDept, pool)` ��� �몺�닔吏� �빐�꽍 dept �룷�븿
    �몼deptLabel �젙洹쒗솕 �씪移� �몾寃�利� �뙣諛�由�(�떒�씪 �솗�젙 ����뿉�꽌留� ��� 紐⑦샇�븳
    candidates ����뿉�뒗 洹쒖젙�쓣 遺숈씠吏� �븡�쓬). �뼱�뒓 履쎈룄 �븘�땲硫� 留ㅼ묶 �븞 �븿.
  - `deptRuleTargets(ruleset, admitYear)` ��� yearTable �븰踰� 而щ읆 �빐�꽍:
    '痍⑤뱷/�씠�닔/議몄뾽 �븰�젏' �뻾�뿉�꽌 援먭낵 �븰�젏�넂total, 鍮꾧탳怨� Npt�넂points
    ('140�븰�젏' 踰좎뼱 �삎�깭�룄 珥� 痍⑤뱷 �븰�젏�쑝濡� �빐�꽍). �굹癒몄�� V/�닽�옄 ������
    `conditions[]`(�썝臾� �씪踰�+���, 沅뚯옣 �몴湲� 媛먯��)濡� �썝臾� 蹂댁〈 ��� �옄�룞
    吏묎퀎�븯吏� �븡�쓬. 而щ읆 �뾾�쑝硫� null(異붿륫 湲덉��).
- **`lib/data/graduation.ts`**: `evaluate` opts�뿉 `deptTargets` 異붽�� ���
  �슦�꽑�닚�쐞 �궗�슜�옄 override > �븰怨� 洹쒖젙 > �쟾�뿭 湲곗��. `RuleResult.
  requiredSource`('override'|'dept'|'global')濡� required 異쒖쿂 異붿쟻.
  �븰怨� 湲곗���씠 �엳�쑝硫� pre-2016 �븰踰덈룄 怨듭떇媛� �솗�젙 媛��뒫(而댄벂�꽣怨듯븰遺�
  ~15�븰踰� 珥� 140�븰�젏).
- **`app/sections/graduation.tsx`**: myRules瑜� rulesetMatchesDept濡�
  援먯껜(而댄벂�꽣怨듯븰遺� �엯�젰쨌�듃�옓 �븰怨� �엯�젰쨌IT�쓳�슜�떆�뒪�뀥怨듯븰怨� �엯�젰 紐⑤몢
  CSE 洹쒖젙怨� �뿰寃�). deptTargets �넂 evaluate �뿰寃�. �븰踰� 而щ읆 �몴 �븯�씠�씪�씠�듃
  (.my-col), "�궡 �븰踰� 湲곗��" 議곌굔 泥댄겕由ъ뒪�듃(�븘�닔/沅뚯옣 諛곗�� + �옄�룞 吏묎퀎
  �븞 �븿 怨좎��), �엯�븰�뿰�룄 誘몄엯�젰/而щ읆 遺��옱 �븞�궡. requiredSource=dept�씪 �븣
  移대뱶 �끂�듃쨌�긽�꽭 異쒖쿂瑜� �븰怨� 洹쒖젙�몴(而щ읆 �씪踰㉱룹썝臾� 留곹겕쨌�닔吏묒씪)濡� �몴�떆,
  �씤�듃濡쒖뿉 "�궡 �븰怨� 洹쒖젙�몴 諛섏쁺" 諛곗��.
- **`progress.css`**: `.dept-conds` 泥댄겕由ъ뒪�듃쨌`.my-col` �뒪����씪.
- 誘멸��利� �븰怨쇰뒗 �뿬�쟾�엳 �뿏吏� 誘몄뿰寃� ��� yearTable�씠 �엳�뒗 ruleset留� �씠
  寃쎈줈瑜� �깂�떎. �굹癒몄�� 18媛쒕뒗 �썝臾� �몴�떆留�(湲곗〈 �룞�옉).

IN PROGRESS: nothing.

NEXT:
1. LMS 怨쇱젣쨌留덇컧 寃��깋(advisor), �븣由� �삁�빟.
2. �굹癒몄��: �닔吏� �떎�뙣�쑉 愿�痢�, �뒪�깄�꺑 �겕濡�(�룄�떖�꽦 寃�利� �꽑�뻾),
   �궗�씠�뱶諛� 異뺤빟, �젒洹쇱꽦 �꽕�젙, needs-verification �걧.
3. �닔吏� 怨듬갚(Design 鍮� 蹂몃Ц, SclScn 留곹겕 �뾾�쓬)��� �겕濡ㅻ윭 媛쒖꽑 怨쇱젣濡�.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK
(dept-rules 61/61 ��� 留ㅼ묶 7 + targets 11 �떊洹�, graduation 10/10 ��� 
deptTargets 4 �떊洹�), root+deploy 鍮뚮뱶 green, _verify_prod �쟾 �뿏�뱶�룷�씤�듃
200. �씪�씠釉� version 22e2a286.

REPO SCOUT: none.

VERIFICATION STATUS: �뿏吏� �빐�꽍쨌留ㅼ묶��� �떒�쐞 �뀒�뒪�듃濡� 寃�利�. �떎怨꾩젙
釉뚮씪�슦����뿉�꽌 而댄벂�꽣怨듯븰遺� �봽濡쒗븘濡� 洹쒖젙 移대뱶쨌�븰踰� 而щ읆 �븯�씠�씪�씠�듃쨌
議곌굔 泥댄겕由ъ뒪�듃 �젋�뜑 �솗�씤��� 誘몄닔�뻾 ��� �떎�쓬 e2e �씪�슫�뱶 沅뚯옣.

---

## 2026-09-19 ��� 肄붾뱶 媛먯궗 湲곕컲 媛쒖꽑 �씪�슫�뱶 (�궗�슜�옄 �슂泥� "媛쒖꽑�젏 �뜑 李얠븘遊�")

DONE:
- **�뜲�씠�꽣 �젙�솗�룄**:
  - `dept.ts`: `CANDIDATE_ALIASES` 異붽�� ��� '而댄벂�꽣怨듯븰遺�'(怨듭떇 �븰遺�紐�, 移댄깉濡쒓렇
    媛쒖꽕 �떒�쐞 �븘�떂) �엯�젰 �떆 寃�利� �뙣諛�由� {IT�쓳�슜�떆�뒪�뀥怨듯븰怨�, 紐⑤컮�씪�냼�봽�듃�썾�뼱
    �듃�옓, 鍮낅뜲�씠�꽣�듃�옓}瑜� candidates濡� 諛섑솚. �씠�쟾�뿏 �븰怨� �븘�꽣쨌異붿쿇�씠 臾대젰�솕.
  - `dept-rules.ts`: CREDIT_ROW瑜� '議몄뾽 �븰�젏/痍⑤뱷 �븰�젏' �뻾�쑝濡� �븳�젙('�쟾怨� �씠�닔
    �븰�젏' �뻾�씠 total濡� �삤�엯�릺�뒗 �옞�옱 踰꾧렇 李⑤떒), NO_REQ�뿉 '�빐�떦�뾾�쓬/�뾾�쓬'
    異붽��, `deptRuleTargets`媛� `columnIndex` 吏곸젒 諛섑솚(�씪踰� �옱寃��깋 �젣嫄�).
  - `graduation.ts`: �씠�닔 �셿猷� 肄붾뱶�뒗 planned 吏묎퀎�뿉�꽌 �젣�쇅 ��� �씠�닔 紐⑸줉�뿉
    �삷寃⑤룄 怨꾪쉷�뿉 �궓�븘�엳�쑝硫� earned+planned �씠以� 吏묎퀎�릺�뜕 踰꾧렇 �닔�젙.
- **�씪愿��꽦**:
  - `planBlockReason` 怨듯넻 媛��뱶濡� �떞湲� 寃�利� �넻�빀 ��� courses/timetable/
    search 3怨녹쓽 以묐났 寃��궗 �젣嫄�, 寃��깋 寃곌낵 '�떞湲�'�룄 異⑸룎쨌以묐났쨌�씠�닔 寃��궗 +
    �넗�뒪�듃(�씠�쟾�뿏 plan() 吏곹뻾).
  - `uncertain`(�쓳�떆 �솗�씤 �떎�뙣) 留덉빱 �늻�씫 3怨� 異붽�� ��� lms DueSoonList,
    home 留덇컧 �쐞�젽, calendar �닔�뾽 留덇컧.
  - ERROR_LABELS�뿉 'timeout' �넂 '�닔吏� �떆媛� 珥덇낵' �븳湲��솕.
  - �븣由쇳븿 �럹�씠吏� 遺꾨쪟 諛곗��瑜� �떎�젣 �븘�꽣 踰꾪듉�쑝濡�(�뙣�꼸怨� �룞�씪), �꽑�깮 遺꾨쪟
    鍮� �긽�깭 臾멸뎄 遺꾧린. �븣由� id�뿉 dueTs �젒誘�(�룞紐� 二쇱감蹂� ��댁쫰 異⑸룎 諛⑹��),
    吏��궃 留덇컧 '留덇컧 吏��궓' �씪踰�.
  - `myRules`瑜� richness( yearTable>lines>attachment ) 理쒖꽑 留ㅼ묶�쑝濡� ���
    媛숈�� �븰怨� 泥⑤���쟾�슜 �럹�씠吏�媛� 蹂몃Ц 洹쒖젙�쓣 媛�由щ뜕 臾몄젣.
  - `/api/dept-rules` 濡쒕뱶 �떎�뙣 �떆 洹쒖젙 移대뱶媛� 議곗슜�엳 �궗�씪吏��뜕 寃� �넂
    �떎�뙣 �몴�떆 + �옱�떆�룄 踰꾪듉.
- **�냼洹쒕え**: vite.config JSON import �냽�꽦 異붽��, recommend 猷⑦봽 �궡
  plannedDays/dayLoad �옱怨꾩궛 �샇�씠�뒪�듃, login/profile/lms-refresh �씪�슦�듃
  JSON 鍮꾧컼泥� �엯�젰 400 媛��뱶 蹂닿컯, data.ts lms-collect 二쇱꽍 �젙�젙.

IN PROGRESS: nothing.

NEXT:
1. LMS 怨쇱젣쨌留덇컧 寃��깋(advisor), �븣由� �삁�빟, �닔媛뺤쨷 �긽�깭 ��� 湲곕뒫 媛� �썑蹂�.
2. �떎怨꾩젙 釉뚮씪�슦��� e2e: 寃��깋 �떞湲� 李⑤떒 �넗�뒪�듃, �븣由� 遺꾨쪟 �븘�꽣,
   臾몄퐯�삎 �븰怨� 洹쒖젙 移대뱶, 而댄벂�꽣怨듯븰遺� �엯�젰 �떆 �븰怨� �썑蹂� �몴�떆.
3. �굹癒몄�� 18媛� 洹쒖젙 yearTable 而ㅻ쾭由ъ��(�겕濡ㅻ윭 媛쒖꽑).

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK
(dept-rules 66/66 ��� columnIndex쨌NO_REQ쨌�꽭遺� �븰�젏�뻾 5 �떊洹�,
graduation 11/11 ��� 怨꾪쉷 以묐났吏묎퀎 1 �떊洹�, ux-utils 26/26 ���
而댄벂�꽣怨듯븰遺� �뙣諛�由� 2 �떊洹�), root+deploy 鍮뚮뱶 green, 踰덈뱾 �떊洹� 肄붾뱶
留덉빱 �솗�씤 �썑 諛고룷, _verify_prod �쟾 �뿏�뱶�룷�씤�듃 200.
�씪�씠釉� version 903d603c.

REPO SCOUT: none.

VERIFICATION STATUS: �떒�쐞 �뀒�뒪�듃쨌鍮뚮뱶쨌諛고룷 寃�利� �셿猷�. UI �룞�옉
(�븘�꽣 踰꾪듉, �넗�뒪�듃, �븯�씠�씪�씠�듃)�쓽 �떎怨꾩젙 釉뚮씪�슦��� �솗�씤��� 誘몄닔�뻾.

---

## 2026-09-19 ��� LMS 怨쇱젣쨌留덇컧 寃��깋 + advisor �씠踰� 二� 留덇컧 (媛먯궗 �썑�냽)

DONE:
- **`lib/data/search.ts`**: `lmsTaskSearch()` �떊洹� ��� LMS 媛쒕퀎
  �빆紐�(媛뺤쓽쨌怨쇱젣쨌��댁쫰)�쓣 �옄�쑀吏덈Ц�뿉�꽌 寃��깋. 醫낅쪟�뼱 �븘�꽣
  (怨쇱젣/�닕�젣, ��댁쫰/履쎌���떆�뿕, 媛뺤쓽/�룞�쁺�긽/vod/�닔�뾽), �넗�겙 �걹 吏덈Ц
  �뼱誘맞룹“�궗 �젣嫄�('�븣怨좊━利섏��'�넂'�븣怨좊━利�', '�뼵�젣源뚯��'�넂drop, 1�옄 �옍�뿬�뒗
  怨쇰룄 �젅�떒�쑝濡� 蹂닿퀬 �썝�삎 �쑀吏�), 留덇컧 �쓽�룄�뼱(留덇컧/�뜲�뱶�씪�씤/湲고븳/�젣異�)
  = 醫낅쪟 臾닿�� �쟾 �빆紐�. 誘몄셿猷뚢넂留덇컧(踰붿쐞硫� �걹)�닚 �젙�젹, �긽�깭�뒗
  �셿猷�/誘몄셿猷�/�쓳�떆 �뿬遺� �솗�씤 �떎�뙣濡� 援щ텇 �몴湲�. 寃곌낵�뒗 `lms/{id}` �뵦留곹겕.
- **`searchAll`**: LMS 釉붾줉�쓣 媛쒕퀎 �빆紐�(cap 10) �넂 怨쇰ぉ �젣紐�(cap 12)
  �닚�쑝濡� �솗�옣. 怨쇰ぉ hit�룄 `lms/{id}`濡�.
- **`lms.tsx`**: `LmsSection`�뿉 `detail` prop ��� CourseCard�뿉
  `id="lms-c-{id}"` + forceOpen, useEffect濡� scrollIntoView.
- **`search.tsx`**: 湲�濡쒕쾶 寃��깋�뿉 '�닔�뾽 �쁽�솴' 洹몃９ 異붽��(怨쇱젣쨌��댁쫰쨌
  媛뺤쓽 �빆紐� + 怨쇰ぉ, cap 8) ��� �씠�쟾�뿏 LMS瑜� �븘�삁 寃��깋�븯吏� �븡�븯�쓬.
- **`advisor.tsx`**: "�씠踰� 二쇱뿉 萸� �빐�빞 �빐?" 移� ��� `dueSoon`(7�씪)�쑝濡�
  留덇컧 �슂�빟 + uncertain ��댁쫰�뒗 COSMOS 吏곸젒 �솗�씤 �븞�궡, �닔吏묒씪 湲곗��
  紐낆떆. 鍮� 寃곌낵 臾멸뎄�뿉 �닔�뾽 �빆紐� �룷�븿, placeholder�뿉 �삁�떆 異붽��.
- **`lms.ts`**: `parseDue` export(寃��깋 �젙�젹�뿉�꽌 �옱�궗�슜).
- **`page.tsx`**: LmsSection�뿉 detail 諛곗꽑.

IN PROGRESS: nothing.

NEXT:
1. �떎怨꾩젙 e2e: '�븣怨좊━利� 怨쇱젣 �뼵�젣源뚯��' �넂 task hit �넂 lms/{id} 移대뱶
   �렯移㉱룹뒪�겕濡�, advisor 二쇨컙 留덇컧 移�.
2. �븣由� �삁�빟(�뫖�떆 �씤�봽�씪 �븘�슂), �닔媛뺤쨷 �긽�깭(LMS�뿉 �븰�젏쨌肄붾뱶 �뾾�뼱
   �젣紐� 留ㅼ묶留뚯쑝濡쒕뒗 遺��젙�솗 ��� 蹂대쪟 �쑀吏�), �굹癒몄�� 18媛� 洹쒖젙 �닔吏�.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK
(search 26/26 ��� task 寃��깋 12 �떊洹�: 醫낅쪟 �븘�꽣쨌吏덈Ц �뼱誘맞룸쭏媛� �쓽�룄쨌
珥덉꽦쨌�젙�젹쨌uncertain쨌�닚�닔 吏덈Ц�뼱 臾대ℓ移�), root+deploy 鍮뚮뱶 green,
踰덈뱾 留덉빱 �솗�씤, _verify_prod �쟾 �뿏�뱶�룷�씤�듃 200.
�씪�씠釉� version 38e0db29.

REPO SCOUT: none.

VERIFICATION STATUS: 留ㅼ묶 濡쒖쭅��� �떒�쐞 �뀒�뒪�듃濡� 寃�利�. �뵦留곹겕
�렯移㉱룹뒪�겕濡ㅺ낵 advisor 移⑹쓽 �떎怨꾩젙 釉뚮씪�슦��� �솗�씤��� 誘몄닔�뻾.

---

## 2026-09-20 ��� �궓��� �썑蹂� �씪愿� 泥섎━ (�닔媛뺤쨷 諛곗�� + 洹쒖젙 �씠誘몄�� + �븣由� �삁�빟 + e2e)

DONE:
- **�닔媛뺤쨷 �긽�깭(�몴�떆 �쟾�슜)**: `lms.ts`�뿉 `enrolledSectionIds()` 異붽��
  (matchEnrollment �넂 移댄깉濡쒓렇 遺꾨컲 id 吏묓빀). courses 紐⑸줉쨌�긽�꽭 移대뱶�뿉
  '�닔媛� 以�' 諛곗�� + �댋�똻(�씠由� 留ㅼ묶 湲곕컲, 怨듭떇 �솗�씤��� �븰援� �떆�뒪�뀥).
  graduation�뿉 '�쁽�옱 �닔媛� 以�' �젙蹂� �뒪�듃由� ��� COSMOS �뒪�깄�꺑 異쒖쿂쨌�씠由�
  留ㅼ묶 �븳怨꽷룹「�뾽 �븰�젏 誘몃컲�쁺 紐낆떆. �븰�젏 吏묎퀎�뿉�뒗 �씪�젅 誘몃컲�쁺.
- **洹쒖젙 而ㅻ쾭由ъ��(�씠誘몄�� 寃뚯떆)**: Design 3媛쑣룹뿭�궗臾명솕�걧�젅�씠�뀡쨌�뿭�궗肄섑뀗痢�
  �듃�옓 �벑 洹쒖젙�씠 蹂몃Ц �씠誘몄��濡쒕쭔 寃뚯떆�맂 �럹�씠吏�瑜� �닔吏묓븯�룄濡� 媛쒖꽑.
  `dept-rules.ts`�뿉 `extractContentImage()` ��� `_contentBuilder` �븘�떚�겢
  �슦�꽑 �뒪罹�(�뾾�쑝硫� contentsEditHtml~body), footer_logo/諛곕꼫/�븘�씠肄� �벑
  �끂�씠利� �븘�꽣, �긽���寃쎈줈 �젅����솕 + alt 蹂댁〈. `isRulesetAnomalous`媛�
  image瑜� 泥⑤����� �룞�씪�븯寃� �젙�긽 媛꾩＜. `DeptRuleset.image` ����엯 異붽��.
  �겕濡ㅻ윭 �옱�떎�뻾 �넂 ruleset 19�넂24媛�(Design 3 + �뿭�궗 �듃�옓 2 �떊洹� �닔吏�).
  graduation.tsx�뿉 �씠誘몄�� 洹쒖젙 移대뱶(怨듭떇 �씠誘몄�� �씤�씪�씤 + �썝臾� 留곹겕),
  洹쒖젙 �씤�뜳�뒪�뿉 '�씠誘몄�� 怨듦컻' 諛곗��, richness �젏�닔�뿉 image 諛섏쁺.
  `.rules-image` �뒪����씪.
  - 議곗궗 寃곌낵: SclScn��� �궗�씠�듃留듭뿉 議몄뾽 留곹겕 �옄泥닿�� �뾾�쓬(�븰援� 痢� 怨듬갚),
    臾댁슜 �쟾怨� 1以� 洹쒖젙��� �떎�젣 �젙�떇 臾멸뎄(�뙆�꽌 �젙�긽), Design 3媛� �듃�옓
    �럹�씠吏��뒗 �븰援먭�� �룞�씪�븳 �뙣�뀡留덉���똿 �씠誘몄��瑜� 寃뚯떆(�썝蹂� �뜲�씠�꽣 �삤瑜� ���
    �닔吏묐맂 �씠誘몄��+�썝臾� 留곹겕濡� 洹몃��濡� �몴�떆�븯�뒗 寃껋씠 �젙吏곹븳 泥섎━).
- **釉뚮씪�슦��� 留덇컧 �븣由�(�뫖�떆 �뾾�씠 媛��뒫�븳 踰붿쐞)**: `notifs.ts`�뿉
  `reminderTargets()` ��� 誘몃옒 LMS 留덇컧�쓣 24h �쟾쨌�떦�씪�뿉 �슱由щ뒗 �삁�빟 ����긽
  �룄異�(罹섎┛�뜑 �궇吏� 湲곗�� �삤�뒛/�궡�씪/D-n �씪踰�, uncertain �몴湲�, �븣由쇳븿 id
  �삎�떇 怨듭쑀). page.tsx�뿉 �삁�빟 �씠�럺�듃 ��� notifEnabled + granted + lms媛�
  �엳�쓣 �븣 setTimeout �삁�빟, 諛쒖넚遺꾩�� data.notifiedIds�뿉 湲곕줉(理쒓렐 200
  �쑀吏�)�빐 以묐났 諛쒖넚 諛⑹��. dataRef濡� ����씠癒� �븞�뿉�꽌�룄 理쒖떊 data �젒洹�.
  notifications.tsx�뿉 '留덇컧 釉뚮씪�슦��� �븣由�' �꽕�젙 釉붾줉 ��� opt-in �넗湲�,
  requestPermission �뿰寃�, 誘몄���썝/李⑤떒 �긽�깭 �븞�궡, '�빋(�꺆)�씠 �뿴�젮 �엳�쓣
  �븣留� �슱由� ��� 諛깃렇�씪�슫�뱶 �뫖�떆 誘몄���썝' �븳怨� 紐낆떆. Data�뿉 notifiedIds쨌
  notifEnabled 異붽��(�뜲紐� 蹂듭썝 媛��뱶 �룷�븿).
- **e2e(�뜲紐� 紐⑤뱶, Playwright)**: localStorage �떆�뱶(而댄벂�꽣怨듯븰遺�+�븣怨�
  由ъ쬁/癒몄떊�윭�떇 LMS) �썑 14�빆紐� 寃�利� �쟾遺� �넻怨� ��� �닔媛� 以� 諛곗��, 湲�濡쒕쾶
  寃��깋 �닔�뾽 �쁽�솴 洹몃９+怨쇱젣 �빆紐�, lms/c1 �뵦留곹겕 �옄�룞 �렯移㉱룹뒪�겕濡�,
  advisor '�씠踰� 二쇱뿉 萸� �빐�빞 �빐?' 留덇컧 �쓳�떟, 議몄뾽 �쁽�옱 �닔媛� 以� �뒪�듃由�,
  CSE �븰踰덊몴 移대뱶, �씠誘몄�� 怨듦컻 諛곗��, �븣由� �꽕�젙 �몴�떆, LMS �븣由� �빆紐�,
  opt-in �넗湲�, �븳怨� 怨좎�� 臾멸뎄. (headless�뒗 Notification.permission�씠
  denied 怨좎젙�씠�씪 granted shim�쑝濡� 寃�利� ��� �떎�젣 釉뚮씪�슦��� 沅뚰븳 �쓲由꾩��
  �빋 肄붾뱶 寃쎈줈��� �룞�씪)

IN PROGRESS: nothing.

NEXT:
- �뾾�쓬(�궗�슜�옄 吏��젙 �썑蹂� �쟾遺� 泥섎━). �옍�뿬 �겙 怨쇱젣: 諛깃렇�씪�슫�뱶 �뫖�떆
  (VAPID+�꽌鍮꾩뒪�썙而�+援щ룆 ����옣 �씤�봽�씪 �븘�슂), SclScn 議몄뾽�슂嫄댁�� �븰援�
  �궗�씠�듃 怨듬갚�쑝濡� �닔吏� 遺덇��.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK
(dept-rules 74/74 ��� �씠誘몄�� 異붿텧쨌�끂�씠利� �븘�꽣쨌article �뒪肄뷀봽 8 �떊洹�,
notifs 20/20 ��� reminderTargets 9 �떊洹�, lms 48/48 ��� enrolledSectionIds
�룷�븿), root+deploy 鍮뚮뱶 green, 踰덈뱾 留덉빱 5醫� �솗�씤, _verify_prod �쟾
�뿏�뱶�룷�씤�듃 200, /api/dept-rules �씪�씠釉� 24媛쑣룹씠誘몄�� 6嫄� �솗�씤.
e2e 14/14. �씪�씠釉� version 46543064.

REPO SCOUT: none.

VERIFICATION STATUS: �떒�쐞 �뀒�뒪�듃쨌鍮뚮뱶쨌諛고룷쨌�뜲紐� e2e �셿猷�. �떎怨꾩젙
釉뚮씪�슦��� �솗�씤��� �뜲紐⑤줈 ���泥�(濡쒓렇�씤 寃쎈줈留� 誘멸��利�). 釉뚮씪�슦��� �븣由쇱쓽
�떎�젣 OS �븣由� 諛쒖넚��� headless�씪 �떆媛� �솗�씤 遺덇�� ��� �삁�빟쨌�넗湲�쨌�븳怨� 怨좎��
濡쒖쭅留� 寃�利앸맖.

---

## 2026-09-20 ��� LMS �젣異쑣룹쓳�떆 �쁽�솴 + 媛뺤쓽 紐곗븘�뱽湲� (�궗�슜�옄 �슂泥�)

DONE:
- **`lib/data/lms.ts`**: `SubmissionItem` + `submissionItems(snap)` ���
  �쟾 怨쇰ぉ�쓽 怨쇱젣쨌��댁쫰瑜� �셿猷� �룷�븿 �넻�빀 紐⑸줉�쑝濡�(湲곗〈 CourseCard�뒗
  誘몄셿猷뚮쭔 �몴�떆). 誘몄젣異�/誘몄쓳�떆쨌uncertain�쓣 �븵�뿉, �셿猷뚮�� �뮘�뿉, 媛�
  洹몃９��� 留덇컧(parseDue, 踰붿쐞硫� �걹)�닚. `BingeItem` + `bingeQueue(snap)`
  ��� 誘몄떆泥� VOD留� �닔媛� 湲곌컙 留덇컧 鍮좊Ⅸ �닚 �걧, 臾닿린�븳��� 二쇱감�닚�쑝濡� �뮘�뿉.
  二쇱감쨌湲곌컙 �썝臾맞룹텧�꽍 �긽�깭쨌weeklyStatus쨌媛뺤쓽 url 蹂댁〈.
- **`app/sections/lms.tsx`**: 酉� �꺆 3媛�(role=tablist/tab,
  aria-selected) ��� 怨쇰ぉ蹂�/紐곗븘�뱽湲�/�젣異쑣룹쓳�떆. `BingeView`(�븞 �뱾��� 媛뺤쓽
  n嫄�, COSMOS�뿉�꽌 �떆泥� �븞�궡 臾멸뎄), `SubmissionsView`(�젣異� �셿猷�/�쓳�떆
  �셿猷�/誘몄젣異�/誘몄쓳�떆/�쓳�떆 �뿬遺� �솗�씤 �떎�뙣 諛곗�� ��� uncertain�쓣 �솗�젙
  誘몄쓳�떆濡� �몴湲고븯吏� �븡�쓬, COSMOS �썝臾� 留곹겕). `detail` �뵦留곹겕 蹂�寃� �떆
  �젋�뜑 �떒怨� �긽�깭 議곗젙 �뙣�꽩�쑝濡� 怨쇰ぉ蹂� 酉� 蹂듦��(effect �궡 setState�뒗
  react-compiler 由고듃 �삤瑜섎씪 �젣嫄�), �뒪�겕濡� �씠�럺�듃�뒗 �쑀吏�.
- **`learning.css`**: `.lms-tabs` flex, `.lms-task .badge:last-child`
  �슦痢� �젙�젹.

IN PROGRESS: nothing.

NEXT:
1. �떎怨꾩젙 e2e濡� �꽭 �꺆 �젋�뜑 �솗�씤(�뜲紐� 17/17濡� ���泥� 寃�利앸맖).
2. 諛깃렇�씪�슫�뱶 �뫖�떆(�씤�봽�씪 �븘�슂) ��� �쑀�씪�븳 �옍�뿬 �겙 怨쇱젣.

BLOCKER: none.

TESTS: tsc clean, oxlint 0 err, �쟾泥� 留ㅽ듃由��뒪 11�뙆�씪 OK
(lms 62/62 ��� submissionItems쨌bingeQueue 14 �떊洹�: �셿猷� �룷�븿, 誘몄셿猷�
�슦�꽑 �젙�젹, dueTs �뙆�떛, uncertain 蹂댁〈, 誘몄떆泥�留�, 湲고븳�닚, 臾닿린�븳
二쇱감�닚, 異쒖꽍 �젣�쇅), root+deploy 鍮뚮뱶 green, 踰덈뱾 留덉빱 6醫� �솗�씤,
_verify_prod �쟾 �뿏�뱶�룷�씤�듃 200. e2e 17/17.
�씪�씠釉� version ecaf4437.

REPO SCOUT: none.

VERIFICATION STATUS: �떒�쐞 �뀒�뒪�듃쨌鍮뚮뱶쨌諛고룷쨌�뜲紐� e2e(�꺆 �쟾�솚, �걧
�몴�떆, �긽�깭 諛곗��, �셿猷� �빆紐�, �뵦留곹겕 蹂듦��) �셿猷�. �떎怨꾩젙 �솗�씤 誘몄닔�뻾.
'紐곗븘�뱽湲�'�뒗 �슦�꽑�닚�쐞 �걧+COSMOS 留곹겕�씠硫� �옄�룞 �옱�깮쨌異쒖꽍 議곗옉�씠
�븘�떂�쓣 UI�뿉 紐낆떆.
  
---  
  
## 2026-09-19 ? COSMOS 크롬 확장 수집기 + 커뮤니티 과목 수정 (user-requested)

---

## 2026-09-21 — LMS 동기화 상태 단일화 + 수업 현황 UI 리디자인 (user-requested)

CONTEXT: 개선 루프 — 확장↔앱 프로토콜 정식화, fetchedAt 단일 시각 근거,
F12 우선 안내 제거, Notion 계열 토큰 기준 LMS 화면 재설계.

DONE:
- `extension/app-bridge.js` — 프로토콜 정식화. 발신 `hsu-extension-ready`
  (버전, 2초 재통지) / `hsu-lms-status`(syncing/success/failed+error) /
  `hsu-lms-import`, 수신 `hsu-extension-ping` / `hsu-lms-refresh-request{force}`.
  전부 location.origin 한정 postMessage.
- `extension/background.js` — `hsu-refresh`에 force 플래그: 5분 단기
  캐시 우회하되 inflight 공유 유지. manifest v0.4.0.
- `app/page.tsx` — ext 상태(idle/syncing/success/login-required/failed)
  단일화, ready/status/import 수신(origin 검증 유지), ping 발신으로
  리스너 경합 해소, 수집 무응답 2분 타임아웃→failed, visible 전용
  15분 갱신 루프(1분 tick + visibilitychange 재개 시 fetchedAt stale
  판정), 수동 새로고침 requestLmsRefresh(force).
- `lib/data/lms.ts` — `LmsSnapshot.diag{coursesVia,pagePath,scanned}`
  추가 + validateLms 통과 보존(조건부 스프레드로 undefined 키 방지),
  `relTime()` 상대 시각 헬퍼.
- `app/sections/lms.tsx` — 전면 재설계. SyncBand(navy, 상태 도트,
  relTime 마지막 동기화, 과목/남은 항목/수집 경로/자동 갱신 간격,
  CTA: 지금 새로고침·COSMOS 로그인), band 판정 단일화
  (syncing>login>failed>setup>stale>fresh), lms-grid 2열(메인 탭 +
  사이드 마감 임박/연결 관리), ConnCard(동기화 상태·경로·진단·
  마지막 오류·카탈로그 매칭 실패 과목 노출 + 3종 수집 수단),
  SetupGuide(확장 설치 우선, F12 지침 제거 — 스크립트는 details),
  항목 유형 pastel 행(t-vod/t-assign/t-quiz).
- `app/styles/learning.css` — band/grid/guide/conn/pastel 스타일,
  모바일 단일 열 접기, band-pulse/spin 제한 애니메이션.
- `tests/lms.test.mjs` — 실계정 7과목 익명 fixture(diag·weeklyStatus·
  watched/required·uncertain·community·quiz-check) + relTime 단위 +
  weekProgress — 15 신규 단언, 78/78.

VERIFIED: node --check 확장 3파일+lms-collect.js, tsc clean,
oxlint 0 err, 전체 매트릭스 11파일 OK(lms 78/78, lms-server 47/47),
root+deploy 빌드 green, _verify_prod 전 엔드포인트 200, parity OK.
라이브 version e9fd6ef2.

NEXT: 실계정 Chrome e2e(확장 로드→자동 수집→밴드 상태 전이 확인)는
사람 검증 필요 — diag.coursesVia로 셀렉터 실측 가능. 설정 화면에
hsuLmsErr 노출은 ConnCard '마지막 오류'로 1차 커버.

BLOCKER: none.

---

## 2026-09-21 — LMS 디자인 패스 (스크린샷 감사 기반 수정, user-requested)

CONTEXT: 사용자가 현 디자인을 '구리다'고 지적 — 실제 렌더를 headless
Chrome+CDP로 캡처해 감사 후 수정. 데모 LMS 데이터 주입 경로 확보.

FOUND (스크린샷 근거):
- 모바일 밴드 중간에 거대 빈 공간 — flex-basis:300px이 column 방향에서
  height로 작동한 버그
- 밴드 지표가 구겨지고 '수집 경로' 값이 '자동 갱신' 라벨과 충돌
- LMS 원문 과목명 노출('교과(온라인) 학부 데이터분석[01] 김교수') +
  교수명 중복
- pastel 행 원색 면적 과다 + 배지와 이중 컬러코딩
- '미완료 N건 · 완료 N' 중복 수치

DONE:
- `.lms-band` → grid 3열(main/metrics/actions), 지표 hairline 구분선,
  '자동 갱신'을 CTA 아래 band-note로 이동, 모바일 단일 열+nowrap
- `courseDisplay()` — 과목명 정제(장식 토큰 제거, [A] 분반 배지 분리,
  교수명 중복 제거, 원문 title tooltip 보존)
- pastel 행 color-mix 55% 완화, stat '남은 N건'으로 단순화
- `docs/design.md` — 디자인 기준 문서(토큰, 제약, WebGL 레퍼런스 판정
  — 코어 화면 부적합 명시, 스크린샷 감사 체크리스트+CDP 캡처 절차)
- 캡처 드라이버 cdp-shot.mjs(Temp) — 데모 데이터 주입 후
  홈/LMS 3탭/모바일 스크린샷 자동화

VERIFIED: tsc clean, oxlint 0, 재캡처로 모바일/데스크톱 수정 확인,
root+deploy 빌드 green, _verify_prod 전 엔드포인트 200.
라이브 version 7159db61.

NEXT: 토스트가 콘텐츠를 덮는 문제, 홈 대시보드 밀도, 온보딩 히어로
비주얼은 다음 디자인 패스 후보. 다른 에이전트의 디자인 산출물은
design.md 기준으로 리뷰 가능.

BLOCKER: none.

---

## 2026-09-21 — UX/QA 피드백 수용: 날짜·학기·동기화 정합성 (P0) + 화면 개선 (P1/P2)

CONTEXT: 실사용자 워크플로우 감사 리포트 — 2026-09-21 기준
9/20 마감 활동이 '마감임박 D-2', 상대시간 5분 전 vs 절대시간 9시간 전
모순, 2025년 마감 LMS 항목이 현재 할 일·건수·검색에 혼입.

DONE:
- **P0-1 날짜 재계산**: `activities.ts` `liveStatus(a, now)` — 수집
  시점 statusLabel/dday 대신 신청 기간+현재 시각으로 접수예정/접수중/
  마감임박/마감 판정(D-n·오늘 마감·마감 라벨, 기간 없으면 스냅샷 유지).
  activities 목록·상세·필터, home 슬라이드, notifs, search 라벨,
  advisor 활동 답변 전부 liveStatus 경유.
- **P0-2 시각 일치**: `catalog.ts` `useNow(30000)` 공유 훅 — 마운트
  고정 `useState(() => Date.now())`를 lms/home/calendar/notifications/
  page(notifNow)/search로 교체. SyncBand·ConnCard가 같은 `now`에서
  relTime+절대시각 병기, stale >= 1일에 '오래된 데이터' 배지 + band
  headline(stale 임계 7→1일), 지금 새로고침 disabled 사유 표기.
- **P0-3 학기 경계**: `lms.ts` `currentSemesterStart(now)`(3/1·9/1
  추정) + `isPast(dueTs, before)` + `courseIsPast`; pendingTasks/
  submissionItems/bingeQueue/dueSoon에 `before` 파라미터 —
  카탈로그 semester 우선, 없으면 현재 시각 추정. 마감 미기재는 과거로
  추측하지 않음. lms.tsx: 지난 학기 과목 배지·항목 배지·몰아듣기·
  제출·응시 보관 영역(details.lms-past), 카드 '남은 N건'은 현재 학기만
  집계. notifs/reminderTargets/calendar/home/advisor/search에 before
  배선. 검색 과목 hit도 '지난 학기' 라벨.
- **P1-4 CTA 정합**: 학기 계획 버튼 '시간표에서 확인·담기', EnrolledStrip
  요약 '계획에 담긴 수강 과목 N개'.
- **P1-5 누락 필드 정확 표기**: home/notifs가 실제 비어 있는 필드만
  '학과·입학연도'로 표기 + 단일 누락 시 profile/{dept|year} 딥링크,
  profile.tsx focus prop으로 필드 자동 포커스+스크롤+힌트.
- **P1-6 개인 일정 검증**: noValidate + 필드별 인라인 오류(aria-invalid,
  role=alert, 포커스 이동), 실패 시 입력값·공식 일정 목록 보존.
- **P1-7 매칭 경고**: lms 상단 lms-match-warn 카드(N과목 중 M과목
  미매칭 + 졸업 계산 제외 명시) + 졸업 수강 중 스트립에 집계 경고.
- **P1-8 과목 카드 계층**: catalog.ts roomLabel/deliveryLabel/
  placeLabel — '온라인강좌 미래관B107' → 방식 온라인 + 강의실 분리,
  이수구분 중복 제거. courses 상세 그리드·timetable 상세·분반 목록 적용.
- **P1-9 졸업 안내**: 계산 대기 단계형 리스트(프로필/이수 과목/공식
  규정) + '계산 대기'·'참고값' 표기, 미확정 개별 기준도 계산 대기.
- **P2-10 홈 우선순위**: '오늘 처리할 일' 스트립 — 오늘/내일 마감
  수업 + 마감임박 저장 활동 + 프로필 누락 최대 3개, 미확정 데이터는
  긴급 표기 안 함.
- **P2-11 검색 필터**: 범위 칩(전체/과목/활동·일정/수업 현황) +
  '미완료만' 토글(done 플래그) + 현재 학기 안내 문구.

TESTS: tsc clean, oxlint 0 err, 전체 매트릭스 11파일 OK
(activities liveStatus 7, catalog semesterStartTs/labels 2,
lms 97/97 학기 경계 17, notifs 20/20 liveStatus 픽스처 갱신,
search 30/30 지난 학기 제외·라벨), root+deploy 빌드 green,
번들 마커 7종 확인, _verify_prod 전 엔드포인트 200.
e2e 22/22 — 오늘 처리할 일, 지난 학기 분리(목록·집계·보관 영역·
과목 배지), 상대+절대 동기화 일치, 매칭 경고, 검색 제외·칩,
빈 개인 일정 인라인 오류+공식 일정 유지, advisor 지난 학기 미포함.

BLOCKER: none. 라이브 version — _deploy 출력 잘림, verify_prod로
정상 확인(엔드포인트 전부 200). 라이브 version da13afbb.

---

## 2026-09-21 — 재검증 후속: 프로필 포커스 딥링크 + 조사 문구 (user-audited)

CONTEXT: 프로덕션 재검증에서 발견 — 홈 CTA 클릭 후 입력 필드 자동
포커스 미동작(focusCount=0), '학과·입학연도을(를)' 어색한 조사 조합.

CAUSE: 체험 모드는 dept·year 둘 다 누락 → '나의 학적 정보 채우기'가
`length===1` 조건 밖이라 평문 'profile'로 이동(focusField=null).
'학적 정보 필요' 스트립도 항상 평문 'profile'. 단일 누락(실계정
감사 케이스)만 딥링크됐던 상태.

DONE:
- `home.tsx` — missingKeys + profileRoute 도출, 누락 개수와 무관하게
  첫 누락 필드로 딥링크(profile/dept|year). TodayStrip에도 같은
  라우트 전달 — '학적 정보 필요' 클릭 시에도 포커스.
- `notifs.ts` — 프로필 미완성 알림도 첫 누락 필드 딥링크.
- 문구: join('와 ') + '를 입력하면'/'가 비어 있어요' — '학과와
  입학연도를 입력하면…', '학과와 입학연도가 비어 있어요.'로 정정
  (알림 동일). myDept 등 자유 입력 인용부의 '을(를)'는 받침 불명이라
  유지(따옴표 인용 형태).

TESTS: tsc clean, oxlint 0, 매트릭스 11파일 OK, 양쪽 빌드 green,
번들 마커 확인, _verify_prod 전 엔드포인트 200. 포커스 e2e 7/7 —
'나의 학적 정보 채우기'·'학적 정보 필요' 클릭 → #profile/dept →
input[name=dept] 실제 포커스, 조사 패턴 부재 확인.

BLOCKER: none. 라이브 version af79e547.

---

## 2026-09-21 — Notion 스타일 정리 + 사이드바 접기 (사용자 요청)

CONTEXT: "이거 노션 디자인 사용하자. 그리고 사이드바 접을 수 있게
좀 해줘" — 기존 --nt-* 토큰은 Notion 기반이지만 사이드바 화이트·
홈 히어로 네이비 그라디언트+오빗 장식이 남아 있었음.

DONE:
- `shell.css` — 사이드바 surface 회색, 선택 항목 hairline 회색 면
  (Notion식 무채색 선택). `.sidebar-head` + `.nav-label` 추가.
- 접이식 사이드바: 데스크톱(≥768px) 240px ↔ 68px 아이콘 레일.
  `chrome.tsx` Sidebar에 접기 버튼(PanelLeftClose/Open, aria-pressed),
  Topbar에 접힌 상태 한정 펼치기 버튼(side-expand). nav 버튼에
  aria-label/title — 레일에서도 접근성·툴팁 유지. `page.tsx`가
  `hsu-side-collapsed` localStorage로 영속, `.shell.side-collapsed`.
  width/margin 0.2s transition(reduced-motion 존중).
- 모바일은 기존 오프캔버스 드로어 유지 — 레일 CSS는
  `min-width:768px` 안에만 존재, 접기/펼치기 버튼은 ≤767px에서 숨김.
- `home.tsx`+`home.css` — 히어로를 네이비 그라디언트·블루프린트
  그리드·hero-orbit/orb-a,b,c 장식에서 surface-soft 카드로 교체.
  design.md 제약 갱신(네이비는 LMS 밴드·브랜드 아이콘 한정).
- **CSS 특이도 버그 2건 수정**: shell.css는 globals.css 3행에서
  @import되므로 `.icon`(globals.css)보다 앞 — 동일 특이도에서 패배.
  `.side-collapse`가 모바일에서 안 숨겨졌고, **선재 버그**로 탑바
  햄버거(`icon mobile`)가 데스크톱에 노출돼 있었음. `.sidebar
  .side-collapse` / `.topbar .side-expand` / `.topbar .mobile`로
  상위 스코프 특이도 상승.

TESTS: tsc clean, oxlint 0 err, 매트릭스 11파일 OK, 양쪽 빌드 green.
Playwright e2e 15/15 — 확장 240px, 접기 68px+레이블 숨김+shell 클래스,
탑바 펼치기 버튼, localStorage 영속+리로드 유지, 레일 아이콘 네비,
모바일: 레일 미적용(255px 오프캔버스)·접기 버튼 숨김·드로어
열림/스크림 닫힘. 스크린샷으로 확장·레일·모바일 드로어 시각 확인.
배포 후 번들 마커(hsu-side-collapsed/side-collapse/side-expand +
CSS side-collapsed/surface-soft) 라이브 확인, _verify_prod 전
엔드포인트 200.

NOTE: 커밋 전 발견 — 이전 세션의 미커밋 WIP가 양쪽 작업 트리에 남아
있었고 이번 빌드/배포에 이미 포함됨: 졸업↔비교과 포인트 밴드
(activities.tsx act-band), 비학점 요건 본인확인 체크리스트
(data.ts reqChecks + profile route 검증 + graduation UI '입력 필요'
배지), 활동 상세 커버 이미지, 관련 learning.css. 파일이 이번 작업과
겹치지 않아 별도 선행 커밋으로 분리 기록.

BLOCKER: none.

---

## 2026-09-21 — 졸업·비교과 UX 시뮬레이션 피드백 반영 (2/5 사용성 이슈)

CONTEXT: 외부 사용성 시뮬레이션에서 종합 2/5 — 데이터 없음이 0으로 표시,
학과 규정 원문 나열, 졸업↔비교과 연결 부재, 필터 건수 불일치 지적.

DONE:
- 미입력 vs 0 분리: `completed` 비어 있거나 `points` 미입력이면 규정 카드와
  인트로가 "0 / N" 대신 "미입입력 / N 필요" + "입력 필요" 배지, 진행률
  aria는 '미입력'. detail 라우트도 동일 처리.
- 규정 카드 액션: 포인트 규정에 '포인트 입력'(프로필) + '포인트 채울 활동
  보기'(비교과 화면) 버튼. 미충족 학점 규정에 '부족 학점 채울 과목 찾기'.
- 비학점 요건 체크리스트 2경로: dept-conds(yearTable 조건)와 규정 원문의
  "N. [필수] …" 라인 모두 checkbox+확인 완료 배지로 변환. 들여쓰기 세부
  라인(-/*)은 항목 세부로 묶음. `data.reqChecks: string[]`로 영속 —
  profile route에 검증 추가(배열 ≤200, 항목 ≤120자).
- 졸업↔비교과 연결: 활동 목록 상단 act-band(입력 포인트/필요량/잔여 +
  졸업요건 이동), 활동 상세에 완료 시 +N P와 누적 예상 표시, 포인트
  규정 상세에 활동 보기 버튼. 활동 상세에 커버 이미지 + 공고 원문 확인
  안내(목록 데이터 한계 명시).
- 건수 버그 수정: 목록 푸터가 필터와 무관하게 itemCount만 표시하던 것을
  "조건에 맞는 N건 표시 중 · 전체 M건"으로 변경. 상세 배지 '마감 · 마감'
  중복 제거(label===dday면 생략).

TESTS: tsc clean, oxlint 0, 매트릭스 11파일 OK, 양쪽 빌드 green,
_verify_prod 전 엔드포인트 200. CDP 스크린샷으로 미입력 상태("이수학점
미입입력 / 130 필요")·체크리스트 렌더·포인트 밴드·커버 이미지 확인.

INCIDENT: 한글 경로 `cd` 실패로 배포 리포 빌드가 건너뛰어져 24d3fc31은
stale 번들 배포(activities 밴드 누락) — 번들 마커 grep으로 적발 후
상대 경로 cd로 재빌드, cb1e601c→5989d7ab→4e03acec으로 교정 배포.
교훈: 배포 후 번들 마커 확인 필수.

BLOCKER: none. 라이브 4e03acec.

2026-09-21 — ISSUE-26 페이지별 설문 + 비교과 취향 설문

TRIGGER: 사용자 요청 "설문조사 각 페이지에서 할 수 있게하자. 비교과는
비교과 설문이 있어야지". 기존 설문은 프로필 진입점 하나뿐이고 수업
선호 6문항뿐 — 비교과 화면에 별도 설문이 없었다.

DONE:
- SurveyDialog 범용화(label/questions props, 문항 수 파생) — 수업 선호
  6문항과 비교과 선호 5문항이 같은 컴포넌트를 공유.
- ACT_QUESTIONS 5문항 + data.actPrefs 분리 저장(prefs 오염 없음).
  서버 검증·Profile 타입·데모 수화·로그아웃 리셋 반영.
- 진입점: PageHeading 섹션별 설문 버튼(전 페이지), 비교과 포인트
  밴드 CTA, 프로필 양쪽 버튼, 홈 태스크 '비교과 취향 설문하기'.
- '취향 추천' 탭 + actScore() 규칙 스코어링(포인트·인증·유형 키워드·
  팀/개인·일정) — 점수 정렬 + '맞춤 N' 배지 + 근거 툴팁. 미응답 시
  설문 프롬프트 카드.

TESTS: tsc clean, oxlint 0, 매트릭스 11파일 전부 OK(activities 20/20 —
actScore 7건 신규), 양쪽 빌드 green, _verify_prod 전 엔드포인트 200.
CDP 캡처: 비교과 설문 1/5 배지·문항 렌더, 취향 추천 탭 맞춤 배지
정렬, 미응답 프롬프트, 홈→수업 선호 1/6, 모바일 헤딩 버튼 확인.
배포 번들 마커(actPrefs/비교과 선호/취향 추천/survey-trigger) 라이브
확인 — stale 배포 방지 절차 적용.

BLOCKER: 없음. 라이브 51f4f8b8-5ce6-4f1d-89d1-a5d79abbc8a4.

2026-09-21 — 접근성·카피 감사 라운드(Vercel/antislop/critique 기준)

TRIGGER: 사용자 지정 스킬 조합(redesign-existing-projects + ui-ux-pro-max
+ critique + web-design-guidelines + polish + antislop)으로 정적·스크린샷
감사를 수행.

DONE:
- Hard Gate 대비 위반 수정 — 텍스트 토큰을 AA로 교정: stone
  #a4a097→#736f68(5.0/4.6), steel #787671→#6f6c66(5.2/4.8),
  link #0075de→#0068c4(5.6/5.1). muted #bbb8b1→#8a867e(3.6)는
  placeholder 전용으로 제한하고 .footnote는 stone으로 이동.
  .toast>svg는 green→green-deep. 45+ 텍스트 사용처는 토큰 레벨
  수정으로 일괄 커버.
- 노출 카피 em dash 전면 정리(30+곳) — 라벨·수식어는 `·`, 문장
  경계는 마침표로 통일(aria-label·title·OG alt 포함). 주석·JSDoc·
  dept-rules의 NO_REQ 파싱 표는 유지.
- 모바일 드로어 Escape 닫기 추가(notifications 패널과 동일 패턴).
- .sidebar에 overflow-y:auto+overscroll-behavior:contain(짧은 뷰포트
  클리핑 방지), .notif-panel-list에 overscroll-behavior:contain.
- button,a에 touch-action:manipulation(dbl-tap 줌 방지 — 드래그
  핸들의 touch-action:none은 클래스 특이도로 유지).
- .detail-cover에 aspect-ratio:16/5 — 장식 커버의 CLS 방지(공식
  규정 이미지 .rules-image는 전체 표시 필요로 유지).

TESTS: tsc clean, oxlint 0, 매트릭스 11파일 전부 OK, 사이드바 e2e
15/15 재통과(회귀 없음), 양쪽 빌드 green. Playwright 스크린샷
감사(desktop 확장/레일, activities, graduation, search, settings,
mobile 홈·드로어)로 대비 개선·레이아웃 육안 확인. 배포 후 라이브
CSS에 신규 토큰 4종 마커 확인.

BLOCKER: 없음. 라이브 f4661e13-0dd0-4cc6-9cf5-23773089c4d7.

## 2026-09-21 — 시간표 시나리오 + LMS 수동 매칭 + 온보딩 이수 단계 (병행 세션 통합)

TRIGGER: 사용자가 배포된 #timetable 업데이트 요청. 작업 트리에 병행
세션의 미커밋 변경(시나리오 UI, lmsMatch, 온보딩 단계, 홈 마감)이
존재 — 검증·보정·배포·커밋을 이 세션에서 완료.

DONE:
- 시간표 시나리오 A/B/C — `Profile.plans: Record<string,string[]>`.
  timetable.tsx 슬롯 카드(현재 작업 중 + 안 A/B/C), page.tsx의
  save/load/deleteScenario가 persist 경유 저장. 클라이언트 demo
  검증 + profile route 서버 검증(Record<string,string[]>) 확인.
- LMS 수동 매칭 — `Profile.lmsMatch: Record<string,string>`(분반 id
  또는 'ignore'). matchEnrollment(lms,catalog,overrides)가 수동
  매핑 우선 적용, lms.tsx에 매칭 실패 과목 '직접 연결/제외' UI.
  courses·graduation도 동일 override-aware 매칭 소비 — 수강 중
  배지·졸업 계산에 일관 반영. tests/lms.test.mjs 97→112.
- 온보딩 이수 과목 단계 — stage 1 신설(카탈로그 검색으로 이수 과목
  추가), TOTAL 7→8, 완료 시 onboardingStep=TOTAL.
- 홈 '이번 주 마감' — LMS 마감·활동·학사일정 통합 데드라인 표시.
- 모바일 폴리시 — .plan-slot 텍스트 nowrap(불러오기/현재 작업 중
  줄바꿈 방지).

TESTS: tsc clean, oxlint 0, 매트릭스 11파일 전부 OK(lms 112),
양쪽 빌드 green, _verify_prod 전 엔드포인트 200,
_check_deploy 마커 7종 라이브 확인, 프로덕션 CDP 캡처로
시나리오 슬롯 데스크톱·모바일 렌더 확인.

BLOCKER: 없음. 라이브 ae91c70d-c551-4bbd-8a93-9861976be660.
