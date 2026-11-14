import * as SQLite from 'expo-sqlite';
import type { SqliteDriver } from '../fin-core/src/db';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('life-tracker.db');
  }
  return db;
}

export function makeDriver(): SqliteDriver {
  const database = getDb();
  return {
    execAsync: async (sql: string) => {
      await database.execAsync(sql);
    },
    runAsync: async (sql: string, params: readonly (string | number | boolean | null)[] = []) => {
      const result = await database.runAsync(sql, [...params]);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    getAllAsync: async <T>(sql: string, params: readonly (string | number | boolean | null)[] = []) => {
      return (await database.getAllAsync<T>(sql, [...params])) as T[];
    },
    getFirstAsync: async <T>(sql: string, params: readonly (string | number | boolean | null)[] = []) => {
      const row = await database.getFirstAsync<T>(sql, [...params]);
      return (row ?? null) as T | null;
    },
    withTransactionAsync: async (fn: () => Promise<void>) => {
      await database.withTransactionAsync(fn);
    },
  };
}

