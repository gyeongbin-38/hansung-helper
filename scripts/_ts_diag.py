import subprocess, json
ts = r'C:\Program Files\Tailscale\tailscale.exe'

# tailnet domain info
r = subprocess.run([ts, 'status', '--json'], capture_output=True, text=True, timeout=20)
try:
    j = json.loads(r.stdout)
    print('MagicDNSSuffix:', j.get('MagicDNSSuffix'))
    print('CertDomains:', j.get('CertDomains'))
    selfn = j.get('Self', {})
    print('DNSName:', selfn.get('DNSName'))
    caps = j.get('CapMap', {})
    print('funnel cap:', [k for k in caps if 'funnel' in k.lower()])
except Exception as e:
    print('json parse fail', e, r.stdout[:500])

# try tailnet-internal serve (no public exposure)
try:
    r2 = subprocess.run([ts, 'serve', '--bg', '8787'],
                        capture_output=True, text=True, timeout=20)
    print('serve rc', r2.returncode)
    print((r2.stdout or '')[:1000])
    print((r2.stderr or '')[:1000])
except subprocess.TimeoutExpired:
    print('serve: TIMEOUT too')

r3 = subprocess.run([ts, 'serve', 'status'],
                    capture_output=True, text=True, timeout=20)
print('serve status:', (r3.stdout or '')[:1500])
