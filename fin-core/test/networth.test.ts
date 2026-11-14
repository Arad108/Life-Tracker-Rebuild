import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { netWorthBreakdown, compareNetWorth, liquidNetWorth, netWorthSeries } from '../src/networth';
import type { NetWorthSnapshot } from '../src/networth';
import { rupees, ACCOUNTS, TRANSACTIONS } from './fixtures';

describe('I10 — net worth', () => {
  it('sums balances: assets minus liabilities', () => {
    const breakdown = netWorthBreakdown(ACCOUNTS, TRANSACTIONS, '2026-11-30');
    // bank, cash, card, loan, investment
    assert.equal(breakdown.assetsMinor + breakdown.liabilitiesMinor >= 0, true);
    assert.equal(breakdown.value, breakdown.assetsMinor - breakdown.liabilitiesMinor);
    // liabilities include card debt and loan
    assert.ok(breakdown.liabilitiesMinor > 0);
  });

  it('excludes archived and opted-out accounts', () => {
    const accounts = ACCOUNTS.map((account) =>
      account.id === 'acc-bank' ? { ...account, includeInNetWorth: false } : account,
    );
    const withBank = netWorthBreakdown(ACCOUNTS, TRANSACTIONS, '2026-11-30');
    const withoutBank = netWorthBreakdown(accounts, TRANSACTIONS, '2026-11-30');
    assert.notEqual(withBank.value, withoutBank.value);
    assert.equal(withoutBank.inputs.excluded, 1);
  });

  it('liquid net worth excludes investments and loans', () => {
    const breakdown = netWorthBreakdown(ACCOUNTS, TRANSACTIONS, '2026-11-30');
    const liquid = liquidNetWorth(ACCOUNTS, TRANSACTIONS, '2026-11-30');
    assert.equal(liquid.value, breakdown.liquidMinor);
    assert.ok(Math.abs(liquid.value) <= Math.abs(breakdown.value) + rupees(1_00_000));
  });

  it('a balanced transfer pair does not change net worth', () => {
    const without = netWorthBreakdown(ACCOUNTS, TRANSACTIONS, '2026-11-30');
    // Add an extra balanced pair between bank and cash; net worth must not move.
    const extra: typeof TRANSACTIONS[number][] = [
      { id: 'x1', accountId: 'acc-bank', kind: 'transfer', amountMinor: -rupees(7_000), day: '2026-11-29', transferId: 'TX' },
      { id: 'x2', accountId: 'acc-cash', kind: 'transfer', amountMinor: rupees(7_000), day: '2026-11-29', transferId: 'TX' },
    ];
    const withExtra = netWorthBreakdown(ACCOUNTS, [...TRANSACTIONS, ...extra], '2026-11-30');
    assert.equal(withExtra.value, without.value);
  });

  it('compares two snapshots with deltas and per-account changes', () => {
    const previous: NetWorthSnapshot = {
      id: 'month:2026-10',
      periodKind: 'month',
      periodKey: '2026-10',
      asOfDay: '2026-10-31',
      netWorthMinor: rupees(40_000),
      assetsMinor: rupees(52_000),
      liabilitiesMinor: rupees(12_000),
      liquidMinor: rupees(30_000),
      accounts: [{ id: 'acc-bank', name: 'Bank', type: 'bank', balanceMinor: rupees(50_000) }],
      createdAt: 1,
    };
    const current: NetWorthSnapshot = {
      id: 'month:2026-11',
      periodKind: 'month',
      periodKey: '2026-11',
      asOfDay: '2026-11-30',
      netWorthMinor: rupees(50_000),
      assetsMinor: rupees(65_000),
      liabilitiesMinor: rupees(15_000),
      liquidMinor: rupees(35_000),
      accounts: [{ id: 'acc-bank', name: 'Bank', type: 'bank', balanceMinor: rupees(60_000) }],
      createdAt: 2,
    };
    const comparison = compareNetWorth(previous, current);
    assert.equal(comparison.deltaMinor, rupees(10_000));
    assert.equal(comparison.direction, 'up');
    assert.equal(comparison.percentChange, 0.25);
    assert.equal(comparison.accountChanges.length, 1);
    assert.equal(comparison.accountChanges[0]!.deltaMinor, rupees(10_000));
  });

  it('returns null percent when the previous value is zero', () => {
    const previous: NetWorthSnapshot = {
      id: 'm:2026-10',
      periodKind: 'month',
      periodKey: '2026-10',
      asOfDay: '2026-10-31',
      netWorthMinor: 0,
      assetsMinor: 0,
      liabilitiesMinor: 0,
      liquidMinor: 0,
      accounts: [],
      createdAt: 1,
    };
    const current: NetWorthSnapshot = { ...previous, id: 'm:2026-11', periodKey: '2026-11', netWorthMinor: rupees(5_000) };
    const comparison = compareNetWorth(previous, current);
    assert.equal(comparison.percentChange, null);
    assert.ok(comparison.notes.some((note) => note.includes('percentage change is not meaningful')));
  });

  it('sorts a series oldest first', () => {
    const snapshots: NetWorthSnapshot[] = [
      { id: 'm:2026-11', periodKind: 'month', periodKey: '2026-11', asOfDay: '2026-11-30', netWorthMinor: rupees(50_000), assetsMinor: 0, liabilitiesMinor: 0, liquidMinor: 0, accounts: [], createdAt: 2 },
      { id: 'm:2026-10', periodKind: 'month', periodKey: '2026-10', asOfDay: '2026-10-31', netWorthMinor: rupees(40_000), assetsMinor: 0, liabilitiesMinor: 0, liquidMinor: 0, accounts: [], createdAt: 1 },
    ];
    const series = netWorthSeries(snapshots);
    assert.deepEqual(series.map((entry) => entry.periodKey), ['2026-10', '2026-11']);
  });
});
