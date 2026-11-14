/**
 * I11 — Analytics (pure).
 *
 * Every figure here is a recombination of I6/I7/I8/I9/I10 primitives, so a
 * screen never has to build SQL. Transfers and adjustments are excluded from
 * income and spending by construction (I6), and refunds net out of spending.
 *
 * Nothing here reads a clock. Periods, accounts and previous-period comparisons
 * are all explicit inputs, so the same call always returns the same number.
 */

import { countedInRange, expenses, income, netSpending, refunds } from './calc';
import { budgetProgress, budgetPeriodRange } from './budgets';
import type { Budget, BudgetProgress } from './budgets';
import { addDays, daysBetween } from './dates';
import type { Bill, BillOccurrence } from './bills';
import { upcomingBills } from './bills';
import type { BillPaymentRef, BillSkipRef } from './bills';
import type { Account, DayRange, Transaction } from './types';

export interface TimeBucket {
  readonly key: string;
  readonly from: string;
  readonly to: string;
  readonly income: number;
  readonly expenses: number;
  readonly refunds: number;
  readonly netSpending: number;
  readonly cashFlow: number;
  readonly transfers: number;
  readonly rows: number;
}

function bucketKey(day: string, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'day') return day;
  if (granularity === 'month') return day.slice(0, 7);
  // week: ISO-ish week anchored to the range start is computed by the caller;
  // here we return the day's Monday-ish key as a fallback.
  return day;
}

/**
 * Cash flow grouped into buckets.
 *
 * `granularity: 'week'` produces 7-day buckets aligned to `range.from`, so the
 * first bucket always starts on the range's first day instead of an arbitrary
 * Monday. This keeps the sum of buckets equal to the period total.
 */
export function cashFlowSeries(
  transactions: readonly Transaction[],
  range: DayRange,
  granularity: 'day' | 'week' | 'month' = 'month',
): TimeBucket[] {
  const buckets = new Map<string, {
    key: string; from: string; to: string;
    income: number; expenses: number; refunds: number; netSpending: number;
    cashFlow: number; transfers: number; rows: number; _from: string; _to: string;
  }>();

  const ensure = (key: string, from: string, to: string): {
    key: string; from: string; to: string;
    income: number; expenses: number; refunds: number; netSpending: number;
    cashFlow: number; transfers: number; rows: number; _from: string; _to: string;
  } => {
    const existing = buckets.get(key);
    if (existing) return existing;
    const created = {
      key,
      from,
      to,
      income: 0,
      expenses: 0,
      refunds: 0,
      netSpending: 0,
      cashFlow: 0,
      transfers: 0,
      rows: 0,
      _from: from,
      _to: to,
    };
    buckets.set(key, created);
    return created;
  };

  const rows = countedInRange(transactions, range);

  for (const transaction of rows) {
    let key: string;
    let from: string;
    let to: string;

    if (granularity === 'day') {
      key = transaction.day;
      from = transaction.day;
      to = transaction.day;
    } else if (granularity === 'month') {
      key = transaction.day.slice(0, 7);
      from = `${key}-01`;
      // to is filled in after; clamp to range end below
      to = from;
    } else {
      const offset = daysBetween(range.from, transaction.day);
      const weekIndex = Math.floor(offset / 7);
      const weekStart = addDays(range.from, weekIndex * 7);
      const weekEndCandidate = addDays(weekStart, 6);
      const weekEnd = weekEndCandidate > range.to ? range.to : weekEndCandidate;
      key = `${weekStart}`;
      from = weekStart;
      to = weekEnd;
    }

    const bucket = ensure(key, from, to);

    switch (transaction.kind) {
      case 'income':
        bucket.income += transaction.amountMinor;
        break;
      case 'expense':
        bucket.expenses += -transaction.amountMinor;
        break;
      case 'refund':
        bucket.refunds += transaction.amountMinor;
        break;
      case 'interest':
        bucket.expenses += -transaction.amountMinor;
        break;
      case 'transfer':
        if (transaction.amountMinor < 0) bucket.transfers += -transaction.amountMinor;
        break;
      default:
        break;
    }
    bucket.rows += 1;
  }

  // Fill month bucket boundaries and clamp every bucket to the range.
  const result: TimeBucket[] = [];
  for (const bucket of buckets.values()) {
    let from = bucket._from;
    let to = bucket._to;
    if (granularity === 'month') {
      const month = bucket.key;
      const year = Number(month.slice(0, 4));
      const monthNumber = Number(month.slice(5, 7));
      const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      from = `${month}-01`;
      to = `${month}-${String(last).padStart(2, '0')}`;
    }
    if (from < range.from) from = range.from;
    if (to > range.to) to = range.to;

    const netSpending = bucket.expenses - bucket.refunds;
    const cashFlow = bucket.income - netSpending;
    result.push({
      key: bucket.key,
      from,
      to,
      income: bucket.income,
      expenses: bucket.expenses,
      refunds: bucket.refunds,
      netSpending,
      cashFlow,
      transfers: bucket.transfers,
      rows: bucket.rows,
    });
  }

  result.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return result;
}

export interface CategoryBreakdownRow {
  readonly categoryId: string | null;
  readonly amountMinor: number;
  readonly refundMinor: number;
  readonly interestMinor: number;
  readonly netMinor: number;
  readonly count: number;
  readonly percent: number | null;
}

/**
 * Spending by category, refund-adjusted and sorted largest first.
 *
 * An uncategorised refund is attributed to the category of the expense it
 * reverses, matching I7, so a category is not inflated by a refund that was
 * filed without a category.
 */
export function categoryBreakdown(
  transactions: readonly Transaction[],
  range: DayRange,
): CategoryBreakdownRow[] {
  const rows = countedInRange(transactions, range);
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));

  const effectiveCategoryOf = (transaction: Transaction): string | null => {
    if (transaction.categoryId != null) return transaction.categoryId;
    if (transaction.kind === 'refund' && transaction.refundOfId != null) {
      return byId.get(transaction.refundOfId)?.categoryId ?? null;
    }
    return null;
  };

  const groups = new Map<string | null, { expense: number; refund: number; interest: number; count: number }>();

  for (const transaction of rows) {
    const categoryId = effectiveCategoryOf(transaction);
    const group = groups.get(categoryId) ?? { expense: 0, refund: 0, interest: 0, count: 0 };

    switch (transaction.kind) {
      case 'expense':
        group.expense += -transaction.amountMinor;
        group.count += 1;
        break;
      case 'refund':
        group.refund += transaction.amountMinor;
        group.count += 1;
        break;
      case 'interest':
        group.interest += -transaction.amountMinor;
        group.count += 1;
        break;
      default:
        break;
    }
    groups.set(categoryId, group);
  }

  const totalNet = [...groups.values()].reduce(
    (total, group) => total + (group.expense - group.refund + group.interest),
    0,
  );

  return [...groups.entries()]
    .map(([categoryId, group]) => {
      const netMinor = group.expense - group.refund + group.interest;
      return {
        categoryId,
        amountMinor: group.expense,
        refundMinor: group.refund,
        interestMinor: group.interest,
        netMinor,
        count: group.count,
        percent: totalNet > 0 ? netMinor / totalNet : null,
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.netMinor - a.netMinor);
}

export interface BudgetVsActualRow {
  readonly budget: Budget;
  readonly progress: BudgetProgress;
}

export function budgetVsActual(
  budgets: readonly Budget[],
  transactions: readonly Transaction[],
  period: DayRange,
): BudgetVsActualRow[] {
  // Keep only budgets whose period overlaps the requested range.
  const relevant = budgets.filter((budget) => {
    const range = budgetPeriodRange(budget.period);
    return range.from <= period.to && range.to >= period.from;
  });
  return relevant.map((budget) => ({
    budget,
    progress: budgetProgress(budget, transactions),
  }));
}

export interface SavingsSummary {
  readonly income: number;
  readonly netSpending: number;
  readonly cashFlow: number;
  readonly savingsRate: number | null;
  readonly previousCashFlow: number | null;
  readonly cashFlowChange: number | null;
}

export function savingsSummary(
  transactions: readonly Transaction[],
  range: DayRange,
  previousRange?: DayRange,
): SavingsSummary {
  const current = netSpending(range, transactions);
  const earned = income(range, transactions);
  const cf = earned.value - current.value;
  const rate = earned.value > 0 ? cf / earned.value : null;

  let previousCashFlow: number | null = null;
  let cashFlowChange: number | null = null;
  if (previousRange) {
    const prevEarned = income(previousRange, transactions).value;
    const prevSpending = netSpending(previousRange, transactions).value;
    previousCashFlow = prevEarned - prevSpending;
    cashFlowChange = cf - previousCashFlow;
  }

  return {
    income: earned.value,
    netSpending: current.value,
    cashFlow: cf,
    savingsRate: rate,
    previousCashFlow,
    cashFlowChange,
  };
}

export interface Insight {
  readonly id: string;
  readonly kind: 'bills-due' | 'category-spike' | 'savings-up' | 'budget-over' | 'budget-under';
  readonly severity: 'attention' | 'positive' | 'neutral';
  readonly title: string;
  readonly detail: string;
  readonly action?: string;
  readonly valueMinor?: number;
}

const MAX_INSIGHTS = 3;

function previousPeriod(range: DayRange): DayRange {
  const length = daysBetween(range.from, range.to);
  const from = addDays(range.from, -(length + 1));
  const to = addDays(range.from, -1);
  return { from, to };
}

/**
 * A small number of useful insights, never more than three. Each one is only
 * emitted when the underlying data supports it, and none of them use shaming
 * language.
 */
export function insights(
  transactions: readonly Transaction[],
  range: DayRange,
  options: {
    readonly bills?: readonly Bill[];
    readonly billPayments?: readonly BillPaymentRef[];
    readonly billSkips?: readonly BillSkipRef[];
    readonly budgets?: readonly Budget[];
    readonly asOf?: string;
  } = {},
): Insight[] {
  const result: Insight[] = [];
  const asOf = options.asOf ?? range.to;

  // Bills due soon.
  if (options.bills && options.bills.length > 0) {
    const horizon = addDays(asOf, 7);
    const due = upcomingBills(options.bills, {
      from: asOf,
      to: horizon,
      asOf,
      payments: options.billPayments ?? [],
      skips: options.billSkips ?? [],
    });
    if (due.length > 0) {
      const total = due.reduce((sum, occurrence) => sum + occurrence.expectedMinor, 0);
      result.push({
        id: 'bills-due',
        kind: 'bills-due',
        severity: 'attention',
        title: `${due.length} bill${due.length === 1 ? '' : 's'} due in the next 7 days`,
        detail: `Expected payments total ${total} paise.`,
        action: 'Review upcoming bills',
        valueMinor: total,
      });
    }
  }

  // Budget exceeded.
  if (options.budgets && options.budgets.length > 0) {
    const over = options.budgets
      .map((budget) => budgetProgress(budget, transactions))
      .filter((progress) => progress.status === 'over');
    if (over.length > 0) {
      result.push({
        id: 'budget-over',
        kind: 'budget-over',
        severity: 'attention',
        title: `${over.length} budget${over.length === 1 ? '' : 's'} exceeded this period`,
        detail: 'Spending is above the limit in at least one category.',
        action: 'Review budget progress',
      });
    }
  }

  // Category spike vs previous period.
  const prevRange = previousPeriod(range);
  const currentBreakdown = categoryBreakdown(transactions, range);
  const previousBreakdown = categoryBreakdown(transactions, prevRange);
  const previousById = new Map(previousBreakdown.map((row) => [row.categoryId, row]));

  let biggestSpike: { categoryId: string | null; percent: number; amount: number } | null = null;
  for (const row of currentBreakdown) {
    const previous = previousById.get(row.categoryId);
    if (!previous || previous.netMinor <= 0 || row.netMinor <= 0) continue;
    const change = (row.netMinor - previous.netMinor) / previous.netMinor;
    if (change >= 0.15 && row.netMinor >= 10000) {
      if (!biggestSpike || change > biggestSpike.percent) {
        biggestSpike = { categoryId: row.categoryId, percent: change, amount: row.netMinor };
      }
    }
  }
  if (biggestSpike) {
    const label = biggestSpike.categoryId ?? 'uncategorised';
    result.push({
      id: 'category-spike',
      kind: 'category-spike',
      severity: 'attention',
      title: `${label} spending is ${Math.round(biggestSpike.percent * 100)}% higher than last period`,
      detail: `Net spending reached ${biggestSpike.amount} paise.`,
      action: 'Drill into the category',
      valueMinor: biggestSpike.amount,
    });
  }

  // Savings up.
  const summary = savingsSummary(transactions, range, prevRange);
  if (summary.cashFlowChange !== null && summary.cashFlowChange > 0 && summary.previousCashFlow !== null) {
    result.push({
      id: 'savings-up',
      kind: 'savings-up',
      severity: 'positive',
      title: `Savings up by ${summary.cashFlowChange} paise`,
      detail: 'Cash flow improved compared with the previous period.',
      action: 'Keep the trend going',
      valueMinor: summary.cashFlowChange,
    });
  }

  // A budget comfortably under is positive reinforcement, not a failure state.
  if (options.budgets && options.budgets.length > 0) {
    const under = options.budgets
      .map((budget) => budgetProgress(budget, transactions))
      .filter((progress) => progress.status === 'under' && progress.percentUsed !== null && progress.percentUsed < 0.8);
    if (under.length > 0 && result.length < MAX_INSIGHTS) {
      result.push({
        id: 'budget-under',
        kind: 'budget-under',
        severity: 'positive',
        title: `${under.length} budget${under.length === 1 ? '' : 's'} on track`,
        detail: 'Spending is comfortably within the limit.',
        action: 'No action needed',
      });
    }
  }

  return result.slice(0, MAX_INSIGHTS);
}
