import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('public/lms-collect.js', 'utf8');
for (const address of [
  'https://learn.hansung.ac.kr.example.test/my/',
  'https://learn.hansung.ac.kr@example.test/my/',
  'https://other.learn.hansung.ac.kr/my/',
  'http://learn.hansung.ac.kr/my/',
  'https://learn.hansung.ac.kr:444/my/',
]) {
  let denied = false;
  await vm.runInNewContext(source, {
    location: new URL(address), console: { error() { denied = true; } },
    DOMParser() { assert.fail('foreign origin must stop before collection'); },
  });
  assert(denied);
}
await assert.rejects(vm.runInNewContext(source, {
  location: new URL('https://learn.hansung.ac.kr/my/'),
  DOMParser: function () { throw new Error('trusted-origin-reached-parser'); },
}), /trusted-origin-reached-parser/);
console.log('collector origin: exact school origin accepted; lookalike, subdomain, protocol and port rejected');
