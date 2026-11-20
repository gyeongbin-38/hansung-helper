'use client';
import {
  useCallback,
  useEffect,
  useState,
  type SyntheticEvent,
} from 'react';
import {
  ArrowLeft,
  Flag,
  Heart,
  MessageCircle,
  PenLine,
  Plus,
  Search,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react';
import { apiData, apiFetch, ApiRequestError } from '@/lib/data/api';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_LIMITS,
  COMMUNITY_REPORT_REASONS,
  communityDateTime,
  communityTimeAgo,
  isCommunitySort,
  type CommunityComment,
  type CommunityMe,
  type CommunityPost,
  type CommunityPostSummary,
  type CommunitySort,
} from '@/lib/data/community';

const SORT_LABELS: Record<CommunitySort, string> = {
  latest: '최신순',
  popular: '인기순',
  trending: '지금 뜨는 글',
};

function errorMessage(error: unknown) {
  return error instanceof ApiRequestError
    ? error.message
    : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

async function getJson<T>(url: string) {
  const response = await apiFetch(url, { cache: 'no-store' });
  return apiData<T>(response);
}

async function sendJson<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown = {},
) {
  const response = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return apiData<T>(response);
}

export function CommunitySection({
  signedIn,
  detail,
  go,
  onConnect,
  notify,
}: {
  signedIn: boolean;
  detail?: string;
  go: (route: string) => void;
  onConnect: () => void;
  notify: (message: string) => void;
}) {
  const [posts, setPosts] = useState<CommunityPostSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CommunitySort>('latest');
  const [tab, setTab] = useState<'all' | 'me'>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [postLoading, setPostLoading] = useState(Boolean(detail));
  const [postMissing, setPostMissing] = useState(false);
  const [me, setMe] = useState<CommunityMe | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [editPost, setEditPost] = useState(false);
  const [editCommentId, setEditCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');
  const [report, setReport] = useState<{ commentId?: string } | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetail, setReportDetail] = useState('');

  const loadList = useCallback(
    async (before?: string | null, append = false) => {
      setListLoading(true);
      setListError('');
      try {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        if (sort !== 'latest') params.set('sort', sort);
        if (before) params.set('before', before);
        const data = await getJson<{
          posts: CommunityPostSummary[];
          nextCursor: string | null;
        }>(`/api/community/posts${params.size ? `?${params}` : ''}`);
        setPosts((previous) =>
          append ? [...previous, ...data.posts] : data.posts,
        );
        setNextCursor(data.nextCursor ?? null);
      } catch (error) {
        setListError(errorMessage(error));
        if (!append) {
          setPosts([]);
          setNextCursor(null);
        }
      } finally {
        setListLoading(false);
      }
    },
    [query, sort],
  );

  useEffect(() => {
    if (detail) return;
    const timeout = window.setTimeout(() => {
      void loadList();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [detail, loadList]);

  const loadPost = useCallback(async () => {
    if (!detail) {
      setPost(null);
      setPostMissing(false);
      setPostLoading(false);
      return;
    }
    setPostLoading(true);
    setPostMissing(false);
    setActionError('');
    setNotice('');
    setEditPost(false);
    setEditCommentId(null);
    setReplyTo(null);
    setReport(null);
    setCommentBody('');
    try {
      const data = await getJson<{ post: CommunityPost }>(
        `/api/community/posts/${encodeURIComponent(detail)}`,
      );
      setPost(data.post);
    } catch {
      setPost(null);
      setPostMissing(true);
    } finally {
      setPostLoading(false);
    }
  }, [detail]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPost();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadPost]);

  const loadMe = useCallback(async () => {
    setMeLoading(true);
    setActionError('');
    try {
      setMe(await getJson<CommunityMe>('/api/community/me'));
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setMeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'me' || !signedIn) return;
    const timeout = window.setTimeout(() => {
      void loadMe();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [tab, signedIn, loadMe]);

  useEffect(() => {
    if (!report) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReport(null);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [report]);

  function openReport(commentId?: string) {
    setReport({ commentId });
    setReportReason('');
    setReportDetail('');
    setActionError('');
    setNotice('');
  }

  async function submitPost(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    setActionError('');
    try {
      const data = await sendJson<{ post: CommunityPost }>(
        '/api/community/posts',
        'POST',
        {
          category: formData.get('category'),
          title: formData.get('title'),
          body: formData.get('body'),
        },
      );
      form.reset();
      setComposerOpen(false);
      notify('커뮤니티에 글을 등록했습니다.');
      setTab('all');
      go(`community/${data.post.id}`);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post) return;
    setBusy(true);
    setActionError('');
    try {
      const data = await sendJson<{ post: CommunityPost }>(
        `/api/community/posts/${post.id}/comments`,
        'POST',
        { body: commentBody },
      );
      setPost(data.post);
      setCommentBody('');
      notify('댓글을 등록했습니다.');
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(parentId: string) {
    if (!post || !replyBody.trim()) return;
    setBusy(true);
    setActionError('');
    try {
      const data = await sendJson<{ post: CommunityPost }>(
        `/api/community/posts/${post.id}/comments`,
        'POST',
        { body: replyBody, parentId },
      );
      setPost(data.post);
      setReplyTo(null);
      setReplyBody('');
      notify('답글을 등록했습니다.');
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleLike() {
    if (!post) return;
    if (!signedIn) {
      onConnect();
      return;
    }
    setActionError('');
    try {
      const data = await sendJson<{ liked: boolean; likeCount: number }>(
        `/api/community/posts/${post.id}/like`,
        'POST',
      );
      setPost((previous) =>
        previous
          ? { ...previous, liked: data.liked, likeCount: data.likeCount }
          : previous,
      );
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function savePost(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post) return;
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setActionError('');
    try {
      const data = await sendJson<{ post: CommunityPost }>(
        `/api/community/posts/${post.id}`,
        'PATCH',
        {
          category: formData.get('category'),
          title: formData.get('title'),
          body: formData.get('body'),
        },
      );
      setPost(data.post);
      setEditPost(false);
      notify('글을 수정했습니다.');
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removePost() {
    if (!post) return;
    if (!confirm('이 글을 삭제할까요? 댓글도 함께 보이지 않게 됩니다.')) return;
    setBusy(true);
    setActionError('');
    try {
      await sendJson(`/api/community/posts/${post.id}`, 'DELETE');
      notify('글을 삭제했습니다.');
      go('community');
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // 목록·내 활동에서 내 글을 바로 삭제 — 상세 화면으로 가지 않아도 된다
  async function removePostItem(id: string) {
    if (!confirm('이 글을 삭제할까요? 댓글도 함께 보이지 않게 됩니다.')) return;
    setActionError('');
    try {
      await sendJson(`/api/community/posts/${id}`, 'DELETE');
      setPosts((previous) => previous.filter((item) => item.id !== id));
      if (me) {
        setMe({
          ...me,
          posts: me.posts.filter((activity) => activity.id !== id),
        });
      }
      notify('글을 삭제했습니다.');
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function saveComment(commentId: string) {
    if (!post || !editCommentBody.trim()) return;
    setBusy(true);
    setActionError('');
    try {
      const data = await sendJson<{ post: CommunityPost }>(
        `/api/community/posts/${post.id}/comments/${commentId}`,
        'PATCH',
        { body: editCommentBody },
      );
      setPost(data.post);
      setEditCommentId(null);
      notify('댓글을 수정했습니다.');
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(commentId: string) {
    if (!post) return;
    if (!confirm('이 댓글을 삭제할까요?')) return;
    setBusy(true);
    setActionError('');
    try {
      const data = await sendJson<{ post: CommunityPost }>(
        `/api/community/posts/${post.id}/comments/${commentId}`,
        'DELETE',
      );
      setPost(data.post);
      notify('댓글을 삭제했습니다.');
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitReport(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post || !report) return;
    setBusy(true);
    setActionError('');
    try {
      await sendJson(`/api/community/posts/${post.id}/report`, 'POST', {
        reason: reportReason,
        detail: reportDetail,
        commentId: report.commentId,
      });
      setReport(null);
      setNotice(
        '신고가 접수됐습니다. 서로 다른 이용자의 신고가 반복되면 운영 검토 대상이 됩니다.',
      );
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function submitSearch(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim());
  }

  function commentNode(comment: CommunityComment, isReply: boolean) {
    return (
      <li
        key={comment.id}
        className={'community-comment' + (isReply ? ' is-reply' : '')}
      >
        <div className="community-comment-head">
          <span className="community-avatar" aria-hidden="true">
            {comment.author.alias.slice(0, 1)}
          </span>
          <b>{comment.author.alias}</b>
          {comment.mine && <span className="badge blue">나</span>}
          <small>
            {communityTimeAgo(comment.createdAt)}
            {comment.updatedAt ? ' (수정됨)' : ''}
          </small>
        </div>
        {editCommentId === comment.id ? (
          <div className="community-inline-form">
            <textarea
              value={editCommentBody}
              maxLength={COMMUNITY_LIMITS.comment}
              rows={2}
              onChange={(event) => setEditCommentBody(event.target.value)}
            />
            <div className="community-inline-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setEditCommentId(null)}
              >
                취소
              </button>
              <button
                className="primary"
                type="button"
                disabled={busy || !editCommentBody.trim()}
                onClick={() => void saveComment(comment.id)}
              >
                저장
              </button>
            </div>
          </div>
        ) : (
          <p className="community-comment-body">{comment.body}</p>
        )}
        <div className="community-comment-actions">
          {signedIn && !comment.parentId && (
            <button
              type="button"
              onClick={() => {
                setReplyTo(replyTo === comment.id ? null : comment.id);
                setReplyBody('');
              }}
            >
              <MessageCircle size={13} aria-hidden="true" /> 답글
            </button>
          )}
          {signedIn && (
            <button type="button" onClick={() => openReport(comment.id)}>
              <Flag size={13} aria-hidden="true" /> 신고
            </button>
          )}
          {signedIn && comment.mine && editCommentId !== comment.id && (
            <button
              type="button"
              onClick={() => {
                setEditCommentId(comment.id);
                setEditCommentBody(comment.body);
              }}
            >
              <PenLine size={13} aria-hidden="true" /> 수정
            </button>
          )}
          {signedIn && (comment.mine || post?.mine) && (
            <button type="button" onClick={() => void removeComment(comment.id)}>
              <Trash2 size={13} aria-hidden="true" /> 삭제
            </button>
          )}
        </div>
        {replyTo === comment.id && (
          <div className="community-inline-form">
            <textarea
              value={replyBody}
              maxLength={COMMUNITY_LIMITS.comment}
              rows={2}
              placeholder={`${comment.author.alias}에게 답글`}
              onChange={(event) => setReplyBody(event.target.value)}
            />
            <div className="community-inline-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setReplyTo(null)}
              >
                취소
              </button>
              <button
                className="primary"
                type="button"
                disabled={busy || !replyBody.trim()}
                onClick={() => void submitReply(comment.id)}
              >
                답글 달기
              </button>
            </div>
          </div>
        )}
      </li>
    );
  }

  if (detail) {
    const topComments =
      post?.comments.filter((comment) => !comment.parentId) ?? [];
    return (
      <>
        <button className="link community-back" onClick={() => go('community')}>
          <ArrowLeft size={16} /> 커뮤니티 목록
        </button>
        {postLoading && (
          <section className="card pad community-state" aria-live="polite">
            <p>글을 불러오는 중…</p>
          </section>
        )}
        {postMissing && !postLoading && (
          <section className="card pad community-state">
            <h2>글을 찾을 수 없습니다</h2>
            <p>삭제됐거나 주소가 잘못됐습니다.</p>
            <button className="primary" onClick={() => go('community')}>
              목록으로 이동
            </button>
          </section>
        )}
        {post && (
          <>
            <article className="card pad community-article">
              {editPost ? (
                <form className="community-post-form" onSubmit={savePost}>
                  <label>
                    분류
                    <select name="category" defaultValue={post.category}>
                      {COMMUNITY_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    제목
                    <input
                      name="title"
                      defaultValue={post.title}
                      maxLength={COMMUNITY_LIMITS.title}
                      required
                    />
                  </label>
                  <label>
                    내용
                    <textarea
                      name="body"
                      defaultValue={post.body}
                      maxLength={COMMUNITY_LIMITS.body}
                      rows={8}
                      required
                    />
                  </label>
                  <div className="community-form-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setEditPost(false)}
                    >
                      취소
                    </button>
                    <button className="primary" type="submit" disabled={busy}>
                      {busy ? '저장 중…' : '수정 저장'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="community-article-head">
                    <div className="community-badges">
                      <span className="badge blue">{post.category}</span>
                      {post.mine && <span className="badge green">내 글</span>}
                    </div>
                    <h2>{post.title}</h2>
                    <p className="community-meta">
                      <span className="community-avatar" aria-hidden="true">
                        {post.author.alias.slice(0, 1)}
                      </span>
                      {post.author.alias} · {communityDateTime(post.createdAt)}
                      {post.updatedAt ? ' (수정됨)' : ''} · 댓글{' '}
                      {post.comments.length}
                    </p>
                  </div>
                  <p className="community-body">{post.body}</p>
                </>
              )}
              <div className="community-article-actions">
                <button
                  type="button"
                  className={
                    post.liked ? 'community-like is-liked' : 'community-like'
                  }
                  aria-pressed={post.liked}
                  onClick={() => void toggleLike()}
                >
                  <Heart
                    size={15}
                    fill={post.liked ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                  좋아요 {post.likeCount}
                </button>
                {signedIn && (
                  <button type="button" onClick={() => openReport()}>
                    <Flag size={14} aria-hidden="true" /> 신고
                  </button>
                )}
                {post.mine && !editPost && (
                  <button type="button" onClick={() => setEditPost(true)}>
                    <PenLine size={14} aria-hidden="true" /> 수정
                  </button>
                )}
                {post.mine && (
                  <button type="button" onClick={() => void removePost()}>
                    <Trash2 size={14} aria-hidden="true" /> 삭제
                  </button>
                )}
              </div>
            </article>

            <section className="card pad community-comments" aria-label="댓글">
              <div className="community-comments-head">
                <h3>댓글 {post.comments.length}</h3>
                <p className="meta">
                  답글은 한 단계까지 달 수 있고, 내 글의 댓글은 직접 삭제할 수
                  있습니다.
                </p>
              </div>
              {topComments.length ? (
                <ul className="community-comment-list">
                  {topComments.map((comment) => (
                    <li key={comment.id}>
                      <ul className="community-comment-thread">
                        {commentNode(comment, false)}
                        {post.comments
                          .filter((reply) => reply.parentId === comment.id)
                          .map((reply) => commentNode(reply, true))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="community-empty">
                  <MessageCircle size={20} aria-hidden="true" />
                  <p>아직 댓글이 없습니다. 첫 댓글을 남겨보세요.</p>
                </div>
              )}
              {signedIn ? (
                <form className="community-comment-form" onSubmit={submitComment}>
                  <textarea
                    value={commentBody}
                    placeholder="댓글을 남겨보세요 (최대 500자)"
                    maxLength={COMMUNITY_LIMITS.comment}
                    rows={3}
                    onChange={(event) => setCommentBody(event.target.value)}
                    required
                  />
                  <button
                    className="primary"
                    type="submit"
                    disabled={busy || !commentBody.trim()}
                  >
                    <Send size={15} aria-hidden="true" /> 댓글 등록
                  </button>
                </form>
              ) : (
                <div className="community-login-hint">
                  <UserRound size={18} aria-hidden="true" />
                  <p>댓글을 쓰려면 학교 계정으로 로그인해 주세요.</p>
                  <button className="secondary" onClick={onConnect}>
                    학교 계정 연결
                  </button>
                </div>
              )}
            </section>
          </>
        )}
        {actionError && <p className="form-error">{actionError}</p>}
        {notice && <p className="community-notice">{notice}</p>}
        {report && (
          <div
            className="community-modal-scrim"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setReport(null);
            }}
          >
            <dialog
              open
              className="community-modal"
              aria-modal="true"
              aria-labelledby="community-report-title"
            >
              <h2 id="community-report-title">신고하기</h2>
              <p className="meta">
                신고 내용은 운영 검토에만 사용됩니다. 허위·반복 신고는 제한될 수
                있습니다.
              </p>
              <form className="community-report-form" onSubmit={submitReport}>
                <label>
                  신고 사유
                  <select
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value)}
                    required
                  >
                    <option value="">선택해 주세요</option>
                    {COMMUNITY_REPORT_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    상세 내용 <span className="meta">선택</span>
                  </span>
                  <textarea
                    value={reportDetail}
                    maxLength={COMMUNITY_LIMITS.reportDetail}
                    rows={3}
                    onChange={(event) => setReportDetail(event.target.value)}
                  />
                </label>
                <div className="community-form-actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setReport(null)}
                  >
                    취소
                  </button>
                  <button
                    className="primary"
                    type="submit"
                    disabled={busy || !reportReason}
                  >
                    신고 접수
                  </button>
                </div>
              </form>
            </dialog>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <section className="community-hero card pad">
        <div className="community-hero-copy">
          <span className="badge blue">익명 커뮤니티</span>
          <h2>한성인들의 이야기</h2>
          <p>수강 후기·졸업 준비·학교생활 팁을 익명으로 나눠요.</p>
        </div>
        {signedIn ? (
          <button
            className="primary"
            onClick={() => setComposerOpen((open) => !open)}
          >
            <Plus size={16} aria-hidden="true" />
            {composerOpen ? '글쓰기 닫기' : '글쓰기'}
          </button>
        ) : (
          <button className="secondary" onClick={onConnect}>
            로그인하고 글쓰기
          </button>
        )}
      </section>

      {composerOpen && signedIn && (
        <section className="card pad community-compose">
          <h3>새 글 작성</h3>
          <form className="community-post-form" onSubmit={submitPost}>
            <label>
              분류
              <select name="category" defaultValue="자유">
                {COMMUNITY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              제목
              <input
                name="title"
                placeholder="제목 (2~60자)"
                minLength={2}
                maxLength={COMMUNITY_LIMITS.title}
                required
              />
            </label>
            <label>
              내용
              <textarea
                name="body"
                placeholder="수업·졸업·학교생활에 대해 자유롭게 적어 주세요."
                minLength={2}
                maxLength={COMMUNITY_LIMITS.body}
                rows={6}
                required
              />
            </label>
            <div className="community-form-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setComposerOpen(false)}
              >
                취소
              </button>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? '등록 중…' : '등록'}
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="community-tabs" role="tablist" aria-label="커뮤니티 보기">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          className={tab === 'all' ? 'is-active' : ''}
          onClick={() => setTab('all')}
        >
          전체 글
        </button>
        {signedIn && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'me'}
            className={tab === 'me' ? 'is-active' : ''}
            onClick={() => setTab('me')}
          >
            내 활동
          </button>
        )}
      </div>

      {tab === 'me' && signedIn ? (
        <section className="card pad community-me">
          <div className="community-me-head">
            <div>
              <h3>내 익명 별명</h3>
              <p className="community-alias">
                <span className="community-avatar" aria-hidden="true">
                  {(me?.alias ?? '?').slice(0, 1)}
                </span>
                {me?.alias ?? '불러오는 중…'}
              </p>
            </div>
            <button className="secondary" onClick={() => void loadMe()}>
              새로고침
            </button>
          </div>
          <p className="meta">
            별명은 계정마다 자동으로 만들어지며 실명·학번은 공개되지 않습니다.
          </p>
          {meLoading && <p>내 활동을 불러오는 중…</p>}
          {me && (
            <div className="community-me-grid">
              <div>
                <h4>내가 쓴 글</h4>
                {me.posts.length ? (
                  <ul className="community-me-list">
                    {me.posts.map((activity) => (
                      <li key={activity.id}>
                        <button onClick={() => go(`community/${activity.id}`)}>
                          <span className="badge">{activity.category}</span>
                          <b>{activity.title}</b>
                          <small>
                            좋아요 {activity.likeCount} · 댓글{' '}
                            {activity.commentCount} ·{' '}
                            {communityTimeAgo(activity.createdAt)}
                          </small>
                        </button>
                        <button
                          type="button"
                          className="community-row-del"
                          aria-label={`'${activity.title}' 삭제`}
                          onClick={() => void removePostItem(activity.id)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta">아직 쓴 글이 없습니다.</p>
                )}
              </div>
              <div>
                <h4>내가 쓴 댓글</h4>
                {me.comments.length ? (
                  <ul className="community-me-list">
                    {me.comments.map((activity, index) => (
                      <li key={`${activity.postId}-${index}`}>
                        <button
                          onClick={() => go(`community/${activity.postId}`)}
                        >
                          <b>{activity.postTitle}</b>
                          <small>{activity.body}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta">아직 쓴 댓글이 없습니다.</p>
                )}
              </div>
              <div>
                <h4>나에게 온 답글</h4>
                {me.replies.length ? (
                  <ul className="community-me-list">
                    {me.replies.map((activity, index) => (
                      <li key={`${activity.postId}-reply-${index}`}>
                        <button
                          onClick={() => go(`community/${activity.postId}`)}
                        >
                          <b>{activity.postTitle}</b>
                          <small>{activity.body}</small>
                          <small className="community-me-author">
                            {activity.author.alias}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta">아직 받은 답글이 없습니다.</p>
                )}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="card pad community-board">
          <div className="community-toolbar">
            <form className="community-search" onSubmit={submitSearch}>
              <Search size={16} aria-hidden="true" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="제목·내용 검색"
                aria-label="커뮤니티 검색"
                maxLength={COMMUNITY_LIMITS.query}
              />
              <button className="secondary" type="submit">
                검색
              </button>
              {query && (
                <button
                  className="link"
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setQuery('');
                  }}
                >
                  초기화
                </button>
              )}
            </form>
            <div className="community-sort" role="tablist" aria-label="정렬">
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={sort === value}
                  className={sort === value ? 'is-active' : ''}
                  onClick={() => {
                    if (isCommunitySort(value)) setSort(value);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {listError && <p className="form-error">{listError}</p>}
          {listLoading && posts.length === 0 && (
            <div className="community-empty" aria-live="polite">
              <p>커뮤니티 글을 불러오는 중…</p>
            </div>
          )}
          {!listLoading && !posts.length && !listError && (
            <div className="community-empty">
              <MessageCircle size={22} aria-hidden="true" />
              <p>
                {query
                  ? `‘${query}’에 대한 검색 결과가 없습니다.`
                  : '아직 글이 없습니다. 첫 글을 남겨보세요.'}
              </p>
            </div>
          )}
          {posts.length > 0 && (
            <ul className="community-list">
              {posts.map((item) => (
                <li key={item.id}>
                  <button
                    className="community-row"
                    onClick={() => go(`community/${item.id}`)}
                  >
                    <div className="community-row-head">
                      <span className="badge blue">{item.category}</span>
                      <strong>{item.title}</strong>
                      {item.mine && <span className="badge green">내 글</span>}
                    </div>
                    <p className="community-row-preview">{item.preview}</p>
                    <span className="community-row-meta">
                      <span className="community-avatar" aria-hidden="true">
                        {item.author.alias.slice(0, 1)}
                      </span>
                      {item.author.alias} · {communityTimeAgo(item.createdAt)}
                      {item.updatedAt ? ' (수정됨)' : ''} ·{' '}
                      <MessageCircle size={13} aria-hidden="true" />{' '}
                      {item.commentCount} ·{' '}
                      <Heart size={13} aria-hidden="true" /> {item.likeCount}
                    </span>
                  </button>
                  {item.mine && (
                    <button
                      type="button"
                      className="community-row-del"
                      aria-label={`'${item.title}' 삭제`}
                      onClick={() => void removePostItem(item.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {nextCursor && (
            <button
              className="secondary community-more"
              type="button"
              disabled={listLoading}
              onClick={() => void loadList(nextCursor, true)}
            >
              {listLoading ? '불러오는 중…' : '더 보기'}
            </button>
          )}
        </section>
      )}
      {actionError && <p className="form-error">{actionError}</p>}
      {notice && <p className="community-notice">{notice}</p>}
    </>
  );
}
