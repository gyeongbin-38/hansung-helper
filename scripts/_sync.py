import os
import re
import subprocess
import sys

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DST = os.path.join(SRC, 'published-personal')

DIRS = ['app', 'lib', 'tests', 'scripts', 'docs', 'drizzle', 'data', 'public', 'extension']
FILES = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'next.config.ts',
    'AGENTS.md',
    'PROJECT_ARCHITECTURE.md',
    'wrangler.toml',
]

QUIET = ['/NFL', '/NDL', '/NJH', '/NJS', '/NP']
CHECK = '--check' in sys.argv


def sync_dir(d):
    args = [
        'robocopy',
        SRC + '\\' + d,
        DST + '\\' + d,
        '/MIR',
        '/XF',
        '_*',
        'cloudflared.exe',
        '_tunnel.log',
        '.env*',
        '.dev.vars*',
        '.npmrc',
        'lms-data.json',
        '*.pem',
        '*.key',
        '*.p12',
        '*.pfx',
        '*.jks',
        '*.ppk',
        '*.crt',
        '*.der',
        '*.ovpn',
        'id_rsa',
        '/XD',
        'node_modules',
        '.next',
        '.wrangler',
        'dist',
    ] + ([] if CHECK else QUIET)
    if CHECK:
        args.append('/L')
    r = subprocess.run(args, capture_output=True, text=True, errors='replace')
    if r.returncode > 7:
        print('robocopy FAIL', d, r.returncode)
        sys.exit(1)
    # /L 모드: rc != 0 = 복사/삭제될 파일 있음(드리프트)
    if CHECK and r.returncode != 0:
        # 파일 목록 행만 추림 — 옵션 echo(/XF, /XD) 줄 제외: 크기 열이 있는 행
        drift = [
            line.strip()
            for line in r.stdout.splitlines()
            if re.search(r'\t\s*\d+\s', line) and SRC not in line
        ]
        print(f'DRIFT {d}\\ ({len(drift)} files)')
        for line in drift[:20]:
            print('   ', re.sub(r'\s+', ' ', line))
        return True
    return False


def sync_file(f):
    args = ['robocopy', SRC, DST, f] + ([] if CHECK else QUIET)
    if CHECK:
        args.append('/L')
    r = subprocess.run(args, capture_output=True, text=True, errors='replace')
    if r.returncode > 7:
        print('robocopy FAIL', f, r.returncode)
        sys.exit(1)
    if CHECK and r.returncode != 0:
        print('DRIFT', f)
        return True
    return False


def sync_tracked_helpers():
    # Private one-off helpers can contain credentials. Keep the broad _* filter
    # for directory mirroring, but explicitly copy versioned operational tools.
    tracked = subprocess.run(
        ['git', 'ls-files', '-z', '--', 'scripts'], cwd=SRC,
        capture_output=True, text=True, encoding='utf-8', check=True,
    )
    drifted = False
    for name in tracked.stdout.split('\0'):
        if name and os.path.basename(name).startswith('_'):
            parent, filename = os.path.split(name)
            args = ['robocopy', os.path.join(SRC, parent),
                    os.path.join(DST, parent), filename]
            args += ['/L'] if CHECK else QUIET
            result = subprocess.run(args, capture_output=True, text=True, errors='replace')
            if result.returncode > 7:
                sys.exit(f'robocopy FAIL {name}: {result.returncode}')
            if CHECK and result.returncode:
                print('DRIFT', name)
                drifted = True
    return drifted


drifted = False
for d in DIRS:
    drifted |= sync_dir(d)
for f in FILES:
    drifted |= sync_file(f)
drifted |= sync_tracked_helpers()

if CHECK:
    if drifted:
        print('parity check FAILED - root != published-personal')
        sys.exit(1)
    print('parity OK')
else:
    print('synced')
