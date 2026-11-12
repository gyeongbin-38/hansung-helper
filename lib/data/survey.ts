import type { Data } from '../../app/sections/data';

/** 첫 안내는 한 번만 제안하고 기존 설문 답변은 그대로 존중한다. */
export function surveyEntryRoute(
  data: Pick<Data, 'prefs' | 'actPrefs' | 'surveyStatus'>,
): 'home' | 'survey' {
  if (data.surveyStatus === 'in-progress') return 'survey';
  if (data.surveyStatus === 'completed' || data.surveyStatus === 'skipped')
    return 'home';
  return data.prefs.some(Boolean) || data.actPrefs?.some(Boolean)
    ? 'home'
    : 'survey';
}
