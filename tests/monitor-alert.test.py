import importlib.util
import os
import pathlib
import unittest
from unittest.mock import patch


SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "_notify_monitor.py"


class MonitorAlertTests(unittest.TestCase):
    def load_module(self, result):
        env = {
            "GITHUB_TOKEN": "test-token",
            "GITHUB_REPOSITORY": "owner/repo",
            "MONITOR_NAME": "test monitor",
            "GITHUB_RUN_ID": "123",
            "MONITOR_RESULT": result,
        }
        with patch.dict(os.environ, env):
            spec = importlib.util.spec_from_file_location("notify_monitor", SCRIPT)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        return module

    def test_failure_creates_only_one_issue(self):
        module = self.load_module("failure")
        calls = []

        def fake_request(path, method="GET", body=None):
            calls.append((path, method, body))
            if method == "GET":
                return []
            return {"number": 5}

        with patch.dict(os.environ, {"MONITOR_RESULT": "failure"}), patch.object(
            module, "request", side_effect=fake_request
        ):
            module.main()
        self.assertEqual([call[1] for call in calls], ["GET", "POST"])
        self.assertEqual(calls[-1][0], "/issues")

    def test_recovery_comments_and_closes_issue(self):
        module = self.load_module("success")
        calls = []

        def fake_request(path, method="GET", body=None):
            calls.append((path, method, body))
            if method == "GET":
                return [{"number": 5, "title": module.TITLE}]
            return {}

        with patch.dict(os.environ, {"MONITOR_RESULT": "success"}), patch.object(
            module, "request", side_effect=fake_request
        ):
            module.main()
        self.assertEqual(calls[1][0], "/issues/5/comments")
        self.assertEqual(calls[2][1:], ("PATCH", {"state": "closed"}))


if __name__ == "__main__":
    unittest.main()
