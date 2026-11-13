import {
  authenticated,
  database,
  json,
  PayloadTooLargeError,
  readTextLimited,
  validOrigin,
} from '@/lib/server/account';
import { validateLms } from '@/lib/data/lms';
export async function PUT(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const row = await authenticated(request);
    if (!row) return json({ error: '다시 로그인해 주세요.' }, 401);
    const raw = await readTextLimited(request, 200000);
    const input = JSON.parse(raw),
      profile: Record<string, unknown> = {};
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return json({ error: '입력 형식을 확인해 주세요.' }, 400);
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
    // 잘못된 선택 필드를 기본값으로 바꾸면 기존 설정이 조용히 지워질 수 있다.
    const validStringArray = (value: unknown, limit: number, maxLength: number) =>
      Array.isArray(value) && value.length <= limit &&
      value.every((item) => typeof item === 'string' && item.length <= maxLength);
    for (const [key, limit, maxLength] of [
      ['readIds', 500, 80], ['reqChecks', 200, 120], ['actPrefs', 20, 100],
      ['notifiedIds', 200, 200],
    ] as const) {
      if (input[key] !== undefined && !validStringArray(input[key], limit, maxLength))
        return json({ error: '저장 항목 형식을 확인해 주세요.' }, 400);
    }
    if (input.notifEnabled !== undefined && typeof input.notifEnabled !== 'boolean')
      return json({ error: '알림 설정 형식을 확인해 주세요.' }, 400);
    if (input.mascotEnabled !== undefined && typeof input.mascotEnabled !== 'boolean')
      return json({ error: '마스코트 설정 형식을 확인해 주세요.' }, 400);
    if (input.mascotGuideSeen !== undefined && typeof input.mascotGuideSeen !== 'boolean')
      return json({ error: '마스코트 설정 형식을 확인해 주세요.' }, 400);
    // 구버전 클라이언트가 새 필드를 보내지 않아도 저장된 설정을 지우지 않는다.
    let storedProfile: Record<string, unknown> = {};
    try { storedProfile = JSON.parse(row.profile); } catch { /* 기존 손상 값 무시 */ }
    const surveyStatuses = ['in-progress', 'completed', 'skipped'];
    if (input.surveyStatus !== undefined && !surveyStatuses.includes(input.surveyStatus))
      return json({ error: '설문 진행 상태를 확인해 주세요.' }, 400);
    const surveyStatus = input.surveyStatus ?? storedProfile?.surveyStatus;
    if (typeof surveyStatus === 'string' && surveyStatuses.includes(surveyStatus))
      profile.surveyStatus = surveyStatus;
    const admissionTypes = ['unknown', 'freshman', 'general-transfer', 'bachelor-transfer'];
    if (input.admissionType !== undefined && !admissionTypes.includes(input.admissionType))
      return json({ error: '입학 구분을 확인해 주세요.' }, 400);
    const admissionType = input.admissionType ?? storedProfile?.admissionType;
    if (typeof admissionType === 'string' && admissionTypes.includes(admissionType))
      profile.admissionType = admissionType;
    const notifiedIds = input.notifiedIds ?? storedProfile?.notifiedIds;
    if (validStringArray(notifiedIds, 200, 200)) profile.notifiedIds = notifiedIds;
    const notifEnabled = input.notifEnabled ?? storedProfile?.notifEnabled;
    if (typeof notifEnabled === 'boolean') profile.notifEnabled = notifEnabled;
    const mascotEnabled = input.mascotEnabled ?? storedProfile?.mascotEnabled;
    if (typeof mascotEnabled === 'boolean') profile.mascotEnabled = mascotEnabled;
    const mascotGuideSeen = input.mascotGuideSeen ?? storedProfile?.mascotGuideSeen;
    if (typeof mascotGuideSeen === 'boolean') profile.mascotGuideSeen = mascotGuideSeen;
    for (const key of ['ruleOverrides', 'actStatus', 'lmsMatch', 'plans'] as const) {
      if (input[key] !== undefined &&
          (!input[key] || typeof input[key] !== 'object' || Array.isArray(input[key])))
        return json({ error: '저장 항목 형식을 확인해 주세요.' }, 400);
    }
    if (input.extActivities !== undefined && !Array.isArray(input.extActivities))
      return json({ error: '직접 등록 활동 형식을 확인해 주세요.' }, 400);
    if (input.onboardingStep !== undefined &&
        (!Number.isInteger(input.onboardingStep) || input.onboardingStep < 0 || input.onboardingStep > 8))
      return json({ error: '시작 설정을 확인해 주세요.' }, 400);
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
      input.onboardingStep <= 8
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
    profile.reqChecks =
      Array.isArray(input.reqChecks) &&
      input.reqChecks.length <= 200 &&
      input.reqChecks.every(
        (v: unknown) => typeof v === 'string' && v.length <= 120,
      )
        ? input.reqChecks
        : [];
    profile.actPrefs =
      Array.isArray(input.actPrefs) &&
      input.actPrefs.length <= 20 &&
      input.actPrefs.every(
        (v: unknown) => typeof v === 'string' && v.length <= 100,
      )
        ? input.actPrefs
        : [];
    const actStatus: Record<string, string> = {};
    if (input.actStatus && typeof input.actStatus === 'object') {
      const entries = Object.entries(
        input.actStatus as Record<string, unknown>,
      );
      if (entries.length > 100)
        return json({ error: '활동 단계 항목이 너무 많습니다.' }, 400);
      for (const [k, v] of entries) {
        if (
          k.length > 60 ||
          !['applied', 'joined', 'done', 'credited'].includes(v as string)
        )
          return json({ error: '활동 단계 형식을 확인해 주세요.' }, 400);
        actStatus[k] = v as string;
      }
    }
    profile.actStatus = actStatus;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const extActivities: Record<string, string>[] = [];
    if (Array.isArray(input.extActivities)) {
      if (input.extActivities.length > 50)
        return json({ error: '직접 등록 활동이 너무 많습니다.' }, 400);
      for (const v of input.extActivities as Record<string, unknown>[]) {
        const str = (x: unknown, max: number) =>
          typeof x === 'string' && x.length <= max;
        if (
          !v ||
          !str(v.id, 40) ||
          !/^ext-[\w-]+$/.test(v.id as string) ||
          !str(v.title, 100) ||
          !(v.title as string).trim() ||
          !str(v.org, 60) ||
          !(v.org as string).trim() ||
          !str(v.applyStart, 10) ||
          !str(v.applyEnd, 10) ||
          !str(v.runStart, 10) ||
          !str(v.runEnd, 10) ||
          [v.applyStart, v.applyEnd, v.runStart, v.runEnd].some(
            (d) => d !== '' && !dateRe.test(d as string),
          ) ||
          !str(v.points, 4) ||
          ((v.points as string) !== '' && !/^\d{1,4}$/.test(v.points as string)) ||
          !str(v.url, 300) ||
          ((v.url as string) !== '' &&
            !/^https?:\/\//.test(v.url as string)) ||
          !str(v.addedAt, 40)
        )
          return json({ error: '직접 등록 활동 형식을 확인해 주세요.' }, 400);
        extActivities.push({
          id: v.id as string,
          title: (v.title as string).trim(),
          org: (v.org as string).trim(),
          applyStart: v.applyStart as string,
          applyEnd: v.applyEnd as string,
          runStart: v.runStart as string,
          runEnd: v.runEnd as string,
          points: v.points as string,
          url: v.url as string,
          addedAt: v.addedAt as string,
        });
      }
    }
    profile.extActivities = extActivities;
    const lmsMatch: Record<string, string> = {};
    if (input.lmsMatch && typeof input.lmsMatch === 'object') {
      const entries = Object.entries(
        input.lmsMatch as Record<string, unknown>,
      );
      if (entries.length > 200)
        return json({ error: '매칭 보정 항목이 너무 많습니다.' }, 400);
      for (const [k, v] of entries) {
        if (
          k.length > 40 ||
          typeof v !== 'string' ||
          v.length > 60 ||
          (v !== 'ignore' && !/^[\w-]+$/.test(v))
        )
          return json({ error: '매칭 보정 형식을 확인해 주세요.' }, 400);
        lmsMatch[k] = v;
      }
    }
    profile.lmsMatch = lmsMatch;
    // 낙관적 잠금 — 클라이언트가 보낸 rev와 저장된 rev가 다르면 다른
    // 기기/탭이 먼저 쓴 것이므로 덮어쓰지 않고 409로 알린다. rev를
    // 버전이 없는 요청은 오래된 탭의 덮어쓰기를 방지하기 위해 거절한다.
    if (!Number.isSafeInteger(input.rev) || input.rev < 0 || input.rev >= Number.MAX_SAFE_INTEGER)
      return json({ error: '저장 버전을 확인해 주세요. 페이지를 새로고침해 주세요.' }, 400);
    const expected = input.rev as number;
    profile.rev = expected + 1;
    const plans: Record<string, string[]> = {};
    if (input.plans && typeof input.plans === 'object') {
      for (const [k, v] of Object.entries(
        input.plans as Record<string, unknown>,
      )) {
        if (!['A', 'B', 'C'].includes(k)) continue;
        if (
          !Array.isArray(v) ||
          v.length > 40 ||
          v.some(
            (x: unknown) =>
              typeof x !== 'string' || x.length > 60 || !/^[\w-]+$/.test(x),
          )
        )
          return json({ error: '시나리오 형식을 확인해 주세요.' }, 400);
        plans[k] = v;
      }
    }
    profile.plans = plans;
    if (input.setupHistory !== undefined && input.setupHistory !== 'none' && input.setupHistory !== 'later')
      return json({ error: '시작 설정을 확인해 주세요.' }, 400);
    if (input.recommendationsSeen !== undefined && typeof input.recommendationsSeen !== 'boolean')
      return json({ error: '시작 설정을 확인해 주세요.' }, 400);
    if (input.setupHistory !== undefined) profile.setupHistory = input.setupHistory;
    if (input.recommendationsSeen !== undefined) profile.recommendationsSeen = input.recommendationsSeen;
    if (input.planSemester !== undefined && (typeof input.planSemester !== 'string' || !/^(legacy|20\d{2}-[12])$/.test(input.planSemester)))
      return json({ error: '계획 학기를 확인해 주세요.' }, 400);
    if (input.planSemester !== undefined) profile.planSemester = input.planSemester;
    if (input.semesterPlans !== undefined) {
      if (!input.semesterPlans || typeof input.semesterPlans !== 'object' || Array.isArray(input.semesterPlans) || Object.keys(input.semesterPlans).length > 40)
        return json({ error: '학기별 계획 형식을 확인해 주세요.' }, 400);
      for (const [semester, value] of Object.entries(input.semesterPlans)) {
        const entry = value as { sourceSemester?: unknown; planned?: unknown; plans?: unknown } | null;
        const validIds = (ids: unknown) => Array.isArray(ids) && ids.length <= 100 && ids.every((id) => typeof id === 'string' && id.length <= 200);
        if (!/^20\d{2}-[12]$/.test(semester) || !entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.sourceSemester !== 'string' || !/^20\d{2}-[12]$/.test(entry.sourceSemester) || !validIds(entry.planned) || !entry.plans || typeof entry.plans !== 'object' || Array.isArray(entry.plans) || Object.entries(entry.plans).some(([key, ids]) => !['A', 'B', 'C'].includes(key) || !validIds(ids)))
          return json({ error: '학기별 계획 형식을 확인해 주세요.' }, 400);
      }
      profile.semesterPlans = input.semesterPlans;
    }
    if (input.lms !== undefined) {
      const lms = validateLms(input.lms);
      if (!lms) return json({ error: '수업 데이터 형식을 확인해 주세요.' }, 400);
      profile.lms = lms;
    }
    profile.consent = input.consent === true;
    const written = await database()
      .prepare(
        "UPDATE academic_accounts SET profile = ?, onboarded = ? WHERE id = ? AND COALESCE(json_extract(profile, '$.rev'), 0) = ? AND EXISTS (SELECT 1 FROM academic_sessions WHERE token_hash = ? AND account_id = academic_accounts.id AND expires_at > ?)",
      )
      .bind(
        JSON.stringify(profile),
        input.onboarded === true || row.onboarded ? 1 : 0,
        row.id,
        expected,
        row.session_hash,
        Date.now(),
      )
      .run();
    if (!written.meta.changes && !(await authenticated(request)))
      return json({ error: '다시 로그인해 주세요.' }, 401);
    if (!written.meta.changes)
      return json(
        {
          error:
            '다른 곳에서 먼저 저장된 내용이 있습니다. 최신 상태를 다시 불러와 주세요.',
          conflict: true,
        },
        409,
      );
    return json({ saved: true, rev: profile.rev });
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return json({ error: '저장할 내용이 너무 큽니다.' }, 413);
    if (error instanceof SyntaxError)
      return json({ error: '입력 형식을 확인해 주세요.' }, 400);
    return json({ error: '저장하지 못했습니다. 입력 내용은 유지됩니다.' }, 503);
  }
}
