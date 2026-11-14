import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  budgetPeriodRange,
  budgetProgress,
  budgetSpend,
  budgetSpent,
  categoryBudgets,
  isMonthKey,
  monthKeyOf,
  monthKeyOfDay,
  monthRange,
  overallBudget,
  periodsOverlap,
  summariseBudgets,
} from '../src/budgets';
import type { Budget } from '../src/budgets';
import type { Transaction } from '../src/types';
import { NOVEMBER, TRANSACTIONS, rupees } from './fixtures';

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'bud-1',
    categoryId: null,
    amountMinor: rupees(20_000),
    period: { kind: 'month', month: '2026-11' },
    ...overrides,
  };
}

describe('budget periods', () => {
  it('accepts YYYY-MM and rejects anything else', () => {
    assert.equal(isMonthKey('2026-11'), true);
    assert.equal(isMonthKey('2026-13'), false);
    assert.equal(isMonthKey('2026-1'), false);
    assert.equal(isMonthKey('November'), false);
  });

  it('derives the last day of a month, including leap years', () => {
    assert.deepEqual(monthRange('2026-11'), { from: '2026-11-01', to: '2026-11-30' });
    assert.deepEqual(monthRange('2024-02'), { from: '2024-02-01', to: '2024-02-29' });
    assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
    assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', to: '2026-12-31' });
  });

  it('derives the month of a day and of a date', () => {
    assert.equal(monthKeyOfDay('2026-11-27'), '2026-11');
    assert.equal(monthKeyOf(new Date(2026, 10, 15)), '2026-11');
    assert.throws(() => monthKeyOfDay('27-11-2026'), /Invalid day/);
  });

  it('supports a custom inclusive range', () => {
    assert.deepEqual(
      budgetPeriodRange({ kind: 'custom', from: '2026-11-05', to: '2026-11-20' }),
      { from: '2026-11-05', to: '2026-11-20' },
    );
    assert.throws(
      () => budgetPeriodRange({ kind: 'custom', from: '2026-11-20', to: '2026-11-05' }),
      /after/,
    );
  });

  it('detects overlapping periods', () => {
    assert.equal(
      periodsOverlap(
        { kind: 'month', month: '2026-11' },
        { kind: 'custom', from: '2026-11-30', to: '2026-12-05' },
      ),
      true,
    );
    assert.equal(
      periodsOverlap(
        { kind: 'month', month: '2026-11' },
        { kind: 'custom', from: '2026-12-01', to: '2026-12-05' },
      ),
      false,
    );
  });
});

describe('budget spending', () => {
  it('is net spending: expenses minus refunds plus interest', () => {
    const spend = budgetSpend(NOVEMBER, TRANSACTIONS, null);
    assert.equal(spend.value.expenseMinor, rupees(23_700));
    assert.equal(spend.value.refundMinor, rupees(900));
    assert.equal(spend.value.interestMinor, rupees(2_000));
    assert.equal(spend.value.spentMinor, rupees(24_800));
    assert.equal(budgetSpent(NOVEMBER, TRANSACTIONS).value, rupees(24_800));
  });

  it('never counts transfers or adjustments as spending', () => {
    const without = TRANSACTIONS.filter(
      (row) => row.kind !== 'transfer' && row.kind !== 'adjustment',
    );
    assert.equal(
      budgetSpent(NOVEMBER, TRANSACTIONS, null).value,
      budgetSpent(NOVEMBER, without, null).value,
    );
  });

  it('nets a refund against its category', () => {
    assert.equal(budgetSpent(NOVEMBER, TRANSACTIONS, 'cat-dining').value, 0);
    assert.equal(budgetSpent(NOVEMBER, TRANSACTIONS, 'cat-rent').value, rupees(18_000));
    assert.equal(budgetSpent(NOVEMBER, TRANSACTIONS, 'cat-coffee').value, rupees(300));
  });

  it('attributes an uncategorised refund to the original expense category', () => {
    const refundWithoutCategory: Transaction = {
      id: 'refund-no-cat',
      accountId: 'acc-card',
      kind: 'refund',
      amountMinor: rupees(400),
      day: '2026-11-15',
      refundOfId: 't06',
    };
    const rows = [...TRANSACTIONS, refundWithoutCategory];
    // t06 is a 900 dining expense; a 900 refund already exists, so this one makes
    // dining spending -400. The point is attribution, not the total.
    assert.equal(budgetSpent(NOVEMBER, rows, 'cat-dining').value, rupees(-400));
    assert.equal(budgetSpent(NOVEMBER, rows, null).value, rupees(24_400));
  });

  it('ignores excluded rows and counts pending rows, matching I6', () => {
    const excludedExpense: Transaction = {
      id: 'excluded-expense',
      accountId: 'acc-bank',
      kind: 'expense',
      amountMinor: -rupees(5_000),
      day: '2026-11-18',
      categoryId: 'cat-rent',
      status: 'excluded',
    };
    const rows = [...TRANSACTIONS, excludedExpense];
    assert.equal(budgetSpent(NOVEMBER, rows, 'cat-rent').value, rupees(18_000));
    // t19 (coffee) is pending and is already counted.
    assert.equal(budgetSpent(NOVEMBER, TRANSACTIONS, 'cat-coffee').value, rupees(300));
  });

  it('reports negative spending when refunds exceed purchases', () => {
    const rows: Transaction[] = [
      {
        id: 'small-expense',
        accountId: 'acc-card',
        kind: 'expense',
        amountMinor: -rupees(500),
        day: '2026-11-02',
        categoryId: 'cat-dining',
      },
      {
        id: 'big-refund',
        accountId: 'acc-card',
        kind: 'refund',
        amountMinor: rupees(800),
        day: '2026-11-03',
        categoryId: 'cat-dining',
        refundOfId: 'small-expense',
      },
    ];
    assert.equal(budgetSpent(NOVEMBER, rows, 'cat-dining').value, rupees(-300));
  });
});

describe('budget progress', () => {
  it('shows remaining and percent when under budget', () => {
    const progress = budgetProgress(budget(), TRANSACTIONS);
    assert.equal(progress.range.from, '2026-11-01');
    assert.equal(progress.range.to, '2026-11-30');
    assert.equal(progress.spentMinor, rupees(24_800));
    assert.equal(progress.amountMinor, rupees(20_000));
    assert.equal(progress.remainingMinor, rupees(-4_800));
    assert.equal(progress.exceededMinor, rupees(4_800));
    assert.equal(progress.status, 'over');
    assert.equal(progress.percentUsed, 24_800 / 20_000);
  });

  it('reports exactly-at and comfortably-under budgets', () => {
    const exact = budgetProgress(budget({ amountMinor: rupees(24_800) }), TRANSACTIONS);
    assert.equal(exact.status, 'at');
    assert.equal(exact.remainingMinor, 0);
    assert.equal(exact.exceededMinor, 0);

    const under = budgetProgress(budget({ amountMinor: rupees(30_000) }), TRANSACTIONS);
    assert.equal(under.status, 'under');
    assert.equal(under.remainingMinor, rupees(5_200));
    assert.equal(under.percentUsed, 24_800 / 30_000);
  });

  it('explains that refunds reduced spending', () => {
    const progress = budgetProgress(
      budget({ categoryId: 'cat-dining', amountMinor: rupees(1_000) }),
      TRANSACTIONS,
    );
    assert.equal(progress.spentMinor, 0);
    assert.ok(progress.notes.some((note) => note.includes('Refunds')));
  });

  it('summarises every budget in order', () => {
    const budgets = [
      budget({ id: 'overall' }),
      budget({ id: 'rent', categoryId: 'cat-rent', amountMinor: rupees(20_000) }),
    ];
    const progress = summariseBudgets(budgets, TRANSACTIONS);
    assert.deepEqual(progress.map((entry) => entry.budgetId), ['overall', 'rent']);
    assert.equal(progress[1]!.status, 'under');
    assert.equal(progress[1]!.remainingMinor, rupees(2_000));
  });

  it('selects the overall and category budgets for a period', () => {
    const period = { kind: 'month', month: '2026-11' } as const;
    const budgets = [
      budget({ id: 'overall' }),
      budget({ id: 'rent', categoryId: 'cat-rent' }),
      budget({ id: 'december', period: { kind: 'month', month: '2026-12' } }),
    ];
    assert.equal(overallBudget(budgets, period)?.id, 'overall');
    assert.deepEqual(categoryBudgets(budgets, period).map((entry) => entry.id), ['rent']);
  });
});
