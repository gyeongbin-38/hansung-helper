/** 체험 정보만 사용하는 저장 키. 학교 계정이나 다른 브라우저 설정은 포함하지 않는다. */
export const DEMO_STORAGE_KEY = 'hansung-demo-v1';

export function parseDemoStorage(raw: string | null):
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'saved'; value: Record<string, unknown> } {
  if (raw === null) return { status: 'empty' };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'invalid' };
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.saved) || !Array.isArray(record.planned) || !Array.isArray(record.events)) return { status: 'invalid' };
    return { status: 'saved', value: record };
  } catch {
    return { status: 'invalid' };
  }
}
