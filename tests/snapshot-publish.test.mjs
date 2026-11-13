import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

test('snapshot pointer changes only after all chunks are staged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snapshot-publish-'));
  try {
    for (const folder of ['scripts', 'lib/data', 'node_modules/wrangler/bin']) mkdirSync(join(dir, folder), { recursive: true });
    copyFileSync('scripts/_publish_snapshots.mjs', join(dir, 'scripts/_publish_snapshots.mjs'));
    writeFileSync(join(dir, 'node_modules/wrangler/bin/wrangler.js'), "const fs=require('node:fs');fs.copyFileSync(process.argv[process.argv.indexOf('--file')+1], 'capture.sql');");
    const now = '2026-01-01T00:00:00Z';
    for (const [name, data] of Object.entries({ 'catalog-2026-2.json': { semester: '2026-2', sections: [], generatedAt: now }, 'activities.json': { fetchedAt: now, items: [{ body: 'x'.repeat(170000) }] }, 'schedule.json': { fetchedAt: now, items: [{}] }, 'dept-rules.json': { fetchedAt: now, items: [{}] }, 'dept-pages.json': { fetchedAt: now, pages: [{}] }, 'curriculum-index.json': { generatedAt: now, semesters: { '2026-2': {} } } })) writeFileSync(join(dir, 'lib/data', name), JSON.stringify(data));
    const run = spawnSync(process.execPath, [join(dir, 'scripts/_publish_snapshots.mjs'), '--local'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
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
    const only = spawnSync(process.execPath, [join(dir, 'scripts/_publish_snapshots.mjs'), '--local', '--only=dept-rules'], { cwd: dir, encoding: 'utf8' });
    assert.equal(only.status, 0, only.stderr);
    const filtered = readFileSync(join(dir, 'capture.sql'), 'utf8');
    assert.match(filtered, /dept-rules@active/);
    assert.doesNotMatch(filtered, /activities@active|schedule@active|courses@active/);
    const excluded = spawnSync(process.execPath, [join(dir, 'scripts/_publish_snapshots.mjs'), '--local', '--exclude=dept-rules'], { cwd: dir, encoding: 'utf8' });
    assert.equal(excluded.status, 0, excluded.stderr);
    assert.doesNotMatch(readFileSync(join(dir, 'capture.sql'), 'utf8'), /dept-rules@active/);
    assert.notEqual(spawnSync(process.execPath, [join(dir, 'scripts/_publish_snapshots.mjs'), '--local', '--only=invalid'], { cwd: dir, encoding: 'utf8' }).status, 0);
  } finally {
    if (resolve(dir).startsWith(resolve(tmpdir()) + sep)) rmSync(dir, { recursive: true, force: true });
  }
});
