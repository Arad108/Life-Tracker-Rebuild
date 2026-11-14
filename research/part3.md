# 10. Financial Analytics and Chart Catalogue

## 10.1 Principles for the analytics layer

1. **A chart is an answer, not a decoration.** If it cannot change a decision, it is removed.
2. **Title as a question.** "Where did my money go?" beats "Spending by Category".
3. **Every chart drills down** to the exact transactions that produced it.
4. **Scope is always visible.** A persistent chip row: `Oct 2026 · All accounts · No transfers`.
5. **No chart without a baseline.** A number alone means nothing; compare to plan, to last month, or to a 3-month average.
6. **Two charts maximum per mobile screen.**
7. **Aggregation must be explainable** — tapping a bar shows the formula and the rows.

## 10.2 Chart type decision rules

| Question shape | Chart |
|---|---|
| Composition of a whole, ≤6 parts | Donut / Pie |
| Composition, many parts, ranked | Horizontal bar (sorted) |
| Flow between two sides | Sankey |
| Change over time, one series | Line / area |
| Change over time, parts | Stacked bar (not stacked area) |
| Plan vs actual | Bullet / paired bar with target line |
| Progress to a fixed target | Progress bar / ring (single value only) |
| Distribution | Histogram (rare; only for spend-size distribution) |
| Correlation of two variables | Scatter (only in advanced analysis) |
| Cumulative accumulation | Step line |

**Banned by default:** 3D charts, dual-axis charts, pie charts with >6 slices, animated charts that delay reading, gauges for anything other than a single target.

## 10.3 The catalogue

Each entry: **Q** = question answered · **Data** = required fields · **Calc** = aggregation · **Viz** = visualisation · **Filters** · **Range** · **Drill** · **Decision**.

---

### C1. Cash-flow waterfall

- **Q:** Where did my money actually go this month?
- **Data:** `txn.date, amount, kind, category_id, account_id`
- **Calc:** Income total → minus each expense group → minus investments → net.
- **Viz:** Waterfall (or Sankey in landscape/tablet).
- **Filters:** date range, accounts, exclude transfers, include/exclude investments.
- **Range:** month, quarter, year, custom.
- **Drill:** tap any bar → filtered transaction list for that group.
- **Decision:** "Which group is eating my surplus?" — usually one of 2 groups.

### C2. Sankey: income → categories

- **Q:** How does my salary distribute across my life?
- **Data:** income txns, expense txns, category groups.
- **Calc:** two-column flow; links weighted by amount.
- **Viz:** Sankey with ≤8 right-hand nodes + "Other".
- **Filters:** month; account scope; include savings as a node.
- **Range:** month (primary), quarter.
- **Drill:** tap a ribbon → transactions.
- **Decision:** reveals structural imbalance (e.g. 41% to rent) in one glance.
- **Note:** the single most valuable chart in PFM; must be **interactive**, not a static image.

### C3. Spending trend (stacked, by group)

- **Q:** Is my spending rising, and in what?
- **Data:** expense txns by month × category group.
- **Calc:** monthly sum per group, last 12 months.
- **Viz:** stacked bar, ≤5 groups + Other.
- **Filters:** group toggle, exclude one-offs.
- **Range:** 6/12/24 months.
- **Drill:** tap a segment → that month's group transactions.
- **Decision:** spot a creeping category before it becomes structural.

### C4. Category breakdown (ranked)

- **Q:** What are my biggest spending categories?
- **Data:** expense txns × category.
- **Calc:** sum, % of total, count, avg per txn, delta vs previous period.
- **Viz:** horizontal ranked bars with value + % + delta.
- **Filters:** period, accounts, exclude transfers/refunds.
- **Range:** month, quarter, year.
- **Drill:** tap a bar → transactions; long-press → "set a budget for this".
- **Decision:** choose where to cut. Must show **delta**, because the biggest category is not always the problem.

### C5. Merchant breakdown

- **Q:** Which specific businesses am I paying?
- **Data:** normalised merchant, amount, count.
- **Calc:** sum + count + avg ticket + last-seen date.
- **Viz:** ranked list (not a chart) with sparkline per merchant.
- **Filters:** category, period.
- **Range:** month, 3 months, year.
- **Drill:** tap → merchant detail (all txns, cadence, price history).
- **Decision:** "I pay Swiggy ₹4,200/month across 22 orders" is more actionable than "Food ₹6,000".

### C6. Budget vs actual (per category)

- **Q:** Am I on plan?
- **Data:** budget amount, actual spend, period elapsed.
- **Calc:** `actual / budget`, plus **pace-adjusted** expected spend = `budget × elapsed_fraction`.
- **Viz:** bullet bar (actual fill + target marker + pace marker).
- **Filters:** month, category group.
- **Range:** current month, previous months.
- **Drill:** tap → category transactions; "move money" action inline.
- **Decision:** reallocate now vs later. Pace marker is the key innovation — it distinguishes "over" from "on pace to be over".

### C7. Overspend forecast

- **Q:** Where will I end the month if nothing changes?
- **Data:** actual to date, days elapsed, budget.
- **Calc:** `projected = actual / days_elapsed × days_in_month`; flag `projected > budget`.
- **Viz:** single ranked list of at-risk categories with projected final and delta.
- **Filters:** none (it is inherently current-month).
- **Range:** current month only.
- **Drill:** tap → transactions + "adjust budget" / "snooze".
- **Decision:** act *before* the overspend, which is the whole point.

### C8. Savings rate trend

- **Q:** Am I getting better at keeping money?
- **Data:** income, expenses, investments, transfers-out to savings.
- **Calc:** `(income − expenses) / income`, and an "invested" variant counting investments as savings.
- **Viz:** line + 3-month moving average + target band.
- **Filters:** exclude one-off income (bonus toggle) — **essential**, or the chart lies.
- **Range:** 12/24 months.
- **Drill:** tap a point → that month's cash-flow breakdown.
- **Decision:** the single best long-run health metric; drives the annual review.

### C9. Net worth over time

- **Q:** Is my overall position improving?
- **Data:** monthly snapshots: assets, liabilities, per account.
- **Calc:** `Σ assets − Σ liabilities` per snapshot date.
- **Viz:** line (net worth) with optional stacked area of assets and liabilities below.
- **Filters:** include/exclude specific accounts; include/exclude a property.
- **Range:** 6/12/36 months, all time.
- **Drill:** tap a point → that month's balance sheet (accounts + values).
- **Decision:** long-term trajectory; catches lifestyle inflation.

### C10. Assets vs liabilities composition

- **Q:** What do I own and owe, and in what form?
- **Data:** account type, balance, valuation date.
- **Calc:** grouped sums by asset class and liability class.
- **Viz:** two stacked horizontal bars (assets above, liabilities below) — not two pies.
- **Filters:** include/exclude illiquid (property, gold).
- **Range:** current snapshot; historical via C9 drill.
- **Drill:** tap a segment → accounts in that class.
- **Decision:** concentration risk and debt structure.

### C11. Debt payoff trajectory

- **Q:** When will I be free of this debt, and what does it cost?
- **Data:** principal, rate, EMI, extra payment.
- **Calc:** amortisation schedule; interest paid; payoff date; comparison with extra payment.
- **Viz:** stacked area of principal vs interest over months, plus a payoff-date callout.
- **Filters:** per loan; "what if I add ₹X/month" slider.
- **Range:** full tenure.
- **Drill:** tap a month → that month's split.
- **Decision:** whether to prepay, and which loan first. Show **interest saved**, the emotionally real number.

### C12. Income composition and stability

- **Q:** How reliable and concentrated is my income?
- **Data:** income txns by source.
- **Calc:** sum by source; count of sources; variance month-to-month; % from top source.
- **Viz:** stacked bar over 12 months + a "stability score" derived from coefficient of variation.
- **Filters:** exclude reimbursements/refunds.
- **Range:** 12 months.
- **Drill:** tap → income transactions by source.
- **Decision:** for irregular earners, this determines whether envelope budgeting is even viable.

### C13. Fixed vs flexible split

- **Q:** How much of my spending is actually discretionary?
- **Data:** category flag `fixed | flexible`; recurring flag.
- **Calc:** sums; ratio; trend.
- **Viz:** single 100% stacked bar + trend line of flexible share.
- **Filters:** period.
- **Range:** 12 months.
- **Drill:** tap → the transactions in each band.
- **Decision:** reveals the true size of the lever. Most users discover 55–70% is fixed, which reframes "just spend less".

### C14. Committed outflow calendar

- **Q:** What is coming that I have not paid for?
- **Data:** recurring objects with next_due, amount, account.
- **Calc:** forward-looking sums by week until month-end and next 30/60 days.
- **Viz:** calendar heat strip + list of next 5 obligations.
- **Filters:** account, category, auto-pay flag.
- **Range:** 7/30/60 days.
- **Drill:** tap → recurring detail with price history.
- **Decision:** "Can I afford this purchase today?" — the highest-frequency real question.

### C15. Subscription inventory

- **Q:** What am I paying for repeatedly, and did the price change?
- **Data:** recurring objects, price history, last charged.
- **Calc:** monthly-equivalent total (annualise/12), count, price deltas.
- **Viz:** list with cadence chips and price-change badges; total at top.
- **Filters:** active/paused/cancelled.
- **Range:** current.
- **Drill:** tap → charge history + "cancel guide" link.
- **Decision:** cancel 1–2 items. Annualised total ("₹18,400/year") is the framing that triggers action.

### C16. Goal progress and pace

- **Q:** Am I going to make it?
- **Data:** goal target, deadline, contributions, current amount.
- **Calc:** `required_monthly = (target − current) / months_left`; `projected = current + avg_contribution × months_left`; pace delta.
- **Viz:** progress bar + pace indicator ("ahead by 2 months" / "₹1,800/month short").
- **Filters:** per goal; all goals.
- **Range:** to deadline.
- **Drill:** tap → contribution history.
- **Decision:** increase contribution, extend deadline, or drop the goal — the only three honest options, and the UI should offer all three.

### C17. Investment allocation

- **Q:** What am I actually exposed to?
- **Data:** holdings, asset class, market value.
- **Calc:** % by class (equity/debt/gold/real estate/cash/crypto).
- **Viz:** donut ≤6 slices + target-allocation comparison bars.
- **Filters:** include/exclude specific accounts.
- **Range:** current.
- **Drill:** tap → holdings in class.
- **Decision:** rebalancing. Present as **analysis**, never as a recommendation (§7.7).

### C18. Investment performance: contributions vs returns

- **Q:** How much of my gain is my money, and how much is the market?
- **Data:** contributions over time, current value, cash flows.
- **Calc:** **XIRR** (essential for SIPs), absolute gain, gain split into `contributed` vs `market`.
- **Viz:** stacked area: contributed capital (bottom) + returns (top), over time.
- **Filters:** per instrument, per account, overall.
- **Range:** 1/3/5 years, since inception.
- **Drill:** tap → holding detail with transaction history.
- **Decision:** whether to keep contributing, and whether a fund is actually working. This chart alone separates a real investment tracker from a balance display.

### C19. Benchmark comparison

- **Q:** Am I beating a simple index?
- **Data:** portfolio XIRR, benchmark series (Nifty 50 / chosen index).
- **Calc:** both normalised to 100 at start; delta.
- **Viz:** two lines, one axis (never dual axis).
- **Filters:** benchmark selector.
- **Range:** 1/3/5 years.
- **Drill:** none (portfolio-level).
- **Decision:** whether active management is earning its cost.

### C20. Refund and reversal impact

- **Q:** How much of my "spending" came back?
- **Data:** linked refund pairs.
- **Calc:** gross spend, refunds, net spend.
- **Viz:** paired bar (gross vs net) per month.
- **Filters:** category.
- **Range:** 12 months.
- **Drill:** tap → the linked pairs.
- **Decision:** trust in the numbers. This chart exists mainly to *prove* correctness.

### C21. Duplicate and anomaly log

- **Q:** What looks wrong in my data?
- **Data:** duplicate candidates, outliers, unmatched transfers, stale sources.
- **Calc:** rule-based flags.
- **Viz:** checklist, not a chart.
- **Filters:** severity.
- **Range:** all.
- **Drill:** each item → the records.
- **Decision:** fix data quality. Unglamorous, but the trust foundation.

### C22. Cash-flow forecast (advanced)

- **Q:** Will I run short before my next income?
- **Data:** current balance, recurring schedule, historical variable spend.
- **Calc:** `balance_t = balance_0 + expected_income − committed − expected_variable(t)`.
- **Viz:** line with a confidence band and a zero-line.
- **Filters:** scenario (conservative/typical).
- **Range:** 30/60/90 days.
- **Drill:** tap a dip → what causes it.
- **Decision:** timing of large purchases; overdraft avoidance.

## 10.4 Redundancy audit

| Chart | Overlaps with | Verdict |
|---|---|---|
| Pie of spending | C4 ranked bars | **Drop the pie.** Ranked bars carry more information in less space. |
| "Total expenses" gauge | C6 | **Drop.** A gauge with no target is meaningless. |
| Stacked area of net worth | C9 | Keep only the line; area adds no information. |
| Separate "income pie" | C12 | Merge into C12 stacked bars. |
| Category pie + category list | C4 | Keep list only. |
| Monthly bar + monthly line | C3 | Keep bars. |

## 10.5 Screen allocation

| Screen | Charts |
|---|---|
| Home | C14 (compact list, not chart), C7 (list), one hero metric block |
| Analytics hub | C1, C4, C8, C9 |
| Cash flow | C1, C22 |
| Spending | C3, C4, C5, C13 |
| Budgets | C6, C7 |
| Goals | C16 |
| Debt | C11 |
| Investments | C17, C18, C19 |
| Data health | C20, C21 |

---

# 11. Competitor Strengths and Weaknesses

## 11.1 The strengths worth internalising

| Strength | Owner | Why it works | Transferable? |
|---|---|---|---|
| Chart → transaction drill-down | Monarch | Answers "why?" in one tap; builds trust | **Yes, must-have** |
| Sankey cash flow | Monarch | Shows structure instantly | Yes |
| Saved reports | Monarch | Turns analysis into ritual | Yes |
| Fixed vs flexible grouping | Monarch | Reframes "spend less" into a real lever | Yes |
| Target semantics (set aside / refill / have-a-balance) | YNAB | Removes ambiguity in budgeting intent | Yes |
| Debt payoff target with auto-calculated payment | YNAB | Turns a vague worry into a number | Yes |
| True expenses (annual cost ÷ 12) | YNAB | Prevents predictable "surprises" | Yes |
| Roll-with-the-punches framing | YNAB | Removes shame, preserves engagement | **Yes, culturally important** |
| Review queue + progressive ML | Copilot | Earns automation; teaches the product | Yes |
| Committed vs discretionary separation | Copilot | Makes the dashboard honest | Yes |
| Recurrings as first-class objects | Copilot | Subscriptions are a top-3 user concern | Yes |
| Name Rules | Copilot | Durable correction | Yes |
| Augmented balance | Fold | The only number that matters in India | **Yes, flagship** |
| Real-time card notification | Fold | Behavioural moment of maximum value | Yes (via email/SMS) |
| Cards in the same timeline as banks | Fold | Prevents siloed thinking | Yes |
| Household Spaces | Fold / Monarch | Real families share money | Yes (advanced) |
| Transfers as first-class records | Money Manager | Correctness | **Yes, non-negotiable** |
| Calendar view of transactions | Money Manager | Spatial memory aid | Yes |
| Bookmarks / quick repeat | Money Manager | Reduces entry friction | Yes |
| Local-first, offline, private | Money Manager / Actual | Trust + resilience | Yes |
| Net-worth-first home | INDmoney | Frames the whole picture | Partially |
| CAS import | (underused) | Highest info-per-file in India | **Yes, differentiator** |

## 11.2 The weaknesses — and what they cost

| Weakness | Product(s) | User-visible symptom | Our response |
|---|---|---|---|
| Double-counted card bill payments | Axio, many Indian PFMs | Spending appears ~2× | `kind` enum + transfer pairing + invariant tests |
| Silent filter persistence | Monarch | "My numbers are wrong" | Visible scope chip; filters reset on navigation unless pinned |
| Sync breaks silently | Fold, Monarch, Copilot | Stale balance shown as current | Freshness indicator on every source; stale states designed |
| Aggregation-only onboarding | Monarch, Copilot, Fold | User with no eligible accounts gets nothing | Manual door with equal dignity |
| Zero-based rigidity | YNAB | Irregular income users churn | Three budget modes; none required |
| Learning cliff | YNAB | First two weeks are confusing | Guided first transaction; progressive disclosure |
| Opaque automation | Copilot | "Why did it do that?" | Every auto-decision shows its rule and evidence |
| No drill-down | Money Manager, Axio | Data in, no answers | Every chart drills |
| Light budgeting | Fold, INDmoney | No plan, only history | Full budget engine |
| Tracker degraded by lending pivot | Axio | Core feature rot | Explicit: never monetise via lending |
| Email dependency for cards | Fold | Gmail access is a hard sell | Statement import as primary card channel |
| Web-only report creation | Monarch | Mobile users blocked | Everything on mobile |
| No Android | Copilot | Half of India excluded | Android-first |
| Fragile SMS parsing | Axio | Missed/duplicate transactions | Multi-channel + review queue + visible provenance |
| No investment performance | YNAB, Money Manager | Can't tell gain from contribution | XIRR + contributed-vs-returns chart |
| Missing duplicate merge | nearly all | Manual cleanup burden | Dedupe engine with confidence tiers |
| No export | Copilot (partial) | Lock-in fear | CSV + JSON always |

## 11.3 The five trust-killers, ranked

From community discussion and review patterns (anecdotal but consistent across products):

1. **Wrong totals due to double counting.** Destroys the product's reason to exist.
2. **Stale data presented as current.** Worse than no data.
3. **Silent failures.** No error, no data, user assumes they spent nothing.
4. **Unexplainable numbers.** No drill-down → user cannot verify → distrust.
5. **Lost edits after re-sync.** User's correction is overwritten by the next import.

**Design mandate:** each of these five gets an explicit, tested defence in the architecture (§13), not a hope.

## 11.4 What competitors do that we should explicitly *not* do

| Practice | Why not |
|---|---|
| Gate the useful analytics behind the top tier | The analytics *are* the product |
| Require bank connection to complete onboarding | Excludes most of the market |
| Auto-create categories silently | User loses the mental model |
| Hide transfers from the transaction list | Users think transactions are missing |
| Show a single "financial health score" with no breakdown | Unfalsifiable, unactionable |
| Notify daily with generic tips | Notification fatigue; channel death |
| Sell user data / cross-sell loans aggressively | Destroys the trust the product depends on |
| Animate every chart | Delays reading; harms accessibility |

---

# 12. Product Gaps and Opportunities

## 12.1 Gap 1 — Correctness as a feature (highest priority)

**Gap:** No product in the market makes *data correctness* a visible, first-class capability. Everyone hides it.

**Opportunity:** a **Data Health** screen — the "C21" surface — that shows:
- sources connected and their freshness,
- transactions awaiting review,
- possible duplicates with one-tap merge,
- unmatched transfers,
- accounts whose balance disagrees with the ledger,
- stale valuations.

**Why it wins:** it converts the product's biggest hidden weakness into a visible strength. It is also the single best retention mechanic for the segment that churns ("I stopped trusting it").

**Effort:** medium. **Differentiation:** high. **Defensibility:** high (requires disciplined architecture, not a feature).

## 12.2 Gap 2 — Augmented balance, done properly for India

**Gap:** Fold has it; nobody else does. And Fold's version is not fully transparent.

**Opportunity:** a **"Available to spend"** number with a tap-to-expand breakdown:

```
Available to spend            ₹42,180
  Bank balances               ₹64,180
  − Credit card outstanding   ₹14,000
  − Card unbilled             ₹8,000
  − Upcoming bills (7 days)   ₹7,200
  + Expected income (7 days)  ₹7,200
  ────────────────────────────────────
  = ₹42,180   [How is this calculated?]
```

**Why it wins:** it answers the question users actually have, and the transparency answers the trust question competitors leave open.

## 12.3 Gap 3 — Statement import as a premium experience

**Gap:** Everyone treats statement import as a fallback. Nobody makes it good.

**Opportunity:** a best-in-class importer:
- drag/drop or share-sheet,
- password-protected PDF support,
- **preview with per-row confidence and a diff before commit**,
- learned column mapping per bank (remembered),
- "we added support for your format" feedback loop,
- dedupe preview ("3 of these 42 look like existing transactions").

**Why it wins:** it is the only legal, complete channel for credit cards in India (§7.4). Making it delightful is a moat.

## 12.4 Gap 4 — Budgeting that adapts to irregular income

**Gap:** YNAB's method assumes predictable income; India's gig/freelance/small-business segment is large.

**Opportunity:** an **income-adaptive budget**:
- if income varies, budget from a **baseline** (e.g. 3-month minimum) rather than last month's actual,
- surplus above baseline is auto-split (goal / buffer / free),
- a "lean month" mode that scales variable categories.

**Why it wins:** it serves a large underserved segment without abandoning envelope budgeting.

## 12.5 Gap 5 — The "what changed?" digest

**Gap:** Dashboards show state; nobody shows *change* well.

**Opportunity:** a weekly **Change Digest** — max 5 items:
- "Food delivery up 42% vs your 3-month average (+₹1,240)"
- "New recurring detected: ₹299/month from 14 Nov"
- "Electricity bill ₹340 higher than last month"
- "You're ₹1,800 short of your goal pace"
- "2 transactions need review"

**Why it wins:** it is the highest-value-per-second surface in the product, and it creates a reason to open the app weekly without nagging.

## 12.6 Gap 6 — Investment clarity for normal investors

**Gap:** Indian investors see *value* but not *performance*. Contribution vs return confusion is universal.

**Opportunity:** the C18 chart plus plain-language copy:
> "You put in ₹2,40,000. It is now ₹2,86,000. ₹46,000 of that is market gain (19.2% XIRR over 3 years). Nifty 50 returned 14.1%."

**Why it wins:** it is the single most requested clarification in investment apps, and it is cheap to compute once cash flows are modelled.

## 12.7 Gap 7 — Household money without a joint account

**Gap:** Monarch's owner model is good but US-shaped. Fold's Spaces are good but light.

**Opportunity:** **scoped visibility** — share a category or account with a partner (e.g. household expenses) without exposing personal spending. Roles: owner, contributor, viewer.

**Why it wins:** Indian households frequently pool some money and not all. This is a real, unmet need.

## 12.8 Gap 8 — Explainable intelligence

**Gap:** Copilot's ML is good but opaque. LLM assistants hallucinate numbers.

**Opportunity:** an intelligence layer with a hard rule: **the model never computes a number.** It only:
1. selects which pre-computed insight to show,
2. phrases it in natural language,
3. proposes an action that maps to a deterministic function.

Every insight card carries "Why am I seeing this?" → the rule, the data window, and the transactions.

**Why it wins:** it captures the benefit of AI without the trust failure mode.

## 12.9 Gap 9 — Slice (and similar wallets/SFB accounts) as first-class

**Gap:** no PFM treats a small-finance-bank / wallet account as a first-class citizen with its own lens.

**Opportunity:** exactly what the user asked for — a Slice tab, fed by the same ledger, with freshness and dedupe handled properly. Generalise it into a **"Connected Accounts"** module where any source can get a lens.

## 12.10 Gap 10 — Onboarding that produces value in 60 seconds

**Gap:** aggregator onboarding fails for users without eligible accounts; method onboarding is a lecture.

**Opportunity:** the "60-second first value" flow:
1. Currency (INR) — pre-filled.
2. One account name + opening balance.
3. One expense they made today.
4. → immediate insight: "You've spent ₹X today. Your top category is Y."

Then offer (never demand) connection.

## 12.11 Opportunity ranking

| # | Opportunity | User value | Effort | Differentiation | Priority |
|---|---|---|---|---|---|
| 1 | Data health / correctness | Very high | Medium | High | **Core** |
| 2 | Augmented balance | Very high | Low | High | **Core** |
| 3 | Review queue | High | Medium | Medium | **Core** |
| 4 | Statement import (great) | High | High | High | **Core** |
| 5 | Chart drill-down | High | Medium | Medium | **Core** |
| 6 | Recurring/subscriptions | High | Medium | Low | **Core** |
| 7 | Three-mode budgets | High | Medium | Medium | **Core** |
| 8 | Goals with pace | High | Low | Medium | **Core** |
| 9 | Slice lens | High (for this user) | Medium | High | **Core** |
| 10 | Change digest | High | Low | High | Advanced |
| 11 | XIRR performance | Medium | Medium | High | Advanced |
| 12 | Cash-flow forecast | Medium | High | Medium | Advanced |
| 13 | Household sharing | Medium | High | Medium | Advanced |
| 14 | Explainable AI insights | Medium | Medium | High | Advanced |
| 15 | AA aggregation | High | Very high + regulatory | Medium | Future |
| 16 | Bill pay | Medium | Very high + regulatory | Low | **Rejected** |

## 12.12 What "better than Fold" concretely means

Fold is the reference. To beat it we must be:

| Dimension | Fold | Us |
|---|---|---|
| Data channels | AA + Gmail | Manual + statement + SMS/notification + AA (future) |
| Card coverage | Email parsing | Statement import (authoritative) + email later |
| Budgeting | Light | Full three-mode engine |
| Analytics depth | Good | Drill-down + pace + forecasts |
| Trust | Privacy narrative | Privacy **plus** visible data health |
| Explainability | Limited | Every number explains itself |
| Slice | Not a focus | First-class lens |

We do not need to beat Fold on aggregation breadth on day one. We need to beat it on **depth and trust**, which do not require regulatory partnerships.

---
