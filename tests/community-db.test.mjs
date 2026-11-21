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
db.exec(await readFile('drizzle/0008_community_blocks.sql', 'utf8'));

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
  blockCommunityAuthor,
  communityMe,
  communityModerationReports,
  communityModerationSetDeleted,
  createCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  getCommunityPost,
  listCommunityPosts,
  reportCommunityTarget,
  toggleCommunityLike,
  unblockCommunityAuthor,
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

/* 이용자 차단 — 차단한 작성자의 글·댓글이 차단한 사람에게만 숨겨져야 한다. */
clearLimits();
const cPost = await createCommunityPost('c', { title: 'c의 글', body: '차단 테스트용 본문' });
assert.equal(cPost.ok, true);
clearLimits();
const bCommentOnC = await createCommunityComment('b', cPost.data.id, { body: 'b의 댓글' }, undefined);
assert.equal(bCommentOnC.ok, true);
clearLimits();
const aPost2 = await createCommunityPost('a', { title: 'a의 새 글', body: '답글 필터 확인' });
assert.equal(aPost2.ok, true);
const bReplyOnA = await createCommunityComment('b', aPost2.data.id, { body: 'b의 답글' }, undefined);
assert.equal(bReplyOnA.ok, true);
assert.equal((await communityMe('a')).replies.length, 1);

// 차단 전: a의 피드에는 b·c 글이 모두 보인다
const beforeBlock = await listCommunityPosts({ accountId: 'a' });
assert.ok(beforeBlock.posts.some((post) => post.id === secondId));
assert.ok(beforeBlock.posts.some((post) => post.id === cPost.data.id));

const aliasB = second.data.author.alias;
const blockedResult = await blockCommunityAuthor('a', aliasB);
assert.equal(blockedResult.ok, true);
// 본인 차단은 거부, 알 수 없는 별명도 거부
assert.equal((await blockCommunityAuthor('a', (await communityMe('a')).alias)).ok, false);
assert.equal((await blockCommunityAuthor('a', '없는 별명')).status, 404);

// 차단 후: b의 글은 a의 피드에서 사라지지만 다른 이용자에게는 남는다
const afterBlock = await listCommunityPosts({ accountId: 'a' });
assert.ok(!afterBlock.posts.some((post) => post.id === secondId));
assert.ok(afterBlock.posts.some((post) => post.id === cPost.data.id));
const forC = await listCommunityPosts({ accountId: 'c' });
assert.ok(forC.posts.some((post) => post.id === secondId));
// 비로그인 조회에는 차단이 적용되지 않는다
assert.ok((await listCommunityPosts({})).posts.some((post) => post.id === secondId));

// 차단한 작성자의 글은 상세에서도 보이지 않고, b의 댓글은 c의 글에서 숨겨진다
assert.equal(await getCommunityPost(secondId, { id: 'a' }), null);
const cPostForA = await getCommunityPost(cPost.data.id, { id: 'a' });
assert.ok(cPostForA);
assert.equal(cPostForA.comments.length, 0);
const cPostForC = await getCommunityPost(cPost.data.id, { id: 'c' });
assert.equal(cPostForC.comments.length, 1);
// 차단한 이용자의 답글은 내 활동의 답글 목록에서도 숨겨진다
assert.equal((await communityMe('a')).replies.length, 0);

// 내 활동의 차단 목록에 별명이 나타나고, 해제하면 다시 보인다
const meBlocked = await communityMe('a');
assert.deepEqual(meBlocked.blocked, [aliasB]);
const unblocked = await unblockCommunityAuthor('a', aliasB);
assert.equal(unblocked.ok, true);
const restored = await listCommunityPosts({ accountId: 'a' });
assert.ok(restored.posts.some((post) => post.id === secondId));
assert.equal((await getCommunityPost(cPost.data.id, { id: 'a' })).comments.length, 1);
const meAfterUnblock = await communityMe('a');
assert.deepEqual(meAfterUnblock.blocked, []);
assert.equal(meAfterUnblock.replies.length, 1);
// 정리 — 차단 테스트용 댓글·글 삭제
await deleteCommunityComment('b', cPost.data.id, bCommentOnC.data.comments[0].id);
await deleteCommunityPost('c', cPost.data.id);
await deleteCommunityPost('a', aPost2.data.id);

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

/* 운영자 모더레이션 — 신고가 대상별로 집계되고 숨김/복원이 동작해야 한다. */
clearLimits();
const cComment = await createCommunityComment('c', third.data.id, { body: '신고될 댓글' }, undefined);
assert.equal(cComment.ok, true);
const cCommentId = cComment.data.comments[0].id;
clearLimits();
assert.equal(
  (await reportCommunityTarget('a', third.data.id, { reason: '광고 또는 도배', detail: '모더레이션 확인' })).ok,
  true,
);
clearLimits();
assert.equal(
  (await reportCommunityTarget('a', third.data.id, { commentId: cCommentId, reason: '욕설 또는 괴롭힘' })).ok,
  true,
);

const reports = await communityModerationReports();
const postItem = reports.items.find((item) => item.targetId === third.data.id);
assert.ok(postItem);
assert.equal(postItem.targetType, 'post');
assert.equal(postItem.reportCount, 1);
assert.deepEqual(postItem.reasons, ['광고 또는 도배']);
assert.equal(postItem.lastDetail, '모더레이션 확인');
assert.equal(postItem.content.kind, 'post');
assert.equal(postItem.content.deleted, false);
assert.equal(postItem.content.title, '남겨질 글');
const commentItem = reports.items.find((item) => item.targetId === cCommentId);
assert.ok(commentItem);
assert.equal(commentItem.targetType, 'comment');
assert.equal(commentItem.content.body, '신고될 댓글');
assert.equal(commentItem.content.postTitle, '남겨질 글');

// 숨김 처리하면 피드·상세에서 사라지고, 복원하면 돌아온다
assert.equal((await communityModerationSetDeleted('post', third.data.id, true)).ok, true);
assert.equal(await getCommunityPost(third.data.id), null);
assert.equal(
  (await communityModerationReports()).items.find((item) => item.targetId === third.data.id)
    .content.deleted,
  true,
);
assert.equal((await communityModerationSetDeleted('comment', cCommentId, true)).ok, true);
assert.equal((await communityModerationSetDeleted('post', third.data.id, false)).ok, true);
const afterRestore = await getCommunityPost(third.data.id);
assert.ok(afterRestore);
assert.equal(afterRestore.comments.length, 0);
assert.equal((await communityModerationSetDeleted('comment', cCommentId, false)).ok, true);
assert.equal((await getCommunityPost(third.data.id)).comments.length, 1);

// 잘못된 입력은 거부된다
assert.equal((await communityModerationSetDeleted('like', 'x', true)).status, 400);
assert.equal((await communityModerationSetDeleted('post', '없는-id', true)).status, 404);
assert.equal((await communityModerationSetDeleted('post', '', true)).status, 400);

console.log('community db pass');
