"""Import a Hansung course catalog xlsx -> lib/data/catalog-YYYY-S.json

Source: data/source/hansung_all_departments_2026_2_exact_times.xlsx
Sheet used: '요일별 시간' (one row per course-section per meeting day).

Normalizes each (과목코드, 분반) into a section record with minute-precision
day/time slots. Sections without parseable times keep `untimed: true`
(online/async courses) instead of being dropped or faked.

Usage: python scripts/import-courses.py --semester 2027-1 --source path/to/catalog.xlsx
"""
import json
import argparse
import re
import sys
from pathlib import Path
from datetime import datetime, timezone

SRC = r'data/source/hansung_all_departments_2026_2_exact_times.xlsx'

DAY = {'월요일': 0, '화요일': 1, '수요일': 2, '목요일': 3, '금요일': 4, '토요일': 5, '일요일': 6}
# tokens inside 강의실및교시 that encode schedule, not location
TIME_TOKEN = re.compile(r'^([월화수목금토일]|[월화수목금토일]?\d+M?[-~]\d+M?|\d+시간|[,;/])+$')
DEPT_PREFIX = re.compile(r'^\[[A-Z0-9]+\]\s*')


def minutes(hhmm):
    h, m = hhmm.split(':')
    return int(h) * 60 + int(m)


def room_of(raw):
    """Extract the location fragment from '강의실및교시'.

    '공학관314 수1~6M' -> '공학관314'
    '온라인강좌 1시간 / 상상파크 AI실습실 화4~4M,금5~6M' -> '온라인강좌 / 상상파크 AI실습실'
    """
    if not raw:
        return ''
    kept = []
    for tok in re.split(r'[\s]+', str(raw).strip()):
        t = tok.rstrip(',;')
        if not t or TIME_TOKEN.match(t):
            continue
        # drop trailing schedule fragment like '화4~4M,금5~6M'
        kept.append(re.sub(r'[월화수목금토일]\d.*$', '', t))
    room = ' '.join(t for t in kept if t).strip(' /')
    return room or str(raw).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--semester', default='2026-2')
    parser.add_argument('--source', default=SRC)
    args = parser.parse_args()
    if not re.fullmatch(r'20\d{2}-[1-4]', args.semester):
        parser.error('semester must be YYYY-N (1,2=정규 3,4=계절)')
    if args.semester != '2026-2' and args.source == SRC:
        parser.error('provide the matching source file with --source')
    import openpyxl
    out_path = f'lib/data/catalog-{args.semester}.json'
    wb = openpyxl.load_workbook(args.source, read_only=True)
    ws = wb['요일별 시간']
    rows = ws.iter_rows(values_only=True)
    header = [str(c) for c in next(rows)]
    i = {name: header.index(name) for name in header}

    sections = {}
    skipped = 0
    for r in rows:
        if r[0] is None:
            continue
        key = (str(r[i['과목코드']]), str(r[i['분반']]))
        sec = sections.get(key)
        if sec is None:
            dept_raw = str(r[i['전공명']] or '')
            m = DEPT_PREFIX.match(dept_raw)
            sec = {
                'id': f'{key[0]}-{key[1]}',
                'code': key[0],
                'section': key[1],
                'name': str(r[i['과목명']] or '').strip(),
                'dept': DEPT_PREFIX.sub('', dept_raw).strip(),
                'deptCode': m.group(0)[1:-2] if m else '',
                'category': str(r[i['이수구분']] or '').strip(),
                'credits': int(float(r[i['학점']] or 0)),
                'year': str(r[i['학년']] or '').strip(),
                'professor': str(r[i['교수']] or '').strip(),
                'room': room_of(r[i['강의실및교시']]),
                'cross': str(r[i['교차가능']] or '').strip() == 'O',
                'online': '온라인' in str(r[i['강의실및교시']] or ''),
                'slots': [],
            }
            sections[key] = sec

        day = DAY.get(str(r[i['요일']] or ''))
        start = r[i['시작시각']]
        end = r[i['종료시각']]
        if day is None or not start or not end:
            skipped += 1  # untimed / unparsed row (online lecture etc.)
            continue
        slot = {'d': day, 's': minutes(str(start)), 'e': minutes(str(end))}
        if slot['e'] <= slot['s']:
            # upstream typo: end before/at start (e.g. 월 16:30~16:15).
            # Source file states Mon/Wed/Fri periods are 75 min, so extend
            # and flag the section rather than dropping or faking the slot.
            slot['e'] = slot['s'] + 75
            sec['timeFixed'] = True
            print(f'fixed inverted slot: {sec["id"]} {slot}')
        if slot not in sec['slots']:
            sec['slots'].append(slot)

    out_sections = []
    for sec in sections.values():
        if not sec['slots']:
            sec['untimed'] = True
            sec['online'] = True
        sec['slots'].sort(key=lambda s: (s['d'], s['s']))
        out_sections.append(sec)
    out_sections.sort(key=lambda s: (s['dept'], s['code'], s['section']))

    catalog = {
        'semester': args.semester,
        'source': '한성대학교 종합정보시스템 개설강의 시간표 (업로드 파일)',
        'sourceFile': Path(args.source).name,
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'sectionCount': len(out_sections),
        'untimedCount': sum(1 for s in out_sections if s.get('untimed')),
        'sections': out_sections,
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(',', ':'))
    print(f'sections={len(out_sections)} untimed={catalog["untimedCount"]} unparsed_rows={skipped}')
    print('wrote', out_path)


if __name__ == '__main__':
    sys.exit(main())
