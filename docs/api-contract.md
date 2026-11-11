# API response contract

Application JSON endpoints use the same envelope:

```json
{"ok":true,"data":{}}
```

The uptime endpoint `/api/health` is an exception: it returns `{ "ok": true,
"now": <epoch milliseconds> }` without a `data` field.

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

Profile saves accept optional `notifEnabled` (boolean) and `notifiedIds`
(up to 200 strings of at most 200 characters). When an older client omits
either field, the previously stored value is preserved. An explicit `false`
or empty array is saved; invalid values are rejected with 400.

`GET /api/graduation-reference` returns the user-provided graduation research
as reference-only data, with its 2026-11-08 date, individual source URLs,
original review statuses and the 2026 program catalog. Optional `department`
and `track` query parameters exactly filter the 2026 program list only; they
do not infer a student's program or filter other reference sections. Unknown
matches return an empty list. The endpoint does not determine graduation
eligibility or apply the 2027 reorganization retroactively. Malformed or
duplicate filters and unrecognized parameters return 400.
The importer reads the workbook's text tables in sheets 01–09; embedded
images in sheet 10 are not copied or interpreted. Re-import with
`python scripts/import-graduation-reference.py <xlsx>` after installing
`openpyxl`. The input workbook is not bundled into the application.

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
`missing` (메뉴 경로 미발견), `unconfirmed` (성적이 빈 과목 존재) 중 하나다. `upstream`은 네트워크 문제와 서버 오류를
구별하지 않는다. 기존 스냅샷에서는 이 필드가 없을 수 있으며, 실패 시 기존
정보 보존 규칙은 그대로다. 학교 응답 본문과 예외 메시지는 사유에 담지 않는다.

## 재수집 저장 충돌

현재 형식의 계정에서 `/api/account/lms-refresh`가 학교 응답을 기다리는 동안
다른 요청이 계정 snapshot을 변경했다면 해당 요청은 이전 상태를 덮지 않고
`409` (기존 오류 코드 `REQUEST_FAILED`)를 반환한다. 클라이언트는 최신 정보를 다시 불러온 뒤
재시도할 수 있다. 세션이 종료된 경우에는 `401`이다. 레거시 계정 이전 중의
경합 및 학교 요청 자체의 중복 방지는 이 보호에 포함되지 않는다.
