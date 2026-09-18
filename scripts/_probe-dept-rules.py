import urllib.request
import sys
import io
import re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

UA = {'User-Agent': 'Mozilla/5.0'}

def get(u):
    req = urllib.request.Request(u, headers=UA)
    return urllib.request.urlopen(req, timeout=15).read().decode('utf-8', errors='replace')

html = get('https://www.hansung.ac.kr/sitemap/CreCon/view.do')
# 사이트맵 계층 구조 — 졸업요건 링크 주변의 학과 컨텍스트
# 링크들을 순서대로 추출하며 학과명 라벨을 추적
links = re.findall(r'<a[^>]+href="(/CreCon/\d+/subview\.do[^"]*)"[^>]*>([\s\S]{0,60}?)</a>', html)
for h, l in links:
    t = re.sub(r'<[^>]+>|\s+', ' ', l).strip()
    print(h[:40], '|', t[:60])
