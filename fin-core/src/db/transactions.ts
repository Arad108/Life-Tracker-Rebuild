/**
 * I12 — Transaction history queries.
 *
 * Filtering, searching and paging live here so screens never build SQL. Every
 * filter is optional and composable; an empty query returns the whole ledger in
 * chronological order, paginated.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../types';
import type { SqliteDriver } from './driver';
import { toTransaction } from './mapping';
import type { FinTransactionRow } from './mapping';

export interface TransactionQuery {
  readonly accountId?: string;
  readonly accountIds?: readonly string[];
  readonly categoryIds?: readonly string[];
  readonly kinds?: readonly TransactionKind[];
  readonly statuses?: readonly TransactionStatus[];
  readonly from?: string;
  readonly to?: string;
  readonly search?: string;
  readonly minAmountMinor?: number;
  readonly maxAmountMinor?: number;
  readonly recurringId?: string;
  readonly billDueDay?: string;
  readonly source?: string;
  readonly includeDeleted?: boolean;
  readonly sortBy?: 'day' | 'amount' | 'created';
  readonly sortDirection?: 'asc' | 'desc';
  readonly limit?: number;
  readonly offset?: number;
}

export interface TransactionPage {
  readonly rows: readonly Transaction[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export async function queryTransactions(
  driver: SqliteDriver,
  query: TransactionQuery = {},
): Promise<TransactionPage> {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (query.includeDeleted !== true) clauses.push('deleted_at IS NULL');
  if (query.accountId) {
    clauses.push('account_id = ?');
    params.push(query.accountId);
  }
  if (query.accountIds && query.accountIds.length > 0) {
    clauses.push(`account_id IN (${query.accountIds.map(() => '?').join(',')})`);
    params.push(...query.accountIds);
  }
  if (query.categoryIds && query.categoryIds.length > 0) {
    clauses.push(`category_id IN (${query.categoryIds.map(() => '?').join(',')})`);
    params.push(...query.categoryIds);
  }
  if (query.kinds && query.kinds.length > 0) {
    clauses.push(`kind IN (${query.kinds.map(() => '?').join(',')})`);
    params.push(...query.kinds);
  }
  if (query.statuses && query.statuses.length > 0) {
    clauses.push(`status IN (${query.statuses.map(() => '?').join(',')})`);
    params.push(...query.statuses);
  }
  if (query.from) {
    clauses.push('day >= ?');
    params.push(query.from);
  }
  if (query.to) {
    clauses.push('day <= ?');
    params.push(query.to);
  }
  if (query.recurringId) {
    clauses.push('recurring_id = ?');
    params.push(query.recurringId);
  }
  if (query.billDueDay) {
    clauses.push('bill_due_day = ?');
    params.push(query.billDueDay);
  }
  if (query.source) {
    clauses.push('source = ?');
    params.push(query.source);
  }
  if (typeof query.minAmountMinor === 'number') {
    clauses.push('amount_minor >= ?');
    params.push(query.minAmountMinor);
  }
  if (typeof query.maxAmountMinor === 'number') {
    clauses.push('amount_minor <= ?');
    params.push(query.maxAmountMinor);
  }
  if (query.search && query.search.trim().length > 0) {
    clauses.push('(note LIKE ? OR payee LIKE ? OR CAST(amount_minor AS TEXT) LIKE ?)');
    const term = `%${query.search.trim()}%`;
    params.push(term, term, term);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';

  const sortColumn =
    query.sortBy === 'amount' ? 'amount_minor' : query.sortBy === 'created' ? 'created_at' : 'day';
  const sortDirection = query.sortDirection === 'asc' ? 'ASC' : 'DESC';
  const secondary = sortColumn === 'day' ? ', id' : ', day, id';

  const totalRow = await driver.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM fin_transactions${where}`,
    params,
  );
  const total = totalRow?.n ?? 0;

  const limit = Math.max(1, Math.min(query.limit ?? 50, 1_000));
  const offset = Math.max(0, query.offset ?? 0);

  const rows = await driver.getAllAsync<FinTransactionRow>(
    `SELECT * FROM fin_transactions${where} ORDER BY ${sortColumn} ${sortDirection}${secondary} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return {
    rows: rows.map(toTransaction),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  };
}

export async function restoreTransaction(
  driver: SqliteDriver,
  id: string,
  options: { readonly now?: () => number } = {},
): Promise<boolean> {
  const now = (options.now ?? Date.now)();
  const result = await driver.runAsync(
    'UPDATE fin_transactions SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL',
    [now, id],
  );
  return result.changes > 0;
}

export async function restoreTransfer(
  driver: SqliteDriver,
  transferId: string,
  options: { readonly now?: () => number } = {},
): Promise<number> {
  const now = (options.now ?? Date.now)();
  const result = await driver.runAsync(
    'UPDATE fin_transactions SET deleted_at = NULL, updated_at = ? WHERE transfer_id = ? AND deleted_at IS NOT NULL',
    [now, transferId],
  );
  return result.changes;
}
