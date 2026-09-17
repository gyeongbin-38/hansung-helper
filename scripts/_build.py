import subprocess
import sys
import os

os.chdir(r'C:\Users\82107\Desktop\학사 도우미')
env = dict(os.environ)
env['PATH'] = r'C:\Users\82107\Desktop\학사 도우미\node_modules\.bin' + os.pathsep + env['PATH']
r = subprocess.run('vinext build', shell=True, env=env)
sys.exit(r.returncode)
