# fin-core — posting rules + calculation engine

Pure TypeScript for the Financial Space. **No React, no React Native, no expo-sqlite, no imports from the app repository.** Every function is deterministic: rows in, numbers out.

Two deliverables live here:

| Module | Task | What it decides |
|---|---|---|
| `src/posting.ts` | I3 | Whether a movement is physically possible |
| `src/calc.ts`, `src/balances.ts` | I6 | What the numbers are |

---

## Files

```
src/types.ts      Transaction, Account, DayRange, Metric
src/money.ts      paise helpers, day-key validation, safe ratio
src/posting.ts    validatePosting, validateTransferPair, POSTING_RULES
src/calc.ts       income, expenses, refunds, interest, netSpending, cashFlow,
                  savingsRate, transfers, summarise
src/balances.ts   balanceOf, balancesByAccount, netWorth, liquidBalance, cardDebt
src/index.ts      barrel

test/*.test.ts    fixtures + tests (node:test, no framework)
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

---

## Not in scope here

- No SQL, no queries, no persistence.
- No formatting (`₹1,23,456` is a UI concern).
- No budgets, goals, bills or imports — those consume these functions.
- No chart data shaping.
