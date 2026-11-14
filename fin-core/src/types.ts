/**
 * Shared value types for the Financial Space core.
 *
 * These are plain data shapes. Nothing here imports React, React Native,
 * expo-sqlite, or anything from the app repository. Each shape maps 1:1 onto a
 * row of `fin_accounts` / `fin_transactions`, using camelCase instead of
 * snake_case so screens do not have to care about the database.
 */

/** The economic meaning of a movement. Never inferred from the sign alone. */
export type TransactionKind =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'refund'
  | 'interest'
  | 'adjustment';

export const TRANSACTION_KINDS = [
  'expense',
  'income',
  'transfer',
  'refund',
  'interest',
  'adjustment',
] as const satisfies readonly TransactionKind[];

export type AccountType =
  | 'bank'
  | 'cash'
  | 'wallet'
  | 'credit_card'
  | 'loan'
  | 'investment'
  | 'asset';

export const ACCOUNT_TYPES = [
  'bank',
  'cash',
  'wallet',
  'credit_card',
  'loan',
  'investment',
  'asset',
] as const satisfies readonly AccountType[];

/**
 * `posted`   — confirmed (everything entered by hand)
 * `pending`  — imported, awaiting review; still affects balances and totals
 * `excluded` — real money movement deliberately kept out of analytics
 */
export type TransactionStatus = 'posted' | 'pending' | 'excluded';

/**
 * `derived` — balance = opening + sum of movements
 * `manual`  — balance is typed in by the user (property, gold, PF)
 */
export type BalanceMode = 'derived' | 'manual';

/** v1 supports exactly one currency. The column exists; the value does not vary. */
export type CurrencyCode = 'INR';

/**
 * One row of the ledger: one balance-affecting movement on one account.
 *
 * `amountMinor` is signed:
 *   negative → value leaves the account
 *   positive → value enters the account
 *
 * A transfer is therefore *two* rows sharing a `transferId`, summing to zero.
 */
export interface Transaction {
  readonly id: string;
  readonly accountId: string;
  readonly kind: TransactionKind;
  /** Signed minor units (paise). Never a float, never zero. */
  readonly amountMinor: number;
  /** Local calendar day, `YYYY-MM-DD`. All grouping and filtering uses this. */
  readonly day: string;
  readonly categoryId?: string | null;
  readonly status?: TransactionStatus;
  /** Shared by the two legs of a transfer. */
  readonly transferId?: string | null;
  /** Set on a refund, pointing at the original expense. */
  readonly refundOfId?: string | null;
  /** Set when a transaction was created by marking a bill paid. */
  readonly recurringId?: string | null;
  /** The bill occurrence this payment covers. */
  readonly billDueDay?: string | null;
  /** Soft delete. A non-null value hides the row from everything. */
  readonly deletedAt?: number | null;
  readonly currency?: string;
  readonly note?: string;
  readonly payee?: string | null;
}

/**
 * One account. Assets and liabilities are the same shape: a credit card or a
 * loan is simply an account whose balance is negative.
 */
export interface Account {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  /** Balance before the first movement, signed. Negative for cards and loans. */
  readonly openingBalanceMinor: number;
  readonly openingDay?: string;
  readonly balanceMode?: BalanceMode;
  /** Required when `balanceMode === 'manual'`; ignored otherwise. */
  readonly manualBalanceMinor?: number | null;
  /** Defaults to `true`. Set `false` to leave an account out of net worth. */
  readonly includeInNetWorth?: boolean;
  readonly archived?: boolean;
  readonly creditLimitMinor?: number | null;
}

/** Inclusive local-day range. `from` and `to` are both counted. */
export interface DayRange {
  readonly from: string;
  readonly to: string;
}

/**
 * Every derived number is returned in this shape so a screen can explain
 * itself: `value` is what you show, `inputs` is where it came from.
 */
export interface Metric<T> {
  readonly value: T;
  readonly inputs: Readonly<Record<string, number>>;
  readonly notes?: readonly string[];
}

export function isTransactionKind(value: unknown): value is TransactionKind {
  return typeof value === 'string' && (TRANSACTION_KINDS as readonly string[]).includes(value);
}

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value);
}
