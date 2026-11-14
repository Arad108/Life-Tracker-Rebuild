import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { cashFlowSeries, categoryBreakdown, insights, savingsSummary } from '../src/analytics';
import { rupees, TRANSACTIONS, NOVEMBER } from './fixtures';

describe('I11 — analytics', () => {
  it('cash flow series sums to the period total', () => {
    const series = cashFlowSeries(TRANSACTIONS, NOVEMBER, 'month');
    assert.equal(series.length, 1);
    assert.equal(series[0]!.income, rupees(80_000));
    // expenses net of refunds + interest
    assert.equal(series[0]!.netSpending, rupees(24_800));
  });

  it('weekly buckets sum to the same total as the period', () => {
    const monthly = cashFlowSeries(TRANSACTIONS, NOVEMBER, 'month');
    const weekly = cashFlowSeries(TRANSACTIONS, NOVEMBER, 'week');
    const monthlyNet = monthly.reduce((total, bucket) => total + bucket.netSpending, 0);
    const weeklyNet = weekly.reduce((total, bucket) => total + bucket.netSpending, 0);
    assert.equal(weeklyNet, monthlyNet);
    assert.equal(weekly.reduce((total, bucket) => total + bucket.income, 0), monthly.reduce((total, bucket) => total + bucket.income, 0));
  });

  it('category breakdown is refund-adjusted and sorted', () => {
    const breakdown = categoryBreakdown(TRANSACTIONS, NOVEMBER);
    const dining = breakdown.find((row) => row.categoryId === 'cat-dining');
    assert.equal(dining?.netMinor, 0); // 900 expense - 900 refund
    assert.equal(breakdown[0]!.categoryId, 'cat-rent');
  });

  it('savings summary handles zero income', () => {
    const noIncome = TRANSACTIONS.filter((row) => row.kind !== 'income');
    const summary = savingsSummary(noIncome, NOVEMBER);
    assert.equal(summary.savingsRate, null);
  });

  it('emits at most three insights', () => {
    const result = insights(TRANSACTIONS, NOVEMBER, {
      asOf: '2026-11-30',
      budgets: [],
    });
    assert.ok(result.length <= 3);
  });

  it('emits a bills-due insight when bills are due', () => {
    const bill = {
      id: 'b1',
      title: 'Rent',
      amountMinor: rupees(1_000),
      accountId: 'acc-bank',
      cadence: 'monthly' as const,
      nextDueDay: '2026-11-05',
    };
    const result = insights(TRANSACTIONS, NOVEMBER, {
      asOf: '2026-11-01',
      bills: [bill],
    });
    assert.ok(result.some((insight) => insight.kind === 'bills-due'));
  });
});
