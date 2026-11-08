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

For a task with `uncertain: true`, optional `statusRetainedAt` records when
its retained submission/attempt status was last confirmed. The course's
`retainedAtByKind` describes a retained list; it may have a later timestamp
than an individual uncertain status. Older snapshots may omit either field.
