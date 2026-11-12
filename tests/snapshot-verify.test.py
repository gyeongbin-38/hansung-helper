import importlib.util
import io
import json
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("snapshot_verify", Path("scripts/_verify_snapshots.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
now = datetime.now(timezone.utc).isoformat()
other = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
if other == now:
    other = "2000-01-01T00:00:00+00:00"

class Response(io.BytesIO):
    status = 200
    def __init__(self, fetched):
        super().__init__(json.dumps({"ok": True, "data": {"items": [{}], "itemCount": 1, "fetchedAt": fetched}}).encode())

attempts = []
def delayed(request, timeout):
    attempts.append(request.full_url)
    return Response(other if len(attempts) == 1 else now)
module.urlopen = delayed
module.time.sleep = lambda _: None
module.check('/api/dept-rules', 'itemCount', now)
assert len(attempts) == 2 and 'snapshot-check=' in attempts[0]
module.urlopen = lambda request, timeout: Response(other)
try:
    module.check('/api/dept-rules', 'itemCount', now)
    raise AssertionError('old generation must not pass verification')
except RuntimeError as error:
    assert 'generation does not match' in str(error)
print('OK: department publication verifies the new generation, not merely freshness')
