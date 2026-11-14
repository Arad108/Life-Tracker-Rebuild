import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  cashFlow,
  countedInRange,
  expenses,
  income,
  interestCharged,
  isCounted,
  isLive,
  netSpending,
  refunds,
  savingsRate,
  summarise,
  transfers,
} from '../src/calc';
import type { DayRange, Transaction } from '../src/types';
import { NOVEMBER, OCTOBER, TRANSACTIONS, rupees } from './fixtures';

const row = (overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'accountId' | 'kind' | 'amountMinor' | 'day'>): Transaction =>
  overrides as Transaction;

describe('summarise — a full month', () => {
  const summary = summarise(NOVEMBER, TRANSACTIONS);

  it('counts earnings only', () => {
    assert.equal(summary.income, rupees(80_000));
    assert.equal(summary.counts.income, 1);
  });

  it('reports gross spending as a positive number', () => {
    // rent 18,000 + groceries 4,500 + dinner 900 + pending coffee 300
    assert.equal(summary.expenses, rupees(23_700));
    assert.equal(summary.counts.expenses, 4);
  });

  it('reports refunds separately, never as income', () => {
    assert.equal(summary.refunds, rupees(900));
    assert.equal(summary.income, rupees(80_000), 'the refund must not inflate income');
  });

  it('nets refunds and interest into spending', () => {
    // 23,700 - 900 + 2,000
    assert.equal(summary.netSpending, rupees(24_800));
  });

  it('reports net savings', () => {
    assert.equal(summary.cashFlow, rupees(55_200));
    assert.equal(summary.savingsRate, 0.69);
  });

  it('never lets transfers touch income or spending', () => {
    assert.equal(summary.transfers.legs, 8);
    assert.equal(summary.transfers.outflow, rupees(23_900));
    assert.equal(summary.transfers.inflow, rupees(23_900));
    assert.equal(summary.transfers.net, 0);
    assert.deepEqual(summary.transfers.unpairedTransferIds, []);
  });

  it('keeps cashFlow and income minus netSpending identical', () => {
    assert.equal(summary.cashFlow, summary.income - summary.netSpending);
  });

  it('explains what it left out', () => {
    assert.ok(summary.notes.some((note) => note.includes('pending')));
    assert.ok(summary.notes.some((note) => note.includes('excluded')));
  });
});

describe('summarise — boundaries and edges', () => {
  it('treats the range as inclusive on both ends', () => {
    const firstDay: DayRange = { from: '2026-11-01', to: '2026-11-01' };
    const onlyFirst = summarise(firstDay, TRANSACTIONS);
    assert.equal(onlyFirst.income, rupees(80_000));
    assert.equal(onlyFirst.expenses, 0, 'the rent is on 2 November');

    const upToFifth: DayRange = { from: '2026-11-01', to: '2026-11-05' };
    assert.equal(summarise(upToFifth, TRANSACTIONS).expenses, rupees(22_500));
  });

  it('returns a null savings rate when there is no income', () => {
    const october = summarise(OCTOBER, TRANSACTIONS);
    assert.equal(october.income, 0);
    assert.equal(october.savingsRate, null, '0% or 100% would be a lie');
  });

  it('counts a month of transfers as movement only', () => {
    const october = summarise(OCTOBER, TRANSACTIONS);
    assert.equal(october.expenses, 0);
    assert.equal(october.netSpending, 0);
    assert.equal(october.cashFlow, 0);
    assert.equal(october.transfers.legs, 2);
    assert.equal(october.transfers.outflow, rupees(50_000));
    assert.equal(october.transfers.inflow, rupees(50_000));
  });

  it('allows a negative savings rate', () => {
    const rows = [
      row({ id: 'a', accountId: 'bank', kind: 'income', amountMinor: rupees(10_000), day: '2026-11-02' }),
      row({ id: 'b', accountId: 'bank', kind: 'expense', amountMinor: -rupees(30_000), day: '2026-11-03' }),
    ];
    const summary = summarise(NOVEMBER, rows);
    assert.equal(summary.cashFlow, -rupees(20_000));
    assert.equal(summary.savingsRate, -2);
  });

  it('rejects an inverted or malformed range instead of returning zero', () => {
    assert.throws(() => summarise({ from: '2026-11-30', to: '2026-11-01' }, TRANSACTIONS), RangeError);
    assert.throws(() => summarise({ from: '30-11-2026', to: '2026-11-30' }, TRANSACTIONS), RangeError);
  });

  it('handles an empty period without inventing numbers', () => {
    const empty = summarise(NOVEMBER, []);
    assert.equal(empty.income, 0);
    assert.equal(empty.expenses, 0);
    assert.equal(empty.netSpending, 0);
    assert.equal(empty.cashFlow, 0);
    assert.equal(empty.savingsRate, null);
    assert.equal(empty.counts.total, 0);
    assert.deepEqual(empty.notes, []);
  });

  it('never returns negative zero', () => {
    const october = summarise(OCTOBER, TRANSACTIONS);
    for (const value of [
      october.income,
      october.expenses,
      october.refunds,
      october.interest,
      october.netSpending,
      october.cashFlow,
      october.transfers.net,
    ]) {
      assert.equal(Object.is(value, -0), false, '-0 breaks equality, JSON and snapshots');
    }
    assert.equal(Object.is(expenses(NOVEMBER, []).value, -0), false);
  });
});

describe('transfers never inflate income or spending', () => {
  it('produces identical analytics with every transfer removed', () => {
    const withoutTransfers = TRANSACTIONS.filter((transaction) => transaction.kind !== 'transfer');
    const withTransfers = summarise(NOVEMBER, TRANSACTIONS);
    const without = summarise(NOVEMBER, withoutTransfers);

    assert.equal(withTransfers.income, without.income);
    assert.equal(withTransfers.expenses, without.expenses);
    assert.equal(withTransfers.refunds, without.refunds);
    assert.equal(withTransfers.interest, without.interest);
    assert.equal(withTransfers.netSpending, without.netSpending);
    assert.equal(withTransfers.cashFlow, without.cashFlow);
    assert.equal(withTransfers.savingsRate, without.savingsRate);
  });

  it('does not change spending when a card bill is paid', () => {
    const purchase = row({
      id: 'p1',
      accountId: 'acc-card',
      kind: 'expense',
      amountMinor: -rupees(900),
      day: '2026-11-06',
    });
    const bill: Transaction[] = [
      row({ id: 'b1', accountId: 'acc-bank', kind: 'transfer', amountMinor: -rupees(900), day: '2026-11-10', transferId: 'B' }),
      row({ id: 'b2', accountId: 'acc-card', kind: 'transfer', amountMinor: rupees(900), day: '2026-11-10', transferId: 'B' }),
    ];

    const before = summarise(NOVEMBER, [purchase]);
    const after = summarise(NOVEMBER, [purchase, ...bill]);

    assert.equal(after.expenses, rupees(900));
    assert.equal(after.expenses, before.expenses, 'paying the bill is not a second expense');
    assert.equal(after.income, 0);
  });
});

describe('refunds are not fresh income', () => {
  it('reports a refund-only month as negative spending and zero income', () => {
    const refundOnly = [
      row({ id: 'r1', accountId: 'acc-card', kind: 'refund', amountMinor: rupees(900), day: '2026-11-14' }),
    ];
    const summary = summarise(NOVEMBER, refundOnly);

    assert.equal(summary.income, 0);
    assert.equal(summary.expenses, 0);
    assert.equal(summary.refunds, rupees(900));
    assert.equal(summary.netSpending, -rupees(900), 'a refund larger than spending is a real outcome');
    assert.equal(summary.cashFlow, rupees(900));
    assert.equal(summary.savingsRate, null);
  });

  it('nets a refund against its original purchase', () => {
    const rows = [
      row({ id: 'p1', accountId: 'acc-card', kind: 'expense', amountMinor: -rupees(900), day: '2026-11-06' }),
      row({ id: 'r1', accountId: 'acc-card', kind: 'refund', amountMinor: rupees(900), day: '2026-11-14', refundOfId: 'p1' }),
    ];
    const summary = summarise(NOVEMBER, rows);
    assert.equal(summary.expenses, rupees(900));
    assert.equal(summary.netSpending, 0);
    assert.equal(summary.income, 0);
  });
});

describe('individual metrics agree with the summary', () => {
  const summary = summarise(NOVEMBER, TRANSACTIONS);

  it('income', () => {
    assert.equal(income(NOVEMBER, TRANSACTIONS).value, summary.income);
  });

  it('expenses', () => {
    assert.equal(expenses(NOVEMBER, TRANSACTIONS).value, summary.expenses);
  });

  it('refunds', () => {
    assert.equal(refunds(NOVEMBER, TRANSACTIONS).value, summary.refunds);
  });

  it('interest', () => {
    assert.equal(interestCharged(NOVEMBER, TRANSACTIONS).value, summary.interest);
  });

  it('netSpending', () => {
    assert.equal(netSpending(NOVEMBER, TRANSACTIONS).value, summary.netSpending);
  });

  it('cashFlow', () => {
    assert.equal(cashFlow(NOVEMBER, TRANSACTIONS).value, summary.cashFlow);
  });

  it('savingsRate', () => {
    assert.equal(savingsRate(NOVEMBER, TRANSACTIONS).value, summary.savingsRate);
  });

  it('transfers', () => {
    assert.deepEqual(transfers(NOVEMBER, TRANSACTIONS).value, summary.transfers);
  });
});

describe('row visibility', () => {
  it('treats a soft-deleted row as gone', () => {
    const deleted = TRANSACTIONS.find((transaction) => transaction.id === 't20');
    assert.ok(deleted);
    assert.equal(isLive(deleted), false);

    const withRow = summarise(NOVEMBER, TRANSACTIONS);
    const withoutRow = summarise(NOVEMBER, TRANSACTIONS.filter((t) => t.id !== 't20'));
    assert.equal(withRow.expenses, withoutRow.expenses);
    assert.equal(withRow.counts.total, withoutRow.counts.total);
  });

  it('keeps an excluded row out of analytics but not out of the ledger', () => {
    const excluded = TRANSACTIONS.find((transaction) => transaction.id === 't18');
    assert.ok(excluded);
    assert.equal(isCounted(excluded), false);
    assert.ok(!countedInRange(TRANSACTIONS, NOVEMBER).some((t) => t.id === 't18'));
    assert.ok(countedInRange(TRANSACTIONS, NOVEMBER).length > 0);
  });

  it('counts pending rows', () => {
    const pending = TRANSACTIONS.find((transaction) => transaction.id === 't19');
    assert.ok(pending);
    assert.equal(isCounted(pending), true);
    assert.ok(summarise(NOVEMBER, TRANSACTIONS).expenses > rupees(23_400));
  });

  it('defaults a missing status to posted', () => {
    const plain = row({ id: 'x', accountId: 'acc-bank', kind: 'expense', amountMinor: -100, day: '2026-11-02' });
    assert.equal(isCounted(plain), true);
  });
});

describe('data quality is surfaced, not hidden', () => {
  it('flags an expense stored with the wrong sign', () => {
    const broken = [
      row({ id: 'bad', accountId: 'acc-bank', kind: 'expense', amountMinor: rupees(5_000), day: '2026-11-02' }),
    ];
    const result = expenses(NOVEMBER, broken);
    assert.equal(result.value, -rupees(5_000));
    assert.ok(result.notes && result.notes.length > 0);
    assert.ok(result.notes?.[0]?.includes('sign'));
  });

  it('reports a transfer leg with no transferId', () => {
    const orphan = [
      row({ id: 'o1', accountId: 'acc-bank', kind: 'transfer', amountMinor: -rupees(1_000), day: '2026-11-02' }),
    ];
    const result = transfers(NOVEMBER, orphan);
    assert.deepEqual(result.value.unpairedTransferIds, ['(missing)']);
  });

  it('reports an unmatched transfer leg as unpaired but still not spending', () => {
    const unmatched = [
      row({ id: 'u1', accountId: 'acc-bank', kind: 'transfer', amountMinor: -rupees(3_000), day: '2026-11-02', transferId: 'U1' }),
    ];
    const result = transfers(NOVEMBER, unmatched);
    assert.deepEqual(result.value.unpairedTransferIds, ['U1']);
    assert.equal(summarise(NOVEMBER, unmatched).expenses, 0);
  });
});
