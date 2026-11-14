import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  allowedAccountTypes,
  validatePosting,
  validateTransferPair,
} from '../src/posting';
import type { PostingInput, TransferLeg } from '../src/posting';
import type { AccountType, TransactionKind } from '../src/types';

type Expectation = 'ok' | string;

interface PostingCase {
  readonly name: string;
  readonly input: PostingInput;
  readonly expect: Expectation;
}

function run(c: PostingCase): void {
  const result = validatePosting(c.input);
  if (c.expect === 'ok') {
    assert.equal(result.ok, true, `${c.name}: expected a valid posting, got ${JSON.stringify(result)}`);
    return;
  }
  assert.equal(result.ok, false, `${c.name}: expected rejection (${c.expect})`);
  if (result.ok) return;
  assert.equal(result.code, c.expect, `${c.name}: wrong error code — ${result.message}`);
  assert.ok(result.message.length > 0, `${c.name}: error must explain itself`);
}

describe('validatePosting — legal movements', () => {
  const cases: PostingCase[] = [
    {
      name: 'expense from a bank account',
      input: { kind: 'expense', accountType: 'bank', amountMinor: -120_000 },
      expect: 'ok',
    },
    {
      name: 'expense on a credit card',
      input: { kind: 'expense', accountType: 'credit_card', amountMinor: -90_000 },
      expect: 'ok',
    },
    {
      name: 'income into a bank account',
      input: { kind: 'income', accountType: 'bank', amountMinor: 8_000_000 },
      expect: 'ok',
    },
    {
      name: 'income into cash',
      input: { kind: 'income', accountType: 'cash', amountMinor: 50_000 },
      expect: 'ok',
    },
    {
      name: 'transfer leg out of the bank',
      input: { kind: 'transfer', accountType: 'bank', amountMinor: -500_000, transferId: 'T1' },
      expect: 'ok',
    },
    {
      name: 'transfer leg into a loan (principal repayment)',
      input: { kind: 'transfer', accountType: 'loan', amountMinor: 800_000, transferId: 'T1' },
      expect: 'ok',
    },
    {
      name: 'transfer into an investment (SIP)',
      input: { kind: 'transfer', accountType: 'investment', amountMinor: 1_000_000, transferId: 'T9' },
      expect: 'ok',
    },
    {
      name: 'transfer into an asset (buying gold)',
      input: { kind: 'transfer', accountType: 'asset', amountMinor: 1_000_000, transferId: 'T10' },
      expect: 'ok',
    },
    {
      name: 'refund onto a credit card',
      input: { kind: 'refund', accountType: 'credit_card', amountMinor: 90_000, refundOfId: 't06' },
      expect: 'ok',
    },
    {
      name: 'interest charged to the bank',
      input: { kind: 'interest', accountType: 'bank', amountMinor: -200_000 },
      expect: 'ok',
    },
    {
      name: 'positive adjustment on a loan',
      input: { kind: 'adjustment', accountType: 'loan', amountMinor: 13_000 },
      expect: 'ok',
    },
    {
      name: 'negative adjustment on an asset',
      input: { kind: 'adjustment', accountType: 'asset', amountMinor: -13_000 },
      expect: 'ok',
    },
    {
      name: 'explicit INR currency',
      input: { kind: 'expense', accountType: 'cash', amountMinor: -100, currency: 'INR' },
      expect: 'ok',
    },
    {
      name: 'valid day',
      input: { kind: 'expense', accountType: 'cash', amountMinor: -100, day: '2026-11-14' },
      expect: 'ok',
    },
  ];

  for (const c of cases) it(c.name, () => run(c));
});

describe('validatePosting — impossible movements', () => {
  const cases: PostingCase[] = [
    {
      name: 'expense with a positive amount',
      input: { kind: 'expense', accountType: 'bank', amountMinor: 120_000 },
      expect: 'sign',
    },
    {
      name: 'expense posted to a loan',
      input: { kind: 'expense', accountType: 'loan', amountMinor: -120_000 },
      expect: 'account-type',
    },
    {
      name: 'expense posted to an investment',
      input: { kind: 'expense', accountType: 'investment', amountMinor: -120_000 },
      expect: 'account-type',
    },
    {
      name: 'income with a negative amount',
      input: { kind: 'income', accountType: 'bank', amountMinor: -8_000_000 },
      expect: 'sign',
    },
    {
      name: 'income posted to a credit card',
      input: { kind: 'income', accountType: 'credit_card', amountMinor: 8_000_000 },
      expect: 'account-type',
    },
    {
      name: 'refund with a negative amount on a card',
      input: { kind: 'refund', accountType: 'credit_card', amountMinor: -90_000 },
      expect: 'sign',
    },
    {
      name: 'refund posted to a loan',
      input: { kind: 'refund', accountType: 'loan', amountMinor: 90_000 },
      expect: 'account-type',
    },
    {
      name: 'interest with a positive amount',
      input: { kind: 'interest', accountType: 'bank', amountMinor: 200_000 },
      expect: 'sign',
    },
    {
      name: 'transfer without a transferId',
      input: { kind: 'transfer', accountType: 'bank', amountMinor: -500_000 },
      expect: 'transfer-id-required',
    },
    {
      name: 'transfer with an empty transferId',
      input: { kind: 'transfer', accountType: 'bank', amountMinor: -500_000, transferId: '   ' },
      expect: 'transfer-id-required',
    },
    {
      name: 'zero amount',
      input: { kind: 'expense', accountType: 'bank', amountMinor: 0 },
      expect: 'amount-zero',
    },
    {
      name: 'fractional paise',
      input: { kind: 'expense', accountType: 'bank', amountMinor: -1200.5 },
      expect: 'amount-not-integer',
    },
    {
      name: 'NaN amount',
      input: { kind: 'expense', accountType: 'bank', amountMinor: Number.NaN },
      expect: 'amount-not-integer',
    },
    {
      name: 'infinite amount',
      input: { kind: 'expense', accountType: 'bank', amountMinor: Number.NEGATIVE_INFINITY },
      expect: 'amount-not-integer',
    },
    {
      name: 'amount beyond the sanity limit',
      input: { kind: 'income', accountType: 'bank', amountMinor: 10_000_000_001 },
      expect: 'amount-out-of-range',
    },
    {
      name: 'non-INR currency',
      input: { kind: 'expense', accountType: 'bank', amountMinor: -100, currency: 'USD' },
      expect: 'unsupported-currency',
    },
    {
      name: 'impossible calendar day',
      input: { kind: 'expense', accountType: 'bank', amountMinor: -100, day: '2026-02-30' },
      expect: 'invalid-day',
    },
    {
      name: 'unknown kind',
      input: { kind: 'gift' as unknown as TransactionKind, accountType: 'bank', amountMinor: -100 },
      expect: 'unknown-kind',
    },
    {
      name: 'unknown account type',
      input: { kind: 'expense', accountType: 'crypto' as unknown as AccountType, amountMinor: -100 },
      expect: 'unknown-account-type',
    },
    {
      name: 'blank refund link on a card',
      input: { kind: 'refund', accountType: 'credit_card', amountMinor: 100, refundOfId: '  ' },
      expect: 'refund-link-invalid',
    },
  ];

  for (const c of cases) it(c.name, () => run(c));
});

describe('allowedAccountTypes', () => {
  it('offers cards for spending but never for income', () => {
    assert.ok(allowedAccountTypes('expense').includes('credit_card'));
    assert.ok(!allowedAccountTypes('income').includes('credit_card'));
  });

  it('never offers a loan for a plain expense', () => {
    assert.ok(!allowedAccountTypes('expense').includes('loan'));
  });

  it('offers every account type for an adjustment', () => {
    assert.equal(allowedAccountTypes('adjustment').length, 7);
  });
});

describe('validateTransferPair', () => {
  const balanced: TransferLeg[] = [
    { accountId: 'bank', amountMinor: -500_000, transferId: 'T2' },
    { accountId: 'cash', amountMinor: 500_000, transferId: 'T2' },
  ];

  it('accepts a balanced pair between two accounts', () => {
    assert.equal(validateTransferPair(balanced).ok, true);
  });

  it('accepts an explicit transfer kind', () => {
    const result = validateTransferPair([
      { accountId: 'bank', amountMinor: -90_000, transferId: 'T1', kind: 'transfer' },
      { accountId: 'card', amountMinor: 90_000, transferId: 'T1', kind: 'transfer' },
    ]);
    assert.equal(result.ok, true);
  });

  it('rejects legs that do not sum to zero', () => {
    const result = validateTransferPair([
      { accountId: 'bank', amountMinor: -500_000, transferId: 'T2' },
      { accountId: 'cash', amountMinor: 400_000, transferId: 'T2' },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'transfer-not-balanced');
  });

  it('rejects a transfer to the same account', () => {
    const result = validateTransferPair([
      { accountId: 'bank', amountMinor: -500_000, transferId: 'T2' },
      { accountId: 'bank', amountMinor: 500_000, transferId: 'T2' },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'transfer-same-account');
  });

  it('rejects a single leg', () => {
    const result = validateTransferPair([balanced[0]!]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'transfer-leg-count');
  });

  it('rejects three legs', () => {
    const result = validateTransferPair([
      ...balanced,
      { accountId: 'wallet', amountMinor: 0, transferId: 'T2' },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'transfer-leg-count');
  });

  it('rejects mismatched transfer ids', () => {
    const result = validateTransferPair([
      { accountId: 'bank', amountMinor: -500_000, transferId: 'T2' },
      { accountId: 'cash', amountMinor: 500_000, transferId: 'T3' },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'transfer-id-mismatch');
  });

  it('rejects a missing transfer id', () => {
    const result = validateTransferPair([
      { accountId: 'bank', amountMinor: -500_000 },
      { accountId: 'cash', amountMinor: 500_000 },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'transfer-id-required');
  });

  it('rejects a leg that is not a transfer', () => {
    const result = validateTransferPair([
      { accountId: 'bank', amountMinor: -500_000, transferId: 'T2', kind: 'expense' },
      { accountId: 'cash', amountMinor: 500_000, transferId: 'T2' },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'transfer-leg-kind');
  });
});
