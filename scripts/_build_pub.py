import subprocess
import sys
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(os.path.join(ROOT, 'published-personal'))
env = dict(os.environ)
env['PATH'] = os.path.join(os.getcwd(), 'node_modules', '.bin') + os.pathsep + env['PATH']
r = subprocess.run('vinext build', shell=True, env=env)
sys.exit(r.returncode)
