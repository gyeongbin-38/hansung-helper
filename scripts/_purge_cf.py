import subprocess, os
repo = os.path.join(os.path.dirname(__file__), '..', 'published-personal')
env = dict(os.environ, FILTER_BRANCH_SQUELCH_WARNING='1')
r = subprocess.run(
    ['git', 'filter-branch', '--force', '--index-filter',
     'git rm --cached --ignore-unmatch scripts/cloudflared.exe',
     '--', '--all'],
    cwd=repo, capture_output=True, text=True, env=env, timeout=600)
print('rc', r.returncode)
print((r.stdout or '')[-2000:])
print((r.stderr or '')[-2000:])
# cleanup refs + gc
for cmd in [
    ['git', 'for-each-ref', '--format=%(refname)', 'refs/original/'],
    ['git', 'reflog', 'expire', '--expire=now', '--all'],
    ['git', 'gc', '--prune=now', '--aggressive'],
]:
    rr = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, timeout=300)
    print('$', ' '.join(cmd), '→', rr.returncode, (rr.stdout or '')[:500])
