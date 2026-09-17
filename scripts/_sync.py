import subprocess
import sys

SRC = r'C:\Users\82107\Desktop\학사 도우미'
DST = r'C:\Users\82107\Desktop\학사 도우미\published-personal'

DIRS = ['app', 'lib', 'tests', 'scripts', 'docs', 'drizzle', 'data']
FILES = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'AGENTS.md',
    'PROJECT_ARCHITECTURE.md',
    'wrangler.toml',
]

for d in DIRS:
    r = subprocess.run(
        [
            'robocopy',
            SRC + '\\' + d,
            DST + '\\' + d,
            '/MIR',
            '/XF',
            '_*',
            'cloudflared.exe',
            '_tunnel.log',
            '/XD',
            'node_modules',
            '.next',
            '.wrangler',
            'dist',
            '/NFL',
            '/NDL',
            '/NJH',
            '/NJS',
            '/NP',
        ],
        capture_output=True,
    )
    if r.returncode > 7:
        print('robocopy FAIL', d, r.returncode)
        sys.exit(1)

for f in FILES:
    src = SRC + '\\' + f
    r = subprocess.run(
        [
            'robocopy',
            SRC,
            DST,
            f,
            '/NFL',
            '/NDL',
            '/NJH',
            '/NJS',
            '/NP',
        ],
        capture_output=True,
    )
    if r.returncode > 7:
        print('robocopy FAIL', f, r.returncode)
        sys.exit(1)

print('synced')
