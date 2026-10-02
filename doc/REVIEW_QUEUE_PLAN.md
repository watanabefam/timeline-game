# Reach-Back Review Queue — Planning Document (Phases 1–3)

**Status:** planning complete — **awaiting approval before implementation (Phase 4)**
**Date:** 2026-10-01 (FSRS-forward-compat revised 2026-10-02 — L2 placement seam named, L3 forking rejected; see `GAMIFICATION_BRIEF.md` A10)
**Scope:** the review/retrieval scheduler that re-surfaces previously-placed events behind a `rate(outcome) → nextDue` seam.
**Companions (source of truth above this doc):** `doc/GAMIFICATION_BRIEF.md` A10 + §11 step 3 + §6 (data model); `doc/CLOUDLESS_PLAN.md` S2; evidence `doc/references/mcg_research_synthesis.md` §10, §11, §20.

> This document is the **planning artifact** for one deliverable. It is deliberately
> **pre-implementation**: it defines the requirements (Phase 1), the design (Phase 2),
> and the ordered task plan (Phase 3). No game code is written until Phase 4 is approved.
> Per AGENTS.md, this is a learning surface, so it cites `doc/references/` by § number.

**Research basis (carried forward):** vendored evidence `§10` (retrieval/spacing — for
humanities the *interval matters less* than *reaching back to earlier material*), `§11`
(interleaving g=0.42 but **hurts verbal/expository g=−0.39**; ages 5–11 never interleave;
keep retrieval success ≥ ~50%), `§20` + A2 (age gates). Prior art: *Make It Stick*
("reach back to retrieve prior material"), **FSRS** (`ts-fsrs`, MIT, ships ESM/CJS/UMD;
**FSRS** (`ts-fsrs` 5.4.2, MIT, UMD) as the future brain — used at the **L2 placement
seam** (`next_state`/`next_interval`, placements fed as `elapsedDays`; A10), not day-primary
`repeat(card, rating)` — and **Leitner / expanding intervals** (1-3-7-14-30) as the
transparent MVP heuristic.

---

## Phase 1 — Requirements / Spec

### Carried Forward
- No-build vanilla JS game; educational (homeschool-first), casual-accessible; 4 decks / 321 events.
- Phase 1 (append-only `reviewLog`) and phase 2 (mastery leveling) are **shipped** (`timeline.js:446` append, `:455`/`:597` read; shape in `GAMIFICATION_BRIEF §6`).
- Hard rules: derive all state from the log (D3), cite `doc/references/` by §, no new runtime deps, age-gate per A2/§20, reduced-motion is a hard floor (D8), `?v=` bump on edited first-party scripts (rule 3).
- Evidence favors **reach-back breadth over interval precision** (§10) → build the reach-back queue first, behind a swappable seam; do **not** gate on FSRS (A10).

### Overview
Add a **review queue** that re-surfaces previously-placed events the learner is due to
revisit, chosen by a reach-back rule (seen least-recently / most-struggling / weighted to
earlier material), and expose the scheduling decision behind `rate(outcome) → nextDue` so
the algorithm can later be swapped to FSRS/SM-2 without changing callers.

### Problem / Opportunity
Today the game re-serves random events; nothing brings back what a learner saw *k* rounds
ago, so retention is left to chance. This turns the shipped `reviewLog` into a learning
engine and is the "first mastery win" (A10).

### Goals
- **G1** Surface a due set of previously-seen events for review, chosen by reach-back (recency + struggle + earlier-material weighting).
- **G2** Encapsulate scheduling behind `rate(outcome) → nextDue`, swappable to FSRS/SM-2 later.
- **G3** Derive **all** scheduler state from `reviewLog`; never persist mutable scheduler state (D3).
- **G4** Respect age gates (A2/§20) and reduced-motion (D8).
- **G5** Keep retrieval **ungraded** (no score/XP from reviews; `GAMIFICATION_BRIEF §13`).
- **G6** Degrade gracefully when nothing is due.

### Non-Goals
- **FSRS parameter tuning** is out of MVP, and the `ts-fsrs` vendoring is
  **sequenced later, not forbidden** (A10). If it lands it is **L2-only** (the
  placement seam below); forking the vendored lib is rejected (rule 2).
- Server/cloud sync (roadmap §6.4) — but the derived design must stay sync-compatible.
- New schema fields (e.g. `confidence?` — that's phase 4 / A8).
- A new game *mode*; achievements / streak / leveling (later phases).
- Editing `assets/`, or any runtime npm dependency.

### Users / Personas
- **Homeschool family (primary):** parent + child (bands 5–7 / 8–11 / 12–16). Needs safe, age-appropriate, no-explanation-needed review.
- **Casual player (secondary):** wants a quick "brush up" round without thinking about scheduling.

### Core User Journeys
- **J1 (surfacing):** Player finishes a round → the surface offers a **"Review round"** (or the focus round is populated from the due set) → player starts it → places the re-served events.
- **J2 (nothing due):** No events are due → a calm, age-appropriate "all caught up" state (never a dead button).
- **J3 (age-gated):** 5–11 profile → review stays within the current era/week block; 12+ / unset → cross-era reach-back is offered.

### Functional Requirements
- **FR1** `replay(logRows) → state`: derive per-event scheduler state from the append-only `reviewLog` (on load).
- **FR2** `rate(state, outcome) → { state′, nextDue }`: pure; `outcome ∈ {"firstTry","slip"}`. Expanding interval on success, reset/contract on slip (Leitner-style promotion).
- **FR3** `dueSet(log, deck, band, opts) → [eventId]`: the reach-back set — events whose last placement is ≥ *k* placements back (log-tail recency), weighted to earlier era/week and lower accuracy, capped in size.
- **FR4** Age gate: band `5–7`/`8–11` → restrict the due set to the same era/week block (A2/§20); `12+`/unset → cross-era allowed.
- **FR5** Surfacing: feed `dueSet` into the existing **`startGame(forcedPool)`** mechanic (reused by "Focus round"), presented as a "Review round"; or populate the focus panel. *(Decision → Phase 2.)*
- **FR6** Empty/short-log handling: return an empty set and show the J2 state; never throw or render a dead surface.
- **FR7** No score/XP change from review placements (G5).

### Non-Functional Requirements
- **NFR1 Pure & Node-testable:** `replay`/`rate`/`dueSet` are pure (no DOM), unit-testable in Node.
- **NFR2 Deterministic:** same log + input → same output (needed for tests and the FSRS swap).
- **NFR3 Performance:** `replay` is O(|log|) on load; log capped at 2000 rows (existing) so this is bounded.
- **NFR4 Accessibility:** reduced-motion parity (D8); no drag-only interaction; screen-reader-legible.
- **NFR5 Compatibility:** no-build classic script; no new runtime deps (rule 1).

### Constraints / Guardrails
- Derive, don't persist (D3); no mutable scheduler state on disk.
- No new `reviewLog` fields (`§6`: `confidence?` is the only sanctioned addition, and it's phase 4).
- Interleaving/spacing must be conservative for verbal content (`§11` g=−0.39) and never for 5–11 (A2).
- Keep retrieval success ≥ ~50% (desirable-difficulty ceiling, `§11`).
- Any future `ts-fsrs` = vendored MIT/UMD `5.4.2` under `assets/vendor/` + a `THIRD_PARTY_LICENSES.md` row (rule 2), loaded by a classic `<script>` before `review-scheduler.js` (rule 4), with `?v=` bumps (rule 3) — **out of MVP**. It lands **L2-only** (placements as `elapsedDays`); **L3 (forking) is rejected** — `validate:vendor` is header-based, not provenance-based, so a fork would ship unguarded.
- First-party script edits require a `?v=` bump (rule 3).

### Edge Cases
- New profile / empty `reviewLog` → J2 empty state.
- Log pruned (cap 2000) → derive from what remains; never assume history completeness.
- Single-deck, single-era log → due set may be entirely within one block (still valid).
- All due events are "hard" (low accuracy) → cap/trim so success stays ≥ 50% (`§11`).
- Profile age band changes mid-play → recompute the due set with the new gate.
- Timezone/DST: recency uses log **ordering** (not wall-clock), so DST-safe; any time-based `nextDue` uses the existing IANA `tz` date-math convention (`§6`).

### Acceptance Criteria
- **AC1** Given a seeded `reviewLog`, `dueSet` returns events last seen ≥ *k* placements ago, earlier-era/week-weighted, deterministic.
- **AC2** `rate` maps `firstTry`→wider interval, `slip`→narrower; `nextDue` is derived, not stored.
- **AC3** For a 5–11 band, `dueSet` never returns an event outside the current era/week block.
- **AC4** Empty log → empty set + J2 state, no error.
- **AC5** Review placements do not change score/XP/level.
- **AC6** `replay` reconstructs identical state from the log across two runs (deterministic).
- **AC7** `npm run validate` stays green (except the known `validate:backlog`); Node tests for the pure functions pass; one browser smoke confirms J1 surfacing.

### MVP Scope
`replay` + `rate` + `dueSet` (pure, Node-tested) **+** surfacing via the existing
`startGame(forcedPool)` / "Focus round" path with an age-gated "Review round" **+** the J2
empty state. FSRS/SM-2 and new schema are explicitly out.

### Future Phases
- FSRS/SM-2 brain behind the same seam (`ts-fsrs` vendored, **L2-only** per A10; L3 forking rejected).
- `confidence?`-aware grading (A8, phase 4).
- Review round as its own mode / richer UI; streak + achievements integration (phases 5–6).
- Cross-device sync of the log (roadmap §6.4).

### Assumptions
1. **"Round" = one logged *placement***; reach-back uses **log-tail recency** (placements since last seen) — the log is placement-grained and carries no run-id, so this is the robust, schema-free definition.
2. Surfacing reuses `startGame(forcedPool)` / the Focus round rather than a new mode.
3. MVP brain = Leitner / expanding-interval; FSRS lands later at the **L2 seam** (A10) — placements as `elapsedDays`, not `repeat(card, rating)` day-primary.

### Open Questions
- Surfacing placement (Focus panel vs a distinct "Review round" button) → resolved in Phase 2; either satisfies FR5.
- Exact *k* growth curve and review-set size cap → tuned constants in Phase 2/3, validated by playtest (not blocking).
- **FSRS day-primary (`repeat`) vs placement-primary (L2 seam)** once the log is large enough to retrain — deferred until then; ledgered in `GAMIFICATION_BRIEF.md` §15.9.

### What changed / what remains open
- **Changed:** spec is complete and testable (AC1–AC7); every requirement traces to a goal; MVP is sharply scoped (pure scheduler + forced-pool surfacing + empty state).
- **Remains open (→ Phase 2/3):** surfacing surface, the `intervalK` growth curve, and the review-set size cap. None block design.

---

## Phase 2 — Design

### Carried Forward
FR1–FR7, NFR1–5, AC1–7. MVP = pure scheduler + forced-pool surfacing + empty state; derived-only (D3); age-gated (A2/§20); conservative spacing (`§11`); "round" = one logged placement (log-tail recency).

### Architecture overview
A new **pure scheduler module** (classic IIFE → `window.ReviewScheduler`, loaded before
`timeline.js` per rule 4) computes due state from `reviewLog`. `timeline.js` calls it to
(a) build a review set and (b) hand that set to the **existing** `startGame(forcedPool)`
path. No persisted scheduler state; everything is re-derived from the log on load.

### Major components
1. **`replay(logRows)`** → per-event derived state `{ lastSeenPos, attempts, firstTry, streak, intervalK }`.
2. **`rate(state, outcome)`** → `{ state′, nextDue }` (pure; expanding/contracting `intervalK`).
3. **`dueSet(stateByEvent, deck, band, opts)`** → ordered `[eventId]` (reach-back selection + age gate + size cap + success-floor).
4. **`window.ReviewScheduler`** public API (the seam).
5. **`timeline.js` integration:** a "Review round" trigger → `dueSet(...)` → `startGame(forcedPool)`; plus the J2 empty-state render.

### Data flow
```
reviewLog (localStorage, append-only)
   │ replay() on load ──► stateByEvent (in-memory, derived)
   │
   ├─ dueSet(stateByEvent, deck, band) ─► [eventId] ─► startGame(forcedPool)   (J1)
   │                                              └─► empty → J2 state
   └─ on each placement outcome: rate(state, outcome) ─► nextDue (derived; the log gains one row via the existing append at timeline.js:446)
```

### Interfaces / contracts
```js
// window.ReviewScheduler — all pure, all deterministic
replay(logRows)                                  -> { [eventId]: EventState }
rate(state, outcome)                             -> { state: EventState, nextDue: { dueAfterPlacements } }
dueSet(stateByEvent, deckId, band, opts)         -> string[]   // ordered event ids, age-gated & capped

// EventState = { lastSeenPos, attempts, firstTry, streak, intervalK }
```
- **`nextDue`** is expressed as `dueAfterPlacements` (log-tail recency) — schema-free and DST-proof.
- **Derived semantics (D3):** `intervalK` is a function of the event's *streak* of consecutive
  `firstTry` outcomes **recomputed from the log**, not stored: `intervalK = clamp(K_MIN · 2^min(streak, MAX_POW), K_MIN, K_MAX)`.
  `rate(state, outcome)`: `firstTry` → streak+1 (wider); `slip` → streak=0 (`intervalK = K_MIN`).
- **FSRS forward-compat (the L2 seam):** the swap is **not** `repeat(card, rating)`
  (day-primary). FSRS is used as a per-card *ranking* behind the existing interface:
  placements are fed as `elapsedDays` through `scheduler.next_state({stability, difficulty},
  elapsedDays, rating)` and `scheduler.next_interval(stability, elapsedDays)`, and the
  returned day-count is converted back to `dueAfterPlacements`. `replay` = fold that step over
  the log; a future swap replaces only the *bodies* of `replay`/`rate`, never the interface,
  and **never forks the vendored lib** (L3 rejected — rule 2; `validate:vendor` is
  header-based, not provenance-based). Configured with `enable_fuzz:false` (NFR2 determinism)
  and `enable_short_term:false`. Two costs, recorded as **inference**: day-fit weights are
  off-distribution for placement units (recoverable later via `generatorParameters`), and only
  2 of the 4 `Rating`s are reachable until A8's `confidence` exists.

### Dependencies
- Existing `reviewLog` (`timeline.js:446` append, `:455`/`:597` read) and the
  `startGame(forcedPool)` / Focus-round mechanic (`timeline.js:2112–2131`). No new runtime
  deps. (`ts-fsrs` is a *future* vendored lib only.)

### Error handling
- Missing/`undefined` log → treat as empty (FR6).
- Event ids in the log that no longer exist in the deck → skip (deck drift).
- `rate` on an unknown event → return a neutral state, never throw.
- All wrapped so a scheduler failure never blocks starting a normal game (fail-open to `subset`).

### Validation strategy
- **Node unit tests** (pure) for `replay`/`rate`/`dueSet`: determinism (AC6), expanding intervals (AC2), age gate (AC3), empty/edge cases (AC4), success-floor.
- **Browser smoke** (extend the `tools/offline-smoke/mastery.mjs` pattern) for J1 surfacing + J2 empty state (AC7).
- **Gates:** `npm run validate` unchanged-green; `?v=` bumped on `timeline.js` + the new script.

### Security / privacy
All client-side, `localStorage`-only; no network. The log stays local and derived (sync-compatible later). No untrusted input beyond the player's own log and deck JSON (already treated as data by the existing loader).

### Performance
`replay` is O(|log|) ≤ 2000 rows on load — negligible. `dueSet` is O(events). No perceptible latency.

### What changed / what remains open
- **Changed:** design is complete and minimal — one pure module + reuse of the existing forced-pool path; interfaces are FSRS-forward-compatible; derived semantics pinned.
- **Remains open (→ Phase 3):** the `intervalK` growth curve (`K_MIN`/`K_MAX`/`MAX_POW`) and the review-set size cap — chosen as concrete defaults in T2/T3, then confirmed by playtest.

---

## Phase 3 — Tasks

### Carried Forward
Design = pure `ReviewScheduler` (`replay`/`rate`/`dueSet`) + `timeline.js` forced-pool surfacing + empty state; AC1–7; derive-only (D3); age-gated (A2/§20). Concrete scheduler defaults from Phase 2: `K_MIN=3`, `K_MAX=24`, `MAX_POW=3`, review-set cap = puzzle placement count, success floor ≥ 50%.

Ordered, dependency-aware, small, reviewable; each task traces to a requirement or design decision.

**T1 — `ReviewScheduler.replay` (pure).**
- *Objective:* Derive per-event state from `reviewLog` (FR1, D3). *Traces to:* FR1 / NFR1.
- *Dependencies:* none.
- *Output / completion signal:* new first-party `review-scheduler.js` exposing `replay`; exports `window.ReviewScheduler`.
- *Verification step:* Node unit test — deterministic fold, identical across two runs (AC6).

**T2 — `ReviewScheduler.rate` (pure).**
- *Objective:* `rate(state,outcome) → {state′, nextDue}` with expanding/contracting `intervalK` (FR2). *Traces to:* FR2.
- *Dependencies:* T1.
- *Output / completion signal:* `rate` + the tuning constants (`K_MIN=3`, `K_MAX=24`, `MAX_POW=3`).
- *Verification step:* unit test — `firstTry` widens, `slip` resets to `K_MIN` (AC2).

**T3 — `ReviewScheduler.dueSet` (pure).**
- *Objective:* Reach-back selection + age gate + size cap + ≥50% success floor (FR3/FR4). *Traces to:* FR3, FR4.
- *Dependencies:* T1.
- *Output / completion signal:* `dueSet`.
- *Verification step:* unit tests — recency threshold (AC1), earlier-era/week weighting, 5–11 block restriction (AC3), empty (AC4), success floor (`§11`).

**T4 — Wire the module into `index.html` + `?v=`.**
- *Objective:* Load `review-scheduler.js` before `timeline.js` (rule 4); bump `?v=` on both (rule 3). *Traces to:* NFR5 / constraints.
- *Dependencies:* T1–T3.
- *Output / completion signal:* script tags in the correct order + version bumps.
- *Verification step:* page loads, `window.ReviewScheduler` present, `npm run validate` green.

**T5 — Surfacing: "Review round" → `startGame(forcedPool)`.**
- *Objective:* Trigger that builds `dueSet` and starts a review round via the existing forced-pool path; disable/redirect when empty (FR5, J1). *Traces to:* FR5 / decision "reuse forced pool".
- *Dependencies:* T3, T4.
- *Output / completion signal:* `timeline.js` handler + home/focus entry point ("Review round").
- *Verification step:* manual + browser smoke (J1).

**T6 — J2 empty state.**
- *Objective:* Age-appropriate "all caught up" surface when nothing is due (FR6, J2). *Traces to:* FR6 / G6.
- *Dependencies:* T5.
- *Output / completion signal:* empty-state render (no dead button).
- *Verification step:* browser smoke (AC4).

**T7 — Age-gate + reduced-motion QA.**
- *Objective:* Confirm A2/§20 gating and D8 parity across bands (G4). *Traces to:* G4 / FR4.
- *Dependencies:* T5, T6.
- *Output / completion signal:* none (verification task).
- *Verification step:* smoke across the four bands + reduced-motion (reuse the `mastery.mjs` band matrix) (AC3).

**T8 — Node tests + one browser smoke; run the gates.**
- *Objective:* Prove AC1–AC7 end to end. *Traces to:* AC1–AC7.
- *Dependencies:* T1–T7.
- *Output / completion signal:* `scripts/test/review-scheduler.test.mjs` + `tools/offline-smoke/review.mjs`.
- *Verification step:* `npm run test` (scheduler suite green), `npm run smoke:review`, `npm run validate` green (bar the known `validate:backlog`).

### What changed / what remains open
- **Changed:** task plan is complete, ordered, dependency-aware, and every task traces to a requirement or design decision with a concrete verification step. Concrete scheduler defaults (`K_MIN=3`, `K_MAX=24`, `MAX_POW=3`) are chosen so T2/T3 are actionable.
- **Remains open:** nothing blocking. The `intervalK`/cap constants (T2/T3) are the only tuning knobs and are confirmed by playtest (T7); the surfacing surface is fixed to the reused forced-pool path unless redirected at approval.

---
**End of planning document (Phases 1–3). Implementation (Phase 4) is intentionally not started.**
