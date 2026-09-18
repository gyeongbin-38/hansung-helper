import os
print('XDG_CONFIG_HOME =', os.environ.get('XDG_CONFIG_HOME'))
candidates = [
    r'C:\Users\82107\AppData\Roaming\xdg.config\.wrangler',
    os.path.expandvars(r'%XDG_CONFIG_HOME%\.wrangler') if os.environ.get('XDG_CONFIG_HOME') else None,
    os.path.expandvars(r'%USERPROFILE%\.wrangler'),
    os.path.expandvars(r'%APPDATA%\.wrangler'),
    os.path.expandvars(r'%LOCALAPPDATA%\.wrangler'),
]
for c in candidates:
    if not c:
        continue
    print(c, 'exists=', os.path.isdir(c))
    if os.path.isdir(c):
        for r, d, fs in os.walk(c):
            for f in fs:
                if 'log' not in f.lower():
                    print('   ', os.path.join(r, f))
