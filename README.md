# 한성 학사 도우미

한성대학교 학생의 수업 마감·시간표·학사일정·비교과·졸업요건을 모아 보는 비공식 학사 도우미입니다.

## 처음 시작하기

- 개발 저장소: https://github.com/gyeongbin-38/hansung-helper
- Node.js **22.13 이상**과 npm, Python **3.10 이상**이 필요합니다. CI는 Node 22 / Python 3.12를 사용합니다. nvm-sh(macOS/Linux) 사용자는 `nvm install` 후 `nvm use`로 `.nvmrc`를 적용할 수 있습니다. Windows에서는 Node 22 LTS를 설치하거나 사용하는 버전 관리자에서 22 버전을 선택합니다.
- 각자 저장소를 clone한 뒤 프로젝트 폴더에서 실행합니다. 기본 로컬 개발에는 Cloudflare 로그인이나 프로덕션 권한이 필요하지 않습니다.

```sh
npm ci
```

| 작업 | 명령 | 접속 주소 / 특징 |
|---|---|---|
| 프론트 A 화면 개발 | `npm run dev` | 보통 http://127.0.0.1:3000, 체험 모드. 계정 저장 검증은 백엔드 모드 사용 |
| 백엔드 B 전체 실행 | `npm run dev:backend` | 빌드 → 로컬 DB 마이그레이션 → http://127.0.0.1:8787 |
| 이미 빌드한 서버 재실행 | `npm run start` | 8787, 변경한 서버 코드는 먼저 재빌드 필요 |
| 로컬 DB 마이그레이션 | `npm run db:migrate:local` | 적용 이력 관리. 여러 번 실행해도 미적용 SQL만 실행 |
| 공통 PR 검사 | `npm run verify` | 타입 → 린트 → 단위 테스트 → SQLite 검사 → 빌드 |
| 로컬 HTTP 검사 | `npm run test:http` | 다른 터미널에 8787 서버를 켠 뒤 실행 |

로컬 DB는 **프로젝트 루트 `.wrangler/state/`**에 저장하므로 `dist`를 재빌드해도 유지됩니다. 각자의 PC·clone마다 독립적입니다. 과거 `dist/server/.wrangler/state/`의 데이터는 자동 이관하지 않습니다.

`npm run dev:backend`는 계정 API와 D1을 로컬에서 실행하지만 학교 인증·수집은 실제 학교 서버에 연결합니다. 기본 검사에는 실제 계정이 필요하지 않으며, 로그인 성공 검증은 동의한 테스트 계정으로 별도 진행합니다.

## 팀 작업 방식

| 담당 | 책임 |
|---|---|
| 기획 | Issue 우선순위·완료 조건, 학생 테스트, 데이터 기준·출시 판단 |
| 디자인 | 모바일 핵심 흐름, 로딩·빈 상태·실패·오래된 데이터 화면, 디자인 QA |
| 프론트 A | `app/` 화면·스타일·상태·브라우저 연결. B와 요청/응답/실패 계약 합의 |
| 백엔드 B | `app/api/`, `lib/server/`, DB·수집·공개 데이터 갱신·CI·운영 준비 |

1. GitHub Issue 한 개에 담당자와 완료 조건을 정합니다.
2. 최신 `master`에서 `feat/작업명` 또는 `fix/작업명` 브랜치를 만듭니다.
3. 수정 후 `npm run verify`와 작업별 검증을 실행합니다.
4. 작업 브랜치에 push하고 `base: master`인 PR을 엽니다.
5. A/B가 교차 리뷰하고 CI 통과 후 merge합니다. 다음 작업은 최신 `master`에서 시작합니다.

기획·디자인은 Issue에 완료 조건·화면 링크·테스트 결과를 남기면 됩니다. GitHub 초대와 담당자 지정에는 실제 계정명이 필요합니다. 프로덕션 배포는 저장소 소유자가 진행합니다.

## 문서

- **[백엔드 시작 안내](docs/BACKEND_ONBOARDING.md)**: 첫날 실행, 파일 지도, API/수집 계약, 첫 작업과 운영 주의사항
- [협업·PR 규칙](CONTRIBUTING.md): GitHub Desktop과 명령어 작업 순서, 검증·리뷰·커밋 기준
- [운영 메모](AGENTS.md): 기존 수집·배포 명령과 프로젝트별 제약
- `docs/agent/BACKLOG.md`, `RUNLOG.md`: 과거 이력. 현재 상태는 최신 `master` 코드·검증 결과와 대조합니다.

`published-personal/`은 소유자의 별도 배포 저장소입니다. 일반 팀 개발은 이 저장소에서 진행합니다. `.env*`, `.dev.vars*`, 비밀번호·쿠키·학번 원문·`lms-data.json`·생성된 DB/빌드 결과는 커밋하지 않습니다.
