import subprocess
out = subprocess.run(
    ['powershell', '-NoProfile', '-Command',
     "Get-Process | Where-Object {$_.Name -match 'workerd|wrangler|esbuild|node'} | Select-Object Id,Name,Path | Format-Table -AutoSize"],
    capture_output=True, text=True)
print(out.stdout)
print(out.stderr)
