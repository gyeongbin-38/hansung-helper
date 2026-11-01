"""Open one GitHub issue per failing monitor and close it after recovery."""
import json
import os
import sys
import urllib.error
import urllib.request


TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "")
MONITOR = os.environ.get("MONITOR_NAME", "production health")
RUN_URL = os.environ.get("GITHUB_SERVER_URL", "https://github.com") + "/" + REPOSITORY + "/actions/runs/" + os.environ.get("GITHUB_RUN_ID", "")
TITLE = f"[자동 모니터링] {MONITOR}"
API = f"https://api.github.com/repos/{REPOSITORY}"


def request(path: str, method: str = "GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {TOKEN}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "hansung-helper-monitor",
            **({"Content-Type": "application/json"} if data else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response) if response.status != 204 else None


def find_open_issue():
    page = 1
    while page <= 3:
        issues = request(f"/issues?state=open&per_page=100&page={page}")
        for issue in issues:
            if "pull_request" not in issue and issue.get("title") == TITLE:
                return issue
        if len(issues) < 100:
            return None
        page += 1
    return None


def main() -> None:
    if not TOKEN or not REPOSITORY:
        raise RuntimeError("GITHUB_TOKEN and GITHUB_REPOSITORY are required")
    issue = find_open_issue()
    if os.environ.get("MONITOR_RESULT") == "failure":
        body = (
            f"Automated monitor failed. Review the run log: {RUN_URL}\n\n"
            "This issue is updated instead of creating a new alert for every run."
        )
        if issue:
            request(f"/issues/{issue['number']}", "PATCH", {"body": body})
            print(f"Updated alert issue #{issue['number']}")
        else:
            created = request("/issues", "POST", {"title": TITLE, "body": body})
            print(f"Opened alert issue #{created['number']}")
    elif issue:
        request(
            f"/issues/{issue['number']}/comments",
            "POST",
            {"body": f"Monitor recovered. Successful run: {RUN_URL}"},
        )
        request(f"/issues/{issue['number']}", "PATCH", {"state": "closed"})
        print(f"Closed recovered alert issue #{issue['number']}")


if __name__ == "__main__":
    try:
        main()
    except (urllib.error.URLError, TimeoutError, RuntimeError, KeyError) as error:
        raise SystemExit(f"monitor alert delivery failed: {error}") from error
