/**
 * I9 — Available to spend.
 *
 * One number, four components, and an explanation. The rule that makes this
 * trustworthy is that each obligation is subtracted **once**:
 *
 *   available = liquid balances
 *             + card balances (signed; negative when owed)
 *             − unpaid bills due inside the horizon
 *             − budget headroom, only when the caller asks to reserve it
 *
 * Balances already include `pending` and `excluded` rows (I6), so a pending
 * expense is *not* subtracted again. A bill already paid — linked or not — is
 * not subtracted either, because the payment is a real transaction that already
 * moved the balance.
 *
 * A budget is a cap, not money set aside. Subtracting it by default would
 * double-count spending that has not happened yet, so it is reported and only
 * reserved when `reserveBudgetRemaining` is explicitly true.
 *
 * Pure: accounts, rows and schedules in; a number and its inputs out.
 */

import { balanceOf } from './balances';
import { budgetPeriodRange, budgetSpent, monthKeyOfDay, monthRange } from './budgets';
import type { Budget } from './budgets';
import { addDays } from './dates';
import type { Bill, BillOccurrence, BillPaymentRef, BillSkipRef } from './bills';
import { expectedAmount, upcomingBills } from './bills';
import { isDayKey, noNegativeZero } from './money';
import type { Account, DayRange, Metric, Transaction } from './types';

export interface AvailableToSpendOptions {
  /** The day the question is asked. Required: this function never reads a clock. */
  readonly asOf: string;
  /** How many days of bills count as committed. Defaults to 7. */
  readonly horizonDays?: number;
  /** Budget period to report headroom for. Defaults to the month of `asOf`. */
  readonly period?: DayRange;
  readonly bills?: readonly Bill[];
  readonly billPayments?: readonly BillPaymentRef[];
  readonly billSkips?: readonly BillSkipRef[];
  readonly budgets?: readonly Budget[];
  /** Subtract the overall budget's remaining amount. Defaults to false. */
  readonly reserveBudgetRemaining?: boolean;
  /**
   * Include pending rows. Defaults to true because balances include them; setting
   * this to false adds the pending movement back so only posted money counts.
   */
  readonly includePending?: boolean;
}

export interface AvailableToSpend extends Metric<number> {
  readonly liquidMinor: number;
  /** Signed card balance: negative means owed. */
  readonly cardBalanceMinor: number;
  /** Card debt as a positive display figure. */
  readonly cardOwedMinor: number;
  readonly committedBillsMinor: number;
  /** Overall budget remaining for the period, or 0 when there is no budget. */
  readonly budgetRemainingMinor: number;
  readonly reservedBudgetMinor: number;
  readonly pendingOutflowMinor: number;
  readonly pendingInflowMinor: number;
  readonly excludedMovementMinor: number;
  readonly horizonDays: number;
  readonly period: DayRange;
  /** The bill occurrences that were subtracted. */
  readonly committedOccurrences: readonly BillOccurrence[];
  readonly notes: readonly string[];
}

function assertAsOf(asOf: string): void {
  if (!isDayKey(asOf)) {
    throw new RangeError(`Invalid asOf day ${String(asOf)}: expected local YYYY-MM-DD.`);
  }
}

function isLiquid(account: Account): boolean {
  return account.type === 'bank' || account.type === 'cash' || account.type === 'wallet';
}

function isCard(account: Account): boolean {
  return account.type === 'credit_card';
}

export function availableToSpend(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  options: AvailableToSpendOptions,
): AvailableToSpend {
  assertAsOf(options.asOf);
  const horizonDays = options.horizonDays ?? 7;
  if (!Number.isSafeInteger(horizonDays) || horizonDays < 0) {
    throw new RangeError('horizonDays must be a whole number of days, zero or more.');
  }

  const period =
    options.period ?? monthRange(monthKeyOfDay(options.asOf));

  const included = accounts.filter((account) => account.archived !== true);
  const liquidAccounts = included.filter(isLiquid);
  const cardAccounts = included.filter(isCard);

  let liquidMinor = 0;
  for (const account of liquidAccounts) {
    liquidMinor += balanceOf(account, transactions, options.asOf).value;
  }

  let cardBalanceMinor = 0;
  for (const account of cardAccounts) {
    cardBalanceMinor += balanceOf(account, transactions, options.asOf).value;
  }
  const cardOwedMinor = cardBalanceMinor < 0 ? -cardBalanceMinor : 0;

  const includedIds = new Set(included.map((account) => account.id));
  let pendingOutflowMinor = 0;
  let pendingInflowMinor = 0;
  let pendingSignedMinor = 0;
  let excludedMovementMinor = 0;
  let pendingCount = 0;
  let excludedCount = 0;

  for (const transaction of transactions) {
    if (transaction.deletedAt != null) continue;
    if (!includedIds.has(transaction.accountId)) continue;
    // Only rows that have already happened can affect today's balance.
    if (transaction.day > options.asOf) continue;

    if (transaction.status === 'pending') {
      pendingCount += 1;
      pendingSignedMinor += transaction.amountMinor;
      if (transaction.amountMinor < 0) pendingOutflowMinor += -transaction.amountMinor;
      else pendingInflowMinor += transaction.amountMinor;
    } else if (transaction.status === 'excluded') {
      excludedCount += 1;
      excludedMovementMinor += transaction.amountMinor;
    }
  }

  // Balances include pending rows. If the caller wants posted money only, undo
  // the pending movement instead of subtracting it a second time.
  const includePending = options.includePending !== false;
  const pendingAdjustmentMinor = includePending ? 0 : -pendingSignedMinor;

  const billList = options.bills ?? [];
  const billById = new Map(billList.map((bill) => [bill.id, bill]));
  const horizonEnd = addDays(options.asOf, horizonDays);

  // Start from the first unpaid occurrence, so overdue bills are included even
  // though their due day is in the past.
  const committedOccurrences = upcomingBills(billList, {
    from: '1000-01-01',
    to: horizonEnd,
    asOf: options.asOf,
    payments: options.billPayments ?? [],
    skips: options.billSkips ?? [],
  });

  let committedBillsMinor = 0;
  for (const occurrence of committedOccurrences) {
    const bill = billById.get(occurrence.billId);
    committedBillsMinor += bill ? expectedAmount(bill) : occurrence.expectedMinor;
  }

  const budgetList = options.budgets ?? [];
  const overall = budgetList.find((budget) => {
    if (budget.categoryId !== null) return false;
    const range = budgetPeriodRange(budget.period);
    return range.from === period.from && range.to === period.to;
  });

  const budgetRemainingMinor = overall
    ? noNegativeZero(
        Math.max(0, overall.amountMinor - budgetSpent(period, transactions, null).value),
      )
    : 0;
  const reservedBudgetMinor =
    options.reserveBudgetRemaining === true ? budgetRemainingMinor : 0;

  const value = noNegativeZero(
    liquidMinor +
      cardBalanceMinor -
      committedBillsMinor -
      reservedBudgetMinor +
      pendingAdjustmentMinor,
  );

  const notes: string[] = [
    `Bills due within ${horizonDays} day(s) and anything overdue are subtracted.`,
  ];
  if (cardAccounts.length > 0) {
    notes.push('Card balances are liabilities: a negative balance reduces what is available.');
  }
  if (pendingCount > 0) {
    notes.push(
      includePending
        ? `${pendingCount} pending transaction(s) already affect balances and are not subtracted twice.`
        : `${pendingCount} pending transaction(s) were added back; only posted money counts.`,
    );
  }
  if (excludedCount > 0) {
    notes.push(
      `${excludedCount} excluded transaction(s) still moved money, so they affect balances but not analytics.`,
    );
  }
  if (billList.some((bill) => bill.variableAmount === true)) {
    notes.push('Variable bills use the last paid amount when one exists; the next bill may differ.');
  }
  if (overall) {
    notes.push(
      options.reserveBudgetRemaining === true
        ? 'The overall budget headroom is reserved in this figure.'
        : 'The overall budget headroom is reported but not reserved; a budget is a cap, not money set aside.',
    );
    if (budgetList.some((budget) => budget.categoryId !== null)) {
      notes.push('Category budgets are not subtracted separately; that would count the same money twice.');
    }
  } else {
    notes.push('No overall budget exists for this period, so no budget headroom is included.');
  }

  return {
    value,
    liquidMinor: noNegativeZero(liquidMinor),
    cardBalanceMinor: noNegativeZero(cardBalanceMinor),
    cardOwedMinor: noNegativeZero(cardOwedMinor),
    committedBillsMinor: noNegativeZero(committedBillsMinor),
    budgetRemainingMinor,
    reservedBudgetMinor,
    pendingOutflowMinor: noNegativeZero(pendingOutflowMinor),
    pendingInflowMinor: noNegativeZero(pendingInflowMinor),
    excludedMovementMinor: noNegativeZero(excludedMovementMinor),
    horizonDays,
    period,
    committedOccurrences,
    inputs: {
      liquid: liquidMinor,
      card: cardBalanceMinor,
      bills: committedBillsMinor,
      reservedBudget: reservedBudgetMinor,
      pendingAdjustment: pendingAdjustmentMinor,
      liquidAccounts: liquidAccounts.length,
      cardAccounts: cardAccounts.length,
      billOccurrences: committedOccurrences.length,
    },
    notes,
  };
}

/**
 * The component breakdown a tap-to-explain sheet shows. It sums exactly to the
 * value, which a test pins so the explanation can never drift from the number.
 */
export function availableBreakdown(result: AvailableToSpend): ReadonlyArray<{
  readonly label: string;
  readonly amountMinor: number;
}> {
  const rows = [
    { label: 'Liquid balances', amountMinor: result.liquidMinor },
    { label: 'Card balances', amountMinor: result.cardBalanceMinor },
    { label: 'Bills due', amountMinor: -result.committedBillsMinor },
  ];
  if (result.reservedBudgetMinor !== 0) {
    rows.push({ label: 'Reserved budget', amountMinor: -result.reservedBudgetMinor });
  }
  if (result.inputs.pendingAdjustment !== 0) {
    rows.push({ label: 'Pending adjustment', amountMinor: result.inputs.pendingAdjustment });
  }
  return rows;
}
