/**
 * I10 — Net worth and snapshots (pure model).
 *
 * Net worth is one sum, not an asset/liability split:
 *
 *   netWorth = Σ balance(account)
 *
 * Liabilities are accounts whose balance is negative, so a card or loan reduces
 * the total automatically. Transfers net to zero across the two accounts they
 * touch, so moving money never changes net worth. Assets are counted once
 * because each account contributes exactly one balance.
 *
 * A snapshot is a *stored* observation. It is never recomputed, so a back-dated
 * transaction cannot rewrite last month's history.
 */

import { balanceOf, liquidBalance } from './balances';
import { noNegativeZero, ratio } from './money';
import type { Account, AccountType, Metric, Transaction } from './types';

export interface SnapshotAccount {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly balanceMinor: number;
}

export interface NetWorthSnapshot {
  readonly id: string;
  /** `month` for a calendar month, `day` for an ad-hoc daily observation. */
  readonly periodKind: string;
  readonly periodKey: string;
  /** Inclusive day the balances were measured at. */
  readonly asOfDay: string;
  readonly netWorthMinor: number;
  readonly assetsMinor: number;
  readonly liabilitiesMinor: number;
  /** Liquid accounts plus cards, signed. */
  readonly liquidMinor: number;
  readonly accounts: readonly SnapshotAccount[];
  readonly createdAt: number;
  readonly updatedAt?: number;
}

export interface AccountBalanceLine extends SnapshotAccount {
  readonly included: boolean;
  readonly archived: boolean;
  readonly manual: boolean;
}

export interface NetWorthBreakdown extends Metric<number> {
  /** Positive display figures. `assetsMinor - liabilitiesMinor === value`. */
  readonly assetsMinor: number;
  readonly liabilitiesMinor: number;
  /** Bank + cash + wallet + card, signed. */
  readonly liquidMinor: number;
  readonly cardOwedMinor: number;
  readonly investedMinor: number;
  /** Loan principal outstanding, as a positive figure. */
  readonly loanMinor: number;
  readonly accounts: readonly AccountBalanceLine[];
}

function assertAsOf(asOf: string | undefined): void {
  if (asOf !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new RangeError(`Invalid asOf day ${String(asOf)}: expected local YYYY-MM-DD.`);
  }
}

/** A full, explainable net-worth observation. */
export function netWorthBreakdown(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf?: string,
): NetWorthBreakdown {
  assertAsOf(asOf);

  const lines: AccountBalanceLine[] = [];
  let assets = 0;
  let liabilities = 0;
  let liquid = 0;
  let cards = 0;
  let invested = 0;
  let loans = 0;
  let includedCount = 0;
  let excludedCount = 0;
  let archivedCount = 0;
  let manualCount = 0;

  for (const account of accounts) {
    const balance = balanceOf(account, transactions, asOf).value;
    const included = account.archived !== true && account.includeInNetWorth !== false;
    const manual = account.balanceMode === 'manual';

    if (account.archived === true) archivedCount += 1;
    if (!included) excludedCount += 1;
    if (manual) manualCount += 1;

    if (included) {
      includedCount += 1;
      if (balance >= 0) assets += balance;
      else liabilities += -balance;

      if (
        account.type === 'bank' ||
        account.type === 'cash' ||
        account.type === 'wallet' ||
        account.type === 'credit_card'
      ) {
        liquid += balance;
      }
      if (account.type === 'credit_card' && balance < 0) cards += -balance;
      if (account.type === 'investment' || account.type === 'asset') invested += balance;
      if (account.type === 'loan' && balance < 0) loans += -balance;
    }

    lines.push({
      id: account.id,
      name: account.name,
      type: account.type,
      balanceMinor: balance,
      included,
      archived: account.archived === true,
      manual,
    });
  }

  const notes: string[] = [];
  if (excludedCount > 0) {
    notes.push(
      `${excludedCount} account(s) are archived or excluded from net worth by choice.`,
    );
  }
  if (manualCount > 0) {
    notes.push('Manual balances are used as typed and do not change with transactions.');
  }
  if (accounts.length === 0) {
    notes.push('No accounts exist yet, so net worth is zero rather than unknown.');
  }

  return {
    value: noNegativeZero(assets - liabilities),
    assetsMinor: noNegativeZero(assets),
    liabilitiesMinor: noNegativeZero(liabilities),
    liquidMinor: noNegativeZero(liquid),
    cardOwedMinor: noNegativeZero(cards),
    investedMinor: noNegativeZero(invested),
    loanMinor: noNegativeZero(loans),
    accounts: lines,
    inputs: {
      accounts: includedCount,
      excluded: excludedCount,
      archived: archivedCount,
      assets,
      liabilities,
    },
    ...(notes.length > 0 ? { notes } : {}),
  };
}

/**
 * Liquid net worth: spendable accounts plus card debt, excluding investments,
 * property and loan principal.
 */
export function liquidNetWorth(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf?: string,
): Metric<number> {
  const liquid = liquidBalance(accounts, transactions, asOf).value;
  let cards = 0;
  for (const account of accounts) {
    if (account.archived === true || account.type !== 'credit_card') continue;
    cards += balanceOf(account, transactions, asOf).value;
  }
  return {
    value: noNegativeZero(liquid + cards),
    inputs: { liquid, cards },
    ...(cards < 0
      ? { notes: ['Card debt is already negative and reduces liquid net worth.'] }
      : {}),
  };
}

/** Re-exported so callers do not need two modules for the headline figures. */
// (removed: `src/index.ts` already re-exports `balances`; duplicating the names
// here would make the barrel ambiguous.)

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export interface NetWorthComparison {
  readonly fromPeriodKey: string;
  readonly toPeriodKey: string;
  readonly fromAsOfDay: string;
  readonly toAsOfDay: string;
  readonly fromMinor: number;
  readonly toMinor: number;
  readonly deltaMinor: number;
  /** `delta / |from|`, or `null` when the previous value is zero. */
  readonly percentChange: number | null;
  readonly direction: 'up' | 'down' | 'flat';
  readonly assetDeltaMinor: number;
  readonly liabilityDeltaMinor: number;
  readonly liquidDeltaMinor: number;
  readonly accountChanges: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly fromMinor: number;
    readonly toMinor: number;
    readonly deltaMinor: number;
  }>;
  readonly notes: readonly string[];
}

/** Compare two stored snapshots. Never reads current balances. */
export function compareNetWorth(
  previous: NetWorthSnapshot,
  current: NetWorthSnapshot,
): NetWorthComparison {
  const delta = noNegativeZero(current.netWorthMinor - previous.netWorthMinor);
  const direction: 'up' | 'down' | 'flat' = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

  const previousById = new Map(previous.accounts.map((account) => [account.id, account]));
  const currentById = new Map(current.accounts.map((account) => [account.id, account]));
  const ids = new Set([...previousById.keys(), ...currentById.keys()]);

  const accountChanges = [...ids]
    .map((id) => {
      const before = previousById.get(id);
      const after = currentById.get(id);
      const fromMinor = before?.balanceMinor ?? 0;
      const toMinor = after?.balanceMinor ?? 0;
      return {
        id,
        name: after?.name ?? before?.name ?? id,
        fromMinor,
        toMinor,
        deltaMinor: noNegativeZero(toMinor - fromMinor),
      };
    })
    .filter((change) => change.deltaMinor !== 0)
    .sort((a, b) => Math.abs(b.deltaMinor) - Math.abs(a.deltaMinor));

  const notes: string[] = [];
  if (previous.netWorthMinor === 0) {
    notes.push('The earlier snapshot is zero, so a percentage change is not meaningful.');
  }
  if (previous.asOfDay > current.asOfDay) {
    notes.push('The snapshots are in reverse order; the comparison may be misleading.');
  }

  return {
    fromPeriodKey: previous.periodKey,
    toPeriodKey: current.periodKey,
    fromAsOfDay: previous.asOfDay,
    toAsOfDay: current.asOfDay,
    fromMinor: previous.netWorthMinor,
    toMinor: current.netWorthMinor,
    deltaMinor: delta,
    percentChange: ratio(delta, Math.abs(previous.netWorthMinor)),
    direction,
    assetDeltaMinor: noNegativeZero(current.assetsMinor - previous.assetsMinor),
    liabilityDeltaMinor: noNegativeZero(current.liabilitiesMinor - previous.liabilitiesMinor),
    liquidDeltaMinor: noNegativeZero(current.liquidMinor - previous.liquidMinor),
    accountChanges,
    notes,
  };
}

/** A chart-ready series, oldest first. */
export function netWorthSeries(
  snapshots: readonly NetWorthSnapshot[],
): ReadonlyArray<{
  readonly periodKey: string;
  readonly asOfDay: string;
  readonly netWorthMinor: number;
}> {
  return [...snapshots]
    .sort((a, b) =>
      a.periodKey === b.periodKey
        ? a.asOfDay < b.asOfDay
          ? -1
          : a.asOfDay > b.asOfDay
            ? 1
            : 0
        : a.periodKey < b.periodKey
          ? -1
          : 1,
    )
    .map((snapshot) => ({
      periodKey: snapshot.periodKey,
      asOfDay: snapshot.asOfDay,
      netWorthMinor: snapshot.netWorthMinor,
    }));
}
