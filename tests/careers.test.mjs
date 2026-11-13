import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  careerInfoFor,
  careerKeyword,
  jobSearchUrl,
  normDeptName,
} from '../lib/data/careers.ts';

test('normDeptName: 소속 표기 차이(학부/학과/공백)를 정규화한다', () => {
  assert.equal(normDeptName('컴퓨터공학부'), '컴퓨터공학');
  assert.equal(normDeptName('컴퓨터 공학과'), '컴퓨터공학');
  assert.equal(normDeptName('AI·소프트웨어학과'), 'ai소프트웨어');
  assert.equal(normDeptName('만화/웹툰 전문가과정'), '만화웹툰');
});

test('careerInfoFor: 학과·트랙 후보를 정확 일치 → 포함 순으로 매칭한다', () => {
  const depts = {
    컴퓨터공학과: { source: 'careernet', jobs: ['소프트웨어 개발자'] },
    디지털콘텐츠디자인: { source: 'careernet', jobs: ['UX 디자이너'] },
  };
  assert.equal(careerInfoFor('컴퓨터공학부', undefined, depts)?.jobs?.[0], '소프트웨어 개발자');
  assert.equal(careerInfoFor('컴퓨터공학과', undefined, depts)?.jobs?.[0], '소프트웨어 개발자');
  assert.equal(careerInfoFor(undefined, ['디지털콘텐츠디자인학과'], depts)?.jobs?.[0], 'UX 디자이너');
  assert.equal(careerInfoFor('없는학과', undefined, depts), undefined);
  assert.equal(careerInfoFor(undefined, undefined, depts), undefined);
});

test('careerKeyword: 검색어에서 소속 접미사를 뗀다', () => {
  assert.equal(careerKeyword('컴퓨터공학부'), '컴퓨터공학');
  assert.equal(careerKeyword('융합보안학과'), '융합보안');
  assert.equal(careerKeyword(undefined, ['UX/UI디자인트랙']), 'UX/UI디자인');
  assert.equal(careerKeyword(undefined, undefined), '');
});

test('jobSearchUrl: 잡코리아 검색 GET 링크를 만든다', () => {
  assert.equal(
    jobSearchUrl('소프트웨어 개발자'),
    'https://www.jobkorea.co.kr/Search/?stext=%EC%86%8C%ED%94%84%ED%8A%B8%EC%9B%A8%EC%96%B4%20%EA%B0%9C%EB%B0%9C%EC%9E%90',
  );
});
