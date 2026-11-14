/**
 * I6 — Calculation engine (period totals).
 *
 * Rules that this module enforces, and that its tests pin:
 *
 *   1. Transfers never appear in income or spending. Moving money between your
 *      own accounts is not earning and not spending.
 *   2. Refunds are not income. A refund reduces spending; it never increases
 *      earnings, and it never inflates the savings rate.
 *   3. Adjustments (reconciliation) are neither income nor spending.
 *   4. `excluded` rows are left out of analytics but still move account
 *      balances — "real money, not spending" is a legitimate state.
 *   5. Soft-deleted rows are invisible everywhere.
 *   6. `pending` rows count. Excluding them would make the headline total
 *      disagree with the account balance, which is worse than a review badge.
 *   7. Every function is pure: rows in, numbers out. No clock, no database.
 */

import { isDayKey, noNegativeZero, ratio } from './money';
import type { DayRange, Metric, Transaction, TransactionKind } from './types';

// ---------------------------------------------------------------------------
// Row visibility
// ---------------------------------------------------------------------------

/** A row that still exists. Soft-deleted rows are ignored everywhere. */
export function isLive(transaction: Transaction): boolean {
  return transaction.deletedAt === null || transaction.deletedAt === undefined;
}

/**
 * A row that counts towards analytics: live, and not explicitly excluded.
 *
 * Balances use `isLive` instead, because an excluded row is still money that
 * actually moved.
 */
export function isCounted(transaction: Transaction): boolean {
  return isLive(transaction) && (transaction.status ?? 'posted') !== 'excluded';
}

/** Throws on a malformed or inverted range rather than silently returning 0. */
export function assertRange(range: DayRange): void {
  if (!isDayKey(range.from) || !isDayKey(range.to)) {
    throw new RangeError(
      `Invalid day range ${range.from}..${range.to}: both ends must be local YYYY-MM-DD days.`,
    );
  }
  if (range.from > range.to) {
    throw new RangeError(`Invalid day range: from (${range.from}) is after to (${range.to}).`);
  }
}

/** Rows that contribute to analytics inside an inclusive local-day range. */
export function countedInRange(
  transactions: readonly Transaction[],
  range: DayRange,
): Transaction[] {
  assertRange(range);
  return transactions.filter(
    (transaction) =>
      isCounted(transaction) && transaction.day >= range.from && transaction.day <= range.to,
  );
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

interface Totals {
  income: number;
  /** Signed sum; expenses are negative, so this is normally <= 0. */
  expense: number;
  /** Signed sum; refunds are positive. */
  refund: number;
  /** Signed sum; interest charged is negative. */
  interest: number;
  /** Positive magnitude of money leaving accounts. */
  transferOut: number;
  /** Positive magnitude of money entering accounts. */
  transferIn: number;
  adjustment: number;
}

function totalsOf(rows: readonly Transaction[]): Totals {
  const totals: Totals = {
    income: 0,
    expense: 0,
    refund: 0,
    interest: 0,
    transferOut: 0,
    transferIn: 0,
    adjustment: 0,
  };

  for (const transaction of rows) {
    switch (transaction.kind) {
      case 'income':
        totals.income += transaction.amountMinor;
        break;
      case 'expense':
        totals.expense += transaction.amountMinor;
        break;
      case 'refund':
        totals.refund += transaction.amountMinor;
        break;
      case 'interest':
        totals.interest += transaction.amountMinor;
        break;
      case 'adjustment':
        totals.adjustment += transaction.amountMinor;
        break;
      case 'transfer':
        if (transaction.amountMinor < 0) totals.transferOut += -transaction.amountMinor;
        else totals.transferIn += transaction.amountMinor;
        break;
    }
  }

  return totals;
}

/**
 * Rows whose sign contradicts their kind. Posting rules prevent these on write,
 * but a migrated or imported row can still violate them, and silently summing it
 * would hide the problem. Counted so the UI can say "these totals may be wrong".
 */
function signAnomalies(rows: readonly Transaction[]): number {
  let count = 0;
  for (const transaction of rows) {
    if (
      (transaction.kind === 'expense' || transaction.kind === 'interest') &&
      transaction.amountMinor > 0
    ) {
      count += 1;
    } else if (
      (transaction.kind === 'income' || transaction.kind === 'refund') &&
      transaction.amountMinor < 0
    ) {
      count += 1;
    }
  }
  return count;
}

function notesFor(rows: readonly Transaction[]): string[] {
  const anomalies = signAnomalies(rows);
  return anomalies === 0
    ? []
    : [`${anomalies} transaction(s) have a sign that contradicts their kind; totals may be wrong.`];
}

function metric(value: number, inputs: Record<string, number>, rows: readonly Transaction[]): Metric<number> {
  const notes = notesFor(rows);
  const normalised = noNegativeZero(value);
  return notes.length === 0 ? { value: normalised, inputs } : { value: normalised, inputs, notes };
}

function countOf(rows: readonly Transaction[], kind: TransactionKind): number {
  return rows.filter((transaction) => transaction.kind === kind).length;
}

// ---------------------------------------------------------------------------
// Period metrics
// ---------------------------------------------------------------------------

/** Earnings only. Refunds, transfers and adjustments are never income. */
export function income(range: DayRange, transactions: readonly Transaction[]): Metric<number> {
  const rows = countedInRange(transactions, range);
  return metric(totalsOf(rows).income, { rows: countOf(rows, 'income') }, rows);
}

/** Gross spending, as a positive number. Refunds are reported separately. */
export function expenses(range: DayRange, transactions: readonly Transaction[]): Metric<number> {
  const rows = countedInRange(transactions, range);
  return metric(-totalsOf(rows).expense, { rows: countOf(rows, 'expense') }, rows);
}

/** Money returned by merchants, as a positive number. Never income. */
export function refunds(range: DayRange, transactions: readonly Transaction[]): Metric<number> {
  const rows = countedInRange(transactions, range);
  return metric(totalsOf(rows).refund, { rows: countOf(rows, 'refund') }, rows);
}

/** Interest and finance charges, as a positive number. Spending, not a transfer. */
export function interestCharged(
  range: DayRange,
  transactions: readonly Transaction[],
): Metric<number> {
  const rows = countedInRange(transactions, range);
  return metric(-totalsOf(rows).interest, { rows: countOf(rows, 'interest') }, rows);
}

/**
 * What the period actually cost, net of refunds, including interest.
 *
 *   netSpending = expenses - refunds + interest
 *
 * Can be negative in a month where refunds exceed purchases. That is a real
 * outcome and is reported as-is, not clamped to zero.
 */
export function netSpending(range: DayRange, transactions: readonly Transaction[]): Metric<number> {
  const rows = countedInRange(transactions, range);
  const totals = totalsOf(rows);
  return metric(-(totals.expense + totals.refund + totals.interest), { rows: rows.length }, rows);
}

/**
 * The period's net savings: money kept, not money moved.
 *
 *   cashFlow = income + expenses + refunds + interest   (signed)
 *
 * Transfers and adjustments are excluded by construction, so moving ₹50,000
 * between two of your own accounts changes this number by exactly zero.
 */
export function cashFlow(range: DayRange, transactions: readonly Transaction[]): Metric<number> {
  const rows = countedInRange(transactions, range);
  const totals = totalsOf(rows);
  return metric(
    totals.income + totals.expense + totals.refund + totals.interest,
    { rows: rows.length },
    rows,
  );
}

/**
 * `cashFlow / income`, or `null` when there is no income to divide by.
 *
 * `null` renders as "—". Reporting 0% or 100% for a month with no income is a
 * lie, and it is the single most common bug in this metric.
 */
export function savingsRate(
  range: DayRange,
  transactions: readonly Transaction[],
): Metric<number | null> {
  const rows = countedInRange(transactions, range);
  const totals = totalsOf(rows);
  const earned = totals.income;
  const kept = totals.income + totals.expense + totals.refund + totals.interest;
  return {
    value: ratio(kept, earned),
    inputs: { income: earned, kept },
  };
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export interface TransferSummary {
  /** Positive magnitude of money leaving accounts. */
  readonly outflow: number;
  /** Positive magnitude of money entering accounts. */
  readonly inflow: number;
  /** `inflow - outflow`. Zero for balanced transfers. */
  readonly net: number;
  readonly legs: number;
  /**
   * `transferId`s that are not exactly two legs summing to zero.
   *
   * One id appears here for an unmatched leg (money sent to an account the app
   * does not track) — that is legal but worth surfacing. `(missing)` means a row
   * has `kind: 'transfer'` and no `transferId` at all, which is a bug.
   */
  readonly unpairedTransferIds: readonly string[];
}

function transferSummaryOf(rows: readonly Transaction[]): TransferSummary {
  const legs = rows.filter((transaction) => transaction.kind === 'transfer');
  let outflow = 0;
  let inflow = 0;
  const groups = new Map<string, { sum: number; count: number }>();

  for (const leg of legs) {
    if (leg.amountMinor < 0) outflow += -leg.amountMinor;
    else inflow += leg.amountMinor;

    const key = typeof leg.transferId === 'string' && leg.transferId.length > 0 ? leg.transferId : '(missing)';
    const group = groups.get(key) ?? { sum: 0, count: 0 };
    group.sum += leg.amountMinor;
    group.count += 1;
    groups.set(key, group);
  }

  const unpairedTransferIds: string[] = [];
  for (const [id, group] of groups) {
    if (group.count !== 2 || group.sum !== 0) unpairedTransferIds.push(id);
  }

  return {
    outflow,
    inflow,
    net: inflow - outflow,
    legs: legs.length,
    unpairedTransferIds,
  };
}

/** Transfer volume for the period. Never included in income or spending. */
export function transfers(
  range: DayRange,
  transactions: readonly Transaction[],
): Metric<TransferSummary> {
  const rows = countedInRange(transactions, range);
  const summary = transferSummaryOf(rows);
  return {
    value: summary,
    inputs: { legs: summary.legs, outflow: summary.outflow, inflow: summary.inflow },
  };
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

export interface PeriodCounts {
  readonly income: number;
  readonly expenses: number;
  readonly refunds: number;
  readonly interest: number;
  readonly transfers: number;
  readonly adjustments: number;
  readonly total: number;
}

export interface PeriodSummary {
  readonly range: DayRange;
  readonly income: number;
  /** Gross spending, positive. */
  readonly expenses: number;
  /** Refunded amount, positive. */
  readonly refunds: number;
  /** Interest and charges, positive. */
  readonly interest: number;
  readonly netSpending: number;
  /** Net savings for the period: income minus net spending. */
  readonly cashFlow: number;
  readonly savingsRate: number | null;
  readonly transfers: TransferSummary;
  readonly counts: PeriodCounts;
  readonly notes: readonly string[];
}

/**
 * Everything a period screen needs, computed in one pass.
 *
 * `cashFlow` and `income - netSpending` are the same figure by construction;
 * a test pins that, so the two can never drift apart.
 */
export function summarise(
  range: DayRange,
  transactions: readonly Transaction[],
): PeriodSummary {
  const rows = countedInRange(transactions, range);
  const totals = totalsOf(rows);

  const inRange = transactions.filter(
    (transaction) =>
      isLive(transaction) && transaction.day >= range.from && transaction.day <= range.to,
  );
  const pending = inRange.filter((transaction) => transaction.status === 'pending').length;
  const excluded = inRange.filter((transaction) => transaction.status === 'excluded').length;

  const incomeValue = noNegativeZero(totals.income);
  const expensesValue = noNegativeZero(-totals.expense);
  const refundsValue = noNegativeZero(totals.refund);
  const interestValue = noNegativeZero(-totals.interest);
  const netSpendingValue = noNegativeZero(-(totals.expense + totals.refund + totals.interest));
  const cashFlowValue = noNegativeZero(
    totals.income + totals.expense + totals.refund + totals.interest,
  );

  const notes = [...notesFor(rows)];
  if (pending > 0) {
    notes.push(`${pending} pending transaction(s) are included in these totals.`);
  }
  if (excluded > 0) {
    notes.push(
      `${excluded} transaction(s) are excluded from these totals but still affect account balances.`,
    );
  }

  return {
    range,
    income: incomeValue,
    expenses: expensesValue,
    refunds: refundsValue,
    interest: interestValue,
    netSpending: netSpendingValue,
    cashFlow: cashFlowValue,
    savingsRate: ratio(cashFlowValue, incomeValue),
    transfers: transferSummaryOf(rows),
    counts: {
      income: countOf(rows, 'income'),
      expenses: countOf(rows, 'expense'),
      refunds: countOf(rows, 'refund'),
      interest: countOf(rows, 'interest'),
      transfers: countOf(rows, 'transfer'),
      adjustments: countOf(rows, 'adjustment'),
      total: rows.length,
    },
    notes,
  };
}
