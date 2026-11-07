import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  semesterStartTs,
  roomLabel,
  deliveryLabel,
  placeLabel,
  yearLabel,
  slotsLabel,
  sourceDurationLabel,
} from '../lib/data/catalog.ts';

const catalog = JSON.parse(
  readFileSync(new URL('../lib/data/catalog-2026-2.json', import.meta.url)),
);
const sections = catalog.sections;

test('catalog carries provenance metadata and full section set', () => {
  assert.equal(catalog.semester, '2026-2');
  assert.match(catalog.source, /종합정보시스템/);
  assert.ok(catalog.generatedAt);
  assert.ok(sections.length >= 850, `expected >=850 sections, got ${sections.length}`);
});

test('every section id is unique and fields are well-formed', () => {
  const ids = new Set();
  for (const s of sections) {
    assert.ok(s.id && !ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    assert.ok(s.name && s.dept && s.category, s.id);
    assert.ok(Number.isInteger(s.credits) && s.credits >= 0, s.id);
    assert.ok(typeof s.cross === 'boolean' && typeof s.online === 'boolean');
  }
});

test('slots are within Mon-Sun 00:00-24:00 or section is marked untimed', () => {
  for (const s of sections) {
    if (!s.slots.length) {
      assert.ok(s.untimed, `${s.id} has no slots but no untimed flag`);
      continue;
    }
    for (const sl of s.slots) {
      assert.ok(sl.d >= 0 && sl.d <= 6, `${s.id} bad day ${sl.d}`);
      assert.ok(sl.s >= 0 && sl.e <= 1440 && sl.s < sl.e, `${s.id} bad time`);
    }
  }
});

test('no personal/student data leaked into the public catalog', () => {
  const raw = readFileSync(
    new URL('../lib/data/catalog-2026-2.json', import.meta.url),
    'utf8',
  );
  assert.ok(!/password|passwd|학번.*\d{7,}|cookie|token/i.test(raw));
});

test('semesterStartTs maps YYYY-1→3/1, YYYY-2→9/1, unknown→null', () => {
  assert.equal(semesterStartTs('2026-1'), Date.parse('2026-03-01T00:00:00+09:00'));
  assert.equal(semesterStartTs('2026-2'), Date.parse('2026-09-01T00:00:00+09:00'));
  assert.equal(semesterStartTs('2025-2'), Date.parse('2025-09-01T00:00:00+09:00'));
  assert.equal(semesterStartTs('garbage'), null);
  assert.equal(semesterStartTs('2026-3'), null);
});

test('room/delivery/place labels separate online from room text', () => {
  const online = { room: '온라인강좌 미래관B107', online: true };
  const offline = { room: '미래관B107', online: false };
  const noRoom = { room: '', online: true };
  assert.equal(roomLabel(online), '미래관B107');
  assert.equal(deliveryLabel(online), '온라인');
  assert.equal(deliveryLabel(offline), '대면');
  assert.equal(placeLabel(online), '온라인 · 미래관B107');
  assert.equal(placeLabel(noRoom), '온라인');
  assert.equal(placeLabel(offline), '미래관B107');
  assert.equal(placeLabel({ room: '', online: false }), '강의실 미정');
});

test('학년, 원자료 시간 표기, 강의실을 구분한다', () => {
  const s = { room: '온라인강좌 1.5시간 공학관407', online: true, slots: [{ d: 2, s: 810, e: 885 }] };
  assert.equal(yearLabel('전학년'), '전학년');
  assert.equal(yearLabel('2'), '2학년');
  assert.equal(yearLabel('3학년'), '3학년');
  assert.equal(yearLabel(''), '');
  assert.equal(roomLabel(s), '공학관407');
  assert.equal(sourceDurationLabel(s), '1.5시간');
  assert.equal(slotsLabel(s), '수 13:30~14:45');
  assert.equal(roomLabel({ room: '온라인강좌 1.5시간', online: true }), '');
  assert.equal(sourceDurationLabel({ room: '온라인강좌', online: true }), '');
  assert.equal(slotsLabel({ online: false, slots: [] }), '시간 미정');
  assert.equal(roomLabel({ room: '온라인강좌 / 상상파크 AI실습실', online: true }), '상상파크 AI실습실');
});
