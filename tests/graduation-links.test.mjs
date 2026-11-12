import test from 'node:test';
import assert from 'node:assert/strict';
import { graduationRuleLink } from '../lib/data/graduation-links.ts';
import { GLOBAL_RULE_SOURCE, TRANSFER_RULE_SOURCE } from '../lib/data/graduation.ts';

const rule = { deptLabel: 'AI응용학과', url: 'https://www.hansung.ac.kr/CreCon/2781/subview.do' };
const input = { department: 'AI응용학과', pool: ['AI응용학과'], rule, admissionType: 'freshman' };
test('확인된 학과의 공식 원문으로 연결한다', () => {
  assert.deepEqual(graduationRuleLink(input), { url: rule.url, departmentSpecific: true });
  assert.equal(graduationRuleLink({ ...input, pool: null }).url, rule.url);
  const guide = { url: 'https://hansung.ac.kr/CSE/1564/subview.do' };
  assert.equal(graduationRuleLink({ ...input, guide }).url, guide.url);
});
test('학과가 없거나 모호하고 확인된 학과 원문이 없으면 공통 안내로 연결한다', () => {
  assert.deepEqual(graduationRuleLink({ ...input, department: '', pool: null }), { url: GLOBAL_RULE_SOURCE.url, departmentSpecific: false });
  assert.deepEqual(graduationRuleLink({ ...input, department: '디자인', pool: ['A', 'B'] }), { url: GLOBAL_RULE_SOURCE.url, departmentSpecific: false });
  assert.equal(graduationRuleLink({ ...input, rule: null, admissionType: 'general-transfer' }).url, TRANSFER_RULE_SOURCE.url);
  assert.equal(graduationRuleLink({ ...input, rule: { ...rule, url: 'https://hansung.ac.kr.example.com/test' } }).departmentSpecific, false);
});
