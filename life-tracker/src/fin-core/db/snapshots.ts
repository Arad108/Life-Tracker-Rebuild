/**
 * I10 — Net worth snapshots in SQLite.
 *
 * A snapshot is a stored observation. Creating one twice for the same period
 * returns the first observation unchanged, so history cannot be rewritten by
 * accident. Overwriting is explicit and opt-in.
 */

import type { Account, Transaction } from '../types';
import { loadAccounts, loadTransactions } from './mapping';
import type { NetWorthSnapshot } from '../networth';
import { netWorthBreakdown } from '../networth';
import type { SqliteDriver } from './driver';
import { withTransaction } from './driver';
import { FIN_SNAPSHOTS_DDL } from './schema';
import { todayKey } from '../dates';

export interface FinSnapshotRow {
  readonly id: string;
  readonly period_kind: string;
  readonly period_key: string;
  readonly as_of_day: string;
  readonly net_worth_minor: number;
  readonly assets_minor: number;
  readonly liabilities_minor: number;
  readonly liquid_minor: number;
  readonly accounts: string;
  readonly created_at: number;
  readonly updated_at: number;
}

export function toSnapshot(row: FinSnapshotRow): NetWorthSnapshot {
  let accounts: NetWorthSnapshot['accounts'] = [];
  try {
    accounts = JSON.parse(row.accounts) as NetWorthSnapshot['accounts'];
  } catch {
    accounts = [];
  }
  return {
    id: row.id,
    periodKind: row.period_kind,
    periodKey: row.period_key,
    asOfDay: row.as_of_day,
    netWorthMinor: row.net_worth_minor,
    assetsMinor: row.assets_minor,
    liabilitiesMinor: row.liabilities_minor,
    liquidMinor: row.liquid_minor,
    accounts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function snapshotId(periodKind: string, periodKey: string): string {
  return `${periodKind}:${periodKey}`;
}

export interface CreateSnapshotOptions {
  readonly periodKind?: string;
  readonly periodKey?: string;
  readonly asOfDay?: string;
  readonly now?: () => number;
  /** Overwrite an existing observation. Defaults to false. */
  readonly overwrite?: boolean;
}

export interface CreateSnapshotResult {
  readonly snapshot: NetWorthSnapshot;
  readonly created: boolean;
}

export async function createSnapshot(
  driver: SqliteDriver,
  options: CreateSnapshotOptions = {},
): Promise<CreateSnapshotResult> {
  await driver.execAsync(FIN_SNAPSHOTS_DDL);

  const now = (options.now ?? Date.now)();
  const periodKind = options.periodKind ?? 'month';
  const asOfDay = options.asOfDay ?? todayKey(new Date(now));
  const periodKey = options.periodKey ?? asOfDay.slice(0, 7);
  const id = snapshotId(periodKind, periodKey);

  const existing = await driver.getFirstAsync<FinSnapshotRow>(
    'SELECT * FROM fin_snapshots WHERE id = ?',
    [id],
  );
  if (existing && options.overwrite !== true) {
    return { snapshot: toSnapshot(existing), created: false };
  }

  const accounts = await loadAccounts(driver);
  const transactions = await loadTransactions(driver, { to: asOfDay });
  const breakdown = netWorthBreakdown(accounts, transactions, asOfDay);

  const snapshotAccounts = breakdown.accounts
    .filter((line) => line.included)
    .map((line) => ({
      id: line.id,
      name: line.name,
      type: line.type,
      balanceMinor: line.balanceMinor,
    }));

  const accountsJson = JSON.stringify(snapshotAccounts);

  await withTransaction(driver, async () => {
    if (existing) {
      await driver.runAsync(
        `UPDATE fin_snapshots
            SET as_of_day = ?, net_worth_minor = ?, assets_minor = ?, liabilities_minor = ?,
                liquid_minor = ?, accounts = ?, updated_at = ?
          WHERE id = ?`,
        [
          asOfDay,
          breakdown.value,
          breakdown.assetsMinor,
          breakdown.liabilitiesMinor,
          breakdown.liquidMinor,
          accountsJson,
          now,
          id,
        ],
      );
    } else {
      await driver.runAsync(
        `INSERT INTO fin_snapshots (
           id, period_kind, period_key, as_of_day, net_worth_minor, assets_minor,
           liabilities_minor, liquid_minor, accounts, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          periodKind,
          periodKey,
          asOfDay,
          breakdown.value,
          breakdown.assetsMinor,
          breakdown.liabilitiesMinor,
          breakdown.liquidMinor,
          accountsJson,
          now,
          now,
        ],
      );
    }
  });

  const row = await driver.getFirstAsync<FinSnapshotRow>(
    'SELECT * FROM fin_snapshots WHERE id = ?',
    [id],
  );
  if (!row) throw new Error(`Snapshot ${id} disappeared while being written.`);
  return { snapshot: toSnapshot(row), created: true };
}

export async function ensureMonthlySnapshot(
  driver: SqliteDriver,
  options: { month: string; asOfDay?: string; now?: () => number } = {
    month: '',
  },
): Promise<CreateSnapshotResult> {
  const now = (options.now ?? Date.now)();
  const month = options.month || todayKey(new Date(now)).slice(0, 7);
  const asOfDay = options.asOfDay ?? monthEnd(month);
  return createSnapshot(driver, {
    periodKind: 'month',
    periodKey: month,
    asOfDay,
    now: () => now,
  });
}

function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

export async function getSnapshot(
  driver: SqliteDriver,
  periodKind: string,
  periodKey: string,
): Promise<NetWorthSnapshot | null> {
  const row = await driver.getFirstAsync<FinSnapshotRow>(
    'SELECT * FROM fin_snapshots WHERE period_kind = ? AND period_key = ?',
    [periodKind, periodKey],
  );
  return row ? toSnapshot(row) : null;
}

export async function listSnapshots(driver: SqliteDriver): Promise<NetWorthSnapshot[]> {
  const rows = await driver.getAllAsync<FinSnapshotRow>(
    'SELECT * FROM fin_snapshots ORDER BY period_kind, period_key, as_of_day',
  );
  return rows.map(toSnapshot);
}

export async function latestSnapshot(driver: SqliteDriver): Promise<NetWorthSnapshot | null> {
  const row = await driver.getFirstAsync<FinSnapshotRow>(
    'SELECT * FROM fin_snapshots ORDER BY period_kind, period_key DESC, created_at DESC LIMIT 1',
  );
  return row ? toSnapshot(row) : null;
}

export async function deleteSnapshot(
  driver: SqliteDriver,
  periodKind: string,
  periodKey: string,
): Promise<boolean> {
  const result = await driver.runAsync(
    'DELETE FROM fin_snapshots WHERE period_kind = ? AND period_key = ?',
    [periodKind, periodKey],
  );
  return result.changes > 0;
}
