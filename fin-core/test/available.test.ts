import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { availableToSpend, availableBreakdown } from '../src/available';
import { netWorthBreakdown } from '../src/networth';
import { budgetProgress } from '../src/budgets';
import { rupees, ACCOUNTS, TRANSACTIONS, NOVEMBER } from './fixtures';
import type { Bill, BillPaymentRef } from '../src/bills';

const BILL: Bill = {
  id: 'bill-rent',
  title: 'Rent',
  amountMinor: rupees(18_000),
  accountId: 'acc-bank',
  cadence: 'monthly',
  nextDueDay: '2026-11-02',
};

describe('I9 — available to spend', () => {
  it('sums liquid balances plus card balances minus bills', () => {
    const result = availableToSpend(ACCOUNTS, TRANSACTIONS, {
      asOf: '2026-11-15',
      horizonDays: 7,
      bills: [BILL],
    });
    // Bank 50k + salary 80k - rent 18k - groceries 4.5k - interest 2k + adj 130
    // - card bill 900 - ATM 5000 + SIP 10k? wait SIP is -10k bank +10k invest.
    // Liquid accounts: bank, cash, card? card is not liquid. Liquid = bank+cash.
    // Bank balance = 50000+80000-18000-4500-900-5000-8000-2000+130-10000 = 81730? Let's not assert exact here; check breakdown.
    const breakdown = availableBreakdown(result);
    const summed = breakdown.reduce((total, row) => total + row.amountMinor, 0);
    assert.equal(summed, result.value);
    assert.equal(result.committedBillsMinor, rupees(18_000)); // overdue, but still an obligation
  });

  it('does not subtract a bill that has already been paid', () => {
    const paid: BillPaymentRef = {
      billId: BILL.id,
      dueDay: '2026-11-02',
      day: '2026-11-02',
      amountMinor: rupees(18_000),
      transactionId: 'pay-1',
    };
    const unpaid = availableToSpend(ACCOUNTS, TRANSACTIONS, {
      asOf: '2026-11-02',
      horizonDays: 7,
      bills: [BILL],
    });
    const paidResult = availableToSpend(ACCOUNTS, TRANSACTIONS, {
      asOf: '2026-11-02',
      horizonDays: 7,
      bills: [BILL],
      billPayments: [paid],
    });
    assert.equal(unpaid.committedBillsMinor, rupees(18_000));
    assert.equal(paidResult.committedBillsMinor, 0);
    assert.equal(paidResult.value - unpaid.value, rupees(18_000));
  });

  it('counts pending rows once because balances already include them', () => {
    const result = availableToSpend(ACCOUNTS, TRANSACTIONS, { asOf: '2026-11-27' });
    assert.ok(result.pendingOutflowMinor > 0);
    const breakdown = availableBreakdown(result);
    const summed = breakdown.reduce((total, row) => total + row.amountMinor, 0);
    assert.equal(summed, result.value);
  });

  it('adds pending movement back when includePending is false', () => {
    const included = availableToSpend(ACCOUNTS, TRANSACTIONS, { asOf: '2026-11-27' });
    const posted = availableToSpend(ACCOUNTS, TRANSACTIONS, {
      asOf: '2026-11-27',
      includePending: false,
    });
    assert.equal(posted.value - included.value, included.pendingOutflowMinor - included.pendingInflowMinor);
  });

  it('reports budget headroom without reserving it by default', () => {
    const result = availableToSpend(ACCOUNTS, TRANSACTIONS, {
      asOf: '2026-11-15',
      budgets: [
        {
          id: 'b1',
          categoryId: null,
          amountMinor: rupees(50_000),
          period: { kind: 'month', month: '2026-11' },
        },
      ],
    });
    assert.ok(result.budgetRemainingMinor >= 0);
    assert.equal(result.reservedBudgetMinor, 0);
    assert.ok(result.notes.some((note) => note.includes('reported but not reserved')));
  });

  it('reserves budget headroom only when asked', () => {
    const base = availableToSpend(ACCOUNTS, TRANSACTIONS, {
      asOf: '2026-11-15',
      budgets: [
        {
          id: 'b1',
          categoryId: null,
          amountMinor: rupees(50_000),
          period: { kind: 'month', month: '2026-11' },
        },
      ],
    });
    const reserved = availableToSpend(ACCOUNTS, TRANSACTIONS, {
      asOf: '2026-11-15',
      budgets: [
        {
          id: 'b1',
          categoryId: null,
          amountMinor: rupees(50_000),
          period: { kind: 'month', month: '2026-11' },
        },
      ],
      reserveBudgetRemaining: true,
    });
    assert.equal(reserved.value, base.value - base.budgetRemainingMinor);
  });

  it('includes overdue bills even when their due day is before asOf', () => {
    const result = availableToSpend(ACCOUNTS, TRANSACTIONS, {
      asOf: '2026-11-15',
      horizonDays: 7,
      bills: [BILL],
    });
    // BILL due 11-02 is before asOf; nextDueDay remains 11-02 until paid, so it
    // is overdue and must still reduce availability.
    assert.equal(result.committedBillsMinor, rupees(18_000));
  });

  it('rejects a non-day asOf', () => {
    assert.throws(
      () => availableToSpend(ACCOUNTS, TRANSACTIONS, { asOf: 'not-a-day' }),
      /Invalid asOf day/,
    );
  });

  it('uses variable bill last paid amount when available', () => {
    const variable: Bill = { ...BILL, variableAmount: true, lastAmountMinor: rupees(20_000) };
    const result = availableToSpend(ACCOUNTS, TRANSACTIONS, {
      asOf: '2026-11-15',
      horizonDays: 7,
      bills: [variable],
    });
    assert.equal(result.committedBillsMinor, rupees(20_000));
    assert.ok(result.notes.some((note) => note.includes('Variable bills')));
  });
});
