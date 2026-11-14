/**
 * Local-day arithmetic.
 *
 * The app groups everything by a local calendar day (`YYYY-MM-DD`), so every
 * helper here is a calendar calculator, not an instant in time. UTC is used only
 * to get month lengths and day counts right; the values themselves are local
 * days.
 *
 * These mirror the recovered app's `addDays`, `parseDay` and `dayKey` helpers,
 * and add the quarterly step the shipped `advanceDue` did not have.
 */

import { isDayKey } from './money';

export interface DayParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const DAY_MS = 86_400_000;

export function dayParts(day: string): DayParts {
  if (!isDayKey(day)) {
    throw new RangeError(`Invalid day ${String(day)}: expected local YYYY-MM-DD.`);
  }
  return {
    year: Number(day.slice(0, 4)),
    month: Number(day.slice(5, 7)),
    day: Number(day.slice(8, 10)),
  };
}

/** Build a validated day key, clamping is *not* performed here. */
export function dayKeyOf(year: number, month: number, day: number): string {
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  if (
    asUtc.getUTCFullYear() !== year ||
    asUtc.getUTCMonth() !== month - 1 ||
    asUtc.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid calendar day ${year}-${month}-${day}.`);
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Number of days in a calendar month. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(day: string, days: number): string {
  const parts = dayParts(day);
  if (!Number.isSafeInteger(days)) {
    throw new RangeError('addDays expects a whole number of days.');
  }
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day) + days * DAY_MS,
  );
  return dayKeyOf(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/**
 * Add whole months, clamping to the last day of the target month.
 *
 * `2026-01-31 + 1 month` is `2026-02-28`, not `2026-03-03`. This is exactly what
 * the shipped app's `advanceDue` did, and what a monthly bill needs.
 */
export function addMonths(day: string, months: number): string {
  const parts = dayParts(day);
  if (!Number.isSafeInteger(months)) {
    throw new RangeError('addMonths expects a whole number of months.');
  }

  const zeroBased = parts.month - 1 + months;
  const year = parts.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12 + 1;
  const dayOfMonth = Math.min(parts.day, lastDayOfMonth(year, month));
  return dayKeyOf(year, month, dayOfMonth);
}

/** Inclusive day count: `daysBetween('2026-11-01','2026-11-01') === 0`. */
export function daysBetween(from: string, to: string): number {
  const a = dayParts(from);
  const b = dayParts(to);
  const start = Date.UTC(a.year, a.month - 1, a.day);
  const end = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((end - start) / DAY_MS);
}

/** Negative when `a` is earlier than `b`, matching string comparison. */
export function compareDays(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The local calendar day of a `Date`. */
export function todayKey(now: Date = new Date()): string {
  return dayKeyOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Last day of a `YYYY-MM` month key. */
export function endOfMonth(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new RangeError(`Invalid month ${String(month)}: expected YYYY-MM.`);
  }
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return `${month}-${String(lastDayOfMonth(year, monthNumber)).padStart(2, '0')}`;
}

/** Every day in an inclusive range. Guarded against accidental huge ranges. */
export function eachDay(from: string, to: string, limit = 3_660): string[] {
  if (!isDayKey(from) || !isDayKey(to)) {
    throw new RangeError('eachDay expects local YYYY-MM-DD days.');
  }
  if (from > to) return [];
  const count = daysBetween(from, to);
  if (count + 1 > limit) {
    throw new RangeError(`Range ${from}..${to} spans ${count + 1} days, more than ${limit}.`);
  }
  const days: string[] = [];
  for (let index = 0; index <= count; index += 1) days.push(addDays(from, index));
  return days;
}
