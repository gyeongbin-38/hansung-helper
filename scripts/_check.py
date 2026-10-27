import subprocess
import sys
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(ROOT)
env = dict(os.environ)
env['PATH'] = os.path.join(ROOT, 'node_modules', '.bin') + os.pathsep + env['PATH']

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
