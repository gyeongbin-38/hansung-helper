# 협업 규칙

처음 참여한다면 [README](README.md)와 [백엔드 시작 안내](docs/BACKEND_ONBOARDING.md)를 먼저 읽는다.

## 브랜치

- `master` 직접 push 금지 — `feat/…` `fix/…` 브랜치로 작업 후 PR
- 머지 조건: **CI 통과 + 리뷰**
- `hansung-helper-deploy` 레포도 동일 규칙 (배포는 소유자만)

## 작업 한 개를 끝내는 순서

1. Issue에 문제·담당자·완료 조건·검증 방법을 적는다. 화면은 A, API·DB·수집은 B가 소유하고 API 계약은 함께 확인한다.
2. 최신 `master`에서 작업별 브랜치를 만든다. 서로 다른 작업은 브랜치를 나눈다.
3. 작은 범위로 수정한 뒤 공통 검사와 Issue의 검증을 실행한다.
4. 브랜치에 push하고 PR을 연다. `base`는 `master`, `compare`는 작업 브랜치다.
5. A의 PR은 B가, B의 PR은 A가 리뷰한다. 화면 변경은 기획·디자인 QA도 받는다.
6. CI `verify` 통과와 리뷰 후 merge하고 작업 브랜치를 삭제한다. 배포는 별도 소유자 절차다.

GitHub Desktop에서는 `master` 선택 → Fetch/Pull → New Branch → 수정·검사 → Commit → Publish/Push → Create Pull Request 순서다. 각자 PC에서 clone하며 현재 작업의 미커밋 변경을 먼저 확인한다.

```sh
git status
git switch master
git pull --ff-only origin master
git switch -c fix/release-check
```

위 명령 중 오류가 나면 그 상태를 확인한 뒤 다음 단계로 넘어간다. `git reset --hard`나 강제 push로 해결하지 않는다. 커밋할 때는 변경 파일을 확인하고 필요한 파일만 포함한다.

## 커밋 검증 — 사람·AI 공통

PR을 올리기 전에 아래를 **로컬에서 실제로 실행**해 통과해야 한다:

```sh
npm run verify
```

이 명령은 타입 검사 → `app/ lib/` 린트 → 기존 단위 테스트 매트릭스 → 메모리 SQLite 계정 검사 → 프로덕션 빌드를 순서대로 실행한다. 실패하면 뒤 단계는 실행하지 않는다. Python 실행 파일은 Windows/macOS/Linux에서 자동 탐색한다.

계정·API 변경 시 로컬 서버를 켠 다른 터미널에서 `npm run test:http`도 실행한다. 이 검사는 미인증·Origin·입력 거부만 확인한다. 실제 로그인 성공·수집·저장·삭제·다중 기기 병합은 변경 내용에 맞는 별도 검증 결과를 적는다.

같은 공통 검사가 CI(`.github/workflows/ci.yml`)에서 PR과 `master` push마다 자동 재실행된다.
CI는 추가로 임시 러너의 로컬 D1에 전체 마이그레이션을 적용하고 다시 실행해 중복 적용되지 않는지도 확인한다. 개발자의 로컬 DB나 원격 DB는 사용하지 않는다.
PR의 **Checks** 탭에서 결과 확인 — 로컬에서 안 돌린 커밋은 여기서 걸린다.

## AI 도구로 만든 커밋

- 위 검증 명령을 **실제로 실행**하고 결과를 PR 본문에 명시
- 커밋 메시지 또는 PR에 생성 도구 표기 (예: `Generated with …`)
- 실행하지 않은 코드, 추측으로 작성한 변경 커밋 금지
- 리뷰어는 Checks + PR 본문의 검증 결과를 확인

## 커밋 기록

첫 줄에는 변경 이유를 적는다. 예: `배포 실패를 정상으로 오인하지 않도록 한다`.
필요하면 본문에 제약과 접근 이유를 쓰고 `Tested:`, `Not-tested:`, `Scope-risk:` 같은 git trailer로 검증·한계를 남긴다. 실행하지 않은 검사를 통과했다고 적지 않는다.

## 저장소 설정

소유자는 `master`의 PR·CI `verify`·최소 1명 리뷰 승인을 유지한다. 개인 계정의 기본 collaborator는 코드 변경 권한이 있으므로, 팀원의 실제 GitHub 계정을 확인해 필요한 사람만 초대한다. 자동 배포 권한이나 Cloudflare 자격증명은 일반 로컬 개발에 필요하지 않다.

## 절대 금지

- 시크릿·`.env`·실계정 정보·`lms-data.json` 커밋
- 프로덕션 D1 데이터 직접 수정, `wrangler deploy` (소유자 전용)
- `dist/`·`node_modules`·`.wrangler` 상태 커밋
