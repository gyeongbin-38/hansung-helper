import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as communityData from '../lib/data/community.ts';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(await readFile('drizzle/0000_academic_accounts.sql', 'utf8'));
db.exec(await readFile('drizzle/0005_community.sql', 'utf8'));

const d1 = {
  prepare(query) {
    let args = [];
    const statement = {
      bind(...values) {
        args = values;
        return statement;
      },
      async first() {
        return db.prepare(query).get(...args) ?? null;
      },
      async all() {
        return { results: db.prepare(query).all(...args) };
      },
      async run() {
        return { meta: { changes: Number(db.prepare(query).run(...args).changes) } };
      },
    };
    return statement;
  },
  async batch(statements) {
    db.exec('BEGIN');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};

const source = await readFile('lib/server/community.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const exports = {};
class PayloadTooLargeError extends Error {}
const accountStub = {
  database: () => d1,
  readTextLimited: async () => '{}',
  PayloadTooLargeError,
};
vm.runInNewContext(js, {
  exports,
  require: (name) =>
    name === './account'
      ? accountStub
      : name === '@/lib/data/community'
        ? communityData
        : undefined,
  crypto: webcrypto,
  console,
  Date,
  JSON,
  Math,
  Number,
  Array,
  Object,
  Set,
  Map,
  Promise,
  Uint32Array,
});

const {
  communityMe,
  createCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  getCommunityPost,
  listCommunityPosts,
  reportCommunityTarget,
  toggleCommunityLike,
  updateCommunityComment,
  updateCommunityPost,
} = exports;

function account(id) {
  db.prepare(
    "INSERT INTO academic_accounts(id, student_mask, profile, snapshot, onboarded, created_at, consent_at) VALUES (?, 'mask', '{}', '{}', 0, 1, 1)",
  ).run(id);
}
function clearLimits() {
  db.prepare('DELETE FROM academic_login_limits').run();
}

account('a');
account('b');
account('c');

const first = await createCommunityPost('a', {
  category: '질문',
  title: '  수강신청 질문  ',
  body: '  이번 학기 수강신청 일정이 궁금합니다.  ',
});
assert.equal(first.ok, true);
assert.equal(first.data.title, '수강신청 질문');
assert.equal(first.data.body, '이번 학기 수강신청 일정이 궁금합니다.');
assert.equal(first.data.category, '질문');
assert.equal(first.data.mine, true);
assert.ok(first.data.author.alias.length > 0);
const firstId = first.data.id;

const blocked = await createCommunityPost('a', {
  title: '연속 글',
  body: '너무 빨리 쓰면 막힙니다.',
});
assert.equal(blocked.ok, false);
assert.equal(blocked.status, 429);
clearLimits();

const second = await createCommunityPost('b', {
  title: '두 번째 글',
  body: '자유 게시판 본문',
});
assert.equal(second.ok, true);
const secondId = second.data.id;

const listed = await listCommunityPosts({});
assert.equal(listed.posts.length, 2);
assert.deepEqual(
  new Set(listed.posts.map((post) => post.id)),
  new Set([firstId, secondId]),
);
const searched = await listCommunityPosts({ q: '두 번째' });
assert.equal(searched.posts.length, 1);
assert.equal(searched.posts[0].id, secondId);

const viewer = await getCommunityPost(firstId, { id: 'b' });
assert.equal(viewer.mine, false);
assert.equal(viewer.liked, false);
assert.equal(viewer.author.alias, first.data.author.alias);

let like = await toggleCommunityLike('b', firstId);
assert.equal(like.ok, true);
assert.equal(like.data.liked, true);
assert.equal(like.data.likeCount, 1);
like = await toggleCommunityLike('b', firstId);
assert.equal(like.data.liked, false);
assert.equal(like.data.likeCount, 0);

const commented = await createCommunityComment('b', firstId, { body: '저도 궁금해요.' }, undefined);
assert.equal(commented.ok, true);
const commentId = commented.data.comments[0].id;
const replied = await createCommunityComment('a', firstId, { body: '확인했습니다.' }, commentId);
assert.equal(replied.ok, true);
const reply = replied.data.comments.find((comment) => comment.parentId === commentId);
assert.ok(reply);
const nested = await createCommunityComment('c', firstId, { body: '대댓글' }, reply.id);
assert.equal(nested.ok, false);
assert.equal(nested.status, 400);

const deniedEdit = await updateCommunityComment('c', firstId, commentId, { body: '수정' });
assert.equal(deniedEdit.ok, false);
assert.equal(deniedEdit.status, 403);
const editedComment = await updateCommunityComment('b', firstId, commentId, { body: '저도 궁금해요!' });
assert.equal(editedComment.ok, true);
assert.equal(
  editedComment.data.comments.find((comment) => comment.id === commentId).body,
  '저도 궁금해요!',
);

const removedComment = await deleteCommunityComment('a', firstId, commentId);
assert.equal(removedComment.ok, true);
assert.equal(removedComment.data.comments.length, 1);
assert.equal(removedComment.data.comments[0].parentId, undefined);

const reported = await reportCommunityTarget('b', firstId, {
  reason: '광고 또는 도배',
  detail: '테스트 신고',
});
assert.equal(reported.ok, true);
clearLimits();
const duplicateReport = await reportCommunityTarget('b', firstId, {
  reason: '광고 또는 도배',
});
assert.equal(duplicateReport.ok, true);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM community_reports').get().n, 1);

const me = await communityMe('a');
assert.equal(me.alias, first.data.author.alias);
assert.equal(me.posts.length, 1);
assert.equal(me.comments.length, 1);
assert.equal(me.replies.length, 0);

const wrongEdit = await updateCommunityPost('b', firstId, {
  category: '정보',
  title: '남의 글 수정',
  body: '수정 본문',
});
assert.equal(wrongEdit.ok, false);
assert.equal(wrongEdit.status, 403);
const editedPost = await updateCommunityPost('a', firstId, {
  category: '정보',
  title: '수정된 글',
  body: '수정된 본문',
});
assert.equal(editedPost.ok, true);
assert.equal(editedPost.data.title, '수정된 글');
assert.equal(editedPost.data.category, '정보');

const wrongDelete = await deleteCommunityPost('b', firstId);
assert.equal(wrongDelete.ok, false);
assert.equal(wrongDelete.status, 403);
const deletedPost = await deleteCommunityPost('a', firstId);
assert.equal(deletedPost.ok, true);
assert.equal(await getCommunityPost(firstId), null);

/* 계정 삭제·글 삭제 연쇄 — 남은 계정과 콘텐츠만 보존되어야 한다. */
clearLimits();
const third = await createCommunityPost('c', {
  title: '남겨질 글',
  body: 'c의 글',
});
assert.equal(third.ok, true);
clearLimits();
const bPost = await createCommunityPost('b', {
  title: '삭제될 글',
  body: 'b의 글',
});
assert.equal(bPost.ok, true);
const bComment = await createCommunityComment('b', third.data.id, { body: 'b의 댓글' }, undefined);
assert.equal(bComment.ok, true);
await toggleCommunityLike('b', third.data.id);
db.prepare('DELETE FROM academic_accounts WHERE id = ?').run('b');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM community_posts WHERE author_id = ?').get('b').n, 0);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM community_comments WHERE author_id = ?').get('b').n, 0);
assert.equal(
  db.prepare('SELECT COUNT(*) AS n FROM community_post_likes WHERE account_id = ?').get('b').n,
  0,
);
assert.equal(
  db.prepare('SELECT COUNT(*) AS n FROM community_reports WHERE reporter_id = ?').get('b').n,
  0,
);
assert.equal(
  db.prepare('SELECT COUNT(*) AS n FROM community_aliases WHERE account_id = ?').get('b').n,
  0,
);
assert.equal(
  db.prepare('SELECT COUNT(*) AS n FROM community_comments WHERE post_id = ?').get(bPost.data.id).n,
  0,
);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
const survivors = await getCommunityPost(third.data.id);
assert.ok(survivors);
assert.equal(survivors.likeCount, 0);
assert.equal(survivors.comments.length, 0);

console.log('community db pass');
