/**
 * Row → domain mapping.
 *
 * The database speaks snake_case; I3/I6 speak camelCase. This is the only place
 * that translates, so screens never have to know a column name.
 */

import { isTransactionKind } from '../types';
import type { Account, AccountType, BalanceMode, Transaction, TransactionKind, TransactionStatus } from '../types';
import type { SqliteDriver } from './driver';

export interface FinTransactionRow {
  readonly id: string;
  readonly type: string;
  readonly kind: string | null;
  readonly amount_minor: number;
  readonly currency: string;
  readonly category_id: string | null;
  readonly occurred_at: number;
  readonly day: string;
  readonly note: string | null;
  readonly method: string | null;
  readonly for_whom: string | null;
  readonly payee: string | null;
  readonly recurring_id: string | null;
  readonly source: string;
  readonly external_id: string | null;
  readonly extra: string;
  readonly created_at: number;
  readonly updated_at: number;
  readonly account_id: string | null;
  readonly transfer_id: string | null;
  readonly refund_of_id: string | null;
  readonly status: string | null;
  readonly deleted_at: number | null;
  readonly bill_due_day: string | null;
  readonly source_ref: string | null;
  readonly import_method: string | null;
  readonly imported_at: number | null;
  readonly confidence: number | null;
}

export interface FinAccountRow {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly opening_balance_minor: number;
  readonly opening_day: string | null;
  readonly balance_mode: string;
  readonly manual_balance_minor: number | null;
  readonly include_in_net_worth: number;
  readonly archived: number;
  readonly credit_limit_minor: number | null;
  readonly currency: string;
  readonly created_at: number;
  readonly updated_at: number;
}

const STATUSES: readonly TransactionStatus[] = ['posted', 'pending', 'excluded'];

function statusOf(value: string | null): TransactionStatus {
  return STATUSES.includes(value as TransactionStatus)
    ? (value as TransactionStatus)
    : 'posted';
}

export function toTransaction(row: FinTransactionRow): Transaction {
  if (!row.account_id) {
    throw new Error(
      `Transaction ${row.id} has no account_id. Run runFinancialMigrations() before loading the ledger.`,
    );
  }

  const kindValue = row.kind ?? row.type;
  if (!isTransactionKind(kindValue)) {
    throw new Error(
      `Transaction ${row.id} has an unrecognised kind "${String(kindValue)}".`,
    );
  }

  return {
    id: row.id,
    accountId: row.account_id,
    kind: kindValue as TransactionKind,
    amountMinor: row.amount_minor,
    day: row.day,
    categoryId: row.category_id,
    status: statusOf(row.status),
    transferId: row.transfer_id,
    refundOfId: row.refund_of_id,
    recurringId: row.recurring_id,
    billDueDay: row.bill_due_day,
    source: row.source,
    sourceRef: row.source_ref,
    importMethod: row.import_method,
    importedAt: row.imported_at,
    confidence: row.confidence,
    deletedAt: row.deleted_at,
    currency: row.currency,
    note: row.note ?? '',
    payee: row.payee,
  };
}

export function toAccount(row: FinAccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AccountType,
    openingBalanceMinor: row.opening_balance_minor,
    openingDay: row.opening_day ?? undefined,
    balanceMode: row.balance_mode as BalanceMode,
    manualBalanceMinor: row.manual_balance_minor,
    includeInNetWorth: row.include_in_net_worth === 1,
    archived: row.archived === 1,
    creditLimitMinor: row.credit_limit_minor,
  };
}

export interface LoadTransactionsOptions {
  readonly from?: string;
  readonly to?: string;
  /** Defaults to false: soft-deleted rows are never loaded. */
  readonly includeDeleted?: boolean;
}

export async function loadTransactions(
  driver: SqliteDriver,
  options: LoadTransactionsOptions = {},
): Promise<Transaction[]> {
  const clauses: string[] = [];
  const params: string[] = [];

  if (options.includeDeleted !== true) clauses.push('deleted_at IS NULL');
  if (options.from !== undefined) {
    clauses.push('day >= ?');
    params.push(options.from);
  }
  if (options.to !== undefined) {
    clauses.push('day <= ?');
    params.push(options.to);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  const rows = await driver.getAllAsync<FinTransactionRow>(
    `SELECT * FROM fin_transactions${where} ORDER BY day, id`,
    params,
  );
  return rows.map(toTransaction);
}

export async function loadAccounts(driver: SqliteDriver): Promise<Account[]> {
  const rows = await driver.getAllAsync<FinAccountRow>(
    'SELECT * FROM fin_accounts ORDER BY created_at, id',
  );
  return rows.map(toAccount);
}
