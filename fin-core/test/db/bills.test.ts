import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CASH_ACCOUNT_ID,
  LedgerError,
  cancelBill,
  createBill,
  deleteBill,
  listBills,
  loadBill,
  loadBillPayments,
  loadBillSkips,
  loadTransactions,
  loadUpcomingBills,
  recordBillPayment,
  runFinancialMigrations,
  skipBillOccurrence,
  updateBill,
} from '../../src/db';
import { billStateAt } from '../../src/bills';
import type { TestDatabase } from './harness';
import { NOVEMBER, createDatabase } from './harness';

function setup(): Promise<TestDatabase> {
  return (async () => {
    const database = createDatabase();
    await runFinancialMigrations(database.driver, { now: () => Date.UTC(2026, 10, 15, 12) });
    database.db.exec(`
      INSERT INTO fin_categories (id, name, kind, position) VALUES
        ('cat-rent', 'Rent', 'expense', 0);
      INSERT INTO fin_accounts (id, name, type, opening_balance_minor, created_at, updated_at) VALUES
        ('acc-bank', 'Bank', 'bank', 10000000, 0, 0);
    `);
    return database;
  })();
}

describe('I8 — creating and editing bills', () => {
  it('creates a bill with a next due day and loads it back', async () => {
    const database = await setup();
    const bill = await createBill(database.driver, {
      id: 'rent-bill',
      title: 'Rent',
      amountMinor: 1_800_000,
      accountId: 'acc-bank',
      categoryId: 'cat-rent',
      cadence: 'monthly',
      nextDueDay: '2026-11-01',
      toleranceDays: 3,
    });
    assert.equal(bill.id, 'rent-bill');
    assert.equal(bill.nextDueDay, '2026-11-01');
    assert.equal(bill.cadence, 'monthly');
    assert.equal((await loadBill(database.driver, 'rent-bill'))?.title, 'Rent');
    assert.equal((await listBills(database.driver)).length, 1);

    database.close();
  });

  it('updates a bill without losing its id', async () => {
    const database = await setup();
    await createBill(database.driver, {
      id: 'rent-bill',
      title: 'Rent',
      amountMinor: 1_800_000,
      accountId: 'acc-bank',
      cadence: 'monthly',
      nextDueDay: '2026-11-01',
    });

    const updated = await updateBill(database.driver, {
      id: 'rent-bill',
      amountMinor: 1_900_000,
      cadence: 'monthly',
      nextDueDay: '2026-12-01',
      variableAmount: true,
    });
    assert.equal(updated.amountMinor, 1_900_000);
    assert.equal(updated.nextDueDay, '2026-12-01');
    assert.equal(updated.variableAmount, true);

    database.close();
  });

  it('cancels a bill without deleting its payments', async () => {
    const database = await setup();
    await createBill(database.driver, {
      id: 'rent-bill',
      title: 'Rent',
      amountMinor: 1_800_000,
      accountId: 'acc-bank',
      cadence: 'monthly',
      nextDueDay: '2026-11-01',
    });
    await recordBillPayment(database.driver, {
      billId: 'rent-bill',
      paidDay: '2026-11-02',
    });
    assert.equal(await cancelBill(database.driver, 'rent-bill'), true);
    assert.equal(await cancelBill(database.driver, 'rent-bill'), false);

    const payments = await loadBillPayments(database.driver, 'rent-bill');
    assert.equal(payments.length, 1);
    const cancelled = await loadBill(database.driver, 'rent-bill');
    assert.ok(cancelled);
    assert.ok(cancelled!.cancelledAt != null);
    assert.equal(cancelled!.active, false);

    database.close();
  });

  it('rejects paying a cancelled bill', async () => {
    const database = await setup();
    await createBill(database.driver, {
      id: 'rent-bill',
      title: 'Rent',
      amountMinor: 1_800_000,
      accountId: 'acc-bank',
      cadence: 'monthly',
      nextDueDay: '2026-11-01',
    });
    await cancelBill(database.driver, 'rent-bill');

    await assert.rejects(
      () => recordBillPayment(database.driver, { billId: 'rent-bill', paidDay: '2026-11-02' }),
      (error: unknown) => error instanceof LedgerError && error.code === 'bill-cancelled',
    );

    database.close();
  });
});

describe('I8 — paying a bill', () => {
  it('creates one real transaction and advances the schedule', async () => {
    const database = await setup();
    await createBill(database.driver, {
      id: 'rent-bill',
      title: 'Rent',
      amountMinor: 1_800_000,
      accountId: 'acc-bank',
      categoryId: 'cat-rent',
      cadence: 'monthly',
      nextDueDay: '2026-11-01',
    });

    const result = await recordBillPayment(database.driver, {
      billId: 'rent-bill',
      paidDay: '2026-11-02',
      amountMinor: 1_750_000,
    });
    assert.equal(result.created, true);
    assert.equal(result.dueDay, '2026-11-01');
    assert.equal(result.amountMinor, 1_750_000);
    assert.equal(result.bill.nextDueDay, '2026-12-01');
    assert.equal(result.bill.lastPaidDay, '2026-11-02');
    assert.equal(result.bill.lastAmountMinor, 1_750_000);

    const transactions = await loadTransactions(database.driver);
    const payment = transactions.find((row) => row.id === result.transactionId);
    assert.ok(payment);
    assert.equal(payment!.kind, 'expense');
    assert.equal(payment!.amountMinor, -1_750_000);
    assert.equal(payment!.categoryId, 'cat-rent');
    assert.equal(payment!.recurringId, 'rent-bill');

    database.close();
  });

  it('is idempotent: paying twice creates one transaction', async () => {
    const database = await setup();
    await createBill(database.driver, {
      id: 'rent-bill',
      title: 'Rent',
      amountMinor: 1_800_000,
      accountId: 'acc-bank',
      cadence: 'monthly',
      nextDueDay: '2026-11-01',
    });

    const first = await recordBillPayment(database.driver, {
      billId: 'rent-bill',
      paidDay: '2026-11-02',
    });
    const second = await recordBillPayment(database.driver, {
      billId: 'rent-bill',
      paidDay: '2026-11-03',
      dueDay: '2026-11-01',
    });

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.transactionId, first.transactionId);

    const payments = await loadBillPayments(database.driver, 'rent-bill');
    assert.equal(payments.length, 1);

    const transactions = await loadTransactions(database.driver);
    const billPayments = transactions.filter((row) => row.recurringId === 'rent-bill');
    assert.equal(billPayments.length, 1);

    database.close();
  });

  it('uses the last paid amount for a variable bill when none is given', async () => {
    const database = await setup();
    await createBill(database.driver, {
      id: 'util-bill',
      title: 'Electricity',
      amountMinor: 1_000_000,
      accountId: 'acc-bank',
      cadence: 'monthly',
      nextDueDay: '2026-11-01',
      variableAmount: true,
    });
    await recordBillPayment(database.driver, {
      billId: 'util-bill',
      paidDay: '2026-11-02',
      amountMinor: 1_200_000,
    });

    // Reset next due day for a second cycle.
    await updateBill(database.driver, { id: 'util-bill', nextDueDay: '2026-12-01' });

    const result = await recordBillPayment(database.driver, {
      billId: 'util-bill',
      paidDay: '2026-12-02',
    });
    assert.equal(result.amountMinor, 1_200_000);

    database.close();
  });

  it('refuses to pay an occurrence that was skipped', async () => {
    const database = await setup();
    await createBill(database.driver, {
      id: 'rent-bill',
      title: 'Rent',
      amountMinor: 1_800_000,
      accountId: 'acc-bank',
      cadence: 'monthly',
      nextDueDay: '2026-11-01',
    });
    await skipBillOccurrence(database.driver, {
      billId: 'rent-bill',
      dueDay: '2026-11-01',
      reason: 'waived',
    });

    await assert.rejects(
      () => recordBillPayment(database.driver, { billId: 'rent-bill', paidDay: '2026-11-02', dueDay: '2026-11-01' }),
      (error: unknown) => error instanceof LedgerError && error.code === 'bill-skipped',
    );

    const skips = await loadBillSkips(database.driver, 'rent-bill');
    assert.equal(skips.length, 1);
    assert.equal(skips[0]!.reason, 'waived');

    database.close();
  });

  it('skipping the same occurrence twice is idempotent', async () => {
    const database = await setup();
    await createBill(database.driver, {
      id: 'rent-bill',
      title: 'Rent',
      amountMinor: 1_800_000,
      accountId: 'acc-bank',
      cadence: 'monthly',
      nextDueDay: '2026-11-01',
    });
    const first = await skipBillOccurrence(database.driver, { billId: 'rent-bill', dueDay: '2026-11-01' });
    const second = await skipBillOccurrence(database.driver, { billId: 'rent-bill', dueDay: '2026-11-01' });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal((await loadBillSkips(database.driver, 'rent-bill')).length, 1);

    database.close();
  });

  it('lists upcoming unpaid occurrences across bills', async () => {
    const database = await setup();
    await createBill(database.driver, {
      id: 'rent-bill',
      title: 'Rent',
      amountMinor: 1_800_000,
      accountId: 'acc-bank',
      cadence: 'monthly',
      nextDueDay: '2026-11-01',
    });
    await createBill(database.driver, {
      id: 'gym-bill',
      title: 'Gym',
      amountMinor: 2_000_000,
      accountId: 'acc-bank',
      cadence: 'monthly',
      nextDueDay: '2026-11-05',
    });

    const upcoming = await loadUpcomingBills(database.driver, {
      from: '2026-11-01',
      to: '2026-11-30',
      asOf: '2026-11-01',
    });
    assert.equal(upcoming.length, 2);
    assert.ok(upcoming.every((entry) => entry.state === 'due' || entry.state === 'upcoming' || entry.state === 'overdue'));

    database.close();
  });

  it('reports an overdue state for an unpaid past-due bill', async () => {
    const database = await setup();
    const bill = await createBill(database.driver, {
      id: 'rent-bill',
      title: 'Rent',
      amountMinor: 1_800_000,
      accountId: 'acc-bank',
      cadence: 'monthly',
      nextDueDay: '2026-11-01',
      toleranceDays: 2,
    });
    assert.equal(billStateAt(bill, '2026-11-10'), 'overdue');

    database.close();
  });
});
