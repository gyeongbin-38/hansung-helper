"""Deploy published-personal/dist to Cloudflare Workers.

Patches the generated wrangler.json with the real D1 database_id and the
production worker name, then runs `wrangler deploy`. The generated config
always carries a placeholder ID (vite.config.ts localBindingConfig), so this
patch step is required after every `npm run build` inside published-personal.

Usage: python scripts/_deploy.py
"""
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DEPLOY_REPO = os.path.join(ROOT, 'published-personal')
WRANGLER_JSON = os.path.join(DEPLOY_REPO, 'dist', 'server', 'wrangler.json')

DATABASE_ID = '27aa326b-5433-4bcb-bc38-1b63bd66f67b'  # remote site-creator-d1
WORKER_NAME = 'hansung-helper'

with open(WRANGLER_JSON, encoding='utf-8') as f:
    cfg = json.load(f)

cfg['name'] = WORKER_NAME
cfg['topLevelName'] = WORKER_NAME
patched = False
for db in cfg.get('d1_databases', []):
    if db.get('database_name') == 'site-creator-d1':
        db['database_id'] = DATABASE_ID
        patched = True
if not patched:
    sys.exit('error: no site-creator-d1 binding found in generated wrangler.json')

with open(WRANGLER_JSON, 'w', encoding='utf-8') as f:
    json.dump(cfg, f)
print(f'patched {WRANGLER_JSON}: name={WORKER_NAME}, database_id={DATABASE_ID}')

r = subprocess.run(
    'npx wrangler deploy --config dist/server/wrangler.json',
    cwd=DEPLOY_REPO, shell=True)
sys.exit(r.returncode)
