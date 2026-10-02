# Next Slice — Feedback Depth + Pre-Reveal Confidence (A8) — Research & Plan

**Status:** research complete, plan ready — **awaiting approval before implementation**
**Date:** 2026-10-02
**Scope:** `GAMIFICATION_BRIEF.md` §11 **phase 4** (feedback depth at the moment of the slip + one predirected pre-reveal prompt + the optional `confidence` field, A8), plus the one-line phase-2 age-gap warm-up.
**Companions (source of truth above this doc):** `doc/GAMIFICATION_BRIEF.md` (A4/A6/A8/A10, §5 age table, §6 data model, §9 copy rules, §11 order, §12 metrics, §15 open decisions); `doc/CLOUDLESS_PLAN.md` §2 (working method) and §3 S2; evidence `doc/references/mcg_research_synthesis.md` §6, §7, §8, §9, §13, §20, §23.
**Governing rule:** this is a learning *and* motivational surface, so it cites the vendored evidence by § number (AGENTS.md), derives all state from the append-only `reviewLog` (D3), and adds no runtime dependency (rule 1).

> Planning artifact. It defines the research verdict, the requirements (Phase 1),
> the design (Phase 2) and the ordered task plan (Phase 3). No game code is
> written until Phase 4 is approved.

---

## 0. Where we are

`CLOUDLESS_PLAN.md` §3 S2 is the track; `GAMIFICATION_BRIEF.md` §11 is the order.

| §11 phase | Status |
|---|---|
| 1 data layer (`reviewLog`, `meta.tz`, `activeDays`/`currentStreak`) | ✅ shipped |
| 2 mastery leveling + age-band copy | ✅ shipped (`smoke:mastery`) |
| 3 reach-back due-queue (A10, L2 seam) | ✅ shipped (`review-scheduler.js`, `smoke:review`) |
| **4 feedback depth + pre-reveal prompt + `confidence` (A8)** | ← **this plan** |
| 5 streak UI · 6 achievements · 7 first-run (A11) · 8 narration timing (A7) + quiet (A9) | not started |

Two known gaps carried forward, cheap and concrete (see §5): the phase-2 5–7
`Mastery NN%` still prints in `renderFocusPanel()`, and **A7/A9 line citations in
the brief are now stale** (§3.1).

---

## 1. Research — constraint-filtered (§2.1 of `CLOUDLESS_PLAN.md`)

Candidate next slices, scored by *(value × permanence) ÷ risk*:

| Candidate | Value | Needs a new dep? | Verdict |
|---|---|---|---|
| **§11 phase 4 (A8)** — slip-moment why + pre-reveal prompt + `confidence` | High — §2's north star; the brief rates A8 **✅ strong, tiny cost**; it is the prerequisite that unlocks the other two FSRS `Rating`s (A10) | **No** — pure DOM/copy + one optional log field | **Recommended** |
| A7 narration timing + A9 quiet moment | Medium — fixes a shipped redundancy/split-attention defect | No | ⚠️ mixed evidence (§17 conflict, A7); A9 is a 🟡 hypothesis with a live §12 harm check. Small, but needs its own measurement — do it *after* A8. |
| Phase-2 5–7 focus-panel copy gap | Small but real — a shipped surface still shows `Mastery NN%` to 5–7 | No | **Fold in as a warm-up** (one line) |
| S3 `.timedeck` (ZIP) | High — prerequisite for deck sharing / offline content; permanent (§19.10) | Yes: `fflate` | **Gate now passes** — `fflate` ships `umd/index.js` + `umd/index.min.js` (package.json `build:umd`; MIT; to be pinned + recorded per rule 2). Plannable, but a new-surface slice — sequence after phase 4. |
| S4 daily challenge | Medium — pure, Node-testable, permanent | No | Cheap and clean; independent of §11. Good candidate, but not the mastery spine. |

**Library verdict for the recommended slice: none required.** The gate is
trivially satisfied, which is itself the argument for doing phase 4 before S3 —
it delivers the highest-value learning change with zero vendor surface.

**Research findings that shape the design (each traceable):**
- **Self-explanation format dominates.** §9: fill-in-the-blank g=0.90,
  **predirected g=0.70**, multiple-choice **g=0.24** (weakest). So the prompt must
  be a *predirected* question, never a multiple-choice self-rating (A8).
- **A confidence prompt alone is worthless.** §13: *"Simply asking learners to
  rate confidence without revealing actual accuracy does not improve
  calibration."* The prompt must be **followed immediately by the reveal** (A8).
- **Prompt fatigue is real.** §9 and §13 both cap self-explanation at **1–2 per
  section** → **at most one per round** (A8).
- **Age gate.** §20: 5–7 skip abstract self-rating (working-memory overload);
  8–11 one simple self-check; 12+ full cycle (A2/§5 age bands).
- **Low prior knowledge.** §8: elaborated feedback (EFE) is the only feedback
  type effective at low prior knowledge — so the *slip-moment* explanation is
  the load-bearing half, not the results screen.
- **Failure must stay productive.** §23/A6: the canonical answer follows with an
  explanation, it never reads as a test, and it is skipped for 5–7.

---

## 2. Recommendation & scope

**Build §11 phase 4 (A8) next**, as three small, independently shippable parts:

- **4a — the why at the moment of the slip.** Today the slip reveal sets
  `state.revealedFacts[ev.id] = ev.fact` (`timeline.js:3446`) and the card renders
  that **fact**; the *why* only lives in the fact-sheet popover
  (`factRow("Why it matters", e.why)`, `:2779`). §9/§8 want a one-line **why** at
  the reveal, not only on the results screen. This is a copy/markup change at one
  reveal site, age-framed per §9 (`desirable-difficulty` copy is 8–11 only, A3).
- **4b — one predirected pre-reveal prompt (A8).** At most one per round, placed
  **before** the reveal and always followed by it, predirected form only, age-gated
  (5–7 skip; 8–11 one simple self-check; 12+ full cycle).
- **4c — the optional `confidence` field (A8).** Record the answer on the *same*
  append-only row (`§6`: `confidence?` is the only sanctioned schema addition),
  **never backfilled**. This is what makes `outcome` two-signal and unlocks the
  `Hard`/`Easy` grades FSRS needs later (A10).

Plus **4d — the phase-2 warm-up:** stop `renderFocusPanel()` printing
`Mastery NN%` for a 5–7 profile (stars, per §5/A3, matching the stats card).

**Permanence (D3 / §2.4):** `confidence` is written to the append-only log and
everything else is derived, so the local form *is* the final form — a future
server replicates the log verbatim and re-derives. No stand-in is built.

**Non-goals:** no new dependency; no second prompt per round; no multiple-choice
self-explanation; no new schema field beyond `confidence`; no score/XP change
(G5); no change to the review scheduler interface (A10's seam is untouched —
4c only *enriches* its input).

---

## 3. Live code seams (verified 2026-10-02)

| What | Where | Note |
|---|---|---|
| Slip/reveal commit (4a/4b hook) | `timeline.js:3446` — `state.revealedFacts[ev.id] = ev.fact;` | inside `commitPlacement`; the pre-reveal prompt goes immediately before, the reveal immediately after |
| The rescue/answer callout | `timeline.js:3441` `.rescue-status`, `RESCUE_AFTER` at `:3539` | the guided-completion path a wrong placement reaches (§23) |
| Fact vs why in the sheet | `timeline.js:2779` `factRow("Why it matters", e.why)` | why exists, but only in the popover today |
| Outcome row emit | `timeline.js:3687–3692` inside `recordRun()` | where `confidence` is added to the same row |
| Result-cap contract | `review-scheduler.js` (`replay`/`rate`) + `scripts/test/review-scheduler.test.mjs` | unchanged; `confidence` is *data*, not an interface change |
| Age band helper | `timeline.js:500` `band(user)`; `AGE_BANDS` | reuse, do not re-derive |
| Focus-panel copy gap (4d) | `renderFocusPanel()` week rows — `Mastery ${w.mastery}%` | prints for every band today |

### 3.1 Stale citations to correct in `GAMIFICATION_BRIEF.md`
- **A7** says autoplay is at `timeline.js:2475`; it is actually the per-card
  narration in `updateGameHud()` at **`timeline.js:2682`**
  (`window.Narrator.speakEvent(ev, …)`), with `prefetch` at `:2689`. Fix when A7
  is picked up (it is not this slice).
- **A9**'s `fx.js:27` (`FX_KEY` / `motionOn()` master gate) is **still correct**.

---

## 4. Plan (Phase 1 requirements · Phase 2 design · Phase 3 tasks)

### Phase 1 — Requirements
- **FR1** At the reveal of a slip, show a one-line **why** (§8/§9), age-framed; the
  results screen stays consistent with it.
- **FR2** Show **at most one** predirected pre-reveal prompt per round (A8, §9/§13).
- **FR3** The prompt is always **immediately followed by the reveal**; it never
  gates scoring or advances without the answer (A8, §13).
- **FR4** Prompt presence/format is **age-gated**: 5–7 none; 8–11 one simple
  self-check; 12+ full (A8, §20, A2).
- **FR5** Record the prompt answer as optional `confidence` on the **same**
  append-only row; never backfill (A8, §6, D3).
- **FR6** No score/XP/level change (G5). No motion without a reduced-motion story
  (D8). Not drag-only; screen-reader legible (NFR4).
- **FR7** (4d) A 5–7 profile never sees a mastery **percentage** on the focus
  panel (§5/A3).
- **NFR1** Pure, Node-testable derivation (prompt eligibility + once-per-round
  latch) — no DOM.
- **NFR2** Deterministic given the profile band and the round state.
- **NFR3** No new dependency; `?v=` bumps on touched first-party files (rule 3).
- **NFR4** `confidence` is optional and bounded; the 2000-row log cap is unchanged.

### Phase 2 — Design
A pure helper (new, small — either inside `timeline.js` or beside the scheduler)
answers the DOM-free half:

```js
// promptPlan(band) -> { show: bool, kind: "predirected" | "self-check" | "none" }
//   "5-7"        -> { show:false, kind:"none" }
//   "8-11"       -> { show:true,  kind:"self-check" }   // one simple self-check
//   "12-16"/"17+"/unset -> { show:true, kind:"predirected" }
// oncePerRound: a boolean latch on game state, not persisted.
```

- **Where it fires (4b):** immediately before the reveal in `commitPlacement`
  (`timeline.js:3446`). The same placement that commits the card carries the
  prompt for the *next* decision at most once — the latch is per round, on
  `game`/`splitCtx` state, never in storage.
- **The reveal sequence (4a):** reveal = answer + a one-line **why**
  (`e.why || e.fact`), reuse the existing `.tl-card` fact line; keep the popover
  unchanged. Copy follows §9 (process framing, no person praise; no
  desirable-difficulty line for 5–7).
- **The field (4c):** `appendReviewLog` rows gain `confidence` **only** when the
  player answered the prompt; a skipped prompt writes no field (absence is
  meaningful and must not be a fabricated default). The 2000-row cap and the
  `{ ts, deck, eventId, outcome, mode }` core are unchanged.
- **Age gate (4d):** `renderFocusPanel()` mirrors the stats card's 5–7 branch
  (`masteryStars`/`starString` already exist at `timeline.js:504–512`) — stars,
  no percentage, no "not enough data" copy.
- **Reduced motion (D8):** the prompt must not animate in beyond the existing
  card reveal; with `prefers-reduced-motion` on it appears statically. No
  `aria-pressed` toggle is introduced (it is a one-shot question).
- **Failure modes:** a missing `e.why` falls back to `e.fact`; an unknown band
  behaves as the highest (§5); a scheduler/`confidence` write failure must not
  block finishing the round (fail-open).

### Phase 3 — Tasks
- **T1 — `promptPlan(band)` + latch (pure).** *Output:* the helper + once-per-round
  latch. *Verify:* Node test — band matrix, latch is once-only, unset = highest.
- **T2 — 4a the why at the slip reveal.** One reveal site; age-framed copy.
  *Verify:* browser smoke — the reveal text differs from the bare fact and includes
  the why; 5–7 gets no desirable-difficulty framing.
- **T3 — 4b the pre-reveal prompt.** Predirected/self-check per band; hidden for
  5–7; always followed by the reveal. *Verify:* smoke asserts exactly one per
  round and ordering.
- **T4 — 4c `confidence` on the row.** *Verify:* Node test — the row carries
  `confidence` only when answered, never backfilled; smoke reads it from storage.
- **T5 — 4d focus-panel 5–7 copy.** *Verify:* smoke — no `%` for 5–7, stars shown.
- **T6 — `?v=` bumps + gates.** `timeline.js` (and styles if touched);
  `npm run validate` green bar the known `validate:backlog`.
- **T7 — Verification.** New pure Node tests chained into `npm test`; a new browser
  smoke `tools/offline-smoke/feedback.mjs` (`npm run smoke:feedback`) covering
  T2–T5 + reduced motion + no console errors. Follow the `mastery.mjs`/`review.mjs`
  harness pattern (seeded profiles, read-only server, `note()` for gaps).

### Acceptance Criteria
- **AC1** 5–7 never sees the prompt; 8–11/12+/unset see **exactly one** per round,
  **before** the reveal, **followed** by it (A8, §9/§13/§20).
- **AC2** The slip reveal carries a one-line **why** (§8/§9); the results screen
  is consistent with it.
- **AC3** A row gains `confidence` only when answered; existing rows are never
  backfilled; the log cap is unchanged (D3, §6).
- **AC4** No score/XP/level change (G5); reduced-motion parity (D8); keyboard +
  screen-reader operable (NFR4).
- **AC5** A 5–7 profile sees no mastery percentage in the focus panel (4d).
- **AC6** The pure helper's Node tests pass and are chained into `npm test`.
- **AC7** `npm run validate` green except the pre-existing `validate:backlog`;
  no new vendor surface.

### Falsifier (§2.2 — the observation that proves the slice wrong)
**If any of these is observed, the slice is wrong:** the prompt is ever shown
more than once per round, to a 5–7 profile, or without the reveal following it;
or a row records a `confidence` the player did not give; or **slips/run rise**
after the change (§12 harm check). Additionally, if a playtest shows players skip
the prompt **more than ~half of the time**, then `confidence` is not populated
enough to justify the schema addition and **4a should be kept while 4b/4c are
reverted** — a reversible split, which is why they are separate tasks.

---

## 5. Alternatives ledger (planned, not built here)

- **A7 narration timing** (`timeline.js:2682` → move autoplay to the reveal) and
  **A9 quiet moment** (`fx.js:27`) — small, independent, and best shipped
  **together** (both are one-call-site changes). Deferred behind phase 4 because
  A7 is ⚠️ mixed evidence touching an accessibility feature and needs its own
  measurement (§15.6), and A9 is a 🟡 hypothesis whose §12 harm check (slips/run
  must not rise) has to run on real play. Correct the stale A7 citation when it
  is picked up (§3.1).
- **S3 `.timedeck`** — the `fflate` gate **now passes** (UMD present, MIT; pin +
  `THIRD_PARTY_LICENSES.md` row at build time). Largest new surface (IndexedDB
  store, untrusted-ZIP guards per roadmap §19). Sequence after phase 4.
- **S4 daily challenge** — pure/PRNG, Node-testable, permanent; independent of
  §11. A clean, low-risk slice whenever a non-mastery change is wanted.
- **Phase 2 gap** (5–7 focus-panel `%`) — folded in as 4d rather than left as a
  separate ticket.

---

## 6. Open questions
1. **8–11 prompt wording.** A8 says "one simple self-check" for 8–11 but does not
   fix the copy — pick a phrasing that does not read as a test (§23/A6).
2. **Does `confidence` feed `rate()` now or later?** Recommendation: record it
   now, consume it later (A10/L2). Writing it without a consumer is the point;
   the field is cheapest to add while the row is being touched.
3. **Voice/read-aloud of the prompt** (A7 interaction). Out of scope here, but the
   prompt is a new on-screen text at the deciding moment — revisit when A7 lands.
