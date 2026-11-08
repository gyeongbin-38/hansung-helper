# 재수집 중 세션 종료: 격리된 로컬 D1 경합 재현

실제 학교 서버 호출만 테스트 게이트로 대체한다. 인증, 이전 SQL, 로그아웃,
탈퇴 및 DB 쓰기는 애플리케이션 코드와 Wrangler 로컬 D1을 사용한다.
고정된 합성 계정과 임시 키만 사용하며 운영 DB나 실제 계정을 사용하지 않는다.

Windows PowerShell, Node 24 환경에서 이 커밋의 **깨끗한 별도 복사본**을
짧은 영문 경로에 풀고 그 복사본에서 아래 명령을 실행한다. 테스트는 복사본의
재수집 라우트를 변경하고 `.dev.vars`와 로컬 D1을 생성하므로 기존 작업본이나
운영 환경에서 실행하면 안 된다. 포트 18788과 18889가 비어 있어야 한다.

```powershell
New-Item .session-race-fixture -ItemType File
npm ci --no-audit --no-fund
python tests/manual/session-race/instrument.py
npm run build
node tests/manual/session-race/setup.cjs
npm run d1:migrate:local
node node_modules/wrangler/bin/wrangler.js d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file fixture.sql --json
```

별도 터미널에서 같은 복사본을 열고 다음을 실행해 로컬 서버를 유지한다.

```powershell
node node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --ip 127.0.0.1 --port 18788
```

서버가 준비되면 첫 터미널에서 다음을 실행한다.

```powershell
node tests/manual/session-race/race.cjs
```

인증 후 수집 요청을 대기시키고 로그아웃 또는 탈퇴한 다음 요청을 재개한다.
이전·현재 계정이 모두 있는 로그아웃 사례와 이전 계정만 있는 탈퇴 사례에서
재수집은 401이어야 하고 DB에 이전 쓰기가 없어야 한다. 세션이 유지된 대조
사례는 200과 정상 이전을 확인한다. 테스트는 LMS 실제 수집이나 원격 D1을
검증하지 않는다. 종료 후 로컬 서버를 중지하고 격리 복사본을 정리한다.
