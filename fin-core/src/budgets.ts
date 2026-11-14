/**
 * I7 — Budgets as records (pure model).
 *
 * The shipped app stored budgets as a mutable goal target: `setBudget` either
 * updated the existing goal's `target` or deleted the goal when the amount was
 * cleared. That makes history impossible — editing December's budget silently
 * rewrites November's.
 *
 * A budget is therefore a *record* for a period, not a setting:
 *
 *   { categoryId: null | '<category>', amountMinor, period }
 *
 * `null` means the overall budget; a category id means that category only.
 * Periods are either a calendar month or an explicit custom range. Nothing here
 * deletes or rewrites another period's record.
 *
 * Spending is net of refunds, because a refund is money returned, not income:
 *
 *   spent = expenses - refunds + interest
 *
 * Refunds are attributed to the category of the expense they reverse, falling
 * back to the refund's own category, so a category budget is not inflated by a
 * refund that was filed without a category.
 *
 * Pure and deterministic: rows in, numbers out.
 */

import { isDayKey, noNegativeZero, ratio } from './money';
import { assertRange, countedInRange, isCounted } from './calc';
import type { DayRange, Metric, Transaction } from './types';

export type BudgetPeriod =
  | { readonly kind: 'month'; /** Local `YYYY-MM`. */ readonly month: string }
  | { readonly kind: 'custom'; readonly from: string; readonly to: string };

export interface Budget {
  readonly id: string;
  /** `null` is the overall budget; otherwise a `fin_categories.id`. */
  readonly categoryId: string | null;
  /** Positive minor units (paise). */
  readonly amountMinor: number;
  readonly period: BudgetPeriod;
  readonly createdAt?: number;
  readonly updatedAt?: number;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && MONTH_PATTERN.test(value);
}

/** `2026-11-05` → `2026-11`. Throws on a malformed day. */
export function monthKeyOfDay(day: string): string {
  if (!isDayKey(day)) {
    throw new RangeError(`Invalid day ${day}: expected local YYYY-MM-DD.`);
  }
  return day.slice(0, 7);
}

/** The local month containing `date`, as `YYYY-MM`. */
export function monthKeyOf(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Inclusive day range for a calendar month, respecting leap years. */
export function monthRange(month: string): DayRange {
  if (!isMonthKey(month)) {
    throw new RangeError(`Invalid month ${String(month)}: expected YYYY-MM.`);
  }
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** Inclusive day range for any budget period. */
export function budgetPeriodRange(period: BudgetPeriod): DayRange {
  if (period.kind === 'month') return monthRange(period.month);
  assertRange({ from: period.from, to: period.to });
  return { from: period.from, to: period.to };
}

/** True when two periods share at least one day. */
export function periodsOverlap(first: BudgetPeriod, second: BudgetPeriod): boolean {
  const a = budgetPeriodRange(first);
  const b = budgetPeriodRange(second);
  return a.from <= b.to && b.from <= a.to;
}

// ---------------------------------------------------------------------------
// Spending
// ---------------------------------------------------------------------------

function effectiveCategory(
  transaction: Transaction,
  byId: ReadonlyMap<string, Transaction>,
): string | null {
  if (transaction.categoryId != null) return transaction.categoryId;
  if (transaction.kind === 'refund' && transaction.refundOfId != null) {
    return byId.get(transaction.refundOfId)?.categoryId ?? null;
  }
  return null;
}

function categoryMatches(
  transaction: Transaction,
  categoryId: string | null,
  byId: ReadonlyMap<string, Transaction>,
): boolean {
  if (categoryId === null) return true;
  return effectiveCategory(transaction, byId) === categoryId;
}

export interface BudgetSpend {
  /** Gross expenses, positive. */
  readonly expenseMinor: number;
  /** Refunds, positive; subtracted from spending. */
  readonly refundMinor: number;
  /** Interest and charges, positive; spending for an overall budget. */
  readonly interestMinor: number;
  /** `expenseMinor - refundMinor + interestMinor`. May be negative. */
  readonly spentMinor: number;
  readonly counts: {
    readonly expenses: number;
    readonly refunds: number;
    readonly interest: number;
  };
}

/**
 * What a budget has consumed in its period.
 *
 * Transfers and adjustments are excluded by construction: moving money between
 * your own accounts is not spending, and reconciliation is not a purchase.
 * `excluded` rows are skipped; `pending` rows count, matching I6.
 */
export function budgetSpend(
  range: DayRange,
  transactions: readonly Transaction[],
  categoryId: string | null,
): Metric<BudgetSpend> {
  const rows = countedInRange(transactions, range);
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));

  let expenseMinor = 0;
  let refundMinor = 0;
  let interestMinor = 0;
  let expenses = 0;
  let refunds = 0;
  let interest = 0;

  for (const transaction of rows) {
    if (!categoryMatches(transaction, categoryId, byId)) continue;

    switch (transaction.kind) {
      case 'expense':
        expenseMinor += -transaction.amountMinor;
        expenses += 1;
        break;
      case 'refund':
        refundMinor += transaction.amountMinor;
        refunds += 1;
        break;
      case 'interest':
        interestMinor += -transaction.amountMinor;
        interest += 1;
        break;
      default:
        break;
    }
  }

  const spentMinor = noNegativeZero(expenseMinor - refundMinor + interestMinor);

  return {
    value: {
      expenseMinor: noNegativeZero(expenseMinor),
      refundMinor: noNegativeZero(refundMinor),
      interestMinor: noNegativeZero(interestMinor),
      spentMinor,
      counts: { expenses, refunds, interest },
    },
    inputs: {
      expense: expenseMinor,
      refund: refundMinor,
      interest: interestMinor,
      rows: rows.length,
    },
  };
}

/** Convenience: just the net spending figure, positive when money was spent. */
export function budgetSpent(
  range: DayRange,
  transactions: readonly Transaction[],
  categoryId: string | null = null,
): Metric<number> {
  const spend = budgetSpend(range, transactions, categoryId);
  return {
    value: spend.value.spentMinor,
    inputs: spend.inputs,
    ...(spend.notes === undefined ? {} : { notes: spend.notes }),
  };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type BudgetStatus = 'under' | 'at' | 'over';

export interface BudgetProgress {
  readonly budgetId: string;
  readonly categoryId: string | null;
  readonly range: DayRange;
  readonly amountMinor: number;
  readonly spentMinor: number;
  /** `amountMinor - spentMinor`; negative when exceeded. */
  readonly remainingMinor: number;
  /** `max(0, spentMinor - amountMinor)`. */
  readonly exceededMinor: number;
  /** `spentMinor / amountMinor`, or `null` when the budget is zero. */
  readonly percentUsed: number | null;
  readonly status: BudgetStatus;
  readonly spend: BudgetSpend;
  readonly notes: readonly string[];
}

export function budgetProgress(
  budget: Budget,
  transactions: readonly Transaction[],
): BudgetProgress {
  const range = budgetPeriodRange(budget.period);
  const spend = budgetSpend(range, transactions, budget.categoryId);
  const spentMinor = spend.value.spentMinor;
  const remainingMinor = noNegativeZero(budget.amountMinor - spentMinor);
  const exceededMinor = noNegativeZero(Math.max(0, spentMinor - budget.amountMinor));

  const status: BudgetStatus =
    spentMinor > budget.amountMinor
      ? 'over'
      : spentMinor === budget.amountMinor
        ? 'at'
        : 'under';

  const notes: string[] = [];
  if (spend.value.refundMinor > 0) {
    notes.push(
      `Refunds of ${spend.value.refundMinor} paise reduced spending in this period.`,
    );
  }
  if (spentMinor < 0) {
    notes.push('Refunds exceed spending in this period, so spending is negative.');
  }

  return {
    budgetId: budget.id,
    categoryId: budget.categoryId,
    range,
    amountMinor: budget.amountMinor,
    spentMinor,
    remainingMinor,
    exceededMinor,
    percentUsed: budget.amountMinor > 0 ? ratio(spentMinor, budget.amountMinor) : null,
    status,
    spend: spend.value,
    notes,
  };
}

/** Progress for every budget, in the order given. */
export function summariseBudgets(
  budgets: readonly Budget[],
  transactions: readonly Transaction[],
): BudgetProgress[] {
  return budgets.map((budget) => budgetProgress(budget, transactions));
}

/** The overall budget for a period, if one exists. */
export function overallBudget(
  budgets: readonly Budget[],
  period: BudgetPeriod,
): Budget | undefined {
  return budgets.find(
    (budget) =>
      budget.categoryId === null &&
      (budget.period.kind === 'month' && period.kind === 'month'
        ? budget.period.month === period.month
        : budget.period.kind === 'custom' &&
          period.kind === 'custom' &&
          budget.period.from === period.from &&
          budget.period.to === period.to),
  );
}

/** Category budgets for a period. */
export function categoryBudgets(
  budgets: readonly Budget[],
  period: BudgetPeriod,
): Budget[] {
  return budgets.filter(
    (budget) =>
      budget.categoryId !== null &&
      (budget.period.kind === 'month' && period.kind === 'month'
        ? budget.period.month === period.month
        : budget.period.kind === 'custom' &&
          period.kind === 'custom' &&
          budget.period.from === period.from &&
          budget.period.to === period.to),
  );
}

/** A row that counts in a budget but is not an expense or refund (for notes). */
export function isBudgetNeutral(transaction: Transaction): boolean {
  return (
    isCounted(transaction) &&
    transaction.kind !== 'expense' &&
    transaction.kind !== 'refund' &&
    transaction.kind !== 'interest'
  );
}
