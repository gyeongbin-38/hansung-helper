import re
import urllib.request

BASE = 'https://hansung-helper.gyeongbin-38.workers.dev'
req = urllib.request.Request(BASE + '/', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
srcs = re.findall(r'(?:src|href)="(/_next/static/[^"]+\.js)"', html)
print('scripts:', srcs)
for src in srcs:
    try:
        r = urllib.request.Request(BASE + src, headers={'User-Agent': 'Mozilla/5.0'})
        js = urllib.request.urlopen(r, timeout=30).read().decode('utf-8', 'replace')
    except Exception as e:
        print('ERR', src, e)
        continue
    hits = [s for s in [
        '내 학사 위험 신호',
        '시간표 시나리오 비교',
        '학사 안내',
        '이번 주 마감',
        '현재 작업 중',
        '해당 없음',
        '이수 현황',
        'AI 상담',
        'MY CAMPUS',
    ] if s in js]
    print(src, len(js), 'bytes, hits:', hits)
