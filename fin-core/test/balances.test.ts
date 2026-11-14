import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  balanceOf,
  balancesByAccount,
  cardDebt,
  liquidBalance,
  netWorth,
} from '../src/balances';
import type { Account } from '../src/types';
import {
  ACCOUNTS,
  BANK,
  CARD,
  CASH,
  INVESTMENT,
  LOAN,
  TRANSACTIONS,
  rupees,
} from './fixtures';

describe('balanceOf', () => {
  it('is opening balance plus every movement', () => {
    assert.equal(balanceOf(BANK, TRANSACTIONS).value, rupees(1_29_730));
    assert.equal(balanceOf(CASH, TRANSACTIONS).value, rupees(6_700));
    assert.equal(balanceOf(INVESTMENT, TRANSACTIONS).value, rupees(10_000));
  });

  it('keeps liabilities negative rather than storing them as positive debt', () => {
    assert.equal(balanceOf(LOAN, TRANSACTIONS).value, -rupees(42_000));
  });

  it('can be read as of a past day, inclusive', () => {
    // 50,000 opening + 50,000 disbursement + 80,000 salary - 18,000 rent - 4,500 groceries
    assert.equal(balanceOf(BANK, TRANSACTIONS, '2026-11-05').value, rupees(1_57_500));
  });

  it('includes excluded rows, because that money really moved', () => {
    const withExcluded = balanceOf(BANK, TRANSACTIONS).value;
    const withoutExcluded = balanceOf(
      BANK,
      TRANSACTIONS.filter((transaction) => transaction.id !== 't18'),
    ).value;
    assert.equal(withExcluded, withoutExcluded - rupees(2_000));
  });

  it('ignores soft-deleted rows', () => {
    const withDeleted = balanceOf(BANK, TRANSACTIONS).value;
    const withoutDeleted = balanceOf(
      BANK,
      TRANSACTIONS.filter((transaction) => transaction.id !== 't20'),
    ).value;
    assert.equal(withDeleted, withoutDeleted);
  });

  it('uses a manual balance when one is set', () => {
    const gold: Account = {
      id: 'acc-gold',
      name: 'Gold',
      type: 'asset',
      openingBalanceMinor: 0,
      balanceMode: 'manual',
      manualBalanceMinor: rupees(5_00_000),
    };
    const result = balanceOf(gold, TRANSACTIONS);
    assert.equal(result.value, rupees(5_00_000));
    assert.equal(result.inputs.movement, 0);
  });

  it('falls back to the derived balance when a manual value is missing', () => {
    const incomplete: Account = {
      id: 'acc-m',
      name: 'Property',
      type: 'asset',
      openingBalanceMinor: rupees(1_000),
      balanceMode: 'manual',
      manualBalanceMinor: null,
    };
    const result = balanceOf(incomplete, TRANSACTIONS);
    assert.equal(result.value, rupees(1_000));
    assert.ok(result.notes && result.notes.length > 0);
  });

  it('rejects a malformed asOf day', () => {
    assert.throws(() => balanceOf(BANK, TRANSACTIONS, '5-11-2026'), RangeError);
  });
});

describe('netWorth', () => {
  it('sums signed balances, so liabilities subtract themselves', () => {
    const result = netWorth(ACCOUNTS, TRANSACTIONS);
    assert.equal(result.value, rupees(1_05_330));
    assert.equal(result.inputs.assets, rupees(1_47_330));
    assert.equal(result.inputs.liabilities, rupees(42_000));
  });

  it('can be read as of a past day', () => {
    assert.equal(netWorth(ACCOUNTS, TRANSACTIONS, '2026-11-05').value, rupees(1_09_500));
  });

  it('leaves out archived accounts', () => {
    const archived: Account = {
      id: 'acc-old',
      name: 'Closed account',
      type: 'bank',
      openingBalanceMinor: rupees(9_00_000),
      archived: true,
    };
    assert.equal(netWorth([...ACCOUNTS, archived], TRANSACTIONS).value, rupees(1_05_330));
  });

  it('leaves out accounts explicitly excluded from net worth', () => {
    const shared: Account = {
      id: 'acc-shared',
      name: 'Family account',
      type: 'bank',
      openingBalanceMinor: rupees(9_00_000),
      includeInNetWorth: false,
    };
    const result = netWorth([...ACCOUNTS, shared], TRANSACTIONS);
    assert.equal(result.value, rupees(1_05_330));
    assert.equal(result.inputs.skipped, 1);
  });
});

describe('balancesByAccount', () => {
  it('returns every account, archived ones included, for history', () => {
    const balances = balancesByAccount(ACCOUNTS, TRANSACTIONS);
    assert.equal(balances.get(BANK.id), rupees(1_29_730));
    assert.equal(balances.get(CARD.id), rupees(900));
    assert.equal(balances.get(LOAN.id), -rupees(42_000));
  });
});

describe('liquidBalance and cardDebt', () => {
  it('counts only spendable accounts', () => {
    assert.equal(liquidBalance(ACCOUNTS, TRANSACTIONS).value, rupees(1_36_430));
  });

  it('reports no card debt when the card is in credit', () => {
    assert.equal(balanceOf(CARD, TRANSACTIONS).value, rupees(900));
    assert.equal(cardDebt(ACCOUNTS, TRANSACTIONS).value, 0);
  });

  it('reports card debt as a positive number when money is owed', () => {
    const spent = [
      ...TRANSACTIONS,
      {
        id: 't99',
        accountId: CARD.id,
        kind: 'expense' as const,
        amountMinor: -rupees(1_000),
        day: '2026-11-29',
      },
    ];
    assert.equal(cardDebt(ACCOUNTS, spent).value, rupees(100));
  });
});
