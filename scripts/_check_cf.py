import os, subprocess
p = os.path.join(os.path.dirname(__file__), 'cloudflared.exe')
print('size:', os.path.getsize(p))
r = subprocess.run([p, 'version'], capture_output=True, text=True, timeout=30)
print(r.stdout, r.stderr)
