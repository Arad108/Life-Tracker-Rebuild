import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  queryTransactions,
  restoreTransaction,
  runFinancialMigrations,
} from '../../src/db';
import type { TestDatabase } from './harness';
import { createDatabase, seedLegacyFinance } from './harness';

async function setup(): Promise<TestDatabase> {
  const database = createDatabase();
  seedLegacyFinance(database);
  await runFinancialMigrations(database.driver);
  return database;
}

describe('I12 — transaction history', () => {
  it('paginates and reports totals', async () => {
    const database = await setup();
    const page = await queryTransactions(database.driver, { limit: 2, offset: 0 });
    assert.equal(page.rows.length, 2);
    assert.equal(page.limit, 2);
    assert.equal(page.offset, 0);
    assert.equal(page.total, 4);
    assert.equal(page.hasMore, true);

    const second = await queryTransactions(database.driver, { limit: 2, offset: 2 });
    assert.equal(second.rows.length, 2);
    assert.equal(second.hasMore, false);

    database.close();
  });

  it('filters by kind and account', async () => {
    const database = await setup();
    const expenses = await queryTransactions(database.driver, { kinds: ['expense'] });
    assert.equal(expenses.total, 3);
    assert.ok(expenses.rows.every((row) => row.kind === 'expense'));

    const cash = await queryTransactions(database.driver, { accountId: 'acc_cash_default' });
    assert.equal(cash.total, 4);

    database.close();
  });

  it('searches notes and payees', async () => {
    const database = await setup();
    const result = await queryTransactions(database.driver, { search: 'Rent' });
    assert.equal(result.total, 1);
    assert.equal(result.rows[0]!.note, 'Rent');

    database.close();
  });

  it('sorts by amount', async () => {
    const database = await setup();
    const result = await queryTransactions(database.driver, { sortBy: 'amount', sortDirection: 'asc', limit: 10 });
    assert.equal(result.total, 4);
    // First row should be the smallest (most negative) amount.
    assert.ok(result.rows[0]!.amountMinor <= result.rows[1]!.amountMinor);

    database.close();
  });

  it('restores a soft-deleted transaction', async () => {
    const database = await setup();
    const deleted = await (async () => {
      const { deleteTransaction } = await import('../../src/db');
      return deleteTransaction(database.driver, 't-rent');
    })();
    assert.equal(deleted.deleted, 1);

    const before = await queryTransactions(database.driver, { includeDeleted: false });
    assert.equal(before.total, 3);

    const restored = await restoreTransaction(database.driver, 't-rent');
    assert.equal(restored, true);

    const after = await queryTransactions(database.driver, { includeDeleted: false });
    assert.equal(after.total, 4);

    database.close();
  });
});
