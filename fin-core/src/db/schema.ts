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

/**
 * I7 — budget records.
 *
 * The shipped app stored a budget as a mutable goal target, so editing a future
 * budget rewrote history. A record is scoped to one period instead:
 *
 *   category_id  NULL = overall budget, otherwise fin_categories.id
 *   period_kind  'month' (period_key = YYYY-MM) or 'custom' (start_day/end_day)
 *
 * `amount_minor` is positive paise. Records are never rewritten across periods;
 * editing December leaves November untouched.
 */
export const FIN_BUDGETS_DDL = `
  CREATE TABLE IF NOT EXISTS fin_budgets (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT REFERENCES fin_categories(id) ON DELETE CASCADE,
    amount_minor INTEGER NOT NULL,
    period_kind TEXT NOT NULL DEFAULT 'month',
    period_key TEXT,
    start_day TEXT,
    end_day TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

/** Added by I7, after `fin_budgets` exists. */
export const BUDGET_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_fin_budgets_period ON fin_budgets (period_kind, period_key, category_id);
  CREATE INDEX IF NOT EXISTS idx_fin_budgets_category ON fin_budgets (category_id, period_kind, period_key);
`;

/**
 * I8 — bill skips.
 *
 * A skip is a decision about one occurrence, not a deletion. Recording it means
 * "this month I did not pay, and here is why" survives in the history instead of
 * vanishing when `next_day` advances. The unique index makes skipping twice
 * impossible and gives the deterministic id its guarantee.
 */
export const FIN_BILL_SKIPS_DDL = `
  CREATE TABLE IF NOT EXISTS fin_bill_skips (
    id TEXT PRIMARY KEY NOT NULL,
    bill_id TEXT NOT NULL REFERENCES fin_recurring(id) ON DELETE CASCADE,
    due_day TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
`;

/**
 * I10 — net worth snapshots.
 *
 * One row per period, never per account: the per-account balances are stored in
 * `accounts` as JSON because the only consumer is a comparison, and a second
 * table would duplicate what `fin_accounts` already knows. The row is the
 * observation; `created_at`/`updated_at` record when the observation was taken.
 *
 * `period_kind` is `month` (key `YYYY-MM`) or `day` (key `YYYY-MM-DD`). The
 * unique index on `(period_kind, period_key)` is what makes repeated snapshot
 * creation idempotent at the database level, not just in code.
 */
export const FIN_SNAPSHOTS_DDL = `
  CREATE TABLE IF NOT EXISTS fin_snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    period_kind TEXT NOT NULL DEFAULT 'month',
    period_key TEXT NOT NULL,
    as_of_day TEXT NOT NULL,
    net_worth_minor INTEGER NOT NULL,
    assets_minor INTEGER NOT NULL,
    liabilities_minor INTEGER NOT NULL,
    liquid_minor INTEGER NOT NULL,
    accounts TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

/** Added by I8/I10, after the tables exist. */
export const BILL_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_fin_recurring_due ON fin_recurring (active, next_day);
  CREATE INDEX IF NOT EXISTS idx_fin_tx_recurring ON fin_transactions (recurring_id, bill_due_day);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_bill_skips_due ON fin_bill_skips (bill_id, due_day);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_snapshots_period ON fin_snapshots (period_kind, period_key);
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
  budgetsMigrated: 'fin_m0003_budgets',
  billsMigrated: 'fin_m0004_bills',
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
