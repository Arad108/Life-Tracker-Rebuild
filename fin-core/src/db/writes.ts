/**
 * I2 — Writing signed ledger rows.
 *
 * Every write path funnels through I3's `validatePosting`, so an invalid movement
 * is rejected before it reaches SQLite. Transfers and refunds get dedicated
 * helpers because they are the two shapes that are easy to get subtly wrong:
 * a transfer must be a balanced pair, and a refund must point at a real expense.
 */

import { validatePosting, validateTransferPair } from '../posting';
import type { TransferLeg } from '../posting';
import { isDayKey } from '../money';
import type { AccountType, TransactionKind, TransactionStatus } from '../types';
import type { SqliteDriver } from './driver';
import { withTransaction } from './driver';

export class LedgerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}

export interface RecordTransactionInput {
  readonly id: string;
  readonly accountId: string;
  readonly kind: TransactionKind;
  readonly amountMinor: number;
  readonly day: string;
  readonly categoryId?: string | null;
  readonly status?: TransactionStatus;
  readonly transferId?: string | null;
  readonly refundOfId?: string | null;
  readonly note?: string;
  readonly payee?: string | null;
  readonly currency?: string;
}

export interface RecordTransferInput {
  readonly transferId: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  /** Positive magnitude; the helper applies the signs. */
  readonly amountMinor: number;
  readonly day: string;
  readonly note?: string;
  readonly status?: TransactionStatus;
}

export interface RecordRefundInput {
  readonly id: string;
  readonly accountId: string;
  /** Positive: a refund always increases the account balance. */
  readonly amountMinor: number;
  readonly day: string;
  readonly refundOfId: string;
  readonly categoryId?: string | null;
  readonly note?: string;
  readonly status?: TransactionStatus;
}

interface AccountLookup {
  readonly id: string;
  readonly type: AccountType;
}

async function lookupAccount(
  driver: SqliteDriver,
  accountId: string,
): Promise<AccountLookup> {
  const row = await driver.getFirstAsync<{ id: string; type: string }>(
    'SELECT id, type FROM fin_accounts WHERE id = ?',
    [accountId],
  );
  if (!row) {
    throw new LedgerError('account-not-found', `No account with id "${accountId}".`);
  }
  return { id: row.id, type: row.type as AccountType };
}

/** Millisecond timestamp for `occurred_at`, derived from the local day key. */
function occurredAtFor(day: string): number {
  if (!isDayKey(day)) {
    throw new LedgerError('invalid-day', `Day must be local YYYY-MM-DD; received "${day}".`);
  }
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return Date.UTC(year, month - 1, date);
}

/**
 * Legacy `type` mirrors `kind`.
 *
 * Keeping the two original values identical means the shipped app's
 * `WHERE type = 'expense'` queries still mean the same thing; new kinds keep
 * their own name instead of being forced into an expense/income bucket, so a
 * legacy aggregate can never count a transfer as spending.
 */
function legacyType(kind: TransactionKind): string {
  return kind;
}

interface InsertRow {
  readonly id: string;
  readonly accountId: string;
  readonly kind: TransactionKind;
  readonly amountMinor: number;
  readonly day: string;
  readonly categoryId?: string | null;
  readonly status?: TransactionStatus;
  readonly transferId?: string | null;
  readonly refundOfId?: string | null;
  readonly note?: string;
  readonly payee?: string | null;
  readonly currency?: string;
}

async function insertRow(
  driver: SqliteDriver,
  row: InsertRow,
  now: number,
): Promise<void> {
  await driver.runAsync(
    `INSERT INTO fin_transactions (
       id, type, kind, amount_minor, currency, category_id, occurred_at, day, note,
       method, for_whom, payee, recurring_id, source, external_id, extra,
       created_at, updated_at, account_id, transfer_id, refund_of_id, status, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, 'manual', NULL, '{}', ?, ?, ?, ?, ?, ?, NULL)`,
    [
      row.id,
      legacyType(row.kind),
      row.kind,
      row.amountMinor,
      row.currency ?? 'INR',
      row.categoryId ?? null,
      occurredAtFor(row.day),
      row.day,
      row.note ?? '',
      row.payee ?? null,
      now,
      now,
      row.accountId,
      row.transferId ?? null,
      row.refundOfId ?? null,
      row.status ?? 'posted',
    ],
  );
}

export interface WriteOptions {
  readonly now?: () => number;
}

export async function recordTransaction(
  driver: SqliteDriver,
  input: RecordTransactionInput,
  options: WriteOptions = {},
): Promise<void> {
  const account = await lookupAccount(driver, input.accountId);

  const check = validatePosting({
    kind: input.kind,
    accountType: account.type,
    amountMinor: input.amountMinor,
    transferId: input.transferId,
    refundOfId: input.refundOfId,
    currency: input.currency ?? 'INR',
    day: input.day,
  });
  if (!check.ok) throw new LedgerError(check.code, check.message);

  await insertRow(driver, input, (options.now ?? Date.now)());
}

export interface RecordTransferResult {
  readonly transferId: string;
  readonly ids: readonly [string, string];
}

/**
 * Insert both legs of a transfer in one transaction.
 *
 * Ids are derived from `transferId`, so retrying the same transfer hits the
 * primary key instead of creating a third leg.
 */
export async function recordTransfer(
  driver: SqliteDriver,
  input: RecordTransferInput,
  options: WriteOptions = {},
): Promise<RecordTransferResult> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new LedgerError('amount-invalid', 'A transfer amount must be a positive whole number of paise.');
  }
  if (!input.transferId || input.transferId.trim().length === 0) {
    throw new LedgerError('transfer-id-required', 'A transfer needs a non-empty transferId.');
  }

  const from = await lookupAccount(driver, input.fromAccountId);
  const to = await lookupAccount(driver, input.toAccountId);

  const legs: TransferLeg[] = [
    {
      accountId: from.id,
      amountMinor: -input.amountMinor,
      transferId: input.transferId,
      kind: 'transfer',
    },
    {
      accountId: to.id,
      amountMinor: input.amountMinor,
      transferId: input.transferId,
      kind: 'transfer',
    },
  ];

  const pair = validateTransferPair(legs);
  if (!pair.ok) throw new LedgerError(pair.code, pair.message);

  for (const leg of legs) {
    const accountType = leg.accountId === from.id ? from.type : to.type;
    const check = validatePosting({
      kind: 'transfer',
      accountType,
      amountMinor: leg.amountMinor,
      transferId: input.transferId,
      day: input.day,
    });
    if (!check.ok) throw new LedgerError(check.code, check.message);
  }

  const now = (options.now ?? Date.now)();
  const ids: [string, string] = [
    `${input.transferId}:from`,
    `${input.transferId}:to`,
  ];

  await withTransaction(driver, async () => {
    await insertRow(
      driver,
      {
        id: ids[0],
        accountId: from.id,
        kind: 'transfer',
        amountMinor: -input.amountMinor,
        day: input.day,
        transferId: input.transferId,
        note: input.note,
        status: input.status,
      },
      now,
    );
    await insertRow(
      driver,
      {
        id: ids[1],
        accountId: to.id,
        kind: 'transfer',
        amountMinor: input.amountMinor,
        day: input.day,
        transferId: input.transferId,
        note: input.note,
        status: input.status,
      },
      now,
    );
  });

  return { transferId: input.transferId, ids };
}

/**
 * Record a refund and prove it points at an expense.
 *
 * A refund is positive and linked; it is never fresh income. Rejecting a link to
 * a non-expense keeps the calculation honest even if the UI is wrong.
 */
export async function recordRefund(
  driver: SqliteDriver,
  input: RecordRefundInput,
  options: WriteOptions = {},
): Promise<void> {
  if (!input.refundOfId) {
    throw new LedgerError('refund-link-required', 'A refund must point at the expense it reverses.');
  }

  const original = await driver.getFirstAsync<{
    id: string;
    kind: string | null;
    type: string;
  }>(
    'SELECT id, kind, type FROM fin_transactions WHERE id = ?',
    [input.refundOfId],
  );
  if (!original) {
    throw new LedgerError(
      'refund-original-missing',
      `No transaction with id "${input.refundOfId}" to refund.`,
    );
  }
  if ((original.kind ?? original.type) !== 'expense') {
    throw new LedgerError(
      'refund-original-not-expense',
      'A refund can only reverse an expense.',
    );
  }

  const account = await lookupAccount(driver, input.accountId);
  const check = validatePosting({
    kind: 'refund',
    accountType: account.type,
    amountMinor: input.amountMinor,
    refundOfId: input.refundOfId,
    day: input.day,
  });
  if (!check.ok) throw new LedgerError(check.code, check.message);

  await insertRow(
    driver,
    {
      id: input.id,
      accountId: input.accountId,
      kind: 'refund',
      amountMinor: input.amountMinor,
      day: input.day,
      categoryId: input.categoryId,
      refundOfId: input.refundOfId,
      note: input.note,
      status: input.status,
    },
    (options.now ?? Date.now)(),
  );
}
