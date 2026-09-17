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
    if (
      !Array.isArray(input.completed) ||
      input.completed.length > 300 ||
      input.completed.some(
        (v: {
          code?: unknown;
          name?: unknown;
          category?: unknown;
          credits?: unknown;
        }) =>
          !v ||
          typeof v.code !== 'string' ||
          v.code.length > 30 ||
          typeof v.name !== 'string' ||
          v.name.length > 100 ||
          typeof v.category !== 'string' ||
          v.category.length > 20 ||
          typeof v.credits !== 'number' ||
          !Number.isInteger(v.credits) ||
          v.credits < 0 ||
          v.credits > 20,
      )
    )
      return json({ error: '이수 과목 형식을 확인해 주세요.' }, 400);
    profile.completed = input.completed.map(
      (v: {
        code: string;
        name: string;
        category: string;
        credits: number;
      }) => ({
        code: v.code,
        name: v.name,
        category: v.category,
        credits: v.credits,
      }),
    );
    const overrides: Record<string, number> = {};
    if (input.ruleOverrides && typeof input.ruleOverrides === 'object') {
      for (const [k, v] of Object.entries(
        input.ruleOverrides as Record<string, unknown>,
      )) {
        if (
          k.length > 30 ||
          typeof v !== 'number' ||
          !Number.isInteger(v) ||
          v < 1 ||
          v > 2000
        )
          return json({ error: '졸업 기준 형식을 확인해 주세요.' }, 400);
        overrides[k] = v;
      }
    }
    profile.ruleOverrides = overrides;
    profile.onboardingStep =
      Number.isInteger(input.onboardingStep) &&
      input.onboardingStep >= 0 &&
      input.onboardingStep <= 7
        ? input.onboardingStep
        : 0;
    profile.readIds =
      Array.isArray(input.readIds) &&
      input.readIds.length <= 500 &&
      input.readIds.every(
        (v: unknown) => typeof v === 'string' && v.length <= 80,
      )
        ? input.readIds
        : [];
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
