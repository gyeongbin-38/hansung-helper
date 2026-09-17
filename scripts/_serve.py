import os
import subprocess

os.chdir(r'C:\Users\82107\Desktop\학사 도우미')
log = open(r'dist\server.log', 'w', encoding='utf-8')
subprocess.Popen(
    [
        r'node_modules\.bin\wrangler.cmd',
        'dev',
        '--config',
        r'dist/server/wrangler.json',
    ],
    stdout=log,
    stderr=subprocess.STDOUT,
    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
)
print('wrangler launched')
