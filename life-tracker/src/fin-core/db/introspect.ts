/**
 * Read-only schema introspection.
 *
 * Restore never trusts table or column names from a file. It asks SQLite what
 * actually exists and validates the file against that answer.
 */

import type { SqliteDriver } from './driver';
import { quoteIdentifier } from './sql';

export interface ColumnInfo {
  readonly cid: number;
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly dflt_value: string | null;
  /** 1-based position within the primary key, or 0 when the column is not part of it. */
  readonly pk: number;
}

export interface TableInfo {
  readonly name: string;
  readonly columns: readonly ColumnInfo[];
  readonly columnNames: ReadonlySet<string>;
  /** Primary-key columns in key order. Empty when the table has no primary key. */
  readonly primaryKey: readonly string[];
}

export interface DbSchema {
  readonly tables: ReadonlyMap<string, TableInfo>;
}

export async function inspectSchema(driver: SqliteDriver): Promise<DbSchema> {
  const names = await driver.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );

  const tables = new Map<string, TableInfo>();
  for (const { name } of names) {
    const columns = await driver.getAllAsync<ColumnInfo>(
      `PRAGMA table_info(${quoteIdentifier(name)})`,
    );
    const primaryKey = columns
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);

    tables.set(name, {
      name,
      columns,
      columnNames: new Set(columns.map((column) => column.name)),
      primaryKey,
    });
  }

  return { tables };
}

export async function tableColumns(
  driver: SqliteDriver,
  table: string,
): Promise<Set<string>> {
  const rows = await driver.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${quoteIdentifier(table)})`,
  );
  return new Set(rows.map((row) => row.name));
}

export async function hasColumn(
  driver: SqliteDriver,
  table: string,
  column: string,
): Promise<boolean> {
  return (await tableColumns(driver, table)).has(column);
}

/** True when a table exists. Used by migrations that must tolerate old databases. */
export async function tableExists(
  driver: SqliteDriver,
  table: string,
): Promise<boolean> {
  const row = await driver.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table],
  );
  return (row?.n ?? 0) > 0;
}
