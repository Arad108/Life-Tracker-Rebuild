# 16. Prioritisation and Rationale

## 16.1 The scoring model

Each candidate feature was scored on five axes (1–5):

| Axis | Question |
|---|---|
| **U** — User value | Does it change a decision or prevent a loss? |
| **T** — Trust | Does it make the numbers more believable or more correct? |
| **D** — Differentiation | Can a competitor ship it in a week? (5 = hard to copy) |
| **E** — Effort (inverted) | 5 = cheap, 1 = very expensive |
| **R** — Risk (inverted) | 5 = low regulatory/technical risk, 1 = high |

Priority score = `U + T + D + E + R` (max 25).

## 16.2 Scored backlog (top 30)

| Rank | Feature | U | T | D | E | R | Score | Tier |
|---|---|---|---|---|---|---|---|---|
| 1 | Unified ledger with `kind` invariant | 5 | 5 | 4 | 4 | 5 | **23** | Core |
| 2 | Transfers as first-class + pairing | 4 | 5 | 4 | 4 | 5 | **22** | Core |
| 3 | Statement import with preview | 5 | 5 | 4 | 2 | 5 | **21** | Core |
| 4 | Duplicate detection + reversible merge | 4 | 5 | 4 | 3 | 5 | **21** | Core |
| 5 | Augmented balance | 5 | 4 | 4 | 4 | 5 | **22** | Core |
| 6 | Review queue | 4 | 5 | 3 | 3 | 5 | **20** | Core |
| 7 | Data health screen | 4 | 5 | 5 | 3 | 5 | **22** | Core |
| 8 | Slice lens | 4 | 4 | 4 | 3 | 4 | **19** | Core |
| 9 | Chart → transaction drill-down | 5 | 5 | 2 | 3 | 5 | **20** | Core |
| 10 | Budgets: 3 modes + pace | 5 | 3 | 3 | 3 | 5 | **19** | Core |
| 11 | Recurring detection + upcoming | 5 | 3 | 2 | 3 | 5 | **18** | Core |
| 12 | Goals with if-then + pace | 5 | 3 | 3 | 4 | 5 | **20** | Core |
| 13 | Net worth + snapshots | 4 | 4 | 2 | 4 | 5 | **19** | Core |
| 14 | Debt payoff projection | 4 | 3 | 3 | 3 | 5 | **18** | Core |
| 15 | Saved views | 3 | 4 | 2 | 4 | 5 | **18** | Core |
| 16 | Refund linking | 3 | 5 | 3 | 3 | 5 | **19** | Core |
| 17 | Merchant normalisation + rename rules | 4 | 4 | 3 | 3 | 5 | **19** | Core |
| 18 | CSV/JSON export | 3 | 4 | 2 | 4 | 5 | **18** | Core |
| 19 | Consent log | 3 | 4 | 3 | 4 | 5 | **19** | Core |
| 20 | Investments + XIRR | 4 | 3 | 4 | 2 | 4 | **17** | Advanced |
| 21 | Weekly change digest | 4 | 3 | 4 | 4 | 5 | **20** | Advanced |
| 22 | Cash-flow forecast | 4 | 2 | 3 | 2 | 5 | **16** | Advanced |
| 23 | Notification capture | 4 | 3 | 3 | 2 | 3 | **15** | Advanced |
| 24 | SMS capture | 3 | 3 | 2 | 2 | 2 | **12** | Advanced |
| 25 | Email card parsing | 3 | 3 | 3 | 1 | 3 | **13** | Advanced |
| 26 | Scenario planning | 3 | 2 | 3 | 2 | 5 | **15** | Advanced |
| 27 | Household sharing | 4 | 2 | 3 | 1 | 4 | **14** | Advanced |
| 28 | AA aggregation | 5 | 4 | 2 | 1 | 1 | **13** | Future |
| 29 | Bill payment | 3 | 1 | 1 | 1 | 1 | **7** | Rejected |
| 30 | Lending cross-sell | 1 | 1 | 1 | 3 | 1 | **7** | Rejected |

## 16.3 Rationale for the top five

**1. Unified ledger with the `kind` invariant (23).** Everything else is a view. Getting this wrong is unrecoverable later — migrating a polluted ledger is worse than rebuilding. It scores highest on trust and risk.

**2. Augmented balance (22).** Highest value-per-line-of-code in the entire product. It requires balances, card dues and recurring — all Core — and produces the single number users care about.

**3. Data health screen (22).** Turns the product's biggest weakness into its most visible strength. Cheap to build once provenance and confidence exist; very hard to copy without the underlying architecture.

**4. Transfers + pairing (22).** The most common correctness failure in the market. Without it, every spending number is suspect.

**5. Statement import with preview (21).** The only legal, complete channel for credit cards in India, and the reason a user without AA still gets full coverage.

## 16.4 Why not start with aggregation

| Reason | Evidence |
|---|---|
| Not legally available without FIU status | §7.3 |
| Cards — the highest-value data — are excluded anyway | §7.4 |
| Aggregation failures are the top trust complaint in Indian PFMs | §11.2 |
| Manual + statement delivers 100% of Core value with 0 regulatory risk | §14 |
| AA can be added later behind the same adapter interface | §13.2 |

**Counter-argument considered:** aggregation produces the "wow" moment that drives activation. **Response:** the 60-second manual onboarding (§12.10) produces a smaller but *honest* wow, and does not create a support burden when a bank breaks.

## 16.5 Sequencing logic

```
Correctness  →  Comprehension  →  Control  →  Coaching
   (M2,M5)        (M1,M8)        (M3,M4,M7)    (M12)
```

You cannot coach a user on numbers they do not trust. This is why M12 (Intelligence) is last, despite being the most exciting.

## 16.6 What we would cut first under pressure

In order: custom dashboards → report packs → receipt OCR → multi-currency → household sharing.

**Never cut:** the `kind` invariant, dedupe, transfer pairing, data health, export. These are the trust floor.

---

# 17. Research Limitations

## 17.1 Honest statement of what this research is not

This document is a **desk research teardown**, not a usability study. It is strong on documented workflows, regulatory constraints, and academic evidence. It is weaker on micro-interaction detail, and it contains no primary user research.

## 17.2 Specific limitations

| # | Limitation | Consequence | Mitigation |
|---|---|---|---|
| L1 | No hands-on accounts for Monarch, Copilot, YNAB, Fold | Animation, empty states, and error UX are partly inferred from help articles and reviews | Run a 2-week instrumented trial before finalising interaction specs |
| L2 | No primary interviews with Indian users | Personas are reasoned from market structure, not observed | 8–12 interviews before P1 |
| L3 | Slice statement format unverified | Parser design is a schema proposal, not a spec | Obtain 3 anonymised statements before building the parser |
| L4 | Slice AA/FIP status unknown | Path D may be impossible | Confirm with Slice or via AA ecosystem directory |
| L5 | Pricing excluded deliberately | No commercial benchmarking | Separate commercial study |
| L6 | Fold's in-app screens not directly observed | Some Fold claims are vendor-stated | Treat Fold capability cells as Partial where unverified |
| L7 | Community evidence is anecdotal | r/foldmoney, r/ynab, Play reviews are self-selected | Use for hypothesis generation, not validation |
| L8 | Academic effect sizes partly lab-based | d=0.65 may overstate field effect | Treat as directional; A/B test our implementations |
| L9 | Indian AA production quality varies by FIP | Even a perfect integration may disappoint | Design for "sync failed" as a normal state |
| L10 | Play policy can change | SMS channel could be withdrawn | Never make SMS the only path |
| L11 | No accessibility audit of competitors | Our a11y bar is self-set | Commission an audit at P1 |
| L12 | No performance benchmarking | Targets in §13.5 are estimates | Measure on a low-end Android device (e.g. 4GB RAM) |
| L13 | Tax treatment not researched in depth | Capital-gains exports deferred | Separate tax research before F-06 |
| L14 | No legal review of DPDP obligations | §7.7 is a product reading, not legal advice | Obtain counsel review before launch |

## 17.3 Claims I explicitly could not verify

| Claim | Status |
|---|---|
| Slice offers a personal-account API | **No evidence found.** Assume it does not exist. |
| Slice is an AA Financial Information Provider | **Unknown.** |
| Fold's PPF/FD tracking mechanism | **Unknown** (not documented publicly). |
| Copilot's exact ML model or accuracy | **Unknown** (vendor does not publish). |
| Monarch's active subscriber count | **Not verified.** |
| YNAB's reported average user savings | **Vendor claim**, not independently verified here. |
| Axio's current SMS success rate | **Unknown.** |
| Whether any Indian PFM has >1M MAU | **Not verified.** |

## 17.4 Confidence summary

| Section | Confidence | Reason |
|---|---|---|
| §6 Matrix | Medium-high | Based on help-centre flows; some cells Partial by design |
| §7 India ecosystem | High | Primary regulator sources |
| §8 Slice | Medium | Verified surfaces, unverified format and API |
| §9 Psychology | High | Peer-reviewed sources with citations |
| §10 Charts | High (as design) | Synthesis, not observation |
| §11 Strengths/weaknesses | Medium-high | Documented + consistent community signal |
| §13 Architecture | High (as engineering judgement) | Derived from verified constraints |
| §16 Prioritisation | Medium | Scores are judgement, not measurement |

## 17.5 What would most improve this research

1. **Three anonymised Slice statements** → turns §8.5 from proposal to spec.
2. **Twelve user interviews** (salaried, gig, student, household) → validates §12.
3. **Two-week trials** of Monarch + Fold → validates §5 interaction detail.
4. **A legal read of DPDP + AA obligations** → de-risks §13.
5. **A low-end Android performance test** → validates §13.5.

---

# 18. Complete Reference Library

## 18.1 Official product documentation

| # | Source | URL | Used for | Date |
|---|---|---|---|---|
| R1 | Monarch — Using Reports | https://help.monarch.com/hc/en-us/articles/21846787088916-Using-Reports | Chart types, drill-down, filters, saved reports | Updated 21 Sep 2026 |
| R2 | Monarch — Reports & Cash Flow section | https://help.monarchmoney.com/hc/en-us/sections/35226915113492-Reports-Cash-Flow | Report inventory | Accessed Nov 2026 |
| R3 | Monarch — Getting Started | https://help.monarchmoney.com/hc/en-us/articles/360048393272-Getting-Started-Guide | Onboarding, account model | Accessed Nov 2026 |
| R4 | Monarch — Cash Flow | https://help.monarchmoney.com/hc/en-us/articles/20504904768020-Cash-Flow | Cash-flow views, grouping | Accessed Nov 2026 |
| R5 | YNAB — Understanding Target Types | https://support.ynab.com/en_us/getting-started-with-targets-ryAEP08xC | Weekly/monthly/yearly/custom targets | Updated 5 Oct 2026 |
| R6 | YNAB — Loan Accounts | https://support.ynab.com/en_us/loan-accounts-a-guide-HkNSkPHJi | Loan modelling | Accessed Nov 2026 |
| R7 | YNAB — Getting Out of Debt | https://support.ynab.com/en_us/getting-out-of-debt-ByMlJW_C9 | Debt Payment target, payoff date | Accessed Nov 2026 |
| R8 | YNAB — Paired Targets | https://support.ynab.com/en_us/paired-targets-BJJI8rdC5 | Category-account pairing | Accessed Nov 2026 |
| R9 | YNAB — Glossary | https://support.ynab.com/en_us/ynab-glossary-a-guide-BJd80SORq | Age of Money definition | Accessed Nov 2026 |
| R10 | YNAB — The Four Rules | https://ynab.com/blog/the-new-rules | Method philosophy | Accessed Nov 2026 |
| R11 | Copilot — Quick Start | https://help.copilot.money/en/articles/11157550-quick-start-guide | Onboarding order, intelligence threshold | Updated 27 Aug 2026 |
| R12 | Copilot — Dashboard Tab | https://help.copilot.money/en/articles/6045480-dashboard-tab-overview | Dashboard composition | Accessed Nov 2026 |
| R13 | Copilot — macOS app | https://help.copilot.money/en/articles/6778561-copilot-money-for-macos | Shortcuts, quick edit | Accessed Nov 2026 |
| R14 | Fold — FAQ | https://fold.money/faq | AA model, card ingestion, coverage, plans | Updated Oct 2026 |
| R15 | Fold — Credit card tracking blog | https://fold.money/blog/track-credit-card-spends-real-time | Cards not on AA; email parsing; augmented balance | 11 Apr 2026 |
| R16 | Fold — Privacy by design | https://fold.money/blog/privacy-by-design | Privacy posture | Accessed Nov 2026 |
| R17 | Money Manager — Home tab | https://help.realbyteapps.com/hc/en-us/articles/360043325533-Home-tab | Calendar view, summary | Accessed Nov 2026 |
| R18 | Money Manager — Transfers | https://help.realbyteapps.com/hc/en-us/articles/360042842254-How-to-record-a-transfer | Transfer as record type | Accessed Nov 2026 |
| R19 | Money Manager — Budgets | https://help.realbyteapps.com/hc/en-us/articles/360042842974-How-to-set-up-modify-delete-a-budget | Carry-over budgets | Accessed Nov 2026 |
| R20 | Money Manager — Repeat & instalment | https://help.realbyteapps.com/hc/en-us/articles/360043328193-How-to-set-up-a-repeat-schedule-installment | Recurring entries | Accessed Nov 2026 |
| R21 | Money Manager — Stats tab | https://help.realbyteapps.com/hc/en-us/articles/360042842734-Stats-tab | Statistics views | Accessed Nov 2026 |
| R22 | Slice — Transaction history / statement | https://help.slice.bank.in/support/solutions/articles/84000399200-how-can-i-share-my-transaction-receipt-where-can-i-view-my-transaction-history- | Passbook, statement, reference numbers | Accessed Nov 2026 |
| R23 | Slice — Merchant API docs | https://developer.slicebank.com | Existence and scope of merchant API | Accessed Nov 2026 |
| R24 | INDmoney — Net worth tracker | https://www.indmoney.com/networth | Net-worth positioning | Accessed Nov 2026 |
| R25 | INDmoney — Features | https://indmoney.com/features | Feature inventory | Accessed Nov 2026 |
| R26 | Axio — Play listing | https://play.google.com/store/apps/details?id=com.daamitt.walnut.app | Current SMS-based tracking, reviews | Accessed Nov 2026 |

## 18.2 Regulatory and government sources

| # | Source | URL | Used for | Date |
|---|---|---|---|---|
| R27 | RBI — NBFC-AA Directions, 2025 | https://rbi.org.in/scripts/BS_ViewMasDirections.aspx?id=12936 | AA registration, consent artefact, NOF | 2025 |
| R28 | RBI — AA Master Direction (consolidated) | https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=10598 | Framework operation | Accessed Nov 2026 |
| R29 | RBI — FIU eligibility notification | https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12558 | Regulated-entity requirement | Accessed Nov 2026 |
| R30 | RBI — FIU definition | https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12936&Mode=0 | "registered with and regulated by any financial sector regulator" | Accessed Nov 2026 |
| R31 | Sahamati — FIU in the AA ecosystem | https://sahamati.org.in/fiu | FIU eligibility (RBI/SEBI/IRDAI/PFRDA) | Accessed Nov 2026 |
| R32 | Dept. of Financial Services — AA Framework | https://financialservices.gov.in/beta/index.php/en/account-aggregator-framework | Official framework overview | Accessed Nov 2026 |
| R33 | PIB — DPDP Rules 2025 notified | https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf | Notification date 14 Nov 2025 | 14 Nov 2025 |
| R34 | PwC India — DPDP Rules 2025 analysis | https://pwc.in/ghost-templates/digital-personal-data-protection-rules-2025.html | Consent/notice obligations | 2025 |
| R35 | DLA Piper — India data protection | https://www.dlapiperdataprotection.com/?t=law&c=IN | DPDP Act obligations | Accessed Nov 2026 |
| R36 | NPCI — UPI product statistics | https://npci.org.in/product/upi/product-statistics | Monthly volume/value | Oct 2026 |
| R37 | NPCI — Bharat Connect overview | https://npci.org.in/who-we-are/group-companies/npci-bharat-billpay-ltd/bharat-connect-overview | BBPS scope | Accessed Nov 2026 |
| R38 | Bharat Connect — CC on UPI for BBPS | https://bharat-connect.com/strapi/uploads/Enabling_payment_mode_Credit_Card_on_UPI_for_BBPS_Payments_d3086cc9b7.pdf | Card bill payment rails | Accessed Nov 2026 |
| R39 | Google Play — SMS and Call Log permissions | https://support.google.com/googleplay/android-developer/answer/10208820?hl=en | SMS exception for money management | Accessed Nov 2026 |
| R40 | Google Play — Permissions declaration preview | https://support.google.com/googleplay/android-developer/answer/17225965?hl=en | Declaration requirements | Accessed Nov 2026 |
| R41 | NSDL — Consolidated Account Statement | https://nsdlcas.nsdl.com/ | CAS coverage (demat + MF) | Accessed Nov 2026 |
| R42 | EPFO passbook guidance (ClearTax) | https://cleartax.in/s/epf-passbook-download | EPF statement access | Accessed Nov 2026 |
| R43 | NPS statement guidance (Outlook Money) | https://outlookmoney.com/retirement/invest/nps/investing-in-nps-heres-how-you-can-check-and-download-nps-statement | NPS statement access | Accessed Nov 2026 |

## 18.3 Academic references

| # | Citation | URL | Key finding used |
|---|---|---|---|
| R44 | Gollwitzer, P. M., & Sheeran, P. (2006). Implementation intentions and goal achievement: A meta-analysis of effects and processes. *Advances in Experimental Social Psychology*, 38, 69–119. | https://doi.org/10.1016/S0065-2601(06)38002-1 | 94 studies; mean **d = 0.65** for implementation intentions |
| R45 | Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. *European Journal of Social Psychology*, 40(6), 998–1009. | https://doi.org/10.1002/ejsp.674 | **Median 66 days** to automaticity, range 18–254; missing a day does not derail habit |
| R46 | Ashraf, N., Karlan, D., & Yin, W. (2006). Tying Odysseus to the mast: Evidence from a commitment savings product in the Philippines. *Quarterly Journal of Economics*, 121(2), 635–672. | https://doi.org/10.1162/qjec.2006.121.2.635 | Commitment savings; **+81 percentage points** average balances after 12 months |
| R47 | Thaler, R. H., & Benartzi, S. (2004). Save More Tomorrow™: Using behavioral economics to increase employee saving. *Journal of Political Economy*, 112(S1), S164–S187. | https://doi.org/10.1086/380085 | Automatic escalation tied to future pay rises increases savings rates |
| R48 | Thaler, R. H. (1999). Mental accounting matters. *Journal of Behavioral Decision Making*, 12(3), 183–206. | https://doi.org/10.1002/(SICI)1099-0771(199909)12:3<183::AID-BDM318>3.0.CO;2-F | Mental accounting; non-fungibility of money |
| R49 | Kahneman, D., & Tversky, A. (1979). Prospect theory: An analysis of decision under risk. *Econometrica*, 47(2), 263–291. | https://doi.org/10.2307/1914185 | Loss aversion; framing effects |
| R50 | Mullainathan, S., & Shafir, E. (2013). *Scarcity: Why Having Too Little Means So Much*. Times Books. | — | Cognitive bandwidth cost of financial scarcity |

## 18.4 Independent and community sources

| # | Source | URL | Used for | Caveat |
|---|---|---|---|---|
| R51 | Livemint — expense tracking apps comparison | https://www.livemint.com/money/personal-finance/expense-tracking-apps-the-pros-and-cons-of-automated-expense-tracking-through-sms-emails-and-aa-system-11691082001354.html | Axio CTO on SMS tracking; channel trade-offs | Journalism |
| R52 | r/foldmoney — SBI/AA sync issues | https://reddit.com/r/foldmoney/ | Real user complaints on AA reliability | **Anecdotal** |
| R53 | r/foldmoney — feature requests | https://reddit.com/r/foldmoney/comments/1l0i470/suggestions_featurerequests | Coverage gaps | **Anecdotal** |
| R54 | r/IndiaFinance — Fold discussion | https://www.reddit.com/r/IndiaFinance/comments/1xsmchx/has_anyone_used_fold_for_expense_tracking_havent/ | Adoption sentiment | **Anecdotal** |
| R55 | 9to5Mac — Copilot review | https://9to5mac.com/2025/06/26/copilot-money-is-the-budgeting-app-youve-been-looking-for | Independent product view | Journalism |
| R56 | Fold — App Store reviews (India) | https://apps.apple.com/in/app/fold-money/id1626994334?see-all=reviews | AA trust sentiment | **Anecdotal** |
| R57 | TechPanchayat — UPI Oct 2026 record | https://techpanchayat.com/upi-transactions-october-2026 | UPI volume corroboration | Secondary |
| R58 | DD News — UPI May 2026 | https://ddnews.gov.in/en/upi-records-23-2-billion-transactions-worth-rs-29-9-trillion-in-may-2026-npci | UPI trend | Government media |
| R59 | Plutos ONE — Bharat Connect guide | https://www.plutosone.com/blog/bharat-connect-bbps-guide | BBPS practical overview | Vendor blog |
| R60 | Actual Budget docs | https://actualbudget.org/docs/ | Local-first envelope budgeting architecture | Open source |

## 18.5 How the references map to the argument

| Argument | Primary support |
|---|---|
| Reports must drill down | R1, R2 |
| Targets need multiple semantics | R5, R6, R8 |
| Review queue + progressive automation | R11, R12 |
| Cards are not on AA | R15 |
| AA requires regulated FIU | R29, R30, R31 |
| DPDP consent is itemised | R33, R34, R35 |
| UPI is the transaction substrate | R36 |
| SMS is policy-permitted but review-gated | R39, R40 |
| Slice has no personal API | R22, R23 (absence of evidence) |
| Transfers must be first-class | R18 |
| CAS is the best MF/demat source | R41 |
| If-then plans work | R44 |
| 66 days, not 21 | R45 |
| Commitment devices work | R46 |
| Automation beats willpower | R47 |
| Buckets help and harm | R48 |
| Shame causes avoidance | R49, R50 |

## 18.6 Source-quality notes

- **R27–R32** are primary regulator sources and should be re-checked before any AA work; RBI amends master directions.
- **R33** is the notification itself; **R34/R35** are secondary analyses and may lag amendments.
- **R36** is a live statistics page; figures quoted here are for **October 2026** and will change monthly.
- **R44–R48** are peer-reviewed; effect sizes are from the published papers, but field effects in a consumer app will be smaller.
- **R52–R56** are **anecdotal**. They are used only to generate hypotheses, never to assert a capability.
- **R14, R15, R23** are vendor sources. They are reliable for *what the vendor says it does*, not proof of working behaviour in all cases.

---

## Appendix A — Verification ledger

| Claim in this document | Label | Basis |
|---|---|---|
| Monarch Reports has Cash Flow / Spending / Income tabs | **[V]** | R1 |
| Monarch supports Sankey, Treemap, Trend Bars, Pie, Breakdown | **[V]** | R1 |
| Monarch saved reports are create-on-web, view-on-mobile | **[V]** | R1 |
| YNAB has weekly/monthly/yearly/custom targets | **[V]** | R5 |
| YNAB has "set aside another" / "refill up to" / "have a balance of" | **[V]** | R5 |
| YNAB auto-calculates payment from a payoff date | **[V]** | R7 |
| Copilot intelligence starts after ~30 reviewed transactions | **[V]** | R11 |
| Copilot excludes Recurrings from the dashboard spending chart | **[V]** | R12 |
| Copilot is US-only | **[V]** | R11 |
| Fold uses AA for banks | **[V]** | R14 |
| Fold parses card emails because cards are not on AA | **[V]** | R15 |
| Fold refreshes AA daily | **[V]** | R14 / R52 |
| Fold has an augmented balance concept | **[V]** | R15 |
| AA FIU must be regulated by RBI/SEBI/IRDAI/PFRDA | **[V]** | R29, R30, R31 |
| NBFC-AA needs ₹2 crore NOF | **[V]** | R27 |
| DPDP Rules notified 14 Nov 2025 | **[V]** | R33 |
| UPI Oct 2026 = 25.47bn txns / ₹31.53 lakh crore | **[V]** | R36 |
| Play permits SMS for money management with declaration | **[V]** | R39, R40 |
| Slice offers statement download with reference numbers | **[V]** | R22 |
| Slice has a merchant API | **[V]** | R23 |
| Slice has a personal-account API | **[U] — assume no** | No evidence in R22/R23 |
| Slice is an AA FIP | **[U]** | Not confirmed |
| Money Manager supports transfers + carry-over budgets | **[V]** | R18, R19 |
| Implementation intentions d = 0.65 | **[V]** | R44 |
| Habit median 66 days | **[V]** | R45 |
| Commitment savings +81pp | **[V]** | R46 |
| SMarT increases savings | **[V]** | R47 |
| Fold's SBI sync is unreliable | **[Anecdotal]** | R52 |
| Axio double-counts card spends | **[Anecdotal]** | R26 |
| Our 4-hero-number home is optimal | **[A]** | Design judgement |
| Our 3-mode budget model is better than YNAB's | **[A]** | Design judgement |
| Statement import is the best card channel for us | **[A]** | Derived from §7.4 |
| A non-regulated app cannot use AA | **[A]** (strongly implied by R29–R31) | Regulatory reading, not legal advice |

## Appendix B — Glossary

| Term | Meaning |
|---|---|
| **AA** | Account Aggregator — RBI-licensed consent/data-sharing framework |
| **FIU** | Financial Information User — regulated entity that receives data via AA |
| **FIP** | Financial Information Provider — entity that supplies data via AA |
| **Consent artefact** | Structured, revocable record of what data may be fetched, why, and for how long |
| **Augmented balance** | Bank balance minus card dues and upcoming commitments |
| **XIRR** | Money-weighted annualised return; correct for SIPs and irregular cash flows |
| **CAS** | Consolidated Account Statement (NSDL/CDSL) covering demat + mutual funds |
| **UTR / RRN** | Unique transaction reference — the dedupe key for payments |
| **VPA** | Virtual Payment Address (e.g. `merchant@okhdfcbank`) |
| **BBPS / Bharat Connect** | NPCI-operated bill payment network |
| **Envelope budget** | Assign money to categories; unspent rolls over |
| **Cap budget** | Spend up to a limit; resets each period |
| **Kind** | The transaction's semantic type (expense/income/transfer/…) — the basis of all analytics |
| **Provenance** | Where a record came from and how confident we are in it |
| **Pace** | Progress adjusted for elapsed time in the period |

## Appendix C — Open questions for the next phase

1. Which FIU partner (if any) is commercially viable, and what does it cost per consent?
2. Is Slice SFB a FIP? (Determines whether Path D exists.)
3. What is the real Slice statement format? (Blocks the parser.)
4. Which Indian banks' statements are PDF-only vs CSV? (Determines parser priorities.)
5. What is the minimum viable retention policy that satisfies DPDP and user expectations?
6. Does the target user segment tolerate a 60-second manual onboarding, or does it churn without aggregation?
7. What is the correct tone calibration for overspend messaging in an Indian context? (Requires interviews.)
8. Should the Slice lens be generalised into "Connected Accounts" from day one, or built as a special case first?

---

**End of document.**

*Prepared 14 November 2026. All regulatory statements reflect sources available on that date and must be re-verified before implementation. This document contains no investment, legal, or tax advice.*
