/**
 * Recovered schema.
 *
 * The `fin_*` DDL below is transcribed verbatim from the shipped app's migration
 * (schema version 2, `analysis/schema.sql`). It is created with
 * `IF NOT EXISTS`, so on an existing database it is a no-op and only the
 * additive columns in `migrations.ts` are applied.
 *
 * The app's own `user_version` is never written here. It belongs to the app's
 * migration runner; this library keeps its own ledger in `settings`.
 */

/** Exact `settings` DDL from the app. */
export const SETTINGS_DDL = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;

/** Exact `fin_categories` DDL from the app. */
export const FIN_CATEGORIES_DDL = `
  CREATE TABLE IF NOT EXISTS fin_categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#1F9D6B',
    kind TEXT NOT NULL DEFAULT 'expense',
    budget_minor INTEGER,
    archived INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  );
`;

/** Exact `fin_recurring` DDL from the app. */
export const FIN_RECURRING_DDL = `
  CREATE TABLE IF NOT EXISTS fin_recurring (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'expense',
    amount_minor INTEGER NOT NULL,
    category_id TEXT REFERENCES fin_categories(id) ON DELETE SET NULL,
    cadence TEXT NOT NULL DEFAULT 'monthly',
    next_day TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
`;

/** Exact legacy `fin_transactions` DDL from the app (no `account_id`, no `kind`). */
export const FIN_TRANSACTIONS_DDL = `
  CREATE TABLE IF NOT EXISTS fin_transactions (
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
`;

/** I1 — the account root. Liabilities are accounts with negative balances. */
export const FIN_ACCOUNTS_DDL = `
  CREATE TABLE IF NOT EXISTS fin_accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cash',
    opening_balance_minor INTEGER NOT NULL DEFAULT 0,
    opening_day TEXT,
    balance_mode TEXT NOT NULL DEFAULT 'derived',
    manual_balance_minor INTEGER,
    include_in_net_worth INTEGER NOT NULL DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0,
    credit_limit_minor INTEGER,
    currency TEXT NOT NULL DEFAULT 'INR',
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
`;

/** Indexes that already existed in the app. */
export const LEGACY_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_fin_tx_day ON fin_transactions (day);
  CREATE INDEX IF NOT EXISTS idx_fin_tx_category ON fin_transactions (category_id, day);
`;

/** Added by I1, after `account_id` exists. */
export const ACCOUNT_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_fin_tx_account ON fin_transactions (account_id, day);
  CREATE INDEX IF NOT EXISTS idx_fin_accounts_type ON fin_accounts (type);
`;

/** Added by I2, after `kind` and `transfer_id` exist. */
export const KIND_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_fin_tx_kind ON fin_transactions (kind, day);
  CREATE INDEX IF NOT EXISTS idx_fin_tx_transfer ON fin_transactions (transfer_id);
`;

/**
 * Stable id for the default Cash account.
 *
 * Deterministic on purpose: a retried migration hits `ON CONFLICT(id)` instead
 * of creating a second Cash account.
 */
export const DEFAULT_CASH_ACCOUNT_ID = 'acc_cash_default';

/** Settings keys used by this library. */
export const SETTING_KEYS = {
  accountsMigrated: 'fin_m0001_accounts',
  kindsMigrated: 'fin_m0002_kinds',
  signMigrated: 'fin_sign_v1',
  signMixed: 'fin_sign_mixed',
  repairRequired: 'fin_repair_required',
  incomeSignWarning: 'fin_income_sign_warning',
  defaultCashAccount: 'fin_default_cash_account',
  schemaVersion: 'fin_schema_version',
  userVersionSeen: 'fin_user_version_seen',
  lastRestoreHash: 'last_restore_hash',
  lastRestoreAt: 'last_restore_at',
} as const;
