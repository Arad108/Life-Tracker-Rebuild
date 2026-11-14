/**
 * I8 — Bills in SQLite.
 *
 * A bill schedule lives in `fin_recurring` and its payments live in
 * `fin_transactions` with `recurring_id` set and `bill_due_day` recording the
 * occurrence they cover. The schedule is never a payment, and a payment is
 * never a schedule: the two are linked, not merged.
 *
 * Duplicate prevention has two layers:
 *
 *   1. A deterministic transaction id (`fin-bill:<bill>:<dueDay>`), so a repeat
 *      call cannot create a second row.
 *   2. A pre-flight query for a live payment on that occurrence, so a payment
 *      already recorded is returned as `created: false` instead of throwing.
 *
 * Nothing is posted automatically. Marking paid is an explicit user action.
 */

import { validatePosting } from '../posting';
import type { AccountType, TransactionKind, TransactionStatus } from '../types';
import { MAX_ABS_AMOUNT_MINOR } from '../money';
import { isDayKey } from '../money';
import type { SqlParam } from './driver';
import type { Bill, BillCadence, BillPaymentRef, BillSkipRef } from '../bills';
import {
  advanceDue,
  BILL_CADENCES,
  billOccurrences,
  expectedAmount,
  isUnpaidState,
  upcomingBills,
} from '../bills';
import { addDays } from '../dates';
import type { SqliteDriver } from './driver';
import { withTransaction } from './driver';
import { hasColumn, tableExists } from './introspect';
import {
  ACCOUNT_INDEXES,
  BILL_INDEXES,
  DEFAULT_CASH_ACCOUNT_ID,
  FIN_ACCOUNTS_DDL,
  FIN_BILL_SKIPS_DDL,
  FIN_CATEGORIES_DDL,
  FIN_RECURRING_DDL,
  FIN_SNAPSHOTS_DDL,
  FIN_TRANSACTIONS_DDL,
  KIND_INDEXES,
  LEGACY_INDEXES,
  SETTING_KEYS,
  SETTINGS_DDL,
} from './schema';
import { getSetting, setSetting } from './settings';
import { LedgerError } from './writes';

export interface FinRecurringRow {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly amount_minor: number;
  readonly category_id: string | null;
  readonly cadence: string;
  readonly next_day: string;
  readonly active: number;
  readonly account_id: string | null;
  readonly tolerance_days: number | null;
  readonly variable_amount: number | null;
  readonly last_paid_day: string | null;
  readonly last_amount_minor: number | null;
  readonly notes: string | null;
  readonly cancelled_at: number | null;
  readonly deleted_at: number | null;
}

export interface FinBillSkipRow {
  readonly id: string;
  readonly bill_id: string;
  readonly due_day: string;
  readonly reason: string | null;
  readonly created_at: number;
}

export interface FinTransactionBillRow {
  readonly id: string;
  readonly recurring_id: string | null;
  readonly bill_due_day: string | null;
  readonly amount_minor: number;
  readonly day: string;
  readonly deleted_at: number | null;
}

export function toBill(row: FinRecurringRow): Bill {
  const cadence = BILL_CADENCES.includes(row.cadence as BillCadence)
    ? (row.cadence as BillCadence)
    : 'monthly';

  return {
    id: row.id,
    title: row.title,
    amountMinor: row.amount_minor,
    accountId: row.account_id ?? DEFAULT_CASH_ACCOUNT_ID,
    categoryId: row.category_id,
    type: row.type === 'income' ? 'income' : 'expense',
    cadence,
    nextDueDay: row.next_day,
    active: row.active === 1,
    variableAmount: row.variable_amount === 1,
    toleranceDays: row.tolerance_days ?? 0,
    lastPaidDay: row.last_paid_day,
    lastAmountMinor: row.last_amount_minor,
    notes: row.notes ?? '',
    cancelledAt: row.cancelled_at,
    deletedAt: row.deleted_at,
  };
}

function isBillCadence(value: unknown): value is BillCadence {
  return BILL_CADENCES.includes(value as BillCadence);
}

function occurredAtFor(day: string): number {
  if (!isDayKey(day)) {
    throw new LedgerError('invalid-day', `Day must be local YYYY-MM-DD; received "${day}".`);
  }
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return Date.UTC(year, month - 1, date);
}

function accountTypeOf(driver: SqliteDriver, accountId: string): Promise<AccountType> {
  return driver
    .getFirstAsync<{ type: string }>('SELECT type FROM fin_accounts WHERE id = ?', [accountId])
    .then((row) => {
      if (!row) {
        throw new LedgerError('account-not-found', `No account with id "${accountId}".`);
      }
      return row.type as AccountType;
    });
}

function assertAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new LedgerError('amount-invalid', 'A bill amount must be a positive whole number of paise.');
  }
  if (amountMinor > MAX_ABS_AMOUNT_MINOR) {
    throw new LedgerError('amount-invalid', 'A bill amount is larger than the supported limit.');
  }
}

export interface CreateBillInput {
  readonly id?: string;
  readonly title: string;
  readonly amountMinor: number;
  readonly accountId?: string;
  readonly categoryId?: string | null;
  readonly type?: 'expense' | 'income';
  readonly cadence: BillCadence;
  readonly nextDueDay: string;
  readonly variableAmount?: boolean;
  readonly toleranceDays?: number;
  readonly notes?: string;
  readonly now?: () => number;
}

export interface UpdateBillInput {
  readonly id: string;
  readonly title?: string;
  readonly amountMinor?: number;
  readonly accountId?: string;
  readonly categoryId?: string | null;
  readonly type?: 'expense' | 'income';
  readonly cadence?: BillCadence;
  readonly nextDueDay?: string;
  readonly variableAmount?: boolean;
  readonly toleranceDays?: number;
  readonly notes?: string;
  readonly active?: boolean;
}

export interface BillWriteOptions {
  readonly now?: () => number;
}

export interface RecordBillPaymentInput {
  readonly billId: string;
  readonly paidDay: string;
  readonly dueDay?: string;
  readonly amountMinor?: number;
  readonly accountId?: string;
  readonly note?: string;
  readonly transactionId?: string;
  readonly status?: TransactionStatus;
}

export interface BillPaymentResult {
  readonly billId: string;
  readonly transactionId: string;
  readonly dueDay: string;
  readonly amountMinor: number;
  readonly created: boolean;
  readonly bill: Bill;
}

export interface SkipBillInput {
  readonly billId: string;
  readonly dueDay?: string;
  readonly reason?: string;
}

export interface SkipBillResult {
  readonly billId: string;
  readonly dueDay: string;
  readonly created: boolean;
  readonly bill: Bill;
}

export interface BillQueryOptions {
  readonly includeInactive?: boolean;
  readonly includeCancelled?: boolean;
  readonly includeDeleted?: boolean;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function nowOf(options: BillWriteOptions | undefined, fallback?: () => number): number {
  return (options?.now ?? fallback ?? Date.now)();
}

export async function loadBill(
  driver: SqliteDriver,
  id: string,
): Promise<Bill | null> {
  const row = await driver.getFirstAsync<FinRecurringRow>(
    'SELECT * FROM fin_recurring WHERE id = ?',
    [id],
  );
  if (!row || row.deleted_at != null) return null;
  return toBill(row);
}

export async function listBills(
  driver: SqliteDriver,
  options: BillQueryOptions = {},
): Promise<Bill[]> {
  const rows = await driver.getAllAsync<FinRecurringRow>(
    'SELECT * FROM fin_recurring ORDER BY next_day, title, id',
  );
  return rows
    .filter((row) => (options.includeDeleted === true ? true : row.deleted_at == null))
    .filter((row) => (options.includeInactive === true ? true : row.active === 1))
    .filter((row) =>
      options.includeCancelled === true ? true : row.cancelled_at == null,
    )
    .map(toBill);
}

export async function createBill(
  driver: SqliteDriver,
  input: CreateBillInput,
  options: BillWriteOptions = {},
): Promise<Bill> {
  if (!input.title || input.title.trim().length === 0) {
    throw new LedgerError('bill-title-required', 'A bill needs a title.');
  }
  assertAmount(input.amountMinor);
  if (!isBillCadence(input.cadence)) {
    throw new LedgerError('bill-cadence-invalid', `Unknown cadence "${String(input.cadence)}".`);
  }
  if (!isDayKey(input.nextDueDay)) {
    throw new LedgerError('invalid-day', 'nextDueDay must be a local YYYY-MM-DD day.');
  }

  const accountId = input.accountId ?? (await defaultCashAccountId(driver));
  const accountType = await accountTypeOf(driver, accountId);
  // Posting legality for the expected amount.
  const kind: TransactionKind = input.type === 'income' ? 'income' : 'expense';
  const sign = kind === 'expense' ? -input.amountMinor : input.amountMinor;
  const check = validatePosting({
    kind,
    accountType,
    amountMinor: sign,
    day: input.nextDueDay,
  });
  if (!check.ok) throw new LedgerError(check.code, check.message);

  const now = nowOf(options, input.now);
  const id = input.id ?? `bill:${slug(input.title) || 'bill'}:${now}`;

  const existing = await driver.getFirstAsync<{ id: string }>(
    'SELECT id FROM fin_recurring WHERE id = ?',
    [id],
  );
  if (existing) {
    throw new LedgerError('bill-exists', `A bill with id "${id}" already exists.`);
  }

  await driver.runAsync(
    `INSERT INTO fin_recurring (
       id, title, type, amount_minor, category_id, cadence, next_day, active,
       account_id, tolerance_days, variable_amount, last_paid_day, last_amount_minor,
       notes, cancelled_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL, NULL, ?, NULL, NULL)`,
    [
      id,
      input.title.trim(),
      input.type ?? 'expense',
      input.amountMinor,
      input.categoryId ?? null,
      input.cadence,
      input.nextDueDay,
      accountId,
      input.toleranceDays ?? 0,
      input.variableAmount === true ? 1 : 0,
      input.notes ?? '',
    ],
  );

  const bill = await loadBill(driver, id);
  if (!bill) throw new LedgerError('bill-not-found', `Bill ${id} disappeared while being created.`);
  return bill;
}

export async function updateBill(
  driver: SqliteDriver,
  input: UpdateBillInput,
  options: BillWriteOptions = {},
): Promise<Bill> {
  const existing = await loadBill(driver, input.id);
  if (!existing) {
    throw new LedgerError('bill-not-found', `No bill with id "${input.id}".`);
  }

  const title = input.title !== undefined ? input.title.trim() : existing.title;
  if (title.length === 0) {
    throw new LedgerError('bill-title-required', 'A bill needs a title.');
  }
  const amountMinor = input.amountMinor ?? existing.amountMinor;
  assertAmount(amountMinor);

  const cadence = input.cadence ?? existing.cadence;
  if (!isBillCadence(cadence)) {
    throw new LedgerError('bill-cadence-invalid', `Unknown cadence "${String(cadence)}".`);
  }

  const nextDueDay = input.nextDueDay ?? existing.nextDueDay;
  if (!isDayKey(nextDueDay)) {
    throw new LedgerError('invalid-day', 'nextDueDay must be a local YYYY-MM-DD day.');
  }

  const accountId = input.accountId ?? existing.accountId;
  const accountType = await accountTypeOf(driver, accountId);
  const type = input.type ?? existing.type ?? 'expense';
  const kind: TransactionKind = type === 'income' ? 'income' : 'expense';
  const sign = kind === 'expense' ? -amountMinor : amountMinor;
  const check = validatePosting({
    kind,
    accountType,
    amountMinor: sign,
    day: nextDueDay,
  });
  if (!check.ok) throw new LedgerError(check.code, check.message);

  const variableAmount =
    input.variableAmount !== undefined
      ? input.variableAmount === true
      : existing.variableAmount === true;
  const toleranceDays = input.toleranceDays ?? existing.toleranceDays ?? 0;
  const categoryId =
    input.categoryId !== undefined ? input.categoryId : existing.categoryId;
  const notes = input.notes !== undefined ? input.notes : existing.notes ?? '';
  const active = input.active !== undefined ? (input.active ? 1 : 0) : 1;

  await driver.runAsync(
    `UPDATE fin_recurring
        SET title = ?, type = ?, amount_minor = ?, category_id = ?, cadence = ?,
            next_day = ?, account_id = ?, tolerance_days = ?, variable_amount = ?,
            notes = ?, active = ?
      WHERE id = ?`,
    [
      title,
      type,
      amountMinor,
      categoryId ?? null,
      cadence,
      nextDueDay,
      accountId,
      toleranceDays,
      variableAmount ? 1 : 0,
      notes,
      active,
      input.id,
    ],
  );

  const bill = await loadBill(driver, input.id);
  if (!bill) throw new LedgerError('bill-not-found', `Bill ${input.id} disappeared while being updated.`);
  return bill;
}

export async function cancelBill(
  driver: SqliteDriver,
  id: string,
  options: BillWriteOptions = {},
): Promise<boolean> {
  const bill = await loadBill(driver, id);
  if (!bill) return false;
  if (bill.cancelledAt != null || bill.active === false) return false;

  const now = nowOf(options);
  await driver.runAsync(
    'UPDATE fin_recurring SET active = 0, cancelled_at = ? WHERE id = ?',
    [now, id],
  );
  return true;
}

export async function deleteBill(
  driver: SqliteDriver,
  id: string,
  options: BillWriteOptions = {},
): Promise<boolean> {
  // Soft-delete: payments stay linked, history survives.
  return cancelBill(driver, id, options);
}

export async function recordBillPayment(
  driver: SqliteDriver,
  input: RecordBillPaymentInput,
  options: BillWriteOptions = {},
): Promise<BillPaymentResult> {
  const bill = await loadBill(driver, input.billId);
  if (!bill) {
    throw new LedgerError('bill-not-found', `No bill with id "${input.billId}".`);
  }
  if (bill.deletedAt != null || bill.cancelledAt != null || bill.active === false) {
    throw new LedgerError('bill-cancelled', `Bill "${input.billId}" is not active.`);
  }

  const dueDay = input.dueDay ?? bill.nextDueDay;
  if (!isDayKey(dueDay)) {
    throw new LedgerError('invalid-day', 'dueDay must be a local YYYY-MM-DD day.');
  }
  if (!isDayKey(input.paidDay)) {
    throw new LedgerError('invalid-day', 'paidDay must be a local YYYY-MM-DD day.');
  }

  const accountId = input.accountId ?? bill.accountId;
  const accountType = await accountTypeOf(driver, accountId);

  const amountMinor =
    input.amountMinor ??
    (bill.variableAmount === true && typeof bill.lastAmountMinor === 'number'
      ? bill.lastAmountMinor
      : bill.amountMinor);
  assertAmount(amountMinor);

  // Idempotent: a payment already recorded for this occurrence is returned
  // instead of creating a second transaction.
  const existing = await driver.getFirstAsync<FinTransactionBillRow>(
    `SELECT id, amount_minor, day FROM fin_transactions
      WHERE recurring_id = ? AND bill_due_day = ? AND deleted_at IS NULL`,
    [input.billId, dueDay],
  );
  if (existing) {
    return {
      billId: input.billId,
      transactionId: existing.id,
      dueDay,
      amountMinor: existing.amount_minor < 0 ? -existing.amount_minor : existing.amount_minor,
      created: false,
      bill: (await loadBill(driver, input.billId))!,
    };
  }

  const skip = await driver.getFirstAsync<{ id: string }>(
    'SELECT id FROM fin_bill_skips WHERE bill_id = ? AND due_day = ?',
    [input.billId, dueDay],
  );
  if (skip) {
    throw new LedgerError('bill-skipped', `Occurrence ${dueDay} was skipped and cannot be paid.`);
  }

  const kind: TransactionKind = bill.type === 'income' ? 'income' : 'expense';
  const signedAmount = kind === 'expense' ? -amountMinor : amountMinor;
  const check = validatePosting({
    kind,
    accountType,
    amountMinor: signedAmount,
    day: input.paidDay,
  });
  if (!check.ok) throw new LedgerError(check.code, check.message);

  const now = nowOf(options);
  const id = input.transactionId ?? `fin-bill:${input.billId}:${dueDay}`;

  // Revive a previously soft-deleted payment row if its id is being reused.
  const deleted = await driver.getFirstAsync<{ id: string }>(
    'SELECT id FROM fin_transactions WHERE id = ? AND deleted_at IS NOT NULL',
    [id],
  );

  await withTransaction(driver, async () => {
    if (deleted) {
      await driver.runAsync(
        `UPDATE fin_transactions
            SET account_id = ?, kind = ?, type = ?, amount_minor = ?, category_id = ?,
                occurred_at = ?, day = ?, note = ?, recurring_id = ?, bill_due_day = ?,
                source = 'bill', status = ?, deleted_at = NULL, updated_at = ?
          WHERE id = ?`,
        [
          accountId,
          kind,
          kind,
          signedAmount,
          bill.categoryId ?? null,
          occurredAtFor(input.paidDay),
          input.paidDay,
          input.note ?? bill.title,
          input.billId,
          dueDay,
          input.status ?? 'posted',
          now,
          id,
        ],
      );
    } else {
      await driver.runAsync(
        `INSERT INTO fin_transactions (
           id, type, kind, amount_minor, currency, category_id, occurred_at, day, note,
           method, for_whom, payee, recurring_id, source, external_id, extra,
           created_at, updated_at, account_id, transfer_id, refund_of_id, status, deleted_at, bill_due_day
         ) VALUES (?, ?, ?, ?, 'INR', ?, ?, ?, ?, NULL, NULL, NULL, ?, 'bill', NULL, '{}', ?, ?, ?, NULL, NULL, ?, NULL, ?)`,
        [
          id,
          kind,
          kind,
          signedAmount,
          bill.categoryId ?? null,
          occurredAtFor(input.paidDay),
          input.paidDay,
          input.note ?? bill.title,
          input.billId,
          now,
          now,
          accountId,
          input.status ?? 'posted',
          dueDay,
        ],
      );
    }

    // Advance the schedule only when this occurrence is the one currently due,
    // so paying a historical occurrence does not skip the rest.
    const nextDay =
      dueDay === bill.nextDueDay ? advanceDue(dueDay, bill.cadence) : bill.nextDueDay;

    await driver.runAsync(
      `UPDATE fin_recurring
          SET next_day = ?, last_paid_day = ?, last_amount_minor = ?
        WHERE id = ?`,
      [nextDay, input.paidDay, amountMinor, input.billId],
    );
  });

  const updatedBill = await loadBill(driver, input.billId);
  if (!updatedBill) {
    throw new LedgerError('bill-not-found', `Bill ${input.billId} disappeared while being paid.`);
  }

  return {
    billId: input.billId,
    transactionId: id,
    dueDay,
    amountMinor,
    created: true,
    bill: updatedBill,
  };
}

export async function skipBillOccurrence(
  driver: SqliteDriver,
  input: SkipBillInput,
  options: BillWriteOptions = {},
): Promise<SkipBillResult> {
  const bill = await loadBill(driver, input.billId);
  if (!bill) {
    throw new LedgerError('bill-not-found', `No bill with id "${input.billId}".`);
  }
  if (bill.deletedAt != null || bill.cancelledAt != null || bill.active === false) {
    throw new LedgerError('bill-cancelled', `Bill "${input.billId}" is not active.`);
  }

  const dueDay = input.dueDay ?? bill.nextDueDay;
  if (!isDayKey(dueDay)) {
    throw new LedgerError('invalid-day', 'dueDay must be a local YYYY-MM-DD day.');
  }

  const existingPayment = await driver.getFirstAsync<{ id: string }>(
    `SELECT id FROM fin_transactions
      WHERE recurring_id = ? AND bill_due_day = ? AND deleted_at IS NULL`,
    [input.billId, dueDay],
  );
  if (existingPayment) {
    throw new LedgerError('bill-already-paid', `Occurrence ${dueDay} is already paid.`);
  }

  const existingSkip = await driver.getFirstAsync<{ id: string }>(
    'SELECT id FROM fin_bill_skips WHERE bill_id = ? AND due_day = ?',
    [input.billId, dueDay],
  );
  if (existingSkip) {
    return {
      billId: input.billId,
      dueDay,
      created: false,
      bill: (await loadBill(driver, input.billId))!,
    };
  }

  const now = nowOf(options);
  const id = `skip:${input.billId}:${dueDay}`;

  await withTransaction(driver, async () => {
    await driver.runAsync(
      `INSERT INTO fin_bill_skips (id, bill_id, due_day, reason, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [id, input.billId, dueDay, input.reason ?? '', now],
    );

    const nextDay =
      dueDay === bill.nextDueDay ? advanceDue(dueDay, bill.cadence) : bill.nextDueDay;

    await driver.runAsync(
      'UPDATE fin_recurring SET next_day = ? WHERE id = ?',
      [nextDay, input.billId],
    );
  });

  return {
    billId: input.billId,
    dueDay,
    created: true,
    bill: (await loadBill(driver, input.billId))!,
  };
}

export async function loadBillPayments(
  driver: SqliteDriver,
  billId?: string,
): Promise<BillPaymentRef[]> {
  const params: SqlParam[] = [];
  let sql = `SELECT id, recurring_id, bill_due_day, amount_minor, day
              FROM fin_transactions
             WHERE recurring_id IS NOT NULL
               AND bill_due_day IS NOT NULL
               AND deleted_at IS NULL`;
  if (billId !== undefined) {
    sql += ' AND recurring_id = ?';
    params.push(billId);
  }
  sql += ' ORDER BY day, id';

  const rows = await driver.getAllAsync<{
    id: string;
    recurring_id: string;
    bill_due_day: string;
    amount_minor: number;
    day: string;
  }>(sql, params);

  return rows.map((row) => ({
    billId: row.recurring_id,
    dueDay: row.bill_due_day,
    day: row.day,
    amountMinor: row.amount_minor < 0 ? -row.amount_minor : row.amount_minor,
    transactionId: row.id,
  }));
}

export async function loadBillSkips(
  driver: SqliteDriver,
  billId?: string,
): Promise<BillSkipRef[]> {
  const params: SqlParam[] = [];
  let sql = 'SELECT bill_id, due_day, reason FROM fin_bill_skips';
  if (billId !== undefined) {
    sql += ' WHERE bill_id = ?';
    params.push(billId);
  }
  sql += ' ORDER BY due_day, bill_id';

  const rows = await driver.getAllAsync<{
    bill_id: string;
    due_day: string;
    reason: string | null;
  }>(sql, params);

  return rows.map((row) => ({
    billId: row.bill_id,
    dueDay: row.due_day,
    ...(row.reason ? { reason: row.reason } : {}),
  }));
}

export async function billOccurrenceView(
  driver: SqliteDriver,
  billId: string,
  options: { from: string; to: string; asOf: string },
): Promise<ReturnType<typeof billOccurrences>> {
  const bill = await loadBill(driver, billId);
  if (!bill) {
    throw new LedgerError('bill-not-found', `No bill with id "${billId}".`);
  }
  const payments = await loadBillPayments(driver, billId);
  const skips = await loadBillSkips(driver, billId);
  return billOccurrences(bill, { ...options, payments, skips });
}

export async function loadUpcomingBills(
  driver: SqliteDriver,
  options: { from: string; to: string; asOf: string },
): Promise<ReturnType<typeof upcomingBills>> {
  const bills = await listBills(driver);
  const payments = await loadBillPayments(driver);
  const skips = await loadBillSkips(driver);
  return upcomingBills(bills, { ...options, payments, skips });
}

export interface BillMigrationResult {
  readonly applied: boolean;
  readonly backfilled: number;
  readonly warnings: readonly string[];
}

export async function migrateBills(
  driver: SqliteDriver,
  options: { readonly now?: () => number } = {},
): Promise<BillMigrationResult> {
  const now = options.now ?? Date.now;

  return withTransaction(driver, async () => {
    const already = (await getSetting(driver, SETTING_KEYS.billsMigrated)) === '1';
    const warnings: string[] = [];
    let backfilled = 0;

    await driver.execAsync(SETTINGS_DDL);
    await driver.execAsync(FIN_CATEGORIES_DDL);
    await driver.execAsync(FIN_RECURRING_DDL);
    await driver.execAsync(FIN_TRANSACTIONS_DDL);
    await driver.execAsync(FIN_ACCOUNTS_DDL);
    await driver.execAsync(LEGACY_INDEXES);

    // Add the I8 columns to a recovered recurring table.
    const recurringAdditions: readonly (readonly [string, string])[] = [
      ['account_id', 'TEXT REFERENCES fin_accounts(id) ON DELETE SET NULL'],
      ['tolerance_days', 'INTEGER NOT NULL DEFAULT 0'],
      ['variable_amount', 'INTEGER NOT NULL DEFAULT 0'],
      ['last_paid_day', 'TEXT'],
      ['last_amount_minor', 'INTEGER'],
      ['notes', "TEXT NOT NULL DEFAULT ''"],
      ['cancelled_at', 'INTEGER'],
      ['deleted_at', 'INTEGER'],
    ];
    for (const [column, ddl] of recurringAdditions) {
      if (!(await hasColumn(driver, 'fin_recurring', column))) {
        await driver.execAsync(`ALTER TABLE fin_recurring ADD COLUMN ${column} ${ddl}`);
      }
    }

    if (!(await hasColumn(driver, 'fin_transactions', 'bill_due_day'))) {
      await driver.execAsync('ALTER TABLE fin_transactions ADD COLUMN bill_due_day TEXT');
    }

    await driver.execAsync(FIN_BILL_SKIPS_DDL);
    await driver.execAsync(FIN_SNAPSHOTS_DDL);
    await driver.execAsync(ACCOUNT_INDEXES);
    await driver.execAsync(KIND_INDEXES);
    await driver.execAsync(BILL_INDEXES);

    const cashId = await defaultCashAccountId(driver);

    const rows = await driver.getAllAsync<{ id: string; account_id: string | null }>(
      'SELECT id, account_id FROM fin_recurring WHERE account_id IS NULL',
    );
    for (const row of rows) {
      await driver.runAsync(
        'UPDATE fin_recurring SET account_id = ? WHERE id = ?',
        [cashId, row.id],
      );
      backfilled += 1;
    }
    if (backfilled > 0) {
      warnings.push(
        `${backfilled} recurring bill(s) had no account and were placed in the default Cash account.`,
      );
    }

    await setSetting(driver, SETTING_KEYS.billsMigrated, '1');
    return { applied: !already, backfilled, warnings };
  });
}

export async function defaultCashAccountId(driver: SqliteDriver): Promise<string> {
  const stored = await getSetting(driver, SETTING_KEYS.defaultCashAccount);
  if (stored) {
    const row = await driver.getFirstAsync<{ id: string }>(
      'SELECT id FROM fin_accounts WHERE id = ?',
      [stored],
    );
    if (row) return row.id;
  }
  const cash = await driver.getFirstAsync<{ id: string }>(
    "SELECT id FROM fin_accounts WHERE type = 'cash' ORDER BY archived, created_at, id LIMIT 1",
  );
  return cash?.id ?? DEFAULT_CASH_ACCOUNT_ID;
}
