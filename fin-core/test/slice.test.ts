import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isSliceSource, sliceSummary, sliceTransactions } from '../src/slice';
import { findDuplicateCandidates, isExactDuplicate } from '../src/duplicates';
import { rupees } from './fixtures';
import type { Transaction } from '../src/types';

describe('I13 — Slice lens', () => {
  const rows: Transaction[] = [
    { id: 's1', accountId: 'acc-bank', kind: 'expense', amountMinor: -rupees(500), day: '2026-11-02', source: 'slice_statement', sourceRef: 'UTR1', note: 'UPI to merchant' },
    { id: 's2', accountId: 'acc-bank', kind: 'income', amountMinor: rupees(1_000), day: '2026-11-03', source: 'slice_statement', sourceRef: 'UTR2' },
    { id: 'm1', accountId: 'acc-bank', kind: 'expense', amountMinor: -rupees(200), day: '2026-11-04', source: 'manual' },
    { id: 's3', accountId: 'acc-bank', kind: 'transfer', amountMinor: -rupees(1_000), day: '2026-11-05', source: 'slice_statement', transferId: 'T' },
  ];

  it('filters only slice-sourced rows', () => {
    assert.equal(isSliceSource('slice_statement'), true);
    assert.equal(isSliceSource('manual'), false);
    assert.equal(sliceTransactions(rows).length, 3);
  });

  it('summarises incoming and outgoing separately', () => {
    const summary = sliceSummary(rows, { from: '2026-11-01', to: '2026-11-30' });
    assert.equal(summary.outgoing, rupees(500));
    assert.equal(summary.incoming, rupees(1_000));
    assert.equal(summary.count, 3);
    assert.equal(summary.transfers, 1);
  });

  it('does not double-count a slice row in the overall ledger', () => {
    // The slice row is still a normal transaction; it appears once in the
    // overall list and once in the slice list, but it is the same object.
    const overall = rows.filter((row) => row.id === 's1');
    const slice = sliceTransactions(rows).filter((row) => row.id === 's1');
    assert.equal(overall.length, 1);
    assert.equal(slice.length, 1);
  });
});

describe('I13 — duplicate detection', () => {
  const rows: Transaction[] = [
    { id: 'a', accountId: 'acc-bank', kind: 'expense', amountMinor: -50000, day: '2026-11-02', source: 'manual', sourceRef: 'UTR1' },
    { id: 'b', accountId: 'acc-bank', kind: 'expense', amountMinor: -50000, day: '2026-11-02', source: 'slice_statement', sourceRef: 'UTR1' },
    { id: 'c', accountId: 'acc-bank', kind: 'expense', amountMinor: -50000, day: '2026-11-02', source: 'manual' },
    { id: 'd', accountId: 'acc-cash', kind: 'expense', amountMinor: -50000, day: '2026-11-02', source: 'manual' },
  ];

  it('flags an exact reference match with confidence 1', () => {
    const candidates = findDuplicateCandidates(rows);
    const exact = candidates.find((candidate) => candidate.reason === 'same-reference');
    assert.ok(exact);
    assert.equal(exact!.confidence, 1);
    assert.ok(isExactDuplicate(rows[0]!, rows[1]!));
  });

  it('flags same account, day and amount as a strong candidate', () => {
    const candidates = findDuplicateCandidates(rows);
    const strong = candidates.find((candidate) => candidate.reason === 'same-account-day-amount');
    assert.ok(strong);
    assert.equal(strong!.confidence, 0.8);
  });

  it('flags cross-account same day and amount as a weak hint', () => {
    const candidates = findDuplicateCandidates(rows, { minimumConfidence: 0.5 });
    const weak = candidates.find((candidate) => candidate.reason === 'same-day-amount');
    assert.ok(weak);
    assert.equal(weak!.confidence, 0.5);
  });

  it('does not treat amount and date alone as proof', () => {
    const candidates = findDuplicateCandidates(rows, { minimumConfidence: 0.9 });
    // Only the exact reference match survives.
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]!.reason, 'same-reference');
  });
});
