import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, addMonths, daysBetween, dayParts, endOfMonth, lastDayOfMonth, todayKey } from '../src/dates';

describe('dates', () => {
  it('adds days across month boundaries', () => {
    assert.equal(addDays('2026-11-28', 5), '2026-12-03');
    assert.equal(addDays('2026-11-01', -1), '2026-10-31');
  });

  it('clamps month addition to the last day of the target month', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
    assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
    assert.equal(addMonths('2026-11-15', 12), '2027-11-15');
    assert.equal(addMonths('2026-11-15', -1), '2026-10-15');
  });

  it('counts days inclusively-exclusive', () => {
    assert.equal(daysBetween('2026-11-01', '2026-11-01'), 0);
    assert.equal(daysBetween('2026-11-01', '2026-11-30'), 29);
    assert.equal(daysBetween('2026-11-30', '2026-11-01'), -29);
  });

  it('reports the last day of a month', () => {
    assert.equal(lastDayOfMonth(2024, 2), 29);
    assert.equal(lastDayOfMonth(2026, 2), 28);
    assert.equal(endOfMonth('2026-11'), '2026-11-30');
    assert.equal(endOfMonth('2024-02'), '2024-02-29');
  });

  it('parses day parts and rejects invalid days', () => {
    assert.deepEqual(dayParts('2026-11-15'), { year: 2026, month: 11, day: 15 });
    assert.throws(() => dayParts('2026-13-01'), /Invalid day/);
  });

  it('formats a local today key', () => {
    const key = todayKey(new Date(2026, 10, 15, 23, 59));
    assert.equal(key, '2026-11-15');
  });
});
