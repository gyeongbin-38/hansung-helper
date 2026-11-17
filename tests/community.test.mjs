import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_REPORT_REASONS,
  communityDateTime,
  communityPreview,
  communityTimeAgo,
  communityTrendScore,
  isCommunityReportReason,
  isCommunitySort,
  sortCommunityPosts,
  validateCommunityComment,
  validateCommunityPost,
  validateCommunityReportDetail,
} from '../lib/data/community.ts';

let pass = 0;
let fail = 0;
const t = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('FAIL', name);
  }
};

/* ---------- 검증 ---------- */
t('분류 목록', COMMUNITY_CATEGORIES.includes('질문'));
t('정렬 값 판별', isCommunitySort('trending') && !isCommunitySort('hot'));
t(
  '신고 사유 판별',
  isCommunityReportReason('광고 또는 도배') &&
    !isCommunityReportReason('없는 사유'),
);
const valid = validateCommunityPost({
  category: '질문',
  title: '  수강신청 질문  ',
  body: '  이번 학기 수강신청은 언제인가요?  ',
});
t(
  '글 검증 통과',
  valid.ok &&
    valid.value.title === '수강신청 질문' &&
    valid.value.body === '이번 학기 수강신청은 언제인가요?' &&
    valid.value.category === '질문',
);
const defaultCategory = validateCommunityPost({ title: '제목', body: '본문' });
t('분류 기본값', defaultCategory.ok && defaultCategory.value.category === '자유');
t('제목 짧음', !validateCommunityPost({ title: 'a', body: '본문' }).ok);
t(
  '제목 김',
  !validateCommunityPost({ title: 'ㄱ'.repeat(61), body: '본문' }).ok,
);
t('본문 짧음', !validateCommunityPost({ title: '제목', body: ' ' }).ok);
t(
  '본문 김',
  !validateCommunityPost({ title: '제목', body: 'ㄱ'.repeat(2001) }).ok,
);
t(
  '잘못된 분류',
  !validateCommunityPost({ category: '없음', title: '제목', body: '본문' }).ok,
);
t('댓글 검증', validateCommunityComment({ body: ' 좋아요 ' }).ok);
t('빈 댓글', !validateCommunityComment({ body: '  ' }).ok);
t(
  '긴 댓글',
  !validateCommunityComment({ body: 'ㄱ'.repeat(501) }).ok,
);
t('신고 상세', validateCommunityReportDetail('  설명  ') === '설명');
t('신고 상세 길이', validateCommunityReportDetail('ㄱ'.repeat(201)) === null);

/* ---------- 표시 ---------- */
t('미리보기 공백 정리', communityPreview('  a\n\n b\tc  ') === 'a b c');
t(
  '미리보기 자르기',
  communityPreview('ㄱ'.repeat(100)).endsWith('…') &&
    communityPreview('ㄱ'.repeat(100)).length === 81,
);
const now = new Date('2026-11-18T12:00:00+09:00').getTime();
t('방금 전', communityTimeAgo(now - 10_000, now) === '방금 전');
t('분 전', communityTimeAgo(now - 120_000, now) === '2분 전');
t('시간 전', communityTimeAgo(now - 7_200_000, now) === '2시간 전');
t(
  '날짜 표시',
  communityTimeAgo(now - 3 * 86_400_000, now).includes('2026.11.15'),
);
t(
  '상세 시각',
  communityDateTime(new Date(2026, 10, 18, 9, 5).getTime()) ===
    '2026.11.18 09:05',
);

/* ---------- 정렬 ---------- */
const old = { id: 'old', likeCount: 10, commentCount: 5, createdAt: now - 2 * 86_400_000 };
const fresh = { id: 'fresh', likeCount: 1, commentCount: 1, createdAt: now - 60_000 };
t('최신순', sortCommunityPosts([old, fresh], 'latest', now)[0].id === 'fresh');
t('인기순', sortCommunityPosts([fresh, old], 'popular', now)[0].id === 'old');
t(
  '트렌딩 점수',
  communityTrendScore(old, now) > communityTrendScore(fresh, now) &&
    sortCommunityPosts([fresh, old], 'trending', now)[0].id === 'old',
);
t(
  '최신 동률은 최신 우선',
  sortCommunityPosts(
    [
      { ...fresh, id: 'a', createdAt: now - 1000 },
      { ...fresh, id: 'b', createdAt: now - 1000 },
    ],
    'latest',
    now,
  )[0].id === 'a',
);

/* ---------- 신고 사유 전체 ---------- */
t(
  '신고 사유 목록',
  COMMUNITY_REPORT_REASONS.every((reason) => isCommunityReportReason(reason)),
);

console.log(`${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
