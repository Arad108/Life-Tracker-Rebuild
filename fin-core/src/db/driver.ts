/**
 * The only thing this library needs from SQLite.
 *
 * This interface mirrors expo-sqlite's async API closely enough that an adapter
 * is a handful of lines, while keeping the whole `db/` subtree free of React
 * Native imports so it can be tested with `node:sqlite`.
 *
 * Adapter sketch (app side, not part of this library):
 *
 *   const driver: SqliteDriver = {
 *     execAsync: (sql) => db.execAsync(sql),
 *     runAsync: (sql, params = []) => db.runAsync(sql, ...params),
 *     getAllAsync: (sql, params = []) => db.getAllAsync(sql, ...params),
 *     getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, ...params),
 *     withTransactionAsync: (fn) => db.withTransactionAsync(fn),
 *   };
 */

export type SqlParam = string | number | boolean | null;

export interface RunResult {
  readonly changes: number;
  readonly lastInsertRowId: number | bigint;
}

export interface SqliteDriver {
  /** Run one or more statements. Used for DDL and `PRAGMA`. */
  execAsync(sql: string): Promise<void>;
  /** Run one statement and report how many rows it changed. */
  runAsync(sql: string, params?: readonly SqlParam[]): Promise<RunResult>;
  getAllAsync<T>(sql: string, params?: readonly SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: readonly SqlParam[]): Promise<T | null>;
  /**
   * Run `fn` inside one transaction. If `fn` throws, every write is rolled back.
   * expo-sqlite and the test harness both implement this with
   * BEGIN / COMMIT / ROLLBACK.
   */
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
}

/**
 * Run `fn` in a transaction and return its value.
 *
 * The `completed` flag is a guard, not decoration: if a driver ever swallowed an
 * error from `withTransactionAsync`, we must not hand back a half-applied result
 * as if it succeeded.
 */
export async function withTransaction<T>(
  driver: SqliteDriver,
  fn: () => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  let completed = false;

  await driver.withTransactionAsync(async () => {
    result = await fn();
    completed = true;
  });

  if (!completed) {
    throw new Error('Transaction did not complete; no result is available.');
  }
  return result as T;
}
