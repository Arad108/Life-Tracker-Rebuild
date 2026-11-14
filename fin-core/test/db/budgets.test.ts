import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CASH_ACCOUNT_ID,
  SETTING_KEYS,
  budgetIdFor,
  clearBudget,
  countBudgetRows,
  exportBackup,
  getBudget,
  listBudgets,
  loadTransactions,
  migrateBudgets,
  recordRefund,
  recordTransaction,
  restoreBackupText,
  runFinancialMigrations,
  serialiseBackup,
  setBudget,
} from '../../src/db';
import { budgetProgress, summariseBudgets } from '../../src/budgets';
import type { BudgetPeriod } from '../../src/budgets';
import type { TestDatabase } from './harness';
import { NOVEMBER, createDatabase, readSetting, seedLegacyFinance } from './harness';

const RUPEES = 100;
const NOV_15 = Date.UTC(2026, 10, 15, 12);

const MONTH: BudgetPeriod = { kind: 'month', month: '2026-11' };

function now(): number {
  return NOV_15;
}

/** Categories only: no legacy transactions, so spending assertions stay exact. */
function seedCategories(database: TestDatabase): void {
  database.db.exec(`
    INSERT INTO fin_categories (id, name, kind, position) VALUES
      ('cat-rent', 'Rent', 'expense', 0),
      ('cat-groceries', 'Groceries', 'expense', 1),
      ('cat-coffee', 'Coffee', 'expense', 2);
  `);
}

/** Warnings raised by the budget step, ignoring the account/sign steps. */
function budgetWarnings(warnings: readonly string[]): string[] {
  return warnings.filter((warning) => /budget/i.test(warning));
}

function insertGoal(
  database: TestDatabase,
  id: string,
  metric: string,
  target: number,
  title = 'Monthly budget',
): void {
  database.db
    .prepare(
      `INSERT INTO goals (id, title, space_key, metric, kind, target, period, created_at, updated_at)
       VALUES (?, ?, 'finance', ?, 'limit', ?, 'month', 0, 0)`,
    )
    .run(id, title, metric, target);
}

describe('I7 — budget records', () => {
  it('stores one record per category and period, keyed deterministically', async () => {
    const database = createDatabase();
    seedCategories(database);
    await runFinancialMigrations(database.driver, { now });

    const overall = await setBudget(
      database.driver,
      { categoryId: null, period: MONTH, amountMinor: 2_000_000 },
      { now },
    );
    assert.equal(overall.id, 'bud_all_month_2026-11');
    assert.equal(overall.categoryId, null);
    assert.equal(overall.amountMinor, 2_000_000);
    assert.deepEqual(overall.period, MONTH);

    const rent = await setBudget(
      database.driver,
      { categoryId: 'cat-rent', period: MONTH, amountMinor: 1_800_000 },
      { now },
    );
    assert.equal(rent.id, budgetIdFor('cat-rent', MONTH));
    assert.equal(rent.id, 'bud_cat-rent_month_2026-11');

    // Writing the same slot again updates, never duplicates.
    const updated = await setBudget(
      database.driver,
      { categoryId: 'cat-rent', period: MONTH, amountMinor: 1_900_000 },
      { now: () => NOV_15 + 1_000 },
    );
    assert.equal(updated.id, rent.id);
    assert.equal(updated.amountMinor, 1_900_000);
    assert.equal(await countBudgetRows(database.driver), 2);

    const fetched = await getBudget(database.driver, {
      categoryId: 'cat-rent',
      period: MONTH,
    });
    assert.equal(fetched?.amountMinor, 1_900_000);
    assert.equal(
      await getBudget(database.driver, { categoryId: 'cat-nope', period: MONTH }),
      null,
    );

    database.close();
  });

  it('rejects zero, negative, fractional and oversized budgets', async () => {
    const database = createDatabase();
    await runFinancialMigrations(database.driver, { now });

    for (const amountMinor of [0, -1, 12.5, Number.NaN, 20_000_000_000]) {
      await assert.rejects(
        () => setBudget(database.driver, { categoryId: null, period: MONTH, amountMinor }),
        RangeError,
      );
    }
    assert.equal(await countBudgetRows(database.driver), 0);

    database.close();
  });

  it('keeps past periods intact when a future period is edited', async () => {
    const database = createDatabase();
    await runFinancialMigrations(database.driver, { now });

    await setBudget(
      database.driver,
      { categoryId: null, period: { kind: 'month', month: '2026-11' }, amountMinor: 2_000_000 },
      { now },
    );
    await setBudget(
      database.driver,
      { categoryId: null, period: { kind: 'month', month: '2026-12' }, amountMinor: 3_000_000 },
      { now },
    );

    // A future edit must not rewrite November.
    await setBudget(
      database.driver,
      { categoryId: null, period: { kind: 'month', month: '2026-12' }, amountMinor: 5_000_000 },
      { now },
    );

    const november = await getBudget(database.driver, {
      categoryId: null,
      period: { kind: 'month', month: '2026-11' },
    });
    const december = await getBudget(database.driver, {
      categoryId: null,
      period: { kind: 'month', month: '2026-12' },
    });
    assert.equal(november?.amountMinor, 2_000_000);
    assert.equal(december?.amountMinor, 5_000_000);
    assert.equal(await countBudgetRows(database.driver), 2);

    database.close();
  });

  it('supports custom periods alongside months', async () => {
    const database = createDatabase();
    seedCategories(database);
    await runFinancialMigrations(database.driver, { now });

    const custom: BudgetPeriod = { kind: 'custom', from: '2026-11-05', to: '2026-11-20' };
    const record = await setBudget(
      database.driver,
      { categoryId: 'cat-groceries', period: custom, amountMinor: 400_000 },
      { now },
    );
    assert.equal(record.id, 'bud_cat-groceries_custom_2026-11-05_2026-11-20');
    assert.deepEqual(record.period, custom);

    assert.equal(
      await getBudget(database.driver, { categoryId: 'cat-groceries', period: custom })
        .then((row) => row?.amountMinor),
      400_000,
    );

    const overlapping = await listBudgets(database.driver, {
      from: '2026-11-15',
      to: '2026-11-25',
    });
    assert.deepEqual(overlapping.map((row) => row.id), [record.id]);

    const disjoint = await listBudgets(database.driver, {
      from: '2026-12-01',
      to: '2026-12-31',
    });
    assert.deepEqual(disjoint, []);

    database.close();
  });

  it('lists by category and by exact period, and clears one slot at a time', async () => {
    const database = createDatabase();
    seedCategories(database);
    await runFinancialMigrations(database.driver, { now });

    await setBudget(
      database.driver,
      { categoryId: null, period: MONTH, amountMinor: 2_000_000 },
      { now },
    );
    await setBudget(
      database.driver,
      { categoryId: 'cat-rent', period: MONTH, amountMinor: 1_800_000 },
      { now },
    );
    await setBudget(
      database.driver,
      { categoryId: 'cat-rent', period: { kind: 'month', month: '2026-12' }, amountMinor: 1_900_000 },
      { now },
    );

    assert.deepEqual(
      (await listBudgets(database.driver, { categoryId: 'cat-rent' })).map((row) => row.id),
      ['bud_cat-rent_month_2026-11', 'bud_cat-rent_month_2026-12'],
    );
    assert.deepEqual(
      (await listBudgets(database.driver, { period: MONTH })).map((row) => row.id),
      ['bud_all_month_2026-11', 'bud_cat-rent_month_2026-11'],
    );

    assert.equal(await clearBudget(database.driver, { categoryId: 'cat-rent', period: MONTH }), true);
    assert.equal(await clearBudget(database.driver, { categoryId: 'cat-rent', period: MONTH }), false);
    assert.equal(await countBudgetRows(database.driver), 2);

    database.close();
  });
});

describe('I7 — migrating the old mutable budgets', () => {
  it('copies goal budgets and the legacy category column into records', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    insertGoal(database, 'goal-overall', 'spend', 25_000, 'Monthly budget');
    insertGoal(database, 'goal-rent', 'spend:cat:cat-rent', 18_000, 'Rent budget');
    insertGoal(database, 'goal-other', 'steps', 10_000, 'Walk more');
    database.db
      .prepare("UPDATE fin_categories SET budget_minor = ? WHERE id = 'cat-groceries'")
      .run(4_500 * RUPEES);

    const report = await runFinancialMigrations(database.driver, { now });
    assert.ok(report.applied.includes(SETTING_KEYS.budgetsMigrated));
    assert.equal(report.budgetsCreated, 3);
    assert.deepEqual(budgetWarnings(report.warnings), []);

    const budgets = await listBudgets(database.driver);
    assert.deepEqual(
      budgets.map((row) => [row.categoryId, row.amountMinor]).sort(),
      [
        ['cat-groceries', 450_000],
        ['cat-rent', 1_800_000],
        [null, 2_500_000],
      ].sort(),
    );
    assert.ok(budgets.every((row) => row.period.kind === 'month' && row.period.month === '2026-11'));

    // The original goal is left in place; the new UI simply stops reading it.
    const goals = database.db.prepare('SELECT COUNT(*) AS n FROM goals').get() as { n: number };
    assert.equal(goals.n, 3);
    assert.equal(await countBudgetRows(database.driver), 3);

    database.close();
  });

  it('is idempotent and does not overwrite an edited record', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    insertGoal(database, 'goal-overall', 'spend', 25_000);

    await runFinancialMigrations(database.driver, { now });
    await setBudget(
      database.driver,
      { categoryId: null, period: MONTH, amountMinor: 3_000_000 },
      { now },
    );

    const second = await migrateBudgets(database.driver, { now });
    assert.equal(second.created, 0);
    assert.equal(await countBudgetRows(database.driver), 1);
    assert.equal(
      (await getBudget(database.driver, { categoryId: null, period: MONTH }))?.amountMinor,
      3_000_000,
    );

    database.close();
  });

  it('skips unusable targets with a warning instead of failing', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    insertGoal(database, 'goal-null', 'spend', 0, 'Zero budget');
    insertGoal(database, 'goal-bad', 'spend:cat:cat-rent', -5, 'Negative budget');

    const report = await runFinancialMigrations(database.driver, { now });
    assert.equal(report.budgetsCreated, 0);
    assert.equal(budgetWarnings(report.warnings).length, 2);

    database.close();
  });

  it('migrates on a database with no goals table at all', async () => {
    const database = createDatabase();
    // `seedLegacyFinance` is unnecessary: the migration must tolerate an
    // existing finance database whose goals table is absent.
    database.db.exec('DROP TABLE goals');

    const report = await runFinancialMigrations(database.driver, { now });
    assert.equal(report.budgetsCreated, 0);
    assert.equal(await countBudgetRows(database.driver), 0);
    assert.equal(readSetting(database, SETTING_KEYS.budgetsMigrated), '1');

    database.close();
  });
});

describe('I7 — budget progress with real ledger rows', () => {
  async function ledger(): Promise<TestDatabase> {
    const database = createDatabase();
    seedCategories(database);
    await runFinancialMigrations(database.driver, { now });

    await recordTransaction(database.driver, {
      id: 'nov-rent',
      accountId: DEFAULT_CASH_ACCOUNT_ID,
      kind: 'expense',
      amountMinor: -1_800_000,
      day: '2026-11-02',
      categoryId: 'cat-rent',
    });
    await recordTransaction(database.driver, {
      id: 'nov-coffee',
      accountId: DEFAULT_CASH_ACCOUNT_ID,
      kind: 'expense',
      amountMinor: -30_000,
      day: '2026-11-03',
      categoryId: 'cat-coffee',
    });
    await recordRefund(database.driver, {
      id: 'nov-coffee-refund',
      accountId: DEFAULT_CASH_ACCOUNT_ID,
      amountMinor: 10_000,
      day: '2026-11-04',
      refundOfId: 'nov-coffee',
    });

    return database;
  }

  it('reports spent, remaining and exceeded with refunds netted out', async () => {
    const database = await ledger();
    const budget = await setBudget(
      database.driver,
      { categoryId: 'cat-coffee', period: MONTH, amountMinor: 25_000 },
      { now },
    );

    const transactions = await loadTransactions(database.driver);
    const progress = budgetProgress(budget, transactions);
    assert.equal(progress.spentMinor, 20_000);
    assert.equal(progress.remainingMinor, 5_000);
    assert.equal(progress.exceededMinor, 0);
    assert.equal(progress.status, 'under');
    assert.ok(progress.notes.some((note) => note.includes('Refunds')));

    await setBudget(
      database.driver,
      { categoryId: 'cat-coffee', period: MONTH, amountMinor: 15_000 },
      { now },
    );
    const tight = budgetProgress(
      (await getBudget(database.driver, { categoryId: 'cat-coffee', period: MONTH }))!,
      transactions,
    );
    assert.equal(tight.remainingMinor, -5_000);
    assert.equal(tight.exceededMinor, 5_000);
    assert.equal(tight.status, 'over');

    database.close();
  });

  it('nets refunds into the overall budget without counting transfers', async () => {
    const database = await ledger();
    const budgets = [
      await setBudget(database.driver, { categoryId: null, period: MONTH, amountMinor: 2_000_000 }, { now }),
      await setBudget(
        database.driver,
        { categoryId: 'cat-rent', period: MONTH, amountMinor: 1_800_000 },
        { now },
      ),
    ];

    const transactions = await loadTransactions(database.driver);
    const [overall, rent] = summariseBudgets(budgets, transactions);
    // 8,000,000 income - 1,830,000 expenses + 10,000 refund: income is not spending.
    assert.equal(overall!.spentMinor, 1_820_000);
    assert.equal(overall!.remainingMinor, 180_000);
    assert.equal(rent!.spentMinor, 1_800_000);
    assert.equal(rent!.status, 'at');

    database.close();
  });
});

describe('I7 — backup round trip', () => {
  it('exports budget records and restores them with history intact', async () => {
    const database = createDatabase();
    await runFinancialMigrations(database.driver, { now });
    await setBudget(
      database.driver,
      { categoryId: null, period: { kind: 'month', month: '2026-10' }, amountMinor: 1_500_000 },
      { now },
    );
    await setBudget(
      database.driver,
      { categoryId: null, period: { kind: 'month', month: '2026-11' }, amountMinor: 2_000_000 },
      { now },
    );

    const exported = await exportBackup(database.driver, {
      now: () => new Date(NOV_15),
    });
    const text = serialiseBackup(exported);
    assert.ok(Array.isArray(exported.fin_budgets));
    assert.equal((exported.fin_budgets as unknown[]).length, 2);

    const restored = createDatabase();
    await runFinancialMigrations(restored.driver, { now });
    const result = await restoreBackupText(restored.driver, text, { mode: 'replace' });
    assert.ok(!('ok' in result), `restore failed: ${JSON.stringify(result)}`);
    assert.equal(result.status, 'restored');

    const budgets = await listBudgets(restored.driver);
    assert.deepEqual(
      budgets.map((row) => [row.period.kind === 'month' ? row.period.month : '', row.amountMinor]),
      [
        ['2026-10', 1_500_000],
        ['2026-11', 2_000_000],
      ],
    );
    assert.equal(await countBudgetRows(restored.driver), 2);

    // A restore must let the migration re-run against the restored goals.
    assert.equal(readSetting(restored, SETTING_KEYS.budgetsMigrated), null);

    database.close();
    restored.close();
  });
});
