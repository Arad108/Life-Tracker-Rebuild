/**
 * I13 — Generic import boundary.
 *
 * No statement format has been validated, so there is no parser here. This module
 * defines the shape an adapter must produce and the helper that turns a parsed
 * row into a ledger row with full provenance. A future statement or notification
 * adapter implements `ImportAdapter`; the ledger and analytics never need to
 * change.
 */

import type { TransactionKind } from './types';

export type ImportMethod = 'manual' | 'statement' | 'notification' | 'api';

export interface ParsedImportRow {
  readonly day: string;
  readonly amountMinor: number;
  readonly kind: TransactionKind;
  readonly accountId: string;
  readonly categoryId?: string | null;
  readonly note?: string;
  readonly payee?: string | null;
  readonly sourceRef?: string | null;
  readonly confidence?: number | null;
  readonly raw?: unknown;
}

export interface ImportBatch {
  readonly source: string;
  readonly method: ImportMethod;
  readonly importedAt: number;
  readonly rows: readonly ParsedImportRow[];
}

export interface ImportAdapter {
  readonly name: string;
  /** Returns true when the text looks like this adapter's format. */
  detect(text: string): boolean;
  /** Returns parsed rows, or null when the format is not recognised. */
  parse(text: string): ParsedImportRow[] | null;
}

/** A no-op adapter used until a real statement sample exists. */
export const UNVERIFIED_ADAPTER: ImportAdapter = {
  name: 'unverified',
  detect: () => false,
  parse: () => null,
};

export function toImportedTransaction(
  row: ParsedImportRow,
  batch: ImportBatch,
  id: string,
): {
  readonly id: string;
  readonly accountId: string;
  readonly kind: TransactionKind;
  readonly amountMinor: number;
  readonly day: string;
  readonly categoryId: string | null;
  readonly note: string;
  readonly payee: string | null;
  readonly source: string;
  readonly sourceRef: string | null;
  readonly importMethod: string;
  readonly importedAt: number;
  readonly confidence: number | null;
} {
  return {
    id,
    accountId: row.accountId,
    kind: row.kind,
    amountMinor: row.amountMinor,
    day: row.day,
    categoryId: row.categoryId ?? null,
    note: row.note ?? '',
    payee: row.payee ?? null,
    source: batch.source,
    sourceRef: row.sourceRef ?? null,
    importMethod: batch.method,
    importedAt: batch.importedAt,
    confidence: row.confidence ?? null,
  };
}
