import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync, linkSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

test('snapshot pointer changes only after all chunks are staged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snapshot-publish-'));
  try {
    for (const folder of ['scripts', 'lib/data', 'node_modules/wrangler/bin']) mkdirSync(join(dir, folder), { recursive: true });
    copyFileSync('scripts/_publish_snapshots.mjs', join(dir, 'scripts/_publish_snapshots.mjs'));
    writeFileSync(join(dir, 'node_modules/wrangler/bin/wrangler.js'), "const fs=require('node:fs');const file=process.argv[process.argv.indexOf('--file')+1];fs.copyFileSync(file, 'capture.sql');fs.writeFileSync('capture-path.json',JSON.stringify(file));");
    const temp = join(dir, 'isolated-temp');
    mkdirSync(temp);
    const victim = join(dir, 'untouched.txt');
    writeFileSync(victim, 'must remain unchanged');
    linkSync(victim, join(temp, 'hansung-snapshots-0.sql'));
    const publish = (...args) => spawnSync(process.execPath, [join(dir, 'scripts/_publish_snapshots.mjs'), ...args], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp, HANSUNG_D1_DATABASE_ID: '' },
    });
    const now = '2026-01-01T00:00:00Z';
    for (const [name, data] of Object.entries({ 'catalog-2026-2.json': { semester: '2026-2', sections: [], generatedAt: now }, 'activities.json': { fetchedAt: now, items: [{ body: 'x'.repeat(170000) }] }, 'schedule.json': { fetchedAt: now, items: [{}] }, 'dept-rules.json': { fetchedAt: now, items: [{}] }, 'dept-pages.json': { fetchedAt: now, pages: [{}] }, 'equivalents.json': { generatedAt: now, groups: { '1': { name: 'x', courses: [{}] } }, rowCount: 1 }, 'curriculum-index.json': { generatedAt: now, semesters: { '2026-2': {} } } })) writeFileSync(join(dir, 'lib/data', name), JSON.stringify(data));
    const run = publish('--local');
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(victim, 'utf8'), 'must remain unchanged');
    const firstPath = JSON.parse(readFileSync(join(dir, 'capture-path.json'), 'utf8'));
    assert.equal(dirname(dirname(firstPath)), temp);
    assert.notEqual(dirname(firstPath), temp);
    assert.equal(existsSync(dirname(firstPath)), false, 'successful publication cleans its private directory');
    const sql = readFileSync(join(dir, 'capture.sql'), 'utf8');
    const statements = sql.split(';\n').map((s) => s.trim()).filter(Boolean);
    const db = new DatabaseSync(':memory:');
    db.exec(statements[0]);
    db.prepare('INSERT INTO public_snapshots VALUES (?, -1, ?, ?, ?)').run('activities@active', 'old', now, 1);
    const staged = statements.filter((s) => s.startsWith('INSERT INTO public_snapshots') && s.includes("VALUES ('activities@"));
    const pointer = statements.find((s) => s.includes("SELECT 'activities@active', -1"));
    assert.equal(staged.length, 3);
    db.exec(staged[0]);
    db.exec(pointer);
    assert.equal(db.prepare('SELECT payload FROM public_snapshots WHERE kind=? AND part=-1').get('activities@active').payload, 'old');
    for (const statement of staged.slice(1)) db.exec(statement);
    db.exec(pointer);
    const manifest = JSON.parse(db.prepare('SELECT payload FROM public_snapshots WHERE kind=? AND part=-1').get('activities@active').payload);
    assert.equal(manifest.parts, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM public_snapshots WHERE kind=?').get(manifest.kind).n, 3);
    db.close();
    const only = publish('--local', '--only=dept-rules');
    assert.equal(only.status, 0, only.stderr);
    assert.notEqual(JSON.parse(readFileSync(join(dir, 'capture-path.json'), 'utf8')), firstPath, 'each invocation uses a distinct path');
    const filtered = readFileSync(join(dir, 'capture.sql'), 'utf8');
    assert.match(filtered, /dept-rules@active/);
    assert.doesNotMatch(filtered, /activities@active|schedule@active|courses@active/);
    const excluded = publish('--local', '--exclude=dept-rules');
    assert.equal(excluded.status, 0, excluded.stderr);
    assert.doesNotMatch(readFileSync(join(dir, 'capture.sql'), 'utf8'), /dept-rules@active/);
    assert.notEqual(publish('--local', '--only=invalid').status, 0);
    assert.notEqual(publish('--remote', '--only=courses').status, 0);
    assert.deepEqual(readdirSync(temp), ['hansung-snapshots-0.sql'], 'failure also cleans only its own temporary directory');
  } finally {
    if (resolve(dir).startsWith(resolve(tmpdir()) + sep)) rmSync(dir, { recursive: true, force: true });
  }
});
