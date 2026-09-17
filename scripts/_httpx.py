import json
import urllib.request
import urllib.error


def probe(url):
    try:
        req = urllib.request.Request(
            url, headers={'Origin': 'https://dividend-coastal-accent-operate.trycloudflare.com'}
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 0, str(e).encode()


for name, url in [
    ('local home', 'http://127.0.0.1:8787/'),
    ('local courses', 'http://127.0.0.1:8787/api/courses'),
    ('local account', 'http://127.0.0.1:8787/api/account'),
    ('public home', 'https://dividend-coastal-accent-operate.trycloudflare.com/'),
    ('public courses', 'https://dividend-coastal-accent-operate.trycloudflare.com/api/courses'),
]:
    code, body = probe(url)
    extra = ''
    if 'courses' in name and code == 200:
        try:
            extra = f" sections={json.loads(body)['sectionCount']}"
        except Exception:
            pass
    print(f'{name}: {code}{extra}')
