import { authenticated, database, json, limited, PayloadTooLargeError, readTextLimited, validOrigin } from '@/lib/server/account';
import { advisorAvailable, generateAdvisorAnswer } from '@/lib/server/advisor';
import { advisorContext, SERVICE_GUIDES, type AdvisorMessage } from '@/lib/data/advisor';
import type { Data } from '@/app/sections/data';
import { validateInfo } from '@/lib/data/info';
import { validateLms } from '@/lib/data/lms';
import type { Catalog } from '@/lib/data/catalog';
import { extToActivity, type ActivitySnapshot, type ExtActivity } from '@/lib/data/activities';
import type { ScheduleSnapshot } from '@/lib/data/schedule';
import catalog from '@/lib/data/catalog-2026-2.json';
import activities from '@/lib/data/activities.json';
import schedule from '@/lib/data/schedule.json';
import { snapshotGet } from '@/lib/server/snapshots';
import { apiData } from '@/lib/data/api';
import { ADVISOR_SCOPE_MESSAGE, advisorHistoryAllowed, advisorQuestionAllowed } from '@/lib/data/advisor-policy';

export function GET() {
  return json({ available: advisorAvailable() });
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const row = await authenticated(request);
    if (!row) return json({ error: 'AI 상담은 학교 계정으로 로그인한 뒤 이용할 수 있어요. 기본 안내는 계속 사용할 수 있어요.' }, 401);
    const raw = await readTextLimited(request, 60000);
    let input;
    try { input = JSON.parse(raw); } catch { return json({ error: '질문 형식을 확인해 주세요.' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        (input.purpose !== undefined && input.purpose !== 'service' && input.purpose !== 'activity') ||
        (input.activityId !== undefined && (typeof input.activityId !== 'string' ||
          !/^(?:hs-\d{1,20}|ext-[a-z0-9-]{1,80})$/.test(input.activityId))) ||
        typeof input.personal !== 'boolean' || !Array.isArray(input.messages) ||
        input.messages.length < 1 || input.messages.length > 5 ||
        input.messages.some((m: AdvisorMessage, i: number) => !m ||
          m.role !== (i % 2 === 0 ? 'user' : 'assistant') ||
          typeof m.content !== 'string' || !m.content.trim() || m.content.length > (m.role === 'user' ? 600 : 6000)) ||
        input.messages.at(-1)?.role !== 'user')
      return json({ error: '질문은 600자 이내로 입력해 주세요.' }, 400);
    if (input.messages.some((message: AdvisorMessage) => message.role === 'user'
      ? !advisorQuestionAllowed(message.content)
      : !advisorHistoryAllowed(message.content)))
      return json({ error: ADVISOR_SCOPE_MESSAGE }, 400);
    const purpose: 'service' | 'activity' = input.purpose ?? (input.activityId ? 'activity' : 'service');
    if (!advisorAvailable()) return json({ error: 'AI 상담을 준비 중이에요. 기본 안내를 이용해 주세요.' }, 503);
    // Separate namespace from login throttling; no question or transcript is stored.
    if (await limited(`advisor:account:${row.id}`, 10))
      return json({ error: '상담 요청이 많아요. 잠시 후 다시 시도해 주세요.' }, 429, { 'Retry-After': '900' });
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const quota = await database().prepare(
      'INSERT INTO academic_login_limits (key, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts',
    ).bind(`advisor:daily:${day}`, Date.parse(`${day}T00:00:00Z`) + 86400000).first<{ attempts: number }>();
    if (!quota || quota.attempts > 100)
      return json({ error: '오늘의 AI 상담 이용량에 도달했어요. 기본 안내를 이용하거나 내일 다시 시도해 주세요.' }, 429);

    const [courseResponse, activityResponse, scheduleResponse] = await Promise.all([
      snapshotGet('courses', catalog, catalog.generatedAt, (p) => !!p && typeof p === 'object' && 'semester' in p && p.semester === catalog.semester),
      snapshotGet('activities', activities, activities.fetchedAt),
      snapshotGet('schedule', schedule, schedule.fetchedAt),
    ]);
    const [coursePayload, activityPayload, schedulePayload] = await Promise.all([
      apiData<Catalog>(courseResponse), apiData<ActivitySnapshot>(activityResponse), apiData<ScheduleSnapshot>(scheduleResponse),
    ]);
    const profile = JSON.parse(row.profile) as Partial<Data>;
    const selectedExternal = input.activityId?.startsWith('ext-') && Array.isArray(profile.extActivities)
      ? profile.extActivities.find((activity): activity is ExtActivity => activity?.id === input.activityId)
      : undefined;
    const selectedActivity = selectedExternal ? { ...extToActivity(selectedExternal), url: '' } : undefined;
    if (input.activityId && !activityPayload.items.some(a => a.id === input.activityId) && !selectedActivity)
      return json({ error: '선택한 활동을 내 활동 또는 공개 목록에서 찾지 못했어요. 비교과·대외활동에서 다시 선택해 주세요.' }, 400);
    let personal: Partial<Data> | null = null;
    if (input.personal) {
      const snapshot = JSON.parse(row.snapshot);
      personal = { ...profile, info: validateInfo(snapshot.infoData) ?? undefined,
        lms: validateLms(snapshot.lmsData) ?? validateLms(profile.lms) ?? undefined };
    }
    const context = advisorContext(personal, {
      catalog: coursePayload,
      activities: activityPayload,
      schedule: schedulePayload,
      selectedActivity,
    }, Date.now(), input.activityId);
    const answer = await generateAdvisorAnswer(
      context,
      SERVICE_GUIDES.map(({ label, route, text }) => ({ label, route, text })),
      input.messages,
      purpose,
    );
    const current = await authenticated(request);
    if (!current || current.id !== row.id || current.session_hash !== row.session_hash)
      return json({ error: '로그인이 종료됐어요. 다시 로그인해 주세요.' }, 401);
    return json({ mode: 'ai', answer, sources: context.sources, personal: input.personal, purpose });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return json({ error: '질문이 너무 길어요. 내용을 줄여 주세요.' }, 413);
    // Never log prompts, school data or provider errors.
    return json({ error: 'AI 답변을 가져오지 못했어요. 다시 시도하거나 기본 안내를 이용해 주세요.' }, 503);
  }
}
