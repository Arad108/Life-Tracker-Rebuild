# 13. Proposed Financial Space Architecture

## 13.1 Design constraints that determine the architecture

| Constraint | Source | Architectural consequence |
|---|---|---|
| AA is unavailable without regulated FIU status | §7.3 | Ledger must be self-sufficient; ingestion adapters optional |
| Credit cards are not on AA | §7.4 | Second card channel required (statement/email/SMS) |
| No consumer UPI API | §7.2 | UPI reconstructed from bank debits + notifications |
| DPDP consent + retention | §7.7 | Consent as domain object; retention windows; erasure flow |
| No payment execution without licence | §7.7 | Deep-link out; never hold funds |
| SMS permission is review-gated | §7.6 | SMS is an adapter, never the only path |
| Double counting destroys trust | §11.3 | Single ledger + `kind` enum + dedupe engine + invariants |
| Local-first expectation | §4.6 | Offline-capable store; sync optional |

## 13.2 System shape

```
┌───────────────────────────────────────────────────────────────┐
│                        PRESENTATION                           │
│  Overview │ Transactions │ Budgets │ Goals │ Accounts │ Debt  │
│  Bills │ Analytics │ Investments │ Slice │ Planning │ Intel   │
└───────────────────────────┬───────────────────────────────────┘
                            │  read models (projections)
┌───────────────────────────▼───────────────────────────────────┐
│                      DOMAIN / LEDGER CORE                     │
│  Transaction · Account · Transfer · Category · Budget         │
│  Goal · Recurring · Holding · Consent · Snapshot              │
│  Invariants: one-kind-per-txn · transfers balance · no orphan │
└───────────────────────────┬───────────────────────────────────┘
                            │  normalised writes
┌───────────────────────────▼───────────────────────────────────┐
│                    INGESTION ADAPTER LAYER                    │
│  manual │ csv/pdf import │ sms │ notification │ email │ AA    │
│  → raw record → parse → normalise → dedupe → review queue     │
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│                    SOURCE / PROVENANCE STORE                  │
│  raw files · raw messages · source_ref · confidence · hash    │
└───────────────────────────────────────────────────────────────┘
```

**Three laws of this architecture:**

1. **One ledger.** Every transaction lives in exactly one table regardless of source. Modules are *views*, never separate stores.
2. **Raw is immutable.** Parsed data can be reprocessed; original statements/messages are retained (within retention policy) and hash-addressed.
3. **Every derived number is a projection.** Balances, net worth, augmented balance, budget remaining, goal pace — all computed, none stored as truth (snapshots excepted, and marked as snapshots).

## 13.3 Data model (conceptual, not final DDL)

```
Account        id, name, type, currency, institution, opening_balance,
               balance_mode[derived|manual], include_in_net_worth,
               is_liability, credit_limit, statement_day, due_day, archived

Transaction    id, account_id, date, value_date, amount (signed),
               kind[expense|income|transfer|investment|refund|fee|adjustment],
               category_id, merchant_id, note, tags[],
               transfer_group_id, refund_of_id, merged_into_id,
               source[manual|statement|sms|notification|email|aa],
               source_ref, confidence, raw_id, status[posted|pending|excluded]

Category       id, name, group_id, emoji, colour, kind, archived,
               budget_mode[none|envelope|cap], is_fixed

Budget         id, category_id, period[monthly|weekly|yearly|custom],
               amount, rollover[on|off], start_date, end_date

Goal           id, name, target_amount, target_date, linked_account_id,
               contribution_rule, priority, locked, direction[save|payoff],
               interest_rate, status

Recurring      id, merchant_pattern, expected_amount, tolerance, cadence,
               next_due, account_id, category_id, auto_pay,
               price_history[], state[due_soon|paid|missed|paused]

Holding        id, account_id, instrument, type, units, cost_basis,
               current_value, valuation_date, identifier (ISIN/symbol)

Snapshot       id, date, account_id, balance, source[computed|manual]

Consent        id, source, purpose, scope, granted_at, expires_at,
               data_life, status[active|revoked|expired], artefact_ref

RawRecord      id, source, hash, mime, received_at, content_ref, parsed_ok
```

### The `kind` invariant (the most important line in the schema)

```
spending_total = Σ amount WHERE kind = 'expense'
```

Not `amount < 0`. Not "all debits". **`kind`.** This single rule prevents card-bill double counting, transfer inflation, and investment-as-expense errors — the three most common PFM bugs.

### Transfer pairing

```
TransferGroup
  id
  from_txn_id  (kind = transfer, amount < 0)
  to_txn_id    (kind = transfer, amount > 0)
  confidence
```

Invariant: for every `TransferGroup`, `|from.amount| ≈ |to.amount|` (tolerance for fees). If no counterpart exists (e.g. transfer to an untracked account), the txn is `kind = transfer` with a null counterpart and is **excluded from spending** but **included in cash flow**.

## 13.4 The twelve modules

Modules are organised as **Core** (first useful release), **Advanced** (after foundation), **Future** (needs integration or regulatory work).

| # | Module | Tier | One-line purpose |
|---|---|---|---|
| M1 | Financial Overview | Core | Answer "where do I stand?" in 15 seconds |
| M2 | Transactions | Core | The ledger and the review queue |
| M3 | Budgets | Core | Turn intent into a monthly plan |
| M4 | Financial Goals | Core | Convert wishes into dated, funded plans |
| M5 | Accounts & Assets | Core | What I own, and where it lives |
| M6 | Liabilities & Debt | Core | What I owe, and the exit date |
| M7 | Bills & Recurring | Core | What is coming, and what changed |
| M8 | Analytics & Reports | Core | Answer "why?" and "what changed?" |
| M9 | Investments | Advanced | Separate contribution from return |
| M10 | Connected Accounts (incl. Slice) | Core (Slice) / Advanced (others) | Source management, freshness, consent |
| M11 | Financial Planning | Advanced | Multi-year projection and scenarios |
| M12 | Financial Intelligence | Advanced | Explainable, finite, actionable insight |

---

## M1. Financial Overview

**Purpose.** The 15-second answer to "how am I doing right now?"

**Main features**
- Available-to-spend (augmented balance) with expandable formula.
- Committed outflow (this month, unpaid).
- Month in/out/net + savings rate with delta vs last month.
- One pinned goal with pace.
- "Needs attention" (max 3, each with a verb).
- Data freshness strip (sources + age).

**Screens**
1. Overview (scroll, 4 hero blocks + attention list + freshness strip).
2. Available-to-spend breakdown (sheet).
3. Attention item detail.

**Key interactions**
- Tap any number → formula + contributing transactions.
- Swipe a hero block → alternate period (this month / last month).
- Pin/unpin a goal.

**Required data:** account balances, card outstanding, recurring schedule, current-month transactions, goal state, source freshness.

**Metrics:** available to spend, committed, unpaid committed, net cash flow, savings rate, goal pace delta, review backlog count.

**Charts:** none above the fold. A single compact spend sparkline is permitted below the hero blocks.

**Dependencies:** M2 (ledger), M5 (balances), M6 (card dues), M7 (recurring), M4 (goal), M10 (freshness).

**Problems solved:** the "bank balance lies" problem; the "too many numbers" problem; the "is my data current?" problem.

---

## M2. Transactions

**Purpose.** The single source of truth, and the place where messy data becomes correct.

**Main features**
- Unified list (all sources) with search, filters, saved filter chips.
- **Review queue:** unreviewed, low-confidence, duplicate-suspect, unmatched-transfer.
- Add/edit/split/delete with audit trail.
- Transfers as first-class, with pairing UI.
- Refund linking.
- Duplicate merge with confidence tiers and reversibility.
- Merchant normalisation + "always rename this" rules.
- Bulk actions with running totals.
- Source badge + raw text peek on every imported row.

**Screens**
1. Transactions list (grouped by date, sticky month headers).
2. Filters sheet.
3. Review queue (card stack or list).
4. Transaction detail / edit.
5. Split editor.
6. Duplicate merge ("Same transaction?").
7. Raw source viewer.

**Key interactions**
- Swipe right → categorise; swipe left → exclude.
- Long-press → bulk select.
- Tap merchant → merchant detail.
- "Undo" toast for every destructive action (10s).

**Required data:** full transaction table + raw records + merchant map + rules.

**Metrics:** count by status, review backlog, duplicate candidates, unmatched transfers, categorisation rate, source mix.

**Charts:** none primary. Optional small "spend by day" strip for orientation.

**Dependencies:** M10 (sources), M5 (accounts).

**Problems solved:** double counting; wrong categories; lost edits; "why is this number like this?".

---

## M3. Budgets

**Purpose.** A plan the user can actually keep, in whichever style suits them.

**Main features**
- Three modes per category: **None**, **Envelope** (assign + rollover), **Cap** (spend-up-to).
- Periods: monthly (default), weekly, yearly, custom.
- Pace-aware progress (not just % used).
- Overspend recovery: "move from X" in one tap.
- Forecast: projected month-end per category.
- Copy last month / auto-suggest from 3-month average.
- Category groups with group-level caps.

**Screens**
1. Budget list (grouped, with mode chips).
2. Category budget editor.
3. Reallocate sheet.
4. Month switcher / history.
5. Budget setup wizard (optional, 4 steps).

**Key interactions**
- Tap a category → transactions behind it.
- Drag to reallocate (advanced) or tap "move".
- Toggle rollover per category.
- "Set from history" one-tap.

**Required data:** categories, budget rows, current spend, period boundaries.

**Metrics:** assigned, spent, remaining, pace delta, projected final, rollover carried, over-budget count.

**Charts:** C6 (budget vs actual bullet), C7 (overspend forecast).

**Dependencies:** M2, categories.

**Problems solved:** rigidity of zero-based budgeting; ambiguity of "remaining"; late discovery of overspend.

---

## M4. Financial Goals

**Purpose.** Turn intentions into funded, dated plans with an honest pace number.

**Main features**
- Goal types: **save** (target balance), **payoff** (debt), **spend-by** (a known future expense).
- Required if-then plan (implementation intention).
- Required monthly contribution (auto-computed, editable).
- Pace: ahead / on track / short by ₹X/month.
- Funding source: a specific account, or "from surplus".
- Priority + conflict detection ("these two cannot both be met").
- Locked goals (commitment device) — excluded from available-to-spend.
- Milestones with quiet acknowledgement.

**Screens**
1. Goals list (progress + pace).
2. Goal detail (contribution history, projection).
3. Goal creation (4 steps incl. if-then).
4. Goal conflict resolver.

**Key interactions**
- Slider: "what if I contribute ₹X more?" → new completion date.
- "Adjust deadline / adjust amount / pause" — always all three offered.
- Lock toggle with explicit warning.

**Required data:** goal rows, contributions (transactions tagged to goal), account balances.

**Metrics:** target, current, %, required monthly, actual average, projected date, pace delta, days remaining.

**Charts:** C16.

**Dependencies:** M2, M5.

**Problems solved:** goals that are wishes; no feedback loop; no awareness of conflicting commitments.

---

## M5. Accounts & Assets

**Purpose.** A truthful balance sheet.

**Main features**
- Account types: bank, cash, wallet, credit card, loan, investment, other asset.
- Balance modes: **derived** (from transactions) vs **manual** (valued).
- Reconciliation: "statement says ₹X, ledger says ₹Y" → adjustment.
- Manual assets (gold, property, PF, jewellery) with revaluation reminders.
- Exclude from net worth / from reports, independently.
- Archive without deleting.
- Monthly snapshots for history.

**Screens**
1. Accounts list (grouped: cash / bank / cards / loans / investments / other).
2. Account detail (balance, transactions, reconciliation).
3. Add/edit account.
4. Net worth summary.
5. Reconcile flow.

**Key interactions**
- Tap balance → breakdown.
- "Reconcile" → enter statement balance → adjustment created.
- Revalue an asset → new snapshot.

**Required data:** accounts, transactions, snapshots, valuations.

**Metrics:** total assets, total liabilities, net worth, per-account balance, unreconciled accounts.

**Charts:** C9, C10.

**Dependencies:** M2.

**Problems solved:** the bank balance lie; invisible liabilities; assets scattered across apps.

---

## M6. Liabilities & Debt

**Purpose.** Make debt concrete: what it costs, and when it ends.

**Main features**
- Loan accounts: principal, rate, EMI, tenure, start date.
- Amortisation schedule generated.
- **Payoff projection** with extra-payment "what if".
- Interest-paid-to-date and interest-remaining.
- Card dues: outstanding, unbilled, due date, minimum due.
- Priority ordering (avalanche / snowball) as **analysis**, user chooses.
- Prepayment impact: months saved + interest saved.

**Screens**
1. Debt overview (total owed, monthly obligation, next due).
2. Loan detail (schedule, payments).
3. Payoff simulator.
4. Card detail (dues, statement cycle).

**Key interactions**
- Slider: extra monthly payment → new payoff date + interest saved.
- Tap a month → that month's principal/interest split.
- "Log a payment" → links to transaction.

**Required data:** loan rows, EMI transactions, card statements.

**Metrics:** total debt, monthly obligation, weighted avg rate, payoff date, interest remaining, utilisation.

**Charts:** C11.

**Dependencies:** M5, M2.

**Problems solved:** vague dread of debt; no sense of the cost of minimum payments.

---

## M7. Bills & Recurring

**Purpose.** Nothing arrives as a surprise.

**Main features**
- Recurring objects with merchant pattern, expected amount ± tolerance, cadence.
- Detection from history (≥3 occurrences, regular interval, stable amount).
- Confirmation flow (never auto-commit a detected recurring).
- Price-change history and alerts.
- Upcoming calendar (7/30/60 days).
- Missed detection ("expected 5 Nov, no match found").
- Subscription total, annualised.
- Pause/cancel state tracking.

**Screens**
1. Upcoming (next 30 days, grouped by week).
2. Recurring list (monthly-equivalent total).
3. Recurring detail (charges, price history).
4. Detection review queue.

**Key interactions**
- Confirm / reject a detected recurring.
- Tap a charge → transaction.
- "This changed price" → history.
- Add to calendar (ICS export).

**Required data:** recurring rows, matched transactions, price history.

**Metrics:** monthly recurring total, annualised total, count, upcoming 7/30d, price increases, missed count.

**Charts:** C14, C15.

**Dependencies:** M2.

**Problems solved:** forgotten subscriptions; bill shock; silent price hikes.

---

## M8. Analytics & Reports

**Purpose.** Answer "why?" and "what changed?" — with drill-down on everything.

**Main features**
- Hub with 4 primary charts (cash flow, spending, savings rate, net worth).
- Full catalogue (§10) with filters and time ranges.
- **Scope chip** always visible.
- Saved views (name + chart + filters + range).
- Drill-down on every element.
- Export: PNG (chart), CSV (rows), and a "report pack" PDF (advanced).
- Compare periods (this vs last, this vs 3-month avg).

**Screens**
1. Analytics hub.
2. Individual report (one question per screen).
3. Filter/scope sheet.
4. Saved views list.
5. Drill-down transaction list (inherits scope).

**Key interactions**
- Tap chart element → drill.
- Long-press chart → save as view.
- Toggle comparison baseline.
- Share chart image.

**Required data:** transactions, categories, accounts, snapshots, budgets, goals.

**Metrics:** all derived in §10.

**Charts:** C1–C22 (excluding investment-specific ones in M9).

**Dependencies:** M2, M3, M4, M5, M7.

**Problems solved:** data without answers; unverifiable numbers; no repeatable analysis ritual.

---

## M9. Investments (Advanced)

**Purpose.** Separate "how much I put in" from "how much the market gave me".

**Main features**
- Holdings: equity, MF, ETF, FD, gold, PPF, NPS, crypto.
- Transactions: buy/sell/dividend/split/bonus.
- **XIRR** per holding and portfolio.
- Contributed vs returns chart.
- Allocation vs target allocation.
- Benchmark comparison (Nifty 50 default).
- Manual valuation with date; price feed later.
- CAS import (NSDL/CDSL) — differentiator.

**Screens**
1. Portfolio overview (value, invested, gain, XIRR).
2. Holdings list by class.
3. Holding detail (transactions, performance).
4. Allocation vs target.
5. Import CAS.

**Key interactions**
- Tap gain → "contributed vs market" breakdown.
- Change benchmark.
- Add transaction (buy/sell/dividend).

**Required data:** holdings, investment transactions, valuations, benchmark series.

**Metrics:** current value, invested, absolute gain, XIRR, allocation %, benchmark delta.

**Charts:** C17, C18, C19.

**Dependencies:** M5, M2 (for cash flows).

**Problems solved:** contribution/return confusion; no allocation view; no performance vs index.

**Regulatory note:** analysis only. No buy/sell recommendations (§7.7).

---

## M10. Connected Accounts (Core: Slice · Advanced: others)

**Purpose.** Manage where data comes from, how fresh it is, and what was consented.

**Main features**
- Source list with status, last sync, record count.
- **Slice lens** (§8.7) as the flagship instance.
- Import flows: statement (PDF/CSV), notification permission, SMS permission, email (future), AA (future).
- **Consent log:** what was granted, when, purpose, expiry, revoke.
- Freshness enforcement: stale states designed, never silent.
- Format-feedback loop for unrecognised statements.

**Screens**
1. Connected sources list.
2. Source detail (Slice) with balance, month summary, top categories, recent activity, freshness.
3. Import wizard (file → preview → confirm).
4. Consent log.
5. Permission education screens.

**Key interactions**
- Import a statement → preview with confidence → commit.
- Revoke a source → choose delete or keep data.
- Refresh (where supported).

**Required data:** sources, raw records, consents, freshness metadata.

**Metrics:** sources active, last sync age, records imported, parse success rate, dedupe rate.

**Charts:** none (lists and badges).

**Dependencies:** M2.

**Problems solved:** "is my data current?"; "what did I agree to?"; Slice visibility; card coverage without AA.

---

## M11. Financial Planning (Advanced)

**Purpose.** Zoom out from this month to the next five years.

**Main features**
- Baseline: income, fixed costs, variable costs, savings rate.
- Projections: net worth at 1/3/5 years under 3 scenarios.
- Life events: house, child, sabbatical, retirement (simple model).
- "What if" sliders: income change, expense cut, return rate.
- Goal feasibility across the whole plan (not one goal at a time).
- Runway: months of expenses covered by liquid assets.

**Screens**
1. Plan summary (one projection chart + key numbers).
2. Scenario editor.
3. Life events timeline.
4. Runway detail.

**Key interactions**
- Drag sliders → projection updates live.
- Add an event → see impact.
- Save a scenario.

**Required data:** historical averages, goals, debts, assets, assumptions.

**Metrics:** projected net worth, savings rate trajectory, runway months, FI number (optional), goal feasibility score.

**Charts:** projection line with bands; scenario comparison bars.

**Dependencies:** M3, M4, M5, M6, M9.

**Problems solved:** month-to-month myopia; no sense of whether the plan is viable.

---

## M12. Financial Intelligence (Advanced)

**Purpose.** Tell the user the three things that matter, with evidence and an action.

**Main features**
- **Insight engine** (deterministic rules) producing typed insights:
  - anomaly (category spike vs own baseline),
  - new recurring,
  - price change,
  - budget pace risk,
  - goal pace risk,
  - duplicate/data-health issue,
  - unused subscription,
  - cash-flow squeeze ahead.
- Ranking: impact × recency × actionability.
- **Cap: 3 per day, 5 per week.**
- Every insight: evidence, formula, one-tap action, dismiss, "why am I seeing this?".
- Weekly Change Digest.
- Natural-language layer that only *phrases* pre-computed insights (never computes).

**Screens**
1. Insights feed (max 3).
2. Insight detail (evidence + transactions).
3. Weekly digest.
4. Insight preferences (categories of insight on/off).

**Key interactions**
- Act (e.g. "reallocate ₹500 from Dining").
- Snooze / dismiss with reason.
- Ask a question → routed to a **deterministic query** over the ledger, not free-form generation.

**Required data:** all read models + rule definitions.

**Metrics:** insights shown, acted-on rate, dismissed rate, false-positive rate.

**Charts:** none; insight cards may embed a sparkline.

**Dependencies:** all modules.

**Problems solved:** dashboards that inform but do not guide; AI that hallucinates.

**Hard rule:** if the model cannot ground an answer in a computed value, it says "I can't answer that from your data" — it does not estimate.

---

## 13.5 Cross-cutting concerns

| Concern | Approach |
|---|---|
| **Offline** | Local store is primary; sync is a background reconciliation. All Core features work with no network. |
| **Privacy** | On-device by default. Raw statements/messages never leave the device unless the user opts into backup. |
| **Retention** | Raw files kept 90 days by default (configurable), normalised records kept indefinitely. |
| **Erasure** | One-tap "delete all my data" with confirmation; produces an export first. |
| **Audit** | Every edit to a transaction stores `previous_value`, `changed_at`, `reason`. |
| **Accessibility** | Charts have table alternatives; colour never the sole encoder; dynamic type; screen-reader labels on every metric. |
| **Performance** | Read models pre-aggregated per month; 10k transactions must scroll at 60fps. |
| **Backup** | Encrypted export/import (JSON + CSV). No lock-in. |
| **Testing** | Invariant tests for `kind`, transfer pairing, dedupe; golden-file tests for statement parsers. |

## 13.6 Dependency graph

```
M2 Transactions ──┬── M3 Budgets ──┐
                  ├── M4 Goals ─────┤
                  ├── M5 Accounts ──┼── M11 Planning
                  ├── M6 Debt ──────┤
                  ├── M7 Recurring ─┤
                  ├── M8 Analytics ─┤
                  ├── M9 Investments┘
                  └── M10 Sources
M1 Overview depends on 2,4,5,6,7,10
M12 Intelligence depends on all
```

**Build order:** M2 → M5 → M10 (Slice) → M1 → M7 → M3 → M4 → M8 → M6 → M9 → M11 → M12.

---

# 14. Recommended Core Features

## 14.1 Definition of "Core"

Core = the smallest set that lets a real user, with no bank connection, manage their money better than they do today, for 30 consecutive days.

## 14.2 Core feature list (with acceptance criteria)

| ID | Feature | Module | Acceptance criterion |
|---|---|---|---|
| C-01 | Local ledger with all transaction kinds | M2 | Expense/income/transfer/investment/refund/fee/adjustment all representable; spending total uses `kind` only |
| C-02 | Accounts with derived + manual balances | M5 | Opening balance + transactions reconcile to a statement balance exactly |
| C-03 | Manual entry in ≤3 taps | M2 | Amount → category → save; date defaults to today; account remembered |
| C-04 | Review queue | M2 | Every imported txn is unreviewed until confirmed; bulk confirm works |
| C-05 | Statement import (CSV + PDF) | M10 | Preview with per-row confidence; commit only after confirmation; dedupe preview |
| C-06 | Duplicate detection + reversible merge | M2 | Confidence tiers; merged record retained; merge reversible |
| C-07 | Transfers as first-class + pairing | M2 | A transfer never appears in spending; unmatched transfers are surfaced |
| C-08 | Refund linking | M2 | Linked refund nets against the original in analytics |
| C-09 | Categories with groups, emoji, colour, archive | M2 | Archiving preserves history |
| C-10 | Merchant normalisation + rename rule | M2 | "Always rename" applies to future matches with a preview |
| C-11 | Budgets: none / envelope / cap | M3 | Per-category mode; rollover only in envelope; pace marker accurate |
| C-12 | Overspend recovery (move money) | M3 | One-tap reallocation; both categories update immediately |
| C-13 | Goals with if-then, pace, projection | M4 | Required monthly computed; pace delta shown; conflict detection |
| C-14 | Recurring detection + confirmation | M7 | ≥3 occurrences; never auto-committed; price history captured |
| C-15 | Upcoming bills (30 days) | M7 | Shows next 5 with dates; missed state after tolerance |
| C-16 | Augmented balance with formula | M1 | Tap expands to full derivation with each component sourced |
| C-17 | Home: 4 hero numbers + ≤3 attention items | M1 | Loads in <1s from local store; every number tappable |
| C-18 | Analytics: cash flow, spending, savings rate, net worth | M8 | Each drills to transactions; scope chip always visible |
| C-19 | Saved views | M8 | Save chart+filters+range; restore exactly |
| C-20 | Net worth with snapshots | M5 | Monthly snapshot survives transaction edits |
| C-21 | Debt: loan schedule + payoff projection | M6 | Extra-payment slider updates payoff date and interest saved |
| C-22 | **Slice lens** | M10 | Slice txns visible in their own tab and in all analytics exactly once |
| C-23 | Data health screen | M8/M10 | Shows freshness, backlog, duplicates, unreconciled accounts |
| C-24 | CSV + JSON export | all | Complete, re-importable, no data loss |
| C-25 | Consent log + revoke | M10 | Every source's permission visible and revocable |
| C-26 | Offline operation | all | Airplane mode: every Core screen works |

## 14.3 Explicitly deferred from Core

| Deferred | Why |
|---|---|
| AA aggregation | Regulatory + partnership lead time |
| Email (Gmail) parsing | OAuth review; statement import covers cards first |
| SMS/notification capture | Play declaration + parser fragility; add as accelerator |
| Investments | Requires holdings model; separate mental model |
| Planning | Depends on stable historical data |
| Intelligence/AI | Needs clean data first; risk of trust damage if early |
| Household sharing | Multi-user sync is a large architectural change |
| Bill payment | Regulatory; not our business |
| Multi-currency | Adds complexity to every calculation |

## 14.4 The 30-day success test

A Core release is successful if, after 30 days, a user can say:

1. "I know what I can spend right now." → C-16
2. "I know what is coming." → C-15
3. "I know where my money went, and I can prove it." → C-18 + drill-down
4. "My numbers are right." → C-05, C-06, C-07, C-23
5. "My Slice spending is included, once." → C-22

If any of these five fails, the release is not done.

---

# 15. Advanced and Future Features

## 15.1 Advanced (after Core is stable)

| ID | Feature | Module | Why now (not earlier) | Value |
|---|---|---|---|---|
| A-01 | Investments + XIRR + CAS import | M9 | Needs holdings model and clean cash flows | High |
| A-02 | Cash-flow forecast (30/60/90) | M8/M11 | Needs ≥3 months of history | High |
| A-03 | Weekly Change Digest | M12 | Needs reliable recurring + baselines | High |
| A-04 | SMS capture | M10 | Play declaration + parser work | Medium |
| A-05 | Notification capture | M10 | Disclosure + parser work | High |
| A-06 | Email (Gmail) card parsing | M10 | OAuth verification | Medium |
| A-07 | Scenario planning / what-if | M11 | Needs planning baseline | Medium |
| A-08 | Household sharing (scoped) | all | Multi-user sync | Medium |
| A-09 | Report packs (PDF export) | M8 | Nice-to-have | Low |
| A-10 | Custom dashboards / widgets | M1 | After metrics stabilise | Medium |
| A-11 | Receipt attachment + OCR | M2 | Storage + accuracy | Low |
| A-12 | Multi-currency | all | Only if user base demands | Low |
| A-13 | Insight preferences + tuning | M12 | After insight engine exists | Medium |
| A-14 | Calendar integration (ICS) | M7 | Low effort, real utility | Low |
| A-15 | Biometric app lock | all | Security expectation | Medium |

## 15.2 Future (integration or regulatory dependent)

| ID | Feature | Dependency | Risk |
|---|---|---|---|
| F-01 | AA aggregation | FIU partnership or regulated entity status | High regulatory; medium commercial |
| F-02 | Slice via AA | Slice SFB as FIP + FIU partner | **Unknown** whether possible (§8.3) |
| F-03 | Bank feed via partner TSP | Commercial agreement | Medium |
| F-04 | Credit score (CIBIL/Experian) | Bureau partnership | Medium |
| F-05 | Bill payment / BBPS deep integration | Payment aggregator licence | **Rejected for now** |
| F-06 | Tax-ready exports (capital gains) | Instrument-level cost basis | Medium |
| F-07 | Family/child accounts | DPDP children's-data obligations | Medium |
| F-08 | Open API for user's own data | Auth + rate limiting | Low |
| F-09 | Desktop/web companion | Sync layer | Medium |
| F-10 | Lending / credit products | **Not planned** | Reputational — see §11.4 |

## 15.3 What we deliberately exclude, permanently

| Exclusion | Rationale |
|---|---|
| Payment execution | Licence + fraud surface + not the product |
| Lending / credit cross-sell | Corrupts incentives; Axio's cautionary tale |
| Selling or brokering user data | Fatal to trust; DPDP exposure |
| Investment advice (buy/sell) | SEBI registration required |
| Social feed / public comparison | Shame risk, no decision value |
| Gamified points economy | Optimises the game, not the finances |
| Crypto trading | Not a PFM function |

## 15.4 Feature graduation rules

A feature moves from Advanced to Core only if:
1. It is used by >40% of active users in a 30-day window.
2. It has <2% error/complaint rate.
3. It works offline or degrades gracefully.
4. It has no unresolved regulatory dependency.

A feature is removed if it is used by <10% and has no clear decision value.

## 15.5 The roadmap in one table

| Phase | Duration (indicative) | Modules | Exit criterion |
|---|---|---|---|
| P0 Foundation | — | M2, M5, M10 (Slice), M1 | Manual ledger + Slice + home works offline |
| P1 Plan | — | M7, M3, M4 | User can budget and track a goal end-to-end |
| P2 Explain | — | M8, M6, data health | Every number drills down; debt has an exit date |
| P3 Wealth | — | M9, M11 | Investment performance and long-range plan |
| P4 Guide | — | M12 | Three insights/day, all explainable |
| P5 Connect | — | AA / SMS / email | Additional ingestion channels |

**Note:** durations are deliberately omitted. Scope is expressed as exit criteria, not dates, because the correct sequence matters more than the calendar.

---
