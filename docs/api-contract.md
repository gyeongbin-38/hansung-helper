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
