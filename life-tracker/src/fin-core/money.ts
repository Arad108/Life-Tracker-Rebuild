/**
 * Money and date primitives.
 *
 * Money is always an integer number of paise. Nothing in this module converts
 * to a float, and nothing rounds. Formatting for display is a UI concern and
 * deliberately lives outside the calculation core.
 */

export const MINOR_UNITS_PER_RUPEE = 100;

/**
 * ±₹10 crore. Not a business limit — a sanity limit, so a mis-typed amount or a
 * mis-parsed import cannot poison every total.
 */
export const MAX_ABS_AMOUNT_MINOR = 10_000_000_000;

/** v1 supports INR only. Anything else is rejected rather than silently summed. */
export const SUPPORTED_CURRENCY = 'INR' as const;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * True for a real local calendar day in `YYYY-MM-DD`.
 *
 * Rejects `2026-02-30` and `2026-13-01`, which a naive regex accepts. Uses UTC
 * purely as a calendar calculator; the value itself is never treated as an
 * instant in time.
 */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DAY_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  );
}

/** A whole, finite, safe integer number of paise. */
export function isMinorAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Sum without ever producing `-0`. */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total === 0 ? 0 : total;
}

/**
 * Collapse `-0` to `0`.
 *
 * `-0` is numerically zero but breaks strict equality, JSON output and any
 * snapshot test. Negating a zero sum is the usual way it appears.
 */
export function noNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function absMinor(value: number): number {
  return value < 0 ? -value : value;
}

/**
 * Division that refuses to invent a number. Returns `null` rather than `0`,
 * `Infinity`, or `NaN` when the denominator cannot support a ratio.
 */
export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}
