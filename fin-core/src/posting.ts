/**
 * I3 — Posting rules.
 *
 * The question this file answers is not "what kind is this?" but "is this
 * movement physically possible?". A `kind` enum on its own guarantees nothing:
 * an expense posted to a loan account, or a card bill payment typed as an
 * expense, satisfies any enum and still produces wrong totals.
 *
 * Every write path (manual entry, "mark paid", import commit, transfer
 * creation) calls `validatePosting` before inserting a row.
 *
 * Pure and deterministic: same input, same output, no clock, no database.
 */

import { MAX_ABS_AMOUNT_MINOR, SUPPORTED_CURRENCY, isDayKey } from './money';
import { ACCOUNT_TYPES, isAccountType, isTransactionKind } from './types';
import type { AccountType, TransactionKind } from './types';

export type PostingErrorCode =
  | 'unknown-kind'
  | 'unknown-account-type'
  | 'amount-not-integer'
  | 'amount-zero'
  | 'amount-out-of-range'
  | 'unsupported-currency'
  | 'invalid-day'
  | 'sign'
  | 'account-type'
  | 'transfer-id-required'
  | 'refund-link-invalid';

export interface PostingInput {
  readonly kind: TransactionKind;
  readonly accountType: AccountType;
  /** Signed minor units: negative leaves the account, positive enters it. */
  readonly amountMinor: number;
  /** Required when `kind === 'transfer'`. Shared by both legs. */
  readonly transferId?: string | null;
  /** Optional link from a refund to the expense it reverses. */
  readonly refundOfId?: string | null;
  readonly currency?: string | null;
  readonly day?: string | null;
}

export type PostingResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: PostingErrorCode; readonly message: string };

type SignRule = 'positive' | 'negative' | 'either';

interface KindRule {
  readonly accountTypes: readonly AccountType[];
  readonly sign: SignRule;
  /** Human-readable name used in error messages. */
  readonly noun: string;
}

/** Where spending and refunds are allowed to land. */
const SPENDING_ACCOUNTS: readonly AccountType[] = ['bank', 'cash', 'wallet', 'credit_card'];

/** Where earnings are allowed to land. Never a card or a loan. */
const EARNING_ACCOUNTS: readonly AccountType[] = ['bank', 'cash', 'wallet'];

/**
 * Where a movement between the user's own holdings is allowed to land.
 *
 * `asset` is included deliberately: buying gold or property with cash is a
 * genuine transfer, not an expense. The matrix in
 * FINANCIAL_DOMAIN_ARCHITECTURE.md §4.2 listed only the first six types; this is
 * the single intentional widening, and it is safe because a transfer never
 * touches spending or income totals.
 */
const MOVEMENT_ACCOUNTS: readonly AccountType[] = [
  'bank',
  'cash',
  'wallet',
  'credit_card',
  'loan',
  'investment',
  'asset',
];

/**
 * The rules matrix, exposed so the UI can ask "which accounts may I pick for
 * this kind?" instead of duplicating the list.
 */
export const POSTING_RULES: Readonly<Record<TransactionKind, KindRule>> = {
  expense: { accountTypes: SPENDING_ACCOUNTS, sign: 'negative', noun: 'An expense' },
  income: { accountTypes: EARNING_ACCOUNTS, sign: 'positive', noun: 'Income' },
  transfer: { accountTypes: MOVEMENT_ACCOUNTS, sign: 'either', noun: 'A transfer' },
  refund: { accountTypes: SPENDING_ACCOUNTS, sign: 'positive', noun: 'A refund' },
  interest: { accountTypes: SPENDING_ACCOUNTS, sign: 'negative', noun: 'Interest charged' },
  adjustment: { accountTypes: ACCOUNT_TYPES, sign: 'either', noun: 'A balance adjustment' },
};

const OK: PostingResult = Object.freeze({ ok: true });

function fail(code: PostingErrorCode, message: string): PostingResult {
  return { ok: false, code, message };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Account types that may be used for a given kind. Drives the account picker. */
export function allowedAccountTypes(kind: TransactionKind): readonly AccountType[] {
  return POSTING_RULES[kind]?.accountTypes ?? [];
}

/**
 * Validate a single ledger row.
 *
 * Order matters: the cheapest and most specific failure is reported first, so
 * the user sees "amount must be negative", not "unknown account type".
 */
export function validatePosting(input: PostingInput): PostingResult {
  const { kind, accountType, amountMinor } = input;

  if (!isTransactionKind(kind)) {
    return fail('unknown-kind', `Unknown transaction kind: ${String(kind)}.`);
  }
  if (!isAccountType(accountType)) {
    return fail('unknown-account-type', `Unknown account type: ${String(accountType)}.`);
  }

  if (typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor)) {
    return fail(
      'amount-not-integer',
      `Amount must be a whole number of paise; received ${String(amountMinor)}.`,
    );
  }
  if (amountMinor === 0) {
    return fail('amount-zero', 'Amount must not be zero.');
  }
  if (Math.abs(amountMinor) > MAX_ABS_AMOUNT_MINOR) {
    return fail('amount-out-of-range', 'Amount is larger than the supported limit.');
  }

  const currency = input.currency ?? SUPPORTED_CURRENCY;
  if (currency !== SUPPORTED_CURRENCY) {
    return fail(
      'unsupported-currency',
      `Only ${SUPPORTED_CURRENCY} is supported in this version; received ${String(currency)}.`,
    );
  }

  if (input.day != null && !isDayKey(input.day)) {
    return fail('invalid-day', `Day must be a local YYYY-MM-DD date; received ${String(input.day)}.`);
  }

  const rule = POSTING_RULES[kind];

  if (rule.sign === 'negative' && amountMinor > 0) {
    return fail(
      'sign',
      `${rule.noun} must reduce the account balance, so the amount must be negative.`,
    );
  }
  if (rule.sign === 'positive' && amountMinor < 0) {
    return fail(
      'sign',
      `${rule.noun} must increase the account balance, so the amount must be positive.`,
    );
  }

  if (!rule.accountTypes.includes(accountType)) {
    return fail(
      'account-type',
      `${rule.noun} cannot be posted to a ${accountType} account. Allowed: ${rule.accountTypes.join(', ')}.`,
    );
  }

  if (kind === 'transfer' && !isNonEmptyString(input.transferId)) {
    return fail(
      'transfer-id-required',
      'A transfer needs a transferId so its two legs can be paired and excluded from spending.',
    );
  }

  if (input.refundOfId != null && !isNonEmptyString(input.refundOfId)) {
    return fail('refund-link-invalid', 'refundOfId must be a transaction id when it is provided.');
  }

  return OK;
}

// ---------------------------------------------------------------------------
// Transfer pairs
// ---------------------------------------------------------------------------

export type TransferPairErrorCode =
  | 'transfer-leg-count'
  | 'transfer-leg-kind'
  | 'transfer-id-required'
  | 'transfer-id-mismatch'
  | 'transfer-same-account'
  | 'transfer-not-balanced';

export interface TransferLeg {
  readonly accountId: string;
  readonly amountMinor: number;
  readonly transferId?: string | null;
  /** Defaults to `'transfer'`; any other value is rejected. */
  readonly kind?: TransactionKind;
}

export type TransferPairResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: TransferPairErrorCode; readonly message: string };

function failPair(code: TransferPairErrorCode, message: string): TransferPairResult {
  return { ok: false, code, message };
}

const PAIR_OK: TransferPairResult = Object.freeze({ ok: true });

/**
 * Validate a transfer as a whole, not leg by leg.
 *
 * Invariant: exactly two legs, same `transferId`, different accounts, summing
 * to zero. This is the check that makes "a transfer must never change income or
 * spending" true rather than hopeful.
 *
 * An unmatched leg (money sent to an account the app does not track) is *not*
 * expressed here — that is a single leg and is validated separately as a
 * transfer with `transferId` set and no counterpart.
 */
export function validateTransferPair(legs: readonly TransferLeg[]): TransferPairResult {
  if (legs.length !== 2) {
    return failPair(
      'transfer-leg-count',
      `A transfer needs exactly two legs; received ${legs.length}.`,
    );
  }

  for (const leg of legs) {
    if (leg.kind !== undefined && leg.kind !== 'transfer') {
      return failPair('transfer-leg-kind', `Transfer legs must have kind 'transfer'; received '${leg.kind}'.`);
    }
    if (!isNonEmptyString(leg.transferId)) {
      return failPair('transfer-id-required', 'Both legs must carry the same non-empty transferId.');
    }
  }

  const [first, second] = legs as [TransferLeg, TransferLeg];

  if (first.transferId !== second.transferId) {
    return failPair('transfer-id-mismatch', 'The two legs belong to different transfers.');
  }
  if (first.accountId === second.accountId) {
    return failPair('transfer-same-account', 'A transfer must move money between two different accounts.');
  }
  if (first.amountMinor + second.amountMinor !== 0) {
    return failPair(
      'transfer-not-balanced',
      `Transfer legs must sum to zero; they sum to ${first.amountMinor + second.amountMinor}.`,
    );
  }

  return PAIR_OK;
}
