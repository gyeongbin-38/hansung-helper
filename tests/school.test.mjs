import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCourses,
  connectSchool,
  resumeSchool,
  SchoolError,
  SchoolSession,
} from '../lib/server/school.ts';

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
test('course parser flags .course_label_ec community courses', () => {
  const html = `<ul class="my-course-lists"><li><span class="course_label_ec">커뮤니티</span><a href="/course/view.php?id=7">커뮤니티 수업</a></li><li><a href="/course/view.php?id=8">일반 수업</a></li></ul>`;
  assert.deepEqual(parseCourses(html), [
    {
      id: '7',
      name: '커뮤니티 수업',
      url: 'https://learn.hansung.ac.kr/course/view.php?id=7',
      community: true,
    },
    {
      id: '8',
      name: '일반 수업',
      url: 'https://learn.hansung.ac.kr/course/view.php?id=8',
    },
  ]);
});
test('a malformed course link does not prevent other courses from being collected', () => {
  const html = '<a href="https://[bad/course/view.php?id=1">bad</a><a href="/course/view.php?id=2">good</a>';
  assert.deepEqual(parseCourses(html).map((course) => course.id), ['2']);
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
test('deferLms holds back detail collection until the closure runs', async () => {
  const original = globalThis.fetch,
    requests = [];
  const responses = [
    new Response(''),
    new Response('', {
      status: 302,
      headers: { Location: 'https://info.hansung.ac.kr/h_dae/dae_main.html' },
    }),
    new Response('infohaksamain_portal.jsp'),
    new Response('head_bt_logout.gif'),
    new Response(''),
    new Response('', {
      status: 303,
      headers: { Location: 'https://learn.hansung.ac.kr/' },
    }),
    new Response(
      '<a href="/login/logout.php">나가기</a><a href="/course/view.php?id=5">테스트 수업</a>',
    ),
  ];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return responses.shift() ?? new Response('');
  };
  let deferred;
  try {
    const result = await connectSchool('0000000', 'test-only-password', {
      deferLms: (collect) => {
        deferred = collect;
      },
    });
    assert.equal(result.lms, 'connected');
    assert.equal(result.lmsData, undefined);
    assert.equal(typeof deferred, 'function');
    const loginCalls = requests.length;
    const lmsData = await deferred();
    assert.equal(lmsData.source, 'cosmos-lms');
    assert.equal(lmsData.courses.length, 1);
    assert(requests.length > loginCalls);
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
test('unexpected portal login response is a connection failure, not a wrong-password claim', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(calls === 1 ? '' : 'maintenance'); };
  try {
    await assert.rejects(connectSchool('0000000', 'fixture'), { code: 'upstream' });
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
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

test('transient LMS login-page failure retries the GET but not the password POST', async () => {
  const original = globalThis.fetch;
  let portalCalls = 0, lmsReads = 0, lmsPosts = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.hostname === 'info.hansung.ac.kr') {
      portalCalls++;
      if (portalCalls === 1) return new Response('');
      if (portalCalls === 2) return new Response('', { status: 302, headers: { Location: '/h_dae/dae_main.html' } });
      return new Response(portalCalls === 3 ? 'infohaksamain_portal.jsp' : 'head_bt_logout.gif');
    }
    if (url.pathname === '/login.php') {
      if (++lmsReads === 1) return new Response('', { status: 503 });
      return new Response('');
    }
    if (url.pathname === '/login/index.php') {
      assert.equal(init.method, 'POST'); lmsPosts++;
      return new Response('<a href="/login/logout.php">logout</a><a href="/course/view.php?id=5">fixture</a>');
    }
    throw new Error('unexpected request');
  };
  try {
    const snapshot = await connectSchool('0000000', 'fixture', { deferLms() {}, deferInfo() {} });
    assert.equal(snapshot.lms, 'connected');
    assert.equal(lmsReads, 2);
    assert.equal(lmsPosts, 1);
  } finally { globalThis.fetch = original; }
});

test('lost LMS login response probes the session without submitting credentials twice', async () => {
  const original = globalThis.fetch;
  let portalCalls = 0, posts = 0, probes = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.hostname === 'info.hansung.ac.kr') {
      portalCalls++;
      if (portalCalls === 1) return new Response('');
      if (portalCalls === 2) return new Response('', { status: 302, headers: { Location: '/h_dae/dae_main.html' } });
      return new Response(portalCalls === 3 ? 'infohaksamain_portal.jsp' : 'head_bt_logout.gif');
    }
    if (url.pathname === '/login.php') return new Response('');
    if (url.pathname === '/login/index.php') { posts++; throw new TypeError('network'); }
    if (url.pathname === '/my/') { probes++; return new Response('<a href="/login/logout.php">logout</a><a href="/course/view.php?id=5">fixture</a>'); }
    throw new Error('unexpected request');
  };
  try {
    const snapshot = await connectSchool('0000000', 'fixture', { deferLms() {}, deferInfo() {} });
    assert.equal(snapshot.lms, 'connected');
    assert.equal(snapshot.courses.length, 1);
    assert.equal(posts, 1);
    assert.equal(probes, 1);
  } finally { globalThis.fetch = original; }
});

test('a failed LMS login and failed session probe never resend the password', async () => {
  const original = globalThis.fetch;
  let portalCalls = 0, posts = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.hostname === 'info.hansung.ac.kr') {
      portalCalls++;
      if (portalCalls === 1) return new Response('');
      if (portalCalls === 2) return new Response('', { status: 302, headers: { Location: '/h_dae/dae_main.html' } });
      return new Response(portalCalls === 3 ? 'infohaksamain_portal.jsp' : 'head_bt_logout.gif');
    }
    if (url.pathname === '/login.php') return new Response('');
    if (url.pathname === '/login/index.php') { posts++; throw new TypeError('network'); }
    if (url.pathname === '/my/') return new Response('login required');
    throw new Error('unexpected request');
  };
  try {
    const snapshot = await connectSchool('0000000', 'fixture', { deferLms() {}, deferInfo() {} });
    assert.equal(snapshot.lms, 'unavailable');
    assert.equal(snapshot.lmsError, 'upstream');
    assert.equal(posts, 1);
  } finally { globalThis.fetch = original; }
});

test('resumeSchool reports definite login pages as an expired school session', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('login required');
  try {
    await assert.rejects(
      resumeSchool(new SchoolSession({
        'info.hansung.ac.kr': { JSESSIONID: 'expired' },
        'learn.hansung.ac.kr': { MoodleSession: 'expired' },
      }), ''),
      error => error instanceof SchoolError && error.code === 'session',
    );
  } finally { globalThis.fetch = original; }
});

test('resumeSchool preserves the vault on transport failure instead of claiming expiry', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.hostname === 'info.hansung.ac.kr') throw new TypeError('network');
    return new Response('login required');
  };
  try {
    await assert.rejects(
      resumeSchool(new SchoolSession({
        'info.hansung.ac.kr': { JSESSIONID: 'possibly-valid' },
        'learn.hansung.ac.kr': { MoodleSession: 'possibly-valid' },
      }), ''),
      error => error instanceof SchoolError && error.code === 'upstream',
    );
  } finally { globalThis.fetch = original; }
});
