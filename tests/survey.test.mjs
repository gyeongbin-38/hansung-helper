import assert from 'node:assert/strict';
import test from 'node:test';
import { surveyEntryRoute } from '../lib/data/survey.ts';

test('처음 이용하고 답변이 없으면 설문 안내로 시작한다', () => {
  assert.equal(surveyEntryRoute({ prefs: [] }), 'survey');
});

test('완료하거나 나중에 하기를 선택한 설문을 반복 안내하지 않는다', () => {
  for (const surveyStatus of ['completed', 'skipped'])
    assert.equal(surveyEntryRoute({ prefs: [], surveyStatus }), 'home');
});

test('저장한 중간 답변이 있으면 진행 중인 설문으로 돌아간다', () => {
  assert.equal(
    surveyEntryRoute({ prefs: ['전공 심화'], surveyStatus: 'in-progress' }),
    'survey',
  );
});

test('기존 수업 또는 비교과 설문 응답자는 바로 홈으로 간다', () => {
  assert.equal(surveyEntryRoute({ prefs: ['전공 심화'] }), 'home');
  assert.equal(
    surveyEntryRoute({ prefs: [], actPrefs: ['특강·멘토링'] }),
    'home',
  );
  assert.equal(surveyEntryRoute({ prefs: ['', ''], actPrefs: [''] }), 'survey');
});
