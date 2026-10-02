import os
print('XDG_CONFIG_HOME =', os.environ.get('XDG_CONFIG_HOME'))
xdg_home = os.environ.get('XDG_CONFIG_HOME')
appdata = os.environ.get('APPDATA')
candidates = [
    os.path.join(xdg_home, '.wrangler') if xdg_home else None,
    os.path.join(appdata, 'xdg.config', '.wrangler') if appdata else None,
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
