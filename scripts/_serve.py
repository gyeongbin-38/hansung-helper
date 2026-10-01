import os
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(ROOT)
log = open(os.path.join('dist', 'server.log'), 'w', encoding='utf-8')
subprocess.Popen(
    [
        os.path.join('node_modules', '.bin', 'wrangler.cmd'),
        'dev',
        '--config',
        r'dist/server/wrangler.json',
    ],
    stdout=log,
    stderr=subprocess.STDOUT,
    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
)
print('wrangler launched')
