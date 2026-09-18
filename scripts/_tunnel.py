import subprocess, sys, os, re, time

exe = os.path.join(os.path.dirname(__file__), 'cloudflared.exe')
log = os.path.join(os.path.dirname(__file__), '_tunnel.log')
p = subprocess.Popen(
    [exe, 'tunnel', '--url', 'http://127.0.0.1:8787'],
    stderr=subprocess.STDOUT, stdout=open(log, 'w', encoding='utf-8', errors='replace'),
    text=True)
print('PID', p.pid, 'log', log)
# wait for the trycloudflare URL
for _ in range(60):
    time.sleep(1)
    try:
        txt = open(log, encoding='utf-8', errors='replace').read()
        m = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', txt)
        if m:
            print('URL', m.group(0))
            break
    except OSError:
        pass
else:
    print('no URL yet')
