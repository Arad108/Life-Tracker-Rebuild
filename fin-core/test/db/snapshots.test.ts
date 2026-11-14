import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSnapshot,
  ensureMonthlySnapshot,
  getSnapshot,
  listSnapshots,
  loadAccounts,
  loadTransactions,
  runFinancialMigrations,
} from '../../src/db';
import { compareNetWorth } from '../../src/networth';
import type { TestDatabase } from './harness';
import { createDatabase } from './harness';

function setup(): Promise<TestDatabase> {
  return (async () => {
    const database = createDatabase();
    await runFinancialMigrations(database.driver, { now: () => Date.UTC(2026, 10, 15, 12) });
    database.db.exec(`
      INSERT INTO fin_accounts (id, name, type, opening_balance_minor, created_at, updated_at) VALUES
        ('acc-bank', 'Bank', 'bank', 5000000, 0, 0),
        ('acc-card', 'Card', 'credit_card', 0, 0, 0);
    `);
    return database;
  })();
}

describe('I10 — snapshots', () => {
  it('creates a snapshot and returns created: true', async () => {
    const database = await setup();
    const result = await createSnapshot(database.driver, {
      periodKind: 'month',
      periodKey: '2026-11',
      asOfDay: '2026-11-15',
      now: () => Date.UTC(2026, 10, 15, 12),
    });
    assert.equal(result.created, true);
    assert.equal(result.snapshot.periodKey, '2026-11');
    assert.equal(result.snapshot.asOfDay, '2026-11-15');
    assert.equal((await getSnapshot(database.driver, 'month', '2026-11'))?.id, result.snapshot.id);

    database.close();
  });

  it('is idempotent: a second create returns the first unchanged', async () => {
    const database = await setup();
    const first = await createSnapshot(database.driver, {
      periodKey: '2026-11',
      asOfDay: '2026-11-15',
      now: () => Date.UTC(2026, 10, 15, 12),
    });
    const second = await createSnapshot(database.driver, {
      periodKey: '2026-11',
      asOfDay: '2026-11-20',
      now: () => Date.UTC(2026, 10, 20, 12),
    });
    assert.equal(second.created, false);
    assert.equal(second.snapshot.asOfDay, first.snapshot.asOfDay);
    assert.equal(second.snapshot.netWorthMinor, first.snapshot.netWorthMinor);
    assert.equal((await listSnapshots(database.driver)).length, 1);

    database.close();
  });

  it('stays historically stable when a back-dated transaction is added later', async () => {
    const database = await setup();
    const first = await createSnapshot(database.driver, {
      periodKey: '2026-11',
      asOfDay: '2026-11-15',
      now: () => Date.UTC(2026, 10, 15, 12),
    });

    // Add a back-dated transaction after the snapshot was taken.
    database.db.exec(`
      INSERT INTO fin_transactions
        (id, type, kind, amount_minor, occurred_at, day, created_at, updated_at, account_id, status)
      VALUES ('late', 'expense', 'expense', -500000, 0, '2026-11-10', 0, 0, 'acc-bank', 'posted');
    `);

    const second = await createSnapshot(database.driver, {
      periodKey: '2026-11',
      asOfDay: '2026-11-15',
      now: () => Date.UTC(2026, 10, 20, 12),
    });
    assert.equal(second.created, false);
    assert.equal(second.snapshot.netWorthMinor, first.snapshot.netWorthMinor);
    assert.equal(second.snapshot.asOfDay, '2026-11-15');

    // An explicit overwrite is the only way to change it.
    const overwritten = await createSnapshot(database.driver, {
      periodKey: '2026-11',
      asOfDay: '2026-11-20',
      now: () => Date.UTC(2026, 10, 20, 12),
      overwrite: true,
    });
    assert.equal(overwritten.created, true);
    assert.notEqual(overwritten.snapshot.netWorthMinor, first.snapshot.netWorthMinor);

    database.close();
  });

  it('ensureMonthlySnapshot is idempotent across repeated runs', async () => {
    const database = await setup();
    const first = await ensureMonthlySnapshot(database.driver, {
      month: '2026-11',
      asOfDay: '2026-11-30',
      now: () => Date.UTC(2026, 10, 15, 12),
    });
    const second = await ensureMonthlySnapshot(database.driver, {
      month: '2026-11',
      asOfDay: '2026-11-30',
      now: () => Date.UTC(2026, 10, 20, 12),
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal((await listSnapshots(database.driver)).length, 1);

    database.close();
  });

  it('compares two snapshots without reading current balances', async () => {
    const database = await setup();
    await createSnapshot(database.driver, {
      periodKey: '2026-10',
      asOfDay: '2026-10-31',
      now: () => Date.UTC(2026, 9, 31, 12),
    });
    await createSnapshot(database.driver, {
      periodKey: '2026-11',
      asOfDay: '2026-11-30',
      now: () => Date.UTC(2026, 10, 30, 12),
    });

    const october = (await getSnapshot(database.driver, 'month', '2026-10'))!;
    const november = (await getSnapshot(database.driver, 'month', '2026-11'))!;
    const comparison = compareNetWorth(october, november);
    assert.equal(comparison.direction, comparison.deltaMinor > 0 ? 'up' : comparison.deltaMinor < 0 ? 'down' : 'flat');
    assert.equal(comparison.fromPeriodKey, '2026-10');
    assert.equal(comparison.toPeriodKey, '2026-11');

    database.close();
  });
});
