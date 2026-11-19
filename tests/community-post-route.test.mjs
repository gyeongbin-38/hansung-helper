import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function load(file, imports) {
  const source = await readFile(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require(name) {
      if (!(name in imports)) throw new Error(`unexpected import: ${name}`);
      return imports[name];
    },
    console, Response, Request, URL, JSON,
  }, { filename: file });
  return exports;
}

const json = (body, status = 200) =>
  Response.json(status >= 400 ? { ok: false, error: body } : { ok: true, data: body }, { status });

// 클라이언트는 모든 글 변경 응답을 { post: CommunityPost }로 읽는다 —
// POST /posts가 날 post 객체를 돌려주면 data.post.id에서 클라이언트가
// 죽는 계약 불일치였다(저장은 되는데 화면은 오류). 다른 형제 라우트와
// 같은 봉투로 고정됐는지 검증한다.
const route = await load('app/api/community/posts/route.ts', {
  '@/lib/server/account': {
    authenticated: async () => ({ id: 'acc', session_hash: 's' }),
    json,
    validOrigin: () => true,
  },
  '@/lib/server/community': {
    createCommunityPost: async () => ({ ok: true, data: { id: 'post-1', title: 't' } }),
    listCommunityPosts: async () => ({ posts: [], nextCursor: null }),
    readCommunityBody: async () => ({ ok: true, data: {} }),
  },
  '@/lib/data/community': { isCommunitySort: () => true },
});

const res = await route.POST(new Request('https://app.example/api/community/posts', {
  method: 'POST',
  headers: { origin: 'https://app.example', 'content-type': 'application/json' },
  body: '{}',
}));
assert.equal(res.status, 201);
const envelope = await res.json();
assert.equal(envelope.ok, true);
assert.equal(envelope.data.post.id, 'post-1', 'create must return { post } envelope like sibling routes');
console.log('community post route: {post} envelope verified');
