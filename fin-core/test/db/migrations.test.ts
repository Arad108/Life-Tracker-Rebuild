import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CASH_ACCOUNT_ID,
  FIN_ACCOUNTS_DDL,
  LedgerError,
  migrateAccounts,
  recordRefund,
  recordTransaction,
  recordTransfer,
  runFinancialMigrations,
  SETTING_KEYS,
} from '../../src/db';
import { countRows, createDatabase, readSetting, seedLegacyFinance } from './harness';

function amountOf(database: ReturnType<typeof createDatabase>, id: string): number {
  const row = database.db
    .prepare('SELECT amount_minor FROM fin_transactions WHERE id = ?')
    .get(id) as { amount_minor: number } | undefined;
  assert.ok(row, `missing transaction ${id}`);
  return row.amount_minor;
}

function columnNames(database: ReturnType<typeof createDatabase>, table: string): string[] {
  return (
    database.db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>
  ).map((column) => column.name);
}

describe('I1 — accounts and backfill', () => {
  it('creates the default Cash account and backfills every transaction', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);

    const report = await runFinancialMigrations(database.driver);

    assert.equal(report.defaultCashAccountId, DEFAULT_CASH_ACCOUNT_ID);
    assert.equal(countRows(database, 'fin_accounts'), 1);

    const cash = database.db
      .prepare("SELECT id, name, type FROM fin_accounts WHERE type = 'cash'")
      .get() as { id: string; name: string; type: string };
    assert.equal(cash.id, DEFAULT_CASH_ACCOUNT_ID);
    assert.equal(cash.name, 'Cash');
    assert.equal(cash.type, 'cash');

    assert.equal(report.backfilledTransactions, 4);
    const unassigned = database.db
      .prepare('SELECT COUNT(*) AS n FROM fin_transactions WHERE account_id IS NULL')
      .get() as { n: number };
    assert.equal(unassigned.n, 0);

    database.close();
  });

  it('is idempotent: running twice adds no account and changes nothing', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);

    const first = await runFinancialMigrations(database.driver);
    const snapshot = database.db
      .prepare('SELECT id, account_id, amount_minor FROM fin_transactions ORDER BY id')
      .all();

    const second = await runFinancialMigrations(database.driver);

    assert.equal(countRows(database, 'fin_accounts'), 1);
    assert.equal(second.backfilledTransactions, 0);
    assert.deepEqual(second.applied, []);
    assert.deepEqual(
      database.db.prepare('SELECT id, account_id, amount_minor FROM fin_transactions ORDER BY id').all(),
      snapshot,
    );
    assert.equal(first.defaultCashAccountId, second.defaultCashAccountId);

    database.close();
  });

  it('preserves transaction history and categories', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);

    const before = database.db
      .prepare('SELECT id, type, day, note, category_id FROM fin_transactions ORDER BY id')
      .all();

    await runFinancialMigrations(database.driver);

    assert.deepEqual(
      database.db
        .prepare('SELECT id, type, day, note, category_id FROM fin_transactions ORDER BY id')
        .all(),
      before,
    );
    assert.equal(countRows(database, 'fin_categories'), 4);

    database.close();
  });

  it('reuses an existing cash account instead of creating a second one', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    database.db.exec(FIN_ACCOUNTS_DDL);
    database.db.exec(`
      INSERT INTO fin_accounts (id, name, type, created_at, updated_at)
      VALUES ('acc-existing-cash', 'Wallet cash', 'cash', 1, 1);
    `);

    const report = await runFinancialMigrations(database.driver);

    assert.equal(report.defaultCashAccountId, 'acc-existing-cash');
    assert.equal(countRows(database, 'fin_accounts'), 1);
    const row = database.db
      .prepare("SELECT account_id FROM fin_transactions WHERE id = 't-rent'")
      .get() as { account_id: string };
    assert.equal(row.account_id, 'acc-existing-cash');

    database.close();
  });

  it('reads user_version but never writes it', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    database.db.exec('PRAGMA user_version = 7');

    const report = await runFinancialMigrations(database.driver);

    assert.equal(report.userVersion, 7);
    const after = database.db.prepare('PRAGMA user_version').get() as { user_version: number };
    assert.equal(after.user_version, 7);
    assert.equal(readSetting(database, SETTING_KEYS.userVersionSeen), '7');

    database.close();
  });

  it('adds account_id without dropping the legacy schema', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    await runFinancialMigrations(database.driver);

    const columns = columnNames(database, 'fin_transactions');
    for (const name of ['id', 'type', 'amount_minor', 'day', 'account_id']) {
      assert.ok(columns.includes(name), `missing column ${name}`);
    }

    database.close();
  });
});

describe('I2 — kinds and signed amounts', () => {
  it('adds every I2 column', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    await runFinancialMigrations(database.driver);

    const columns = columnNames(database, 'fin_transactions');
    for (const name of ['kind', 'transfer_id', 'refund_of_id', 'status', 'deleted_at']) {
      assert.ok(columns.includes(name), `missing column ${name}`);
    }

    database.close();
  });

  it('backfills kind from the legacy type', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    await runFinancialMigrations(database.driver);

    const rows = database.db
      .prepare('SELECT id, kind FROM fin_transactions ORDER BY id')
      .all() as Array<{ id: string; kind: string }>;
    const kinds = Object.fromEntries(rows.map((row) => [row.id, row.kind]));

    assert.equal(kinds['t-salary'], 'income');
    assert.equal(kinds['t-rent'], 'expense');
    assert.equal(kinds['t-groceries'], 'expense');

    database.close();
  });

  it('negates expenses when the legacy data is all positive', async () => {
    const database = createDatabase();
    seedLegacyFinance(database, { sign: 'positive' });

    const report = await runFinancialMigrations(database.driver);

    assert.equal(report.sign, 'negated');
    assert.equal(amountOf(database, 't-salary'), 8_000_000, 'income stays positive');
    assert.equal(amountOf(database, 't-rent'), -1_800_000);
    assert.equal(amountOf(database, 't-groceries'), -450_000);
    assert.equal(amountOf(database, 't-coffee'), -30_000);

    database.close();
  });

  it('does nothing when the data is already signed', async () => {
    const database = createDatabase();
    seedLegacyFinance(database, { sign: 'signed' });
    const before = database.db
      .prepare('SELECT id, amount_minor FROM fin_transactions ORDER BY id')
      .all();

    const report = await runFinancialMigrations(database.driver);

    assert.equal(report.sign, 'already-signed');
    assert.deepEqual(
      database.db.prepare('SELECT id, amount_minor FROM fin_transactions ORDER BY id').all(),
      before,
    );

    database.close();
  });

  it('refuses to guess when the signs are mixed', async () => {
    const database = createDatabase();
    seedLegacyFinance(database, { sign: 'mixed' });
    const before = database.db
      .prepare('SELECT id, amount_minor FROM fin_transactions ORDER BY id')
      .all();

    const report = await runFinancialMigrations(database.driver);

    assert.equal(report.sign, 'mixed');
    assert.deepEqual(
      database.db.prepare('SELECT id, amount_minor FROM fin_transactions ORDER BY id').all(),
      before,
      'no financial data may be modified',
    );
    assert.equal(readSetting(database, SETTING_KEYS.signMixed), '1');
    assert.equal(readSetting(database, SETTING_KEYS.repairRequired), '1');
    assert.ok(report.warnings.some((warning) => warning.includes('manual repair')));

    database.close();
  });

  it('reports no-expenses when there is nothing to convert', async () => {
    const database = createDatabase();
    database.db.exec(`
      INSERT INTO fin_transactions (id, type, amount_minor, occurred_at, day, created_at, updated_at)
      VALUES ('t-only-income', 'income', 100000, 0, '2026-11-01', 0, 0);
    `);

    const report = await runFinancialMigrations(database.driver);

    assert.equal(report.sign, 'no-expenses');
    assert.equal(amountOf(database, 't-only-income'), 100_000);

    database.close();
  });

  it('never runs the sign migration twice, even if data later looks wrong', async () => {
    const database = createDatabase();
    seedLegacyFinance(database, { sign: 'positive' });

    const first = await runFinancialMigrations(database.driver);
    assert.equal(first.sign, 'negated');

    // Simulate a bad edit after the migration.
    database.db.exec("UPDATE fin_transactions SET amount_minor = 1800000 WHERE id = 't-rent'");

    const second = await runFinancialMigrations(database.driver);

    assert.equal(second.sign, 'already-migrated');
    assert.equal(amountOf(database, 't-rent'), 1_800_000, 'the guard prevents a second negation');

    database.close();
  });

  it('warns about negative income without modifying it', async () => {
    const database = createDatabase();
    seedLegacyFinance(database, { sign: 'positive' });
    database.db.exec("UPDATE fin_transactions SET amount_minor = -8000000 WHERE id = 't-salary'");

    const report = await runFinancialMigrations(database.driver);

    assert.equal(amountOf(database, 't-salary'), -8_000_000);
    assert.equal(readSetting(database, SETTING_KEYS.incomeSignWarning), '1');
    assert.ok(report.warnings.some((warning) => warning.includes('income')));

    database.close();
  });

  it('treats an unrecognised legacy type as an expense and says so', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    database.db.exec(`
      INSERT INTO fin_transactions (id, type, amount_minor, occurred_at, day, created_at, updated_at)
      VALUES ('t-bonus', 'bonus', 100000, 0, '2026-11-10', 0, 0);
    `);

    const report = await runFinancialMigrations(database.driver);

    const row = database.db
      .prepare("SELECT kind FROM fin_transactions WHERE id = 't-bonus'")
      .get() as { kind: string };
    assert.equal(row.kind, 'expense');
    assert.ok(report.warnings.some((warning) => warning.includes('unrecognised')));

    database.close();
  });

  it('exposes a repair flag that a user can act on', async () => {
    const database = createDatabase();
    seedLegacyFinance(database, { sign: 'mixed' });
    await runFinancialMigrations(database.driver);

    assert.equal(readSetting(database, SETTING_KEYS.repairRequired), '1');

    // A repair clears the flags, and the next run re-detects from the data.
    database.db.exec(`
      DELETE FROM settings WHERE key IN ('${SETTING_KEYS.repairRequired}', '${SETTING_KEYS.signMixed}', '${SETTING_KEYS.signMigrated}');
      UPDATE fin_transactions SET amount_minor = -1800000 WHERE id = 't-rent';
      UPDATE fin_transactions SET amount_minor = -450000 WHERE id = 't-groceries';
      UPDATE fin_transactions SET amount_minor = -30000 WHERE id = 't-coffee';
    `);

    const report = await runFinancialMigrations(database.driver);
    assert.equal(report.sign, 'already-signed');

    database.close();
  });
});

describe('I2 — transfer and refund writes', () => {
  it('records a transfer as a balanced pair', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    const report = await runFinancialMigrations(database.driver);
    const cashId = report.defaultCashAccountId!;
    database.db.exec(`
      INSERT INTO fin_accounts (id, name, type, opening_balance_minor, created_at, updated_at)
      VALUES ('acc-bank', 'Bank', 'bank', 5000000, 0, 0);
    `);

    const transfer = await recordTransfer(database.driver, {
      transferId: 'T1',
      fromAccountId: 'acc-bank',
      toAccountId: cashId,
      amountMinor: 500_000,
      day: '2026-11-12',
      note: 'ATM',
    });

    const legs = database.db
      .prepare('SELECT id, account_id, kind, amount_minor, transfer_id FROM fin_transactions WHERE transfer_id = ? ORDER BY amount_minor')
      .all('T1') as Array<{ id: string; account_id: string; kind: string; amount_minor: number; transfer_id: string }>;

    assert.equal(legs.length, 2);
    assert.equal(legs[0]!.amount_minor, -500_000);
    assert.equal(legs[1]!.amount_minor, 500_000);
    assert.equal(legs[0]!.amount_minor + legs[1]!.amount_minor, 0);
    assert.equal(legs[0]!.kind, 'transfer');
    assert.equal(legs[0]!.transfer_id, 'T1');
    assert.deepEqual(transfer.ids, ['T1:from', 'T1:to']);

    database.close();
  });

  it('records a refund as a positive row linked to its expense', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    await runFinancialMigrations(database.driver);
    database.db.exec(`
      INSERT INTO fin_accounts (id, name, type, created_at, updated_at)
      VALUES ('acc-bank', 'Bank', 'bank', 0, 0);
    `);

    await recordRefund(database.driver, {
      id: 'r1',
      accountId: 'acc-bank',
      amountMinor: 100_000,
      day: '2026-11-14',
      refundOfId: 't-rent',
      note: 'Partial refund',
    });

    const row = database.db
      .prepare("SELECT kind, amount_minor, refund_of_id FROM fin_transactions WHERE id = 'r1'")
      .get() as { kind: string; amount_minor: number; refund_of_id: string };

    assert.equal(row.kind, 'refund');
    assert.equal(row.amount_minor, 100_000);
    assert.equal(row.refund_of_id, 't-rent');

    database.close();
  });

  it('rejects a refund whose original is not an expense', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    await runFinancialMigrations(database.driver);

    await assert.rejects(
      () =>
        recordRefund(database.driver, {
          id: 'r-bad',
          accountId: DEFAULT_CASH_ACCOUNT_ID,
          amountMinor: 100_000,
          day: '2026-11-14',
          refundOfId: 't-salary',
        }),
      (error: unknown) =>
        error instanceof LedgerError && error.code === 'refund-original-not-expense',
    );

    database.close();
  });

  it('rejects an invalid posting before it reaches the database', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    await runFinancialMigrations(database.driver);
    const before = countRows(database, 'fin_transactions');

    await assert.rejects(
      () =>
        recordTransaction(database.driver, {
          id: 'bad-positive-expense',
          accountId: DEFAULT_CASH_ACCOUNT_ID,
          kind: 'expense',
          amountMinor: 100_000,
          day: '2026-11-02',
        }),
      (error: unknown) => error instanceof LedgerError && error.code === 'sign',
    );

    assert.equal(countRows(database, 'fin_transactions'), before);

    database.close();
  });

  it('rejects an expense posted to a loan', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    await runFinancialMigrations(database.driver);
    database.db.exec(`
      INSERT INTO fin_accounts (id, name, type, created_at, updated_at)
      VALUES ('acc-loan', 'Car loan', 'loan', 0, 0);
    `);

    await assert.rejects(
      () =>
        recordTransaction(database.driver, {
          id: 'bad-loan-expense',
          accountId: 'acc-loan',
          kind: 'expense',
          amountMinor: -100_000,
          day: '2026-11-02',
        }),
      (error: unknown) => error instanceof LedgerError && error.code === 'account-type',
    );

    database.close();
  });
});

describe('migration entry points', () => {
  it('migrateAccounts alone is safe to call repeatedly', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);

    const first = await migrateAccounts(database.driver);
    const second = await migrateAccounts(database.driver);

    assert.equal(first.cashAccountId, second.cashAccountId);
    assert.equal(countRows(database, 'fin_accounts'), 1);

    database.close();
  });
});
