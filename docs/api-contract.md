# API response contract

All JSON endpoints use the same envelope:

```json
{"ok":true,"data":{}}
```

Errors keep an HTTP error status and return:

```json
{"ok":false,"error":{"code":"AUTH_REQUIRED","message":"다시 로그인해 주세요."}}
```

The shared status codes are `INVALID_REQUEST` (400), `AUTH_REQUIRED` (401),
`FORBIDDEN` (403), `PAYLOAD_TOO_LARGE` (413), `RATE_LIMITED` (429),
`SERVICE_UNAVAILABLE` (503), and `REQUEST_FAILED` for other server errors.
Client fetch timeouts and network failures use `TIMEOUT` and `NETWORK_ERROR`;
malformed JSON uses `INVALID_RESPONSE`.

The client helper unwraps only successful envelopes and surfaces the same
`message` for account and public-data requests. Account APIs remain
`Cache-Control: no-store, private` and vary by cookie.

LMS partial collection remains data inside a successful account response:
course `errors[]`, task `uncertain`, `lmsPending`, and `lmsFailedAt` distinguish
partial or unfinished collection from a confirmed empty list. A complete
request failure uses the common HTTP error envelope.

For COSMOS, `timeout` means a course was not started before the collection
deadline; `timeout-partial` marks a deadline reached during a course. In the
latter case the individual `vod`, `assign` and `quiz` errors identify failed
lists, allowing successful lists to remain current. This does not claim a
deadline over school login or the separate academic-information collector.

For a task with `uncertain: true`, optional `statusRetainedAt` records when
its retained submission/attempt status was last confirmed. The course's
`retainedAtByKind` describes a retained list; it may have a later timestamp
than an individual uncertain status. Older snapshots may omit either field.
The server-side LMS merge ignores snapshot timestamps more than five minutes
ahead of the server clock. A retained list or status timestamp later than its
own snapshot is untrusted and omitted rather than treated as a confirmed time.
Client-device clock and legacy-data migration behavior remain separate concerns.

## 종합정보 수집 진단

종합정보 스냅샷의 `diag.pages`에는 기존 `slot`, `path`, `ok` 외에 실패한
페이지의 선택 필드 `reason`이 추가될 수 있다. 값은 `session-expired` (로그인
화면 감지), `upstream` (요청·응답 오류), `structure` (성적표 필수 구조 미인식),
`missing` (메뉴 경로 미발견) 중 하나다. `upstream`은 네트워크 문제와 서버 오류를
구별하지 않는다. 기존 스냅샷에서는 이 필드가 없을 수 있으며, 실패 시 기존
정보 보존 규칙은 그대로다. 학교 응답 본문과 예외 메시지는 사유에 담지 않는다.
