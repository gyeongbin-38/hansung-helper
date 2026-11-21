import { database, PayloadTooLargeError, readTextLimited } from './account';
import {
  COMMUNITY_LIMITS,
  COMMUNITY_PAGE_SIZE,
  communityPreview,
  isCommunityReportReason,
  isCommunitySort,
  sortCommunityPosts,
  validateCommunityComment,
  validateCommunityPost,
  validateCommunityReportDetail,
  type CommunityComment,
  type CommunityMe,
  type CommunityPost,
  type CommunityPostSummary,
  type CommunitySort,
} from '@/lib/data/community';

export type CommunityResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

type Viewer = { id: string };

type PostRow = {
  id: string;
  category: string;
  title: string;
  body: string;
  author_id: string;
  alias: string | null;
  like_count: number;
  comment_count: number;
  created_at: number;
  updated_at: number | null;
};

type CommentRow = {
  id: string;
  body: string;
  author_id: string;
  parent_id: string | null;
  alias: string | null;
  created_at: number;
  updated_at: number | null;
};

const ALIAS_ADJECTIVES = [
  '조용한',
  '부지런한',
  '다정한',
  '용감한',
  '꼼꼼한',
  '유쾌한',
  '차분한',
  '반짝이는',
  '든든한',
  '호기심 많은',
];
const ALIAS_NOUNS = [
  '부엉이',
  '올빼미',
  '참새',
  '다람쥐',
  '고양이',
  '여우',
  '펭귄',
  '수달',
  '사슴',
  '토끼',
];

function pick(list: readonly string[]) {
  const bucket = new Uint32Array(1);
  crypto.getRandomValues(bucket);
  return list[bucket[0] % list.length];
}

/** 계정별 익명 별명 — 최초 작성 시 한 번만 만들고 이후에는 같은 이름을 쓴다. */
export async function readCommunityBody(
  request: Request,
): Promise<CommunityResult<Record<string, unknown>>> {
  try {
    const raw = await readTextLimited(request, 12000);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return { ok: false, error: '요청 형식을 확인해 주세요.', status: 400 };
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof PayloadTooLargeError
          ? '요청 내용이 너무 큽니다.'
          : '요청 형식을 확인해 주세요.',
      status: error instanceof PayloadTooLargeError ? 413 : 400,
    };
  }
}

export async function communityAlias(accountId: string): Promise<string> {
  const db = database();
  const existing = await db
    .prepare('SELECT alias FROM community_aliases WHERE account_id = ?')
    .bind(accountId)
    .first<{ alias: string }>();
  if (existing) return existing.alias;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const alias = `${pick(ALIAS_ADJECTIVES)} ${pick(ALIAS_NOUNS)} ${100 + Math.floor(Math.random() * 900)}`;
    try {
      await db
        .prepare(
          'INSERT INTO community_aliases (account_id, alias, created_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO NOTHING',
        )
        .bind(accountId, alias, Date.now())
        .run();
      const row = await db
        .prepare('SELECT alias FROM community_aliases WHERE account_id = ?')
        .bind(accountId)
        .first<{ alias: string }>();
      if (row) return row.alias;
    } catch {
      // 다른 요청이 같은 별명을 먼저 선점했을 수 있다 — 다음 후보로 재시도한다.
    }
  }
  throw new Error('커뮤니티 별명을 만들지 못했습니다.');
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, '\\$&');
}

/** 30초·10초 같은 작성 간격 — academic_login_limits를 원자적 쿨다운으로 재사용한다. */
async function allowAfter(key: string, intervalMs: number) {
  const db = database();
  const now = Date.now();
  const results = await db.batch([
    db
      .prepare(
        'INSERT OR IGNORE INTO academic_login_limits (key, attempts, expires_at) VALUES (?, 0, 0)',
      )
      .bind(key),
    db
      .prepare(
        'UPDATE academic_login_limits SET attempts = attempts + 1, expires_at = ? WHERE key = ? AND expires_at <= ?',
      )
      .bind(now + intervalMs, key, now),
  ]);
  return (results[1]?.meta.changes ?? 0) > 0;
}

function summaryOf(row: PostRow, accountId?: string): CommunityPostSummary {
  return {
    id: row.id,
    ...(accountId && row.author_id === accountId ? { mine: true } : {}),
    category: row.category,
    title: row.title,
    preview: communityPreview(row.body),
    author: { alias: row.alias ?? '익명' },
    commentCount: Number(row.comment_count ?? 0),
    likeCount: Number(row.like_count ?? 0),
    createdAt: Number(row.created_at),
    ...(row.updated_at ? { updatedAt: Number(row.updated_at) } : {}),
  };
}

const SELECT_POSTS =
  'SELECT p.id, p.category, p.title, p.body, p.author_id, ca.alias, ' +
  '(SELECT COUNT(*) FROM community_post_likes l WHERE l.post_id = p.id) AS like_count, ' +
  '(SELECT COUNT(*) FROM community_comments c WHERE c.post_id = p.id AND c.deleted = 0) AS comment_count, ' +
  'p.created_at, p.updated_at ' +
  'FROM community_posts p LEFT JOIN community_aliases ca ON ca.account_id = p.author_id ' +
  'WHERE p.deleted = 0';

export async function listCommunityPosts(options: {
  q?: string;
  sort?: CommunitySort;
  before?: string | null;
  accountId?: string;
}) {
  const db = database();
  const sort = isCommunitySort(options.sort) ? options.sort : 'latest';
  const query = (options.q ?? '').trim().slice(0, COMMUNITY_LIMITS.query);
  const before = (options.before ?? '').slice(0, 64) || null;
  const accountId = options.accountId;
  const like = `%${escapeLike(query)}%`;
  const searchSql = query
    ? " AND (p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')"
    : '';
  // 차단한 이용자의 글은 피드에서 보이지 않는다
  const blockSql = accountId
    ? ' AND p.author_id NOT IN (SELECT blocked_id FROM community_blocks WHERE account_id = ?)'
    : '';
  const searchArgs: unknown[] = query ? [like, like] : [];
  const baseArgs: unknown[] = accountId ? [...searchArgs, accountId] : searchArgs;

  if (sort === 'latest') {
    let args: unknown[] = [...baseArgs];
    let keyset = '';
    if (before) {
      const pivot = await db
        .prepare('SELECT created_at, id FROM community_posts WHERE id = ? AND deleted = 0')
        .bind(before)
        .first<{ created_at: number; id: string }>();
      if (!pivot) return { posts: [], nextCursor: null };
      keyset = ' AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))';
      args = [...baseArgs, pivot.created_at, pivot.created_at, pivot.id];
    }
    const rows = await db
      .prepare(
        `${SELECT_POSTS}${searchSql}${blockSql}${keyset} ORDER BY p.created_at DESC, p.id DESC LIMIT ${COMMUNITY_PAGE_SIZE + 1}`,
      )
      .bind(...args)
      .all<PostRow>();
    const slice = rows.results
      .slice(0, COMMUNITY_PAGE_SIZE)
      .map((row) => summaryOf(row, accountId));
    return {
      posts: slice,
      nextCursor: rows.results.length > COMMUNITY_PAGE_SIZE ? (slice.at(-1)?.id ?? null) : null,
    };
  }

  // 인기·트렌딩은 점수가 변동값이라 id 커서 대신 최근 200개 안에서 위치를 찾아 자른다.
  const rows = await db
    .prepare(
      `${SELECT_POSTS}${searchSql}${blockSql} ORDER BY ${
        sort === 'popular' ? 'like_count DESC, p.created_at DESC' : 'p.created_at DESC'
      } LIMIT 200`,
    )
    .bind(...baseArgs)
    .all<PostRow>();
  const sorted = sortCommunityPosts(
    rows.results.map((row) => summaryOf(row, accountId)),
    sort,
  );
  const index = before ? sorted.findIndex((post) => post.id === before) : -1;
  const start = index < 0 ? 0 : index + 1;
  const slice = sorted.slice(start, start + COMMUNITY_PAGE_SIZE);
  return {
    posts: slice,
    nextCursor: sorted.length > start + COMMUNITY_PAGE_SIZE ? (slice.at(-1)?.id ?? null) : null,
  };
}

export async function getCommunityPost(
  id: string,
  viewer: Viewer | null = null,
): Promise<CommunityPost | null> {
  const db = database();
  const post = await db
    .prepare(
      `${SELECT_POSTS} AND p.id = ?` +
        (viewer
          ? ' AND p.author_id NOT IN (SELECT blocked_id FROM community_blocks WHERE account_id = ?)'
          : ''),
    )
    .bind(...(viewer ? [id.slice(0, 64), viewer.id] : [id.slice(0, 64)]))
    .first<PostRow>();
  if (!post) return null;
  const [commentRows, liked] = await Promise.all([
    db
      .prepare(
        'SELECT c.id, c.body, c.author_id, c.parent_id, ca.alias, c.created_at, c.updated_at ' +
          'FROM community_comments c LEFT JOIN community_aliases ca ON ca.account_id = c.author_id ' +
          'WHERE c.post_id = ? AND c.deleted = 0' +
          (viewer
            ? ' AND c.author_id NOT IN (SELECT blocked_id FROM community_blocks WHERE account_id = ?)'
            : '') +
          ' ORDER BY c.created_at ASC, c.id ASC LIMIT 300',
      )
      .bind(...(viewer ? [post.id, viewer.id] : [post.id]))
      .all<CommentRow>(),
    viewer
      ? db
          .prepare('SELECT 1 AS x FROM community_post_likes WHERE post_id = ? AND account_id = ?')
          .bind(post.id, viewer.id)
          .first<{ x: number }>()
      : Promise.resolve(null),
  ]);
  const ids = new Set(commentRows.results.map((comment) => comment.id));
  const comments: CommunityComment[] = commentRows.results.map((comment) => ({
    id: comment.id,
    body: comment.body,
    author: { alias: comment.alias ?? '익명' },
    createdAt: Number(comment.created_at),
    ...(comment.updated_at ? { updatedAt: Number(comment.updated_at) } : {}),
    ...(comment.parent_id && ids.has(comment.parent_id) ? { parentId: comment.parent_id } : {}),
    ...(viewer ? { mine: viewer.id === comment.author_id } : {}),
  }));
  return {
    id: post.id,
    category: post.category,
    title: post.title,
    body: post.body,
    author: { alias: post.alias ?? '익명' },
    createdAt: Number(post.created_at),
    ...(post.updated_at ? { updatedAt: Number(post.updated_at) } : {}),
    likeCount: Number(post.like_count ?? 0),
    liked: Boolean(liked),
    mine: Boolean(viewer && viewer.id === post.author_id),
    comments,
  };
}

export async function createCommunityPost(
  accountId: string,
  input: unknown,
): Promise<CommunityResult<CommunityPost>> {
  const parsed = validateCommunityPost(input);
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };
  if (!(await allowAfter(`community:post:${accountId}`, 30_000)))
    return { ok: false, error: '글은 30초에 한 번만 작성할 수 있습니다.', status: 429 };
  await communityAlias(accountId);
  const id = crypto.randomUUID();
  await database()
    .prepare(
      'INSERT INTO community_posts (id, author_id, category, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(id, accountId, parsed.value.category, parsed.value.title, parsed.value.body, Date.now())
    .run();
  const post = await getCommunityPost(id, { id: accountId });
  return post
    ? { ok: true, data: post }
    : { ok: false, error: '글을 저장하지 못했습니다.', status: 503 };
}

export async function updateCommunityPost(
  accountId: string,
  id: string,
  input: unknown,
): Promise<CommunityResult<CommunityPost>> {
  const parsed = validateCommunityPost(input);
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };
  const db = database();
  const row = await db
    .prepare('SELECT author_id FROM community_posts WHERE id = ? AND deleted = 0')
    .bind(id)
    .first<{ author_id: string }>();
  if (!row) return { ok: false, error: '글을 찾을 수 없습니다.', status: 404 };
  if (row.author_id !== accountId)
    return { ok: false, error: '본인 글만 수정할 수 있습니다.', status: 403 };
  await db
    .prepare('UPDATE community_posts SET category = ?, title = ?, body = ?, updated_at = ? WHERE id = ?')
    .bind(parsed.value.category, parsed.value.title, parsed.value.body, Date.now(), id)
    .run();
  const post = await getCommunityPost(id, { id: accountId });
  return post
    ? { ok: true, data: post }
    : { ok: false, error: '글을 찾을 수 없습니다.', status: 404 };
}

export async function deleteCommunityPost(
  accountId: string,
  id: string,
): Promise<CommunityResult<{ deleted: true }>> {
  const db = database();
  const row = await db
    .prepare('SELECT author_id FROM community_posts WHERE id = ? AND deleted = 0')
    .bind(id)
    .first<{ author_id: string }>();
  if (!row) return { ok: false, error: '글을 찾을 수 없습니다.', status: 404 };
  if (row.author_id !== accountId)
    return { ok: false, error: '본인 글만 삭제할 수 있습니다.', status: 403 };
  await db.prepare('UPDATE community_posts SET deleted = 1 WHERE id = ?').bind(id).run();
  return { ok: true, data: { deleted: true } };
}

export async function toggleCommunityLike(
  accountId: string,
  postId: string,
): Promise<CommunityResult<{ liked: boolean; likeCount: number }>> {
  const db = database();
  const post = await db
    .prepare('SELECT 1 AS x FROM community_posts WHERE id = ? AND deleted = 0')
    .bind(postId)
    .first();
  if (!post) return { ok: false, error: '글을 찾을 수 없습니다.', status: 404 };
  const existing = await db
    .prepare('SELECT 1 AS x FROM community_post_likes WHERE post_id = ? AND account_id = ?')
    .bind(postId, accountId)
    .first();
  if (existing)
    await db
      .prepare('DELETE FROM community_post_likes WHERE post_id = ? AND account_id = ?')
      .bind(postId, accountId)
      .run();
  else
    await db
      .prepare('INSERT INTO community_post_likes (post_id, account_id, created_at) VALUES (?, ?, ?)')
      .bind(postId, accountId, Date.now())
      .run();
  const count = await db
    .prepare('SELECT COUNT(*) AS c FROM community_post_likes WHERE post_id = ?')
    .bind(postId)
    .first<{ c: number }>();
  return { ok: true, data: { liked: !existing, likeCount: Number(count?.c ?? 0) } };
}

export async function createCommunityComment(
  accountId: string,
  postId: string,
  input: unknown,
  parentId: unknown,
): Promise<CommunityResult<CommunityPost>> {
  const parsed = validateCommunityComment(input);
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };
  if (!(await allowAfter(`community:comment:${accountId}`, 10_000)))
    return { ok: false, error: '댓글은 10초에 한 번만 작성할 수 있습니다.', status: 429 };
  const db = database();
  const post = await db
    .prepare('SELECT 1 AS x FROM community_posts WHERE id = ? AND deleted = 0')
    .bind(postId)
    .first();
  if (!post) return { ok: false, error: '글을 찾을 수 없습니다.', status: 404 };
  let parent: string | null = null;
  if (typeof parentId === 'string' && parentId) {
    const parentRow = await db
      .prepare(
        'SELECT id FROM community_comments WHERE id = ? AND post_id = ? AND deleted = 0 AND parent_id IS NULL',
      )
      .bind(parentId.slice(0, 64), postId)
      .first<{ id: string }>();
    if (!parentRow)
      return { ok: false, error: '답글을 달 수 없는 댓글입니다.', status: 400 };
    parent = parentRow.id;
  }
  await communityAlias(accountId);
  await db
    .prepare(
      'INSERT INTO community_comments (id, post_id, author_id, parent_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(crypto.randomUUID(), postId, accountId, parent, parsed.value.body, Date.now())
    .run();
  const postView = await getCommunityPost(postId, { id: accountId });
  return postView
    ? { ok: true, data: postView }
    : { ok: false, error: '댓글을 저장하지 못했습니다.', status: 503 };
}

export async function updateCommunityComment(
  accountId: string,
  postId: string,
  commentId: string,
  input: unknown,
): Promise<CommunityResult<CommunityPost>> {
  const parsed = validateCommunityComment(input);
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };
  const db = database();
  const row = await db
    .prepare('SELECT author_id FROM community_comments WHERE id = ? AND post_id = ? AND deleted = 0')
    .bind(commentId, postId)
    .first<{ author_id: string }>();
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.', status: 404 };
  if (row.author_id !== accountId)
    return { ok: false, error: '본인 댓글만 수정할 수 있습니다.', status: 403 };
  await db
    .prepare('UPDATE community_comments SET body = ?, updated_at = ? WHERE id = ?')
    .bind(parsed.value.body, Date.now(), commentId)
    .run();
  const post = await getCommunityPost(postId, { id: accountId });
  return post
    ? { ok: true, data: post }
    : { ok: false, error: '글을 찾을 수 없습니다.', status: 404 };
}

export async function deleteCommunityComment(
  accountId: string,
  postId: string,
  commentId: string,
): Promise<CommunityResult<CommunityPost>> {
  const db = database();
  const row = await db
    .prepare(
      'SELECT c.author_id AS comment_author, p.author_id AS post_author FROM community_comments c JOIN community_posts p ON p.id = c.post_id WHERE c.id = ? AND c.post_id = ? AND c.deleted = 0',
    )
    .bind(commentId, postId)
    .first<{ comment_author: string; post_author: string }>();
  if (!row) return { ok: false, error: '댓글을 찾을 수 없습니다.', status: 404 };
  if (row.comment_author !== accountId && row.post_author !== accountId)
    return {
      ok: false,
      error: '본인 댓글(또는 본인 글의 댓글)만 삭제할 수 있습니다.',
      status: 403,
    };
  await db
    .prepare('UPDATE community_comments SET deleted = 1, body = ? WHERE id = ?')
    .bind('', commentId)
    .run();
  const post = await getCommunityPost(postId, { id: accountId });
  return post
    ? { ok: true, data: post }
    : { ok: false, error: '글을 찾을 수 없습니다.', status: 404 };
}

export async function reportCommunityTarget(
  accountId: string,
  postId: string,
  input: unknown,
): Promise<CommunityResult<{ reported: true }>> {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (!isCommunityReportReason(source.reason))
    return { ok: false, error: '신고 사유를 선택해 주세요.', status: 400 };
  const detail = validateCommunityReportDetail(source.detail);
  if (detail === null)
    return { ok: false, error: '신고 상세 내용은 200자 이내로 입력해 주세요.', status: 400 };
  const commentId =
    typeof source.commentId === 'string' && source.commentId
      ? source.commentId.slice(0, 64)
      : null;
  if (!(await allowAfter(`community:report:${accountId}`, 20_000)))
    return { ok: false, error: '신고는 잠시 후 다시 접수할 수 있습니다.', status: 429 };
  const db = database();
  const post = await db
    .prepare('SELECT 1 AS x FROM community_posts WHERE id = ? AND deleted = 0')
    .bind(postId)
    .first();
  if (!post) return { ok: false, error: '글을 찾을 수 없습니다.', status: 404 };
  if (commentId) {
    const comment = await db
      .prepare('SELECT 1 AS x FROM community_comments WHERE id = ? AND post_id = ? AND deleted = 0')
      .bind(commentId, postId)
      .first();
    if (!comment) return { ok: false, error: '신고 대상을 찾을 수 없습니다.', status: 404 };
  }
  await db
    .prepare(
      'INSERT INTO community_reports (id, target_type, target_id, post_id, reporter_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(target_type, target_id, reporter_id) DO NOTHING',
    )
    .bind(
      crypto.randomUUID(),
      commentId ? 'comment' : 'post',
      commentId ?? postId,
      postId,
      accountId,
      source.reason,
      detail,
      Date.now(),
    )
    .run();
  return { ok: true, data: { reported: true } };
}

/** 별명으로 이용자 차단 — 피드·글·댓글에서 해당 작성자가 숨겨진다. */
export async function blockCommunityAuthor(
  accountId: string,
  alias: unknown,
): Promise<CommunityResult<{ blocked: true }>> {
  const name = typeof alias === 'string' ? alias.trim().slice(0, 64) : '';
  if (!name) return { ok: false, error: '차단할 이용자를 확인해 주세요.', status: 400 };
  const db = database();
  const target = await db
    .prepare('SELECT account_id FROM community_aliases WHERE alias = ?')
    .bind(name)
    .first<{ account_id: string }>();
  if (!target) return { ok: false, error: '이용자를 찾을 수 없습니다.', status: 404 };
  if (target.account_id === accountId)
    return { ok: false, error: '본인은 차단할 수 없습니다.', status: 400 };
  await db
    .prepare(
      'INSERT OR IGNORE INTO community_blocks (account_id, blocked_id, created_at) VALUES (?, ?, ?)',
    )
    .bind(accountId, target.account_id, Date.now())
    .run();
  return { ok: true, data: { blocked: true } };
}

export async function unblockCommunityAuthor(
  accountId: string,
  alias: unknown,
): Promise<CommunityResult<{ unblocked: true }>> {
  const name = typeof alias === 'string' ? alias.trim().slice(0, 64) : '';
  if (!name) return { ok: false, error: '해제할 이용자를 확인해 주세요.', status: 400 };
  const db = database();
  const target = await db
    .prepare('SELECT account_id FROM community_aliases WHERE alias = ?')
    .bind(name)
    .first<{ account_id: string }>();
  if (!target) return { ok: false, error: '이용자를 찾을 수 없습니다.', status: 404 };
  await db
    .prepare('DELETE FROM community_blocks WHERE account_id = ? AND blocked_id = ?')
    .bind(accountId, target.account_id)
    .run();
  return { ok: true, data: { unblocked: true } };
}

export async function communityMe(accountId: string): Promise<CommunityMe> {
  const db = database();
  const [alias, posts, comments, replies, blocked] = await Promise.all([
    communityAlias(accountId),
    db
      .prepare(
        'SELECT p.id, p.title, p.category, p.created_at, ' +
          '(SELECT COUNT(*) FROM community_post_likes l WHERE l.post_id = p.id) AS like_count, ' +
          '(SELECT COUNT(*) FROM community_comments c WHERE c.post_id = p.id AND c.deleted = 0) AS comment_count ' +
          'FROM community_posts p WHERE p.author_id = ? AND p.deleted = 0 ORDER BY p.created_at DESC LIMIT 10',
      )
      .bind(accountId)
      .all<{
        id: string;
        title: string;
        category: string;
        created_at: number;
        like_count: number;
        comment_count: number;
      }>(),
    db
      .prepare(
        'SELECT c.post_id, c.body, c.created_at, p.title AS post_title FROM community_comments c JOIN community_posts p ON p.id = c.post_id ' +
          'WHERE c.author_id = ? AND c.deleted = 0 AND p.deleted = 0 ORDER BY c.created_at DESC LIMIT 10',
      )
      .bind(accountId)
      .all<{ post_id: string; body: string; created_at: number; post_title: string }>(),
    db
      .prepare(
        'SELECT c.post_id, c.body, c.created_at, p.title AS post_title, ca.alias FROM community_comments c ' +
          'JOIN community_posts p ON p.id = c.post_id AND p.deleted = 0 ' +
          'LEFT JOIN community_aliases ca ON ca.account_id = c.author_id ' +
          'WHERE c.deleted = 0 AND c.author_id <> ? AND (p.author_id = ? OR (c.parent_id IS NOT NULL AND c.parent_id IN (SELECT id FROM community_comments WHERE author_id = ? AND deleted = 0))) ' +
          'ORDER BY c.created_at DESC LIMIT 10',
      )
      .bind(accountId, accountId, accountId)
      .all<{
        post_id: string;
        body: string;
        created_at: number;
        post_title: string;
        alias: string | null;
      }>(),
    db
      .prepare(
        'SELECT ca.alias FROM community_blocks b JOIN community_aliases ca ON ca.account_id = b.blocked_id ' +
          'WHERE b.account_id = ? ORDER BY b.created_at DESC LIMIT 100',
      )
      .bind(accountId)
      .all<{ alias: string }>(),
  ]);
  return {
    alias,
    posts: posts.results.map((post) => ({
      id: post.id,
      title: post.title,
      category: post.category,
      likeCount: Number(post.like_count ?? 0),
      commentCount: Number(post.comment_count ?? 0),
      createdAt: Number(post.created_at),
    })),
    comments: comments.results.map((comment) => ({
      postId: comment.post_id,
      postTitle: comment.post_title,
      body: communityPreview(comment.body),
      createdAt: Number(comment.created_at),
    })),
    replies: replies.results.map((reply) => ({
      postId: reply.post_id,
      postTitle: reply.post_title,
      body: communityPreview(reply.body),
      createdAt: Number(reply.created_at),
      author: { alias: reply.alias ?? '익명' },
    })),
    blocked: blocked.results.map((row) => row.alias),
  };
}
