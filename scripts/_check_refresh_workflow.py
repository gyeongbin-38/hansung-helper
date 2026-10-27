"""Detect a missed daily refresh schedule by checking its latest success."""
import json
import os
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen


TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "")
MAX_AGE = timedelta(hours=26)

if not TOKEN or not REPOSITORY:
    raise SystemExit("GITHUB_TOKEN and GITHUB_REPOSITORY are required")

url = (
    f"https://api.github.com/repos/{REPOSITORY}/actions/workflows/"
    "refresh-public-snapshots.yml/runs?status=completed&per_page=20&sort=created&direction=desc"
)
request = Request(
    url,
    headers={
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {TOKEN}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "hansung-helper-monitor",
    },
)
with urlopen(request, timeout=20) as response:
    runs = json.load(response).get("workflow_runs", [])
successful = next(
    (run for run in runs if run.get("conclusion") == "success"), None
)
if not successful:
    raise SystemExit("no successful public snapshot refresh run found")

finished = datetime.fromisoformat(
    successful["updated_at"].replace("Z", "+00:00")
).astimezone(timezone.utc)
age = datetime.now(timezone.utc) - finished
if age < timedelta(minutes=-5) or age > MAX_AGE:
    run_url = successful.get("html_url", "unknown")
    raise SystemExit(
        f"last refresh succeeded {age} ago; expected within 26 hours: {run_url}"
    )
print(f"OK: last refresh succeeded at {finished.isoformat()}")
