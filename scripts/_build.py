import subprocess
import sys
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(ROOT)
env = dict(os.environ)
env['PATH'] = os.path.join(ROOT, 'node_modules', '.bin') + os.pathsep + env['PATH']
r = subprocess.run('vinext build', shell=True, env=env)
sys.exit(r.returncode)
