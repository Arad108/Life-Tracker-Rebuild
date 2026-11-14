import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CASH_ACCOUNT_ID,
  LedgerError,
  deleteRefund,
  deleteTransaction,
  loadRefundsFor,
  loadTransactions,
  recordRefund,
  recordTransaction,
  refundedTotalFor,
  runFinancialMigrations,
  updateRefund,
  updateTransaction,
} from '../../src/db';
import { summarise } from '../../src';
import type { TestDatabase } from './harness';
import { createDatabase, NOVEMBER } from './harness';

const RUPEES = 100;

async function setup(): Promise<TestDatabase> {
  const database = createDatabase();
  await runFinancialMigrations(database.driver);
  database.db.exec(`
    INSERT INTO fin_categories (id, name, kind, position) VALUES
      ('cat-dining', 'Dining', 'expense', 0),
      ('cat-rent', 'Rent', 'expense', 1),
      ('cat-salary', 'Salary', 'income', 2);
    INSERT INTO fin_accounts (id, name, type, opening_balance_minor, created_at, updated_at) VALUES
      ('acc-bank', 'Bank', 'bank', 0, 0, 0),
      ('acc-card', 'Card', 'credit_card', 0, 0, 0);
  `);
  return database;
}

async function expense(
  database: TestDatabase,
  id: string,
  amountMinor: number,
  categoryId: string | null = 'cat-dining',
  accountId = 'acc-card',
): Promise<void> {
  await recordTransaction(database.driver, {
    id,
    accountId,
    kind: 'expense',
    amountMinor: -amountMinor,
    day: '2026-11-02',
    categoryId,
  });
}

function refunded(database: TestDatabase, id: string): number {
  const row = database.db
    .prepare('SELECT amount_minor FROM fin_transactions WHERE id = ?')
    .get(id) as { amount_minor: number } | undefined;
  assert.ok(row, `missing transaction ${id}`);
  return row.amount_minor;
}

function balance(database: TestDatabase, accountId: string): number {
  const rows = database.db
    .prepare(
      'SELECT amount_minor FROM fin_transactions WHERE account_id = ? AND deleted_at IS NULL',
    )
    .all(accountId) as Array<{ amount_minor: number }>;
  return rows.reduce((total, row) => total + row.amount_minor, 0);
}

describe('I5 — recording refunds', () => {
  it('allows a full refund and keeps it out of income', async () => {
    const database = await setup();
    await expense(database, 'e1', 100_000);

    await recordRefund(database.driver, {
      id: 'r1',
      accountId: 'acc-card',
      amountMinor: 100_000,
      day: '2026-11-04',
      refundOfId: 'e1',
      note: 'Full refund',
    });

    assert.equal(await refundedTotalFor(database.driver, 'e1'), 100_000);
    assert.equal(balance(database, 'acc-card'), 0);

    const summary = summarise(NOVEMBER, await loadTransactions(database.driver));
    assert.equal(summary.income, 0);
    assert.equal(summary.expenses, 100_000);
    assert.equal(summary.refunds, 100_000);
    assert.equal(summary.netSpending, 0);

    database.close();
  });

  it('allows partial refunds up to the original amount', async () => {
    const database = await setup();
    await expense(database, 'e2', 100_000);

    await recordRefund(database.driver, {
      id: 'r2a',
      accountId: 'acc-card',
      amountMinor: 30_000,
      day: '2026-11-04',
      refundOfId: 'e2',
    });
    await recordRefund(database.driver, {
      id: 'r2b',
      accountId: 'acc-card',
      amountMinor: 70_000,
      day: '2026-11-05',
      refundOfId: 'e2',
    });

    assert.equal(await refundedTotalFor(database.driver, 'e2'), 100_000);

    await assert.rejects(
      () =>
        recordRefund(database.driver, {
          id: 'r2c',
          accountId: 'acc-card',
          amountMinor: 1,
          day: '2026-11-06',
          refundOfId: 'e2',
        }),
      (error: unknown) =>
        error instanceof LedgerError && error.code === 'refund-exceeds-expense',
    );

    database.close();
  });

  it('rejects a single refund larger than the expense', async () => {
    const database = await setup();
    await expense(database, 'e3', 50_000);

    await assert.rejects(
      () =>
        recordRefund(database.driver, {
          id: 'r3',
          accountId: 'acc-card',
          amountMinor: 50_001,
          day: '2026-11-04',
          refundOfId: 'e3',
        }),
      (error: unknown) =>
        error instanceof LedgerError && error.code === 'refund-exceeds-expense',
    );

    database.close();
  });

  it('defaults the refund category to the original expense category', async () => {
    const database = await setup();
    await expense(database, 'e4', 80_000, 'cat-rent');

    await recordRefund(database.driver, {
      id: 'r4',
      accountId: 'acc-card',
      amountMinor: 20_000,
      day: '2026-11-04',
      refundOfId: 'e4',
    });

    const row = database.db
      .prepare("SELECT category_id FROM fin_transactions WHERE id = 'r4'")
      .get() as { category_id: string };
    assert.equal(row.category_id, 'cat-rent');

    database.close();
  });

  it('refuses to refund income', async () => {
    const database = await setup();
    await recordTransaction(database.driver, {
      id: 'salary',
      accountId: 'acc-bank',
      kind: 'income',
      amountMinor: 1_000_000,
      day: '2026-11-01',
      categoryId: 'cat-salary',
    });

    await assert.rejects(
      () =>
        recordRefund(database.driver, {
          id: 'r5',
          accountId: 'acc-bank',
          amountMinor: 100_000,
          day: '2026-11-04',
          refundOfId: 'salary',
        }),
      (error: unknown) =>
        error instanceof LedgerError && error.code === 'refund-original-not-expense',
    );

    database.close();
  });

  it('refuses to refund a deleted expense', async () => {
    const database = await setup();
    await expense(database, 'e6', 100_000);
    await deleteTransaction(database.driver, 'e6');

    await assert.rejects(
      () =>
        recordRefund(database.driver, {
          id: 'r6',
          accountId: 'acc-card',
          amountMinor: 10_000,
          day: '2026-11-04',
          refundOfId: 'e6',
        }),
      (error: unknown) =>
        error instanceof LedgerError && error.code === 'refund-original-deleted',
    );

    database.close();
  });
});

describe('I5 — editing and deleting refunds', () => {
  it('edits a refund within the remaining limit', async () => {
    const database = await setup();
    await expense(database, 'e7', 100_000);
    await recordRefund(database.driver, {
      id: 'r7',
      accountId: 'acc-card',
      amountMinor: 30_000,
      day: '2026-11-04',
      refundOfId: 'e7',
    });

    await updateRefund(database.driver, { id: 'r7', amountMinor: 60_000 });
    assert.equal(refunded(database, 'r7'), 60_000);

    await assert.rejects(
      () => updateRefund(database.driver, { id: 'r7', amountMinor: 100_001 }),
      (error: unknown) =>
        error instanceof LedgerError && error.code === 'refund-exceeds-expense',
    );

    database.close();
  });

  it('re-checks the limit when a refund is moved to another expense', async () => {
    const database = await setup();
    await expense(database, 'e8a', 100_000);
    await expense(database, 'e8b', 20_000);
    await recordRefund(database.driver, {
      id: 'r8',
      accountId: 'acc-card',
      amountMinor: 50_000,
      day: '2026-11-04',
      refundOfId: 'e8a',
    });

    await assert.rejects(
      () => updateRefund(database.driver, { id: 'r8', refundOfId: 'e8b' }),
      (error: unknown) =>
        error instanceof LedgerError && error.code === 'refund-exceeds-expense',
    );

    await updateRefund(database.driver, {
      id: 'r8',
      refundOfId: 'e8b',
      amountMinor: 20_000,
    });
    assert.equal(await refundedTotalFor(database.driver, 'e8a'), 0);
    assert.equal(await refundedTotalFor(database.driver, 'e8b'), 20_000);

    database.close();
  });

  it('deleting a refund frees the limit again', async () => {
    const database = await setup();
    await expense(database, 'e9', 100_000);
    await recordRefund(database.driver, {
      id: 'r9',
      accountId: 'acc-card',
      amountMinor: 100_000,
      day: '2026-11-04',
      refundOfId: 'e9',
    });

    await deleteRefund(database.driver, 'r9');
    assert.equal(await refundedTotalFor(database.driver, 'e9'), 0);
    assert.deepEqual(await loadRefundsFor(database.driver, 'e9'), []);

    await recordRefund(database.driver, {
      id: 'r9b',
      accountId: 'acc-card',
      amountMinor: 100_000,
      day: '2026-11-05',
      refundOfId: 'e9',
    });
    assert.equal(await refundedTotalFor(database.driver, 'e9'), 100_000);

    database.close();
  });

  it('deleteTransaction soft-deletes a refund without touching the expense', async () => {
    const database = await setup();
    await expense(database, 'e10', 100_000);
    await recordRefund(database.driver, {
      id: 'r10',
      accountId: 'acc-card',
      amountMinor: 40_000,
      day: '2026-11-04',
      refundOfId: 'e10',
    });

    const result = await deleteTransaction(database.driver, 'r10');
    assert.equal(result.deleted, 1);
    assert.equal(await refundedTotalFor(database.driver, 'e10'), 0);
    assert.equal(balance(database, 'acc-card'), -100_000);

    database.close();
  });

  it('lists refunds for a transaction history', async () => {
    const database = await setup();
    await expense(database, 'e11', 100_000);
    await recordRefund(database.driver, {
      id: 'r11',
      accountId: 'acc-card',
      amountMinor: 25_000,
      day: '2026-11-04',
      refundOfId: 'e11',
    });

    const refunds = await loadRefundsFor(database.driver, 'e11');
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0]!.kind, 'refund');
    assert.equal(refunds[0]!.refundOfId, 'e11');
    assert.equal(refunds[0]!.amountMinor, 25_000);

    database.close();
  });
});

describe('I5 — original expenses with refunds', () => {
  it('blocks deleting an expense that still has refunds', async () => {
    const database = await setup();
    await expense(database, 'e12', 100_000);
    await recordRefund(database.driver, {
      id: 'r12',
      accountId: 'acc-card',
      amountMinor: 40_000,
      day: '2026-11-04',
      refundOfId: 'e12',
    });

    await assert.rejects(
      () => deleteTransaction(database.driver, 'e12'),
      (error: unknown) => error instanceof LedgerError && error.code === 'expense-has-refunds',
    );

    const row = database.db
      .prepare("SELECT deleted_at FROM fin_transactions WHERE id = 'e12'")
      .get() as { deleted_at: number | null };
    assert.equal(row.deleted_at, null);

    database.close();
  });

  it('cascades refund deletion when explicitly requested', async () => {
    const database = await setup();
    await expense(database, 'e13', 100_000);
    await recordRefund(database.driver, {
      id: 'r13',
      accountId: 'acc-card',
      amountMinor: 40_000,
      day: '2026-11-04',
      refundOfId: 'e13',
    });

    const result = await deleteTransaction(database.driver, 'e13', {
      refundStrategy: 'cascade',
    });
    assert.equal(result.deleted, 1);
    assert.equal(result.refundsDeleted, 1);
    assert.equal(await refundedTotalFor(database.driver, 'e13'), 0);
    assert.equal(balance(database, 'acc-card'), 0);

    database.close();
  });

  it('refuses to reduce an expense below what was already refunded', async () => {
    const database = await setup();
    await expense(database, 'e14', 100_000);
    await recordRefund(database.driver, {
      id: 'r14',
      accountId: 'acc-card',
      amountMinor: 40_000,
      day: '2026-11-04',
      refundOfId: 'e14',
    });

    await assert.rejects(
      () => updateTransaction(database.driver, { id: 'e14', amountMinor: -30_000 }),
      (error: unknown) =>
        error instanceof LedgerError && error.code === 'refund-exceeds-expense',
    );

    await updateTransaction(database.driver, { id: 'e14', amountMinor: -40_000 });
    assert.equal(refunded(database, 'e14'), -40_000);

    await updateTransaction(database.driver, { id: 'e14', amountMinor: -60_000 });
    assert.equal(refunded(database, 'e14'), -60_000);

    database.close();
  });

  it('refuses to change the kind of an expense that has refunds', async () => {
    const database = await setup();
    await expense(database, 'e15', 100_000);
    await recordRefund(database.driver, {
      id: 'r15',
      accountId: 'acc-card',
      amountMinor: 10_000,
      day: '2026-11-04',
      refundOfId: 'e15',
    });

    await assert.rejects(
      () => updateTransaction(database.driver, { id: 'e15', kind: 'income', amountMinor: 100_000 }),
      (error: unknown) => error instanceof LedgerError && error.code === 'expense-has-refunds',
    );

    database.close();
  });

  it('refunds reduce account balances and never inflate income', async () => {
    const database = await setup();
    await expense(database, 'e16', 100_000);
    await recordRefund(database.driver, {
      id: 'r16',
      accountId: 'acc-card',
      amountMinor: 30_000,
      day: '2026-11-04',
      refundOfId: 'e16',
    });

    assert.equal(balance(database, 'acc-card'), -70_000);

    const summary = summarise(NOVEMBER, await loadTransactions(database.driver));
    assert.equal(summary.income, 0);
    assert.equal(summary.refunds, 30_000);
    assert.equal(summary.netSpending, 70_000);

    database.close();
  });
});
