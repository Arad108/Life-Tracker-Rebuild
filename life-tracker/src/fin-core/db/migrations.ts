/**
 * I1 + I2 — Additive migrations.
 *
 * Two rules shape this file:
 *
 *   1. **Never rewrite data you cannot interpret.** The sign migration detects
 *      the existing convention at runtime. All-positive is negated, already
 *      signed is left alone, mixed is left alone and flagged for repair.
 *   2. **Never run twice.** Each step has a `settings` ledger key, and every
 *      structural change is additionally guarded by `PRAGMA table_info`, so a
 *      lost ledger cannot cause a duplicate column or a second Cash account.
 *
 * `PRAGMA user_version` is read and reported but never written: it belongs to
 * the shipped app's own migration runner. This library keeps its ledger in
 * `settings` (`fin_schema_version` and the per-step keys).
 */

import { hasColumn } from './introspect';
import {
  ACCOUNT_INDEXES,
  DEFAULT_CASH_ACCOUNT_ID,
  FIN_ACCOUNTS_DDL,
  FIN_CATEGORIES_DDL,
  FIN_RECURRING_DDL,
  FIN_TRANSACTIONS_DDL,
  KIND_INDEXES,
  LEGACY_INDEXES,
  SETTINGS_DDL,
  SETTING_KEYS,
} from './schema';
import { getSetting, setSetting } from './settings';
import { withTransaction } from './driver';
import type { SqliteDriver } from './driver';
import { migrateBudgets } from './budgets';
import { migrateBills } from './bills';
import { migrateProvenance } from './provenance';

export type SignMigrationStatus =
  | 'no-expenses'
  | 'already-signed'
  | 'negated'
  | 'mixed'
  | 'already-migrated';

export interface MigrationOptions {
  /** Override the default Cash account id (tests only). */
  readonly defaultCashAccountId?: string;
  readonly now?: () => number;
}

export interface MigrationReport {
  /** The value actually read from `PRAGMA user_version`. */
  readonly userVersion: number;
  /** Steps that ran for the first time. */
  readonly applied: readonly string[];
  /** Steps whose ledger key was already present. */
  readonly skipped: readonly string[];
  readonly defaultCashAccountId: string | null;
  readonly backfilledTransactions: number;
  readonly sign: SignMigrationStatus;
  /** Budget records created from the old goal budgets on the first run. */
  readonly budgetsCreated: number;
  /** Recurring bills that were backfilled onto the default Cash account. */
  readonly billsBackfilled: number;
  /** Provenance columns added to fin_transactions. */
  readonly provenanceMigrated: boolean;
  readonly warnings: readonly string[];
}

interface AccountsStepResult {
  readonly applied: boolean;
  readonly cashAccountId: string;
  readonly backfilled: number;
  readonly warnings: readonly string[];
}

interface KindsStepResult {
  readonly applied: boolean;
  readonly sign: SignMigrationStatus;
  readonly warnings: readonly string[];
}

/**
 * Ensure the recovered finance tables exist, add `account_id`, create the
 * default Cash account, and backfill every legacy transaction into it.
 */
export async function migrateAccounts(
  driver: SqliteDriver,
  options: MigrationOptions = {},
): Promise<AccountsStepResult> {
  const now = options.now ?? Date.now;
  const cashId = options.defaultCashAccountId ?? DEFAULT_CASH_ACCOUNT_ID;

  return withTransaction(driver, async () => {
    const already =
      (await getSetting(driver, SETTING_KEYS.accountsMigrated)) === '1';
    const warnings: string[] = [];

    await driver.execAsync(SETTINGS_DDL);
    await driver.execAsync(FIN_CATEGORIES_DDL);
    await driver.execAsync(FIN_RECURRING_DDL);
    await driver.execAsync(FIN_TRANSACTIONS_DDL);
    await driver.execAsync(FIN_ACCOUNTS_DDL);
    await driver.execAsync(LEGACY_INDEXES);

    if (!(await hasColumn(driver, 'fin_transactions', 'account_id'))) {
      await driver.execAsync(
        'ALTER TABLE fin_transactions ADD COLUMN account_id TEXT REFERENCES fin_accounts(id) ON DELETE SET NULL',
      );
    }
    await driver.execAsync(ACCOUNT_INDEXES);

    // Reuse an existing cash account before creating one. This is what makes a
    // restore-then-migrate safe: the backup's own Cash account wins.
    let cashAccountId =
      (await getSetting(driver, SETTING_KEYS.defaultCashAccount)) ?? null;

    let existing = cashAccountId
      ? await driver.getFirstAsync<{ id: string }>(
          'SELECT id FROM fin_accounts WHERE id = ?',
          [cashAccountId],
        )
      : null;

    if (!existing) {
      existing = await driver.getFirstAsync<{ id: string }>(
        "SELECT id FROM fin_accounts WHERE type = 'cash' ORDER BY archived, created_at, id LIMIT 1",
      );
      if (existing) cashAccountId = existing.id;
    }

    if (!existing) {
      const timestamp = now();
      await driver.runAsync(
        `INSERT INTO fin_accounts (
           id, name, type, opening_balance_minor, opening_day, balance_mode,
           manual_balance_minor, include_in_net_worth, archived, credit_limit_minor,
           currency, created_at, updated_at
         ) VALUES (?, 'Cash', 'cash', 0, NULL, 'derived', NULL, 1, 0, NULL, 'INR', ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [cashId, timestamp, timestamp],
      );

      // Re-read: a concurrent or previous attempt may have created a different
      // cash account between the select and the insert.
      const created = await driver.getFirstAsync<{ id: string }>(
        "SELECT id FROM fin_accounts WHERE type = 'cash' ORDER BY archived, created_at, id LIMIT 1",
      );
      cashAccountId = created?.id ?? cashId;
    }

    const resolvedCashId: string = cashAccountId ?? cashId;

    await setSetting(driver, SETTING_KEYS.defaultCashAccount, resolvedCashId);

    const backfill = await driver.runAsync(
      'UPDATE fin_transactions SET account_id = ? WHERE account_id IS NULL',
      [resolvedCashId],
    );

    if (backfill.changes > 0) {
      warnings.push(
        `${backfill.changes} transaction(s) had no account and were placed in the default Cash account.`,
      );
    }

    await setSetting(driver, SETTING_KEYS.accountsMigrated, '1');

    return {
      applied: !already,
      cashAccountId: resolvedCashId,
      backfilled: backfill.changes,
      warnings,
    };
  });
}

/**
 * Add the I2 columns, backfill `kind`, and convert expense amounts to signed
 * paise exactly once.
 */
export async function migrateKinds(
  driver: SqliteDriver,
  _options: MigrationOptions = {},
): Promise<KindsStepResult> {
  return withTransaction(driver, async () => {
    const already = (await getSetting(driver, SETTING_KEYS.kindsMigrated)) === '1';
    const warnings: string[] = [];

    await driver.execAsync(SETTINGS_DDL);
    await driver.execAsync(FIN_CATEGORIES_DDL);
    await driver.execAsync(FIN_RECURRING_DDL);
    await driver.execAsync(FIN_TRANSACTIONS_DDL);

    const additions: readonly (readonly [string, string])[] = [
      ['kind', 'TEXT'],
      ['transfer_id', 'TEXT'],
      ['refund_of_id', 'TEXT REFERENCES fin_transactions(id) ON DELETE SET NULL'],
      ['status', "TEXT NOT NULL DEFAULT 'posted'"],
      ['deleted_at', 'INTEGER'],
    ];

    for (const [column, ddl] of additions) {
      if (!(await hasColumn(driver, 'fin_transactions', column))) {
        await driver.execAsync(
          `ALTER TABLE fin_transactions ADD COLUMN ${column} ${ddl}`,
        );
      }
    }
    await driver.execAsync(KIND_INDEXES);

    // Count legacy types we cannot interpret before overwriting `kind`.
    const unknown = await driver.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM fin_transactions WHERE kind IS NULL AND type NOT IN ('expense', 'income')",
    );

    await driver.runAsync(
      `UPDATE fin_transactions
          SET kind = CASE WHEN type IN ('expense', 'income') THEN type ELSE 'expense' END
        WHERE kind IS NULL OR kind = ''`,
    );

    if ((unknown?.n ?? 0) > 0) {
      warnings.push(
        `${unknown?.n} transaction(s) had an unrecognised legacy type and were treated as expenses.`,
      );
    }

    const sign = await migrateSigns(driver, warnings);

    await setSetting(driver, SETTING_KEYS.kindsMigrated, '1');

    return { applied: !already, sign, warnings };
  });
}

/**
 * Runtime sign detection.
 *
 * Only `kind = 'expense'` rows decide the convention, because expenses are the
 * rows that must be negative. Income is checked separately and never modified.
 */
async function migrateSigns(
  driver: SqliteDriver,
  warnings: string[],
): Promise<SignMigrationStatus> {
  if ((await getSetting(driver, SETTING_KEYS.signMigrated)) === '1') {
    if ((await getSetting(driver, SETTING_KEYS.signMixed)) === '1') {
      warnings.push(
        'This ledger was flagged as having mixed expense signs. It still needs manual repair (settings key fin_repair_required).',
      );
    }
    return 'already-migrated';
  }

  const stats = await driver.getFirstAsync<{
    n: number;
    mn: number | null;
    mx: number | null;
  }>(
    "SELECT COUNT(*) AS n, MIN(amount_minor) AS mn, MAX(amount_minor) AS mx FROM fin_transactions WHERE kind = 'expense'",
  );

  const count = stats?.n ?? 0;
  const minimum = stats?.mn ?? null;
  const maximum = stats?.mx ?? null;

  let status: SignMigrationStatus;

  if (count === 0) {
    status = 'no-expenses';
  } else if (maximum !== null && maximum <= 0) {
    status = 'already-signed';
  } else if (minimum !== null && minimum >= 0) {
    const result = await driver.runAsync(
      'UPDATE fin_transactions SET amount_minor = -amount_minor WHERE kind = \'expense\' AND amount_minor > 0',
    );
    status = 'negated';
    warnings.push(
      `${result.changes} expense amount(s) were converted from positive magnitudes to signed paise.`,
    );
  } else {
    status = 'mixed';
    await setSetting(driver, SETTING_KEYS.signMixed, '1');
    await setSetting(driver, SETTING_KEYS.repairRequired, '1');
    warnings.push(
      'Expense amounts contain both positive and negative values. Nothing was changed; manual repair is required (settings key fin_repair_required).',
    );
  }

  const badIncome = await driver.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM fin_transactions WHERE kind = 'income' AND amount_minor < 0",
  );
  if ((badIncome?.n ?? 0) > 0) {
    await setSetting(driver, SETTING_KEYS.incomeSignWarning, '1');
    warnings.push(
      `${badIncome?.n} income amount(s) are negative. Nothing was changed; income must be positive.`,
    );
  }

  await setSetting(driver, SETTING_KEYS.signMigrated, '1');
  return status;
}

/**
 * Run both steps and report what actually happened.
 *
 * `userVersion` is read first and never written, so a caller can see the real
 * value rather than an assumed one.
 */
export async function runFinancialMigrations(
  driver: SqliteDriver,
  options: MigrationOptions = {},
): Promise<MigrationReport> {
  await driver.execAsync(SETTINGS_DDL);

  const versionRow = await driver.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const userVersion = versionRow?.user_version ?? 0;

  const accounts = await migrateAccounts(driver, options);
  const kinds = await migrateKinds(driver, options);
  const budgets = await migrateBudgets(driver, options);
  const bills = await migrateBills(driver, options);
  const provenance = await migrateProvenance(driver, options);

  await setSetting(driver, SETTING_KEYS.userVersionSeen, String(userVersion));
  await setSetting(driver, SETTING_KEYS.schemaVersion, '5');

  return {
    userVersion,
    applied: [
      ...(accounts.applied ? [SETTING_KEYS.accountsMigrated] : []),
      ...(kinds.applied ? [SETTING_KEYS.kindsMigrated] : []),
      ...(budgets.applied ? [SETTING_KEYS.budgetsMigrated] : []),
      ...(bills.applied ? [SETTING_KEYS.billsMigrated] : []),
      ...(provenance.applied ? [SETTING_KEYS.provenanceMigrated] : []),
    ],
    skipped: [
      ...(!accounts.applied ? [SETTING_KEYS.accountsMigrated] : []),
      ...(!kinds.applied ? [SETTING_KEYS.kindsMigrated] : []),
      ...(!budgets.applied ? [SETTING_KEYS.budgetsMigrated] : []),
      ...(!bills.applied ? [SETTING_KEYS.billsMigrated] : []),
      ...(!provenance.applied ? [SETTING_KEYS.provenanceMigrated] : []),
    ],
    defaultCashAccountId: accounts.cashAccountId,
    backfilledTransactions: accounts.backfilled,
    sign: kinds.sign,
    budgetsCreated: budgets.created,
    billsBackfilled: bills.backfilled,
    provenanceMigrated: provenance.applied,
    warnings: [...accounts.warnings, ...kinds.warnings, ...budgets.warnings, ...bills.warnings, ...provenance.warnings],
  };
}
