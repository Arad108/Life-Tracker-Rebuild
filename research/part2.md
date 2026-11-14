# 6. Feature Comparison Matrix

## 6.1 How to read the matrix

Status labels:

| Label | Meaning |
|---|---|
| **Full** | A documented workflow exists and I could trace it end-to-end in official help content. |
| **Partial** | The capability exists but is constrained (subset of accounts, web-only, manual only, unreliable per user reports). |
| **None** | Not offered. |
| **?** | Unknown / not verified. The vendor may offer it; I could not confirm a working workflow. |
| **N/A** | Not meaningful for that product's market or model. |

A cell is only **Full** where an official help article described the *flow*, not merely the outcome. Where a homepage sentence was the only evidence, the cell is **Partial** or **?**.

## 6.2 Master matrix

Legend columns: MO = Monarch, YN = YNAB, CO = Copilot, FD = Fold, AX = Axio, MM = Money Manager, IN = INDmoney.

| # | Feature | MO | YN | CO | FD | AX | MM | IN | Best-in-class note |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Unified dashboard | Full | Partial | Full | Full | Partial | Partial | Full | Monarch/Copilot |
| 2 | Manual transaction entry | Full | Full | Partial | Partial | Partial | Full | ? | Money Manager |
| 3 | Automatic transaction ingestion | Full | None | Full | Full | Partial | None | Full | Fold (AA + email) |
| 4 | Multiple accounts | Full | Full | Full | Full | Partial | Full | Full | all |
| 5 | Category management | Full | Full | Full | Full | Partial | Full | Partial | Copilot |
| 6 | Category groups | Full | Full | Full | ? | ? | Partial | ? | Monarch |
| 7 | Transaction splitting | Full | Full | Full | ? | ? | Partial | ? | Monarch |
| 8 | Transaction rules / auto-categorise | Full | Partial | Full | Partial | Partial | None | ? | Copilot (Name Rules) |
| 9 | Internal transfers (first-class) | Full | Full | Full | Full | Partial | Full | ? | Money Manager |
| 10 | Refund / return handling | Full | Full | Full | Partial | ? | Partial | ? | — |
| 11 | Duplicate detection & merge | Partial | None | Partial | Partial | ? | None | ? | nobody does this well |
| 12 | Budgeting | Full | Full | Full | Partial | Partial | Full | Partial | YNAB (method), Monarch (flexibility) |
| 13 | Budget rollovers | Full | Full | Full | ? | ? | Full | ? | — |
| 14 | Multiple budget periods | Partial | Full | Partial | ? | ? | Partial | ? | YNAB |
| 15 | Savings goals | Full | Full | Full | Partial | ? | Partial | Partial | Copilot/Monarch |
| 16 | Goal → account linking | Full | Full | Full | Partial | ? | None | ? | — |
| 17 | Goal projection / pace | Full | Partial | Partial | ? | ? | None | ? | Monarch |
| 18 | Debt / loan management | Full | Full | Partial | Partial | Partial | Partial | Partial | YNAB (payoff target) |
| 19 | Loan payoff calculator | Partial | Full | ? | ? | ? | None | ? | YNAB |
| 20 | Net worth tracking | Full | None | Full | Full | None | Partial | Full | INDmoney (breadth) |
| 21 | Net worth history | Full | None | Full | Full | None | Partial | Full | — |
| 22 | Manual / exotic assets | Full | None | Full | Partial | None | Partial | Full | Kubera (not in matrix) |
| 23 | Liability tracking | Full | Full | Full | Full | Partial | Partial | Full | — |
| 24 | Investment holdings | Full | None | Full | Full | None | Partial | Full | Sharesight (not in matrix) |
| 25 | Investment performance (TWR/XIRR) | Partial | None | Partial | Partial | None | None | Full | INDmoney / Sharesight |
| 26 | Benchmark comparison | Partial | None | Partial | ? | None | None | Partial | Sharesight |
| 27 | Recurring payments | Full | Full | Full | Full | Partial | Full | Partial | Copilot |
| 28 | Subscription detection | Full | Partial | Full | Full | Partial | None | Partial | Copilot |
| 29 | Upcoming bills calendar | Full | Full | Full | Full | Partial | Full | Partial | — |
| 30 | Cash flow view | Full | Partial | Full | Full | Partial | Partial | Partial | Monarch |
| 31 | Spending analytics | Full | Partial | Full | Full | Partial | Full | Partial | Monarch |
| 32 | Income analytics | Full | Partial | Full | Partial | ? | Partial | Partial | Monarch |
| 33 | Fixed vs flexible split | Full | Partial | Partial | ? | ? | None | ? | Monarch |
| 34 | Merchant-level analytics | Full | None | Full | Partial | ? | Partial | ? | Monarch |
| 35 | Financial projections / forecast | Partial | Partial | Partial | ? | None | None | ? | PocketSmith (not in matrix) |
| 36 | Reports with saved views | Full | None | Partial | Partial | ? | Partial | Partial | Monarch |
| 37 | Chart → transaction drill-down | Full | None | Partial | Partial | ? | Partial | Partial | Monarch |
| 38 | Data export | Full | Full | Partial | Partial | ? | Full | Partial | Money Manager |
| 39 | Customisable dashboard | Full | None | Partial | Partial | None | None | Partial | Monarch |
| 40 | Financial insights / coaching | Partial | Partial | Full | Partial | Partial | None | Partial | Copilot |
| 41 | AI assistant | Partial | None | Partial | Partial | None | None | Partial | Fold (MCP) **[C]** |
| 42 | Account aggregation | Full | None | Full | Full | Partial | None | Full | Fold (India) |
| 43 | India-specific support (INR, AA, UPI) | None | None | None | Full | Full | Partial | Full | Fold |
| 44 | SMS-based capture | None | None | None | None | Full | None | ? | Axio (historically) |
| 45 | Email / statement parsing | None | None | Partial | Full | ? | None | ? | Fold |
| 46 | Credit score tracking | Full | None | None | Full | Partial | None | Full | — |
| 47 | Household / shared finance | Full | Partial | None | Full | None | None | Partial | Monarch, Fold |
| 48 | Offline-first operation | None | Partial | None | None | None | Full | None | Money Manager |
| 49 | On-device privacy posture | None | Partial | Partial | Partial | Partial | Full | None | Money Manager |
| 50 | Multi-currency | Partial | Partial | Partial | None | None | Partial | Partial | Lunch Money (not in matrix) |

## 6.3 What the matrix reveals

**Cluster 1 — nobody owns correctness.** Rows 9–11 (transfers, refunds, duplicates) are where every product loses user trust, and no product is strong across all three. This is the highest-leverage differentiator available to us, and it is unglamorous. A product that *never double-counts* a credit-card bill payment will win more loyalty than one with a prettier Sankey.

**Cluster 2 — aggregation and behaviour never co-exist.** Rows 1/42 vs 12/17: the aggregators are weak on method, the method product is weak on data. Row 40 shows only Copilot has a real insight layer, and it is US-only.

**Cluster 3 — India is served on one axis only.** Fold and INDmoney do aggregation + net worth; neither has YNAB-grade budgeting. Axio has capture but has drifted to lending. Money Manager is manual-only but *does* support INR, carry-over budgets and Excel export.

**Cluster 4 — the empty column.** No product in this set is **Full** on 3, 12, 13, 17, 27, 37 and 43 simultaneously. That intersection is the product.

## 6.4 Features we deliberately will *not* copy

| Feature | Why not |
|---|---|
| Mandatory zero-based allocation | Excludes irregular-income users (a majority in India) |
| Card-bill payment execution | Turns us into a payment app; regulatory and fraud surface |
| Lending / credit cross-sell | Corrupts the incentive to tell the user the truth about their spending |
| Opaque ML categorisation | Trust cost exceeds accuracy gain; must be explainable |
| Gamified streaks with loss framing | Creates anxiety and abandonment (§9.7) |
| Persistent hidden filters | The single most-reported source of "wrong numbers" |

---

# 7. Indian Financial Ecosystem

## 7.1 Why this section is the constraint, not the context

In the US, a PFM is a UI over Plaid. In India, a PFM is a UI over **whatever data it is legally allowed to obtain**, and that set is smaller and more conditional than most product teams assume. Every architectural decision in §13 follows from this section.

## 7.2 UPI: the transaction substrate

| Fact | Value | Source |
|---|---|---|
| UPI volume, Oct 2026 | **25,466.70 million** transactions | NPCI monthly product statistics **[V]** |
| UPI value, Oct 2026 | **₹31,52,929.46 crore** (₹31.53 lakh crore) | NPCI **[V]** |
| Daily average | ~822 million transactions/day | Derived **[A]** |
| Sept 2026 | 24,068.38 mn txns, ₹29,37,396.67 cr | NPCI **[V]** |
| Aug 2026 | 24,508.96 mn txns, ₹29,82,355.95 cr | NPCI **[V]** |

**Product implication.** UPI is where Indian spending *happens*, but UPI produces **bank-account debits**, not a separate ledger. A UPI payment to a merchant appears in the bank statement as a debit with a VPA/narration. Therefore:

- There is **no consumer UPI transaction API**. **[V]** (none documented by NPCI for third-party consumer apps)
- UPI data must be reconstructed from bank statements / AA / SMS / notifications.
- The VPA (`merchant@okhdfcbank`) is the best merchant key available, and it is *dirtier* than a card descriptor. A serious categoriser must normalise VPAs, handle `@okaxis/@ybl/@paytm` variants of the same merchant, and handle P2P transfers (which are not spending).

**Narration reality.** Bank narrations follow inconsistent formats (`UPI/DR/123456789012/SWIGGY/YESB/swiggy@ybl/Payment from phone`). Any parser must be tolerant, and any failure must degrade to "uncategorised, needs review" rather than a wrong guess.

## 7.3 The Account Aggregator framework

### What it is
A consent-managed data-sharing rails operated by NBFC-AAs licensed by RBI. A user gives a **consent artefact** to an AA; the AA fetches data from **Financial Information Providers (FIPs)** — banks, depositories, insurers, pension funds — and delivers it to a **Financial Information User (FIU)**.

### The eligibility rule that decides our architecture

> "Financial Information User means an entity registered with and regulated by any financial sector regulator." — RBI Master Direction **[V]**

The four qualifying regulators are **RBI, SEBI, IRDAI, PFRDA**. **[V]** (RBI; Sahamati FIU documentation.)

Consequences:

| Question | Answer |
|---|---|
| Can a plain app call an AA? | **No.** It is not a regulated entity. **[V]** |
| Can it become an FIU? | Only by becoming a regulated entity (e.g. NBFC) or by partnering with one. **[V]** |
| Is there a lighter path? | Partnering with an existing FIU, or using a TSP (technology service provider) that is itself contracted by an FIU. **[A]** — common industry practice, but the *data controller* remains the FIU. |
| What about a personal-use app? | No AA path exists for personal, non-commercial use. **[A]** (strongly implied by the framework's regulated-entity requirement) |

### NBFC-AA Directions, 2025

RBI issued consolidated **Master Directions for Non-Banking Financial Company – Account Aggregator (Reserve Bank) Directions, 2025**. Key verified provisions:

- Registration with RBI is mandatory; minimum **net owned funds of ₹2 crore**. **[V]**
- Consent must be **artefact-based**, containing: identity of the customer, nature and purpose of data, data types, fetch frequency, data life, consent expiry, and the identity of the FIU(s). **[V]**
- The AA must provide the customer a **consent dashboard** listing consents and the FIUs holding them, with revocation. **[V]**
- Data must be encrypted in transit and at rest; the AA is **blind** to the data it carries (it cannot read the payload). **[V]**
- Grievance redressal and audit obligations apply. **[V]**

### Consent UX requirements (derived)

| Requirement | Design consequence |
|---|---|
| Purpose must be specific | Cannot ask for "all data forever"; must scope to a purpose (e.g. "monthly spending analysis") |
| Frequency must be declared | Daily vs periodic changes the value proposition |
| Data life must be bounded | We must store and then delete; retention policy is a product feature |
| Revocation must be as easy as granting | A visible "connected accounts" screen with one-tap revoke |
| Consent history must be visible | A consent log screen, not a buried setting |

### Coverage reality

| Data type | On AA? | Notes |
|---|---|---|
| Bank accounts (savings/current) | Yes | FIP-dependent; quality varies by bank |
| Deposits (FD/RD) | Yes | — |
| Mutual funds | Yes | Via RTAs/depositories |
| Equities / demat | Yes | Via CDSL/NSDL |
| NPS | Yes | Via PFRDA-regulated entities |
| Insurance policies | Yes | Via insurers |
| **Credit cards** | **No** | Explicitly stated by Fold **[V]** |
| **EPF** | Partial | Access paths exist but coverage is uneven **[A]** |
| **UPI-level merchant detail** | Indirect | Only as bank narration, not structured UPI metadata |

**The credit-card gap is the defining Indian PFM problem.** Cards are growing fast, they carry the highest-value discretionary spending, and they are invisible to the sanctioned data rails. Every serious Indian PFM therefore builds a *second* ingestion channel for cards: email parsing, SMS parsing, or manual entry.

## 7.4 Ingestion channels available to a non-regulated app

| Channel | Legality | Reliability | Coverage | Effort |
|---|---|---|---|---|
| Manual entry | Unrestricted | Perfect | Whatever user types | Low |
| CSV/PDF statement import | Unrestricted (user-supplied) | High (if parser good) | Bank, card, broker | Medium |
| SMS reading | Allowed under Play policy with declaration **[V]** | Medium | Bank/card alerts | Medium |
| Notification listener | Allowed with disclosure | Medium-high | UPI apps, banks | Medium |
| Email parsing (Gmail API) | Allowed with OAuth scope review | Medium | Card alerts/statements | High |
| AA via FIU partner | Only via partnership | High where supported | Bank/deposit/MF/demat | High + commercial |
| Screen scraping of net-banking | **Prohibited** in practice; RBI has cracked down | — | — | Never |

### Statement import is the under-rated channel
A PDF/CSV statement is *authoritative* — it is the same data the bank would give an FIU, just delivered to the user instead. It is legally clean, requires no partnership, and works for credit cards where AA does not. The cost is UX: users must download and share a file.

**Design implication:** treat statement import as a **first-class Core feature**, not a fallback. It is the only channel that is simultaneously legal, complete, and available today for cards.

## 7.5 Instruments and where their data lives

| Instrument | Data source | Structured? | Notes |
|---|---|---|---|
| Savings/current account | AA, statement, SMS | Yes | The backbone |
| Credit card | Statement PDF, email alerts, SMS | Semi | Not on AA **[V]** |
| UPI | Derived from bank debits | No (narration only) | No consumer API |
| Home/auto/personal loan | AA (some), statement, CIBIL | Semi | EMI schedules matter more than balances |
| EPF | EPFO passbook (UAN), statement | Semi | Annual interest credit; monthly contributions |
| PPF | Bank/post office passbook | No | Annual, low-frequency |
| NPS | NSDL CRA statement, AA | Semi | Tier I / Tier II |
| Mutual funds | CAS (NSDL/CDSL), RTA, AA | Yes | **CAS is the single best MF source** |
| Stocks/demat | CDSL/NSDL CAS, broker contract notes, AA | Yes | CAS covers NSDL + CDSL holdings |
| Fixed deposits | AA, statement | Yes | Often missed by users |
| Gold | Manual | No | Jewellery, SGB, digital gold, ETF |
| Real estate | Manual | No | — |
| Crypto | Exchange export | Semi | Tax-sensitive |

**Consolidated Account Statement (CAS)** deserves emphasis: NSDL and CDSL both issue a single statement covering demat holdings **and** mutual fund folios. **[V]** It is the highest-information-per-file import in Indian personal finance, and almost no consumer app exploits it well. **[A]**

## 7.6 Google Play policy: SMS and notification access

The Play **SMS and Call Log permissions** policy permits `READ_SMS`/`RECEIVE_SMS` for a defined set of use cases, including:

> "**SMS-based financial transactions** — for example, Unified Payments Interface (UPI), verifications for financial transactions" **[V]**

and separately lists **"SMS-based money management — apps that track and manage budget"** as a permitted exception category. **[V]**

Conditions that apply:
- The app must be the **default handler** for some use cases, or fall within a declared exception. **[V]**
- A **Permissions Declaration Form** must be submitted in Play Console. **[V]**
- Google reviews the declaration; approval is not guaranteed and can be revoked. **[V]**

**Practical reading [A]:** SMS-based budget tracking is *explicitly contemplated* by the policy, which is why Axio survives on Play. But it is a review-gated privilege, and a rejection would remove a core channel. Therefore SMS must never be the *only* ingestion path — this is exactly the architectural lesson from Axio's fragility (§4.5).

**Notification listener** is a separate, less review-gated mechanism (Notification Access is a special access, not a runtime permission). It can read UPI app notifications, which is often richer than bank SMS. It requires prominent disclosure and a clear privacy policy. **[A]**

## 7.7 Regulatory obligations that shape the product

| Obligation | Source | Product consequence |
|---|---|---|
| **DPDP Act 2023 + DPDP Rules 2025** (notified 14 Nov 2025) | MeitY / PIB **[V]** | Itemised notice, specific consent, purpose limitation, erasure on request, consent-manager readiness, breach notification |
| Data minimisation | DPDP **[V]** | Do not ingest fields we do not use |
| Children's data (under 18) | DPDP **[V]** | Verifiable parental consent if we ever target minors — simplest to restrict to 18+ |
| Grievance officer | DPDP / IT Rules **[V]** | Named contact in-app |
| AA consent artefact rules | RBI **[V]** | If partnered, honour artefact scope exactly |
| Payment aggregator rules | RBI **[V]** | Do not touch money movement unless licensed — hence no bill-pay in v1 |
| SEBI investment advice rules | SEBI **[V]** | Do not give buy/sell recommendations without registration; present *analysis*, not advice |

**The SEBI line is easy to cross accidentally.** "Your portfolio is 78% equity, which is aggressive for your horizon" is analysis. "Sell 20% and buy debt funds" is advice. The product must be designed so that generated text stays on the analysis side, and any recommendation-shaped output carries a clear "not investment advice" framing. **[A]**

## 7.8 Bharat Connect (BBPS) — the bill rails

Bharat Connect (formerly Bharat BillPay) is the RBI-conceived, NPCI-operated bill payment network. **[V]** It covers utilities, DTH, telecom, insurance, loan repayments, **credit card bills**, and recurring deposits/NPS contributions. **[V]** Credit-card-on-UPI is enabled for BBPS payments in defined cases. **[V]**

**Relevance:** we do not need to *execute* payments, but we can use biller data to know **what is due and when**, and we can deep-link the user to their own bank/UPI app. That gives us the utility of bill-pay without the regulatory burden of being a payment aggregator. **[A]**

## 7.9 What this section forces on the architecture

1. **The ledger must stand alone.** AA may never be available to us. Manual + statement import must produce a complete product.
2. **Ingestion is plural and pluggable.** Bank (AA/statement/SMS), card (email/statement/SMS), investments (CAS/manual), liabilities (statement/manual). Each is a *source adapter* writing into one normalised ledger.
3. **Provenance and confidence are data, not UI decoration.** Every transaction row needs `source`, `source_ref`, `confidence`, and `raw_text`.
4. **Consent is a first-class domain object** — not a settings toggle.
5. **Retention is a feature.** Store raw statements for a bounded window, then keep only normalised records.
6. **No payment execution in Core.** Deep-link out; never hold funds.

---

# 8. Slice Integration Research

## 8.1 The requirement, restated precisely

The user pays via **Slice** for UPI. They want:

1. A **dedicated Slice tab** inside Financial Space.
2. Slice transactions visible there, especially **outgoing** payments.
3. The same transactions flowing into the central ledger so they appear in overall transactions, expense analytics, budgets, cash flow and reports.
4. **No double counting** when the same money also appears via a bank statement.

The conceptual pipeline is fixed:

```
Slice Account
     ↓  (authorised import / sync)
Transaction Processing  (parse → normalise → dedupe → categorise)
     ↓
Central Financial Transaction DB   (single source of truth)
     ├── Slice Tab (a filtered view: source = slice)
     ├── Overall Transactions
     ├── Expense Analytics
     ├── Budget Calculations
     ├── Cash Flow
     └── Financial Reports
```

**Architecturally this is trivial and important:** the Slice tab is a *view*, not a separate store. One ledger, one `source` dimension. If Slice data lived in its own table, every analytics query would need a union and double-counting would be inevitable.

## 8.2 What Slice actually is (verified)

Slice began as a credit line for young users (SlicePay, 2016), became a **Small Finance Bank** (Slice SFB, after merging with North East Small Finance Bank), and now offers UPI payments, a credit card, FDs, and personal loans. **[V]** (Slice website, Play listing, independent coverage.)

Relevant product surfaces for us:
- **UPI payments** — the primary user need here.
- **Passbook / transaction history** — Accounts → Passbook. **[V]**
- **Statement download** — explicitly offers **transaction reference numbers** "handy for accounting or GST filing". **[V]**
- **Receipts** — shareable per transaction. **[V]**

## 8.3 Verified capability vs assumption

| Capability | Status | Evidence |
|---|---|---|
| View transaction history in app (Passbook) | **Verified** | Slice help centre **[V]** |
| Download a statement containing reference numbers | **Verified** | Slice help centre **[V]** |
| Share a receipt for a QR credit | **Verified** | Slice help centre **[V]** |
| Merchant/partner API exists | **Verified** | `developer.slicebank.com`, base URL `api.slice.bank.in` **[V]** |
| Merchant API can read a **personal** account | **Not verified — assume NO** | Merchant APIs authenticate a business, not a retail customer. **[A]** |
| Public OAuth / personal-data API for retail customers | **Not found** | No such documentation surfaced. **[U]** |
| Slice is a FIP on the AA network (so a partner FIU could fetch it) | **Unknown** | Slice SFB is a bank and *may* be a FIP; I could not confirm. **[U]** |
| Statement format / columns | **Unknown** | Not publicly documented. **[U]** |
| Notification/SMS capture of Slice UPI events | **Assumption** | Technically feasible via notification listener; not officially sanctioned. **[A]** |

**The single most important sentence in this section:** *There is no public evidence that any API can read a personal Slice account.* Any plan that assumes one is a plan built on a guess.

## 8.4 The four viable ingestion paths, ranked

### Path A — Statement import (recommended Core)
User downloads the Slice statement (PDF/CSV) and imports it.

- **Legal:** clean — user-supplied data.
- **Completeness:** highest, including historical.
- **Effort:** parser must be written against real samples.
- **UX:** a one-time-per-month chore, mitigated by a reminder and a "drop file here" flow.
- **Risk:** format changes; password-protected PDFs.

Required fields to extract:

| Field | Purpose |
|---|---|
| `txn_date` / `value_date` | Ordering, cash-flow timing |
| `narration` / `description` | Merchant extraction |
| `debit` / `credit` | Direction |
| `amount` | Value |
| `reference` / `UTR` | **Dedupe key** |
| `status` (success/failed/pending) | Exclude failures from spend |
| `balance` (if present) | Reconciliation |
| `counterparty VPA/account` | Merchant identity |

### Path B — Notification capture (recommended Advanced)
A notification listener reads Slice/bank UPI notifications in real time.

- **Latency:** seconds — enables real-time spend awareness, which is the most behaviourally valuable moment (§9).
- **Risk:** text varies by app version; requires prominent disclosure; not officially sanctioned.
- **Design rule:** notification capture produces a *pending* transaction requiring confirmation, never a silently committed one.

### Path C — SMS capture (Advanced, Play-gated)
Same as B but via bank SMS. Redundant with B on modern Android; keep as fallback.

### Path D — AA via partner FIU (Future)
If Slice SFB is a FIP and we have an FIU partner, Slice data arrives through the same consent flow as other banks. This is the cleanest long-term path and the least certain.

## 8.5 Statement parser design (proposal, not verified format)

Because the format is unverified, design the parser as **declarative, sample-driven**:

```yaml
# slice_statement_v1.yaml  (illustrative — schema only, not a real format)
source: slice
version: 1
detect:
  - "Slice"
  - "Slice Small Finance Bank"
table:
  header_row: auto          # find the row containing date+amount+balance tokens
  columns:
    date:      ["Date", "Txn Date", "Transaction Date"]
    narration: ["Description", "Narration", "Particulars", "Details"]
    ref:       ["Ref No", "Reference", "UTR", "RRN", "Cheque No"]
    debit:     ["Debit", "Withdrawal", "Dr"]
    credit:    ["Credit", "Deposit", "Cr"]
    amount:    ["Amount"]
    balance:   ["Balance", "Closing Balance"]
    status:    ["Status"]
normalise:
  amount: strip_currency_and_commas
  date:   try_formats ["dd/MM/yyyy","dd-MM-yyyy","dd MMM yyyy","yyyy-MM-dd"]
  ref:    uppercase_strip_spaces
rules:
  - if: credit and narration ~ "UPI.*CR"
    set: direction = in
  - if: narration ~ "REV|REVERSAL|REFUND"
    set: flag = reversal
```

This lets a new format be added without code changes, and lets the importer show a **preview with per-row confidence** before commit — which is the trust behaviour that makes statement import acceptable.

## 8.6 Deduplication: the hard requirement

The user's Slice UPI payment may appear **three times**:

1. Slice statement (Path A)
2. Slice/bank notification (Path B)
3. The linked bank account's statement/AA feed — because Slice UPI settles against a funding source

Without dedupe, the user sees 3× spending and loses all trust.

### Matching strategy

**Tier 1 — exact key.** If `UTR`/`RRN` present in both records, they are the same transaction. Confidence 1.0.

**Tier 2 — composite key.** `(amount, date ± 2 days, direction, normalised_counterparty)`.
- Confidence 0.85 if counterparty matches.
- Confidence 0.7 if only amount+date+direction match.

**Tier 3 — heuristic.** Amount exact, same day, one record has no counterparty, and no other candidate. Confidence 0.6 → **prompt the user**.

### Merge policy

```
If confidence ≥ 0.95  → auto-merge, keep both raw records, mark primary
If 0.70–0.95          → merge silently but show a "merged from 2 sources" badge
If 0.50–0.70          → queue a "Same transaction?" card in the review queue
If < 0.50             → keep separate, flag as possible duplicate
```

**Never delete the losing record.** Keep it with `merged_into = primary_id` so provenance survives and the merge is reversible. Reversibility is what makes auto-merge safe.

### Double-counting guard at the analytics layer

Even with good dedupe, an invariant is required:

> **Every transaction contributes to exactly one analytics bucket.**
> Transfers and card-bill payments are *movements*, not spending.

Implementation: a transaction has `kind ∈ {expense, income, transfer, investment, refund, fee, adjustment}`. Spending analytics sum only `kind = expense`. This one enum prevents the most common PFM bug in the market (§11.2).

## 8.7 The Slice tab: what it should show

Not a mini-app — a *lens* over the ledger.

| Block | Content | Why |
|---|---|---|
| Slice balance | Current balance (manual or imported) | Orientation |
| This month | In / Out / Net, Slice-only | The core question |
| Outgoing by category | Ranked bars, top 5 + "other" | Behaviour |
| Frequent payees | Top VPAs/merchants with counts | Habit awareness |
| Recent activity | Last 20 transactions with source badge | Verification |
| Data freshness | "Statement imported 2 Nov · 41 days old" | **Trust** |
| Import action | "Import statement" / "Connect" | The fix when stale |

The **freshness indicator is not optional.** A stale balance presented as current is the most damaging thing a PFM can do.

## 8.8 Sync states (design for failure)

| State | UI |
|---|---|
| Never connected | "Import your first Slice statement" with a 3-step guide |
| Connected, fresh (<7d) | Normal |
| Connected, stale (7–45d) | Amber chip: "Data from 2 Nov" |
| Connected, very stale (>45d) | Banner: "Slice data is out of date — import a statement" |
| Import failed | Show the error, the file, and the row that failed; never silently drop |
| Format unrecognised | "We don't recognise this format yet. Send us the file (opt-in) to add support." |

## 8.9 What we must tell the user (and never claim)

- "We read your Slice statement file that **you** download." **[true]**
- "Slice does not provide a public API for personal accounts, so we cannot sync automatically." **[true as of research date]**
- Never: "Bank-grade secure sync with Slice" — unless an AA partnership exists.

This honesty is a feature. Indian users have been burned by apps that promised sync and delivered stale data (§11.2).

---

# 9. Financial Psychology and Academic Research

## 9.1 Why this section exists

A PFM's job is not to display numbers; it is to change behaviour at the moment of decision. The evidence base for *how* to do that is strong and specific, and most products ignore it in favour of dashboards. This section converts research into design rules.

## 9.2 Goal-setting theory and implementation intentions

**Evidence.** Gollwitzer & Sheeran's meta-analysis of **94 studies** found that forming **implementation intentions** ("if situation X, then I will do Y") produces a mean effect size of **d = 0.65** on goal attainment — a large effect for a near-zero-cost intervention. **[V]** (Gollwitzer & Sheeran, 2006, *Advances in Experimental Social Psychology*, 38, 69–119.)

**Mechanism.** Specifying *when, where and how* delegates initiation to an environmental cue, bypassing the need for momentary motivation. The effect is on **getting started**, not on ability.

**Design rule.** Every goal must have an if-then plan, not just an amount and a date.

```
Goal: Emergency Fund ₹3,00,000 by Oct 2027
If  → salary credited (1st of month)
Then → move ₹12,500 to Emergency Fund
[ Set up reminder ]  [ Make it automatic ]
```

**Where it lives:** goal creation flow (required field), plus a monthly notification on the chosen trigger day.

**Limitation.** Effect sizes from laboratory and student samples are larger than field effects; the meta-analysis includes many short-horizon studies. Treat d = 0.65 as an upper bound. **[A]**

## 9.3 Habit formation: the 66-day myth and what it actually means

**Evidence.** Lally et al. (2010) tracked 96 participants adopting a new daily behaviour and found **median 66 days to automaticity, range 18–254**. **[V]** (*European Journal of Social Psychology*, 40(6), 998–1009.) Missing a single day did **not** materially harm habit formation.

**What this establishes.** (a) Habit formation is slow and highly variable; (b) perfection is not required; (c) the "21 days" folklore is wrong.

**Design rules.**
1. **Never** build a streak that resets to zero on a missed day. That contradicts the evidence and manufactures abandonment.
2. Show **consistency as a proportion** ("reviewed 18 of the last 30 days"), not a fragile chain.
3. Onboarding should set a *weekly* review ritual, not a daily one — 66 days of daily logging is unrealistic for most users.
4. Expect the value curve to be slow: design the first-session payoff (one logged transaction, one insight) to carry the user through the flat early period.

**Limitation.** The study used self-reported daily behaviours in a volunteer sample; financial review is more effortful than drinking water. **[A]**

## 9.4 Commitment devices

**Evidence.** Ashraf, Karlan & Yin (2006) ran a randomised field experiment in the Philippines with a **commitment savings account** (SEED) that restricted withdrawals until a goal date or target. After twelve months, **average savings balances rose by 81 percentage points** for the treatment group relative to control. **[V]** (*Quarterly Journal of Economics*, 121(2), 635–672.)

**Mechanism.** Present-biased individuals voluntarily restrict their own future options, solving the self-control problem *before* it arises.

**Design rule.** Offer a **Locked Goal** type: money assigned to it is excluded from "available to spend" and requires a deliberate two-step unlock. Do not actually move money (we are not a bank) — restrict it in the app's own accounting and say so plainly.

**Limitation.** Effects are strongest for people who *choose* to commit; mandating commitment repels the rest. Always optional, always reversible with friction (not prohibition). **[A]**

## 9.5 Automation and escalation

**Evidence.** Thaler & Benartzi's **Save More Tomorrow** programme tied contribution increases to *future* pay rises, so the sacrifice was never felt as a cut in take-home pay. Savings rates rose substantially among participants. **[V]** (*Journal of Political Economy*, 112(S1), S164–S187.)

**Design rules.**
1. Frame savings increases as applying to **the next increment** ("when your salary rises, 50% of the raise goes to your goal"), never as a cut to current spending.
2. Auto-escalate goal contributions annually, with a one-tap opt-out.
3. Default the *good* option: pre-fill the recommended contribution.

**Limitation.** Requires predictable income growth; India's salaried segment fits, gig workers do not. **[A]**

## 9.6 Mental accounting

**Evidence.** Thaler (1999) formalised mental accounting: people sort money into non-fungible mental buckets and violate fungibility in predictable ways. **[V]** (*Journal of Behavioral Decision Making*, 12(3), 183–206.)

**Design rules.**
1. Buckets are **useful** (they help people save) and **dangerous** (they create blind spots). Support them; do not enforce them.
2. Always show the **whole** ("across all buckets you have ₹1,24,000") alongside the bucket view, so the user never loses sight of total position.
3. "Found money" (refunds, cashback) should default to the goal, not to spending — but be visible, never silent.

## 9.7 Loss aversion, framing, and the shame problem

**Evidence.** Losses loom larger than equivalent gains (Kahneman & Tversky's prospect theory). **[V]** The practical consequence for PFM is that *deficit framing* ("you are ₹2,400 over budget") produces avoidance — users stop opening the app precisely when they most need it.

**Design rules — non-negotiable:**
1. **No red "failed" states.** Use neutral language: "₹2,400 over your plan" with a one-tap fix ("move from Dining").
2. **No loss-framed streaks.** "You'll lose your 40-day streak" is a churn trigger, not a motivator.
3. **No shaming copy.** Never "You overspent again." Ever.
4. **Show the recovery path first.** The primary action after overspend is *reallocation*, not confession.
5. **Progress framing by default.** "62% of the way" rather than "38% remaining".

**Limitation.** Some users respond to mild challenge framing; make tone a setting, default to supportive. **[A]**

## 9.8 Present bias and friction

**Evidence.** Present bias (hyperbolic discounting) is the core reason saving is hard; the standard remedies are **precommitment**, **defaults**, and **friction** on the wrong action. **[V]** (broad behavioural economics literature; Thaler & Sunstein on defaults.)

**Design rules.**
1. **Add friction to impulse** — a "cooling off" flag on large unplanned purchases is opt-in, never imposed.
2. **Remove friction from review** — one tap to categorise, bulk actions, remembered rules.
3. **Add friction to destructive actions** — deleting an account, unlinking a source, wiping data.
4. **Immediate feedback at the moment of spend** (notification capture enables this) is the highest-leverage behavioural surface in the entire product.

## 9.9 Financial scarcity and cognitive load

**Evidence.** Scarcity research (Mullainathan & Shafir) shows that financial worry consumes cognitive bandwidth, reducing the capacity to plan. **[V]** A dashboard that shows 14 metrics to a worried user is not informative — it is paralysing.

**Design rules.**
1. **Maximum four hero numbers** on the home screen.
2. **Maximum three "needs attention" items**, each with a verb.
3. **Progressive disclosure everywhere** — depth on tap, never on load.
4. **No number without an action.** If a metric cannot change a decision, remove it.

**Limitation.** Power users want density; solve with a "detailed view" toggle, not by defaulting to density. **[A]**

## 9.10 Progress feedback and the goal-gradient effect

**Evidence.** Effort increases as people perceive themselves approaching a goal (goal-gradient hypothesis). **[V]** Visible progress is itself motivating.

**Design rules.**
1. Show **pace**, not just percentage: "8 months ahead of plan".
2. Celebrate **milestones** (25/50/75/100%) with a quiet, dismissible acknowledgement — not confetti that interrupts.
3. For debt, invert the frame: show **interest saved** and **months shaved**, which is the emotionally meaningful number, not the remaining principal.

## 9.11 Social norms and comparison

**Evidence.** Descriptive norms influence behaviour, but upward comparison in finance can demotivate and induce shame. **[A]** (mixed evidence; treat cautiously)

**Design rule.** Never compare a user's spending to other users by default. If benchmarking exists, compare to **the user's own history** ("your 3-month average"), which is both more actionable and safer.

## 9.12 Summary: principle → feature mapping

| Principle | Evidence strength | Feature | Surface | Risk if misused |
|---|---|---|---|---|
| Implementation intentions | Strong (d=0.65, 94 studies) | If-then plan on every goal | Goal creation, monthly nudge | Feels like homework if forced |
| Habit formation (66d median) | Strong | Weekly review ritual, consistency % | Onboarding, home | Streak pressure |
| Commitment devices | Strong (RCT, +81pp) | Locked goals | Goal settings | Feels punitive if default |
| Automation + escalation | Strong (SMarT) | Auto-escalate on raise | Goal settings | Irrelevant for irregular income |
| Mental accounting | Strong | Buckets + always-visible total | Budgets, goals | Blind spots |
| Loss aversion | Strong | Neutral framing, no red failure | Everywhere | Shame, avoidance |
| Present bias | Strong | Friction on impulse, ease on review | Review queue | Paternalism |
| Scarcity / cognitive load | Moderate-strong | Max 4 numbers, max 3 alerts | Home | Under-informs power users |
| Goal gradient | Moderate | Pace + milestones | Goals, debt | Gamification creep |
| Social norms | Mixed | Self-comparison only | Analytics | Shame, demotivation |

## 9.13 What we will not build, on behavioural grounds

| Anti-pattern | Why |
|---|---|
| Daily streaks with reset | Contradicts Lally; manufactures churn |
| Red deficit dashboards | Triggers avoidance exactly when help is needed |
| Public/anonymous peer comparison | Shame risk, no actionable path |
| Confetti on every action | Trivialises; habituates quickly |
| "You spent X on coffee" moralising | Judgement without a decision |
| Push notifications > 1/day by default | Notification fatigue destroys the channel |
| Gamified points economy | Optimises the game, not the finances |

---
