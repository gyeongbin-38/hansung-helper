"""Audit tracked files for secrets/PII before/after public push."""
import os
import re
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(ROOT)

files = subprocess.run(['git', 'ls-files'], capture_output=True, text=True,
                       encoding='utf-8', errors='replace').stdout.splitlines()
print(f'tracked files: {len(files)}')

# 1) risky filenames
RISKY = re.compile(r'(\.env|\.pem|\.key|\.p12|\.pfx|\.jks|id_rsa|\.ppk|'
                   r'\.keystore|credential|secret|\.crt|\.der|\.ovpn)', re.I)
hits = [f for f in files if RISKY.search(f)]
print('\n[1] risky filenames:', hits or 'NONE')

# 2) secret-looking content in tracked text files
PATTERNS = [
    ('github token', re.compile(r'gh[pousr]_[A-Za-z0-9]{20,}')),
    ('aws key', re.compile(r'AKIA[0-9A-Z]{16}')),
    ('generic sk', re.compile(r'sk-[A-Za-z0-9_-]{20,}')),
    ('private key block', re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY')),
    ('jwt', re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}')),
    ('bearer literal', re.compile(r'Bearer\s+[A-Za-z0-9_\-\.]{20,}')),
    ('oauth_token assign', re.compile(r'oauth_token\s*[:=]\s*["\'][^"\']{10,}')),
    ('password assign', re.compile(r'(password|passwd|pwd)\s*[:=]\s*["\'][^"\']{4,}["\']', re.I)),
    ('api_key assign', re.compile(r'api[_-]?key\s*[:=]\s*["\'][^"\']{10,}["\']', re.I)),
    ('email', re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')),
    ('student-id-ish', re.compile(r'\b20[0-9]{2}0?[0-9]{4,6}\b')),
]
TEXT_EXT = {'.ts', '.tsx', '.js', '.mjs', '.mts', '.json', '.jsonc', '.md',
            '.py', '.toml', '.yml', '.yaml', '.sql', '.css', '.txt', '.html'}
findings = []
for f in files:
    ext = os.path.splitext(f)[1].lower()
    if ext not in TEXT_EXT:
        continue
    try:
        txt = open(f, encoding='utf-8', errors='replace').read()
    except OSError:
        continue
    for name, pat in PATTERNS:
        for m in pat.finditer(txt):
            s = m.group(0)
            # ignore obvious placeholders/examples
            if any(x in s.lower() for x in ('example', 'placeholder', '0000',
                                            'your-', 'xxx', '<')):
                continue
            findings.append((name, f, s[:80]))
print('\n[2] content findings:')
for name, f, s in findings[:80]:
    print(f'  {name:20} {f:55} {s}')
if not findings:
    print('  NONE')

# 3) large/binary files tracked
big = []
for f in files:
    try:
        sz = os.path.getsize(f)
        if sz > 1_000_000:
            big.append((f, sz))
    except OSError:
        pass
print('\n[3] files >1MB:', big or 'NONE')

# 4) gitignore covers env?
gi = open('.gitignore', encoding='utf-8').read()
print('\n[4] .env in .gitignore:', '.env' in gi)
