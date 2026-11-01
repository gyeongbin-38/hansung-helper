import contextlib
import importlib.util
import io
import json
import pathlib
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "_verify_prod.py"
SPEC = importlib.util.spec_from_file_location("verify_prod", SCRIPT)
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)


class Handler(BaseHTTPRequestHandler):
    failing = False

    def do_GET(self):
        if self.failing:
            self.send_error(503, "upstream unavailable")
            return
        if self.path == "/":
            content_type, body = "text/html; charset=utf-8", b"<html>ok</html>"
        elif self.path == "/lms-collect.js":
            content_type, body = "text/javascript", b"// dotbugi"
        elif self.path == "/api/courses":
            content_type, body = "application/json", json.dumps(
                {"ok": True, "data": {"sections": [{"id": "s1"}]}}
            ).encode()
        elif self.path == "/api/schedule":
            content_type, body = "application/json", json.dumps(
                {"ok": True, "data": {"eventCount": 1, "items": [{}]}}
            ).encode()
        elif self.path == "/api/dept-rules":
            content_type, body = "application/json", json.dumps(
                {"ok": True, "data": {"itemCount": 1, "items": [{}]}}
            ).encode()
        elif self.path == "/api/activities":
            content_type, body = "application/json", json.dumps(
                {"ok": True, "data": {"itemCount": 1, "items": [{}]}}
            ).encode()
        else:
            content_type, body = "image/svg+xml", b"<svg/>"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


class VerifyProdTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        VERIFY.BASE = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_all_endpoints_pass(self):
        Handler.failing = False
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(VERIFY.verify(), 0)

    def test_all_endpoints_failing_returns_nonzero(self):
        Handler.failing = True
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(VERIFY.verify(), 1)


if __name__ == "__main__":
    unittest.main()
