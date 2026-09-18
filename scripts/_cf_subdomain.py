"""Register a workers.dev subdomain for the account using wrangler's OAuth token."""
import json
import os
import re
import urllib.request
import urllib.error

CFG = r'C:\Users\82107\AppData\Roaming\xdg.config\.wrangler\config\default.toml'
ACCOUNT = '49fee1882b3ee6e252c8f1dbe741684a'

toml = open(CFG, encoding='utf-8').read()
token = re.search(r'oauth_token\s*=\s*"([^"]+)"', toml).group(1)

def api(method, path, body=None):
    req = urllib.request.Request(
        f'https://api.cloudflare.com/client/v4{path}',
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

for sub in ['gyeongbin-38', 'gyeongbin38', 'hansung-helper']:
    code, res = api('PUT', f'/accounts/{ACCOUNT}/workers/subdomain', {'subdomain': sub})
    print(sub, '→', code, json.dumps(res.get('result', res.get('errors')), ensure_ascii=False)[:300])
    if code in (200, 201):
        print('REGISTERED:', sub)
        break
