import subprocess

r = subprocess.run(
    ['tasklist', '/FO', 'CSV', '/NH'],
    capture_output=True,
    text=True,
    encoding='cp949',
    errors='replace',
)
for line in r.stdout.splitlines():
    low = line.lower()
    if 'workerd' in low or 'miniflare' in low:
        cols = line.split('","')
        name = cols[0].strip('"')
        pid = cols[1].strip('"')
        print('killing', name, pid)
        subprocess.run(['taskkill', '/F', '/PID', pid])
