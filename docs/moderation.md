# 커뮤니티 신고 모더레이션 운영 절차

사용자 신고(`community_reports`)가 쌓인 글·댓글을 운영자가 검토하고
숨기거나 복원하는 절차다. 앱 심사(UGC 1.2) 대응 증빙으로도 사용한다.

## 접근 통제

- 엔드포인트: `GET|POST /api/community/moderation`
- 인증: `x-moderation-key` 헤더 = Worker secret `MODERATION_KEY`
  (16자 미만이면 기능 비활성 — 503, 불일치·누락 시 401)
- 쿠키 인증을 쓰지 않으므로 CSRF 대상이 아니다.
- 키 보관: gitignore된 `.d1-backups/MODERATION_KEY.txt`. 값은 저장소나
  대화에 기록하지 않는다.
- 키 설정/교체: `npx wrangler secret put MODERATION_KEY --name hansung-helper`
  (stdin으로 넣을 때 개행이 섞여도 라우트가 trim해 비교한다)

## 신고 목록 확인

```
GET /api/community/moderation
x-moderation-key: <키>
```

응답 `data.items[]` — 신고 많은 순, 최대 100개:

- `targetType`: `post` | `comment`
- `targetId`
- `reportCount`: 누적 신고 수
- `reasons`: 신고 사유 목록(중복 제거)
- `latestReportedAt`, `latestDetail`: 최근 신고 시각·상세
- `content`: 대상 본문 미리보기 / `author`: 작성자 별명
- `deleted`: 현재 숨김 상태 / `missing`: 대상이 이미 삭제됨

로컬 확인 예(운영 시크릿과 동일하게 `dist/server/.dev.vars`의 `MODERATION_KEY` 사용):

```
curl -H "x-moderation-key: <키>" http://127.0.0.1:8787/api/community/moderation
```

## 숨기기 / 복원

```
POST /api/community/moderation
x-moderation-key: <키>
content-type: application/json

{ "targetType": "post", "targetId": "…", "action": "hide" }
{ "targetType": "comment", "targetId": "…", "action": "restore" }
```

- `hide`: `deleted` 플래그를 켠다 — 피드·검색·상세·댓글에서 즉시 사라지고
  작성자 권한과 무관하게 적용. 본문은 DB에 남아 복원 가능하다.
- `restore`: 플래그를 내린다.
- 400: 잘못된 `targetType`/`action`·id 누락. 404: 없는 대상.

## 운영 규칙

- 신고는 사용자당 대상별 1건(유니크 제약). 목록의 `reportCount`로 우선순위를
  정하고 `reasons`·`latestDetail`을 함께 본다.
- 숨김은 소프트 삭제다 — 판단이 애매하면 먼저 `hide` 후 근거를 정리하고,
  오인이면 `restore`한다. 영구 삭제는 하지 않는다.
- 사용자 차단(`/api/community/block`)은 개인별 필터라 모더레이션과 별개다.
  차단은 양방향 — 차단한 사람·차단당한 사람 서로의 글·댓글이 보이지 않고,
  신고 집계에도 영향을 주지 않는다.
- 작성자에게 별도 통지는 없다 — 이용약관의 커뮤니티 규칙에 따라 조치한다.
