import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCourses, connectSchool } from '../lib/server/school.ts';

test('course parser keeps only same-school read-only course links and deduplicates', () => {
  const html = `<a href="/course/view.php?id=42"><span>테스트 &amp; 실습</span></a><a href="/course/view.php?id=42">중복</a><a href="https://other.example/course/view.php?id=9">외부</a><a href="/course/view.php?id=evil">잘못된 링크</a>`;
  assert.deepEqual(parseCourses(html), [
    {
      id: '42',
      name: '테스트 & 실습',
      url: 'https://learn.hansung.ac.kr/course/view.php?id=42',
    },
  ]);
});
test('authentication upgrades legacy redirect and isolates per-host cookies', async () => {
  const original = globalThis.fetch,
    requests = [];
  const responses = [
    new Response('', {
      headers: { 'Set-Cookie': 'portal_cookie=one; Path=/' },
    }),
    new Response('', {
      status: 302,
      headers: { Location: 'http://info.hansung.ac.kr/h_dae/dae_main.html' },
    }),
    new Response('infohaksamain_portal.jsp'),
    new Response('head_bt_logout.gif'),
    new Response('', { headers: { 'Set-Cookie': 'lms_cookie=two; Path=/' } }),
    new Response('', {
      status: 303,
      headers: { Location: 'https://learn.hansung.ac.kr/' },
    }),
    new Response(
      '<a href="/login/logout.php">나가기</a><a href="/course/view.php?id=5">테스트 수업</a>',
    ),
  ];
  globalThis.fetch = async (url, init) => {
    requests.push({
      url: String(url),
      cookie: init.headers.get('Cookie'),
      body: init.body,
    });
    return responses.shift();
  };
  try {
    const result = await connectSchool('0000000', 'test-only-password');
    assert.equal(result.portal, 'connected');
    assert.equal(result.lms, 'connected');
    assert.equal(result.courses.length, 1);
    assert(requests.every((r) => r.url.startsWith('https:')));
    assert.equal(requests[4].cookie, '');
    assert.equal(requests[5].cookie, 'lms_cookie=two');
    assert(!JSON.stringify(result).includes('test-only-password'));
  } finally {
    globalThis.fetch = original;
  }
});
test('failed portal auth never creates a school snapshot or attempts LMS login', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () =>
    ++calls === 1
      ? new Response('')
      : new Response('', {
          status: 302,
          headers: { Location: 'https://info.hansung.ac.kr/?pwrechk=N' },
        });
  try {
    await assert.rejects(connectSchool('0000000', 'wrong'), {
      code: 'credentials',
    });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test('portal success survives an LMS outage with an explicit unavailable state', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response('');
    if (calls === 2)
      return new Response('', {
        status: 302,
        headers: { Location: 'https://info.hansung.ac.kr/h_dae/dae_main.html' },
      });
    if (calls === 3) return new Response('infohaksamain_portal.jsp');
    if (calls === 4) return new Response('head_bt_logout.gif');
    throw Error('offline');
  };
  try {
    const result = await connectSchool('0000000', 'test-only');
    assert.equal(result.lms, 'unavailable');
    assert.deepEqual(result.courses, []);
  } finally {
    globalThis.fetch = original;
  }
});
test('unexpected redirect host is rejected before cookies are sent', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () =>
    ++calls === 1
      ? new Response('')
      : new Response('', {
          status: 302,
          headers: { Location: 'https://other.example/h_dae/dae_main.html' },
        });
  try {
    await assert.rejects(connectSchool('0000000', 'test-only'), {
      code: 'upstream',
    });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
