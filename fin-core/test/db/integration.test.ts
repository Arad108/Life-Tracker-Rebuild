import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { balanceOf, netWorth, summarise } from '../../src';
import {
  DEFAULT_CASH_ACCOUNT_ID,
  exportBackup,
  loadAccounts,
  loadTransactions,
  recordRefund,
  recordTransaction,
  recordTransfer,
  restoreBackupText,
  runFinancialMigrations,
  serialiseBackup,
} from '../../src/db';
import type { TestDatabase } from './harness';
import { countRows, createDatabase, NOVEMBER, seedLegacyFinance } from './harness';

const RUPEES = 100;

async function setupMigrated(): Promise<TestDatabase> {
  const database = createDatabase();
  await runFinancialMigrations(database.driver);
  database.db.exec(`
    INSERT INTO fin_accounts (id, name, type, opening_balance_minor, opening_day, created_at, updated_at) VALUES
      ('acc-bank', 'HDFC Savings', 'bank', 5000000, '2026-11-01', 0, 0),
      ('acc-card', 'ICICI Card', 'credit_card', 0, '2026-11-01', 0, 0),
      ('acc-invest', 'Index Fund', 'investment', 0, '2026-11-01', 0, 0);
  `);
  return database;
}

async function seedMonth(database: TestDatabase): Promise<void> {
  const driver = database.driver;

  await recordTransaction(driver, {
    id: 't-salary',
    accountId: 'acc-bank',
    kind: 'income',
    amountMinor: 80_000 * RUPEES,
    day: '2026-11-01',
    note: 'Salary',
  });
  await recordTransaction(driver, {
    id: 't-rent',
    accountId: 'acc-bank',
    kind: 'expense',
    amountMinor: -18_000 * RUPEES,
    day: '2026-11-02',
    note: 'Rent',
  });
  await recordTransaction(driver, {
    id: 't-groceries',
    accountId: 'acc-bank',
    kind: 'expense',
    amountMinor: -4_500 * RUPEES,
    day: '2026-11-05',
    note: 'Groceries',
  });
  await recordTransaction(driver, {
    id: 't-dinner',
    accountId: 'acc-card',
    kind: 'expense',
    amountMinor: -900 * RUPEES,
    day: '2026-11-06',
    note: 'Dinner',
  });

  await recordTransfer(driver, {
    transferId: 'T1',
    fromAccountId: 'acc-bank',
    toAccountId: 'acc-card',
    amountMinor: 900 * RUPEES,
    day: '2026-11-10',
    note: 'Card bill',
  });
  await recordTransfer(driver, {
    transferId: 'T2',
    fromAccountId: 'acc-bank',
    toAccountId: DEFAULT_CASH_ACCOUNT_ID,
    amountMinor: 5_000 * RUPEES,
    day: '2026-11-12',
    note: 'ATM withdrawal',
  });

  await recordRefund(driver, {
    id: 't-refund',
    accountId: 'acc-card',
    amountMinor: 900 * RUPEES,
    day: '2026-11-14',
    refundOfId: 't-dinner',
    note: 'Dinner refund',
  });

  await recordTransaction(driver, {
    id: 't-interest',
    accountId: 'acc-bank',
    kind: 'interest',
    amountMinor: -2_000 * RUPEES,
    day: '2026-11-15',
    note: 'EMI interest',
  });

  await recordTransfer(driver, {
    transferId: 'T3',
    fromAccountId: 'acc-bank',
    toAccountId: 'acc-invest',
    amountMinor: 10_000 * RUPEES,
    day: '2026-11-20',
    note: 'Monthly SIP',
  });

  await recordTransaction(driver, {
    id: 't-adjust',
    accountId: 'acc-bank',
    kind: 'adjustment',
    amountMinor: 130 * RUPEES,
    day: '2026-11-25',
    note: 'Reconciled to statement',
  });

  await recordTransfer(driver, {
    transferId: 'T4',
    fromAccountId: 'acc-bank',
    toAccountId: DEFAULT_CASH_ACCOUNT_ID,
    amountMinor: 2_000 * RUPEES,
    day: '2026-11-26',
    note: 'Sent to a friend',
    status: 'excluded',
  });

  await recordTransaction(driver, {
    id: 't-coffee',
    accountId: DEFAULT_CASH_ACCOUNT_ID,
    kind: 'expense',
    amountMinor: -300 * RUPEES,
    day: '2026-11-27',
    note: 'Coffee',
    status: 'pending',
  });
}

describe('I6 over a real database', () => {
  it('produces the expected month from rows written through I3', async () => {
    const database = await setupMigrated();
    await seedMonth(database);

    const transactions = await loadTransactions(database.driver);
    const summary = summarise(NOVEMBER, transactions);

    assert.equal(summary.income, 80_000 * RUPEES);
    assert.equal(summary.expenses, 23_700 * RUPEES);
    assert.equal(summary.refunds, 900 * RUPEES);
    assert.equal(summary.interest, 2_000 * RUPEES);
    assert.equal(summary.netSpending, 24_800 * RUPEES);
    assert.equal(summary.cashFlow, 55_200 * RUPEES);
    assert.equal(summary.savingsRate, 0.69);

    assert.equal(summary.counts.income, 1);
    assert.equal(summary.counts.expenses, 4);
    assert.equal(summary.counts.refunds, 1);

    assert.equal(summary.transfers.legs, 6, 'the excluded pair is not counted');
    assert.equal(summary.transfers.outflow, 15_900 * RUPEES);
    assert.equal(summary.transfers.inflow, 15_900 * RUPEES);
    assert.equal(summary.transfers.net, 0);
    assert.deepEqual(summary.transfers.unpairedTransferIds, []);

    database.close();
  });

  it('never lets transfers change income or spending', async () => {
    const database = await setupMigrated();
    await seedMonth(database);

    const transactions = await loadTransactions(database.driver);
    const withoutTransfers = transactions.filter((row) => row.kind !== 'transfer');

    const withTransfers = summarise(NOVEMBER, transactions);
    const without = summarise(NOVEMBER, withoutTransfers);

    assert.equal(withTransfers.income, without.income);
    assert.equal(withTransfers.expenses, without.expenses);
    assert.equal(withTransfers.refunds, without.refunds);
    assert.equal(withTransfers.netSpending, without.netSpending);
    assert.equal(withTransfers.cashFlow, without.cashFlow);

    database.close();
  });

  it('never treats a refund as income', async () => {
    const database = await setupMigrated();
    await seedMonth(database);

    const transactions = await loadTransactions(database.driver);
    const summary = summarise(NOVEMBER, transactions);

    assert.equal(summary.income, 80_000 * RUPEES);
    assert.equal(summary.refunds, 900 * RUPEES);

    const withoutRefund = summarise(
      NOVEMBER,
      transactions.filter((row) => row.kind !== 'refund'),
    );
    assert.equal(withoutRefund.income, summary.income, 'the refund never adds to income');
    assert.equal(withoutRefund.netSpending, summary.netSpending + 900 * RUPEES);

    database.close();
  });

  it('computes balances as opening plus every live movement', async () => {
    const database = await setupMigrated();
    await seedMonth(database);

    const transactions = await loadTransactions(database.driver);
    const accounts = await loadAccounts(database.driver);
    const byId = new Map(accounts.map((account) => [account.id, account]));

    const bank = byId.get('acc-bank');
    const cash = byId.get(DEFAULT_CASH_ACCOUNT_ID);
    const card = byId.get('acc-card');
    const invest = byId.get('acc-invest');
    assert.ok(bank && cash && card && invest);

    assert.equal(balanceOf(bank, transactions).value, 87_730 * RUPEES);
    assert.equal(balanceOf(cash, transactions).value, 6_700 * RUPEES);
    assert.equal(balanceOf(card, transactions).value, 900 * RUPEES);
    assert.equal(balanceOf(invest, transactions).value, 10_000 * RUPEES);

    assert.equal(netWorth(accounts, transactions).value, 105_330 * RUPEES);

    database.close();
  });

  it('keeps excluded rows in balances but out of analytics', async () => {
    const database = await setupMigrated();
    await seedMonth(database);

    const transactions = await loadTransactions(database.driver);
    const accounts = await loadAccounts(database.driver);
    const bank = accounts.find((account) => account.id === 'acc-bank');
    assert.ok(bank);

    const excluded = transactions.filter((row) => row.status === 'excluded');
    assert.equal(excluded.length, 2);

    const withExcluded = balanceOf(bank, transactions).value;
    const withoutExcluded = balanceOf(
      bank,
      transactions.filter((row) => row.status !== 'excluded'),
    ).value;
    assert.equal(withExcluded, withoutExcluded - 2_000 * RUPEES);

    assert.equal(summarise(NOVEMBER, transactions).expenses, 23_700 * RUPEES);

    database.close();
  });

  it('rejects an invalid posting without writing a row', async () => {
    const database = await setupMigrated();
    const before = countRows(database, 'fin_transactions');

    await assert.rejects(() =>
      recordTransaction(database.driver, {
        id: 'bad',
        accountId: 'acc-bank',
        kind: 'expense',
        amountMinor: 100 * RUPEES,
        day: '2026-11-02',
      }),
    );

    assert.equal(countRows(database, 'fin_transactions'), before);

    database.close();
  });
});

describe('I0 + I1 + I2 + I6 together', () => {
  it('round-trips a migrated database and keeps every total', async () => {
    const source = await setupMigrated();
    await seedMonth(source);

    const sourceRows = await loadTransactions(source.driver);
    const sourceAccounts = await loadAccounts(source.driver);
    const text = serialiseBackup(await exportBackup(source.driver));

    const target = createDatabase();
    await runFinancialMigrations(target.driver);

    const restored = await restoreBackupText(target.driver, text);
    assert.ok('status' in restored);
    if (!('status' in restored)) return;
    assert.equal(restored.status, 'restored');

    // Restore invalidates the sign ledger, so re-run detection on the new data.
    await runFinancialMigrations(target.driver);

    const targetRows = await loadTransactions(target.driver);
    const targetAccounts = await loadAccounts(target.driver);

    assert.deepEqual(summarise(NOVEMBER, targetRows), summarise(NOVEMBER, sourceRows));
    assert.deepEqual(
      targetAccounts.map((account) => account.id).sort(),
      sourceAccounts.map((account) => account.id).sort(),
    );

    const targetBank = targetAccounts.find((account) => account.id === 'acc-bank');
    assert.ok(targetBank);
    assert.equal(balanceOf(targetBank, targetRows).value, 87_730 * RUPEES);

    source.close();
    target.close();
  });

  it('restores a legacy all-positive backup and migrates it into signed data', async () => {
    const legacy = createDatabase();
    seedLegacyFinance(legacy, { sign: 'positive' });
    const text = serialiseBackup(await exportBackup(legacy.driver));

    const target = createDatabase();
    // The target schema must already have the I2 columns before a migrated
    // backup can be restored; for a legacy backup this is harmless.
    await runFinancialMigrations(target.driver);

    const restored = await restoreBackupText(target.driver, text);
    assert.ok('status' in restored);

    const report = await runFinancialMigrations(target.driver);
    assert.equal(report.sign, 'negated');

    const rows = await loadTransactions(target.driver);
    for (const row of rows) {
      if (row.kind === 'expense') {
        assert.ok(row.amountMinor < 0, `${row.id} must be negative`);
      }
    }

    const summary = summarise(NOVEMBER, rows);
    assert.equal(summary.income, 80_000 * RUPEES);
    assert.equal(summary.expenses, 22_800 * RUPEES);
    assert.equal(summary.netSpending, 22_800 * RUPEES);
    assert.equal(summary.cashFlow, 57_200 * RUPEES);

    legacy.close();
    target.close();
  });

  it('refuses a second merge of the same file after migration', async () => {
    const source = await setupMigrated();
    await seedMonth(source);
    const text = serialiseBackup(await exportBackup(source.driver));

    const target = createDatabase();
    await runFinancialMigrations(target.driver);

    const first = await restoreBackupText(target.driver, text);
    await runFinancialMigrations(target.driver);
    const second = await restoreBackupText(target.driver, text);

    assert.ok('status' in first && 'status' in second);
    if (!('status' in first) || !('status' in second)) return;
    assert.equal(first.status, 'restored');
    assert.equal(second.status, 'already-restored');

    source.close();
    target.close();
  });
});
