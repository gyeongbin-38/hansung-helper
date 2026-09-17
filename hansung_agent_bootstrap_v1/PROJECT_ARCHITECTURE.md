# 한성대 개인화 학사관리 플랫폼
## PROJECT_ARCHITECTURE.md — 구현 아키텍처 · 에이전트 작업 계약 v1.1

- 작성 기준일: 2026-09-17
- 상태: 구현 기준안 — 독립 검증·Reuse-First 정책 반영
- 대상: 팀 개발자, Devin/Paseo 등 코딩 에이전트, 코드 리뷰어
- 관련 문서: `hansung_academic_platform_astra_final_v1.0.md`
- 우선순위: **현재 사용자 결정 > 실제 저장소 구조/코드 > 이 문서 > 이전 와이어프레임/아이디에이션**
- 대회 결과물 제출 목표: 2026-11-13 이전에 시연 가능한 통합 프로토타입 확보

---

# 0. 이 문서의 목적

이 문서는 화면 디자인을 설명하는 문서가 아니다.

다음 질문에 대한 구현 기준을 하나로 고정한다.

1. 어떤 데이터를 학교에서 수집하고 어떤 데이터를 사용자가 직접 입력하는가?
2. 학교 API가 없는 상황에서 우리 서비스의 데이터베이스를 어떻게 구축하는가?
3. 학생 인증과 우리 서비스 로그인은 어떻게 분리하는가?
4. 크롤러, DB, API, 웹 클라이언트, 추천/졸업 로직을 어떻게 분리하는가?
5. 기능을 어떤 순서로 개발하고 테스트하는가?
6. GitHub Issue/PR과 Paseo heartbeat를 이용해 여러 에이전트가 어떻게 충돌 없이 작업하는가?
7. 어떤 상태를 “구현 완료”라고 부를 수 있는가?

이 문서와 기존 UI 명세가 충돌할 경우 **데이터·인증·백엔드 구조는 이 문서를 우선**한다.  
시각 디자인과 UX 컴포넌트 규칙은 기존 UI 명세를 따른다.

---

# 1. 확정된 핵심 결정

## ADR-001 — 학교 공개 데이터는 우리 DB로 복제해 서비스한다

한성대 홈페이지, 공개 공지, 학사일정, 개설 과목, 비교과 프로그램 등 서비스에 필요한 공개 데이터를 **수집 → 정규화 → 검증 → 자체 DB 저장**한다.

사용자가 앱을 열 때 학교 사이트에 실시간으로 요청하지 않는다.

```text
학교 공개 페이지
    ↓
Crawler / Fetcher
    ↓
Raw Snapshot
    ↓
Parser / Normalizer
    ↓
Validation
    ↓
Service DB
    ↓
Backend API
    ↓
Web / App
```

효과:

- 학교 서버 응답속도가 일반 사용자 UX에 직접 영향을 주지 않는다.
- 1,000명이 동시에 홈을 열어도 학교 사이트에 1,000번 접근하지 않는다.
- 검색, 필터링, 추천, 시간표, 졸업 계산을 우리 DB 기준으로 수행할 수 있다.
- 학교 사이트가 일시적으로 중단되어도 마지막 정상 데이터로 서비스를 유지할 수 있다.

---

## ADR-002 — 비교과 “개인 참여 상태”는 초기 버전에서 사용자가 직접 선택한다

비교과 프로그램 목록 자체는 공개 정보 수집 대상으로 둘 수 있다.

그러나 사용자가 실제로 어떤 비교과를 수료했고 몇 포인트를 공식 인정받았는지는 초기 버전에서 자동 크롤링하지 않는다.

사용자에게 다음과 같은 상태를 직접 선택하게 한다.

```text
관심 있음
신청 예정
참여 중
완료했다고 입력
공식 인정 포인트 직접 입력
```

중요:

- `완료했다고 입력`은 학교의 공식 수료 확인과 동일하지 않다.
- 사용자가 입력한 비교과 포인트는 `USER_REPORTED` 출처로 표시한다.
- 비교과 프로그램에 적혀 있는 “지급 가능 포인트”와 사용자가 실제 인정받은 포인트를 분리한다.
- 프로그램을 저장하거나 완료 체크했다고 자동으로 졸업 포인트에 더하지 않는다.

---

## ADR-003 — 학생 인증은 “학교 로그인 경유” UX를 목표로 한다

회원가입 과정에서 사용자가 실제 한성대학교 학생인지 확인하기 위해 다음 경험을 목표로 한다.

```text
우리 서비스
   ↓
[한성대학교 학생 인증]
   ↓
학교 로그인 화면
   ↓
학교 계정 인증 성공
   ↓
우리 서비스 복귀
   ↓
student_verified = true
```

그러나 **학교가 외부 서비스용 SSO callback/API를 제공하지 않는다면 단순 redirect만으로 우리 서버가 인증 성공을 증명받을 수 없다.**

따라서 구현은 `StudentVerificationAdapter` 인터페이스 뒤에 숨긴다.

```text
StudentVerificationAdapter
├─ OfficialSsoAdapter        # 공식 callback/SSO가 가능할 때
├─ SchoolSessionVerifier     # 기술·운영 허용이 확인된 PoC용
└─ DemoStudentVerifier       # 대회 데모/개발용
```

### 절대 하지 않는 것

- 학교 비밀번호를 우리 DB에 저장하지 않는다.
- 학교 비밀번호의 해시도 저장하지 않는다.
- 인증 성공을 확인하지 못했는데 UI만 `인증 완료`로 바꾸지 않는다.
- 실제 학교 로그인 구조가 확인되지 않았는데 selector/endpoint를 임의로 가정하지 않는다.
- CAPTCHA, MFA, 접근 제한을 우회하는 구현을 만들지 않는다.

### 구현 원칙

학생 인증의 UX와 서비스 내부 데이터 모델은 먼저 완성할 수 있다.  
실제 학교 인증 방식은 Adapter만 교체할 수 있도록 한다.

---

## ADR-004 — 우리 서비스 로그인과 학교 인증을 분리한다

학교 인증은 “한성대 학생인지 확인”하는 절차다.  
우리 서비스 로그인은 우리 서비스 세션을 만드는 절차다.

권장 흐름:

```text
1. 한성대 학생 인증
2. 인증된 학번을 우리 계정에 연결
3. 서비스 전용 비밀번호 또는 별도 서비스 인증수단 설정
4. 이후 일반 로그인은 우리 Auth만 사용
```

일반 로그인 때마다 학교 사이트에 접근하지 않는다.

우리 서비스 비밀번호는 Argon2id 등 검증된 password hashing으로 저장한다.

---

## ADR-005 — 학사 사실, 사용자 입력, 계산 결과를 출처 단위로 분리한다

모든 중요한 데이터는 최소한 다음 provenance를 가진다.

```text
OFFICIAL_CRAWLED
USER_REPORTED
DERIVED
DEMO
```

가능한 필드:

- `source_type`
- `source_system`
- `source_url`
- `source_key`
- `observed_at`
- `effective_from`
- `effective_to`
- `last_verified_at`

UI에서는 필요할 때 다음을 보여준다.

```text
공식 출처 · 2026-09-17 00:30 수집
사용자 입력 · 2026-09-16 수정
계산 결과 · 공식/사용자 입력 자료 기준
체험용 데이터
```

---

## ADR-006 — 졸업요건 판정은 규칙 엔진이 담당하고 AI가 판정하지 않는다

졸업 계산은 명시적 규칙과 데이터로 결정한다.

```text
Student Profile
+ Completed/Reported Records
+ Graduation Rule Set
= Graduation Evaluation
```

AI 상담은:

- 계산 결과 설명
- 부족 요건 요약
- 관련 과목/활동 탐색
- 계획 비교

에 사용한다.

AI가 임의로 졸업 가능 여부를 확정 판정하거나 DB의 졸업 규칙을 대체하지 않는다.

---

# 2. 시스템 전체 구조

```text
┌─────────────────────────────────────────────────────────────┐
│                    External Sources                         │
│                                                             │
│  Hansung Website   Academic Notices   Course Data           │
│  Academic Calendar   Extracurricular Public Listings        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 Data Ingestion Layer                        │
│                                                             │
│  Scheduler → Fetcher → Raw Snapshot → Parser → Validator    │
│                                      → Change Detector      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL                              │
│                                                             │
│  Public Academic Data                                      │
│  Graduation Rules                                          │
│  User/Profile Data                                         │
│  User Activity Selections                                  │
│  Plans / Notifications                                     │
│  Crawl Metadata / Raw References                            │
└───────────────┬───────────────────────────┬─────────────────┘
                │                           │
                ▼                           ▼
       ┌────────────────┐          ┌────────────────┐
       │ Backend API    │          │ Background     │
       │                │          │ Workers        │
       │ Auth/Profile   │          │ Crawler        │
       │ Courses        │          │ Change events  │
       │ Activities     │          │ Notification   │
       │ Graduation     │          │ Recompute      │
       │ Recommendation │          └────────────────┘
       └───────┬────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│                       Web Client                            │
│                                                             │
│ Home / Courses / Timetable / Activities / Calendar          │
│ Graduation / Semester Plan / AI Advisor / Profile           │
└─────────────────────────────────────────────────────────────┘

Separate boundary:

Web Client
    ↓
Student Verification Gateway
    ↓
School Login / Verification Adapter
    ↓
verified identity result only
```

---

# 3. 권장 기술 스택

실제 저장소에 이미 기술 스택이 있으면 **기존 선택을 우선**한다.  
새 저장소라면 아래 조합을 권장한다.

| 영역 | 권장 |
|---|---|
| Frontend | Next.js + React + TypeScript |
| Backend API | FastAPI + Python |
| ORM / Migration | SQLAlchemy + Alembic |
| DB | PostgreSQL |
| Crawler | Python `httpx`/`requests` + BeautifulSoup/lxml |
| JS 렌더링이 꼭 필요한 수집 | Playwright — 필요한 소스에만 제한 |
| Job Queue | 초기에는 DB-backed job 또는 간단 Worker, 필요 시 Redis queue |
| Cache | Redis는 실제 병목이 확인될 때 도입 |
| API Contract | OpenAPI를 기준으로 frontend type 생성 |
| Testing | pytest + frontend unit/e2e test |
| Container | Docker Compose |
| CI | GitHub Actions |

원칙:

- 첫 버전부터 마이크로서비스를 과도하게 쪼개지 않는다.
- 논리적 모듈은 분리하지만 배포 단위는 단순하게 유지한다.
- Crawler Worker는 API request lifecycle과 분리한다.
- Playwright는 서버 간 HTTP로 해결되지 않는 페이지에만 사용한다.

---

# 4. 저장소 구조 제안

```text
/
├─ apps/
│  ├─ web/                     # Next.js
│  └─ api/                     # FastAPI
│
├─ workers/
│  ├─ crawler/
│  │  ├─ sources/
│  │  ├─ parsers/
│  │  ├─ validators/
│  │  └─ fixtures/
│  └─ jobs/
│
├─ packages/
│  ├─ contracts/               # API schema/generated types
│  └─ shared-config/
│
├─ infra/
│  ├─ docker/
│  └─ migrations/
│
├─ docs/
│  ├─ architecture/
│  │  └─ PROJECT_ARCHITECTURE.md
│  ├─ product/
│  ├─ data-sources/
│  └─ adr/
│
├─ scripts/
│  ├─ seed/
│  └─ dev/
│
├─ tests/
│  ├─ integration/
│  └─ e2e/
│
├─ .github/
│  ├─ ISSUE_TEMPLATE/
│  ├─ pull_request_template.md
│  └─ workflows/
│
├─ docker-compose.yml
└─ README.md
```

기존 저장소 구조가 다르면 이 구조를 강제로 덮어쓰지 않는다.

---

# 5. 데이터 수집 아키텍처

## 5.1 수집 파이프라인

```text
Scheduler
  ↓
Fetch
  ↓
Persist Raw Metadata
  ↓
Hash Compare
  ├─ unchanged → finish
  └─ changed
       ↓
     Parse
       ↓
     Validate
       ↓
     Normalize
       ↓
     Upsert
       ↓
     Emit Change Event
```

### 필수 성질

- **Idempotent**: 같은 소스를 여러 번 수집해도 중복 레코드가 쌓이지 않는다.
- **Traceable**: 정규화된 데이터가 어느 원문에서 왔는지 추적 가능하다.
- **Recoverable**: 파서가 깨져도 마지막 정상 데이터를 유지한다.
- **Observable**: 마지막 성공 시각과 오류 원인을 확인할 수 있다.
- **Polite**: 불필요한 고빈도 요청을 보내지 않는다.

---

## 5.2 source identity

가능하면 모든 공식 데이터에 다음 유니크 키를 만든다.

```text
(source_system, source_key)
```

예:

```text
source_system = HANSUNG_NOTICE
source_key    = original article id
```

원본에 안정적인 ID가 없다면 정규화 URL 또는 합성 키를 사용한다.

---

## 5.3 Raw 데이터

Raw HTML 전체를 무제한 영구 보존하는 것을 기본값으로 하지 않는다.

최소한 다음 메타데이터는 보존한다.

```text
crawl_documents
- id
- source_id
- source_url
- fetched_at
- http_status
- content_hash
- parser_version
- parse_status
- error_message
- optional_snapshot_location
```

필요한 경우 sanitized fixture를 테스트용으로 별도 보관한다.

실제 학생 개인정보가 포함된 HTML을 fixture나 Git repository에 저장하지 않는다.

---

## 5.4 변경 감지

`content_hash` 또는 정규화 데이터 diff를 이용한다.

예:

```text
수강신청 공지
기존: 2026-09-20
신규: 2026-09-22
        ↓
change_event
        ↓
관련 notification 후보 생성
```

변경 이벤트는 곧바로 사용자에게 보내지 않고, 의미 있는 변경인지 필터링한다.

---

## 5.5 초기 수집 대상

### P0

- 학교 공지
- 학사일정
- 학과/트랙 기본 데이터
- 개설 과목/시간표 확보 가능한 범위
- 비교과 프로그램 공개 목록

### P1

- 졸업 관련 공식 규정 원문
- 수강신청 관련 공지 구조화
- 외부활동 데이터 소스
- 교수/강의실 등 부가 정보

수집 빈도는 source별 설정으로 관리한다. 코드에 5분/30분 같은 숫자를 여러 곳에 하드코딩하지 않는다.

---

# 6. 데이터 모델 — 논리 영역

## 6.1 Identity / User

```text
users
- id UUID PK
- login_student_no_hash UNIQUE
- password_hash
- status
- created_at
- updated_at

student_identities
- id
- user_id FK
- student_no_encrypted
- verification_provider
- verification_status
- verified_at
- last_reverified_at

user_profiles
- user_id
- display_name
- department_id
- track_id
- admission_year
- current_semester
- target_graduation_term
```

학번을 DB PK로 사용하지 않는다.

로그인 lookup은 hash를 이용할 수 있고, 화면 표시가 필요하면 암호화된 원본을 별도 보관하는 구조를 고려한다.

---

## 6.2 Academic Reference Data

```text
departments
tracks
professors
courses
course_offerings
course_schedules
academic_events
notices
```

`course`와 `course_offering`을 분리한다.

```text
Course
= 과목 자체

CourseOffering
= 특정 연도/학기에 실제 개설된 분반
```

시간표는 `course_offering`을 기준으로 구성한다.

---

## 6.3 Activities

```text
activities
- id
- activity_type
- title
- summary
- organizer
- application_start
- application_end
- activity_start
- activity_end
- advertised_points
- source_system
- source_key
- source_url
- last_verified_at
```

개인 상태:

```text
user_activity_selections
- id
- user_id
- activity_id nullable
- custom_title nullable
- state
- user_reported_points nullable
- completed_at nullable
- note
- source_type = USER_REPORTED
```

`activity_id`를 nullable로 두면 공개 DB에 없는 비교과/외부활동도 사용자가 직접 추가할 수 있다.

---

## 6.4 Graduation Rules

```text
graduation_rule_sets
- id
- name
- admission_year_from
- admission_year_to
- department_id nullable
- track_id nullable
- effective_from
- effective_to
- source_url
- verification_status
```

```text
graduation_requirements
- id
- rule_set_id
- requirement_type
- category
- required_value
- unit
- condition_json
- display_order
```

규칙 버전을 반드시 보존한다.  
“현재 최신 규칙” 하나로 모든 학생을 계산하지 않는다.

---

## 6.5 User Academic State

학교 개인 데이터 API가 없으므로 초기 버전에서는 사용자 입력/선택 기반으로 시작한다.

```text
user_course_records
- id
- user_id
- course_id nullable
- course_name_snapshot
- credits
- term
- record_state
- source_type
```

`record_state` 예:

```text
PLANNED
IN_PROGRESS
COMPLETED_REPORTED
```

`COMPLETED_REPORTED`도 공식 성적 증명이 아니라 사용자 입력 상태일 수 있음을 보존한다.

---

## 6.6 Preferences / Plans

```text
user_preferences
semester_plans
semester_plan_items
saved_courses
saved_activities
```

수업성향 설문은 `user_preferences`에 저장하며 추천 결과 그 자체를 저장하지 않는다.

---

## 6.7 Notifications

```text
notifications
- id
- user_id
- type
- title
- body
- entity_type
- entity_id
- read_at
- created_at
```

```text
notification_preferences
- user_id
- academic_schedule
- registration
- activity_deadline
- data_change
- browser_push
```

---

## 6.8 Crawling / Ingestion

```text
data_sources
crawl_runs
crawl_documents
ingestion_errors
change_events
```

서비스 데이터 테이블과 크롤링 운영 테이블을 분리한다.

---

# 7. 학생 인증 아키텍처

## 7.1 UI

회원가입 첫 단계:

```text
한성대학교 학생 인증

[ 한성대학교 로그인으로 인증 ]
```

성공하면:

```text
✓ 한성대학교 학생 인증 완료
학번 ********
```

그 뒤 서비스 계정을 설정한다.

---

## 7.2 Backend contract

```text
GET /auth/school/start
→ verification flow 시작

GET /auth/school/callback
→ 외부 인증 결과 검증

POST /auth/register
→ verified identity를 서비스 계정으로 변환
```

callback을 학교가 제공하지 않는 환경에서는 endpoint 모양만 만들고 “가짜 성공”을 넣지 않는다.

Adapter contract 예:

```text
start_verification() -> redirect or challenge
verify_result(request) -> VerifiedStudentIdentity | Failure
```

`VerifiedStudentIdentity` 최소 필드:

```text
student_no
provider
verified_at
```

학과/트랙 같은 부가정보는 학교 인증 성공의 필수 증거로 가정하지 않는다.

---

## 7.3 unresolved risk

현재 가장 큰 기술 리스크는:

> **학교가 외부 서비스용 SSO callback/API를 제공하지 않는 상황에서, 학교 로그인 성공을 우리 서비스가 신뢰할 수 있는 방식으로 어떻게 증명할 것인가?**

이 문제는 `School Verification PoC`라는 별도 GitHub Issue로 관리한다.

PoC 결과가 나오기 전에는:

- production verification으로 간주하지 않는다.
- 데모에서는 `DemoStudentVerifier`를 명시적으로 표시한다.
- 실제 학교 자격증명 저장 방식으로 문제를 우회하지 않는다.

---

# 8. Backend API 영역

## 8.1 Auth

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me

GET  /auth/school/start
GET  /auth/school/callback
```

---

## 8.2 Profile

```text
GET   /me/profile
PATCH /me/profile
GET   /me/preferences
PUT   /me/preferences
GET   /me/stats
```

---

## 8.3 Courses

```text
GET /courses
GET /courses/{id}
GET /course-offerings
GET /course-offerings/{id}
POST /me/saved-courses
DELETE /me/saved-courses/{id}
```

필터:

- 학기
- 학과/트랙
- 요일
- 시간대
- 학점
- 영역
- 공강 조건

---

## 8.4 Activities

```text
GET /activities
GET /activities/{id}

GET  /me/activities
POST /me/activities
PATCH /me/activities/{id}
DELETE /me/activities/{id}
```

개인 상태 변경은 학교 공식 수료정보를 수정하는 API가 아니라 **사용자 자기 기록**이다.

---

## 8.5 Graduation

```text
GET /graduation/rule-set
GET /graduation/evaluation
GET /graduation/requirements
GET /graduation/requirements/{id}
```

계산 결과 예:

```text
SATISFIED
MISSING
PARTIAL
UNKNOWN
```

정보가 없으면 `UNKNOWN`으로 두며 0%로 강제하지 않는다.

---

## 8.6 Timetable

```text
POST /timetable/generate
GET  /me/timetables
POST /me/timetables
PATCH /me/timetables/{id}
DELETE /me/timetables/{id}
```

입력:

- 반드시 제외할 시간
- 선호 시간
- 원하는 학점
- 필수 과목
- 공강 선호
- 팀플/평가 선호 — 데이터가 존재할 때만 사용

---

## 8.7 Semester Plan

```text
GET  /me/semester-plans
POST /me/semester-plans
PATCH /me/semester-plans/{id}
```

---

## 8.8 Notifications

```text
GET   /notifications
PATCH /notifications/{id}/read
GET   /me/notification-preferences
PATCH /me/notification-preferences
```

---

# 9. 홈 화면 데이터 조합

홈 API는 학교 사이트를 직접 조회하지 않는다.

```text
GET /home
```

내부 조합 예:

```text
1. user profile
2. graduation evaluation
3. upcoming academic events
4. personalized activities
5. saved deadlines
6. recommended courses
7. unread notifications
```

초기에는 개별 endpoint를 frontend에서 병렬 조회해도 된다.  
실제 병목이 확인되면 BFF-style `/home` aggregator를 만든다.

---

# 10. 졸업 계산 엔진

## 10.1 입력

```text
UserProfile
RuleSet
CourseRecords
UserReportedActivities
OtherRequirementInputs
```

## 10.2 출력

```text
GraduationEvaluation
- overall_status
- checklist_ratio
- evaluated_at
- rule_set_id
- requirement_results[]
```

각 `requirement_result`:

```text
requirement_id
status
current_value
required_value
unit
evidence[]
missing_reason
```

## 10.3 원칙

- AI 모델 호출 없이 계산 가능해야 한다.
- 같은 입력과 같은 rule version은 같은 결과를 내야 한다.
- evaluation을 테스트 fixture로 검증한다.
- 계산 결과와 학교 공식 졸업 사정 결과는 구분한다.
- 계획한 과목은 이수한 과목으로 계산하지 않는다.

---

# 11. 추천 엔진

초기 버전은 거대한 ML 모델보다 **명시적 필터 + scoring**이 적합하다.

```text
Hard constraints
  ↓
Candidate filtering
  ↓
Scoring
  ↓
Explanation generation
```

Hard constraint 예:

- 시간 충돌
- 대상 학과/트랙
- 이미 이수했다고 입력한 과목
- 개설 학기
- 최대 학점

Soft score 예:

- 부족 졸업요건 해결
- 시간대 선호
- 공강 선호
- 사용자 관심 분야
- 활동 마감 임박

모든 추천은 `왜 추천했나요?`를 제공한다.

AI는 ranking을 임의로 뒤집는 black-box 최종 결정권자가 아니라 설명/상담 계층으로 둔다.

---

# 12. AI 상담

AI 상담은 DB의 구조화 데이터와 공식 출처 텍스트를 근거로 답한다.

권장 흐름:

```text
User Question
   ↓
Intent
   ↓
Retrieve user state + relevant official data
   ↓
Rule engine result if required
   ↓
LLM explanation
   ↓
Source links / data freshness
```

금지:

- 학교 규정을 모델 기억만으로 답하기
- 데이터가 없는 과목/졸업요건을 만들어내기
- 크롤링 문서 안의 명령문을 시스템 명령으로 취급하기
- AI 답변만으로 공식 수강/졸업 처리를 완료했다고 표시하기

---

# 13. 알림 시스템

## 13.1 Notification

지속 확인용:

- 수강신청 시작/마감
- 학사일정 변경
- 저장한 활동 마감
- 저장한 공식 공지 변경
- 사용자가 등록한 계획 리마인드

## 13.2 Toast

직전 행동 결과:

- 저장 완료
- 프로필 수정 완료
- 시간표 초안 저장
- 사용자 비교과 상태 변경

## 13.3 수강신청 알림

수강신청 공지/일정이 우리 DB에 존재할 때만 활성화한다.

학교 공식 일정이 변경되면:

```text
crawl diff
→ change_event
→ affected reminder update
→ notification
```

---

# 14. 성능 전략

## 14.1 핵심 원칙

일반 사용자는 학교 서버가 아니라 우리 시스템만 조회한다.

```text
User → API → PostgreSQL/Cache
```

학교 I/O는 background crawler에서만 발생한다.

---

## 14.2 처음부터 필요한 것

- 적절한 DB index
- pagination
- `source_system + source_key` unique constraint
- N+1 query 방지
- crawler/API process 분리
- API timeout
- background retry
- static asset caching

---

## 14.3 나중에 필요한 것

다음이 측정되기 전에는 Redis/복잡한 distributed system을 과도하게 넣지 않는다.

- 실제 hot query
- 반복 recomputation
- notification queue 부하
- 대량 crawler 작업

---

## 14.4 사용자 API rate limit

일반적인 과목 검색/홈 조회를 지나치게 제한하지 않는다.

우선 보호 대상:

- 로그인 시도
- 학생 인증 요청
- AI 상담
- 대량 export
- 비정상 반복 요청

---

# 15. 크롤러 장애 대응

## 15.1 마지막 정상 데이터 유지

파싱 실패 시 기존 정상 데이터를 지우지 않는다.

```text
crawl failed
→ old service data remains
→ source marked STALE/ERROR
→ admin alert
```

---

## 15.2 parser fixture test

실제 학교 사이트를 매 CI마다 호출하지 않는다.

```text
sanitized HTML fixture
→ parser
→ expected normalized object
```

selector를 바꾸면 fixture test를 반드시 수정/검증한다.

---

## 15.3 anomaly detection

다음 상황은 자동 publish하지 않고 검토 대상으로 둘 수 있다.

- 평소 500개 과목 → 갑자기 3개
- 모든 날짜 parse 실패
- 학점 값이 비정상 범위
- 공지 제목 전부 빈 문자열

---

# 16. 관리자/운영 기능

학생용 화면과 별도로 최소한의 내부 데이터 상태 화면이 있으면 개발 효율이 크게 올라간다.

예:

```text
/admin/data-health
```

표시:

- Source 이름
- 마지막 성공
- 마지막 실패
- 현재 item 수
- 최근 변화량
- parser version
- stale 여부

대회 시연에서는 공개하지 않아도 된다.

---

# 17. 개인정보·보안 기준

## 저장 가능

- 서비스 계정 정보
- 학번 연결 정보
- 사용자가 직접 입력한 프로필/학사/비교과 기록
- 추천/계획 데이터
- 사용자 알림 설정

## 저장 금지

- 학교 로그인 원문 비밀번호
- 학교 비밀번호 hash
- 실제 자격증명이 포함된 fixture
- `.env`/API key를 Git에 commit
- 로그에 password/token/session cookie 출력

## 추가 원칙

- 서비스 비밀번호는 password hash만 저장
- 학생번호는 화면/로그에서 기본 마스킹
- private user data와 public crawler cache 분리
- 삭제/탈퇴 시 어떤 사용자 데이터를 삭제할지 명시
- 실제 학교 인증 세션을 사용하는 PoC가 있다면 세션 수명을 최소화
- 로그는 데이터 debugging에 필요한 최소 필드만 남김

---

# 18. UI/UX와 아키텍처 연결

기존 UI 명세를 유지한다.

특히:

- 홈 Hero 캐러셀
- Breadcrumb
- Profile Card
- 사용자 통계
- 졸업 Progress Bar
- Notification Center
- 우측 중상단 Toast
- 수업성향 Lightbox/Modal
- Side accent bar 금지
- Side-tab card 금지

데이터가 없는 상태를 디자인으로 숨기지 않는다.

```text
확인 필요
사용자 입력
공식 출처
업데이트 지연
계산 대기
```

같은 상태를 실제 데이터 모델과 연결한다.

---

# 19. 기능 우선순위

## P0 — 기반

- [ ] monorepo/dev environment
- [ ] PostgreSQL + migration
- [ ] 사용자 계정
- [ ] StudentVerificationAdapter contract
- [ ] DemoStudentVerifier
- [ ] profile/onboarding
- [ ] crawler framework
- [ ] source metadata
- [ ] basic admin data health
- [ ] CI

## P1 — 공개 데이터 기반 핵심 서비스

- [ ] 공지 crawler
- [ ] 학사일정 crawler
- [ ] 비교과 공개 목록 crawler
- [ ] 과목/개설정보 확보 가능한 범위 crawler
- [ ] 홈
- [ ] 활동 목록/상세
- [ ] 사용자 비교과 직접 선택
- [ ] 학사일정
- [ ] Notification basic

## P2 — 학사 개인화

- [ ] graduation rule model
- [ ] graduation rule fixture
- [ ] 사용자 이수과목 수동 입력/선택
- [ ] 졸업요건 계산
- [ ] 과목 추천
- [ ] timetable generator
- [ ] semester plan

## P3 — 고도화

- [ ] AI advisor
- [ ] change detection notification
- [ ] browser push
- [ ] School Verification PoC
- [ ] 외부활동 소스
- [ ] 운영/부하 최적화

---

# 20. GitHub 작업 규칙

## 20.1 GitHub가 개발 Source of Truth

Slack은 대화용이다.

확정 사항은 다음 중 하나에 남긴다.

- Issue
- PR
- `/docs`
- ADR

“Slack에서 이야기했음”만으로 구현 계약이 되지 않는다.

---

## 20.2 Issue 크기

좋음:

```text
#31 Add activity parser for public program list
#32 Add user_activity_selections migration
#33 Implement activity status mutation API
#34 Render activity selection state on detail page
```

나쁨:

```text
#7 Finish backend
#8 Make crawling
#9 Complete UI
```

한 Issue는 한 명/한 에이전트가 독립적으로 완료할 수 있을 정도로 작게 나눈다.

---

## 20.3 상태

```text
Backlog
Ready
In Progress
Review
Done
Blocked
```

---

## 20.4 Branch

```text
feat/31-activity-parser
fix/42-course-dedup
chore/15-ci
```

---

## 20.5 PR 완료 조건

PR은 최소한 다음을 포함한다.

- 무엇을 변경했는가
- 어떤 Issue를 해결하는가
- 어떻게 테스트했는가
- 데이터 migration이 있는가
- UI 변경 screenshot이 필요한가
- 남은 위험/제약은 무엇인가

자동 에이전트도 동일하다.

---

# 21. 에이전트 작업 계약

Devin, Codex, Claude 등 어떤 coding agent를 쓰더라도 다음 규칙을 따른다.

## 시작 전

1. `PROJECT_ARCHITECTURE.md` 읽기
2. 관련 Issue 읽기
3. 기존 코드와 tests 확인
4. 현재 branch/worktree 확인
5. 다른 agent가 수정 중인 파일 범위 확인

## 작업 중

- 한 번에 하나의 Issue를 중심으로 작업
- 최소 변경
- 기존 architecture를 몰래 바꾸지 않음
- DB schema 변경은 migration 포함
- crawler parser 변경은 fixture test 포함
- auth 변경은 security-sensitive change로 취급
- 실제 학교 계정/비밀번호를 test code에 넣지 않음

## 종료 전

- relevant tests 실행
- lint/type check
- migration 검토
- `git diff` 검토
- 무엇을 완료했고 무엇을 못 했는지 기록
- 필요하면 PR 생성
- main merge/deploy는 사람의 현재 승인 없이 실행하지 않음

---

# 22. Paseo 운영 가이드

Paseo heartbeat는 **같은 agent conversation을 주기적으로 다시 깨워 현재 작업을 계속 점검하는 용도**로 사용한다.

새로운 독립 agent를 매 주기 시작해야 하는 작업은 heartbeat가 아니라 schedule이 더 적합하다.

## 22.1 Heartbeat에 적합

- 진행 중인 Issue를 15~30분마다 계속 수행
- CI/build 상태 확인
- PR review feedback 대기 후 처리
- 긴 migration/refactor를 작은 단계로 계속 진행
- crawler fixture 추가 작업을 이어가기

## 22.2 Schedule에 적합

- 매일 새로운 GitHub Issue/PR triage
- 매일 crawler health report
- 정기 dependency audit
- 새로운 agent가 매번 깨끗한 context로 수행해야 하는 일

---

## 22.3 구현용 heartbeat prompt

Paseo에서 다음과 같은 heartbeat를 권장한다.

```text
현재 할당된 GitHub Issue 하나만 계속 진행하라.

매 heartbeat마다:
1. PROJECT_ARCHITECTURE.md와 Issue acceptance criteria를 다시 확인한다.
2. git status와 현재 diff를 확인한다.
3. 완료되지 않은 가장 작은 다음 작업 하나를 수행한다.
4. 관련 테스트와 lint/type check를 실행한다.
5. 실패하면 원인을 먼저 진단하고 같은 명령을 무한 반복하지 않는다.
6. 진행 상황을 Issue/작업 로그에 간단히 남길 수 있도록 요약한다.
7. Issue가 완료되면 더 이상 범위를 확장하지 말고 PR 준비 상태로 종료한다.
8. blocker가 생기면 임의의 architecture 변경으로 우회하지 말고 blocker와 필요한 결정을 보고한다.

금지:
- main 자동 merge
- production deploy
- secret 생성/변경
- 실제 학교 비밀번호 저장
- unrelated refactor
- 다른 Issue를 임의로 시작
```

권장 cadence:

```text
20~30분
```

짧은 5분 주기는 agent가 실행 중인 작업과 겹치거나 불필요한 반복을 만들 수 있으므로 특별한 build babysitting이 아니면 지양한다.

---

## 22.4 PR/CI babysitting heartbeat prompt

```text
현재 PR만 모니터링하라.

1. 새 review comment와 CI 결과를 확인한다.
2. 현재 PR 범위 안의 실패만 수정한다.
3. 실패가 flaky인지 실제 regression인지 구분한다.
4. 수정 후 관련 테스트를 실행한다.
5. CI가 통과하고 unresolved review가 없으면 완료 상태를 보고하고 멈춘다.
6. main merge나 deploy는 실행하지 않는다.
```

---

## 22.5 Crawler 작업 heartbeat prompt

```text
현재 crawler source Issue만 계속 수행하라.

1. 실제 네트워크 호출보다 저장된 sanitized fixture를 우선 사용한다.
2. parser → validator → normalized model 순서로 작업한다.
3. source_system + source_key idempotency를 확인한다.
4. item count가 비정상적으로 감소하면 성공으로 처리하지 않는다.
5. parser fixture test를 추가한다.
6. 개인정보/세션/cookie를 fixture 또는 git에 남기지 않는다.
7. 범위 밖 source crawler를 새로 만들지 않는다.
```

---

## 22.6 worktree 원칙

병렬 agent는 가능한 한 Issue별 별도 worktree를 사용한다.

```text
Issue #31 → worktree A
Issue #32 → worktree B
Review     → read-only 또는 별도 review workspace
```

DB migration 파일을 여러 agent가 동시에 생성하면 충돌 가능성이 높으므로 migration 작업은 순서를 정하거나 한 agent에게 모은다.

---

## 22.7 provider 관련 주의

Paseo에서 사용할 provider/model은 **현재 host에서 실제로 발견되는 provider/profile을 확인한 뒤 선택**한다.

특정 provider 이름을 architecture에 하드코딩하지 않는다.

Devin을 사용하려는 경우에도 현재 Paseo 설치에서 Devin이 실제 provider로 노출되는지 먼저 확인한다. 그렇지 않다면:

- Devin 자체 세션/API를 별도로 사용하거나
- 실제 호환되는 custom provider/adapter가 있을 때만 연결한다.

`provider: devin` 같은 값을 검증 없이 설정하지 않는다.

---

# 23. 에이전트 병렬화 추천

## Agent A — Data/Crawler

담당:

- data source inventory
- fetcher
- parser
- fixture
- normalization
- change detection

수정 권장 범위:

```text
workers/crawler/
apps/api/data_ingestion/
tests/crawler/
docs/data-sources/
```

---

## Agent B — Backend/Core

담당:

- auth
- users
- profiles
- activities API
- graduation engine
- notifications

---

## Agent C — Frontend

담당:

- common layout
- home
- activities
- profile
- graduation UI
- loading/error/empty states

기존 design spec을 최우선으로 읽는다.

---

## Agent D — Planner/Reviewer

처음에는 코드 수정을 하지 않고:

- architecture conflict
- schema mismatch
- security issue
- missing tests
- acceptance criteria

를 검토한다.

---

# 24. 병렬 작업 시 충돌이 큰 파일

다음은 소유자를 정해 동시에 수정하지 않는 편이 좋다.

```text
database migrations
central schema/models
OpenAPI generated contract
root package lock
docker-compose.yml
global auth middleware
PROJECT_ARCHITECTURE.md
```

---

# 25. 테스트 전략

## Unit

- parser
- validator
- graduation rule
- recommendation scoring
- timetable constraint

## Integration

- API ↔ DB
- migration
- auth session
- notification creation
- crawler normalized upsert

## E2E

핵심 사용자 흐름:

```text
회원가입
→ 학생 인증 demo/adapter
→ 프로필 등록
→ 홈
→ 비교과 선택
→ 사용자 상태 변경
→ 졸업 진행 상태 반영
→ 과목 저장
→ 시간표/학기 계획
```

## Contract

Frontend는 실제 응답 구조와 다른 mock object를 임의로 만들어 장기간 유지하지 않는다.

OpenAPI/contract를 공유한다.

---

# 26. 데모 데이터 정책

대회 시연용 seed 데이터를 제공한다.

```text
scripts/seed/demo
```

모든 데모 데이터는 명시적으로 `DEMO` provenance를 가진다.

실제 팀원의 학교 개인정보를 공용 demo DB에 섞지 않는다.

---

# 27. 환경

## Local

- Docker PostgreSQL
- local crawler fixture
- DemoStudentVerifier
- seed data

## Shared Dev

- team dev DB
- sanitized crawler runs
- mock/demo student verification 기본
- 실제 school verification PoC는 별도 환경

## Production-like Demo

- public crawler data
- demo account
- 실제 학교 비밀번호 불필요
- 시연 실패를 막기 위해 마지막 정상 데이터 유지

---

# 28. 로깅/관측

최소 metrics:

```text
API
- latency
- error rate

Crawler
- last_success_at
- last_failure_at
- fetched_count
- parsed_count
- upserted_count
- changed_count

Data
- source freshness
- suspicious item count delta

Jobs
- queued
- running
- failed
```

민감 데이터는 로그 payload에 포함하지 않는다.

---

# 29. 추가 기능 후보

핵심 기능 완성 후에만 진행한다.

## P3 후보

- 저장한 공지 변경 추적
- 과목/활동 즐겨찾기
- 사용자가 직접 일정 추가
- `.ics` 일정 내보내기
- 졸업 “what-if” 시뮬레이션
- 여러 시간표 후보 비교
- 추천 이유 상세 보기
- 데이터 업데이트 기록
- crawler admin diff viewer
- AI 상담에서 관련 공식 출처 카드 표시

## P4 후보

- 팀/친구 시간표 비교
- 사용자 후기
- 커뮤니티 기능
- 복잡한 ranking ML

대회 핵심 가치와 관계없는 기능은 P0~P2를 방해하면 구현하지 않는다.

---

# 30. 현재 주요 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| 학교 로그인 인증 결과를 외부 서비스가 신뢰할 방법이 없음 | 학생 인증 | Adapter + PoC, 데모 verifier 분리 |
| 학교 HTML 변경 | crawler 파손 | fixture test + source health |
| 졸업 규정 복잡성 | 잘못된 진행률 | rule versioning + UNKNOWN 상태 |
| 과목 데이터 불완전 | 시간표/추천 오류 | provenance + semester/version |
| 사용자 비교과 자기입력 오류 | 진행률 부정확 | USER_REPORTED 명시 |
| agent 병렬 작업 충돌 | 개발 지연 | worktree + issue ownership |
| agent scope creep | 품질 저하 | issue 단위 + heartbeat guardrail |
| 대회 시연 중 학교 사이트 장애 | 데모 실패 | own DB + last-known-good + seed |

---

# 31. Definition of Done

기능을 “완료”라고 부르기 위한 최소 조건:

```text
[ ] Issue acceptance criteria 충족
[ ] 코드 구현
[ ] DB migration 필요 시 포함
[ ] 관련 테스트 작성/통과
[ ] loading / empty / error 상태 처리
[ ] 개인정보/secret 노출 없음
[ ] provenance가 필요한 데이터에 출처 상태 존재
[ ] 문서가 바뀌어야 하면 함께 수정
[ ] PR에서 재현/테스트 방법 설명
```

Crawler라면 추가:

```text
[ ] fixture test
[ ] idempotent upsert
[ ] last-known-good 유지
[ ] source metadata
```

졸업 로직이라면 추가:

```text
[ ] rule version
[ ] UNKNOWN 처리
[ ] 계획/완료 구분
[ ] deterministic test
```

---

# 32. 지금 바로 만들 GitHub Epic

## EPIC A — Foundation

- Repository/dev environment
- DB + migration
- Common contracts
- CI
- Auth skeleton
- Profile

## EPIC B — Data Platform

- Source inventory
- Crawl framework
- Notice source
- Calendar source
- Activity source
- Course source
- Data health

## EPIC C — Student Experience

- Home
- Activities
- Profile
- Calendar
- Notifications

## EPIC D — Graduation

- Rule schema
- Rule fixture
- User course records
- Evaluation engine
- Progress UI

## EPIC E — Planning

- Course search
- Recommendation
- Timetable
- Semester plan

## EPIC F — AI

- Retrieval
- Advisor endpoint
- Evidence/source display
- Guardrails

## EPIC G — School Verification PoC

- School login flow investigation
- Verification adapter
- Demo verifier
- Real flow feasibility result
- No school credentials persisted

---

# 33. 첫 번째 에이전트 작업 순서

Paseo/Devin을 장시간 돌리기 전에 한 agent에게 전체 앱을 던지지 않는다.

권장 순서:

```text
1. Repository audit
2. Architecture gap report
3. DB/schema foundation
4. Crawler framework
5. 한 개 source end-to-end
6. API
7. UI 연결
8. 두 번째 source
9. Graduation rule skeleton
10. 기능 병렬화
```

첫 번째 end-to-end vertical slice:

```text
학교 비교과 공개 페이지
    ↓
crawler
    ↓
activities table
    ↓
GET /activities
    ↓
Activities UI
    ↓
사용자 저장/상태 선택
```

이 한 줄이 실제로 동작한 뒤 다른 crawler를 병렬 확장한다.

---

# 34. 에이전트에게 주는 첫 프롬프트

```text
이 저장소의 구현을 시작하기 전에 PROJECT_ARCHITECTURE.md와 관련 제품 명세를 전부 읽어라.

아직 코드를 수정하지 말고 먼저:
1. 현재 저장소의 기술 스택과 디렉터리 구조를 조사한다.
2. PROJECT_ARCHITECTURE.md와 충돌하는 기존 구현을 찾는다.
3. 이미 구현된 것 / 부분 구현 / 미구현을 표로 정리한다.
4. 가장 작은 P0 vertical slice를 제안한다.
5. 필요한 GitHub Issue 목록을 dependency 순서로 작성한다.
6. 학교 인증 방식은 실제 callback이 확인되지 않았다면 구현 완료라고 가정하지 않는다.
7. side accent bar와 side-tab card는 사용하지 않는다.
8. 실제 school credential을 저장하거나 fixture에 넣는 설계를 제안하지 않는다.

분석 결과를 먼저 보고하고, 명시적인 구현 Issue를 선택한 뒤 코드 변경을 시작하라.
```

---

# 35. Paseo heartbeat 시작 프롬프트

```text
이 agent는 현재 선택된 하나의 GitHub Issue를 끝내는 데 집중한다.

20분 간격 heartbeat를 사용해 작업을 이어가되:
- 매번 git status, issue criteria, tests를 확인한다.
- 아직 완료되지 않은 가장 작은 다음 단계만 수행한다.
- 문제가 생기면 관찰 → 원인 가설 → 검증 → 수정 순서로 대응한다.
- 같은 실패 명령을 반복하지 않는다.
- unrelated refactor를 하지 않는다.
- main merge, production deploy, secret 변경은 하지 않는다.
- 실제 학교 계정 비밀번호를 코드/DB/log/fixture에 저장하지 않는다.
- 완료되면 PR-ready 상태와 테스트 결과를 요약하고 추가 범위를 시작하지 않는다.
- blocker가 있으면 필요한 사용자 결정을 정확히 보고하고 멈춘다.
```

---

# 36. 참고

Paseo 운영 개념:

- **Heartbeat**: 같은 agent conversation을 cron cadence로 다시 깨워 연속 작업/상태 확인에 적합.
- **Schedule**: 각 실행마다 새 agent를 시작하는 반복 작업에 적합.
- **Worktree**: 병렬 coding agent를 독립 branch/workspace로 격리하는 데 적합.

Devin 운영 개념:

- Devin API는 session 생성 및 기존 session에 추가 message를 보내는 자동화 인터페이스를 제공한다.
- Paseo에서 Devin을 직접 provider로 사용할 수 있는지는 현재 설치 환경의 provider/catalog 또는 custom adapter 구성을 실제로 확인해야 한다.
- 이 프로젝트의 architecture는 특정 coding-agent provider에 종속되지 않는다.

---


# 37. 구현과 검증의 강제 분리

이 프로젝트에서는 **구현한 에이전트가 자기 작업을 스스로 최종 검증했다고 선언하는 것만으로 Issue를 Done 처리하지 않는다.**

구현과 검증은 역할, 세션, 가능하면 worktree까지 분리한다.

## 37.1 Implementer

담당:
- Issue acceptance criteria 해석
- 코드 구현
- migration
- unit/integration test 추가
- lint/type check/build 수행
- PR 생성
- 구현 한계와 알려진 리스크 기록

Implementer는 `PR ready`까지 만들 수 있지만 `VERIFIED` 또는 최종 `Done` 판정을 하지 않는다.

## 37.2 Verifier

Implementer와 **다른 fresh agent/session**을 사용한다.

Verifier는 구현자의 완료 보고를 신뢰하지 않고 직접 확인한다.

1. Issue acceptance criteria
2. 실제 diff
3. schema/API contract
4. 테스트 실행 결과
5. regression
6. architecture 위반 여부
7. 보안/개인정보 영향
8. UI라면 반응형·접근성·loading/empty/error 상태
9. crawler라면 idempotency·fixture·last-known-good
10. provenance 정확성

Verifier는 기본적으로 제품 코드를 수정하지 않는다.

```text
VERIFY_FAILED
→ 재현 절차/원인/기대 결과 기록
→ Implementer에게 반환
→ 수정
→ Fresh verification
```

## 37.3 GitHub 상태

```text
Ready
→ Implementing
→ PR Ready
→ Verification
   ├─ FAIL → Changes Requested → Implementing
   └─ PASS → Verified
→ Human Merge / Done
```

추천 label:

```text
agent-ready
agent-implementing
needs-verification
verification-failed
verified
needs-human
```

`verified` label은 Implementer가 자기 PR에 붙이지 않는다.

## 37.4 검증 게이트

### Gate A — 자동
- type check
- lint
- unit tests
- build

### Gate B — 독립 기능 검증
Verifier가 acceptance criteria를 실제로 재현한다.

### Gate C — 데이터/도메인
대상:
- crawler
- graduation rules
- course data
- recommendation
- notification trigger

확인:
- provenance 유지
- UNKNOWN 처리
- 계획/완료 분리
- 비정상 수집량 차단
- last-known-good 유지

### Gate D — Security / Privacy
대상:
- auth
- student verification
- session
- personal data
- credential handling

### Gate E — UI / Accessibility
- desktop/mobile
- keyboard/focus
- loading/empty/error
- provenance label
- side accent bar 금지
- side-tab card 금지

## 37.5 Implementer heartbeat

```text
현재 GitHub Issue의 구현만 수행하라.

매 heartbeat:
1. acceptance criteria를 확인한다.
2. git diff와 failing tests를 확인한다.
3. 가장 작은 미완료 구현 하나를 수행한다.
4. 관련 test/type/lint/build를 실행한다.
5. 실패 원인을 진단하고 수정한다.
6. 완료되면 PR-ready 상태로 정리한다.

중요:
- 독립 검증을 스스로 PASS 처리하지 않는다.
- Verified/Done으로 바꾸지 않는다.
- 다음 Issue를 임의로 시작하지 않는다.
```

## 37.6 Verifier 프롬프트

```text
너는 구현자가 아니라 독립 검증자다.

다음 PR을 Issue acceptance criteria와 PROJECT_ARCHITECTURE.md 기준으로 검증하라.

1. Implementer의 완료 보고를 신뢰하지 말고 diff와 실행 결과를 직접 확인한다.
2. 먼저 수정하지 말고 결함을 재현한다.
3. 관련 test/type/lint/build를 직접 실행한다.
4. 변경 범위에 맞는 Functional/Data/Security/UI gate를 적용한다.
5. happy path뿐 아니라 실패/경계 상태를 최소 하나 검증한다.
6. regression을 확인한다.
7. architecture 위반, provenance 오류, 개인정보 노출을 확인한다.
8. 실패 시 파일/조건/재현 절차/기대 결과를 기록한다.
9. 제품 코드를 직접 고쳐 PASS를 만들어내지 않는다.
10. 모든 기준이 충족된 경우에만 VERIFIED를 보고한다.

출력:
VERDICT: PASS | FAIL | BLOCKED
TESTS:
ACCEPTANCE CRITERIA:
REGRESSION:
ARCHITECTURE:
SECURITY/PRIVACY:
UI/A11Y:
FINDINGS:
```

# 38. Reuse-First — 외부 오픈소스 적극 활용

범용 인프라는 필요 이상으로 직접 구현하지 않는다.

새 기능 구현 전:

```text
1. 이 문제는 우리 서비스의 핵심 도메인인가?
2. 검증된 오픈소스/라이브러리가 있는가?
3. 직접 구현보다 외부 구현 사용이 더 안전하고 빠른가?
```

직접 구현 우선:
- 한성대 source parser/normalizer
- graduation rule engine
- 사용자 학사 상태 모델
- 과목 추천 제약
- 서비스 고유 UX

외부 구현 우선 검토:
- crawling framework
- browser automation
- frontend server-state cache
- calendar UI
- notification infrastructure
- vector search
- observability
- form/schema validation

## 38.1 Repo Scout

범용 기능을 새로 만들기 전에 필요하면 별도 Repo Scout를 수행한다.

평가:
- 공식 repository/package인가
- License
- 유지보수 상태
- Security policy
- 현재 stack 호환성
- 의존성 크기
- self-host 가능성
- API 안정성
- migration cost
- vendor lock-in
- 실제 필요한 기능 범위

결론은 `ADOPT / TRIAL / REJECT` 중 하나로 남긴다.

## 38.2 채택 규칙

우선:
1. 공식/원 프로젝트
2. 유지보수되고 문서화됨
3. 명확한 라이선스
4. 현재 스택과 자연스럽게 통합
5. 필요 이상으로 크지 않음
6. 테스트 가능한 인터페이스
7. 교체 가능한 abstraction

피한다:
- 라이선스 불명 코드
- abandoned fork
- 검증되지 않은 코드 복붙
- 핵심 도메인을 특정 외부 SaaS에 강결합
- repo source 통째 복사

가능하면 package/official SDK/container/extension 형태로 사용한다.

# 39. 현재 우선 검토 후보

## 39.1 Scrapy
용도: 공지·학사일정·비교과·과목 등 crawler가 여러 source로 커질 때 retry/throttling/pipeline 관리.

```text
현재: TRIAL
source 증가 시: ADOPT 검토
```

source가 적을 때는 `httpx + parser`가 더 단순할 수 있다.

## 39.2 Playwright
JS 렌더링이 필요한 페이지에만 사용한다.

- 기본 crawler로 쓰지 않는다.
- `httpx/requests`로 되면 브라우저를 띄우지 않는다.
- 로그인 우회 수단으로 사용하지 않는다.

```text
필요 source에만 ADOPT
```

## 39.3 TanStack Query
React frontend의 courses, activities, notifications, profile, graduation evaluation 등 server-state 관리에 우선 검토한다.

```text
ADOPT 우선 검토
```

## 39.4 FullCalendar
학사일정/개인일정 UI 후보.

```text
학사일정: TRIAL
시간표: 별도 비교
```

기본 스타일을 그대로 쓰지 않고 우리 design token으로 감싼다.

## 39.5 pgvector
P3 AI 상담에서 공식 공지·졸업 규정·학사 안내 의미 검색이 필요해질 때 PostgreSQL 안에서 활용 검토.

```text
P3: ADOPT 우선 검토
```

초기부터 별도 vector DB를 추가하지 않는다.

## 39.6 Novu
In-app 외에 push/email 등 여러 채널이 커질 때 재평가한다.

```text
현재: REJECT / simple notification 유지
채널 증가 시: 재평가
```

# 40. 외부 Repo 채택 ADR

핵심 경로에 외부 프로젝트를 도입하면 ADR을 남긴다.

```text
docs/adr/ADR-XXX-dependency-name.md
```

내용:
- Context
- Candidates
- Decision
- Why
- License
- Risks
- Exit strategy

외부 라이브러리 때문에 내부 domain model까지 종속시키지 않는다.

# 41. 자율 개발 Orchestrator

```text
Maintainer / Planner
        │
        ├── Repo Scout (필요 시)
        ▼
    Implementer
        │
        ▼
      PR Ready
        │
        ▼
 Independent Verifier
        │
   ┌────┴────┐
 FAIL       PASS
   │          │
Implementer  VERIFIED
   │          │
   └──────┐   │
          ▼   ▼
        Human Merge
```

Verifier는 항상 fresh agent를 우선한다.

# 42. Maintainer Schedule 프롬프트 v2

```text
PROJECT_ARCHITECTURE.md를 읽고 프로젝트를 유지보수하라.

우선순위:
1. verification-failed PR
2. 진행 중인 구현
3. needs-verification PR
4. priority:p0 + agent-ready Issue
5. priority:p1 + agent-ready Issue

needs-verification PR이 있으면 같은 세션에서 구현+최종검증을 하지 말고 fresh verifier 대상으로 넘긴다.

새 구현 전에 범용 기능이면 공식/오픈소스 프로젝트가 있는지 조사한다.
유용한 후보가 있으면 license, maintenance, integration cost를 비교한다.
핵심 도메인이 아니라면 검증된 외부 구현을 우선한다.

한 실행에서 구현과 최종 독립 검증 역할을 동시에 수행하지 않는다.

main merge, production deploy, secret 변경은 수행하지 않는다.
```

# 43. 외부 Dependency 검증 체크리스트

Verifier는 새 dependency가 추가된 PR에서 확인한다.

```text
[ ] 실제로 필요한가?
[ ] 공식 package/repository인가?
[ ] license를 확인했는가?
[ ] 유지보수 상태를 확인했는가?
[ ] 기존 dependency로 해결할 수 없는가?
[ ] bundle/runtime 비용이 과도하지 않은가?
[ ] 불필요한 SaaS/secret 의존성이 생기지 않는가?
[ ] wrapper/interface로 교체 가능하게 되어 있는가?
[ ] 도입 이유가 PR/ADR에 기록됐는가?
```


# 44. 최종 요약

이 프로젝트의 핵심 구조는 다음 한 문장으로 고정한다.

> **학교의 공개 학사 데이터를 우리 서버가 미리 수집하여 자체 DB로 제공하고, 학생 개인 상태는 검증된 계정과 사용자 입력을 결합하며, 모든 추천·졸업 계산·시간표·알림은 학교 사이트 실시간 I/O가 아니라 우리 DB와 규칙 엔진 위에서 동작한다.**

개발 시 가장 중요한 경계:

```text
공개 학교 데이터     → crawler-owned
개인 사용자 데이터   → user-owned
학생 신원 인증       → verification adapter
졸업 판정            → rule engine
AI                   → explanation/advice layer
일반 서비스 조회     → our API + our DB
```

이 경계를 무너뜨리는 구현은 편해 보여도 장기적으로 수정 비용과 오류 가능성을 크게 높이므로 피한다.
