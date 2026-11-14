/**
 * I13 — Generic import commit + duplicate-candidate persistence.
 *
 * No parser lives here. An adapter produces `ParsedImportRow`s; this module
 * validates and writes them with full provenance, then records any duplicate
 * candidates it finds so the user can review them.
 */

import { validatePosting } from '../posting';
import type { AccountType, TransactionKind } from '../types';
import { isDayKey } from '../money';
import type { ParsedImportRow, ImportBatch } from '../import';
import { toImportedTransaction } from '../import';
import { findDuplicateCandidates } from '../duplicates';
import type { Transaction } from '../types';
import type { SqliteDriver } from './driver';
import { withTransaction } from './driver';
import { LedgerError } from './writes';
import { loadTransactions } from './mapping';

export interface DuplicateCandidateRow {
  readonly id: string;
  readonly transactionAId: string;
  readonly transactionBId: string;
  readonly reason: string;
  readonly confidence: number;
  readonly status: string;
  readonly createdAt: number;
  readonly resolvedAt: number | null;
}

function occurredAtFor(day: string): number {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return Date.UTC(year, month - 1, date);
}

async function accountTypeOf(driver: SqliteDriver, accountId: string): Promise<AccountType> {
  const row = await driver.getFirstAsync<{ type: string }>(
    'SELECT type FROM fin_accounts WHERE id = ?',
    [accountId],
  );
  if (!row) throw new LedgerError('account-not-found', `No account with id "${accountId}".`);
  return row.type as AccountType;
}

export interface CommitImportResult {
  readonly inserted: number;
  readonly ids: readonly string[];
  readonly duplicateCandidates: number;
}

export async function commitImport(
  driver: SqliteDriver,
  batch: ImportBatch,
  options: { readonly now?: () => number } = {},
): Promise<CommitImportResult> {
  const now = (options.now ?? Date.now)();
  const ids: string[] = [];

  await withTransaction(driver, async () => {
    for (const [index, row] of batch.rows.entries()) {
      if (!isDayKey(row.day)) {
        throw new LedgerError('invalid-day', `Imported row ${index} has an invalid day.`);
      }
      const accountType = await accountTypeOf(driver, row.accountId);
      const check = validatePosting({
        kind: row.kind,
        accountType,
        amountMinor: row.amountMinor,
        day: row.day,
      });
      if (!check.ok) throw new LedgerError(check.code, check.message);

      const imported = toImportedTransaction(row, batch, `imp:${batch.source}:${index}:${now}`);
      ids.push(imported.id);

      await driver.runAsync(
        `INSERT INTO fin_transactions (
           id, type, kind, amount_minor, currency, category_id, occurred_at, day, note,
           method, for_whom, payee, recurring_id, source, external_id, extra,
           created_at, updated_at, account_id, transfer_id, refund_of_id, status, deleted_at,
           source_ref, import_method, imported_at, confidence, bill_due_day
         ) VALUES (?, ?, ?, ?, 'INR', ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, NULL, '{}', ?, ?, ?, NULL, NULL, 'posted', NULL, ?, ?, ?, ?, NULL)`,
        [
          imported.id,
          imported.kind,
          imported.kind,
          imported.amountMinor,
          imported.categoryId,
          occurredAtFor(imported.day),
          imported.day,
          imported.note,
          imported.payee,
          imported.source,
          now,
          now,
          imported.accountId,
          imported.sourceRef,
          imported.importMethod,
          imported.importedAt,
          imported.confidence,
        ],
      );
    }
  });

  // Detect duplicates against the full ledger, including the just-imported rows.
  const all = await loadTransactions(driver);
  const candidates = findDuplicateCandidates(all);
  let candidateCount = 0;
  for (const candidate of candidates) {
    const id = `dup:${candidate.a}:${candidate.b}`;
    const existing = await driver.getFirstAsync<{ id: string }>(
      'SELECT id FROM fin_duplicate_candidates WHERE transaction_a_id = ? AND transaction_b_id = ?',
      [candidate.a, candidate.b],
    );
    if (existing) continue;
    await driver.runAsync(
      `INSERT INTO fin_duplicate_candidates
         (id, transaction_a_id, transaction_b_id, reason, confidence, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [id, candidate.a, candidate.b, candidate.reason, candidate.confidence, now],
    );
    candidateCount += 1;
  }

  return { inserted: ids.length, ids, duplicateCandidates: candidateCount };
}

export async function listDuplicateCandidates(
  driver: SqliteDriver,
  status: string = 'pending',
): Promise<DuplicateCandidateRow[]> {
  const rows = await driver.getAllAsync<{
    id: string;
    transaction_a_id: string;
    transaction_b_id: string;
    reason: string;
    confidence: number;
    status: string;
    created_at: number;
    resolved_at: number | null;
  }>(
    'SELECT * FROM fin_duplicate_candidates WHERE status = ? ORDER BY confidence DESC, created_at',
    [status],
  );
  return rows.map((row) => ({
    id: row.id,
    transactionAId: row.transaction_a_id,
    transactionBId: row.transaction_b_id,
    reason: row.reason,
    confidence: row.confidence,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}

export async function resolveDuplicateCandidate(
  driver: SqliteDriver,
  id: string,
  status: 'confirmed' | 'dismissed',
  options: { readonly now?: () => number } = {},
): Promise<boolean> {
  const now = (options.now ?? Date.now)();
  const result = await driver.runAsync(
    'UPDATE fin_duplicate_candidates SET status = ?, resolved_at = ? WHERE id = ?',
    [status, now, id],
  );
  return result.changes > 0;
}
