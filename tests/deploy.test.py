import contextlib
import importlib.util
import io
import json
import pathlib
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('deploy', ROOT / 'scripts/_deploy.py')
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = pathlib.Path(self.temp.name) / 'wrangler.json'
        self.config.write_text(json.dumps({'d1_databases': [{
            'binding': 'DB', 'database_name': 'site-creator-d1',
            'database_id': '00000000-0000-4000-8000-000000000000',
        }]}), encoding='utf-8')
        self.patches = mock.patch.multiple(DEPLOY, DEPLOY_REPO=self.temp.name,
                                         WRANGLER_JSON=str(self.config),
                                         DATABASE_ID='11111111-2222-4333-8444-555555555555')
        self.patches.start()
        self.addCleanup(self.patches.stop)

    def test_missing_worker_key_stops_before_deploy(self):
        with mock.patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout='[]')) as run:
            with self.assertRaisesRegex(SystemExit, 'ACCOUNT_INDEX_HMAC_KEY'):
                DEPLOY.main()
        self.assertEqual(run.call_count, 1)
        self.assertIn('list', run.call_args.args[0])

    def test_secret_lookup_failure_stops_before_deploy(self):
        for code, output in [(1, ''), (0, 'invalid JSON')]:
            with mock.patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], code, stdout=output)) as run:
                with self.assertRaises(SystemExit):
                    DEPLOY.main()
            self.assertEqual(run.call_count, 1)

    def test_present_secret_is_preserved_and_database_patched(self):
        results = [subprocess.CompletedProcess([], 0, stdout='[{"name":"ACCOUNT_INDEX_HMAC_KEY"}]'),
                   subprocess.CompletedProcess([], 0)]
        with mock.patch.object(subprocess, 'run', side_effect=results) as run, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(DEPLOY.main(), 0)
        self.assertEqual(run.call_count, 2)
        self.assertIn('deploy', run.call_args.args[0])
        self.assertFalse(any('put' in call.args[0] for call in run.call_args_list))
        config = json.loads(self.config.read_text(encoding='utf-8'))
        self.assertEqual(config['name'], 'haksa-bugi')
        self.assertEqual(config['ai'], {'binding': 'AI'})
        self.assertEqual(config['d1_databases'][0]['database_id'], DEPLOY.DATABASE_ID)

    def test_ai_can_be_disabled_without_removing_account_secret(self):
        results = [subprocess.CompletedProcess([], 0, stdout='[{"name":"ACCOUNT_INDEX_HMAC_KEY"}]'),
                   subprocess.CompletedProcess([], 0)]
        with mock.patch.dict('os.environ', {'HANSUNG_ENABLE_AI': '0'}), mock.patch.object(subprocess, 'run', side_effect=results), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(DEPLOY.main(), 0)
        self.assertNotIn('ai', json.loads(self.config.read_text(encoding='utf-8')))

    def test_placeholder_database_is_rejected(self):
        with mock.patch.object(DEPLOY, 'DATABASE_ID', '00000000-0000-4000-8000-000000000000'), mock.patch.object(subprocess, 'run') as run:
            with self.assertRaises(SystemExit):
                DEPLOY.main()
            run.assert_not_called()

    def test_plaintext_account_key_is_rejected(self):
        config = json.loads(self.config.read_text(encoding='utf-8'))
        config['vars'] = {'ACCOUNT_INDEX_HMAC_KEY': 'fixture-key-must-not-be-deployed'}
        self.config.write_text(json.dumps(config), encoding='utf-8')
        with mock.patch.object(subprocess, 'run') as run:
            with self.assertRaisesRegex(SystemExit, 'Worker secret'):
                DEPLOY.main()
            run.assert_not_called()

    def test_sync_updates_only_tracked_underscore_helpers(self):
        commands = []

        def execute(args, **_kwargs):
            commands.append(args)
            output = 'scripts/_deploy.py\0scripts/_publish_snapshots.mjs\0scripts/_run_tests.py\0scripts/crawl-utils.mts\0' if args[0] == 'git' else ''
            return subprocess.CompletedProcess(args, 0, stdout=output)

        with mock.patch.object(subprocess, 'run', side_effect=execute), mock.patch.object(sys, 'argv', ['_sync.py']), contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(ROOT / 'scripts/_sync.py'), run_name='__main__')
        copied = {args[3] for args in commands if args[0] == 'robocopy' and args[3].startswith('_')}
        self.assertEqual(copied, {'_deploy.py', '_publish_snapshots.mjs', '_run_tests.py'})


if __name__ == '__main__':
    unittest.main()
