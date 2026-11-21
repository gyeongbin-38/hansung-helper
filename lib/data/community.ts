/** 커뮤니티 공통 계약 — 클라이언트 UI와 서버 API가 같은 검증·정렬 규칙을 쓴다. */

export const COMMUNITY_CATEGORIES = ['자유', '질문', '정보', '스터디', '졸업'] as const;
export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];

export const COMMUNITY_SORTS = ['latest', 'popular', 'trending'] as const;
export type CommunitySort = (typeof COMMUNITY_SORTS)[number];

export const COMMUNITY_REPORT_REASONS = [
  '욕설 또는 괴롭힘',
  '광고 또는 도배',
  '개인정보 노출',
  '성적인 내용',
  '사기 또는 금전 요구',
  '불법 행위',
  '기타',
] as const;
export type CommunityReportReason = (typeof COMMUNITY_REPORT_REASONS)[number];

export const COMMUNITY_PAGE_SIZE = 30;
export const COMMUNITY_LIMITS = {
  title: 60,
  body: 2000,
  comment: 500,
  reportDetail: 200,
  query: 60,
} as const;

export type CommunityAuthor = { alias: string };

export type CommunityPostSummary = {
  id: string;
  category: string;
  title: string;
  preview: string;
  author: CommunityAuthor;
  commentCount: number;
  likeCount: number;
  createdAt: number;
  updatedAt?: number;
  /** 로그인 시에만 채워진다 — 본인 글이면 true */
  mine?: boolean;
};

export type CommunityComment = {
  id: string;
  body: string;
  author: CommunityAuthor;
  createdAt: number;
  updatedAt?: number;
  parentId?: string;
  mine?: boolean;
};

export type CommunityPost = {
  id: string;
  category: string;
  title: string;
  body: string;
  author: CommunityAuthor;
  createdAt: number;
  updatedAt?: number;
  likeCount: number;
  liked: boolean;
  mine: boolean;
  comments: CommunityComment[];
};

export type CommunityPostActivity = {
  id: string;
  title: string;
  category: string;
  likeCount: number;
  commentCount: number;
  createdAt: number;
};

export type CommunityCommentActivity = {
  postId: string;
  postTitle: string;
  body: string;
  createdAt: number;
};

export type CommunityReplyActivity = {
  postId: string;
  postTitle: string;
  body: string;
  createdAt: number;
  author: CommunityAuthor;
};

export type CommunityMe = {
  alias: string;
  posts: CommunityPostActivity[];
  comments: CommunityCommentActivity[];
  replies: CommunityReplyActivity[];
  /** 차단한 이용자의 익명 별명 목록 */
  blocked: string[];
};

export type CommunityPostInput = {
  title: string;
  body: string;
  category: CommunityCategory;
};

export type CommunityCommentInput = { body: string };

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isCommunitySort(value: unknown): value is CommunitySort {
  return typeof value === 'string' && (COMMUNITY_SORTS as readonly string[]).includes(value);
}

export function isCommunityReportReason(
  value: unknown,
): value is CommunityReportReason {
  return (
    typeof value === 'string' &&
    (COMMUNITY_REPORT_REASONS as readonly string[]).includes(value)
  );
}

export function validateCommunityPost(input: unknown): Validation<CommunityPostInput> {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const title = text(source.title);
  const body = text(source.body);
  if (title.length < 2 || title.length > COMMUNITY_LIMITS.title)
    return { ok: false, error: '제목은 2~60자로 입력해 주세요.' };
  if (body.length < 2 || body.length > COMMUNITY_LIMITS.body)
    return { ok: false, error: '내용은 2~2000자로 입력해 주세요.' };
  const rawCategory = source.category;
  const category =
    rawCategory === undefined || rawCategory === null || rawCategory === ''
      ? '자유'
      : rawCategory;
  if (
    typeof category !== 'string' ||
    !(COMMUNITY_CATEGORIES as readonly string[]).includes(category)
  )
    return { ok: false, error: '분류를 다시 선택해 주세요.' };
  return { ok: true, value: { title, body, category: category as CommunityCategory } };
}

export function validateCommunityComment(input: unknown): Validation<CommunityCommentInput> {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const body = text(source.body);
  if (!body || body.length > COMMUNITY_LIMITS.comment)
    return { ok: false, error: '댓글은 1~500자로 입력해 주세요.' };
  return { ok: true, value: { body } };
}

export function validateCommunityReportDetail(value: unknown) {
  const detail = text(value);
  return detail.length <= COMMUNITY_LIMITS.reportDetail ? detail : null;
}

export function communityPreview(body: string) {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > 80 ? `${clean.slice(0, 80)}…` : clean;
}

export function communityTrendScore(
  post: { likeCount: number; commentCount: number; createdAt: number },
  now = Date.now(),
) {
  const days = Math.max(0, (now - post.createdAt) / 86400000);
  return (post.likeCount * 2 + post.commentCount * 3) / Math.pow(days + 2, 1.3);
}

export function sortCommunityPosts<T extends {
  likeCount: number;
  commentCount: number;
  createdAt: number;
}>(posts: readonly T[], sort: CommunitySort, now = Date.now()): T[] {
  const list = [...posts];
  if (sort === 'popular')
    return list.sort((a, b) => b.likeCount - a.likeCount || b.createdAt - a.createdAt);
  if (sort === 'trending')
    return list.sort(
      (a, b) =>
        communityTrendScore(b, now) - communityTrendScore(a, now) ||
        b.createdAt - a.createdAt,
    );
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export function communityTimeAgo(createdAt: number, now = Date.now()) {
  const diff = Math.max(0, now - createdAt);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const date = new Date(createdAt);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function communityDateTime(createdAt: number) {
  const date = new Date(createdAt);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
