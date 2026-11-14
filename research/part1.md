# FINANCIAL_SPACE_PRODUCT_RESEARCH.md

**Project:** Ultimate Personal Financial Intelligence Space
**Research date:** 14 November 2026
**Document status:** Research complete; ready to seed a technical specification
**Scope:** Competitive teardown, Indian financial infrastructure, Slice ingestion, behavioural evidence, analytics catalogue, and proposed product architecture

---

## 0. How to read this document

Every material claim carries one of four labels:

| Label | Meaning |
|---|---|
| **[V]** Verified | Stated in official documentation, a regulator publication, or a peer-reviewed paper that I read during this research. |
| **[C]** Claim | A vendor's own marketing statement, not independently verified as a working workflow. |
| **[A]** Assumption | My inference, clearly marked. Engineering must validate before building. |
| **[U]** Unknown | I could not verify it from a reliable public source. Do not treat as fact. |

Where a competitor feature could not be confirmed through help-centre documentation or a product walkthrough, it is marked **Partial** or **Unknown** in the matrix — never "supported" on the strength of a homepage sentence.

---

# 1. Executive Summary

## 1.1 The single most important finding

The market has split into two incompatible philosophies:

1. **Aggregation-first** (Monarch, Copilot, Fold, INDmoney): connect accounts, ingest everything, then help the user make sense of it. The product's value is *coverage and interpretation*.
2. **Method-first** (YNAB, Actual, Money Manager): the user assigns purpose to money, and the app enforces a discipline. The product's value is *behaviour change*.

Almost nobody does both well. Monarch and Copilot show you what happened; YNAB tells you what to do with the next rupee; Fold aggregates India but its budgeting is deliberately light. **The gap — and our opportunity — is an app that aggregates reliably, then converts the data into a small number of decisions, without forcing one budgeting ideology.**

## 1.2 Ten decisions this research supports

| # | Decision | Evidence base |
|---|---|---|
| D1 | **Local-first ledger, aggregation optional.** The product must be fully useful with zero bank connections. | Money Manager's 10M+ installs and Fold's own admission that card data and many institutions are unreliable (§4.6, §7.4) |
| D2 | **Transactions are the atomic unit; everything else is a view.** Budgets, goals, reports and insights are projections over one ledger. | Monarch Reports drill-down model; Copilot's single review queue |
| D3 | **One "review queue" for every inbound transaction**, whether imported or typed. | Copilot's To Review workflow (§4.3) |
| D4 | **Dual-entry correctness: transfers and card payments must never be counted as spending.** | Every teardown surfaced this as the top user complaint (§11.2) |
| D5 | **Budgets must support three modes** — none, category envelopes, and "spend up to" targets — and never require zero-based allocation. | YNAB's rigidity is its strength and its churn driver (§4.2, §11.2) |
| D6 | **India-first ingestion ladder:** manual → statement import → SMS/notification capture → AA (partnered). | Google Play permits SMS-based money management with declaration (§7.6); AA requires regulated FIU status (§7.3) |
| D7 | **A dedicated Slice tab is a first-class requirement, not a filter.** | User requirement; Slice has no personal-data API (§8) |
| D8 | **Insights must be actionable and finite** — max 3 cards per day, each with a one-tap action. | Behavioural evidence on cognitive load and scarcity (§9) |
| D9 | **Never shame.** No red "you failed" states, no loss-framed streaks that can be destroyed. | Loss aversion and scarcity research (§9.7, §9.8) |
| D10 | **Explain every number.** Tap any figure → see its formula and the transactions behind it. | Monarch's drill-down is its most-praised behaviour; opacity is the most common trust complaint (§11) |

## 1.3 Market context (India, 2026)

- UPI processed **25.47 billion transactions worth ₹31.53 lakh crore in October 2026**, a record, ~822 million transactions/day. **[V]** (NPCI data as reported; NPCI product statistics page.)
- The Account Aggregator framework is the only sanctioned rails for third-party bank-data access, and **only entities regulated by RBI, SEBI, IRDAI or PFRDA can be Financial Information Users (FIUs)**. **[V]** (RBI Master Directions; Sahamati.)
- **Credit cards are still not on the AA network** — Fold explicitly states this and reads card alert emails instead. **[V]** (Fold engineering blog, 11 April 2026.)
- DPDP Rules were **notified on 14 November 2025**, operationalising the DPDP Act 2023. Consent must be specific, informed and itemised. **[V]** (PIB, MeitY.)
- Therefore: a consumer app that is not a regulated entity **cannot** call AA directly. It must partner with an FIU, or operate on manual + statement + SMS/notification data. This is the central architectural constraint of the whole product.

## 1.4 What "good" looks like

A user should be able to answer, in under 15 seconds and without navigating:

1. How much can I actually spend right now? *(augmented balance — Fold's best idea)*
2. What is coming that I have not paid for yet? *(committed outflow)*
3. Am I ahead or behind on the thing I said mattered? *(one goal, one pace number)*
4. What changed this week that I did not expect? *(anomaly, not a chart)*

Everything else is depth, not default.

---

# 2. Research Methodology

## 2.1 What was actually examined

| Source class | Used for | Examples |
|---|---|---|
| Official help centres | Real workflows, screen inventory, limitations | `help.monarchmoney.com`, `support.ynab.com`, `help.copilot.money`, `help.realbyteapps.com`, `help.fold.money` |
| Official engineering/product blogs | Technical constraints, design rationale | Fold's credit-card ingestion post (Apr 2026) |
| Regulator publications | AA framework, FIU eligibility, NBFC-AA Directions 2025, DPDP Rules 2025 | RBI Master Directions, PIB, DFS |
| Platform policy | What an app is permitted to do on Android | Google Play SMS/Call Log permissions policy |
| Market data | UPI scale, bill-payment rails | NPCI product statistics, Bharat Connect |
| Peer-reviewed literature | Behavioural design | Gollwitzer & Sheeran (2006), Lally et al. (2010), Ashraf/Karlan/Yin (2006), Thaler & Benarzi (2004), Thaler (1999) |
| Community discussion | Real pain points | r/foldmoney, r/ynab, Play Store reviews (anecdotal, labelled as such) |

## 2.2 What was deliberately *not* done

- No reverse-engineering of competitors' apps or APIs.
- No inference that a marketing screenshot proves a working feature.
- No invented awards, rankings, user counts, or prices.
- No claim that a developer API can read a personal Slice account (it cannot, as far as public documentation shows — §8).

## 2.3 Verification protocol

For each app: (a) find the official help article for the feature, (b) check whether the article describes an actual user flow, (c) if only marketing copy exists, mark **[C]** and downgrade the matrix cell to **Partial/Unknown**.

## 2.4 Known research gaps

| Gap | Impact |
|---|---|
| No hands-on trial accounts for Monarch, Copilot, YNAB, Fold | Interaction micro-detail (animation, empty states) is partly inferred from help articles and reviews |
| Pricing not recorded (region-dependent, changes frequently) | Commercial comparison omitted deliberately |
| Fold's in-app screens not directly observed | Screen-level claims limited to documented flows |
| Slice statement file format not observed | Parsing spec is a design proposal, not a verified format (§8.5) |
| Indian AA production statistics per FIU not public at this granularity | Adoption risk assessed qualitatively |

---

# 3. Competitive Landscape

## 3.1 Positioning map

```
                     HIGH BEHAVIOURAL PRESSURE
                                │
                    YNAB ●      │
                                │      ● Actual Budget
        (method-first)          │
                                │
   LOW AGGREGATION ─────────────┼───────────── HIGH AGGREGATION
                                │
             Money Manager ●    │   ● Monarch
                                │   ● Copilot
                                │   ● Fold
                                │   ● INDmoney
                                │
                     LOW BEHAVIOURAL PRESSURE
```

The top-right quadrant (aggregation **and** behaviour) is nearly empty. That is where this product belongs.

## 3.2 Applications included and why

| App | Market | Why it is in scope | Depth of this teardown |
|---|---|---|---|
| **Monarch Money** | US | Best-in-class reports and drill-down; household model | Deep |
| **YNAB** | Global | The strongest budgeting *method*; targets, loan payoff, age of money | Deep |
| **Copilot Money** | US | Best transaction-review UX and ML assistance | Deep |
| **Fold Money** | India | The reference implementation of AA-first PFM in India | Deep |
| **Axio (ex-Walnut)** | India | The SMS-parsing archetype; cautionary tale of monetisation drift | Medium |
| **Money Manager (Realbyte)** | Global | Proof that manual bookkeeping still wins at scale | Medium |
| **INDmoney** | India | Net-worth-first aggregation + family accounts | Medium |
| **Actual Budget** | Global | Local-first, open-source envelope budgeting — architectural reference | Light |
| **Lunch Money** | Global | Indie multi-currency + crypto + API-first design | Light |
| **PocketSmith** | Global | Long-range cash-flow forecasting (10+ years) | Light |
| **Kubera** | Global | Manual-first net worth with exotic assets | Light |
| **Empower** | US | Free investment/net-worth dashboard at scale | Light |
| **Sharesight** | Global | Investment performance, dividends, tax lots | Light |
| **CRED / Fi / Jupiter** | India | Distribution and card-bill UX, not PFM depth | Light (context only) |

Apps deliberately excluded: Mint (discontinued), Walnut as a separate product (merged into Axio), generic "expense tracker #47" Play Store apps, and crypto-only portfolio apps.

## 3.3 The structural lesson from each archetype

| Archetype | Wins because | Fails because |
|---|---|---|
| Aggregator (Monarch, Copilot, Fold) | Zero-effort data capture; instant "wow" on first open | Breaks silently when a connection fails; user loses trust in *all* numbers |
| Method (YNAB) | Changes behaviour; users report real savings | High cognitive load; punishes irregular income; churns users who fall behind |
| Manual (Money Manager) | Total accuracy, total privacy, zero dependencies | Entry fatigue; data dies with the phone |
| Super-app (INDmoney, CRED) | Distribution and adjacent revenue | PFM is a funnel, not a product; depth suffers |

**Design consequence:** build the manual ledger as the source of truth, treat aggregation as an accelerator, and make the method optional.

---

# 4. Individual Application Teardowns

## 4.1 Monarch Money

### Positioning
Premium household PFM: accounts, transactions, budgets, goals, investments, net worth, reports. Web + iOS + Android. Paid subscription, no free tier (as of 2026). **[C]**

### Architecture as observable
- Account-centric: everything hangs off connected accounts and their balances.
- Categories belong to **groups**; transactions can carry **tags**, **owners**, and **business entities**.
- Reports are a first-class surface with three tabs: **Cash Flow, Spending, Income**. **[V]**
- Business features add Profit & Loss and tax-prep views. **[V]**

### Reports experience (the part worth copying)

**[V]** From the official "Using Reports" article (last updated 21 Sep 2026):

| Element | Detail |
|---|---|
| Chart types | **Sankey** (cash flow only), **Trend Bars** (stacked/grouped), **Pie** (donut), **Breakdown** (ranked horizontal bars), **Treemap** (Spending/Income), **Profit & Loss** (business) |
| Grouping | Category, Category group, Merchant; plus Owner / Business entity / **Fixed vs Flexible** |
| Summary card | Total income, total spending, net cash flow, **savings rate** |
| Drill-down | Click a bar/slice/block → filters the page to the transactions behind it; click a trend bar → filters to that period |
| Filters | Date range, accounts, categories, merchants, goals, ownership, business entities, amounts, tags |
| Saved reports | Save chart type + grouping + filters + timeframe; create/rename on web, view-only on mobile |
| Export | Chart as PNG; transactions as CSV on web only |
| Time ranges | Daily → weekly → monthly → quarterly → yearly → all-time; presets Last 7/14/30/60 days, This/Last month, This/Last year, Last 12 months, All time |

**Why the Sankey works:** it answers "where did my salary actually go?" in one image, and every ribbon is clickable. It is the single most-copied screen in modern PFM, and for good reason.

**What is weak:** filters persist across sessions and silently truncate data — Monarch's own troubleshooting article leads with "check the date range first". **[V]** This is a trust bug disguised as a feature. Our product should always show an explicit, visible scope chip ("Showing: Oct 2026 · All accounts").

### Other verified behaviours

- **Monthly Progress Report** with a fixed narrative order: income vs planned, top income categories, top expense categories, cash-flow trend (last 4 months), net worth, asset balances, asset breakdown, liability balances, liability breakdown. **[V]**
- Accounts can be excluded from reports or from net worth independently. **[V]**
- Transactions can be hidden from reports individually. **[V]**
- Credit score and credit-utilization tracking exist as separate surfaces. **[V]**

### Strengths
1. Reports → transactions drill-down is the best in the category.
2. Household/owner model handles real families.
3. Saved reports turn analysis into a repeatable ritual.
4. Fixed vs Flexible grouping is a genuinely useful lens.

### Weaknesses
1. Silent filter persistence.
2. Report creation is web-only.
3. Aggregation dependency: a broken connection undermines every number.
4. No behavioural layer — it informs but does not coach.

### What we take
Sankey + breakdown + drill-down + saved views + savings rate + fixed/flexible grouping. **Not** the hidden filter state.

---

## 4.2 YNAB

### Positioning
A budgeting *method* with software attached. Four Rules. Zero-based envelope budgeting. Paid subscription. **[V]**

### The method (as the company states it)
1. **Give every dollar a job.**
2. **Embrace your true expenses** (annual/irregular costs broken into monthly amounts).
3. **Roll with the punches** (move money between categories instead of quitting).
4. **Age your money** (spend money that is at least ~30 days old). **[V]**

The fourth rule produces **Age of Money**, a calculated metric: how long money sits between being received and being spent. The company's stated target is ~30 days ("living on last month's money"). **[V]**

### Targets — the most transferable mechanic

**[V]** YNAB has four target periods and multiple behaviours:

| Period | Behaviours | Typical use |
|---|---|---|
| Weekly | Set aside another / Refill up to | Childcare, groceries, dining |
| Monthly | Set aside another / Refill up to | Rent, utilities, investments |
| Yearly | Set aside another / Refill up to (with a "By" date) | Insurance, taxes, gifts |
| Custom | Set aside / Fill up to / **Have a balance of** (with a due date, optional repeat) | Vacations, down payment, car insurance every 6 months |

The critical distinction is **"set aside another"** (builds a balance over time, ignores spending) versus **"refill up to"** (tops the category back up after spending). This single design choice removes most of the ambiguity in consumer budgeting apps.

**"Have a balance of"** is the cleanest savings-goal primitive in the market: target a balance by a date, never spend from it, no repeat.

### Debt and loans

**[V]** YNAB models loans as **loan accounts** paired with a category, and offers a **Debt Payment target** where you choose a payoff date and YNAB calculates the required monthly payment. Credit-card payment categories are paired accounts with their own target types.

### Strengths
1. A coherent philosophy — the app teaches a mental model, not a feature list.
2. Targets encode *intent* and survive month boundaries.
3. True-expenses handling is genuinely superior for irregular costs.
4. Roll-with-the-punches framing removes shame from overspending.

### Weaknesses
1. Zero-based allocation is non-negotiable; irregular income users struggle.
2. Steep learning curve; the first two weeks are confusing by design.
3. No meaningful investment or net-worth depth.
4. No Indian bank connectivity; manual entry only.
5. Users who fall behind often churn rather than recover (recurring theme in r/ynab).

### What we take
Target semantics (set aside vs refill vs have-a-balance), true-expense smoothing, and the "move money, don't panic" recovery flow. **Not** mandatory zero-based budgeting.

---

## 4.3 Copilot Money

### Positioning
Design-led US PFM for iOS/Mac/Web, built on Plaid aggregation, with ML categorisation. Paid, single tier. **[C]**

### Onboarding (verified flow)
**[V]** Connect accounts first → choose subscription → land in Categories → review transactions → create Recurrings → create Goals. Copilot explicitly states it **does not correlate budget with income**, so there is no "set your income" step. Initial budgets are derived from historic spend and can be edited per month.

### The review queue — best-in-class
**[V]**
- New transactions land in a **To Review** section on the Dashboard.
- After roughly **30 reviewed transactions**, "Copilot Intelligence" begins suggesting transaction *type* and category.
- Suggestions improve with review volume.
- **Name Rules** auto-categorise future transactions by merchant string.
- Bulk multi-select with running totals and bulk actions on iOS.

This is the correct psychological design: the app earns the right to automate by first watching the user decide.

### Recurrings
**[V]** Copilot detects likely recurring transactions during onboarding, presents them for confirmation, organises them into a monthly view, and **excludes Recurring expenses from the dashboard spending chart** so the chart reflects discretionary spend. Each Recurring has filters that must be tuned, or matching drifts.

That "exclude committed spend from the discretionary chart" decision is subtle and excellent — it is the difference between a chart that reassures and one that scares.

### Other verified capability
- Rollovers, category groups, exclude-from-budget, emoji/colour per category. **[V]**
- Savings Goals: create from scratch or link bank balances/transactions; monthly tracking; spend-from-goal when reached. **[V]**
- Investments with live balance estimates; real-estate accounts via Zillow/RentCast; Amazon and Venmo integrations; widgets. **[V]**
- Dashboard: new transactions, trending budget categories, upcoming Recurrings, net income. **[V]**
- Month in Review / Year in Review reports; transaction filters by account, category, date, recurring, review status, tag, type. **[V]**

### Strengths
1. Review queue + progressive ML is the best onboarding-to-automation ramp.
2. Design quality drives trust.
3. Committed-vs-discretionary separation in the dashboard.
4. Recurrings as a first-class object, not a report.

### Weaknesses
1. US-only; Plaid-dependent.
2. No Android.
3. Single-tier pricing, no free path.
4. Intelligence is opaque — users cannot see why a suggestion was made.

### What we take
The review queue, the "earn automation" rule, committed-vs-discretionary separation, and Recurrings-as-objects. We should add **explainability** ("matched 'SWIGGY*ORDER' 14 times").

---

## 4.4 Fold Money (India) — highest-priority reference

### Positioning
India-first PFM built on the RBI Account Aggregator framework; explicitly **not** a payments app. iOS + Android + web widgets. Freemium (Lite / Plus). **[V]**

### What it actually does
**[V]** from the FAQ (updated October 2026) and the engineering blog:

| Capability | Mechanism | Status |
|---|---|---|
| Bank accounts | AA (consent-based) | Supported |
| UPI transactions | Via bank data (AA), not a UPI API | Supported |
| Credit cards | **Gmail alert/statement parsing** (23 issuers) because cards are not on AA | Supported |
| Mutual funds, stocks/ETFs | Aggregation | Supported |
| EPF, NPS | Aggregation | Supported |
| PPF, FD | Tracked (mechanism not fully documented publicly) | Partial/Unknown |
| Loans | Tracked; CIBIL report on Plus | Supported |
| Credit score | CIBIL, no score impact | Supported |
| Insurance | Health insurance tracking | Supported |
| Net worth | Computed across the above | Supported |
| Family | "Spaces" — shared household view with scoped visibility | Supported |
| Subscriptions & EMIs | Tracked | Supported |
| Bill payment | Credit-card bills via **Bharat Connect (BBPC/UPI)**, linked back to the card | Supported |
| AI | Assistant + MCP connector | Supported **[C]** |

### The three best ideas in Fold

**1. Augmented balance. [V]**
Bank balance minus outstanding card dues (optionally minus upcoming recurring dues) = the number you can actually spend. Fold reports that this changes user decisions. This is the single most valuable home-screen number in Indian PFM, because India's card usage is growing and the bank balance lies.

**2. Real-time card notification. [V]**
Because issuer emails arrive within seconds, Fold notifies on card spend immediately — "the closest thing to watching notes leave your wallet". It also surfaces fraud early.

**3. Cards in the same timeline as bank transactions. [V]**
Card spends count toward the same cash flow and spending summary. No silo.

### Documented limitations (critical for our design)
- **Cards are not on AA.** Any product claiming otherwise is wrong. **[V]**
- AA refresh is **daily** by default; manual refresh exists but is not real-time. **[V]**
- **SBI integration is widely reported as unreliable** in r/foldmoney; users see balance updates without transactions. **[Anecdotal]**
- Missing/duplicated transactions are a recurring community complaint. **[Anecdotal]**
- Email parsing is fragile by nature: issuer format changes, multiple inboxes, add-on cards (Fold added multi-inbox and a Cards tab in Oct 2026 in response). **[V]**

### Strengths
1. Correct regulatory posture — AA-first, consent-based, not a payment app.
2. Augmented balance.
3. Real-time card capture without AA.
4. Household Spaces.
5. Privacy-by-design narrative that Indian users actually repeat.

### Weaknesses
1. Aggregation fragility is visible to users.
2. Budgeting is light relative to YNAB/Monarch.
3. Card capture depends on Gmail access — a hard sell for privacy-conscious users.
4. Paid tier gates the most useful analytics (CIBIL, multi-inbox).

### What we take
Augmented balance, real-time card notification, unified timeline, household Spaces. **And** the humility to design for "sync failed" as a normal state, not an error.

---

## 4.5 Axio (formerly Walnut)

### History
Walnut pioneered SMS-based expense tracking in India: read bank SMS, extract debit/credit, auto-categorise, remind about bills. It rebranded to **Axio**, operated by CapFloat Financial Services (an RBI-registered NBFC), and pivoted toward credit — pay-later, EMIs, personal loans. **[V]** (multiple independent sources and the Play listing.)

### Current capability
- SMS-based expense capture remains the core tracking mechanism. **[V]**
- Budgets, daily/monthly summaries, bill reminders. **[C]**
- Credit products now dominate the product surface. **[V]**

### What the reviews reveal (anecdotal, but consistent)
- Bank SMS not detected after issuer format changes. **[Anecdotal]**
- Duplicate credit-card spends and bill payments. **[Anecdotal]**
- Manual correction burden undermines the automation promise. **[Anecdotal]**

### Lesson
SMS parsing is a **fragile dependency**, not a foundation. It must be one ingestion channel among several, with visible provenance and easy correction. It is also a monetisation temptation: once the tracker is free, the business model drifts toward lending, and the tracker degrades.

---

## 4.6 Money Manager (Realbyte)

### Positioning
Manual double-entry-style bookkeeping. 10M+ Android installs, 460K+ reviews, ~4.6 rating. Free with ads / paid remove-ads. **[V]** (Play listing.)

### Verified workflow
**[V]** (official help centre):
- **Home tab** with Calendar / Weekly / Monthly / Summary views; income, expense and balance shown per period.
- **Transfers** between accounts are a distinct record type (this is the crucial correctness feature).
- **Recurring schedules and instalments** (automatic transfer + frequency).
- **Bookmarks** for frequent transactions (fast repeat entry).
- **Budgets** with an optional **carry-over** feature.
- **Stats tab** with category breakdowns and month-to-month change.
- **Excel export**; PC access over Wi-Fi for editing and sorting.
- Sub-category on/off, custom starting date of month, built-in calculator.

### Why manual still wins
1. **Accuracy and completeness** — no missing accounts, no broken sync.
2. **Privacy** — nothing leaves the device.
3. **Cash and informal economy** — a large share of Indian spending is still cash or peer-to-peer and never appears in a clean bank feed.
4. **Zero onboarding friction** — no credentials, no consent screens.

### Weaknesses
1. Entry fatigue; users abandon after weeks.
2. No insight layer — data in, tables out.
3. No investment/net-worth depth.
4. Backup is manual.

### What we take
Transfers as a first-class type, calendar view, bookmarks/quick-repeat, carry-over budgets, and the discipline of a ledger that balances. **Plus** the insight layer Money Manager lacks.

---

## 4.7 Additional products worth studying (brief)

| Product | Distinctive idea worth borrowing | Verification |
|---|---|---|
| **INDmoney** (India) | Net-worth-first home screen; family accounts; EPF/NPS/US stocks/MF in one net-worth number | **[C]**, corroborated by independent reviews |
| **Actual Budget** | Local-first sync architecture, CRDT-style multi-device, envelope budgeting, open source | **[V]** (project docs) |
| **Lunch Money** | Multi-currency + crypto in one ledger; public API; review workflow | **[C]** |
| **PocketSmith** | Long-range forecasting (multi-year), scenario planning, "what if I..." | **[C]** |
| **Kubera** | Manual-first net worth including jewellery, property, private assets; no bank login required | **[C]** |
| **Empower** | Free investment dashboard; retirement planner; fee analyser | **[C]** |
| **Sharesight** | True investment performance: dividends, splits, tax lots, benchmark comparison | **[C]** |
| **CRED / Fi / Jupiter** | Card-bill and rewards UX; UPI-native onboarding | **[C]** |

**Note:** for these seven, only the *idea* is imported; no workflow claims are made in the matrix beyond "Partial/Unknown".

---

# 5. Screen-by-Screen UX Analysis

This section compares how the leading products solve each screen, then states the design position for our Financial Space.

## 5.1 Onboarding

| App | First screen | Connection demand | Manual path | Empty state |
|---|---|---|---|---|
| Monarch | Value prop → create account → connect institutions | Required for value | Possible but degraded | Guided "add account" |
| Copilot | Connect accounts via Plaid → paywall → Categories | Required | Weak | "To Review" seeded from history |
| YNAB | Method explainer → create budget → assign | None | Only path | "Ready to Assign" prompt |
| Fold | AA consent explainer → select bank → consent artefact | Required for aggregation | Limited | Bank-connect prompt |
| Money Manager | Immediate ledger | None | Only path | Blank calendar + "+" |
| Axio | SMS permission → scan | SMS permission | Yes | Auto-populated |

### What the best do
- **Copilot** turns onboarding into a *task with a finish line* ("review these 12 transactions"), which teaches the product while producing value.
- **YNAB** sells the philosophy before the interface; users who understand Rule 1 tolerate the complexity.
- **Fold** explains AA consent in human language before the OS-level consent screen, which materially improves completion.

### Our position
1. **Two doors, equal dignity:** "Connect accounts (beta)" and "Start manually — 60 seconds".
2. Manual door asks exactly three questions: currency (INR default), first account name, one thing you spend on.
3. The first session ends with **one logged transaction**, not a tour.
4. Connection is framed as *"we'll fill in what you'd otherwise type"*, never as a requirement.
5. Consent screens show: what is read, from where, for how long, how to revoke.

## 5.2 Financial dashboard

| App | Above-the-fold content | Charts | Customisable |
|---|---|---|---|
| Monarch | Net worth, accounts, cash flow, budget snapshot | Line/area, bar, Sankey (in Reports) | Widgets yes |
| Copilot | To Review, upcoming Recurrings, net income, trending categories | Line, bar, progress | Limited |
| YNAB | Ready to Assign, category balances | Minimal (progress bars) | No |
| Fold | Augmented balance, accounts, spend, cards | Donut, bars | Limited |
| Money Manager | Period income/expense/balance | Simple bars | No |

### Our position — the "four numbers" home
```
┌──────────────────────────────────────────┐
│  Available to spend        ₹42,180       │  ← augmented balance
│  bank ₹64,180 − cards ₹22,000            │
├──────────────────────────────────────────┤
│  Committed this month      ₹18,400       │  ← rent + EMIs + subscriptions
│  of which unpaid: ₹7,200 by 22 Nov       │
├──────────────────────────────────────────┤
│  This month    in ₹85,000  out ₹52,300   │
│  saved ₹32,700 (38%)   ▲ 4% vs Oct       │
├──────────────────────────────────────────┤
│  1 goal · Emergency fund   ₹1.2L / ₹3L   │
│  ▓▓▓▓▓░░░░░  8 months ahead of pace      │
└──────────────────────────────────────────┘
   Needs attention (2)
   • 3 subscriptions increased this month
   • Food delivery up 42% vs your 3-month avg
```
Rules:
- Maximum four hero numbers; everything else scrolls.
- Every number is tappable → formula + transactions.
- No chart above the fold on first open; charts are a destination, not decoration.
- "Needs attention" is capped at 3 items and each has a verb.

## 5.3 Transaction management

| Capability | Monarch | Copilot | YNAB | Fold | Money Manager | Our target |
|---|---|---|---|---|---|---|
| Row content | Merchant, category, account, amount, date | + review state, tags | Payee, category, outflow/inflow | Merchant (cleaned), account/card, amount | Category, amount, memo | Merchant + cleaned name, account, category chip, amount, status |
| Debit/credit distinction | Signed, colour | Signed | Separate columns | Signed | Separate | Signed + explicit type icon |
| Edit | Yes | Yes | Yes | Yes | Yes | Yes, with audit trail |
| Split | Yes | Yes | Yes | Unknown | Partial | **Yes** |
| Tags | Yes | Yes | No (flags) | Unknown | Memo only | Yes |
| Notes | Yes | Yes | Memo | Yes | Memo | Yes |
| Transfers | Yes | Yes | Yes (paired) | Yes | Yes (first-class) | **Yes, first-class** |
| Refunds | Yes (as inflow) | Yes | Yes | Yes | Yes | **Link refund to original** |
| Duplicates | Flagged | Detected | Manual | Reported issue | Manual | **Automatic with merge UI** |
| Filters | Extensive | Extensive | Moderate | Moderate | Basic | Saved filter chips |
| Review workflow | Light | **Strong** | N/A | Light | None | **Strong** |

### Design position
- **One inbox:** imported, SMS-captured and manually added transactions all land in the same review queue.
- **Provenance is visible:** each row shows a small source marker (bank, card-email, SMS, manual).
- **Correction teaches:** renaming a merchant offers "always rename this" (Copilot's Name Rules).
- **Refund pairing:** selecting a credit and a debit of similar amount suggests a link; linked pairs net to zero in spending analytics.
- **Duplicate merge:** when two sources report the same payment, show both with a "same transaction?" prompt, and remember the decision per source pair.

## 5.4 Budgeting

| App | Model | Period | Rollover | Overspend treatment |
|---|---|---|---|---|
| YNAB | Zero-based envelopes | Monthly (weekly/yearly targets) | Yes, by design | Move money from another category |
| Monarch | Category budgets | Monthly | Optional | Highlight + carry |
| Copilot | Category budgets | Monthly | Optional toggle | Highlight; exclude from chart |
| Fold | Light budgets | Monthly | Unknown | Summary only |
| Money Manager | Category budgets | Monthly | Optional carry-over | Highlight |

### Our position — three modes, chosen per category
1. **None** (track only).
2. **Envelope** (assign ₹X; unspent rolls over; overspend borrows from a named category).
3. **Cap** ("spend up to ₹X"; resets monthly; no rollover).

Plus a **forecast** line: "at this pace you will finish at ₹18,200 (₹2,200 over)".

This avoids YNAB's ideological lock-in while preserving its best mechanic.

## 5.5 Financial goals

| App | Goal types | Account-linked | Deadline | Monthly contribution | Projection |
|---|---|---|---|---|---|
| Monarch | Savings goals | Yes | Yes | Yes | Yes |
| Copilot | Savings goals | Yes (balances/transactions) | Yes | Yes | Partial |
| YNAB | Category targets ("have a balance of") | Paired accounts | Yes | Calculated | Implicit |
| Fold | Savings goals | Partial | Unknown | Unknown | Unknown |

### Our position
Goal = **amount + date + funding source + priority**. The app computes:
- required monthly contribution,
- projected completion at current pace,
- "what it costs you per day" (₹164/day),
- conflict detection: "this goal and your Emergency Fund cannot both be met at current income".

Debt goals use the same object with `direction = payoff` and an interest rate, producing a payoff date.

## 5.6 Accounts and net worth

| App | Assets | Liabilities | History | Manual assets |
|---|---|---|---|---|
| Monarch | Yes | Yes | Snapshots | Yes |
| Copilot | Yes | Yes | Snapshots | Yes (incl. real estate) |
| Fold | Yes | Yes | Yes | Limited |
| INDmoney | Yes | Yes | Yes | Yes |
| Money Manager | Yes (accounts) | Partial | Balance history | Yes |

### Our position
- Accounts have **type** (bank / cash / wallet / credit card / loan / investment / other asset), **currency**, **opening balance**, and **balance mode** (derived from transactions vs manually valued).
- **Net worth = Σ assets − Σ liabilities**, with a monthly snapshot table so history survives edits.
- **Augmented balance** is a derived, explainable figure — never a stored one.
- Manual assets (gold, property, PF) are first-class, with an optional "revalue monthly" reminder.

## 5.7 Analytics and reports

Covered exhaustively in §10 (chart catalogue). The UX rules:

1. **Every chart is a question**, titled as a question ("Where did my money go?").
2. **Every chart drills down** to transactions.
3. **Scope is always visible** (date range, accounts, filters) in a single chip row.
4. **Max two charts per screen** on mobile.
5. **No chart without a decision** attached.

## 5.8 Recurring expenses and bills

| App | Detection | Upcoming view | Amount-change detection | Missed payment |
|---|---|---|---|---|
| Copilot | Strong (onboarding + filters) | Yes ("Upcoming") | Partial | Partial |
| Monarch | Yes | Yes | Yes | Yes |
| Fold | Yes (subscriptions/EMIs) | Yes | Unknown | Unknown |
| YNAB | Manual (scheduled transactions) | Yes | No | Yes |
| Money Manager | Manual recurring | Yes | No | Partial |

### Our position
A **Recurring** object with: merchant pattern, expected amount (with tolerance), cadence, next due date, account, category, auto-pay flag, and **price-change history**. Three derived states: `due soon`, `paid`, `missed`. Missed ≠ overdue-by-one-day; it means "expected date passed and no matching transaction within tolerance".

## 5.9 Investments

| App | Holdings | Performance | Benchmarks | Manual entry |
|---|---|---|---|---|
| Monarch | Yes | Yes | Partial | Yes |
| Copilot | Yes | Yes | Partial | Yes |
| Fold | Yes | Yes | Unknown | Partial |
| INDmoney | Yes | Yes | Yes | Yes |
| Sharesight | Yes | **Best-in-class** | Yes | Yes |

### Our position (v1 deliberately narrow)
- Holdings: symbol/name, type (equity/MF/ETF/FD/gold/PPF/NPS/crypto), units, cost basis, current value.
- **Performance separates contributions from returns** — the single most common investor confusion.
- XIRR for Indian instruments (SIPs make simple returns meaningless).
- Benchmark: Nifty 50 / user-chosen index.
- Manual valuation is acceptable in v1; price feeds come later.

## 5.10 Settings and customisation

| Capability | Best example | Our position |
|---|---|---|
| Categories | Monarch/Copilot (emoji, colour, groups) | Emoji + colour + group + archive |
| Rules | Copilot Name Rules | Merchant → category/rename rules, with match preview |
| Tags | Monarch | Free-form, reusable, filterable |
| Currency | Lunch Money (multi) | INR default; multi-currency later |
| Import/export | Money Manager (Excel), Monarch (CSV) | CSV + JSON backup, always available |
| Privacy | Fold (privacy-by-design) | On-device by default; explicit sync opt-in |
| Dashboard customisation | Monarch widgets | Space tiles + pinned cards |

---
