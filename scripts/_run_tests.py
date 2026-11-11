import subprocess, glob, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
flags = {
    'school.test.mjs': '--experimental-transform-types',
    'lms-server.test.mjs': '--experimental-transform-types',
    'school-fixtures.test.mjs': '--experimental-transform-types',
    'lms-budget.test.mjs': '--experimental-transform-types',
    'info.test.mjs': '--experimental-transform-types',
}
ok = True
for f in sorted(glob.glob('tests/*.test.mjs') + glob.glob('tests/*.test.py')):
    flag = flags.get(f.split('\\')[-1].split('/')[-1], '--experimental-strip-types')
    command = [sys.executable, f] if f.endswith('.py') else ['node', flag, f]
    r = subprocess.run(command, capture_output=True, text=True,
                       encoding='utf-8', errors='replace',
                       env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
    tail = (r.stdout + r.stderr).strip().splitlines()
    summary = next((l for l in reversed(tail) if 'pass' in l.lower() or 'fail' in l.lower()
                    or '# pass' in l.lower() or 'ok' == l.strip().lower()), tail[-1] if tail else '?')
    status = 'OK ' if r.returncode == 0 else 'ERR'
    if r.returncode != 0:
        ok = False
    print(f'{status} {f:38} {summary}')
    if r.returncode != 0:
        print('\n'.join(tail[-8:]))
sys.exit(0 if ok else 1)
