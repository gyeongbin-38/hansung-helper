# 앱스토어 배포 전략 비교

이 앱을 스토어에 올리는 세 경로를 비교한다. 현재 자산과 심사 요건을
기준으로 정리한 결정용 메모 — 실기기 확인이 필요한 항목은 표기한다.

## 현재 자산

- PWA: `manifest`(standalone) + `public/sw.js` 서비스워커 — 이미 설치 가능
- 웹 푸시: VAPID(`VAPID_JWK`) + `push_subscriptions` + `push-worker/` 크론
  발송 — 웹 푸시 인프라 완비
- 심사 대응: `/privacy`, `/terms`, 계정 삭제·데이터 삭제, UGC 신고·차단·
  모더레이션 API(`docs/moderation.md`), 학교 자격 분리(비밀번호 미저장,
  세션 볼트 AES-GCM·TTL)
- 배포: Cloudflare Workers 단일 오리진 — 래퍼도 같은 URL을 감싸면 된다

## 경로 비교

| | PWA-only | Capacitor | Bubblewrap (TWA) |
|---|---|---|---|
| 플랫폼 | iOS+Android+데스크톱 | iOS+Android | Android만 |
| 스토어 등재 | 불가(설치는 홈 화면 추가) | 가능 | 가능 (Google Play) |
| 푸시 | iOS 16.4+ 설치 PWA만 가능, Android 웹 푸시 정상 | 네이티브 APNs/FCM으로 안정적 | Android 웹 푸시 그대로 |
| 개발자 계정 | 없음 | Apple $99/년 + Google $25 | Google $25 |
| 유지보수 | 0 (지금과 동일) | 네이티브 프로젝트 2개 + 플러그인 갱신 | TWA 래퍼 1개 |
| 심사 리스크 | 없음 | 4.2(최소 기능) — 웹사이트 래핑만으론 리젝 가능 | 낮음 (TWA는 웹앱 전용 트랙) |

### PWA-only
- 장점: 추가 비용·유지보수 없음, 지금 그대로. 수강신청 알림은 Android에선
  이미 동작.
- 한계: iOS 푸시는 "홈 화면에 추가"한 PWA에서만(iOS 16.4+) 동작하고 설정
  진입점이 숨어 있어 실사용률이 낮다. 스토어 노출 없음.
- 할 일: 설치 안내 개선(iOS '홈 화면에 추가' 가이드) — 비용 없이 체감 개선.

### Capacitor (iOS+Android)
- 웹앱을 네이티브 셸로 감싸고 `PushNotifications` 플러그인으로
  APNs/FCM을 쓴다. 단일 코드베이스로 양 스토어.
- 장점: 스토어 등재 + 안정적 네이티브 푸시 + 네이티브 UI(스플래시·공유
  시트 등) 확장 여지.
- 리스크: App Store 심사 4.2 — "웹사이트를 감싼 것"만으로는 리젝 위험.
  완화: 푸시 알림(네이티브 기능 사용), 오프라인 스냅샷 폴백, 앱 아이콘·
  스플래시, 기기 분량 UGC 보호 장치(이미 구현)를 심사 자료로 제시.
- 비용: Apple 개발자 $99/년 필수 + Xcode/맥 빌드 필요. 유지보수는
  Capacitor/플러그인 갱신 주기가 생긴다.

### Bubblewrap / TWA (Android)
- 같은 웹 오리진을 Trusted Web Activity로 감싸 Play 등재. Digital Asset
  Links(`assetlinks.json`)로 소유권 증명.
- 장점: 웹 푸시·서비스워커가 그대로 동작, 래퍼가 얇아 유지보수 최소,
  Android 점유율이 높은 국내 학생층에 실효적.
- 한계: iOS는 전혀 커버 못 함 — iOS 푸시·스토어 문제는 그대로.

## 권장

**1단계(지금)**: PWA-only 유지 + 설치·푸시 온보딩 개선. 비용 0, 리스크 0.

**2단계(스토어 필요 시)**: Capacitor. 이유:
- iOS가 결정적 차이 — Bubblewrap은 iOS를 건드리지 못해 iOS 푸시·스토어
  문제가 그대로 남는다. 한국 학생 iOS 점유율을 보면 iOS 미커버는 반쪽짜리.
- 이 앱의 핵심 차별(마감 푸시)이 iOS에서 스토어 등재 없이는 사실상 무력.
- 심사 4.2 리스크는 "졸업 계획 도구 + 오프라인 스냅샷 + 네이티브 푸시"라는
  단순 뷰어 이상의 가치로 대응 가능 — UGC 보호 장치가 이미 갖춰져 있는 것도
  심사 답변에 유리.

**Bubblewrap은 Capacitor 도입 전 Android만 먼저 낼 때의 선택지** — iOS
계획이 없다면 가장 저렴한 스토어 경로.

## Capacitor 구현 현황 (착수 완료)

방향은 분석대로 **Capacitor + 원격 URL 로딩**으로 확정했다. 앱 전체가
Worker에 의존하므로 정적 번들 서빙은 불가 — `capacitor.config.ts`의
`server.url`이 프로덕션을 가리키고, `webDir`(`native-web/`)은 연결 실패
시 보이는 최소 셸만 담는다.

구현된 것:
- `ios/`, `android/` 네이티브 프로젝트 (appId `dev.gyeongbin38.hansunghelper`,
  표시명 학사부기) — iOS `App.entitlements`(aps-environment=development)
  와 Android `POST_NOTIFICATIONS` 권한까지 세팅됨
- 네이티브 푸시 파이프라인: `POST /api/push/native`(토큰 등록, DELETE 해제)
  → `native_push_tokens` 테이블(0009) → `dispatchLmsReminders`가 웹·네이티브
  양 채널로 발송. 클라이언트는 토글 ON 시 APNs/FCM 토큰을 등록하고 알림 탭
  시 `data.link` 해시 라우트로 이동
- 발송 모듈 `lib/server/native-push.ts` — APNs ES256 JWT + FCM v1
  (서비스 계정 OAuth). 비밀값 미설정 채널만 조용히 꺼진다
- 웹 UX 분기: 네이티브 안에서 설치 힌트 억제, 알림 토글은 플러그인 권한 경로

실기기/계정이 필요한 남은 단계:
1. **Apple 개발자 계정**($99/년) → Xcode에서 Signing 팀 지정 + mac에서
   `npx cap open ios`로 빌드. APNs 키(.p8) 발급 후 Worker 비밀값 설정:
   `APNS_KEY_ID`·`APNS_TEAM_ID`·`APNS_KEY`(.p8 내용)·`APNS_TOPIC`(기본
   번들 ID)·`APNS_SANDBOX=1`(개발 빌드 시) — 메인 워커와 `push-worker`
   양쪽에 같은 값
2. **Firebase 프로젝트** → `google-services.json`을 `android/app/`에 배치
   (gitignore 처리됨 — 커밋 금지) + 서비스 계정 JSON을 `FCM_SERVICE_ACCOUNT`
   비밀값으로 설정(양 워커)
3. Android Studio에서 빌드 또는 `npx cap open android`
4. 심사 자료: `/privacy`(이미), 계정 삭제 경로(이미), UGC 모더레이션
   절차(`docs/moderation.md`), 체험 모드 진입 경로(아래)
5. 실기기 확인 필요: iOS 푸시 수신, 딥링크/뒤로가기, 오프라인 첫 화면,
   결제 없음 명시(앱 내 구매 미사용 — 심사 간소화)

## 심사자 진입 경로 (App Review 준비)

심사자는 계정 없이 앱의 전체 흐름을 확인할 수 있어야 한다.

- **체험 모드**: 로그인 화면 하단 `연결 없이 둘러보기` — 계정 없이 모든
  섹션 진입 가능, 데이터는 브라우저 localStorage(`hansung-demo-v1`)에만
  저장. 심사 노트에 "로그인 없이 둘러보기로 전체 기능 확인 가능"을 명시.
- **학교 계정 연결 없이**: 수기 입력으로 이수 과목·학과를 등록하면 졸업
  요건·지도·학기 계획이 모두 동작 — 공식 계정을 심사자에게 줄 필요 없음.
- **UGC**: 커뮤니티는 익명 별명 + 신고·차단·운영자 모더레이션
  (`docs/moderation.md`), `/terms`에 이용 규칙 — App Review 메모에
  moderation 연락 창구로 운영자 이메일을 적는다.
- **권한 설명**: 알림 권한은 사용자가 토글을 켤 때만 요청 — iOS는 설치된
  웹앱에서만 동작함을 안내 문구에 반영(설치 힌트 참조).
- **결제**: 앱 내 구매·구독 없음 — IAP 미사용으로 심사 범위가 줄어든다.

## 미결 확인 항목 (실기기/계정 필요)

- iOS PWA 푸시 실수신(설치 PWA + 토글 ON 상태에서 `push-worker` 경유)
- Android Chrome 웹 푸시 수신 — 코드상 지원이나 기기 확인은 아직
- Apple 개발자 계정 소유 여부 — 없으면 $99/년 신규 등록 필요
- 스토어 등재 시 앱 이름·판매자 명의(개인/단체) 정책 결정
