# Timeline Game: Gamification Layer — Evidence-Based Design Brief

> Consolidated, implementation-ready spec for the motivational layer (streak,
> calendar, mastery leveling, achievements, celebration) that will sit **on top
> of** the Focus-practice → mastery-system work described in `AGENTS.md`.
> Based on online product/learning-science research (June–Sep 2026) and the
> evidence vault in the sibling `course-studio` repo. Nothing here may be
> *incorporated* from a library — all patterns are hand-ported to this repo's
> no-build vanilla stack.
>
> **Last updated:** 2026-09-09 | **Status:** ratified design, not yet implemented.

---

## Table of Contents

1. [Repository context — read first](#1-repository-context--read-first)
2. [North star](#2-north-star)
3. [Design decisions D1–D8](#3-design-decisions-d1d8)
4. [Cross-product amendments A1–A6](#4-cross-product-amendments-a1a6)
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
- **Sibling evidence vault (NOT in this repo):**
  `Education/course-studio/mcg_research_priorities.md` and
  `mcg_research_synthesis.md` (course-content pedagogy; §4 amendments A1–A6 are
  the transferable subset — most of that vault does **not** apply to a game).

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
- **Hook:** inside `recordRun()` (timeline.js:1982), after `writeUser`.

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
  today in stats/focus, timeline.js:1145, 1274). Do **not** add a total-XP
  counter that rewards farming short easy rounds. Keep per-round points
  informational (as today), never the level engine.
- Preserve the existing competence voice in `showResults()` (timeline.js:2026):
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

## 4. Cross-product amendments A1–A6

Transferable findings from the sibling `course-studio` evidence vault
(`mcg_research_priorities.md` = P-references; `mcg_research_synthesis.md` =
§-references). Only these transfer; the rest of that vault is course-content
pedagogy and should not pull this game toward "course" territory.

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
| Competition (family league) | Never | Opt-in off default | Opt-in off default | Social comparison |

Implementation: one `band(profile)` helper; **no feature hidden behind age unless
the profile actually set it** — unset behaves as the highest band.

---

## 6. Data model & storage

All new state is **derived** from the review log; only the log + tiny config are
written. Existing shapes (timeline.js:138–209) unchanged:

```
"timeline.users.v1"                       → { users: [{id,name,createdAt,hue,ageBand?}], activeId }
"timeline.user.<id>.v1"                   → { decks: { <deckId>: {
    totals: { runs,totalScore,totalMax,perfectRuns,totalPlacements,totalSlips },
    runs: [...], events: { <eventId>: { placements, slips, firstTry } } } } }
```

New (per user, appended inside the existing `writeUser` path):

```
"timeline.user.<id>.v1" += {
  reviewLog: [ { ts, deck, eventId, outcome: "firstTry"|"slip", mode } ],   // append-only, cap ~2000, oldest pruned
  meta: { tz: "Europe/Berlin" }                                             // IANA only, never fixed offset
}
```

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

Line refs as of 2026-09-09 (`timeline.js`, 2,640 lines) — verify before editing:

| Hook | Location | Use |
|---|---|---|
| `recordRun()` | ~1982 | Append one review-log row set; then re-derive streak/level/achievements; call `writeUser` (already here) |
| `finishGame(won)` | ~2019 | Queue achievement unlocks + next streak milestone for the results screen |
| `showResults(won)` | ~2026 | Achievement-unlocked modal mounts here (post-curtain); existing graded confetti at ~2078 is the pattern to extend |
| `FX.confetti({tier})` | fx.js:385 | Add rarity tiers ("light" first-run … "epic" mastered-week) |
| `renderStats()` | ~1022 | Mastery-level/achievement surfaces; age-band copy switch (A3) |
| Focus panel (`focus-panel` host) | ~1250 | Blocked-mix composition for 5–11 (A2); desirable-difficulty framing line (8–11) |
| Profile create/registry | `newUser()` ~144 | Optional `ageBand` field (unset by default) |

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

1. **Data layer:** `reviewLog` appended in `recordRun()`; day/streak derivation;
   `tz` meta. No UI.
2. **Streak UI:** profile/home chip + calendar (port Trophy UI's Streak Calendar
   *structure* to a plain CSS grid); forgiveness states + copy (D2).
3. **Mastery leveling** on the stats screen from existing quality signals (D4);
   age-band copy switch (A3).
4. **Achievements:** predicate registry + unlocked modal; new `FX` rarity tiers
   (D8).
5. **Optional:** family league (D6) once multi-profile usage justifies it.

Forward-compat: phases 1–4 must not write state a future server cannot re-derive
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
- Content gate: `npm run validate` still passes (no deck data touched by this
  layer).

---

## 13. Verification

No unit-test framework — extend the existing browser smoke checklist
(`python3 -m http.server 8000`):
- Complete one round → streak increments **once**, not per-card.
- Miss a day → freeze consumed, chain intact; miss again → "paused" state, no
  broken-flame shame UI.
- Wrong-first-try on two events → mastery drops, **no** penalty UI appears.
- Achievements unlock once, queue on results, never mid-curtain.
- Reduced-motion emulation → celebrations silent/static but still recorded.
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

**Course-content pedagogy (amendments A1–A6 only):**
- `Education/course-studio/mcg_research_priorities.md` — P-rules.
- `Education/course-studio/mcg_research_synthesis.md` — §11 Interleaving,
  §13 SRL, §20 age-gate, §23 Productive Failure, §24 Interaction-First,
  §8 Feedback, §2 Onboarding, §5 SDT.

---

## 15. Open decisions

1. **Streak granularity:** daily chain vs "X of 7 days this week". Daily is the
   stronger Duolingo-validated pattern; weekly is gentler for 5–11 and less
   SRS-hostile. Recommendation: daily with D2 forgiveness; revisit if 5–11
   churn data says otherwise.
2. **`ageBand` input:** store birth year or band at profile create? (Default:
   optional band dropdown, "Not set" default.)
3. **Level names/titles:** which milestones and whether first-try-only or
   include perfect-run credit (D4).
4. Whether leveling replaces or coexists with per-round points display.
5. Exact port list from Trophy/LingoKit to port (see §8 + §11 phase 2/4).
