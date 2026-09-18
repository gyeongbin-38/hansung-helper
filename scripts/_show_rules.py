import json
import urllib.request
import sys
import io
import re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0'}
d = json.load(open('lib/data/dept-rules.json', encoding='utf-8'))
for x in d['items']:
    if x['url'].endswith(('5625/subview.do', '5596/subview.do', '7579/subview.do')):
        print('===', x['deptLabel'] or '?', x['url'])
        for l in x['lines']:
            print('   ', l[:95])
        print()
# SclScn sitemap labels
html = urllib.request.urlopen(urllib.request.Request('https://www.hansung.ac.kr/sitemap/SclScn/view.do', headers=UA), timeout=15).read().decode('utf-8', errors='replace')
links = re.findall(r'href="(/SclScn/\d+/subview\.do)"[^>]*>([^<]{1,40})<', html)
print('SclScn labels:', sorted(set(l.strip() for _, l in links)))
