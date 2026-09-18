import urllib.request
import sys
import io
import re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

UA = {'User-Agent': 'Mozilla/5.0'}

def get(u):
    req = urllib.request.Request(u, headers=UA)
    return urllib.request.urlopen(req, timeout=15).read().decode('utf-8', errors='replace')

# 단과대학 슬러그 홈페이지에서 학과 링크 + 졸업요건 링크 탐색
for slug in ['CreCon', 'Design', 'HmnArt', 'LibArt', 'SclScn', 'cncschool', 'futureplus', 'global']:
    u = f'https://www.hansung.ac.kr/{slug}/index.do'
    try:
        html = get(u)
        print('===', slug, len(html))
        links = re.findall(r'<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,60}?)</a>', html)
        seen = set()
        for href, lab in links:
            t = re.sub(r'<[^>]+>|\s+', ' ', lab).strip()
            if re.search(r'학과|학부|전공|졸업', t) and len(t) < 40 and (href, t) not in seen:
                seen.add((href, t))
                print('  ', href[:90], '|', t)
    except Exception as e:
        print('===', slug, 'FAIL', type(e).__name__, str(e)[:60])
