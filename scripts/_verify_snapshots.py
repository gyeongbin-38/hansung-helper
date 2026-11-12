"""Verify public snapshot API content and freshness after publication."""
import json
import sys
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import quote


BASE = "https://hansung-helper.gyeongbin-38.workers.dev"
MAX_AGE = timedelta(hours=36)
CHECKS = {
    "/api/activities": "itemCount",
    "/api/schedule": "eventCount",
}


def check(path: str, count_key: str, expected_fetched_at: str | None = None) -> None:
    last_error: Exception | None = None
    # D1 snapshot reads are cached per Worker isolate for up to 60 seconds.
    for attempt in range(7):
        try:
            cache_key = f"?snapshot-check={quote(expected_fetched_at, safe='')}" if expected_fetched_at else ""
            request = Request(
                BASE + path + cache_key,
                headers={"User-Agent": "hansung-helper-snapshot-check/1.0"},
            )
            with urlopen(request, timeout=30) as response:
                if response.status != 200:
                    raise RuntimeError(f"{path}: HTTP {response.status}")
                payload = json.load(response)

            if (
                not isinstance(payload, dict)
                or payload.get("ok") is not True
                or not isinstance(payload.get("data"), dict)
            ):
                raise RuntimeError(f"{path}: invalid API success envelope")
            payload = payload["data"]
            if not isinstance(payload.get("items"), list):
                raise RuntimeError(f"{path}: invalid snapshot shape")
            items = payload["items"]
            if not items or payload.get(count_key) != len(items):
                raise RuntimeError(f"{path}: empty items or inconsistent {count_key}")
            fetched_at = payload.get("fetchedAt")
            if not isinstance(fetched_at, str):
                raise RuntimeError(f"{path}: missing fetchedAt")
            if expected_fetched_at is not None and fetched_at != expected_fetched_at:
                raise RuntimeError(f"{path}: published generation does not match the new snapshot")
            timestamp = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
            age = datetime.now(timezone.utc) - timestamp.astimezone(timezone.utc)
            if age < timedelta(minutes=-5) or age > MAX_AGE:
                raise RuntimeError(f"{path}: stale or future fetchedAt ({fetched_at})")
            print(f"OK {path}: {len(items)} items, fetchedAt={fetched_at}")
            return
        except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError) as error:
            last_error = error
            if attempt < 6:
                time.sleep(15)
    raise RuntimeError(f"{path}: verification failed after cache wait: {last_error}")


if __name__ == "__main__":
    try:
        requested = sys.argv[1:]
        if requested not in ([], ["--only=/api/dept-rules"], ["--only=/api/dept-rules", "--match-local"]):
            raise ValueError("unsupported snapshot selection")
        selected = {"/api/dept-rules": "itemCount"} if requested else CHECKS
        expected = None
        if "--match-local" in requested:
            expected = json.loads(Path("lib/data/dept-rules.json").read_text(encoding="utf-8")).get("fetchedAt")
            if not isinstance(expected, str) or not expected:
                raise ValueError("local department snapshot lacks fetchedAt")
        for endpoint, count_key in selected.items():
            check(endpoint, count_key, expected)
    except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError) as error:
        raise SystemExit(f"snapshot verification failed: {error}") from error
