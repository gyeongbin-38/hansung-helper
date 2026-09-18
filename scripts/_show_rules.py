import json
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
d = json.load(open('lib/data/dept-rules.json', encoding='utf-8'))
for x in d['items']:
    yt = x.get('yearTable')
    if yt:
        print('===', x['deptLabel'], x['url'].split('ac.kr/')[-1])
        print('cols:', [(c['label'], c.get('from'), c.get('to')) for c in yt['columns']])
        for r in yt['rows']:
            print(' ', r['label'], '=>', [c[:40] for c in r['cells']])
