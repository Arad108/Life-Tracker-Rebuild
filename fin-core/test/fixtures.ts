/**
 * Realistic fixtures, in paise.
 *
 * One full November, preceded by an October loan disbursement so that range
 * filtering and opening balances are both exercised.
 *
 * Amounts are written as `rupees(50_000)` rather than `5_000_000` so the
 * arithmetic stays readable and mistakes stay obvious.
 */

import type { Account, DayRange, Transaction } from '../src/types';

export function rupees(value: number): number {
  return Math.round(value * 100);
}

export const OCTOBER: DayRange = { from: '2026-10-01', to: '2026-10-31' };
export const NOVEMBER: DayRange = { from: '2026-11-01', to: '2026-11-30' };

export const BANK: Account = {
  id: 'acc-bank',
  name: 'HDFC Savings',
  type: 'bank',
  openingBalanceMinor: rupees(50_000),
  openingDay: '2026-10-01',
};

export const CASH: Account = {
  id: 'acc-cash',
  name: 'Cash',
  type: 'cash',
  openingBalanceMinor: rupees(2_000),
  openingDay: '2026-10-01',
};

export const CARD: Account = {
  id: 'acc-card',
  name: 'ICICI Amazon Card',
  type: 'credit_card',
  openingBalanceMinor: 0,
  openingDay: '2026-10-01',
  creditLimitMinor: rupees(1_50_000),
};

export const LOAN: Account = {
  id: 'acc-loan',
  name: 'Car Loan',
  type: 'loan',
  openingBalanceMinor: 0,
  openingDay: '2026-10-01',
};

export const INVESTMENT: Account = {
  id: 'acc-invest',
  name: 'Nifty 50 Index Fund',
  type: 'investment',
  openingBalanceMinor: 0,
  openingDay: '2026-10-01',
};

export const ACCOUNTS: readonly Account[] = [BANK, CASH, CARD, LOAN, INVESTMENT];

export const TRANSACTIONS: readonly Transaction[] = [
  // ---- October: the loan is disbursed into the bank account.
  // Borrowing is not income, and the pair nets to zero.
  {
    id: 't01',
    accountId: BANK.id,
    kind: 'transfer',
    amountMinor: rupees(50_000),
    day: '2026-10-01',
    transferId: 'T0',
    note: 'Car loan disbursed',
  },
  {
    id: 't02',
    accountId: LOAN.id,
    kind: 'transfer',
    amountMinor: -rupees(50_000),
    day: '2026-10-01',
    transferId: 'T0',
    note: 'Car loan disbursed',
  },

  // ---- November
  {
    id: 't03',
    accountId: BANK.id,
    kind: 'income',
    amountMinor: rupees(80_000),
    day: '2026-11-01',
    categoryId: 'cat-salary',
    note: 'Salary',
  },
  {
    id: 't04',
    accountId: BANK.id,
    kind: 'expense',
    amountMinor: -rupees(18_000),
    day: '2026-11-02',
    categoryId: 'cat-rent',
    note: 'Rent',
  },
  {
    id: 't05',
    accountId: BANK.id,
    kind: 'expense',
    amountMinor: -rupees(4_500),
    day: '2026-11-05',
    categoryId: 'cat-groceries',
    note: 'Groceries',
  },
  // Card purchase: spending now, no bank movement yet.
  {
    id: 't06',
    accountId: CARD.id,
    kind: 'expense',
    amountMinor: -rupees(900),
    day: '2026-11-06',
    categoryId: 'cat-dining',
    payee: 'Swiggy',
  },
  // Card bill payment: a transfer. Must not change spending.
  {
    id: 't07',
    accountId: BANK.id,
    kind: 'transfer',
    amountMinor: -rupees(900),
    day: '2026-11-10',
    transferId: 'T1',
    note: 'Card bill',
  },
  {
    id: 't08',
    accountId: CARD.id,
    kind: 'transfer',
    amountMinor: rupees(900),
    day: '2026-11-10',
    transferId: 'T1',
    note: 'Card bill',
  },
  // Cash withdrawal: a transfer. Must not change spending.
  {
    id: 't09',
    accountId: BANK.id,
    kind: 'transfer',
    amountMinor: -rupees(5_000),
    day: '2026-11-12',
    transferId: 'T2',
    note: 'ATM withdrawal',
  },
  {
    id: 't10',
    accountId: CASH.id,
    kind: 'transfer',
    amountMinor: rupees(5_000),
    day: '2026-11-12',
    transferId: 'T2',
    note: 'ATM withdrawal',
  },
  // The dinner is refunded in full. Not income.
  {
    id: 't11',
    accountId: CARD.id,
    kind: 'refund',
    amountMinor: rupees(900),
    day: '2026-11-14',
    categoryId: 'cat-dining',
    refundOfId: 't06',
    note: 'Refund',
  },
  // EMI: principal is a transfer, interest is spending.
  {
    id: 't12',
    accountId: BANK.id,
    kind: 'transfer',
    amountMinor: -rupees(8_000),
    day: '2026-11-15',
    transferId: 'T3',
    note: 'EMI principal',
  },
  {
    id: 't13',
    accountId: LOAN.id,
    kind: 'transfer',
    amountMinor: rupees(8_000),
    day: '2026-11-15',
    transferId: 'T3',
    note: 'EMI principal',
  },
  {
    id: 't14',
    accountId: BANK.id,
    kind: 'interest',
    amountMinor: -rupees(2_000),
    day: '2026-11-15',
    categoryId: 'cat-interest',
    note: 'EMI interest',
  },
  // SIP: an investment purchase is a transfer, not an expense.
  {
    id: 't15',
    accountId: BANK.id,
    kind: 'transfer',
    amountMinor: -rupees(10_000),
    day: '2026-11-20',
    transferId: 'T4',
    note: 'Monthly SIP',
  },
  {
    id: 't16',
    accountId: INVESTMENT.id,
    kind: 'transfer',
    amountMinor: rupees(10_000),
    day: '2026-11-20',
    transferId: 'T4',
    note: 'Monthly SIP',
  },
  // Reconciliation: real money, not spending.
  {
    id: 't17',
    accountId: BANK.id,
    kind: 'adjustment',
    amountMinor: rupees(130),
    day: '2026-11-25',
    note: 'Reconciled to statement',
  },
  // Deliberately kept out of analytics, still moves the bank balance.
  {
    id: 't18',
    accountId: BANK.id,
    kind: 'transfer',
    amountMinor: -rupees(2_000),
    day: '2026-11-26',
    transferId: 'T5',
    status: 'excluded',
    note: 'Sent to a friend',
  },
  // Imported and awaiting review: counted, flagged.
  {
    id: 't19',
    accountId: CASH.id,
    kind: 'expense',
    amountMinor: -rupees(300),
    day: '2026-11-27',
    categoryId: 'cat-coffee',
    status: 'pending',
    note: 'Coffee',
  },
  // Soft-deleted: invisible everywhere.
  {
    id: 't20',
    accountId: BANK.id,
    kind: 'expense',
    amountMinor: -rupees(9_999),
    day: '2026-11-28',
    deletedAt: 1_763_000_000_000,
    note: 'Deleted mistake',
  },
];
