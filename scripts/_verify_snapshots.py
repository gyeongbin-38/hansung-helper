"""Verify public snapshot API content and freshness after publication."""
import json
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE = "https://hansung-helper.gyeongbin-38.workers.dev"
MAX_AGE = timedelta(hours=36)
CHECKS = {
    "/api/activities": "itemCount",
    "/api/schedule": "eventCount",
}


def check(path: str, count_key: str) -> None:
    last_error: Exception | None = None
    # D1 snapshot reads are cached per Worker isolate for up to 60 seconds.
    for attempt in range(7):
        try:
            request = Request(
                BASE + path,
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
        for endpoint, count_key in CHECKS.items():
            check(endpoint, count_key)
    except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError) as error:
        raise SystemExit(f"snapshot verification failed: {error}") from error
