import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_STORAGE_KEY, parseDemoStorage } from '../lib/data/demo-storage.ts';

test('체험 저장 정보의 비어 있음, 유효함, 손상을 구분한다', () => {
  assert.equal(DEMO_STORAGE_KEY, 'hansung-demo-v1');
  assert.deepEqual(parseDemoStorage(null), { status: 'empty' });
  const data = { name: '체험', saved: [], planned: ['A'], events: [] };
  assert.deepEqual(parseDemoStorage(JSON.stringify(data)), { status: 'saved', value: data });
  for (const value of ['', '{', 'null', '[]', '{}', '{"saved":[],"planned":[],"events":{}}']) {
    assert.equal(parseDemoStorage(value).status, 'invalid');
  }
});
