import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceDue,
  billOccurrences,
  billStateAt,
  isUnpaidState,
  upcomingBills,
  unpaidTotal,
} from '../src/bills';
import type { Bill } from '../src/bills';
import { rupees } from './fixtures';

const BILL: Bill = {
  id: 'bill-rent',
  title: 'Rent',
  amountMinor: rupees(18_000),
  accountId: 'acc-bank',
  cadence: 'monthly',
  nextDueDay: '2026-11-01',
  toleranceDays: 3,
};

describe('I8 — advanceDue', () => {
  it('advances weekly by 7 days', () => {
    assert.equal(advanceDue('2026-11-01', 'weekly'), '2026-11-08');
  });

  it('advances monthly and clamps month-end', () => {
    assert.equal(advanceDue('2026-01-31', 'monthly'), '2026-02-28');
    assert.equal(advanceDue('2024-01-31', 'monthly'), '2024-02-29');
    assert.equal(advanceDue('2026-11-15', 'monthly'), '2026-12-15');
  });

  it('advances quarterly and yearly', () => {
    assert.equal(advanceDue('2026-11-15', 'quarterly'), '2027-02-15');
    assert.equal(advanceDue('2026-11-15', 'yearly'), '2027-11-15');
  });
});

describe('I8 — billStateAt', () => {
  it('reports upcoming, due, overdue and cancelled states', () => {
    assert.equal(billStateAt(BILL, '2026-10-25'), 'upcoming');
    assert.equal(billStateAt(BILL, '2026-11-01'), 'due');
    assert.equal(billStateAt(BILL, '2026-11-03'), 'due'); // inside tolerance
    assert.equal(billStateAt(BILL, '2026-11-05'), 'overdue');
  });

  it('treats an inactive or cancelled bill as cancelled', () => {
    assert.equal(billStateAt({ ...BILL, active: false }, '2026-11-01'), 'cancelled');
    assert.equal(billStateAt({ ...BILL, cancelledAt: 1 }, '2026-11-01'), 'cancelled');
    assert.equal(billStateAt({ ...BILL, deletedAt: 1 }, '2026-11-01'), 'cancelled');
  });
});

describe('I8 — billOccurrences', () => {
  it('generates a monthly timeline and marks the next occurrence by asOf', () => {
    const occurrences = billOccurrences(BILL, {
      from: '2026-11-01',
      to: '2027-01-31',
      asOf: '2026-11-10',
    });
    assert.deepEqual(
      occurrences.map((entry) => [entry.dueDay, entry.state]),
      [
        ['2026-11-01', 'overdue'],
        ['2026-12-01', 'upcoming'],
        ['2027-01-01', 'upcoming'],
      ],
    );
  });

  it('merges a paid occurrence into the timeline instead of dropping it', () => {
    const occurrences = billOccurrences(BILL, {
      from: '2026-10-01',
      to: '2026-12-31',
      asOf: '2026-11-10',
      payments: [
        {
          billId: BILL.id,
          dueDay: '2026-11-01',
          day: '2026-11-02',
          amountMinor: rupees(17_500),
          transactionId: 'tx-1',
        },
      ],
    });
    const november = occurrences.find((entry) => entry.dueDay === '2026-11-01');
    assert.equal(november?.state, 'paid');
    assert.equal(november?.paidMinor, rupees(17_500));
    assert.equal(november?.transactionId, 'tx-1');
    assert.ok(!occurrences.some((entry) => entry.dueDay === '2026-11-01' && entry.state !== 'paid'));
  });

  it('records a skipped occurrence and keeps it out of unpaid totals', () => {
    const occurrences = billOccurrences(BILL, {
      from: '2026-10-01',
      to: '2026-12-31',
      asOf: '2026-11-10',
      skips: [{ billId: BILL.id, dueDay: '2026-11-01', reason: 'landlord waived' }],
    });
    const november = occurrences.find((entry) => entry.dueDay === '2026-11-01');
    assert.equal(november?.state, 'skipped');
    assert.equal(november?.reason, 'landlord waived');
    assert.equal(unpaidTotal(BILL, { from: '2026-10-01', to: '2027-01-31', asOf: '2026-11-10', skips: [{ billId: BILL.id, dueDay: '2026-11-01' }] }), rupees(36_000));
  });

  it('does not double-count a paid occurrence in unpaid totals', () => {
    const options = {
      from: '2026-10-01',
      to: '2027-01-31',
      asOf: '2026-11-10',
      payments: [
        { billId: BILL.id, dueDay: '2026-11-01', day: '2026-11-02', amountMinor: rupees(18_000), transactionId: 'tx-1' },
      ],
    };
    const total = unpaidTotal(BILL, options);
    assert.equal(total, rupees(36_000)); // Dec + Jan remain
    assert.equal(isUnpaidState('paid'), false);
  });
});

describe('I8 — upcomingBills', () => {
  it('collects unpaid occurrences across bills in date order', () => {
    const second: Bill = { ...BILL, id: 'bill-electric', title: 'Electric', nextDueDay: '2026-11-02', cadence: 'monthly' };
    const results = upcomingBills([BILL, second], {
      from: '2026-11-01',
      to: '2026-11-30',
      asOf: '2026-11-01',
    });
    assert.deepEqual(results.map((entry) => entry.billId), ['bill-rent', 'bill-electric']);
    assert.equal(results.length, 2);
  });
});
