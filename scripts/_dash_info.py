import subprocess, json

def gh(path):
    r = subprocess.run(['gh', 'api', path], capture_output=True, timeout=60)
    return r.returncode, r.stdout.decode('utf-8', 'replace'), r.stderr.decode('utf-8', 'replace')

rc, out, err = gh('users/gyeongbin-38/repos?per_page=100')
repos = json.loads(out)
rid = None
for repo in repos:
    if repo['name'] == '-':
        rid = repo['id']
        print(json.dumps({k: repo.get(k) for k in
              ('id', 'node_id', 'full_name', 'private', 'size',
               'pushed_at', 'default_branch', 'description')}, indent=1))
        break
if rid is None:
    raise SystemExit('dash repo not found in list')

for path in [f'repositories/{rid}/branches', f'repositories/{rid}/commits?per_page=5']:
    rc, out, err = gh(path)
    print('##', path, '→', rc)
    print((out or err)[:2000])
