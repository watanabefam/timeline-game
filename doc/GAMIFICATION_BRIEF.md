# Timeline Game: Gamification Layer — Evidence-Based Design Brief

> Consolidated, implementation-ready spec for the motivational layer (streak,
> calendar, mastery leveling, achievements, celebration) that will sit **on top
> of** the Focus-practice → mastery-system work described in `AGENTS.md`.
> Based on online product/learning-science research (June–Sep 2026) and the
> learning-science vault vendored in `doc/references/`. Nothing here may be
> *incorporated* from a library — all patterns are hand-ported to this repo's
> no-build vanilla stack.
>
> **Last updated:** 2026-10-02 | **Status:** ratified design; **phase 1 (review-log data layer) and phase 2 (mastery leveling) landed**; build order revised and amendments A7–A11 added after auditing the full vault against this layer. Phases 3–9 pending. **A10 amended 2026-10-02** to name *how* FSRS may land later (the L2 placement seam; L3 forking rejected) — the build order is unchanged. Both landed phases are code-complete and gate-green. Phase 1 is data-only (nothing to render); **phase 2's level card is now covered by an automated browser smoke** — `npm run smoke:mastery` (`tools/offline-smoke/mastery.mjs`), which drives the real stats screen in Chromium and asserts the card's DOM against `window.Gamify.mastery()` for all four age bands plus reduced motion. The remaining §13 checklist items still belong to the phases that own them.

---

## Table of Contents

1. [Repository context — read first](#1-repository-context--read-first)
2. [North star](#2-north-star)
3. [Design decisions D1–D8](#3-design-decisions-d1d8)
4. [Cross-product amendments A1–A11](#4-cross-product-amendments-a111)
5. [Age-band gating](#5-age-band-gating)
6. [Data model & storage](#6-data-model--storage)
7. [Where to hook in the code](#7-where-to-hook-in-the-code)
8. [Achievement catalog (starter) & celebration rules](#8-achievement-catalog-starter--celebration-rules)
9. [Copy rules — feedback & praise](#9-copy-rules--feedback--praise)
10. [Non-goals / anti-patterns](#10-non-goals--anti-patterns)
11. [Build order & roadmap cross-references](#11-build-order--roadmap-cross-references)
12. [Success metrics & guardrails](#12-success-metrics--guardrails)
13. [Verification](#13-verification)
14. [Evidence sources](#14-evidence-sources)
15. [Open decisions](#15-open-decisions)

---

## 1. Repository context — read first

This brief is a design/evidence doc, **not** a replacement for the repo's
conventions. Before implementing, an agent must be aware of:

- **`AGENTS.md`** (repo root) — the binding conventions:
  - **Hard rule 1:** no build step, no framework, no npm runtime deps. First-party
    code = classic (non-module) IIFE scripts. Vendored third-party libs ship an
    ESM build under `assets/vendor/` (allowed) but this layer needs **none** —
    everything here is hand-ported plain HTML/CSS/JS.
  - **Hard rule 2:** never edit anything under `assets/`.
  - **Hard rule 3:** cache-bust `?v=N` on every edited first-party script
    (`fx.js`, `timeline.js`, …). Bump when changed.
  - **Hard rule 4:** script load order in `index.html` matters; `fx.js` defines
    `window.FX` and loads before `timeline.js`. The FX layer forbids main-thread
    work between curtain cover and reveal.
  - **FX conventions:** reduced motion is a **hard floor** — read
    `matchMedia("(prefers-reduced-motion: reduce)")` at call time; OS setting
    overrides the in-game toggle. Celebration intensity must scale with rarity
    and must have a reduced-motion story.
  - **Content gate:** `npm run validate` after touching deck data (Node ≥18).
  - **Product direction (2026-09):** Focus practice is evolving into a **mastery
    system**. Persist raw review outcomes `(event_id, profile_id, timestamp,
    outcome)` as an **append-only log** and derive scheduler state behind a
    `rate(outcome) → nextDue` interface (FSRS target; SM-2 acceptable start).
    **This brief is the companion spec for the motivational surfaces around that
    mastery core.** Never make features educational-audience-only — everything
    stays playable by casual users.
- **`doc/CROSS_PLATFORM_ROADMAP.md`** — future hosting/cloud context this design
  must stay forward-compatible with: §6.4 Cloud Profile Sync (per-profile state
  will later sync server-side ⇒ keep the log append-only and achievement state
  *derived*, never a mutable counter that can desync); §10 Phase 7 Social &
  Competitive (leaderboards/challenges arrive **only** in a later server phase —
  see D6 for the local opt-in rule that precedes it).
- **`doc/MARKET_COMPARISON.md`** — competitive context: streak tracking exists in
  Defrag and Sorting History; achievements in The Timeline Game (iOS). Their
  streak/freeze/Paywalled patterns are the cautionary baseline, not the model.
- **`README.md`** — player/content docs.
- **Learning-science vault (vendored here 2026-09-30):**
  - `doc/references/mcg_research_synthesis.md` — 26 fronts (18 research fronts +
    cross-front decision layers + a media landscape) with effect sizes, boundary
    conditions and anti-patterns. §4 amendments A1–A11 are the subset that
    transfers; most of the vault is course-content pedagogy (lesson templates,
    SCORM, quiz blueprints) and should **not** pull this game toward "course"
    territory.
  - `doc/references/evidence-base.md` — per-pattern evidence ratings
    (✅/🟡/⚠️/❌) for the patterns we borrowed. **Scope caveat:** it was written
    for the sibling Montessori grammar-symbol project, so only its **§7
    gamification** row (local-only/no-leaderboards is the right call; mastery
    must outrank the streak) and its general SDT/feedback rows transfer. Its
    grammar-symbol, Montessori-material and dyslexia-font rows do **not** apply
    here — do not act on them from this repo.
  - The older `Education/course-studio/…` paths are the vault's pre-vendoring
    home; the in-repo `doc/references/` copies are now authoritative.

---

## 2. North star

> Anti-pattern: **"Gamification without learning — adding points, badges, and
> streaks without ensuring the underlying interaction has cognitive depth.
> Gamification sustains motivation; it does not replace pedagogical
> interaction."** — MCG synthesis §24 (line 874)

Every mechanic in this spec is **derived decoration over the retrieval +
feedback loop**. The game's real product is placing events *and learning why*;
if a mechanic ever rewards a placement without feedback, the mechanic is wrong.

Evidence summary (full sources in §14): meta-analyses show gamification raises
motivation modestly (intrinsic g≈0.26–0.64), strongest for secondary-school
students (g≈1.0), weakest for primary (g≈0.31); the measured wins come from
autonomy/feedback/progression, and the benefits invert when mechanics reward
volume, punish mistakes, or force social comparison. Duolingo's public 600+
streak-experiment data is the only large-scale field evidence and it says the
**mechanics details dominate the presence of the feature**.

---

## 3. Design decisions D1–D8

### D1 — Streak = "touched a timeline today", fully decoupled from score/XP
- **Evidence:** Duolingo separated streak from daily goal: +3.3% D14 retention,
  +10.5% on-streak learners, +19% for new learners; high-goal users were the
  *least* likely to hold streaks.
- **Spec:** a streak day is earned by completing **one placement round** (a
  round = one run; a loss still counts — learning happened). Score/perfect/XP
  never touch the streak.
- **Hook:** inside `recordRun()` (timeline.js:3730), after `writeUser`.

### D2 — Forgiveness is a feature, not a cheat
- **Evidence:** JCR (Silverman et al. 2023): users who break streaks often quit;
  users who know streaks are repairable value them less. Penn/UCLA: "slack"
  increases long-term persistence. Duolingo: 2 freezes raised DAU; earn-back
  beat purchasable repair.
- **Spec:** (a) one **auto-freeze/week** (first miss in a calendar week doesn't
  break the chain); (b) a **3-day grace** — returning after a break shows
  "paused" and resumes, never a broken flame; (c) **no paid repair, no shame
  copy, no loss-anxiety notifications**. Dark-pattern ladder is off-limits.
- This is a homeschool tool for children — D2 is non-negotiable.

### D3 — Streak/XP/achievements are *derived*, and must not fight the scheduler
- **Evidence:** SRS and daily streaks pull in opposite directions (spacing wants
  variable gaps; streaks want daily return); Duolingo's "minimum viable lesson"
  problem shows grind incentives degrade learning.
- **Spec (the core architectural rule):** the append-only **review log**
  (`AGENTS.md` product direction) is the only write. Streak calendar, level,
  and every achievement are **pure functions of that log** — no mutable
  counters. A practice day = ≥1 review/placement row that day. Streak credit is
  **never** awarded for volume, and review content is never gated behind the
  streak (the FSRS due-queue blocks the grind exploit naturally).
- Decide day-vs-week now (see §15); the log schema is identical either way.

### D4 — Reward mastery, not volume; celebrate competence, not payout
- **Evidence:** SDT meta-analyses — competence feedback raises intrinsic
  motivation; volume-points systems are where rewards go toxic; primary-age
  children game easy tasks for points.
- **Spec:** level/title advancement uses **quality signals you already record**
  — first-try placements, perfect runs, curriculum-week mastery ≥80% (computed
  today in stats/focus, timeline.js:1572, 1701). Do **not** add a total-XP
  counter that rewards farming short easy rounds. Keep per-round points
  informational (as today), never the level engine.
-  Preserve the existing competence voice in `showResults()` (timeline.js:3620):
  "Perfect timeline!", "…but now you know something new."

### D5 — Achievements: few, real, reveal-able; no inflation, no day-0 progress bars
- **Evidence:** trivial rewards feel meaningless; mystery/novelty beats
  full-disclosure in element-combination meta-analyses.
- **Spec:** a curated **12–20** set, each a named milestone with a readable
  predicate over the log (§8). Locked achievements show as **hidden "?" teasers
  or nothing** — never a 0% bar. No volume-only achievements; no achievements
  for consecutive days beyond the streak itself.

### D6 — Leaderboards: local family, opt-in, off by default
- **Evidence:** social comparison is the most consistent *negative* finding for
  lower performers and younger kids; but relatedness is the largest measured
  SDT need in learning games (g≈1.8) — relevant only for siblings on one device.
- **Spec:** no global/league board (this repo has no backend anyway). Optional
  per-profile "Family league" (this week's first-try accuracy among profiles on
  this device): **opt-in per child, default off**, no rank shown below 3rd,
  every row shows progress not just position. Cross-check later against roadmap
  §10 (Phase 7 server leaderboards) — the opt-in default should carry over.

### D7 — Age-aware presentation (mechanic-identical, density/copy differ)
- **Evidence:** K-12 meta-analysis — gamification most effective for secondary,
  least for primary; younger kids need immediate multisensory feedback and get
  overwhelmed by dense chrome.
- **Spec:** same mechanics for all profiles (AGENTS.md: never
  educational-only). If an optional profile `ageBand` is set, gate **copy
  density, surface visibility, and practice-mix** only (§5). No age set =
  adult/casual defaults.

### D8 — Reduced motion & celebration decibels
- **Spec:** every celebration respects `prefers-reduced-motion` (hard floor).
  Intensity scales with rarity (small burst → full sequence). No auto-play
  celebration SFX louder than the existing loudness ladder; unlock modal in
  reduced-motion = silent static card. Achievements queue for the results
  screen — never animate between curtain cover/reveal (FX-layer rule).

---

## 4. Cross-product amendments A1–A11

Transferable findings from the learning-science vault, now vendored at
`doc/references/mcg_research_synthesis.md` (§-references) and
`doc/references/evidence-base.md` (per-pattern ratings). A1–A6 were extracted
while the vault still lived in the sibling `course-studio` repo; **A7–A11 were
added 2026-09-30**, when it landed here and the *full* 26-front synthesis could
be audited against this layer instead of only its originally-quoted subset.

Only these transfer. The vault is course-content pedagogy and should not pull
this game toward "course" territory: what transfers is the **learning
mechanism**, never the course template (lesson templates, SCORM tiers, quiz
blueprints and prompt engineering stay out).

### A1 — §24 quote is the north star (§2 above).
### A2 — Interleaving gate: blocked practice for young learners
- **§11 (verbal content g=−0.39 for interleaving) + §20 age-gate (Interleaving:
  Never for 5–7 and 8–11; Conditional 12+).**
- Construct mapping is imperfect (unique events ≠ category exemplars), so treat
  as design signal, not law. **Spec:** for `ageBand` 5–11, practice/focus rounds
  are composed **within a coherent block** (same CC curriculum week / era /
  continent — week-scoped practice already exists); 12+/casual use mixed sets
  (where the FSRS due-queue naturally sits). Gate on profile age, not content.

### A3 — Age-gate as optional profile fields (§5 table).
### A4 — Feedback & praise copy rules (§9).
### A5 — Streak calendar = SRL monitoring tool (elevate it)
- **§13:** monitoring tools d=0.42; goal-progress monitoring d=0.40; process
  goals > outcome goals. Anti-pattern: "set a goal, never revisit it."
- **Spec:** frame the calendar as visible progress/monitoring (not a trap). If a
  "commit to a weekly goal" UI is ever added (12+ only), the results screen must
  **monitor and revisit it** — otherwise it's an empty goal.

### A6 — Productive-failure guardrails on loss/focus states
- **§23:** failure is only productive when the attempt is structured, the
  canonical solution follows with explanation, it never feels like a test, and
  it's skipped for true novices/5–7.
- **Spec:** after an Endless loss, slipped events get the same fact-reveal
  treatment as wins; no red "test failed" framing; a brand-new profile's first
  round must be short/winnable so a failure state cannot occur on run #1
  (early-win rule, P1-8 / §2).

### A7 — Narration is a support, not a transcript (⚠️ mixed evidence — move it, don't remove it)
- **§17 conflict rule (explicit):** *"In self-paced courses, text + image is
  sufficient. Do NOT add spoken narration to written text — the redundancy effect
  (Adesope & Nesbit 2011) outweighs UDL's representation goal."* §6 names our
  exact configuration as an anti-pattern: **"Full transcript as caption —
  on-screen text that is an exact duplicate of the voiceover."**
- **Why it lands here.** The clip is generated from `title + fact`
  (`tools/narration/text.mjs` → `spokenText`) and the card *displays* those same
  two fields, so the shipped narration is a verbatim read-along — and
  `timeline.js:2682` autoplays it on **every card load**, i.e. over the exact
  moment the child must read the card and decide where it goes. That is
  redundancy *plus* split attention (§6, §7) at the retrieval moment, which is
  the one moment this game cannot afford it. Narration also defaults **on**
  (`narration.js` `boot()`).
- **Honest counterweight.** The redundancy meta is genuinely mixed: spoken +
  written can *beat* written alone for **low prior knowledge, system-paced,
  picture-free** material, and audio is the accessibility layer for pre-readers
  (§3 UDL). Our learners are low-prior-knowledge but *self-paced* — which is why
  this is ⚠️, not a verdict to delete the feature.
- **Spec (cheap, reversible, testable):** keep the feature and the existing
  toggle; change *when* it fires. Autoplay at the **reveal/story moment** (after
  placement) rather than on the deciding card, and always leave an on-demand
  listen control on the card. Per band, §5. One call-site change
  (`timeline.js:2682`) plus the reveal hook — revisit first if narration is ever
  retuned.

### A8 — One predirected micro-prompt before the reveal (✅ strong, tiny cost)
- **§9:** self-explanation prompts g=0.55 overall, but the *format* dominates —
  fill-in-the-blank g=0.90, **predirected g=0.70**, multiple-choice **g=0.24**
  (the weakest). §13 supplies the rule that keeps it honest: *"Simply asking
  learners to rate confidence without revealing actual accuracy does not improve
  calibration. Every confidence prompt must be followed by the correct answer
  disclosure."*
- **Spec:** at most **one** prompt per round (prompt fatigue — §9 and §13 both
  cap this at 1–2 per section), placed **before** the reveal and always followed
  immediately by it. Predirected form only (*"Which event do you think came just
  before this one?"*); never a multiple-choice self-explanation. Age gates per
  §20: 5–7 **skip** it (abstract self-rating overloads working memory — progress
  indicators only); 8–11 one simple self-check; 12+ full cycle.
- **Compound payoff:** the answer is a second signal beside
  `outcome: firstTry|slip`. Record it as an optional `confidence` field on the
  same append-only row (never backfilled) — self-rated confidence is the
  eventual `rate(outcome) → nextDue` grade's weakest input today, and D3's
  derived-state rule makes adding it safe.

### A9 — Keep the retrieval moment quiet (🟡 hypothesis — cheapest of the five)
- **§7 (coherence, segmenting), §4 (`seductive details` effect), §3 (ADHD design:
  "calm neutral colour palette, minimalist layouts").** The FX layer's ambient
  chrome — curtain, vignette, shake, floatText, confetti — is *celebration*; during
  the placement decision it is extraneous load with no learning job.
- **Spec:** extend the existing `timeline.fx` toggle (`fx.js:27`) rather than
  adding a second control — ambient FX suppressed in Focus/game, celebrations
  untouched on the results screen, reduced-motion floor unchanged (D8). Available
  to every profile (AGENTS.md: never educational-only); defaulted per band only
  when `ageBand` is actually set.
- **Mark this a hypothesis.** The mapped evidence is about *instructional
  materials*, not ambient motion. Validate it against the §12 harm check
  (slips/run must not rise) before treating it as settled.

### A10 — For a history corpus, reach-back beats interval precision (✅ — saves work)
- **§10 boundary:** *"For humanities/ethics/awareness courses, retrieval practice
  still works but the spacing interval matters less — interleaving concepts from
  earlier modules is the primary benefit."* Spacing effects are strongest in
  isolated training (g=0.43), weaker course-embedded (g=0.24), and most
  consistently demonstrated in **STEM** — not in history.
- **Spec:** keep `rate(outcome) → nextDue` exactly as specified (AGENTS.md) — but
  the first mastery win to build is the **reach-back due-queue** (surface events
  last seen k rounds ago, weighted toward an earlier era/week), *not* FSRS
  parameter tuning and *not* the ts-fsrs vendoring. **Do not gate any phase in
  §11 on FSRS landing.** For the 5–11 bands this stays *blocked* per A2 — reach
  back within the same era/week, never across it.
- **How FSRS is allowed to land later** (added 2026-10-02; a project *decision*,
  not an evidence finding): when FSRS is adopted it lands at the **L2 seam** —
  placements are fed as `elapsedDays` through `next_state`/`next_interval` and
  the returned day-count is converted back to `dueAfterPlacements`. FSRS supplies
  only a per-card *ranking* behind the existing `rate(outcome) → nextDue`
  interface; it never replaces the interface. **Forking the vendored source (L3)
  is rejected** — rule 2 forbids editing `assets/`, and `validate:vendor`
  (`scripts/check-vendored.mjs`) is header-based, not provenance-based, so a fork
  would ship unguarded. This changes *how* FSRS lands, not *when*: the reach-back
  queue is still first and §11 is still not gated on FSRS. Two costs, recorded as
  **inference**: day-fit weights are off-distribution for placement units
  (recoverable later via `generatorParameters`), and only 2 of the 4 `Rating`s
  are reachable from `outcome` alone — A8's `confidence` field briefly supplied
  the other two and was **retired 2026-10-02** (`doc/CONNECTION_CUE_PLAN.md`
  §5.5), which is a real cost of that retirement and is recorded as such. See
  §15.9.

### A11 — Model one placement, once, then get out of the way (✅ cheap, age-gated)
- **§19 matrix:** for a knowledge course, Worked Examples = **Optional** and
  Cognitive Apprenticeship = **Skip** — so do **not** build a worked-example
  ladder or a fading sequence. But §20 keeps **modeling** for 5–7 ("Modeling +
  exploration only"), and §14's own boundary says the worked-example effect is
  *smaller for declarative knowledge (history facts)*.
- **Why it lands here.** Onboarding today *is* the **"How to play" modal**
  (`index.html:444`, opened by `#how-btn` at :52), and it is §2's first
  anti-pattern verbatim — **"feature tour as onboarding"**: five ordered steps
  about choosing a deck, picking a gap and the 3-point/1-slip economy, with no
  example placement and no *why*. It also **leads with the scoring economy**,
  which is the §9/D4 concern ("points never crowd out the feedback moment")
  standing in the very first thing a new player reads. There is no modeled
  placement anywhere in the game (verified 2026-09-30). §2's other trap,
  **"no early win"**, is already A6's to own.
- **Spec:** the first run demonstrates **one complete place → why** cycle on a
  finished example (*"this mentions the printing press, so it goes after 1440 —
  that's why it sits here"*), then hands over. One example, not a ladder; skipped
  for profiles that have already completed a run (§14 expertise reversal —
  demonstrating a placement the player can already do is worse than nothing).

### Conflict ledger (tensions this layer actually faces)

The vault resolves cross-front conflicts in its §17; these are the ones that bite
*this* layer. Recorded here so the next agent does not re-litigate them.

| Tension | Resolution in this layer | Basis |
|---|---|---|
| Narration vs redundancy | Keep it, **move it to the reveal**; never a verbatim read-along over the deciding card | §6, §17 → A7 |
| Mastery-first vs streak-first | Mastery is the **progress signal**, the streak is retention support; never ship a streak as the *only* visible progress surface | §10/§8 vs evidence-base §7; D3, D4 |
| Transfer-appropriate format vs interaction variety | Keep **placement** as the single graded format (§21: practice must match the performance task); vary the *scaffold* (anchors offered, era width, direction), not the graded format — §24's variety targets sameness *across content types* | §21 vs §24 |
| Interleaving benefit vs age gate | Blocked for 5–11, conditional 12+ (already A2); A10's reach-back must respect it | §11, §20 |
| Elaborated feedback vs efficiency | Depth by age band: full elaboration 5–11, moderate 12–16, concise 17+ | §8, §17; §5 |

---

## 5. Age-band gating

Optional per-profile field: `ageBand` ∈ `{ "5-7", "8-11", "12-16", "17+" }`
(derived from an optional stored birth year; unset = adult/casual defaults).
Source table: MCG §20 (values High/Medium/Low/Skip condensed).

| Surface / behavior | 5–7 | 8–11 | 12–16 / casual | Evidence row |
|---|---|---|---|---|
| Practice-mix in rounds | Blocked (week/era) | Blocked | Mixed OK | Interleaving (A2) |
| Mastery % + "not enough data yet" copy | Hide — show stars/streak only | Show, simple | Show full | SRL (A3) |
| Weekly-goal opt-in ("commit") | Never | Never | Optional, must monitor | SDT Autonomy / A5 |
| Difficulty framing copy ("this feels tricky…") | Skip | Framing only | Full framing | Desirable Difficulties |
| Post-slip feedback depth | Full elaboration | Full elaboration | Moderate | Feedback Depth |
| Narration timing (A7) | At the reveal | At the reveal | On-demand | Multimedia §6 |
| Pre-reveal prompt (A8) | Skip (progress indicators only) | One simple self-check | Full cycle | Self-explanation §9 |
| Competition (family league) | Never | Opt-in off default | Opt-in off default | Social comparison |

Implementation: one `band(profile)` helper; **no feature hidden behind age unless
the profile actually set it** — unset behaves as the highest band.

**Built 2026-09-30 (phase 2):** `band()` lands at `timeline.js:500` and the
optional band dropdown lives in the stats header (`#stats-band`,
`index.html` + `renderStats()`). The applied row is the **Mastery %** row
(level card, "Mastery by week" on the stats screen, **and the home focus panel
since phase 4**). The **Pre-reveal prompt** row was built in phase 4 and then
**retired the same day** — see §11, phase 4, and `doc/CONNECTION_CUE_PLAN.md` §0.
Only the **Narration timing** row is still pending (phase 8).
`renderFocusPanel()`'s `Mastery NN%` gap for 5–7 was closed in phase 4 (task 4d).

**Browser-verified:** the level card's DOM contract is asserted end-to-end by
`tools/offline-smoke/mastery.mjs` (`npm run smoke:mastery`, 18/18 checks in
Chromium, ~8 s). It seeds one profile whose mastery score is exactly 15 (4
mastered events + 1 mastered week + 2 capped perfect runs), reaches the stats
screen through the real UI (user button → player name), and checks that the DOM
title/badge/bar agree with `window.Gamify.mastery()`; that band 17+ shows the
numeric breakdown; that 8–11 drops it; that 5–7 loses the badge, the bar, the
card's percentage and the level number and turns the weekly rows into a star readout;
that an unset band behaves as the highest; and that all of it still holds under
`prefers-reduced-motion: reduce`. It is **not** part of `npm test` (it needs a
browser download), and it does not verify print output, pixel appearance or iOS.

---

## 6. Data model & storage

All new state is **derived** from the review log; only the log + tiny config are
written. Existing shapes (timeline.js:333–398) unchanged:

```
"timeline.users.v1"                       → { users: [{id,name,createdAt,hue,ageBand?}], activeId }
"timeline.user.<id>.v1"                   → { decks: { <deckId>: {
    totals: { runs,totalScore,totalMax,perfectRuns,totalPlacements,totalSlips },
    runs: [...], events: { <eventId>: { placements, slips, firstTry } } } } }
```

New (per user, appended inside the existing `writeUser` path) — ✅ **shipped
2026-09-30** (phase 1):

```
"timeline.user.<id>.v1" += {
  reviewLog: [ { ts, deck, eventId, outcome: "firstTry"|"slip", mode } ],
                                        // append-only, cap 2000, oldest pruned
  meta: { tz: "Europe/Berlin" }         // IANA only, never fixed offset
}
```

The row is `{ ts, deck, eventId, outcome, mode }` and nothing more. Phase 4
briefly added an optional `confidence` field (A8) and it was **retired
2026-10-02**: inferring it from `outcome` makes it a pure function of `outcome`
— identical information, and D3 forbids persisting derived state — so it would
have had to be *asked*, at the cost of a second interaction at the deciding
moment (`doc/CONNECTION_CUE_PLAN.md` §5.5). `outcome` is the single accuracy
signal. Adding a field to an append-only log is safe *only* because nothing
derives state from a mutable counter (D3); any future field must meet the same
bar **and** carry information `outcome` does not.

- Streak/calendar/level/achievements = pure functions over `reviewLog` +
  existing `totals`/`events`. Nothing else is written, so cloud-profile sync
  (roadmap §6.4) can later replicate the log verbatim and re-derive state —
  this is the entire reason for the derived-state rule.
- Compute in **local calendar days** from stored IANA `tz`; handle DST with
  date math, not hour arithmetic. Detect tz change on load; apply forward only.
- `localStorage` writes stay wrapped in `try/catch` (existing convention);
  log cap prevents quota pressure.

---

## 7. Where to hook in the code

Line refs **re-verified 2026-10-02** (`timeline.js` 4,595 lines; `fx.js` 690;
`index.html` 533; `styles.css` 1,777) — the **second half of `timeline.js`
drifted +62 lines** when the reach-back review round landed (T5/T6: the
`reviewDueEvents`/`startReviewRound` insertion around :2400), so every ref past
that point below was corrected in place. They move between commits, so verify
again before editing:

| Hook | Location | Use |
|---|---|---|
| `recordRun(state)` | timeline.js:3730 | Append one review-log row set; then re-derive streak/level/achievements; call `writeUser` (already here). **Note:** it already writes per-player, so in split-screen each player's outcomes land in their own profile |
| `finishGame(ctx, won)` | timeline.js:3775 | Queue achievement unlocks + next streak milestone for the results screen |
| `showResults(ctx, won)` | timeline.js:3827 | Achievement-unlocked modal mounts here (post-curtain); the existing graded confetti is the pattern to extend |
| `FX.confetti({tier})` | fx.js:385 | Add rarity tiers ("light" first-run … "epic" mastered-week) |
| `renderStats()` | timeline.js:1552 | Mastery-level card (phase 2, live) + age-band copy switch (A3); achievement surfaces (phase 6) |
| `masteryOf(p)` / `band(user)` | timeline.js:549 / :500 | The phase-2 derivations — pure, deck-agnostic; the whole level comes from here |
| `renderFocusPanel()` → `$("focus-panel")` | timeline.js:1821 (host :1822) | Blocked-mix composition for 5–11 (A2); desirable-difficulty framing line (8–11). **Still shows `Mastery NN%` for 5–7** — §5 gap noted in §11 |
| Week-mastery calc (`firstTry / placements`) | timeline.js:1709 (stats), :1846 (focus) | The quality signal D4 levels from; `placements < 3` already renders "not enough data yet" |
| `Narrator.speakEvent(ev, …)` | timeline.js:2682 (prefetch :2687) | Autoplay site — **moves to the reveal per A7**; today it fires on every card load |
| "How to play" modal | index.html:485 (`#how-btn` :74) | A11: leads with the points economy; needs one modeled *place → why* example |
| Session log write (`appendReviewLog`) | timeline.js:445 | Cap enforcement (oldest pruned); the only write path for the log |
| `syncTimezone()` | timeline.js:479 (called from `init()`) | Forward-only tz re-sync |
| `window.Gamify` | timeline.js:595 | Read-only accessors: `reviewLog`, `activeDays`, `currentStreak`, **`mastery`, `band`**, `timezone` |
| Profile create/registry | `newUser()` timeline.js:339 (`USERS_KEY` :333, `readUser`/`writeUser` :394/:398) | Optional `ageBand` field. **Set from the stats screen** (`#stats-band`, index.html) — deliberately not at create time, so §15.2's "Not set" default survives profile creation |

New code ships either appended to the `timeline.js` IIFE as a `Gamify = {…}`
module-level object (matches `FX`/`DECKS` global convention) or, if split out,
as a **new classic script `gamify.js`** loaded after `fx.js` in `index.html`
with `?v=1` and a new AGENTS.md file-map entry. No new build artifacts.

---

## 8. Achievement catalog (starter) & celebration rules

Predicates over existing data — all earnable, none volume-gated:

| Achievement | Predicate (over `totals`/`events`/`reviewLog`) | Notes |
|---|---|---|
| First timeline | ≥1 completed run | First-run celebration; ties to early-win (A6) |
| Flawless | ≥1 `perfectRuns` | Reward ≠ mastery; keep it "rare-ish" |
| Historian | 50 distinct events with ≥1 first-try placement | Cross-deck OK |
| Week mastered | any curriculum week at 100% mastery | Uses existing week mastery calc |
| Comeback | complete a run on the day after a miss | Turns D2 into a positive story |
| Mapmaker | 25 events placed first-try that have map coords | Optional; ties to Leaflet identity |

Celebration rules: intensity tier by rarity; reduced-motion = silent static
card; unlock copy states *what was earned and why it matters*, never rank vs
other profiles; SFX within loudness ladder; no confetti spam — queue and play
one unlock at a time on results.

---

## 9. Copy rules — feedback & praise

Derived from Feedback Quality (MCG §8 / P2) + Retrieval §10:
- **No empty feedback.** Wrong placements reveal the answer with a one-line
  *why* (existing fact cards are the vehicle; ensure the moment-of-slip reveal
  carries it, not only the results screen).
- **Process praise, never person praise:** "You ruled out the wrong century —
  good reasoning" ✅ · "You're so smart!" ❌. Audit existing copy for person
  praise.
- **Points never crowd out the feedback moment.**
- **Desirable-difficulty framing** on hard content (focus/Endless): "This may
  feel tricky — that's your brain building stronger connections." Skip for 5–7
  (framing only for 8–11; A3).
- **Loss/failure framing** per A6: informative, kind, never "test failed".

---

## 10. Non-goals / anti-patterns

| Don't | Because |
|---|---|
| Hearts/lives/mistake penalties | Punishes the retrieval errors that drive learning; monetization pattern |
| Volume-XP as level engine | Rewards grind; kids game easy content (D4) |
| Streak repair purchases / anxiety notifications | Dark-pattern ladder; JCR: repair devalues streaks (D2) |
| Global or default-on leaderboards | Consistent negative finding for low performers (D6) |
| >~20 achievements; day-0 0% bars; badge flood | Trivial rewards feel meaningless; kills novelty (D5) |
| Daily streak gating review content | Fights FSRS variable gaps; grind incentive (D3) |
| Any mechanic without a reduced-motion story | AGENTS.md hard floor (D8) |
| Gamification replacing feedback depth | The north star (§2) |

---

## 11. Build order & roadmap cross-references

Phases (each independently shippable):

1. **Data layer:** ✅ **shipped 2026-09-30.** `reviewLog` appended in `recordRun()`
   (one row per practiced card: `{ ts, deck, eventId, outcome, mode }`, capped at
   2000); IANA `meta.tz` written with the log and re-synced forward-only on load
   (`syncTimezone()` in `init()`); pure `activeDays()` / `currentStreak()`
   derivation from local calendar days. Exposed read-only as `window.Gamify`.
   No UI (unchanged).
2. **Mastery leveling** on the stats screen from existing quality signals (D4);
   age-band copy switch (A3). ✅ **Landed 2026-09-30** — see "what landed"
   below. **Ordered ahead of the streak UI (was phase 3)**
   after auditing the vault: evidence-base §7 rates gamification 🟡 — *"keep
   streaks/badges as light support, but make mastery the real progress signal;
   never let the streak become the goal"* — while retrieval practice and
   elaborated feedback are the ✅-rated engines (§16). Shipping the streak first
   would make it the *only* visible progress surface for that window, which is
   precisely the misuse pattern §7 warns about. *Counter-argument, recorded:*
   Duolingo's streak-separation data makes the streak the stronger **retention**
   lever, so if retention is the near-term priority, ship 2 and 5 **together** in
   one UI phase rather than reordering again.

   **What landed (2026-09-30), and the decisions it forced.** A profile-wide
   `masteryOf(profile)` derives one `{ score, index, title, next, pct, … }`
   object from the signals D4 names, and `renderStats()` draws a level card
   above the deck-scoped overview. Points a reader will want justified:
   - **The score is quality-only and volume is worth nothing.** `masteredEvents`
     (≥80% first-try accuracy, the bar the stats screen already used for a week)
     + 5 per **mastered week** (≥3 placements at ≥80%) + 3 per perfect run,
     **capped at 5 perfect runs**. The cap is the anti-farm clause: replaying a
     short easy deck can contribute at most 15 of the first 80 marks, so a level
     built mainly from distinct mastered events cannot be bought with volume.
   - **Mastery is recoverable.** An event is judged on its *ratio*, not on a
     never-slipped-again flag, so a single early slip does not lock an event out
     of "mastered" forever. Volume alone still earns nothing: 500 placements on
     a 50% event derive a score of 0.
   - **Level is a property of the player, not of the open deck** (§6's derived
     rule), so it reads every deck even when the stats screen is scoped to one.
     Weeks are therefore keyed **per deck as well as by number** — two decks both
     have a "Week 3", and merging them would invent a week no curriculum has.
   - **Ladder:** Newcomer → Explorer → Apprentice Historian → Chronicler →
     Historian → Master Historian → Keeper of the Timeline (0/4/10/20/35/55/80).
     Thresholds, not XP: §15.3 still owns the final names.
   - **Age gating is now reachable.** `band(user)` implements §5 with "unset =
     highest band", and the stats header carries the **optional band dropdown**
     §15.2 recommended ("Not set" default), so the 5–7 branch is testable rather
     than dead code. For 5–7 the level card shows the title and an encouraging
     line with **no score, no percentage and no bar**, and the "Mastery by week"
     rows swap the percentage and the "not enough data yet" copy for a 0–4 star
     readout.
   - **Known gap at the time, now closed:** §5's mastery-% row was applied to
     the **stats screen only**; `renderFocusPanel()` (home) still printed
     `Mastery NN%` for a 5–7 profile. Phase 2 was scoped to the stats screen and
     this was a one-line follow-up — **closed in phase 4** (task 4d,
     2026-10-02).
3. **Reach-back due-queue** over the review log (A10). `rate(outcome) → nextDue`
   stays the interface; for a history corpus reach-back is the first mastery win,
   ahead of FSRS parameter work or the ts-fsrs vendoring. Age-gated per A2 —
   within the block for 5–11. The algorithm behind the interface is **swappable at
   A10's L2 seam**: a future FSRS swap changes the `replay`/`rate` bodies only —
   the interface is unchanged and the vendored lib is never forked.
4. **Feedback depth at the moment of the slip** (§8/§9 copy rules, EFE — the only
   feedback type effective for low prior knowledge) **+ one predirected
   pre-reveal prompt** and the optional `confidence` field (A8). ⚠️ **Partly
   landed, then largely retired 2026-10-02** — only the 4d warm-up survives; see
   "what landed" below and `doc/CONNECTION_CUE_PLAN.md` §0. The slip-moment
   explanation is re-opened as a connection cue there.
5. **Streak UI:** profile/home chip + calendar (port Trophy UI's Streak Calendar
   *structure* to a plain CSS grid); forgiveness states + copy (D2, A5).
6. **Achievements:** predicate registry + unlocked modal; new `FX` rarity tiers
   (D8).
7. **First-run modeling** (A11): one *place → why* cycle on a finished example,
   skipped once a profile has completed a run.
8. **Narration timing** (A7) + **quiet retrieval moment** (A9): one call-site
   change each (`timeline.js:2682`; `fx.js:27`), no schema change.
9. **Optional:** family league (D6) once multi-profile usage justifies it.

Phases 2 and 5 are both UI-level and may land in either order — the *pair* is
what matters; the streak must not ship alone (see the counter-argument in 2).

**What landed (2026-10-02), phase 4 (A8).** Four small parts were built; after
review **three were retired the same day** and one survives. Full reasoning in
`doc/CONNECTION_CUE_PLAN.md` §0.
- **4d — the phase-2 warm-up.** ✅ **Survives.** `renderFocusPanel()` now applies
  the same 5–7 gate as the stats card: stars, no percentage (the non-numeric bar
  stays).
- **4a — the why at the slip reveal.** ❌ **Retired.** A *significance* line
  cannot explain a **placement**, and it duplicated the fact-sheet popover's
  existing `Why it matters` row — one slipped card showed the why up to three
  times (rescue callout, the inline line, the popover).
  `doc/CONNECTION_CUE_PLAN.md` replaces it with a cue built from the
  already-authored `connections[]` edges — **shipped 2026-10-03** (`connections.js`
  plus the two slip render sites; `npm run smoke:connections` covers the wiring).
- **4b — the pre-reveal prompt.** ❌ **Retired.** It fired on the round's first
  card, where "the event just before this one" is a given anchor or does not
  exist, and its cue had no input — the only controls were *I'm sure / Not sure /
  Skip*, i.e. the two-button self-report §9 rates weakest (g=0.24) with an
  unanswerable question above it. Dropping it also removes the second interaction
  at the deciding moment.
- **4c — the optional `confidence` field.** ❌ **Retired** — see §6 and
  `doc/CONNECTION_CUE_PLAN.md` §5.5. The schema is back to
  `{ ts, deck, eventId, outcome, mode }`.
- **Also removed:** `prompt-plan.js`, `scripts/test/prompt-plan.test.mjs`, the
  `test:prompt` chain entry, the `.tl-why*` and `.tl-prompt*` CSS, and the boot
  `<script>` tag (manifest was back to **133 files** then; **134** as of
  2026-10-03, after `connections.js` joined the boot shell).
- **Not changed:** score/XP/level (G5), the review-scheduler interface (A10's
  seam), and the log cap.
- **Verified:** `npm run smoke:feedback` (Chromium, 24 checks) now proves the
  absences — no `.tl-prompt`, no `.tl-why`, no `confidence` row, for every band
  and under reduced motion — and still covers the 4d focus panel.
- **Falsifier, re-aimed:** whether a slip-moment explanation helps learning was
  never measured; it becomes a playtest question for the connection cue, which
  carries its own falsifier (`doc/CONNECTION_CUE_PLAN.md` §3).

Forward-compat: phases 1–9 must not write state a future server cannot re-derive
from a synced log (roadmap §6.4). Phase 7 of the roadmap (server social) is
*gated on* D6's local opt-in design being validated first.

---

## 12. Success metrics & guardrails

Keep measurement minimal (no analytics infra — this is client-side):
- **Primary:** weekly return rate per profile; % of profiles reaching ≥7-day
  streaks (Duolingo's best proxy); focus-round completion rate.
- **Harm checks (must not regress):** no mechanic increases average slips/run
  (grind signal); no red/punitive framing added; reduced-motion parity on all
  new surfaces.
- Content gate: this layer touches no deck data, so the `npm run validate` chain
  (`validate:index`, `:content`, `:vendor`, `:recipe`, `:narration`,
  `:sourcing`) stays green.
- **Do not misread that green as "the content is sourced".** It is not. Sourcing
  is a **ratchet, not a pass**: `content/sourcing-backlog.json` records **0
  sourced / 321 unsourced events** against an accepted ceiling of 321, with
  `cc-timeline` and `world-literature` grandfathered, and `validate:pipeline`
  (the strict `SOURCE_MISSING` gate) is **deliberately excluded from the
  `validate` chain** — the script prints a notice saying so instead. This is the
  same principle the content pipeline states for itself: enumerating exposure is
  not closing it (`doc/CONTENT_PIPELINE.md` §3). A green `validate` therefore
  proves nothing about grounding; only `npm run validate:pipeline` speaks to that.
- **Known-failing gate, pre-existing and unrelated (2026-09-30):**
  `validate:backlog` fails — *"pronunciation-backlog.json is stale (0 open word(s)
  now, on disk: 138)"* — and so does the one test that asserts the committed
  backlog is current (`tools/narration/test/backlog.test.mjs:28`). Diagnosed: the
  narration push's new lexicon/reference layer resolved every previously-unknown
  spoken word, so the generator now derives an **empty** open set and the payload
  hash no longer matches the checked-in file (on disk `50f5911a1b77`, derived
  `38bfbe07fd53`). `npm run gen:backlog` is the mechanical resync and is the
  intended workflow — the accepted ceiling (`138`) lives in **code**, not in the
  file, precisely so a regeneration cannot blur the ratchet. Left unrun here
  because it rewrites tracked content data; it is a narration-tooling follow-up
  for the 2026-09-30 push, **not** a regression from this layer.

---

## 13. Verification

No unit-test framework — extend the existing browser smoke checklist
(`python3 -m http.server 8000`):
- Complete one round → streak increments **once**, not per-card.
- Miss a day → freeze consumed, chain intact; miss again → "paused" state, no
  broken-flame shame UI.
- Wrong-first-try on two events → mastery drops, **no** penalty UI appears.
- **Mastery level (phase 2):** the level card advances on first-try accuracy
  and ≥80% weeks; replaying the shortest deck over and over must **not** move it
  (volume earns nothing), while cleaning up an event that was previously slipped
  **does** count once its own ratio clears 80%.
- **Age band (phase 2, A3):** set a profile to 5–7 → the level card shows the
  name and a friendly line with **no** score, percentage or bar, and "Mastery by
  week" shows stars and never "not enough data yet". Set it back to "Not set" →
  the full readout returns (unset = highest band).
- **Mastery level card — now automated:** `npm run smoke:mastery`
  (`tools/offline-smoke/mastery.mjs`) covers the level card, the age gate and
  the reduced-motion path in Chromium; run it instead of clicking by hand for
  that surface.
- Achievements unlock once, queue on results, never mid-curtain.
- Reduced-motion emulation → celebrations silent/static but still recorded.
- Pre-reveal prompt (A8): appears at most **once per round**, is always followed
  by the reveal in the same interaction, and is absent entirely for a 5–7 profile.
- Narration (A7): does **not** autoplay on the deciding card; plays at the reveal;
  the on-demand listen control still works; toggling it off mid-round silences it.
- Quiet mode (A9): with `timeline.fx` off, Focus/game ambient FX are suppressed
  while results-screen celebrations still play; reduced-motion parity holds.
- Two profiles → independent logs/streaks; switch active profile correctly.
- `?v=` bumped on every edited first-party script (AGENTS.md rule 3).

---

## 14. Evidence sources

**Gamification / product (primary for this layer):**
- Kurnaz & Koçtürk 2025, *Meta-analysis of gamification on K-12 motivation*
  (Psychology in the Schools) — age & motivation-type effects.
- Li, Hew & Du 2024, *Gamification & intrinsic motivation meta-analysis*
  (ETR&D) — SDT needs; leaderboard/badge risk analysis.
- Ratinho et al. 2026, *Gamification in mathematics meta-analysis* (Educ Psych
  Review) — balance competition vs mastery.
- Yu 2020 / Mansur 2022, Duolingo engineering blog (streak separation,
  habit/loss-aversion); Lenny's Newsletter, *Behind the product: Duolingo
  Streaks* (2024, 600-experiment lessons).
- Silverman et al. 2023, *On or Off Track: How Streaks Affect Consumer
  Decisions* (JCR).
- Kaißer et al. 2025, *Age-aware gamification* (arXiv:2512.15630) — dark
  patterns, minors, overstimulation.
- EJ1483889 (2025), element-combination meta — mystery/novelty supports D5.
- Pattern ports (structure only, MIT): Trophy UI (ui.trophy.so) — Streak
  Calendar, Achievement Unlocked/Grid, Points Levels Timeline; LingoKit UI
  (github.com/shade-solutions/lingokit-ui) — playful-learning design
  principles (tactile, reward-every-action). Neither is incorporable (React/
  Tailwind); port to plain CSS behind existing `styles.css` tokens.

**Learning-science pedagogy (amendments A1–A11) — vendored in `doc/references/`:**
- `doc/references/mcg_research_synthesis.md` — §§2, 3, 4, 6, 7, 8, 9, 10, 11, 13,
  14, 15, 17, 19, 20, 21, 23, 24, plus the §16 priority matrix. Section numbers
  ("§11") throughout this brief refer to this file.
- `doc/references/evidence-base.md` — ratings/corrections for the borrowed
  patterns. **Only its §7 (gamification) and general SDT/feedback rows apply to
  this repo** — it was written for the sibling Montessori grammar project; see the
  scope caveat in §1 before quoting it.
- Primary sources newly cited by A7–A11: Adesope & Nesbit 2011 (redundancy meta,
  k=57); Noetel et al. 2021 (multimedia meta-meta, 29 reviews); Sweller, van
  Merriënboer & Paas 2019 (CLT retrospective); Bisra et al. 2018 (self-explanation
  meta, k=68); Guo 2022 (metacognitive prompts, g=0.50); Dignath et al. 2023
  (monitoring tools, d=0.42); Murray et al. 2025 + Bego et al. 2024 (spacing, and
  its weaker humanities/embedded boundary); Renkl 2014 and Barbieri et al. 2023
  (worked examples — cited as the reason **not** to build a WE ladder); Kalyuga et
  al. 2003 (expertise reversal); Collins, Brown & Newman 1989 (modeling).
- The old `Education/course-studio/…` paths were the vault's pre-vendoring home;
  the in-repo `doc/references/` copies are now authoritative.

---

## 15. Open decisions

1. **Streak granularity:** daily chain vs "X of 7 days this week". Daily is the
   stronger Duolingo-validated pattern; weekly is gentler for 5–11 and less
   SRS-hostile. Recommendation: daily with D2 forgiveness; revisit if 5–11
   churn data says otherwise.
2. **`ageBand` input:** store birth year or band at profile create? (Default:
   optional band dropdown, "Not set" default.) **Resolved 2026-09-30:** the
   default was implemented as-is, but on the **stats screen** rather than at
   profile create — a band chosen before a profile has any progress is a
   decision the player has no reason to make, and putting it next to the level
   card keeps cause and effect visible.
3. **Level names/titles:** which milestones and whether first-try-only or
   include perfect-run credit (D4).
4. Whether leveling replaces or coexists with per-round points display.
5. Exact port list from Trophy/LingoKit to port (see §8 + §11 phase 5/6).
6. **Narration timing (A7):** does moving autoplay to the reveal actually help,
   and how is it measured? This is the only amendment touching an *accessibility*
   feature, so it needs the §12 harm check plus an explicit read-along path for
   5–7 if the change regresses their experience.
7. **Phase 2 vs 5 order** (mastery leveling vs streak UI): the evidence-led order
   is mastery first, but Duolingo's streak-separation data argues the other way.
   Decide before starting either — the *pair* must not ship split (§11 phase 2,
   conflict ledger).
8. ~~Whether `confidence` (A8) is worth the UI cost outside Focus practice.~~
   **Closed 2026-10-02:** it was not. The field is retired — inferring it from
   `outcome` carries no information, so it would have to be *asked*, and asking
   cost a second interaction at the deciding moment. The `Hard`/`Easy` grades it
   existed for stay unreachable from `outcome` alone; if calibration is wanted it
   belongs in the predict-then-disclose mode at `doc/STUDY_MODES.md` §3.2. See
   `doc/CONNECTION_CUE_PLAN.md` §5.5.
9. **FSRS: day-primary (`repeat(card, rating)`) vs placement-primary (the L2
   seam)?** Deferred until the log is large enough to retrain weights
   (`generatorParameters`). The placement-primary path is the recorded intent
   (A10); day-primary stays the fallback if placement units prove unusable. The
   5–11 band stays blocked per A2 either way.
