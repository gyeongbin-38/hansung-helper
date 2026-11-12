"""Import user-supplied graduation research as reference data, not executable rules.

Requires openpyxl. Usage: python scripts/import-graduation-reference.py <xlsx>
The workbook is not copied or published; image captures are intentionally omitted.
"""
import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError as exc:
    raise SystemExit('Install openpyxl to import this workbook') from exc

if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/import-graduation-reference.py <xlsx>')

book = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=False)
mapping = {
    '01_공통기준': ('common', ['area', 'scope', 'requirement', 'notes', 'status', 'sourceUrl']),
    '02_교양학번': ('generalEducation', ['scope', 'minimum', 'requirements', 'notes', 'status', 'sourceUrl']),
    '03_2026학부트랙': ('programs2026', ['college', 'department', 'track', 'division', 'listingStatus', 'status', 'summary', 'notes', 'sourceUrl']),
    '04_학과별요건': ('departmentRequirements', ['area', 'departmentOrTrack', 'scope', 'requirements', 'notes', 'status', 'sourceUrl']),
    '05_비교과배점': ('activityPoints', ['area', 'activity', 'points', 'conditions', 'notes', 'status', 'sourceUrl']),
    '06_절차일정': ('procedures', ['procedure', 'period', 'actions', 'notes', 'scope', 'sourceUrl']),
    '07_2027개편': ('reorganization2027', ['category', 'before', 'after', 'change', 'notes']),
    '08_구학부전환': ('legacyPrograms', ['program', 'scope', 'requirements', 'notes', 'sourceUrl', 'status']),
    '09_공식출처': ('sources', ['id', 'title', 'use', 'date', 'url', 'scope']),
}
headers = {
    '01_공통기준': ['기준 영역', '적용 대상', '기준', '세부·예외', '확인상태', '공식 출처'],
    '02_교양학번': ['학번/대상', '교양 최소학점', '필수·선택 구조 요약', '주의·예외', '확인상태', '공식 출처'],
    '03_2026학부트랙': ['2026 단과대학', '학부·학과', '트랙/전공', '개설 모집단위', '목록 확인', '고유요건 확인상태', '요건 요약', '주의', '공식 목록/요건 URL'],
    '04_학과별요건': ['영역', '학과·트랙', '적용 학번/기간', '확인한 졸업요건', '원문/주의사항', '확인상태', '공식 출처'],
    '05_비교과배점': ['영역', '활동/시험', '배점·한도', '조건·세부기준', '증빙·주의', '확인상태', '공식 출처'],
    '06_절차일정': ['절차/일정', '기간·적용시점', '해야 할 일·조건', '주의', '적용범위', '공식 출처'],
    '07_2027개편': ['구분', '2026 체계', '2027 체계/안내 기준', '개편 내용', '적용·주의'],
    '08_구학부전환': ['문서/모집단위', '적용 시점', '확인된 내용', '주의', '공식 출처', '확인상태'],
    '09_공식출처': ['ID', '공식 자료명', '사용한 내용', '발행/관찰 시점', 'URL', '출처 범위'],
}

date = str(book['00_읽어주세요']['B3'].value or '')
match = re.match(r'^(\d{4}-\d{2}-\d{2})\b', date)
if not match:
    raise SystemExit('Workbook reference date is missing or invalid')
data = {'asOf': match.group(1), 'programCatalogYear': 2026, 'sections': {}}
for sheet_name, (key, keys) in mapping.items():
    if sheet_name not in book.sheetnames:
        raise SystemExit(f'Missing sheet: {sheet_name}')
    rows = book[sheet_name].iter_rows()
    header = next(rows, None)
    if not header or [cell.value for cell in header[:len(keys)]] != headers[sheet_name]:
        raise SystemExit(f'Invalid header: {sheet_name}')
    values = []
    for row in rows:
        if any(cell.data_type == 'f' for cell in row[:len(keys)]):
            raise SystemExit(f'Formula requires manual review: {sheet_name}')
        record = {name: str(row[i].value).strip() if row[i].value is not None else '' for i, name in enumerate(keys)}
        if any(record.values()):
            values.append(record)
    if not values:
        raise SystemExit(f'Empty section: {sheet_name}')
    data['sections'][key] = values
if len(data['sections']['programs2026']) != 66:
    raise SystemExit('Unexpected 2026 program count; review workbook before importing')
target = Path(__file__).resolve().parent.parent / 'lib/data/graduation-reference.json'
target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Imported reference sections:', ', '.join(f'{k}={len(v)}' for k, v in data['sections'].items()))
