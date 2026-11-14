/**
 * I6 — Calculation engine (balances).
 *
 * The whole financial model rests on one equation:
 *
 *   balance(account) = openingBalance + Σ amountMinor
 *
 * Because liabilities are accounts with negative balances, net worth is then a
 * single sum and never needs an asset/liability split. A credit card is an
 * account whose balance is negative; a loan is the same thing with a longer
 * horizon.
 *
 * Balances include `pending` and `excluded` rows. Those flags change what
 * analytics count, not what money did.
 */

import { isDayKey } from './money';
import { isLive } from './calc';
import type { Account, Metric, Transaction } from './types';

function assertAsOf(asOf: string | undefined): void {
  if (asOf !== undefined && !isDayKey(asOf)) {
    throw new RangeError(`Invalid asOf day ${String(asOf)}: expected local YYYY-MM-DD.`);
  }
}

/**
 * Balance of one account, optionally as of a past day.
 *
 * `asOf` is inclusive and filters on `day`, so it answers "what did this account
 * hold at the end of that day?".
 */
export function balanceOf(
  account: Account,
  transactions: readonly Transaction[],
  asOf?: string,
): Metric<number> {
  assertAsOf(asOf);

  if (account.balanceMode === 'manual' && typeof account.manualBalanceMinor === 'number') {
    return {
      value: account.manualBalanceMinor,
      inputs: { manual: 1, opening: account.openingBalanceMinor, movement: 0, rows: 0 },
      notes: ['Balance is maintained by hand; transactions do not change it.'],
    };
  }

  let movement = 0;
  let rows = 0;
  for (const transaction of transactions) {
    if (transaction.accountId !== account.id) continue;
    if (!isLive(transaction)) continue;
    if (asOf !== undefined && transaction.day > asOf) continue;
    movement += transaction.amountMinor;
    rows += 1;
  }

  const notes: string[] = [];
  if (account.balanceMode === 'manual') {
    notes.push('Manual balance is missing; showing the derived balance instead.');
  }

  return {
    value: account.openingBalanceMinor + movement,
    inputs: {
      opening: account.openingBalanceMinor,
      movement,
      rows,
    },
    ...(notes.length > 0 ? { notes } : {}),
  };
}

/** Balance of every account, including archived ones (for history). */
export function balancesByAccount(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf?: string,
): ReadonlyMap<string, number> {
  assertAsOf(asOf);
  const balances = new Map<string, number>();
  for (const account of accounts) {
    balances.set(account.id, balanceOf(account, transactions, asOf).value);
  }
  return balances;
}

/**
 * Net worth: the sum of every included account balance.
 *
 * `assets` and `liabilities` are returned as positive display figures; the
 * `value` is their signed sum.
 */
export function netWorth(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf?: string,
): Metric<number> {
  assertAsOf(asOf);

  let assets = 0;
  let liabilities = 0;
  let included = 0;
  let skipped = 0;

  for (const account of accounts) {
    if (account.archived === true || account.includeInNetWorth === false) {
      skipped += 1;
      continue;
    }
    const balance = balanceOf(account, transactions, asOf).value;
    included += 1;
    if (balance >= 0) assets += balance;
    else liabilities += -balance;
  }

  return {
    value: assets - liabilities,
    inputs: { accounts: included, skipped, assets, liabilities },
  };
}

/**
 * Money available to spend, before commitments.
 *
 * Liquid accounts plus card balances (already negative when owed). Loans,
 * investments and manual assets are excluded: they are wealth, not cash.
 */
export function liquidBalance(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf?: string,
): Metric<number> {
  assertAsOf(asOf);

  let value = 0;
  let included = 0;

  for (const account of accounts) {
    if (account.archived === true) continue;
    if (account.type !== 'bank' && account.type !== 'cash' && account.type !== 'wallet') continue;
    value += balanceOf(account, transactions, asOf).value;
    included += 1;
  }

  return { value, inputs: { accounts: included } };
}

/** Outstanding card debt, as a positive display figure. */
export function cardDebt(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf?: string,
): Metric<number> {
  assertAsOf(asOf);

  let owed = 0;
  let cards = 0;

  for (const account of accounts) {
    if (account.archived === true || account.type !== 'credit_card') continue;
    const balance = balanceOf(account, transactions, asOf).value;
    cards += 1;
    if (balance < 0) owed += -balance;
  }

  return { value: owed, inputs: { cards, owed } };
}
