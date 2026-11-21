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

## Capacitor 도입 시 순서 (준비 단계)

1. `npx @capacitor/cli init` — `dist` 빌드 산출물을 `webDir`로 지정,
   `capacitor.config.ts`에 프로덕션 URL 또는 번들 정적 서빙 결정
   (원격 URL 로딩이면 Workers 배포로 웹 갱신이 즉시 반영되지만,
   오프라인 초기 화면과 심사의 '웹사이트 래핑' 인상 완화엔 번들 서빙이 유리)
2. `@capacitor/push-notifications` — APNs 등록 → 기존
   `push_subscriptions` 스키마에 네이티브 토큰 타입 추가 → `push-worker`
   발송 경로 분기 (웹 푸시 endpoint vs FCM/APNs 토큰)
3. 심사 자료: `/privacy`(이미), 계정 삭제 경로(이미), UGC 모더레이션
   절차(`docs/moderation.md`), 데모 계정 또는 체험 모드 진입 경로 제공
   — 심사자가 계정 없이 진입 가능해야 함
4. 실기기 확인 필요: iOS 푸시 수신, 딥링크/뒤로가기, 오프라인 첫 화면,
   결제 없음 명시(앱 내 구매 미사용 — 심사 간소화)

## 미결 확인 항목 (실기기/계정 필요)

- iOS PWA 푸시 실수신(설치 PWA + 토글 ON 상태에서 `push-worker` 경유)
- Android Chrome 웹 푸시 수신 — 코드상 지원이나 기기 확인은 아직
- Apple 개발자 계정 소유 여부 — 없으면 $99/년 신규 등록 필요
- 스토어 등재 시 앱 이름·판매자 명의(개인/단체) 정책 결정
