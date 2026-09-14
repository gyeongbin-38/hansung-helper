import {
  authenticated,
  database,
  json,
  validOrigin,
} from '@/lib/server/account';
export async function PUT(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const row = await authenticated(request);
    if (!row) return json({ error: '다시 로그인해 주세요.' }, 401);
    const raw = await request.text();
    if (raw.length > 30000)
      return json({ error: '저장할 내용이 너무 큽니다.' }, 413);
    const input = JSON.parse(raw),
      profile: Record<string, unknown> = {};
    for (const key of [
      'name',
      'year',
      'dept',
      'credits',
      'points',
      'semester',
      'graduationTarget',
    ]) {
      if (
        input[key] !== undefined &&
        (typeof input[key] !== 'string' || input[key].length > 100)
      )
        return json({ error: '입력 내용을 확인해 주세요.' }, 400);
      profile[key] = input[key] || '';
    }
    for (const key of ['saved', 'planned', 'prefs']) {
      if (
        !Array.isArray(input[key]) ||
        input[key].length > 100 ||
        input[key].some((v: unknown) => typeof v !== 'string' || v.length > 200)
      )
        return json({ error: '저장 항목 형식을 확인해 주세요.' }, 400);
      profile[key] = input[key];
    }
    if (
      !Array.isArray(input.events) ||
      input.events.length > 100 ||
      input.events.some(
        (v: { title?: unknown; date?: unknown }) =>
          !v ||
          typeof v.title !== 'string' ||
          v.title.length > 100 ||
          typeof v.date !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(v.date),
      )
    )
      return json({ error: '일정 형식을 확인해 주세요.' }, 400);
    profile.events = input.events;
    profile.onboardingStep =
      Number.isInteger(input.onboardingStep) &&
      input.onboardingStep >= 0 &&
      input.onboardingStep <= 7
        ? input.onboardingStep
        : 0;
    profile.read = input.read === true;
    profile.consent = input.consent === true;
    await database()
      .prepare(
        'UPDATE academic_accounts SET profile = ?, onboarded = ? WHERE id = ?',
      )
      .bind(
        JSON.stringify(profile),
        input.onboarded === true || row.onboarded ? 1 : 0,
        row.id,
      )
      .run();
    return json({ ok: true });
  } catch {
    return json({ error: '저장하지 못했습니다. 입력 내용은 유지됩니다.' }, 503);
  }
}
