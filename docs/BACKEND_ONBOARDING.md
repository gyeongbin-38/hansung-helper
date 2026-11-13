# 백엔드 개발 시작 안내

이 문서는 백엔드 담당 B의 현재 시작점이다. 과거 작업 기록은
[`backend-tasks.md`](./backend-tasks.md), 팀 전체 기록은
[`team-tasks.md`](./team-tasks.md)에서 참고하되, 새 작업은 이 문서와 GitHub
Issue를 기준으로 시작한다.

기준: 이 문서의 API 설명은 환경 브랜치가 출발한 `master` (`2b4d4e3`) 기준이다.
2026-10-29 확인 시 [PR #3](https://github.com/gyeongbin-38/hansung-helper/pull/3)에
API envelope·확장·데이터 갱신·운영 도구 변경이 올라와 있지만 아직 master에
반영되지 않았다. PR #3 병합 후 관련 계약·명령·문서를 함께 갱신한다.

## 1. 역할과 완료 책임

| 담당 | 주 책임 | 넘겨줄 결과 |
| --- | --- | --- |
| 기획 | 사용자 문제, 우선순위, 완료 조건, 베타 판정 | 한 Issue에 범위·완료 조건·확인 시나리오 기록 |
| 디자인 | 정상·로딩·빈 상태·부분 실패·모바일 흐름 | 구현 가능한 화면 상태와 문구 |
| A (프론트엔드) | `app/` 화면, 브라우저 상태, API 소비, 확장 연동 UI | 사용자가 끝까지 수행 가능한 화면 흐름 |
| B (백엔드) | `app/api/`, `lib/server/`, D1, 수집기, 데이터 게시·검증 | 안정된 API 계약, 마이그레이션, 실패 처리와 검증 |

A와 B의 경계는 파일이 아니라 API 계약이다. 함께 바꾸는 기능은 구현 전에
요청 본문, 성공 응답, 실패 상태 코드, 로딩/재시도 상태를 Issue에 적는다.
“학교 연결 → 수집 → D1 반영 → 화면 표시”는 두 사람의 공동 완료 항목이다.

프로덕션 D1 수정과 배포는 저장소 소유자만 한다. B는 로컬에서 코드와
마이그레이션을 검증하고, PR에 실행 결과와 운영 절차를 남긴다.

## 2. 최초 설치

필수 도구는 다음과 같다.

- Node.js `22.13.0` 이상 (`package.json`의 `engines` 기준)
- npm
- Python `3.10` 이상. 현재 팀 검증 환경은 Python `3.12`이다.
- Git과 GitHub Desktop 또는 Git CLI

저장소를 clone한 뒤 프로젝트 루트에서 실행한다.

```powershell
node --version
python --version
npm ci
```

Windows에서 `python`이 없으면 `py -3 --version`, macOS/Linux에서는
`python3 --version`으로 확인한다. npm 검사 명령은 이 실행 파일들을 자동 탐색한다.

`npm ci`는 lockfile 그대로 설치한다. 의존성을 임의로 추가하지 않는다.
Cloudflare 로그인, 원격 D1 권한, 환경변수 삽입 없이 기본 로컬 개발이 가능하다.
개인 설정이 필요해도 `.env*`와 `.dev.vars*`는 `.gitignore` 대상이므로 커밋하지 않는다.

2026-10-26 현재 master lockfile 검사 기록은 전체 10건(critical 2, high 7,
moderate 1), `npm audit --omit=dev`는 3건(high 2, moderate 1)이었다. 이 숫자만으로
서비스에서 익스플로잇이 성립한다고 판단하지 않는다. 실제 사용 경로와 수정 시
호환성을 별도로 검증해야 한다. PR #3에는 의존성 패치가 포함돼 있으므로 해당
lockfile을 기준으로 재검사한 뒤 남은 항목만 Issue #2와 대조한다.
온보딩 중 임의 `npm audit fix`로 lockfile을 바꾸지 않는다.

## 3. 로컬 실행 두 가지

### 화면만 빠르게 확인

```powershell
npm run dev
```

브라우저에서 `http://127.0.0.1:3000`을 연다. 포트가 사용 중이면 터미널에
표시된 다음 포트를 `127.0.0.1`로 연다. 이 모드는 D1이 연결되지 않아
체험 모드와 프론트 작업 확인용이다. 로그인·저장은 검증 대상이 아니다.

### D1을 포함한 백엔드 실행

```powershell
npm run dev:backend
```

이 명령은 빌드, 로컬 마이그레이션, Wrangler 서버 시작을 순서대로 수행한다.
접속 주소는 `http://127.0.0.1:8787`이다. 첫 실행은 빌드 때문에 시간이 걸린다.

단계를 나눠 실행해야 할 때는 다음 명령을 사용한다.

```powershell
npm run build
npm run db:migrate:local
npm run start
```

- `db:migrate:local`은 적용 이력을 추적하므로 재실행해도 이미 적용된
  마이그레이션을 다시 만들지 않는다.
- `start`는 빌드 결과를 실행하고 상태를 `.wrangler/state`에 보존한다.
- 로컬 설정 `wrangler.local.jsonc`에는 placeholder 로컬 DB만 있으며 팀이 함께
  쓰는 설정이라 커밋한다.
- `.wrangler/state`는 `dist` 밖에 있으므로 재빌드해도 로컬 계정 데이터가
  유지된다. `.wrangler/`와 `dist/`는 `.gitignore` 대상이므로 커밋하지 않는다.
- 예전 문서의 `dist/server/.wrangler/state` 수동 관리와 매번 SQL 파일을
  직접 적용하는 절차는 새 로컬 명령으로 대체된다.

학교 서버를 흉내 내는 로컬 인증 서버는 없다. 계정 API의 D1 동작은 자동
테스트로 확인할 수 있지만, 학교 로그인·COSMOS·종합정보 수집은 승인된 실제
계정으로 별도 수동 검증해야 한다. 자격 증명을 파일, 로그, Issue에 남기지 않는다.

## 4. 검증 명령

변경 전후 기본 게이트는 하나로 실행한다.

```powershell
npm run verify
```

이 명령은 타입 검사, 린트, 전체 테스트 매트릭스, 메모리 SQLite 검사, 빌드를
묶어 실행한다. `test:db`는 `tests/account-db.py`로 스키마·세션 소유권·만료·
삭제 연쇄를 확인하며 실제 D1 또는 API 통합 테스트는 아니다. 실패가 하나라도
있으면 PR을 올리기 전에 원인을 해결한다.

실행 중인 8787 서버의 HTTP 계약은 별도로 확인한다.

```powershell
npm run test:http
```

`test:http`를 실행하기 전에 다른 터미널에서 `npm run dev:backend` 또는
`npm run start`가 떠 있어야 한다. 브라우저와 테스트 주소는 모두
`http://127.0.0.1:8787`을 사용한다.

HTTP 검사는 Miniflare의 명시적인 로컬 프록시 연결 끊김·Worker 재시작 오류만
최대 3회 재시도한다. 일반적인 앱 `500`은 재시도 대상이 아니며 검사에 실패한다.

자동 테스트의 한계를 기억한다.

- CI는 별도 러너의 로컬 D1에서 전체 마이그레이션 적용과 재실행도 확인한다.

- 파서 테스트는 저장된 fixture를 사용하므로 학교 HTML 변경을 모두 감지하지 못한다.
- 메모리 SQLite 검사는 스키마·세션 소유권·만료·삭제 연쇄만 확인하며 실제
  D1 동작, API 통합, 학교 인증을 대체하지 않는다.
- 실제 계정 수집 결과와 학교 원본의 마감일·제출 상태 대조는 수동 검증이다.
- 프로덕션 검증은 운영 주소에 대한 smoke test이며 데이터 의미까지 보증하지 않는다.

## 5. 백엔드 파일 지도

| 영역 | 파일 | 지켜야 할 계약 |
| --- | --- | --- |
| 계정 공통 | `lib/server/account.ts` | 세션 해시, D1 접근, origin/content-type 검사, 보안 응답 |
| 로그인 | `app/api/account/login/route.ts` | 학교 연결, 계정 upsert, 세션 생성, 지연 수집 시작 |
| 계정 조회·삭제 | `app/api/account/route.ts` | 현재 계정 반환, 계정과 세션 함께 삭제 |
| 로그아웃 | `app/api/account/logout/route.ts` | 현재 세션만 폐기하고 쿠키 만료 |
| 프로필 저장 | `app/api/account/profile/route.ts` | 입력 검증, 크기 제한, `rev` 낙관적 잠금 |
| 재수집 | `app/api/account/lms-refresh/route.ts` | 같은 학번 재인증, rate limit, 이전 수집본 보존 |
| 학교 연결 | `lib/server/school.ts` | 학교·COSMOS 세션, 요청별 15초 timeout, 지연 수집 클로저 |
| LMS 파서 | `lib/server/lms.ts` | 전체 60초/40요청 예산, 과목별 부분 실패 `errors[]` |
| 종합정보 파서 | `lib/server/info.ts` | 슬롯별 수집 결과와 부분 실패 유지 |
| 프로필 병합 | `lib/data/profile-merge.ts` | 409 뒤 base/local/remote 3-way 병합 |
| 공개 데이터 | `lib/server/snapshots.ts` | D1 우선, 번들 폴백, 60초 아이솔레이트 캐시 |
| DB 변경 | `drizzle/*.sql` | 새 변경은 새 마이그레이션으로 추가 |
| 수집·게시 | `scripts/crawl-*`, `scripts/_publish_snapshots.mjs` | 급감 방어 후 명시적 게시 |

과거 문서의 “LMS 수집 24초” 설명은 현재 코드와 다르다. 현재 상수는 학교
요청별 15초, 상세 LMS 수집 전체 60초, 최대 40요청이다. 이 값을 바꾸면 실제
Cloudflare 실행 제한과 부분 결과 품질을 함께 검증한다.

## 6. 계정·수집 계약

계정의 `profile`과 학교 `snapshot`은 D1의 JSON 문자열이다.

- 프로필 저장은 클라이언트 `rev`와 저장된 `rev`가 같을 때만 성공한다.
- 충돌이면 `409 { conflict: true }`를 반환한다.
- 프론트는 `base/local/remote` 3-way 병합 후 한 번 재시도한다. 백엔드 변경이
  이 흐름을 우회하거나 조용히 마지막 쓰기로 덮어쓰게 만들면 안 된다.
- 로그인과 재수집의 상세 LMS·종합정보 수집은 `waitUntil`에서 응답 뒤 계속된다.
- `checkedAt` 조건으로 오래 걸린 과거 수집이 더 최신 snapshot을 덮지 못하게 한다.
- 진행 중에는 `lmsPending`/`infoPending`, 실패하면
  `lmsFailedAt`/`infoFailedAt`으로 표시한다.
- 새 수집이 일부 실패하면 검증된 이전 데이터는 유지한다.
- 퀴즈 제출 확인 실패는 미제출로 확정하지 않고 `uncertain`과
  `errors: ['quiz-check']`로 남긴다.

학번 원문, 비밀번호, 학교 세션 쿠키는 D1에 저장하지 않는다. 계정 ID와 세션
토큰은 해시로 저장하고, 브라우저에는 `Secure`, `HttpOnly`, `SameSite=Lax`인
`__Host-hansung_session`만 둔다. 비밀번호를 로그에 넣거나 응답으로 돌려주지 않는다.

주요 계정 API 상태 코드는 다음과 같다.

| 상태 | 의미 |
| --- | --- |
| `200` | 요청 성공 |
| `400` | JSON 또는 필드 형식 오류 |
| `401` | 앱 세션 없음 또는 학교 자격 증명 확인 실패 |
| `403` | origin/content-type 오류 또는 연결 계정과 다른 학번 |
| `409` | 프로필 `rev` 충돌 |
| `413` | 요청 본문 크기 초과 |
| `429` | 로그인·재수집 시도 제한 |
| `503` | 학교 연결, D1 저장, 서버 처리 실패 |

공개 API `/api/courses`, `/api/activities`, `/api/schedule`,
`/api/dept-rules`는 요청 때 학교 사이트를 호출하지 않는다. D1
`public_snapshots`가 번들 JSON과 같거나 더 최신이면 D1을 쓰고, 없거나 오래됐거나
손상됐으면 번들로 폴백한다. D1 게시 성공만으로 수집 데이터의 정확성이 증명되는
것은 아니므로 수집 시각·건수·급감 가드를 먼저 확인한다.

## 7. GitHub 작업 방식

`master`에서 직접 작업하거나 push하지 않는다. 작업 하나당 브랜치와 PR 하나를
쓴다.

```powershell
git switch master
git pull --ff-only origin master
git switch -c fix/release-check
```

수정 후 `npm run verify`를 실행하고 커밋·push한다. 커밋은 저장소의 Lore 형식으로
의도와 검증 결과를 남긴다. B의 PR은 A가, A의 PR은 B가 리뷰한다. CI와 리뷰가
통과한 뒤 merge하고 다음 작업은 다시 최신 `master`에서 시작한다.

로그인·보안 코드를 건드리기 전에 열린 PR
[#3](https://github.com/gyeongbin-38/hansung-helper/pull/3)을 먼저 확인한다.
2026-10-29 확인 시 제목은 `feat: complete backend launch readiness`이고
CI `verify`는 성공했으나 리뷰·병합이 남아 있다. PR 본문에는 배포 검증,
공개 데이터 갱신, 계정 격리, 확장 계약, 의존성 패치가 포함돼 있다고 기록돼 있다.
이는 PR 작성자의 검증 보고이며 이 문서에서 코드 전체의 적합성을 판정한 것은 아니다.

환경 PR과 PR #3은 `package.json`, CI, 테스트, 운영 문서 일부를 함께 수정한다.
먼저 병합한 PR을 기준으로 나머지 PR을 갱신하고 전체 검사를 다시 실행한다.
패키지·마이그레이션·API 변경을 파일 덮어쓰기로 되돌리지 않는다.

## 8. B가 시작할 순서

1. **기존 PR 검토:** PR #3의 변경과 테스트 결과를 A와 함께 검토한다.
   특히 API 성공·실패 형식이 A의 화면 처리와 일치하는지, 갱신·확장·계정 격리
   검증이 실제 사용 흐름을 다루는지 확인한다. 이미 수정한 기능을 중복 개발하지 않는다.
2. **통합 검증:** 환경 변경과 함께 최신 브랜치에서 `npm run verify`,
   로컬 D1 마이그레이션 재실행, `npm run test:http`를 확인한다. 학교 로그인과
   두 사용자의 실제 브라우저 흐름은 동의한 테스트 계정으로 별도 확인한다.
3. **운영 인계:** PR #3의 공개 갱신·모니터링 설정과 필요한 Actions secrets,
   원격 D1 백업·복구·배포 검증 절차를 소유자에게 전달한다. 코드를 병합한 것과
   실제 운영 설정·배포를 마친 것을 구분해 기록한다.

다음 목록은 **현재 master에서 확인한 공백과 검수 기준**이다. PR #3에서 수정
범위를 먼저 확인한 뒤 남은 부분만 새 작은 Issue·PR로 만든다.

1. **배포 검증 실패 판정 — `fix/release-check`**
   - 확인됨: `scripts/_verify_prod.py`는 요청 예외 후 `continue`하고 마지막에
     실패 exit code를 내지 않는다.
   - 완료: HTTP 오류, JSON 파싱 실패, 필수 문자열 누락 중 하나라도 있으면
     비정상 종료하고, 정상 배포에서는 0으로 종료한다.

2. **공개 스냅샷 갱신 절차 — `fix/snapshot-refresh`**
   - 확인됨: 수집과 `_publish_snapshots.mjs` 게시가 분리돼 있고, 게시 스크립트는
     테이블을 재생성한다. API 자체에는 D1→번들 폴백이 있다.
   - 완료: 로컬에서 수집 결과 형식·건수·신선도·급감을 검증하고, 실패하면 기존
     스냅샷을 유지한다. 원격 게시는 소유자가 검토 후 실행한다.

3. **계정 API E2E — `fix/account-flow-tests`**
   - 확인됨: 단위·로컬 DB 테스트는 있지만 로컬 모의 학교 인증이 없다.
   - 완료: 로그인 이후 조회→프로필 저장→409 충돌→로그아웃/재로그인→계정
     삭제와 두 계정 격리를 재현 가능한 테스트로 만든다. 실제 학교 인증 구간은
     별도의 수동 검증으로 명시한다.

확장 계약도 검수한다. 현재 master의 `extension/background.js` 성공 응답은
`{ payload }`인데 `extension/app-bridge.js`는 `res.ok && res.payload`를 요구한다.
따라서 실제 성공 결과도 UI에 `failed`로 전달될 수 있다. 이 불일치는 코드에서
확인됐지만 실제 Chrome 통합 재현은 아직 하지 않았다. PR #3에는 관련 수정과
테스트가 포함돼 있으므로 최초 연결·갱신·계정 전환의 실제 결과를 추가 확인한다.

## 9. 운영 경계

루트 저장소가 개발 원본이고 `published-personal/`은 배포용 별도 저장소다.
두 저장소가 자동으로 같아진다고 가정하지 않는다. PR에는 루트에서 검증한 커밋을
기록하고, 소유자가 동기화·독립 빌드·배포·프로덕션 확인을 수행한다.

다음 항목은 B가 임의로 실행하지 않는다.

- `wrangler ... --remote`, 원격 D1 SQL, 원격 스냅샷 게시
- `published-personal` push 또는 프로덕션 배포
- 운영 계정·시크릿·실제 학생 데이터 조회

운영 변경이 필요하면 코드, 마이그레이션, 롤백 방법, 로컬 검증 결과를 PR로
준비하고 소유자에게 실행할 정확한 명령과 기대 결과를 넘긴다.
