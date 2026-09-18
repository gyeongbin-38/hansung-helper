import subprocess
ts = r'C:\Program Files\Tailscale\tailscale.exe'
for args in [['status'], ['funnel', 'status']]:
    r = subprocess.run([ts] + args, capture_output=True, text=True, timeout=30)
    print('$ tailscale', ' '.join(args), '→ rc', r.returncode)
    print((r.stdout or '')[:1500])
    print((r.stderr or '')[:500])
    print('---')
