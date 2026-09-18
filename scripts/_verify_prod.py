"""Verify the deployed hansung-helper worker endpoints."""
import urllib.request
import json

BASE = 'https://hansung-helper.gyeongbin-38.workers.dev'
CHECKS = [
    ('/', 'text/html', None),
    ('/lms-collect.js', None, 'dotbugi'),
    ('/api/courses', 'json', None),
    ('/api/schedule', 'json', None),
    ('/api/dept-rules', 'json', None),
    ('/api/activities', 'json', None),
    ('/favicon.svg', None, None),
]
for path, kind, needle in CHECKS:
    try:
        req = urllib.request.Request(BASE + path, headers={'User-Agent': 'verify/1.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            status = r.status
            ct = r.headers.get('Content-Type', '')
    except Exception as e:
        print(f'{path:28} FAIL {e}')
        continue
    note = ''
    if kind == 'json':
        try:
            j = json.loads(body)
            note = f'json keys={list(j)[:4] if isinstance(j, dict) else f"list[{len(j)}]"}'
        except Exception:
            note = 'NOT-JSON'
    if needle:
        note = 'has-dotbugi' if needle.encode() in body else 'MISSING-needle'
    print(f'{path:28} {status} {len(body):>7}B  {ct[:40]:40} {note}')
