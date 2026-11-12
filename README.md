# 한성 학사 도우미

한성대학교 학생의 수업·시간표·학사일정·비교과·졸업 준비를 돕는 비공식 서비스입니다.

## 팀 로컬 실행

Node.js 22.13 이상, Python 3.10 이상을 설치하고 아래 명령을 실행합니다.

```sh
npm ci
npm run dev:backend
```

`dev:backend`는 빌드 → 로컬 전용 계정 키 준비 → 두 D1 마이그레이션 → `http://127.0.0.1:8787` 실행을 순서대로 처리합니다. `.dev.vars`의 기존 키는 유지하고 출력하지 않습니다. 운영 비밀값을 복사할 필요가 없습니다. `npm run dev`는 D1이 없는 화면 개발·체험용입니다.

로컬 DB는 `dist/server/.wrangler/state`에 있으므로 재빌드 시 초기화될 수 있습니다. AI 없이 실행하면 기본 학사 안내가 동작합니다. 실제 AI도 확인하려면 Cloudflare 인증 후 `HANSUNG_ENABLE_AI=1` 환경변수로 빌드하세요. 로컬 AI 호출도 Cloudflare 계정의 사용량에 포함됩니다.

```sh
npm run verify
npm run test:db
npm run test:http # 8787 서버 필요
```

검증을 마친 `feat/` 또는 `fix/` 브랜치로 PR을 작성합니다. `master` 병합은 CI 통과와 리뷰가 필요합니다. 운영 배포는 소유자가 수행합니다. 상세 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md), 브랜치 대조 결과는 [통합 현황](docs/integration-status.md), AI 구현은 [AI 도우미](docs/ai-advisor.md)를 참고하세요.
