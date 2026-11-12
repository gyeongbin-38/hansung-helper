import { GLOBAL_RULE_SOURCE, TRANSFER_RULE_SOURCE, type AdmissionType } from './graduation.ts';

/** 확인된 한성대 원문만 연결하고, 모호한 학과를 다른 학과 규정으로 추정하지 않는다. */
export function graduationRuleLink(input: {
  department: string;
  pool: string[] | null;
  rule?: { deptLabel: string; url: string } | null;
  guide?: { url: string } | null;
  admissionType: AdmissionType;
}): { url: string; departmentSpecific: boolean } {
  const validSchoolUrl = (url: string | undefined): url is string => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && (parsed.hostname === 'hansung.ac.kr' || parsed.hostname.endsWith('.hansung.ac.kr'));
    } catch { return false; }
  };
  if (validSchoolUrl(input.guide?.url)) return { url: input.guide.url, departmentSpecific: true };
  const labelMatches = !!input.department.trim() && input.rule?.deptLabel.replace(/\s+/g, '') === input.department.replace(/\s+/g, '');
  if (validSchoolUrl(input.rule?.url) && (labelMatches || input.pool?.length === 1))
    return { url: input.rule.url, departmentSpecific: true };
  return {
    url: input.admissionType === 'general-transfer' || input.admissionType === 'bachelor-transfer' ? TRANSFER_RULE_SOURCE.url : GLOBAL_RULE_SOURCE.url,
    departmentSpecific: false,
  };
}
