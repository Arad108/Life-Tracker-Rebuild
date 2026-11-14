/**
 * I8 — Bills (pure schedule model).
 *
 * A bill is a *schedule*, never a completed payment. The schedule answers "when
 * is this due and how much is expected"; the ledger answers "what actually
 * happened". Keeping the two apart is what prevents the shipped app's bug where
 * "Mark paid" recorded a marker but no transaction.
 *
 * Recovered behaviour that this preserves:
 *
 *   - cadences `weekly`, `monthly`, `yearly`, with month-end clamping
 *     (`2026-01-31 + 1 month` → `2026-02-28`), exactly like `advanceDue`;
 *   - `nextDay` is the next *unpaid* occurrence;
 *   - nothing is ever posted automatically.
 *
 * Added because the requirements ask for it: `quarterly`, an explicit tolerance
 * window, variable amounts, and skip records.
 *
 * Pure and deterministic: days and rows in, states out. No clock, no database.
 */

import { addDays, addMonths, compareDays, daysBetween } from './dates';
import { isDayKey } from './money';

export const BILL_CADENCES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;

export type BillCadence = (typeof BILL_CADENCES)[number];

export function isBillCadence(value: unknown): value is BillCadence {
  return typeof value === 'string' && (BILL_CADENCES as readonly string[]).includes(value);
}

/** A recurring bill schedule. `amountMinor` is the expected amount, positive. */
export interface Bill {
  readonly id: string;
  readonly title: string;
  /** Expected amount in positive paise. */
  readonly amountMinor: number;
  readonly accountId: string;
  readonly categoryId?: string | null;
  /** `expense` for money out, `income` for a recurring receipt. */
  readonly type?: 'expense' | 'income';
  readonly cadence: BillCadence;
  /** The next unpaid occurrence, local `YYYY-MM-DD`. */
  readonly nextDueDay: string;
  readonly active?: boolean;
  /** True when the amount changes each cycle (a utility bill). */
  readonly variableAmount?: boolean;
  /** Days after the due day before it is called overdue. Defaults to 0. */
  readonly toleranceDays?: number;
  readonly lastPaidDay?: string | null;
  readonly lastAmountMinor?: number | null;
  readonly notes?: string;
  readonly cancelledAt?: number | null;
  readonly deletedAt?: number | null;
}

export type BillState = 'upcoming' | 'due' | 'overdue' | 'paid' | 'skipped' | 'cancelled';

/** What a payment transaction tells the schedule. */
export interface BillPaymentRef {
  readonly billId: string;
  readonly dueDay: string;
  readonly day: string;
  readonly amountMinor: number;
  readonly transactionId: string;
}

/** A skipped occurrence. Skips are recorded so history is not silently lost. */
export interface BillSkipRef {
  readonly billId: string;
  readonly dueDay: string;
  readonly reason?: string;
}

export interface BillOccurrence {
  readonly billId: string;
  readonly dueDay: string;
  readonly state: BillState;
  /** Expected amount, positive. */
  readonly expectedMinor: number;
  /** Actual paid amount when `state === 'paid'`. */
  readonly paidMinor?: number;
  readonly paidDay?: string;
  readonly transactionId?: string;
  readonly reason?: string;
}

/** Advance one occurrence exactly like the shipped app, plus quarterly. */
export function advanceDue(day: string, cadence: BillCadence): string {
  switch (cadence) {
    case 'weekly':
      return addDays(day, 7);
    case 'monthly':
      return addMonths(day, 1);
    case 'quarterly':
      return addMonths(day, 3);
    case 'yearly':
      return addMonths(day, 12);
  }
}

/** State of the schedule's next occurrence at `asOf`. */
export function billStateAt(
  bill: Bill,
  asOf: string,
  toleranceDays: number = bill.toleranceDays ?? 0,
): BillState {
  if (bill.deletedAt != null || bill.active === false || bill.cancelledAt != null) {
    return 'cancelled';
  }
  if (!isDayKey(asOf)) {
    throw new RangeError(`Invalid asOf day ${String(asOf)}: expected local YYYY-MM-DD.`);
  }

  const due = bill.nextDueDay;
  if (asOf < due) return 'upcoming';
  if (asOf === due) return 'due';
  return daysBetween(due, asOf) <= toleranceDays ? 'due' : 'overdue';
}

/** True for a state that still owes money. */
export function isUnpaidState(state: BillState): boolean {
  return state === 'upcoming' || state === 'due' || state === 'overdue';
}

function stateForDueDay(
  dueDay: string,
  asOf: string,
  toleranceDays: number,
): BillState {
  if (dueDay > asOf) return 'upcoming';
  if (dueDay === asOf) return 'due';
  return daysBetween(dueDay, asOf) <= toleranceDays ? 'due' : 'overdue';
}

export interface BillOccurrenceOptions {
  /** Inclusive start of the window. */
  readonly from: string;
  /** Inclusive end of the window. */
  readonly to: string;
  /** The day the states are judged against, usually today. */
  readonly asOf: string;
  readonly payments?: readonly BillPaymentRef[];
  readonly skips?: readonly BillSkipRef[];
}

/**
 * Every occurrence of one bill inside a window, including paid and skipped ones.
 *
 * The schedule only generates forward from `nextDueDay`; paid/skipped history is
 * merged in from the references so a just-paid occurrence still appears in the
 * timeline instead of disappearing when the schedule advances.
 */
export function billOccurrences(
  bill: Bill,
  options: BillOccurrenceOptions,
): BillOccurrence[] {
  const { from, to, asOf } = options;
  if (!isDayKey(from) || !isDayKey(to) || !isDayKey(asOf)) {
    throw new RangeError('Bill occurrence windows must be local YYYY-MM-DD days.');
  }
  if (from > to) {
    throw new RangeError(`Invalid window: from (${from}) is after to (${to}).`);
  }

  const tolerance = bill.toleranceDays ?? 0;
  const byDueDay = new Map<string, BillOccurrence>();

  for (const payment of options.payments ?? []) {
    if (payment.billId !== bill.id) continue;
    if (payment.dueDay < from || payment.dueDay > to) continue;
    byDueDay.set(payment.dueDay, {
      billId: bill.id,
      dueDay: payment.dueDay,
      state: 'paid',
      expectedMinor: bill.amountMinor,
      paidMinor: payment.amountMinor,
      paidDay: payment.day,
      transactionId: payment.transactionId,
    });
  }

  for (const skip of options.skips ?? []) {
    if (skip.billId !== bill.id) continue;
    if (skip.dueDay < from || skip.dueDay > to) continue;
    if (byDueDay.has(skip.dueDay)) continue;
    byDueDay.set(skip.dueDay, {
      billId: bill.id,
      dueDay: skip.dueDay,
      state: 'skipped',
      expectedMinor: bill.amountMinor,
      ...(skip.reason ? { reason: skip.reason } : {}),
    });
  }

  // Generate the schedule from the first unpaid occurrence. Walk past days that
  // are already covered by a payment or skip so one occurrence cannot appear
  // twice.
  let cursor = bill.nextDueDay;
  // Guard against a malformed cadence producing an infinite loop.
  for (let step = 0; step < 10_000 && cursor <= to; step += 1) {
    if (!byDueDay.has(cursor) && cursor >= from) {
      byDueDay.set(cursor, {
        billId: bill.id,
        dueDay: cursor,
        state: stateForDueDay(cursor, asOf, tolerance),
        expectedMinor: bill.amountMinor,
      });
    }
    cursor = advanceDue(cursor, bill.cadence);
  }

  return [...byDueDay.values()].sort((a, b) => compareDays(a.dueDay, b.dueDay));
}

/** Unpaid occurrences in a window, across many bills. */
export function upcomingBills(
  bills: readonly Bill[],
  options: BillOccurrenceOptions,
): BillOccurrence[] {
  const occurrences: BillOccurrence[] = [];
  for (const bill of bills) {
    if (bill.deletedAt != null || bill.active === false || bill.cancelledAt != null) continue;
    for (const occurrence of billOccurrences(bill, options)) {
      if (isUnpaidState(occurrence.state)) occurrences.push(occurrence);
    }
  }
  return occurrences.sort((a, b) =>
    a.dueDay === b.dueDay
      ? a.billId < b.billId
        ? -1
        : a.billId > b.billId
          ? 1
          : 0
      : compareDays(a.dueDay, b.dueDay),
  );
}

/**
 * What one bill still owes inside a window.
 *
 * Paid and skipped occurrences are excluded, so a payment already recorded in
 * the ledger is never counted as an obligation a second time.
 */
export function unpaidTotal(
  bill: Bill,
  options: BillOccurrenceOptions,
): number {
  let total = 0;
  for (const occurrence of billOccurrences(bill, options)) {
    if (!isUnpaidState(occurrence.state)) continue;
    total += occurrence.expectedMinor;
  }
  return total;
}

/** Expected amount for the next payment: last paid amount for variable bills. */
export function expectedAmount(bill: Bill): number {
  if (bill.variableAmount === true && typeof bill.lastAmountMinor === 'number') {
    return bill.lastAmountMinor;
  }
  return bill.amountMinor;
}
