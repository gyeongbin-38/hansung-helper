import subprocess, os
repo = os.path.join(os.path.dirname(__file__), '..', 'published-personal')
r = subprocess.run(['git', 'for-each-ref', '--format=%(refname)', 'refs/original/'],
                   cwd=repo, capture_output=True, text=True)
for ref in r.stdout.split():
    d = subprocess.run(['git', 'update-ref', '-d', ref],
                       cwd=repo, capture_output=True, text=True)
    print('deleted', ref, d.returncode)
for cmd in [
    ['git', 'reflog', 'expire', '--expire=now', '--all'],
    ['git', 'gc', '--prune=now', '--aggressive'],
    ['git', 'log', '--all', '--oneline', '--', 'scripts/cloudflared.exe'],
    ['git', 'status', '--short'],
]:
    rr = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, timeout=300)
    print('$', ' '.join(cmd[:2]), '→', rr.returncode, (rr.stdout or '')[:400])
