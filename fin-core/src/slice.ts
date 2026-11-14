/**
 * I13 — Slice Lens (pure).
 *
 * Slice is a *view* over the central ledger, never a second database. A row
 * belongs to the Slice lens when its `source` starts with `slice` (e.g.
 * `slice_statement`, `slice_notification`). The same row is also in the
 * overall history, expenses, budgets and cash flow — exactly once.
 *
 * No Slice API is assumed to exist. The provenance fields on a row (`sourceRef`
 * for the UTR, `importMethod`, `importedAt`) are what a future statement
 * parser or notification capture would populate.
 */

import { summarise } from './calc';
import { categoryBreakdown } from './analytics';
import type { DayRange, Transaction } from './types';

export const SLICE_SOURCES = ['slice', 'slice_statement', 'slice_notification'] as const;

export function isSliceSource(source: string | null | undefined): boolean {
  if (typeof source !== 'string' || source.length === 0) return false;
  return source === 'slice' || source.startsWith('slice_') || source.startsWith('slice-');
}

export function sliceTransactions(transactions: readonly Transaction[]): Transaction[] {
  return transactions.filter((transaction) => isSliceSource(transaction.source));
}

export interface SliceSummary {
  readonly range: DayRange;
  readonly income: number;
  readonly expenses: number;
  readonly refunds: number;
  readonly netSpending: number;
  readonly cashFlow: number;
  readonly transfers: number;
  readonly outgoing: number;
  readonly incoming: number;
  readonly count: number;
  readonly outgoingCount: number;
  readonly incomingCount: number;
}

export function sliceSummary(
  transactions: readonly Transaction[],
  range: DayRange,
): SliceSummary {
  const sliceRows = sliceTransactions(transactions).filter(
    (transaction) => transaction.day >= range.from && transaction.day <= range.to,
  );
  const summary = summarise(range, sliceRows);

  let outgoing = 0;
  let incoming = 0;
  let outgoingCount = 0;
  let incomingCount = 0;
  for (const transaction of sliceRows) {
    if (transaction.kind === 'transfer') continue;
    if (transaction.amountMinor < 0) {
      outgoing += -transaction.amountMinor;
      outgoingCount += 1;
    } else {
      incoming += transaction.amountMinor;
      incomingCount += 1;
    }
  }

  return {
    range,
    income: summary.income,
    expenses: summary.expenses,
    refunds: summary.refunds,
    netSpending: summary.netSpending,
    cashFlow: summary.cashFlow,
    transfers: summary.transfers.legs,
    outgoing,
    incoming,
    count: sliceRows.length,
    outgoingCount,
    incomingCount,
  };
}

export function sliceCategoryBreakdown(
  transactions: readonly Transaction[],
  range: DayRange,
) {
  const sliceRows = sliceTransactions(transactions).filter(
    (transaction) => transaction.day >= range.from && transaction.day <= range.to,
  );
  return categoryBreakdown(sliceRows, range);
}

export function sliceOutgoing(
  transactions: readonly Transaction[],
  range: DayRange,
): Transaction[] {
  return sliceTransactions(transactions).filter(
    (transaction) => transaction.day >= range.from && transaction.day <= range.to && transaction.amountMinor < 0,
  );
}

export function sliceIncoming(
  transactions: readonly Transaction[],
  range: DayRange,
): Transaction[] {
  return sliceTransactions(transactions).filter(
    (transaction) => transaction.day >= range.from && transaction.day <= range.to && transaction.amountMinor > 0,
  );
}
