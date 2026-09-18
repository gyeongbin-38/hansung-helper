import subprocess, json
ts = r'C:\Program Files\Tailscale\tailscale.exe'
r = subprocess.run([ts, 'funnel', '--bg', '8787'],
                   capture_output=True, text=True, timeout=60)
print('rc', r.returncode)
print((r.stdout or '')[:2000])
print((r.stderr or '')[:2000])
print('--- status ---')
r2 = subprocess.run([ts, 'funnel', 'status'],
                    capture_output=True, text=True, timeout=30)
print((r2.stdout or '')[:2000])
print((r2.stderr or '')[:1000])
