# 협업 규칙

## 브랜치

- `master` 직접 push 금지 — `feat/…` `fix/…` 브랜치로 작업 후 PR
- 머지 조건: **CI 통과 + 리뷰**
- `hansung-helper-deploy` 레포도 동일 규칙 (배포는 소유자만)

## 커밋 검증 — 사람·AI 공통

PR을 올리기 전에 아래를 **로컬에서 실제로 실행**해 통과해야 한다:

```
npx tsc --noEmit
npx oxlint app/ lib/
python scripts/_run_tests.py    # Linux/macOS면 python3
npm run build
```

같은 검사가 CI(`.github/workflows/ci.yml`)에서 push/PR마다 자동 재실행된다.
PR의 **Checks** 탭에서 결과 확인 — 로컬에서 안 돌린 커밋은 여기서 걸린다.

## AI 도구로 만든 커밋

- 위 검증 명령을 **실제로 실행**하고 결과를 PR 본문에 명시
- 커밋 메시지 또는 PR에 생성 도구 표기 (예: `Generated with …`)
- 실행하지 않은 코드, 추측으로 작성한 변경 커밋 금지
- 리뷰어는 Checks + PR 본문의 검증 결과를 확인

## 절대 금지

- 시크릿·`.env`·실계정 정보·`lms-data.json` 커밋
- 프로덕션 D1 데이터 직접 수정, `wrangler deploy` (소유자 전용)
- `dist/`·`node_modules`·`.wrangler` 상태 커밋
