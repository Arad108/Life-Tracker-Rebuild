/**
 * Test harness: a real SQLite database behind the same `SqliteDriver` the app
 * will use.
 *
 * `node:sqlite` is built into Node 24, so these tests exercise actual SQL —
 * transactions, rollback, foreign keys, `ON CONFLICT` — without a dependency.
 */

import { DatabaseSync } from 'node:sqlite';
import type { SqliteDriver, SqlParam, RunResult } from '../../src/db/driver';

/** The recovered app schema, restricted to the tables these tests touch. */
export const LEGACY_SCHEMA = `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE spaces (
    key TEXT PRIMARY KEY NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    pinned INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    settings TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE goals (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    space_key TEXT NOT NULL,
    metric TEXT,
    kind TEXT NOT NULL,
    target REAL,
    unit TEXT,
    period TEXT NOT NULL DEFAULT 'none',
    start_day TEXT,
    deadline TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE fin_categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#1F9D6B',
    kind TEXT NOT NULL DEFAULT 'expense',
    budget_minor INTEGER,
    archived INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE fin_recurring (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'expense',
    amount_minor INTEGER NOT NULL,
    category_id TEXT REFERENCES fin_categories(id) ON DELETE SET NULL,
    cadence TEXT NOT NULL DEFAULT 'monthly',
    next_day TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE fin_transactions (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    category_id TEXT REFERENCES fin_categories(id) ON DELETE SET NULL,
    occurred_at INTEGER NOT NULL,
    day TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    method TEXT,
    for_whom TEXT,
    payee TEXT,
    recurring_id TEXT REFERENCES fin_recurring(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT,
    extra TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_fin_tx_day ON fin_transactions (day);
  CREATE INDEX idx_fin_tx_category ON fin_transactions (category_id, day);

  CREATE TABLE trackers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE tracker_entries (
    id TEXT PRIMARY KEY NOT NULL,
    tracker_id TEXT NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
    occurred_at INTEGER NOT NULL,
    day TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE so_people (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE so_interactions (
    id TEXT PRIMARY KEY NOT NULL,
    day TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'talked'
  );

  CREATE TABLE so_interaction_people (
    interaction_id TEXT NOT NULL REFERENCES so_interactions(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES so_people(id) ON DELETE CASCADE,
    PRIMARY KEY (interaction_id, person_id)
  );
`;

function bind(params: readonly SqlParam[]): Array<string | number | null> {
  return params.map((param) => (typeof param === 'boolean' ? (param ? 1 : 0) : param));
}

export interface TestDatabase {
  readonly db: DatabaseSync;
  readonly driver: SqliteDriver;
  close(): void;
}

export function createDatabase(schema: string = LEGACY_SCHEMA): TestDatabase {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(schema);

  const driver: SqliteDriver = {
    async execAsync(sql: string): Promise<void> {
      db.exec(sql);
    },

    async runAsync(sql: string, params: readonly SqlParam[] = []): Promise<RunResult> {
      const info = db.prepare(sql).run(...bind(params));
      return {
        changes: Number(info.changes),
        lastInsertRowId: info.lastInsertRowid,
      };
    },

    async getAllAsync<T>(sql: string, params: readonly SqlParam[] = []): Promise<T[]> {
      return db.prepare(sql).all(...bind(params)) as T[];
    },

    async getFirstAsync<T>(sql: string, params: readonly SqlParam[] = []): Promise<T | null> {
      const row = db.prepare(sql).get(...bind(params));
      return (row ?? null) as T | null;
    },

    async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // A failed rollback must not hide the original error.
        }
        throw error;
      }
    },
  };

  return { db, driver, close: () => db.close() };
}

export type SeedSign = 'positive' | 'signed' | 'mixed';

export interface SeedOptions {
  readonly sign?: SeedSign;
  readonly now?: number;
}

export const NOVEMBER = { from: '2026-11-01', to: '2026-11-30' } as const;

/**
 * Four legacy rows. `positive` is what the shipped app actually stores
 * (`validate` requires `amountMinor > 0`); the other modes exist to test the
 * runtime detection.
 */
export function seedLegacyFinance(
  database: TestDatabase,
  options: SeedOptions = {},
): void {
  const sign = options.sign ?? 'positive';
  const now = options.now ?? Date.UTC(2026, 10, 1);
  const db = database.db;

  db.exec(`
    INSERT INTO fin_categories (id, name, kind, position) VALUES
      ('cat-salary', 'Salary', 'income', 0),
      ('cat-rent', 'Rent', 'expense', 1),
      ('cat-groceries', 'Groceries', 'expense', 2),
      ('cat-coffee', 'Coffee', 'expense', 3);
  `);

  const rows: ReadonlyArray<readonly [string, string, number, string, string, string]> = [
    ['t-salary', 'income', 8_000_000, '2026-11-01', 'Salary', 'cat-salary'],
    ['t-rent', 'expense', 1_800_000, '2026-11-02', 'Rent', 'cat-rent'],
    ['t-groceries', 'expense', 450_000, '2026-11-05', 'Groceries', 'cat-groceries'],
    ['t-coffee', 'expense', 30_000, '2026-11-27', 'Coffee', 'cat-coffee'],
  ];

  const insert = db.prepare(
    `INSERT INTO fin_transactions
       (id, type, amount_minor, category_id, occurred_at, day, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const [id, type, magnitude, day, note, categoryId] of rows) {
    let amount = magnitude;
    if (type === 'expense') {
      if (sign === 'signed') amount = -magnitude;
      if (sign === 'mixed') amount = id === 't-rent' ? -magnitude : magnitude;
    }
    insert.run(id, type, amount, categoryId, now, day, note, now, now);
  }
}

export function countRows(database: TestDatabase, table: string): number {
  const row = database.db
    .prepare(`SELECT COUNT(*) AS n FROM "${table}"`)
    .get() as { n: number };
  return row.n;
}

export function readSetting(database: TestDatabase, key: string): string | null {
  const row = database.db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
