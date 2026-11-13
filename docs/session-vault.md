# 학교 세션 볼트 (비밀번호 없이 재수집)

로그인·재인증 성공 시 학교 세션 쿠키를 AES-GCM으로 암호화해 D1에 짧게
보관하고, 비밀번호 없이 재수집할 때 재사용한다. **비밀번호는 저장하지
않는다.** 저장 대상은 `info.hansung.ac.kr`, `learn.hansung.ac.kr` 두 호스트의
세션 쿠키뿐이다.

## 동작

- 로그인(`/api/account/login`)·재인증(`/api/account/lms-refresh`) 성공 후
  `SchoolSession.exportCookies()`를 `saveSchoolSession`으로 암호화 저장.
- `POST /api/account/lms-refresh-session`이 볼트 쿠키로 `resumeSchool`을 실행:
  종합정보·COSMOS를 각각 프로브해 유효한 쪽만 수집하고, 양쪽 모두 무효면
  401(`X-Hansung-School-Session: expired`)을 돌려준다.
- 로그아웃·계정 삭제 시 즉시 삭제. 만료 행은 로그인 5% 확률 정리와 별도
  `expires_at` 인덱스로 정리된다.

## 보안 경계

- `lib/server/school-session-crypto.ts`: AES-GCM, 계정 id를 AAD로 묶어 타 계정
  복호화 불가, 호스트·쿠키명·값 크기 제한(최대 8KB), 키 버전 고정(1).
- TTL 2시간 고정. 재사용해도 `expires_at`은 늘리지 않고 `last_used_at`만
  갱신한다(세션 무한 연장 방지).
- 비밀 키 `SCHOOL_SESSION_KEY`는 32바이트 이상 무작위 값. 로컬은
  `scripts/setup-local.mjs`가 없을 때만 생성(기존 키 미교체). 프로덕션은
  `ACCOUNT_INDEX_HMAC_KEY`처럼 Worker secret으로 설정해야 하며 배포 스크립트가
  기존 키를 교체하지 않는다.
- 쿠키는 클라이언트로 절대 노출되지 않으며 로그에는 값·원문을 남기지 않는다.

## 한계

- 학교가 세션을 IP/UA에 묶으면 Worker egress 변경 시 무효화될 수 있다.
- 세션이 만료되면 비밀번호 재인증으로 돌아간다(수동 폴백 유지).
- 볼트는 "연결 유지"용이며 성적·학적 원본을 별도로 더 저장하지 않는다.
