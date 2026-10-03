# Commercial Plan — evidence base & decision

> **Last updated:** 2026-10-02 | **Status:** **research recorded, decision NOT taken.**
> Nothing here is ratified. It exists because `doc/SUCCESS_FACTORS.md` §6.5 and
> `doc/MARKET_COMPARISON.md` §203 both require a commercial plan to rest on
> *named, checkable* sources, and because the current pricing in
> `doc/CROSS_PLATFORM_ROADMAP.md` §13 is contradicted by the evidence below.
> The open decision is the user's, not an agent's — see §6.

**Scope note (binding).** This corpus is **independent** of
`doc/SUCCESS_FACTORS.md`. That corpus is practitioner/marketing material with no
effect sizes, and §6.5 of it forbids commercial citation. Every claim below comes
from a different source class — a subscription-IaaS benchmark report, an
issuer's own investor disclosure, an analytics vendor's retention study, a
marketplace's published fee schedule. Do not merge the two bodies of evidence,
and do not cite `SUCCESS_FACTORS.md` from here.

---

## 1. Evidence grades used here

| Grade | Meaning |
|---|---|
| **High** | Primary measurement, large n, method published, independently checkable |
| **Medium** | Primary but single-source, or secondary reporting of primary data |
| **Low** | Vendor marketing, anecdote, or a projection rather than a measurement |

**A standing caveat on the whole monetization section.** Adapty, RevenueCat and
Airbridge all sell subscription tooling. Their reports are methodologically
honest — this doc uses them because they publish sample sizes — but their
*incentive* is to make subscription look good. Where a grade **Low** source
appears alone, treat it as a hypothesis. Where a grade **High** measurement is
reported by two vendors who share that incentive, discount it.

---

## 2. Monetization evidence

Primary source: **Adapty SOIS 2026** (state of in-app subscriptions, 16,000+
apps, $3B subscription revenue). Grade **Medium** — large n and published
method, but vendor-published and subscription-biased. Cross-checked against
**Duolingo's own investor disclosure** (Q4 2025 figures), which is Grade **High**
and comes from a company with no incentive to understate paid penetration.

### 2.1 What the Education category actually pays

| Metric | Value | Grade | Source |
|---|---|---|---|
| Education avg 12-month LTV (all plans) | $45.10 | Medium | Adapty SOIS 2026 |
| Education annual-plan LTV | $45.80 | Medium | Adapty SOIS 2026 (2025 ref) |
| Education trial LTV premium vs direct buyers | +50.4% | Medium | Adapty SOIS 2026 |
| Education trial starts on Day 0 | 71.3% | Medium | Adapty SOIS 2026 |
| Education trial starts at Day 31+ | **23.5% — highest of any category** | Medium | Adapty SOIS 2026 |
| US average 12-month LTV | $19.90 | Medium | Adapty SOIS 2026 |
| Duolingo paid penetration (Q4 2025) | **9.2%**, up from 5% at 2021 IPO | **High** | [Duolingo IR](https://investors.duolingo.com/company-strategy-overview-0) |
| Duolingo scale at that penetration | 133.1M MAU / 52.7M DAU / 12.2M paid | **High** | Duolingo IR |

### 2.2 The one finding that changes the plan

> **One-time purchases have grown to 17% of Education revenue, up from 6% in
> 2023.** Grade **Medium**. — Adapty SOIS 2026

This is the fastest-moving monetization behavior in the category, and it points
at *content ownership*, not access rental. It is independent support for the
paid-deck-pack model in `doc/CLOUDLESS_PLAN.md` §3 (`.timedeck` Tier 2), and it
is the opposite of what `CROSS_PLATFORM_ROADMAP.md` §13 assumes.

### 2.3 Findings that constrain the roadmap

| Finding | Grade | Roadmap text it contradicts |
|---|---|---|
| **Monthly plans underperform in every category**, at every price tier. Education weekly = 52% of revenue, annual = 22%, monthly = **9%**. | Medium | §13.1's core tier is `$9.99/mo`. It sits in the worst-performing slot in the category. |
| **Hard paywalls do not scale.** Duolingo: *"This scale wouldn't be possible with a hard paywall."* | **High** | §13.4 recommends hard paywall + 7-day trial as the primary mechanism. |
| Education discount adoption is the **fastest-growing of any category** (14.3%, from 10.5%) — a documented risk of training users to wait. | Medium | §13.4 has no discount guidance at all. |
| Annual > monthly > weekly in *retention*; weekly is a low-risk entry point, not the destination. | Medium | §13.3's launch order introduces **monthly first**. |

### 2.4 Positioning evidence (the free promise is an asset)

Duolingo's own stated beliefs, Grade **High** (issuer disclosure):

- *"The freemium business model is good for our mission and our business."*
- *"Spammy notifications, deceptive patterns, and heavy paid acquisition are
  short-term tactics."*
- Growth investment is **product-first**, *"focusing on organic brand-building."*

This retroactively supports `AGENTS.md`'s product direction and
`GAMIFICATION_BRIEF.md` §10's prohibition on hearts, lives and streak-repair
purchases. **Do not reopen the free/no-ads/no-IAP posture** on revenue
grounds — the evidence above is against it, not for it. The open question in
`SUCCESS_FACTORS.md` §9 Q1 ("is it ever sold?") is now partly answered: sold
*alongside* a free core, yes; sold *instead of* it, no.

---

## 3. Retention evidence

Primary source: **GameAnalytics** (median across ~11,600 games) and the
2026 revised-benchmark corpus. Grade **Medium**.

- 2026 realistic benchmark: **D1 35% / D7 15% / D30 5%** — down from the older
  40/20/10 heuristic. A16z's social-app framing (D1 50 / D7 35 / D30 20 for
  "OK") is Grade **Low** and mobile-social-skewed; use it as a ceiling, not a
  target.
- **D1 measures onboarding; D7 measures the habit loop; D30 measures depth.**

**Consequence for this repo.** `MARKET_COMPARISON.md` §5.2 rates the daily
challenge "Critical" and §3 shows it unbuilt. Four of five web competitors run
one. Without it there is no D7 — no reason for a player to return on a
non-coincidental day. `CLOUDLESS_PLAN.md` §2.4 already rules the client-side
date-seeded PRNG **permanent** (Wordle's daily is entirely client-side; no
server evaluates it), so this is not a cloud-gated item.

**Conflict with the pedagogy layer.** `GAMIFICATION_BRIEF.md` D3 warns that
daily-gating fights a spaced-repetition core. Resolution: a daily must be an
*offer*, never a *cap*. The reach-back review scheduler (`review-scheduler.js`)
stays uncapped; the daily is the door, the review queue is the room.

---

## 4. Distribution evidence

| Channel | Finding | Grade | Why it fits a no-backend app |
|---|---|---|---|
| **Share artifacts** | Wordle's growth is attributed to the one-tap emoji grid: spoiler-free, self-explaining, copyable. | High (well-documented) | `shareText()` already ships flat text; the grid does not (`MARKET_COMPARISON.md` §5.2 #3). |
| **User-created content** | Quizlet's verified growth came from student-created study sets, not marketing (EdSurge 2019). | Medium | Deck import/export (`decks-io.js`) already ships; the *sharing loop* around it does not. `SUCCESS_FACTORS.md` §6.1 reaches the same conclusion. |
| **itch.io** | ~90/10 revenue split, no per-game fee (vs Steam's $100 + 30%), no review queue. | High (published policy) | Accepts a plain static build — no bundler, no app store, no account. Best first paid channel. |
| **Teacher aggregators** | The recurring request in teacher communities is free, no ads, no prep, offline-capable. | Low (community anecdote) | Already true of this product. Cheap to reach: submit to the free-app lists. |

### 4.1 Explicitly NOT recommended yet

- **App stores first.** 10–14 weeks of backend work for zero existing users, and
  it forfeits the no-account / no-IAP differentiator to a 15–30% store cut.
  `CROSS_PLATFORM_ROADMAP.md` §16.1 prices this honestly; the sequencing is
  what's wrong, not the estimate.
- **Paid acquisition.** No evidence base, no budget, and Duolingo's own
  disclosure calls it a short-term tactic (§2.4).

---

## 5. Payments

A Merchant of Record is required, not a payment processor: selling digital goods
to families across jurisdictions means someone must be the seller of record for
VAT/sales-tax, invoicing and disputes. Raw Stripe Checkout leaves that liability
with a solo developer.

| Option | Why | Watch out for |
|---|---|---|
| **Paddle** | MoR; static checkout with no server round-trip; supports one-time products | MoR pricing carries a premium over raw Stripe |
| **Lemon Squeezy** | MoR; same shape | Same |
| **Dodo Payments** | MoR, developer-first | Less established |

**Architecture fit:** a MoR checkout + webhook is the *only* piece of this plan
that needs any server, and `CROSS_PLATFORM_ROADMAP.md` §19.10 T3 already scopes
entitlement + offline lease for `.timedeck` packages. Defer until there is
someone to charge — see §6.

---

## 6. The open decision (needs the user)

`SUCCESS_FACTORS.md` §9 Q1 asked whether this game is ever sold. The evidence
above answers it as **"yes, alongside a free core; no, instead of one."** What it
does **not** settle is pricing and packaging, which is a judgment call about how
much content the project can realistically produce:

| Option | Model | Evidence fit | Cost to build |
|---|---|---|---|
| **A. Free core + paid deck packs** | $3–9 one-time per deck | **Strongest.** §2.2 shows one-time growing to 17% of Education revenue; §2.4 supports keeping the core free | Low — `decks-io.js` + MoR + entitlement |
| **B. Free core + annual "Pro"** | Annual only, ~$29–39/yr | Moderate. Annual beats monthly (§2.3); US LTV ceiling is $19.90/user (§2.1) so this needs volume | Medium — needs backend entitlements |
| **C. Subscription monthly** | $9.99/mo | **Weakest.** Worst-performing slot in the category; contradicts §2.4 | High |
| **D. Sell once, no free tier** | $15–30 outright | Contradicts Duolingo's stated evidence on scale | Lowest |

Recommendation: **A**, with **D** as a later bundle channel via itch.io. Neither
C nor the roadmap's current §13.1 tier is supported by this evidence.

---

## 7. What this doc does NOT change

Per `SUCCESS_FACTORS.md` §6.4, none of this re-opens a ratified decision:
the gamification layer, the mastery/FSRS append-only log, the content gate, deck
focus, and the free/no-IAP posture all stand. This document informs **pricing,
packaging, sequencing and channel choice** only.

## 8. Sources

1. **Adapty, "In-app subscription benchmarks for Education apps"** (SOIS 2026).
   16,000+ apps, $3B subscription revenue. https://adapty.io/blog/education-app-subscription-benchmarks/ — **Medium.** Vendor-published; subscription-biased by business model.
2. **Duolingo, Inc., "Company Strategy Overview"** (Q4 2025 figures). https://investors.duolingo.com/company-strategy-overview-0 — **High.** Issuer disclosure, verifiable, incentive to overstate paid penetration only.
3. **GameAnalytics, "How to think about retention in games."** https://www.gameanalytics.com/blog/how-to-think-about-retention-in-games — **Medium.** ~11,600-game median.
4. **Invest Game, "Mobile retention benchmarks 2026"** (PDF). https://investgame.net/... — **Medium.** Secondary reporting of the primary median; used only for the 35/15/5 revision.
5. **a16z, "Do You Have Lightning in a Bottle?"** (social-app retention framing). https://a16z.com/do-you-have-lightning-in-a-bottle-how-to-benchmark-your-social-app/ — **Low.** Mobile-social-skewed; cited as a ceiling only.
6. **TechCrunch, "Wordle brought tens of millions of new users to NYT"** (2022). https://techcrunch.com/2022/05/04/wordle-new-york-times-user-growth/ — **High** for the share-grid mechanism specifically.
7. **Generalist Programmer / Fungies, itch.io vs Steam fee comparison** (2026). https://generalistprogrammer.com/... — **Medium.** Secondary; the split is also verifiable against itch.io's own published terms.
8. **Paddle / Lemon Squeezy / Dodo product docs.** — **Medium** for mechanics (checkout shape, MoR liability), **not** used for any performance claim.

**Not cited here, deliberately:** `doc/SUCCESS_FACTORS.md` (§6.5), the
practitioner corpus behind it, and any AI-generated summary of either.
