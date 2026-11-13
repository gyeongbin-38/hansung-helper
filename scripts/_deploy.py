"""Deploy published-personal/dist to Cloudflare Workers.

Patches the generated wrangler.json with the real D1 database_id and the
production worker name, then runs `wrangler deploy`. The generated config
always carries a placeholder ID (vite.config.ts localBindingConfig), so this
patch step is required after every `npm run build` inside published-personal.

Usage: python scripts/_deploy.py
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DEPLOY_REPO = (
    os.path.join(ROOT, 'published-personal')
    if os.path.isdir(os.path.join(ROOT, 'published-personal')) else ROOT
)
WRANGLER_JSON = os.path.join(DEPLOY_REPO, 'dist', 'server', 'wrangler.json')

DATABASE_ID = os.environ.get('HANSUNG_D1_DATABASE_ID', '')
WORKER_NAME = 'haksa-bugi'

def main():
    if not re.fullmatch(
        r'[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}',
        DATABASE_ID,
    ) or DATABASE_ID == '00000000-0000-4000-8000-000000000000':
        sys.exit('error: set HANSUNG_D1_DATABASE_ID to the production database ID')

    with open(WRANGLER_JSON, encoding='utf-8') as f:
        cfg = json.load(f)
    if 'ACCOUNT_INDEX_HMAC_KEY' in cfg.get('vars', {}):
        sys.exit('error: ACCOUNT_INDEX_HMAC_KEY must be a Worker secret, not a plaintext variable')
    cfg['name'] = WORKER_NAME
    cfg['topLevelName'] = WORKER_NAME
    # Native Workers AI uses the existing Cloudflare account, no browser API key.
    if os.environ.get('HANSUNG_ENABLE_AI', '1') == '1':
        cfg['ai'] = {'binding': 'AI'}
    else:
        cfg.pop('ai', None)
    binding = next(
        (db for db in cfg.get('d1_databases', [])
         if db.get('binding') == 'DB' and db.get('database_name') == 'site-creator-d1'),
        None,
    )
    if not binding:
        sys.exit('error: no site-creator-d1 DB binding found in generated wrangler.json')
    binding['database_id'] = DATABASE_ID
    with open(WRANGLER_JSON, 'w', encoding='utf-8') as f:
        json.dump(cfg, f)

    wrangler = ['node', os.path.join(DEPLOY_REPO, 'node_modules', 'wrangler', 'bin', 'wrangler.js')]
    config_args = ['--config', WRANGLER_JSON]
    secrets = subprocess.run(
        wrangler + ['secret', 'list'] + config_args,
        cwd=DEPLOY_REPO, capture_output=True, text=True, encoding='utf-8',
    )
    if secrets.returncode:
        sys.exit('error: could not verify Worker secret names; deployment stopped')
    try:
        configured = any(item.get('name') == 'ACCOUNT_INDEX_HMAC_KEY'
                         for item in json.loads(secrets.stdout))
    except (ValueError, TypeError, AttributeError):
        sys.exit('error: invalid Worker secret list; deployment stopped')
    if not configured:
        sys.exit('error: configure Worker secret ACCOUNT_INDEX_HMAC_KEY before deploying; do not replace an existing key')

    print(f'validated {WRANGLER_JSON}: worker, D1 binding, account secret present')
    return subprocess.run(wrangler + ['deploy'] + config_args, cwd=DEPLOY_REPO).returncode


if __name__ == '__main__':
    sys.exit(main())
