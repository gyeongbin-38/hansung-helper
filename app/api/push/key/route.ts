import { json } from '@/lib/server/account';
import { pushCredentials } from '@/lib/server/push-dispatch';
import { vapidPublicKey } from '@/lib/server/webpush';

/** 푸시 구독에 필요한 VAPID 공개키 — 키 미설정 환경(기능 꺼짐)에서는 404. */
export async function GET() {
  const creds = pushCredentials();
  if (!creds)
    return json({ error: '푸시 알림을 사용할 수 없습니다.' }, 404);
  return json({ key: vapidPublicKey(creds.jwk) });
}
