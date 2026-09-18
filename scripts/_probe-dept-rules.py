import urllib.request
import sys
import io
import re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

UA = {'User-Agent': 'Mozilla/5.0'}

def get(u):
    req = urllib.request.Request(u, headers=UA)
    return urllib.request.urlopen(req, timeout=15).read().decode('utf-8', errors='replace')

# 대학·대학원 페이지에서 학과 사이트 링크 탐색
for u in [
    'https://www.hansung.ac.kr/hansung/6081/subview.do',
    'https://enter.hansung.ac.kr/',
]:
    try:
        html = get(u)
        print('===', u, len(html))
        links = re.findall(r'href="([^"]+)"[^>]*>([^<]{0,50})', html)
        deptish = [
            (h, re.sub(r'\s+', ' ', l).strip())
            for h, l in links
            if re.search(r'학과|학부|전공|트랙', l) and re.search(r'subview|index|[A-Z]{2,}', h)
        ]
        seen = set()
        for h, l in deptish[:60]:
            if h in seen:
                continue
            seen.add(h)
            print('  ', h[:90], '|', l[:40])
    except Exception as e:
        print('===', u, 'FAIL', e)
