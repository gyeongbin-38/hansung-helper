import subprocess
import sys
import os

os.chdir(r'C:\Users\82107\Desktop\학사 도우미')
env = dict(os.environ)
env['PATH'] = r'C:\Users\82107\Desktop\학사 도우미\node_modules\.bin' + os.pathsep + env['PATH']

CMDS = [
    'tsc --noEmit',
    'oxlint app/ lib/',
    'node --experimental-strip-types tests/ux-utils.test.mjs',
    'node --experimental-strip-types tests/catalog.test.mjs',
    'node --experimental-strip-types tests/graduation.test.mjs',
    'node --experimental-transform-types tests/school.test.mjs',
]
for cmd in CMDS:
    print('>', cmd, flush=True)
    r = subprocess.run(cmd, shell=True, env=env)
    if r.returncode != 0:
        sys.exit(r.returncode)
print('ALL OK')
