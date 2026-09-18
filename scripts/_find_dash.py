import subprocess, json
r = subprocess.run(['gh', 'repo', 'list', 'gyeongbin-38', '--limit', '100',
                    '--json', 'name'], capture_output=True, text=True)
repos = json.loads(r.stdout)
for repo in repos:
    n = repo['name']
    if len(n) <= 3:
        print(repr(n), [hex(ord(c)) for c in n])
