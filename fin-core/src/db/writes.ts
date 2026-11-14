/**
 * Writing and maintaining signed ledger rows.
 *
 * Every write path funnels through I3's `validatePosting`, so an invalid movement
 * is rejected before it reaches SQLite. The shapes that are easy to get subtly
 * wrong get dedicated helpers:
 *
 *   - a transfer is exactly two balanced legs sharing one `transferId`;
 *   - a refund is positive, linked to a real expense, and never exceeds it;
 *   - deleting an expense with refunds is explicit, not accidental.
 *
 * Transfers and refunds are *edited*, not deleted-and-reinserted, so a row keeps
 * its id, creation time and history. Deletion is always soft (`deleted_at`), which
 * keeps the backup and the audit trail intact.
 */

import { validatePosting, validateTransferPair } from '../posting';
import type { TransferLeg } from '../posting';
import { isDayKey } from '../money';
import type { AccountType, Transaction, TransactionKind, TransactionStatus } from '../types';
import type { SqliteDriver } from './driver';
import { withTransaction } from './driver';
import { toTransaction } from './mapping';
import type { FinTransactionRow } from './mapping';

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

export interface WriteOptions {
  readonly now?: () => number;
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

function kindOf(row: { readonly kind: string | null; readonly type: string }): string {
  return row.kind ?? row.type;
}

async function loadLiveRow(
  driver: SqliteDriver,
  id: string,
): Promise<FinTransactionRow> {
  const row = await driver.getFirstAsync<FinTransactionRow>(
    'SELECT * FROM fin_transactions WHERE id = ?',
    [id],
  );
  if (!row) {
    throw new LedgerError('transaction-not-found', `No transaction with id "${id}".`);
  }
  if (row.deleted_at !== null) {
    throw new LedgerError('transaction-deleted', `Transaction "${id}" has been deleted.`);
  }
  return row;
}

async function requireAccountId(
  driver: SqliteDriver,
  accountId: string | null,
  id: string,
): Promise<string> {
  if (!accountId) {
    throw new LedgerError(
      'account-required',
      `Transaction "${id}" has no account. Run the account migration first.`,
    );
  }
  return accountId;
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

// ---------------------------------------------------------------------------
// Single rows
// ---------------------------------------------------------------------------

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

export interface UpdateTransactionInput {
  readonly id: string;
  readonly kind?: TransactionKind;
  readonly accountId?: string;
  readonly amountMinor?: number;
  readonly day?: string;
  readonly categoryId?: string | null;
  readonly note?: string;
  readonly payee?: string | null;
  readonly status?: TransactionStatus;
}

/**
 * Edit an expense, income, interest or adjustment row.
 *
 * Transfers and refunds have dedicated helpers: a transfer must stay a balanced
 * pair, and a refund must stay within its original expense. Reaching this
 * function with either kind is a programming error, not a user error.
 */
export async function updateTransaction(
  driver: SqliteDriver,
  input: UpdateTransactionInput,
  options: WriteOptions = {},
): Promise<void> {
  const row = await loadLiveRow(driver, input.id);
  const existingKind = kindOf(row);

  if (existingKind === 'transfer' || row.transfer_id !== null) {
    throw new LedgerError(
      'use-transfer-api',
      'Edit a transfer with updateTransfer() so both legs stay balanced.',
    );
  }
  if (existingKind === 'refund') {
    await updateRefund(driver, input, options);
    return;
  }

  const kind = input.kind ?? (existingKind as TransactionKind);
  if (kind === 'transfer') {
    throw new LedgerError(
      'use-transfer-api',
      'Create and edit transfers with recordTransfer()/updateTransfer().',
    );
  }
  if (kind === 'refund') {
    throw new LedgerError(
      'use-refund-api',
      'Create and edit refunds with recordRefund()/updateRefund() so the link is preserved.',
    );
  }

  const accountId = await requireAccountId(
    driver,
    input.accountId ?? row.account_id,
    input.id,
  );
  const account = await lookupAccount(driver, accountId);
  const amountMinor = input.amountMinor ?? row.amount_minor;
  const day = input.day ?? row.day;

  // Check the refund guard before posting rules: an expense that already has
  // refunds cannot change kind at all, and that is a clearer message than
  // "income cannot be posted to a card".
  const refunded = await refundedTotalFor(driver, input.id);
  if (refunded > 0) {
    if (kind !== 'expense') {
      throw new LedgerError(
        'expense-has-refunds',
        'This expense has refunds, so it cannot be turned into another kind.',
      );
    }
    if (Math.abs(amountMinor) < refunded) {
      throw new LedgerError(
        'refund-exceeds-expense',
        `This expense has ${refunded} paise refunded, so its amount cannot be reduced below that.`,
      );
    }
  }

  const check = validatePosting({
    kind,
    accountType: account.type,
    amountMinor,
    day,
  });
  if (!check.ok) throw new LedgerError(check.code, check.message);

  const now = (options.now ?? Date.now)();
  await driver.runAsync(
    `UPDATE fin_transactions
        SET type = ?, kind = ?, amount_minor = ?, account_id = ?, category_id = ?,
            occurred_at = ?, day = ?, note = ?, payee = ?, status = ?, updated_at = ?
      WHERE id = ?`,
    [
      legacyType(kind),
      kind,
      amountMinor,
      accountId,
      input.categoryId !== undefined ? input.categoryId : row.category_id,
      occurredAtFor(day),
      day,
      input.note ?? row.note ?? '',
      input.payee !== undefined ? input.payee : row.payee,
      input.status ?? row.status ?? 'posted',
      now,
      input.id,
    ],
  );
}

export interface DeleteTransactionOptions extends WriteOptions {
  /**
   * What to do when an expense already has refunds.
   *
   * `block` (default) refuses the deletion so the ledger cannot be left with
   * refunds pointing at nothing. `cascade` soft-deletes the refunds with it.
   */
  readonly refundStrategy?: 'block' | 'cascade';
}

export interface DeleteTransactionResult {
  readonly deleted: number;
  readonly refundsDeleted: number;
}

/** Soft-delete one row, guarding refunds and delegating transfers. */
export async function deleteTransaction(
  driver: SqliteDriver,
  id: string,
  options: DeleteTransactionOptions = {},
): Promise<DeleteTransactionResult> {
  const row = await loadLiveRow(driver, id);
  const kind = kindOf(row);
  const now = (options.now ?? Date.now)();

  if (kind === 'transfer') {
    if (!row.transfer_id) {
      throw new LedgerError(
        'transfer-id-required',
        'This transfer leg has no transferId, so its pair cannot be removed with it.',
      );
    }
    const deleted = await deleteTransfer(driver, row.transfer_id, { now: () => now });
    return { deleted: deleted.deleted, refundsDeleted: 0 };
  }

  if (kind === 'refund') {
    await driver.runAsync(
      'UPDATE fin_transactions SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [now, now, id],
    );
    return { deleted: 1, refundsDeleted: 0 };
  }

  let refundsDeleted = 0;
  if (kind === 'expense') {
    const refunds = await loadRefundsFor(driver, id);
    if (refunds.length > 0) {
      if ((options.refundStrategy ?? 'block') === 'block') {
        throw new LedgerError(
          'expense-has-refunds',
          `This expense has ${refunds.length} refund(s). Delete them first, or pass refundStrategy: 'cascade'.`,
        );
      }
      const result = await driver.runAsync(
        'UPDATE fin_transactions SET deleted_at = ?, updated_at = ? WHERE refund_of_id = ? AND deleted_at IS NULL',
        [now, now, id],
      );
      refundsDeleted = result.changes;
    }
  }

  await driver.runAsync(
    'UPDATE fin_transactions SET deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, id],
  );
  return { deleted: 1, refundsDeleted };
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export interface RecordTransferResult {
  readonly transferId: string;
  readonly ids: readonly [string, string];
}

export interface TransferPair {
  readonly transferId: string;
  readonly from: Transaction;
  readonly to: Transaction;
}

async function readTransferRows(
  driver: SqliteDriver,
  transferId: string,
): Promise<FinTransactionRow[]> {
  return driver.getAllAsync<FinTransactionRow>(
    'SELECT * FROM fin_transactions WHERE transfer_id = ? AND deleted_at IS NULL ORDER BY amount_minor, id',
    [transferId],
  );
}

function splitTransfer(
  rows: readonly FinTransactionRow[],
  transferId: string,
): { readonly outLeg: FinTransactionRow; readonly inLeg: FinTransactionRow } {
  if (rows.length === 0) {
    throw new LedgerError('transfer-not-found', `No transfer with id "${transferId}".`);
  }
  if (rows.length !== 2) {
    throw new LedgerError(
      rows.length > 2 ? 'transfer-duplicate' : 'transfer-incomplete',
      `Transfer "${transferId}" has ${rows.length} live leg(s); exactly two are required.`,
    );
  }

  const [first, second] = rows as [FinTransactionRow, FinTransactionRow];
  const outLeg = first.amount_minor < 0 ? first : second;
  const inLeg = outLeg === first ? second : first;

  if (
    outLeg.amount_minor >= 0 ||
    inLeg.amount_minor <= 0 ||
    outLeg.amount_minor + inLeg.amount_minor !== 0
  ) {
    throw new LedgerError(
      'transfer-incomplete',
      `Transfer "${transferId}" is not balanced; its legs do not sum to zero.`,
    );
  }
  if (kindOf(outLeg) !== 'transfer' || kindOf(inLeg) !== 'transfer') {
    throw new LedgerError(
      'transfer-incomplete',
      `Transfer "${transferId}" has a leg that is not kind 'transfer'.`,
    );
  }

  return { outLeg, inLeg };
}

/**
 * Insert both legs of a transfer in one transaction.
 *
 * Ids are derived from `transferId`, so retrying the same transfer hits the
 * primary key instead of creating a third leg. An existing id is rejected
 * outright: silently overwriting a transfer would be worse than refusing.
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

  const existing = await driver.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM fin_transactions WHERE transfer_id = ?',
    [input.transferId],
  );
  if ((existing?.n ?? 0) > 0) {
    throw new LedgerError(
      'transfer-exists',
      `A transfer with id "${input.transferId}" already exists. Use updateTransfer() to change it.`,
    );
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

export interface UpdateTransferInput {
  readonly transferId: string;
  readonly fromAccountId?: string;
  readonly toAccountId?: string;
  /** Positive magnitude; omit to keep the current amount. */
  readonly amountMinor?: number;
  readonly day?: string;
  readonly note?: string;
  readonly status?: TransactionStatus;
}

/**
 * Edit a transfer in place.
 *
 * Both legs are updated in one transaction, so a failure cannot leave a
 * half-edited pair. Account, amount, day, note and status may all change; the
 * `transferId` and row ids do not.
 */
export async function updateTransfer(
  driver: SqliteDriver,
  input: UpdateTransferInput,
  options: WriteOptions = {},
): Promise<RecordTransferResult> {
  const rows = await readTransferRows(driver, input.transferId);
  const { outLeg, inLeg } = splitTransfer(rows, input.transferId);

  const fromId = await requireAccountId(
    driver,
    input.fromAccountId ?? outLeg.account_id,
    outLeg.id,
  );
  const toId = await requireAccountId(
    driver,
    input.toAccountId ?? inLeg.account_id,
    inLeg.id,
  );
  const amountMinor = input.amountMinor ?? -outLeg.amount_minor;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new LedgerError('amount-invalid', 'A transfer amount must be a positive whole number of paise.');
  }

  const day = input.day ?? outLeg.day;
  const note = input.note ?? outLeg.note ?? '';
  const status = input.status ?? ((outLeg.status as TransactionStatus | null) ?? 'posted');

  const from = await lookupAccount(driver, fromId);
  const to = await lookupAccount(driver, toId);

  const pair = validateTransferPair([
    { accountId: from.id, amountMinor: -amountMinor, transferId: input.transferId, kind: 'transfer' },
    { accountId: to.id, amountMinor, transferId: input.transferId, kind: 'transfer' },
  ]);
  if (!pair.ok) throw new LedgerError(pair.code, pair.message);

  for (const [account, amount] of [
    [from, -amountMinor],
    [to, amountMinor],
  ] as const) {
    const check = validatePosting({
      kind: 'transfer',
      accountType: account.type,
      amountMinor: amount,
      transferId: input.transferId,
      day,
    });
    if (!check.ok) throw new LedgerError(check.code, check.message);
  }

  const now = (options.now ?? Date.now)();
  await withTransaction(driver, async () => {
    await driver.runAsync(
      `UPDATE fin_transactions
          SET account_id = ?, amount_minor = ?, occurred_at = ?, day = ?, note = ?,
              status = ?, updated_at = ?
        WHERE id = ?`,
      [from.id, -amountMinor, occurredAtFor(day), day, note, status, now, outLeg.id],
    );
    await driver.runAsync(
      `UPDATE fin_transactions
          SET account_id = ?, amount_minor = ?, occurred_at = ?, day = ?, note = ?,
              status = ?, updated_at = ?
        WHERE id = ?`,
      [to.id, amountMinor, occurredAtFor(day), day, note, status, now, inLeg.id],
    );
  });

  return { transferId: input.transferId, ids: [outLeg.id, inLeg.id] };
}

/** Soft-delete every live leg of a transfer, so no orphan can remain. */
export async function deleteTransfer(
  driver: SqliteDriver,
  transferId: string,
  options: WriteOptions = {},
): Promise<{ readonly transferId: string; readonly deleted: number }> {
  const rows = await readTransferRows(driver, transferId);
  if (rows.length === 0) {
    throw new LedgerError('transfer-not-found', `No transfer with id "${transferId}".`);
  }

  const now = (options.now ?? Date.now)();
  const result = await driver.runAsync(
    'UPDATE fin_transactions SET deleted_at = ?, updated_at = ? WHERE transfer_id = ? AND deleted_at IS NULL',
    [now, now, transferId],
  );
  return { transferId, deleted: result.changes };
}

/** Load a healthy transfer pair. Throws when the pair is incomplete. */
export async function loadTransfer(
  driver: SqliteDriver,
  transferId: string,
): Promise<TransferPair | null> {
  const rows = await readTransferRows(driver, transferId);
  if (rows.length === 0) return null;
  const { outLeg, inLeg } = splitTransfer(rows, transferId);
  return {
    transferId,
    from: toTransaction(outLeg),
    to: toTransaction(inLeg),
  };
}

export interface TransferAuditEntry {
  readonly transferId: string;
  readonly legs: number;
  readonly sumMinor: number;
}

/** Every live transfer that is not exactly two legs summing to zero. */
export async function auditTransfers(
  driver: SqliteDriver,
): Promise<TransferAuditEntry[]> {
  const rows = await driver.getAllAsync<{
    transfer_id: string | null;
    legs: number;
    sum_minor: number | null;
  }>(
    `SELECT transfer_id, COUNT(*) AS legs, SUM(amount_minor) AS sum_minor
       FROM fin_transactions
      WHERE kind = 'transfer' AND deleted_at IS NULL
      GROUP BY transfer_id
     HAVING COUNT(*) <> 2 OR SUM(amount_minor) <> 0`,
  );

  return rows.map((row) => ({
    transferId: row.transfer_id ?? '(missing)',
    legs: row.legs,
    sumMinor: row.sum_minor ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export interface RefundedTotalOptions {
  readonly excludeRefundId?: string;
}

/** Sum of live refunds linked to an expense. */
export async function refundedTotalFor(
  driver: SqliteDriver,
  expenseId: string,
  options: RefundedTotalOptions = {},
): Promise<number> {
  const row = await driver.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount_minor), 0) AS total
       FROM fin_transactions
      WHERE kind = 'refund' AND refund_of_id = ? AND deleted_at IS NULL AND id <> ?`,
    [expenseId, options.excludeRefundId ?? ''],
  );
  return row?.total ?? 0;
}

/** Live refunds linked to an expense, for the transaction history. */
export async function loadRefundsFor(
  driver: SqliteDriver,
  expenseId: string,
): Promise<Transaction[]> {
  const rows = await driver.getAllAsync<FinTransactionRow>(
    `SELECT * FROM fin_transactions
      WHERE kind = 'refund' AND refund_of_id = ? AND deleted_at IS NULL
      ORDER BY day, id`,
    [expenseId],
  );
  return rows.map(toTransaction);
}

async function requireExpenseForRefund(
  driver: SqliteDriver,
  expenseId: string,
): Promise<FinTransactionRow> {
  const original = await driver.getFirstAsync<FinTransactionRow>(
    'SELECT * FROM fin_transactions WHERE id = ?',
    [expenseId],
  );
  if (!original) {
    throw new LedgerError(
      'refund-original-missing',
      `No transaction with id "${expenseId}" to refund.`,
    );
  }
  if (original.deleted_at !== null) {
    throw new LedgerError(
      'refund-original-deleted',
      'The expense being refunded has been deleted.',
    );
  }
  if (kindOf(original) !== 'expense') {
    throw new LedgerError(
      'refund-original-not-expense',
      'A refund can only reverse an expense.',
    );
  }
  return original;
}

/**
 * Record a refund and prove it points at a real, live expense.
 *
 * The refund may be partial, but the sum of all live refunds for one expense can
 * never exceed the expense itself. The category defaults to the original's, so a
 * category budget sees the refund even when the caller does not pass one.
 */
export async function recordRefund(
  driver: SqliteDriver,
  input: RecordRefundInput,
  options: WriteOptions = {},
): Promise<void> {
  if (!input.refundOfId) {
    throw new LedgerError('refund-link-required', 'A refund must point at the expense it reverses.');
  }

  const original = await requireExpenseForRefund(driver, input.refundOfId);
  const account = await lookupAccount(driver, input.accountId);

  const check = validatePosting({
    kind: 'refund',
    accountType: account.type,
    amountMinor: input.amountMinor,
    refundOfId: input.refundOfId,
    day: input.day,
  });
  if (!check.ok) throw new LedgerError(check.code, check.message);

  const alreadyRefunded = await refundedTotalFor(driver, input.refundOfId);
  const remaining = Math.abs(original.amount_minor) - alreadyRefunded;
  if (input.amountMinor > remaining) {
    throw new LedgerError(
      'refund-exceeds-expense',
      `This refund is ${input.amountMinor} paise, but only ${Math.max(0, remaining)} paise remain unrefunded.`,
    );
  }

  await insertRow(
    driver,
    {
      id: input.id,
      accountId: input.accountId,
      kind: 'refund',
      amountMinor: input.amountMinor,
      day: input.day,
      categoryId:
        input.categoryId !== undefined ? input.categoryId : original.category_id,
      refundOfId: input.refundOfId,
      note: input.note,
      status: input.status,
    },
    (options.now ?? Date.now)(),
  );
}

export interface UpdateRefundInput {
  readonly id: string;
  readonly amountMinor?: number;
  readonly day?: string;
  readonly refundOfId?: string;
  readonly accountId?: string;
  readonly categoryId?: string | null;
  readonly note?: string;
  readonly status?: TransactionStatus;
}

/** Edit a refund, re-checking its limit against the (possibly new) original. */
export async function updateRefund(
  driver: SqliteDriver,
  input: UpdateRefundInput,
  options: WriteOptions = {},
): Promise<void> {
  const row = await loadLiveRow(driver, input.id);
  if (kindOf(row) !== 'refund') {
    throw new LedgerError('not-a-refund', `Transaction "${input.id}" is not a refund.`);
  }

  const originalId = input.refundOfId ?? row.refund_of_id;
  if (!originalId) {
    throw new LedgerError('refund-link-required', 'A refund must point at the expense it reverses.');
  }
  const original = await requireExpenseForRefund(driver, originalId);

  const accountId = await requireAccountId(
    driver,
    input.accountId ?? row.account_id,
    input.id,
  );
  const account = await lookupAccount(driver, accountId);
  const amountMinor = input.amountMinor ?? row.amount_minor;
  const day = input.day ?? row.day;

  const check = validatePosting({
    kind: 'refund',
    accountType: account.type,
    amountMinor,
    refundOfId: originalId,
    day,
  });
  if (!check.ok) throw new LedgerError(check.code, check.message);

  const alreadyRefunded = await refundedTotalFor(driver, originalId, {
    excludeRefundId: input.id,
  });
  const remaining = Math.abs(original.amount_minor) - alreadyRefunded;
  if (amountMinor > remaining) {
    throw new LedgerError(
      'refund-exceeds-expense',
      `This refund is ${amountMinor} paise, but only ${Math.max(0, remaining)} paise remain unrefunded.`,
    );
  }

  const categoryId =
    input.categoryId !== undefined
      ? input.categoryId
      : input.refundOfId !== undefined
        ? original.category_id
        : row.category_id;

  const now = (options.now ?? Date.now)();
  await driver.runAsync(
    `UPDATE fin_transactions
        SET account_id = ?, amount_minor = ?, occurred_at = ?, day = ?, category_id = ?,
            refund_of_id = ?, note = ?, status = ?, updated_at = ?
      WHERE id = ?`,
    [
      accountId,
      amountMinor,
      occurredAtFor(day),
      day,
      categoryId,
      originalId,
      input.note ?? row.note ?? '',
      input.status ?? row.status ?? 'posted',
      now,
      input.id,
    ],
  );
}

/** Soft-delete a refund. The original expense is untouched. */
export async function deleteRefund(
  driver: SqliteDriver,
  id: string,
  options: WriteOptions = {},
): Promise<void> {
  const row = await loadLiveRow(driver, id);
  if (kindOf(row) !== 'refund') {
    throw new LedgerError('not-a-refund', `Transaction "${id}" is not a refund.`);
  }
  const now = (options.now ?? Date.now)();
  await driver.runAsync(
    'UPDATE fin_transactions SET deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, id],
  );
}
