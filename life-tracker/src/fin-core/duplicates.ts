/**
 * I13 — Duplicate detection (pure).
 *
 * A transaction may reach the ledger through more than one route (a statement
 * import and a manual entry, or two imports of overlapping statements). The
 * model never deletes anything automatically: it produces *candidates* with a
 * confidence and a reason, and the user reviews them.
 *
 * Confidence rules:
 *
 *   - 1.00  same non-null `sourceRef` (UTR/reference number) → same transaction.
 *   - 0.80  same account, same day, same signed amount, different source.
 *   - 0.50  same day and same signed amount, different accounts.
 *
 * Amount and date alone are never treated as proof.
 */

import type { Transaction } from './types';

export type DuplicateReason =
  | 'same-reference'
  | 'same-account-day-amount'
  | 'same-day-amount';

export interface DuplicateCandidate {
  readonly a: string;
  readonly b: string;
  readonly reason: DuplicateReason;
  readonly confidence: number;
}

export interface DuplicateDetectionOptions {
  readonly minimumConfidence?: number;
}

export function findDuplicateCandidates(
  transactions: readonly Transaction[],
  options: DuplicateDetectionOptions = {},
): DuplicateCandidate[] {
  const minimum = options.minimumConfidence ?? 0.5;
  const candidates: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  const push = (candidate: DuplicateCandidate) => {
    if (candidate.confidence < minimum) return;
    const key = candidate.a < candidate.b ? `${candidate.a}|${candidate.b}` : `${candidate.b}|${candidate.a}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  for (let i = 0; i < transactions.length; i += 1) {
    for (let j = i + 1; j < transactions.length; j += 1) {
      const a = transactions[i]!;
      const b = transactions[j]!;

      if (a.id === b.id) continue;
      if (a.deletedAt != null || b.deletedAt != null) continue;

      // Exact reference match is definitive.
      if (a.sourceRef != null && a.sourceRef === b.sourceRef) {
        push({ a: a.id, b: b.id, reason: 'same-reference', confidence: 1 });
        continue;
      }

      // Same account, day and signed amount is very likely the same movement.
      if (
        a.accountId === b.accountId &&
        a.day === b.day &&
        a.amountMinor === b.amountMinor
      ) {
        push({ a: a.id, b: b.id, reason: 'same-account-day-amount', confidence: 0.8 });
        continue;
      }

      // Same day and amount across accounts is only a hint.
      if (a.day === b.day && a.amountMinor === b.amountMinor) {
        push({ a: a.id, b: b.id, reason: 'same-day-amount', confidence: 0.5 });
      }
    }
  }

  return candidates.sort((x, y) => y.confidence - x.confidence || x.a.localeCompare(y.a));
}

/** True when two rows are an exact reference match. */
export function isExactDuplicate(a: Transaction, b: Transaction): boolean {
  return a.sourceRef != null && a.sourceRef === b.sourceRef;
}
