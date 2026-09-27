import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PROGRAM, WEEK_TITLES, WEEK_SOURCES, goalWeight, bmi, currentWeek, foodPoints } from './program-config.js';
import { CURRICULUM } from './program-curriculum.js';

test('12 weeks and goals match the confirmed program values', () => {
  assert.equal(WEEK_TITLES.length, 12);
  assert.equal(WEEK_SOURCES.length, 12);
  assert.equal(CURRICULUM.length, 12);
  for (const [index, entry] of CURRICULUM.entries()) {
    assert.ok(entry.lesson.length && entry.task);
    if (index > 0) assert.ok(entry.question?.options?.includes('その他'));
  }
  assert.deepEqual(PROGRAM.dailyPoints, { female: 15, male: 21 });
  assert.deepEqual(PROGRAM.goalPercents.map(p => goalWeight(70, p)), [66.5, 64.4, 63, 59.5]);
  assert.equal(bmi(170, 70), 24.2);
  assert.equal(currentWeek('2026-09-27', new Date('2026-09-27T12:00:00+09:00')), 1);
  assert.equal(currentWeek('2026-09-27', new Date('2026-10-04T00:00:00+09:00')), 2);
  assert.equal(currentWeek('2026-09-27', new Date('2027-01-01T00:00:00+09:00')), 12);
});

test('food calculation uses the verified master weight, not an AI estimate', () => {
  const { foods } = JSON.parse(readFileSync(new URL('./food-master.json', import.meta.url)));
  assert.equal(foods.length, 686);
  const rice = foods.find(x => x.name === 'めし・水稲・精白米');
  assert.deepEqual({ group: rice.group, gramsPerPoint: rice.gramsPerPoint }, { group: '第4群', gramsPerPoint: 50 });
  assert.equal(foodPoints(150, rice.gramsPerPoint), 3);
  assert.throws(() => foodPoints(0, 50), RangeError);
});
