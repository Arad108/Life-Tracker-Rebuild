# fin-core — posting rules, calculation engine, and database layer

Pure TypeScript for the Financial Space. **No React, no React Native, no expo-sqlite, no imports from the app repository.** Every function is deterministic: rows in, numbers out.

Deliverables:

| Module | Task | What it decides |
|---|---|---|
| `src/posting.ts` | I3 | Whether a movement is physically possible |
| `src/calc.ts`, `src/balances.ts` | I6 | What the numbers are |
| `src/budgets.ts` | I7 | What a budget period has consumed |
| `src/bills.ts`, `src/available.ts`, `src/networth.ts`, `src/dates.ts` | I8, I9, I10 | Bills, available-to-spend, net worth, day arithmetic |
| `src/db/` | I0–I10 | Storage, restore, migrations, transfers, refunds, budgets, bills, snapshots |

The database layer talks to a `SqliteDriver` (four async methods plus a transaction), never to expo-sqlite directly. The app supplies the adapter; the tests supply `node:sqlite`.

---

## Files

```
src/types.ts      Transaction, Account, DayRange, Metric
src/money.ts      paise helpers, day-key validation, safe ratio
src/posting.ts    validatePosting, validateTransferPair, POSTING_RULES
src/calc.ts       income, expenses, refunds, interest, netSpending, cashFlow,
                  savingsRate, transfers, summarise
src/balances.ts   balanceOf, balancesByAccount, netWorth, liquidBalance, cardDebt
src/budgets.ts    monthRange, budgetSpend, budgetProgress, summariseBudgets
src/bills.ts      advanceDue, billOccurrences, billStateAt, upcomingBills
src/available.ts  availableToSpend, availableBreakdown
src/networth.ts   netWorthBreakdown, liquidNetWorth, compareNetWorth, netWorthSeries
src/dates.ts      addDays, addMonths, daysBetween, todayKey
src/index.ts      barrel

src/db/driver.ts       SqliteDriver, withTransaction
src/db/schema.ts       recovered DDL, indexes, settings keys
src/db/introspect.ts   inspectSchema, hasColumn, primary-key metadata
src/db/settings.ts     typed get/set/delete on the app's `settings` table
src/db/hash.ts         64-bit FNV-1a content hash for duplicate-restore detection
src/db/backup.ts       exportBackup, parseBackup, planRestore, restoreBackup
src/db/migrations.ts   migrateAccounts (I1), migrateKinds (I2), migrateBudgets (I7)
src/db/mapping.ts      row ↔ Transaction/Account, loadTransactions/loadAccounts
src/db/bills.ts      createBill, recordBillPayment, skipBillOccurrence, loadUpcomingBills
src/db/snapshots.ts  createSnapshot, ensureMonthlySnapshot, listSnapshots

test/*.test.ts         fixtures + tests (node:test, no framework)
test/db/*.test.ts      real SQLite: restore, migrations, end-to-end
```

---

## The two rules everything depends on

**1. Amounts are signed.**

```
negative → value leaves the account
positive → value enters the account
```

A transfer is two rows sharing a `transferId` and summing to zero. A refund is a positive row of kind `refund`. An expense is always negative.

**2. Classification is explicit.**

```ts
kind: 'expense' | 'income' | 'transfer' | 'refund' | 'interest' | 'adjustment'
```

Nothing infers meaning from the sign alone. `transfer` and `adjustment` are excluded from income and spending **by construction**, so moving ₹50,000 between two of your own accounts changes the month's totals by exactly zero.

---

## Wiring it in

The types map 1:1 onto the database rows. Only the naming changes:

```ts
// fin_transactions → Transaction
{
  id, accountId: row.account_id, kind: row.kind,
  amountMinor: row.amount_minor, day: row.day,
  status: row.status, transferId: row.transfer_id,
  refundOfId: row.refund_of_id, deletedAt: row.deleted_at,
}

// fin_accounts → Account
{
  id, name, type, openingBalanceMinor: row.opening_balance_minor,
  balanceMode: row.balance_mode, manualBalanceMinor: row.manual_balance_minor,
  includeInNetWorth: row.include_in_net_worth === 1,
  archived: row.archived === 1,
}
```

Then:

```ts
// before a write
const check = validatePosting({ kind, accountType, amountMinor, transferId });
if (!check.ok) return showError(check.message);

// a screen
const month = summarise({ from: '2026-11-01', to: '2026-11-30' }, transactions);
month.cashFlow;        // net savings, paise
month.savingsRate;     // 0.69, or null when there is no income
month.transfers.net;   // 0 for a healthy ledger
```

Every metric also carries `inputs` (where the number came from) and optional `notes` (pending rows included, sign anomalies, excluded rows). Show `notes` rather than hiding them.

---

## Database layer

### Restore (I0)

The backup format is the shipped app's own export, recovered from the APK rather than invented:

```json
{
  "app": "life-tracker",
  "backupVersion": 2,
  "schemaVersion": 3,
  "exportedAt": "2026-11-15T10:00:00.000Z",
  "note": "Photos are stored on the phone and are not included in this file.",
  "settings": [ ... ],
  "fin_transactions": [ ... ]
}
```

Table rows sit at the **top level** (no `tables` wrapper), written with `JSON.stringify(data, null, 2)`. The app has no import path, so `src/db/backup.ts` is the missing half:

```ts
const result = await restoreBackupText(driver, text);            // merge (default)
const replaced = await restoreBackupText(driver, text, { mode: 'replace' });
```

- Structure and version are validated **before** any write. Unknown tables, unknown columns, missing required tables, wrong app, or a newer `backupVersion` are refused.
- Every write runs in one transaction with `PRAGMA defer_foreign_keys = ON`, so a failure rolls back completely and file table order does not matter.
- `merge` upserts by primary key and preserves rows the file does not contain. `replace` is opt-in and only clears tables present in the file.
- Re-applying the same file is detected by a content hash in `settings.last_restore_hash` and returns `already-restored` instead of duplicating rows.

### Migrations (I1, I2)

```ts
const report = await runFinancialMigrations(driver);
report.userVersion;              // the real PRAGMA user_version, read not written
report.defaultCashAccountId;     // reused if a cash account already exists
report.sign;                     // negated | already-signed | mixed | no-expenses
report.warnings;                 // show these
```

- **I1** adds `fin_accounts` and `account_id`, creates a default Cash account (stable id, `ON CONFLICT` safe), and backfills every unassigned transaction into it. Running it twice adds no account and changes no row.
- **I2** adds `kind`, `transfer_id`, `refund_of_id`, `status`, `deleted_at`, backfills `kind` from the legacy `type`, and converts expense magnitudes to signed paise.
- Sign detection runs on the data, not on an assumption: all-positive is negated, already-signed is a no-op, **mixed is left untouched** and flagged with `fin_repair_required`. A `settings` ledger key makes each step run at most once; the structural changes are also guarded by `PRAGMA table_info`.
- `PRAGMA user_version` belongs to the app's own migration runner, so it is read and reported but never written. This library keeps its ledger in `settings`.

Restore and migration compose as **migrate → restore → migrate**: a backup may already contain I2 columns, and restoring invalidates the migration ledger so the next run re-detects the sign convention from the restored data.

### Transfers (I4)

```ts
await recordTransfer(driver, {
  transferId: 'T100', fromAccountId: 'acc-bank', toAccountId: 'acc-cash',
  amountMinor: 500_000, day: '2026-11-12', note: 'ATM',
});

await updateTransfer(driver, { transferId: 'T100', amountMinor: 700_000 });
await deleteTransfer(driver, 'T100');
await auditTransfers(driver); // [] when every live pair is healthy
```

- Exactly two rows, ids `${transferId}:from` and `${transferId}:to`, amounts `-n` and `+n`, both `kind = 'transfer'`, both sharing `transfer_id`.
- The pair is validated by I3's `validateTransferPair` **and** each leg by `validatePosting`, so a loan/investment/asset leg is only allowed where the movement is real.
- `recordTransfer` refuses an existing `transferId` with `transfer-exists` instead of silently overwriting. Retrying with the same id cannot create a third leg.
- `updateTransfer` rewrites both legs inside one transaction; the ids and `transfer_id` do not change. A pair that is not exactly two balanced legs is rejected (`transfer-incomplete` / `transfer-duplicate`).
- `deleteTransfer` soft-deletes every live leg, so deleting through either leg cannot orphan the other. `auditTransfers` reports any pair that is missing, duplicated or unbalanced.
- Transfers never change income or spending; `summarise().transfers.net` stays 0.

### Refunds (I5)

```ts
await recordRefund(driver, {
  id: 'r1', accountId: 'acc-card', amountMinor: 30_000,
  day: '2026-11-04', refundOfId: 'expense-1',
});

await refundedTotalFor(driver, 'expense-1'); // 30_000
await loadRefundsFor(driver, 'expense-1');   // rows for the history view
```

- A refund is a positive row of kind `refund` linked by `refund_of_id`; it is never income and never increases the savings rate.
- Full and partial refunds are both allowed, but `SUM(live refunds) <= |expense|`. The check runs on create and on every edit, including when a refund is moved to a different expense.
- The refund's category defaults to the original expense's category, so category budgets and analytics see the reversal even if the caller passes none.
- Deleting an expense that still has refunds is refused (`expense-has-refunds`) unless `refundStrategy: 'cascade'` is passed. Reducing an expense below what was already refunded is refused too.
- `deleteRefund` frees the limit again without touching the original.

### Bills (I8)

The shipped app stored a recurring payment as a schedule that "Mark paid" recorded
as a marker rather than a transaction. Bills are now schedules whose payment is a
real ledger row:

```ts
await createBill(driver, {
  id: 'rent', title: 'Rent', amountMinor: 1_800_000, accountId: 'acc-bank',
  cadence: 'monthly', nextDueDay: '2026-11-01', categoryId: 'cat-rent',
});
await recordBillPayment(driver, { billId: 'rent', paidDay: '2026-11-02', amountMinor: 1_750_000 });
await skipBillOccurrence(driver, { billId: 'rent', reason: 'waived' });
```

- Cadences `weekly`, `monthly`, `quarterly`, `yearly`, with month-end clamping.
- `nextDueDay` is the next unpaid occurrence; `recordBillPayment` creates one
  expense/income row linked by `recurring_id` + `bill_due_day`, then advances
  the schedule. Tapping twice returns `created: false` instead of a second row.
- Variable amounts fall back to `lastAmountMinor`; skips are recorded in
  `fin_bill_skips` so history is not silently lost; cancelling soft-deletes the
  schedule and keeps payments.
- `billOccurrences`, `upcomingBills`, `billStateAt` report
  `upcoming | due | overdue | paid | skipped | cancelled` with a tolerance window.

### Available to spend (I9)

```ts
const result = availableToSpend(accounts, transactions, {
  asOf: '2026-11-15', horizonDays: 7, bills, budgets,
});
result.value;          // the number
result.committedBillsMinor;
availableBreakdown(result); // components that sum exactly to value
```

`liquid + cards - unpaid bills in the horizon - reserved budget`, with pending and
excluded rows counted once (they already move balances). A budget is a cap and is
only reserved when `reserveBudgetRemaining` is set.

### Net worth + snapshots (I10)

```ts
const breakdown = netWorthBreakdown(accounts, transactions, '2026-11-30');
const snapshot = await createSnapshot(driver, { periodKey: '2026-11', asOfDay: '2026-11-30' });
const comparison = compareNetWorth(octoberSnapshot, novemberSnapshot);
```

- Assets, liabilities, liquid net worth and invested/loan figures from the same
  balance equation; transfers net to zero.
- `createSnapshot` is idempotent per period and never overwrites an existing
  observation, so back-dated transactions cannot rewrite history. Overwrite is
  explicit.
- `netWorthSeries` feeds a trend chart without any recalculation.

---

## Running

```bash
npm install        # dev-only: typescript + @types/node, for typechecking
npm test           # node:test, runs the TypeScript sources directly
npm run typecheck  # tsc --noEmit
```

`test/ts-resolve.mjs` exists only so Node can run the sources while they keep extensionless imports (what Metro expects). It is not part of the library.

---

## Decisions worth knowing

| Decision | Reason |
|---|---|
| Transfers into `asset` accounts are allowed | Buying gold or property with cash is a real transfer. This is the one widening of the matrix in `FINANCIAL_DOMAIN_ARCHITECTURE.md` §4.2, and it is safe because transfers never touch spending or income. |
| `pending` rows count in totals | Otherwise the headline total disagrees with the account balance. They are flagged instead. |
| `excluded` rows still move balances | "Real money, not spending" is a legitimate state; only analytics skip them. |
| `savingsRate` returns `null`, not 0 | A month with no income has no rate. Rendering 0% or 100% is a lie. |
| `netSpending` may be negative | Refunds larger than purchases is a real outcome, not an error. |
| Non-INR is rejected | Silently summing rupees and dollars is worse than refusing. |
| Wrong-sign rows are summed and flagged | Hiding them would make a corrupt ledger look healthy. |
| Transfers are edited in place, never re-inserted | Row ids, `transfer_id` and created times stay stable for history and backups. |
| A duplicate `transferId` is refused | Silently merging two transfers would be worse than asking the user to pick a new id. |
| Refund category defaults to the original's | A refund filed without a category must still reduce the right category budget. |
| Budgets are period records, not a setting | Editing December must not rewrite November. |
| Migration keeps the old goal rows | Deleting data during a migration is irreversible; the new UI simply reads `fin_budgets`. |

---

## Not in scope here

- No formatting (`₹1,23,456` is a UI concern).
- No imports or statement parsing — those consume these functions.
- No chart data shaping.
- No expo-sqlite adapter, screens, or navigation — the app side supplies those. The recovered UI is described in `analysis/`; these modules are the independently testable core it calls.
