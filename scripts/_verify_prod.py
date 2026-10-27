"""Verify HTTP status, content type, and required data on production endpoints."""
import json
import os
import sys
import urllib.error
import urllib.request


BASE = os.environ.get(
    "HANSUNG_VERIFY_BASE", "https://hansung-helper.gyeongbin-38.workers.dev"
).rstrip("/")
CHECKS = [
    ("/", "text/html", None),
    ("/lms-collect.js", "javascript", None),
    ("/api/courses", "json", "courses"),
    ("/api/schedule", "json", "schedule"),
    ("/api/dept-rules", "json", "dept-rules"),
    ("/api/activities", "json", "activities"),
    ("/favicon.svg", "image/svg+xml", None),
]


def validate_payload(
    path: str,
    content_kind: str | None,
    payload_kind: str | None,
    body: bytes,
    content_type: str,
) -> str:
    actual_type = content_type.lower()
    if content_kind == "json":
        if "application/json" not in actual_type:
            raise ValueError(f"wrong content type: {content_type or '(missing)'}")
        try:
            payload = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("response is not valid JSON") from error
        if not isinstance(payload, dict):
            raise ValueError("JSON envelope must be an object")
        if payload.get("ok") is not True or not isinstance(payload.get("data"), dict):
            raise ValueError("successful API envelope with object data is required")
        payload = payload["data"]

        if payload_kind == "courses":
            sections = payload.get("sections")
            if not isinstance(sections, list) or not sections:
                raise ValueError("required courses.sections data is missing")
            return f"sections={len(sections)}"

        items = payload.get("items")
        count_key = "eventCount" if payload_kind == "schedule" else "itemCount"
        if not isinstance(items, list) or not items:
            raise ValueError("required non-empty items data is missing")
        if payload.get(count_key) != len(items):
            raise ValueError(f"{count_key} does not match items length")
        return f"items={len(items)}"

    if content_kind == "javascript" and not (
        "javascript" in actual_type or "ecmascript" in actual_type
    ):
        raise ValueError(f"wrong content type: {content_type or '(missing)'}")
    if content_kind and content_kind not in actual_type:
        raise ValueError(f"wrong content type: {content_type or '(missing)'}")
    if not body:
        raise ValueError("empty response body")
    if path == "/lms-collect.js" and b"dotbugi" not in body:
        raise ValueError("expected LMS collector marker is missing")
    return f"{len(body)} bytes"


def verify() -> int:
    failures = 0
    for path, kind, payload_kind in CHECKS:
        try:
            request = urllib.request.Request(
                BASE + path, headers={"User-Agent": "hansung-helper-verify/1.0"}
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                status = response.status
                body = response.read()
                content_type = response.headers.get("Content-Type", "")
            if not 200 <= status < 300:
                raise ValueError(f"unexpected HTTP status {status}")
            detail = validate_payload(path, kind, payload_kind, body, content_type)
            print(f"{path:24} PASS HTTP {status} {detail}")
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            failures += 1
            print(f"{path:24} FAIL {error}")

    print(f"\n{len(CHECKS) - failures}/{len(CHECKS)} endpoints passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(verify())
