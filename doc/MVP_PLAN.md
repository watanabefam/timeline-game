# Timeline Game — MVP Plan (Phases 1–5: Spec → Design → Tasks → Implementation → Verification)

> **Status: Phases 1–5 complete.** The ratified workflow is 0 Research → 1 Spec
> → 2 Design → 3 Tasks → 4 Implementation → 5 Verification → 6 Final Output.
> Phases 1–3 were approved under the standing instruction *"auto-approve upon
> thorough research of best practice and implementation, unless there's genuine
> uncertainty"*; the research that grounds Phases 2–3 is recorded in §16, the
> tasks are §17, **what actually shipped is §18, and the verification run with
> its numbers is §19.** Phase 6 (this summary) is the only phase with no new
> work in it.
>
> **Last updated:** 2026-10-03 | **Baseline:** commit `9912d66` (working tree
> clean, `main == origin/main`) | **Shipped on top of that baseline, uncommitted.**

---

## 1. Overview

This spec converts the 7-item "Next steps" list into an implementation-ready
scope. It carries two lanes that must not block each other:

- **Code lane (the MVP):** **S1** — cue-aware reach-back in the review
  scheduler; **S2** — the streak UI, shipped **paired with** the already-live
  mastery level card.
- **Content lane (no game code):** **C1** — make the pronunciation gate honest
  and runnable; **C2** — rebalance the `contributing` edge type; **C3** — author
  `world-literature` connection edges.

Deferred by name: item 5 Plan B (the 321 unsourced events) and item 6
(`.timedeck` / daily challenge). Item 7 (branch cleanup) is already done and is
dropped from the plan.

**Baseline facts re-verified for this document** (not restated from memory):

| Fact | Verified value | How |
|---|---|---|
| Script load order in `index.html` | `events-data` → `decks-io` → Leaflet → `world-land` → `liquid-glass` → `vis-timeline` → `anime` → `canvas-confetti` → `fx` → `globe` → `narration-recipe` → `narration` → `offline` → `review-scheduler` → `connections` → `timeline` | `index.html:517–532` |
| First-party script versions | `fx.js?v=26`, `globe.js?v=14`, `narration-recipe.js?v=10`, `narration.js?v=22`, `offline.js?v=6`, `review-scheduler.js?v=3`, `connections.js?v=1`, `timeline.js?v=206` | `index.html:525–532` |
| `ReviewScheduler.dueSet` opts | `recencyK`, `successFloor`, `events`, `eraOrder`, `currentEra`, `currentWeek`, `cap` | `review-scheduler.js` |
| Age-gated bands | `GATED_BANDS = ["5-7", "8-11"]` | `review-scheduler.js` |
| Scheduler unit tests | **32/32 pass** | `node --test scripts/test/review-scheduler.test.mjs` |
| Connections unit tests | pass (exit 0) | `node --test scripts/test/connections.test.mjs` |
| Offline unit tests | pass (exit 0) | `node --test scripts/test/offline.test.mjs` |
| `validate:backlog` | **fails, fail-closed**, message names the install command | `npm run validate:backlog` → exit 1 |
| `--raise-ceiling` | **documented but NOT implemented** — `main()` reads only `--check` | `scripts/gen-pronunciation-backlog.mjs:185–186` vs the header at `:52` |
| Committed backlog | `ceiling 138`, `open 138`, `deferred 1` | `tools/narration/pronunciation-backlog.json` |
| Connection-cue smoke fixtures | `CUE_DECK = "inventions-discoveries"`, `BARE_DECK = "world-literature"`, `NEW_DECK_NAME = "World History: A First Timeline"` | `tools/offline-smoke/connections.mjs:111–120` |

---

## 2. Problem / Opportunity

1. **Reach-back ignores the graph.** `dueSet()` selects on recency, struggle and
   era-distance only. The connection cue shipped 2026-10-03 explains a *slip*,
   but a review card with no reachable partner on the board can never produce a
   cue — so the strongest authored asset in the repo is invisible in the one
   mode built for retention (`doc/CONNECTIONS.md` §8; `doc/CONNECTION_CUE_PLAN.md`
   §8 Q5, which names this as "a reach-back feature; this plan does not touch
   `rate()` or `dueSet()`").
2. **Mastery has no habit surface.** Phase 2 shipped a level card that rewards
   *quality* (D4); nothing shows *consistency*. §11's conflict ledger forbids
   shipping the streak alone, and phase 5 is the last unbuilt phase of the
   ratified brief.
3. **A gate is red for the wrong reason.** `validate:backlog` fails because its
   author-time dependency is absent, not because the backlog is stale — and the
   escape hatch documented in two places (`AGENTS.md` rule 6 and the generator
   header) does not exist in the code.
4. **Two decks teach a one-word vocabulary.** `contributing` is 85% of
   `cc-timeline`'s 162 edges and 92% of `world-history-first-timeline`'s 38 —
   the anti-skew warning's own example of a type that "teaches nothing"
   (`doc/CONNECTIONS.md` §3).
5. **A deck with no graph.** `world-literature` (80 events, all carrying
   `category` + `fact` + `who`) renders no cue at all, and is currently the
   smoke's bare-deck control.

---

## 3. Goals

| # | Goal | Traces to |
|---|---|---|
| G1 | A due event is preferred when it has a reachable connection partner, so a review round can actually produce a cue | item 3; A10; `CONNECTIONS.md` §8 |
| G2 | Review difficulty does not rise: the served set's success profile is unchanged by the cue term | §11 success floor |
| G3 | A streak surface exists that shows consistency, derives from the log, and ships with the mastery card | D1, D2, D3, A5, §11 phase 5 |
| G4 | Every new motion has a reduced-motion story, and no surface is hidden behind an age the player never set | D7, D8, §5 |
| G5 | The pronunciation gate fails only for real reasons, and its documented escape hatch exists | `CONTENT_BACKLOG_PLAN.md` §3 |
| G6 | `contributing` stops dominating, and the fix is *measurable* rather than merely different | `CONNECTIONS.md` §3 |
| G7 | `world-literature` renders the cue through the same path as every other deck | item 2 |

---

## 4. Non-Goals

- No cloud backend, no bundler, no framework, no new **runtime** dependency
  (rule 1). ESM stays restricted to vendored libraries.
- No FSRS implementation and no `ts-fsrs` vendoring: A10's L2 seam stays a seam
  (§15.9 is unresolved).
- No change to `rate()` / `replay()` / `masteryByEvent()`, and no change to the
  review-log row shape `{ ts, deck, eventId, outcome, mode }` (D3; §6).
- No LLM as the source of a `reference`, and no automated or LLM edge-type
  classifier (rule 6; Phase 0 finding for item 1).
- No paid streak repair, no loss-anxiety notifications, no global leaderboard,
  no hearts/lives/mistake penalties (D2, D6, §10).
- No cross-era reach-back for 5–7 or 8–11 (A2).
- No new edge-type vocabulary — the existing codebook is the instrument, and no
  new types may be invented for it (`CONNECTIONS.md` §3).
- Not in this MVP: item 5 Plan B (321 unsourced events), item 6 (`.timedeck` /
  daily challenge), achievements (phase 6), first-run modeling (phase 7),
  narration timing (phase 8), quiet retrieval (phase 9), family league (D6).
- No pixel, print, iOS or learning-effect *claims* — those stay unverified by
  design and are listed as limitations, never as passes.

---

## 5. Users / Personas

| Persona | Band | What they need from this work |
|---|---|---|
| Homeschooling parent (primary audience) | sets the band | Progress they can see and trust; nothing that turns practice into a grind or a shame loop |
| Young learner | 5–7 | Stars, never percentages; same-era practice only; a forgiving streak with no broken-flame |
| Older learner | 8–11 | The same mechanics, simple numbers, one framing line on hard content |
| Independent teen / casual adult | 12–16 / unset | The full readout, cross-era reach-back, and the cue's authored rationale |
| Content maintainer (the author) | n/a | Gates that fail for real reasons, an escape hatch that exists, and a vocabulary that teaches |
| Edge author (the author) | n/a | A deck that stops teaching one word, and a fifth deck that participates in the cue |

**Unset behaves as the highest band** (§5): every surface must be reachable
without declaring an age, and no feature is hidden behind an age that was never
set.

---

## 6. Core User Journeys

**J1 — Review with a cue.** Home → Focus panel → "Review round". The pool is
the derived due set; cards with a reachable connection partner are promoted. On
a slip, the rescue callout names a partner already on the board, and the reveal
card keeps the line.

**J2 — Nothing due.** The due set is too small to form a puzzle → fail open to
weakest events → pad with random deck events. This path exists today and must
not regress (FR9, AC5).

**J3 — The streak is visible.** A player finishes one round → returns Home →
sees a streak chip → opens Stats → sees a streak calendar **beside** the level
card: which days were practised, which were forgiven, and whether the chain is
"paused" rather than "broken".

**J4 — A missed day.** The first miss in a calendar week is auto-forgiven and
shown as forgiven, not failed. A second miss yields "paused"; the next play
resumes. A broken-flame state never exists.

**J5 — Maintaining the gate.** With deps installed, `npm run validate:backlog`
is green. Without them, `npm test` fails and the failure text names
`npm --prefix tools/narration install`. Needing to allow growth, the maintainer
runs `npm run gen:backlog -- --raise-ceiling`, which raises the ceiling by
exactly the amount needed and prints old → new.

**J6 — Authoring edges.** The author re-judges `contributing` against the
counterfactual codebook, records a sampled agreement figure, and clears the
anti-skew warning — then authors `world-literature` edges so that deck renders
cues through the same path.

---

## 7. Functional Requirements

### S1 — Cue-aware reach-back (item 3)

| ID | Requirement |
|---|---|
| FR1 | `dueSet(stateByEvent, deckId, band, opts)` accepts an **optional** cue capability through `opts` (a predicate or a precomputed id set). When it is absent, the output must be **identical** to today's for the same inputs. |
| FR2 | The cue term is **additive and secondary**: it promotes or breaks ties, and can never move a card past the `recencyK` filter, the age gate, deck scoping, or the success floor. |
| FR3 | "Cue-reachable" means the event has at least one edge, in either direction per `Connections.indexEdges`, whose other endpoint is **also a candidate in the same set**. Dangling, self-referential, unknown-type and storage-rule-violating edges stay dropped, as `indexEdges` already drops them. |
| FR4 | The age gate is applied **before** the cue term. For 5–7 and 8–11 the cue term may only reorder within the already-restricted era/week block. |
| FR5 | `dueSet` stays pure and deterministic: no mutation of `stateByEvent` or `opts`, and the documented order (score desc, recency desc, id asc) is preserved. |
| FR6 | `reviewDueEvents()` (`timeline.js:2501`) supplies the cue capability from the same deck it already passes, using a memoised index in the style of the existing `connectionIndex()`. |
| FR7 | Fail-open: any failure in building or applying the cue capability yields the set it would have produced without it. A scheduler problem must never break the Focus panel. |
| FR8 | A deck with no `connections[]` is unaffected: the cue term is inert, and the round behaves exactly as today. |
| FR9 | The existing fail-open pool path (due set → weakest events → random padding) is unchanged. |

### S2 — Streak UI (item 4)

| ID | Requirement |
|---|---|
| FR10 | A **streak day** = at least one review-log row on that local calendar day. Score, perfect runs and volume never affect it (D1). |
| FR11 | Derivation stays pure over `reviewLog` + `meta.tz`. No new persisted counter, and the `reviewLog` row shape is unchanged (D3; §6). |
| FR12 | **One auto-freeze per calendar week**: the first missed day in a week is forgiven and the chain holds (D2a). |
| FR13 | **3-day grace**: returning after a break shows "paused" and resumes. Never a broken-flame state, never shame copy (D2b). |
| FR14 | A Home **streak chip** and a Stats **streak calendar**, built as a plain CSS grid ported from Trophy UI's *structure* only — no React, no Tailwind, no dependency (§14 sources). |
| FR15 | The calendar is framed as an SRL monitoring tool (A5): progress is visible; no goal-setting UI in this slice. |
| FR16 | The streak ships **paired with** the mastery level card: both surfaces are present together, and the streak is not reachable without it (§11 conflict ledger). |
| FR17 | Band gating follows §5: 5–7 gets a non-numeric readout; 8–11 a simple one; unset the full one. |
| FR18 | Every celebration and motion has a reduced-motion path. Celebrations queue on the results screen and never animate between curtain cover and reveal (D8; FX-layer rule). |
| FR19 | The DOM contract is assertable: the chip, calendar cells, and the forgiven/paused states carry stable classes for the smoke. |

### C1 — Gate honesty (item 5 Plan A)

| ID | Requirement |
|---|---|
| FR20 | **A2:** `npm --prefix tools/narration install` is recorded in the plan's verification list so the step is where a person looks for it. |
| FR21 | **A3:** the failing test keeps failing and its output names `npm --prefix tools/narration install`. **No skip, no fail-open.** *(Verified 2026-10-03: this already holds — the test fails through `buildBacklog()`'s fail-closed precondition and prints the install command. The requirement is therefore to keep it true, not to add it.)* |
| FR22 | **A5:** `--raise-ceiling` is implemented — it raises `CEILING` by exactly the amount needed, regenerates, and prints a loud old → new record. Alternatively both documented references are deleted and the docs say plainly that the constant is the only lever. **Implementation is preferred** (the deliberate act becomes greppable in a diff). |

### C2 — Vocabulary calibration (item 1)

| ID | Requirement |
|---|---|
| FR23 | The existing per-type counterfactual codebook (`CONNECTIONS.md` §3) is applied as-is. No new types, and no automated classifier. |
| FR24 | A sample of edges is re-judged against the codebook and an **agreement measure** is recorded. The 50% warning is a floor, not a target. |
| FR25 | Every re-typed or re-pointed edge still satisfies RULE 1 (stored on the earlier endpoint, judged against each deck's **storage sort key**, not necessarily `year`). |

### C3 — `world-literature` edges (item 2)

| ID | Requirement |
|---|---|
| FR26 | The deck's sort key is **confirmed before authoring** (`sortYear` vs `year`): RULE 1 is evaluated against storage order, and `cc-timeline` sorts by a hidden `sortYear` (cc-001 = −161 … cc-161 = 0), not by `year`. |
| FR27 | Authored edges satisfy RULE 1 and leave `validate:content` at 0 errors. |
| FR28 | The smoke fixture that depends on `world-literature` being edge-free is replaced **in the same change**, and the replacement control still proves a non-vacuous zero (`tools/offline-smoke/connections.mjs:116`). |

---

## 8. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR1 | `npm test` is green (offline → review → connections → content-pipeline → narration), with the backlog suite green once A2 is done. |
| NFR2 | `npm run validate` is green across its 8 gates, with `validate:backlog` green after A2. |
| NFR3 | `npm run smoke:connections`, `smoke:mastery` and `smoke:review` stay green; a new `smoke:streak` covers S2, and new Node assertions cover S1. |
| NFR4 | `?v=N` is bumped on every edited first-party script (rule 3), and the `index.html` load order is unchanged (rule 4). |
| NFR5 | No new entry under `assets/` (rule 2) and no new runtime dependency (rule 1). |
| NFR6 | Deck size and bytes stay within the generated index contract (`npm run gen:index`). |
| NFR7 | Scheduler changes remain unit-testable in Node with no browser, preserving the DOM-free property of `review-scheduler.js`. |
| NFR8 | No new `localStorage` key without a `try/catch` guard (existing convention). |

---

## 9. Constraints / Guardrails

- **`AGENTS.md` rules 1–6 are binding**, notably rule 1 (no build step / no
  runtime npm dependency), rule 2 (`assets/` is never edited), rule 3
  (cache-busting), rule 4 (script load order), rule 5 (the gate chain and its
  ratchets) and rule 6 (narration is pre-rendered; an LLM is never the source of
  a `reference`).
- **D3 derived-state rule is architectural:** the append-only `reviewLog` is the
  only write, and every new surface is a pure function of it. No mutable
  counters.
- **The conflict ledger forbids shipping the streak alone** (§11 phase 2/5).
- **A2:** no cross-era reach-back for 5–11.
- **The L2 seam is fixed:** a future FSRS swap replaces the bodies of
  `replay`/`rate` only. S1 must not change that interface.
- **Content-lane independence:** C1, C2 and C3 must neither block nor be blocked
  by S1 and S2. C2 and C3 are editorial work and are **not** compressible into
  an agent turn.
- **Two pre-existing reds are disclosed, never "fixed":** `validate:backlog`
  (dependency absent) and `validate:pipeline` (0 of 321 events carry a `source`;
  deliberately outside the `validate` chain).

---

## 10. Edge Cases

| Case | Required behaviour |
|---|---|
| Deck has no `connections[]` | The cue term is inert; the round is identical to today |
| Every due card is cue-reachable | The cue term is a tiebreaker only; order stays deterministic |
| The success floor would trim the only cue-reachable card | The floor wins — a gentler set matters more than a cue |
| Gated band with no current era/week | Empty set (existing FR4 behaviour preserved) |
| Fewer than 3 log rows | "not enough data yet" / no calendar history; a streak of 1 is valid |
| Device timezone changed | Forward-only sync; past rows are never rewritten |
| Storage unavailable / private mode | Writes stay in `try/catch`; surfaces degrade and never throw |
| First day ever | No "0-day" and no 0% bar (D5) |
| `reviewLog` at its 2000-row cap | Streak and calendar derive from what remains; no longer-history claim |
| Reduced motion | Chip and calendar render static; celebrations are silent and still recorded |
| An imported deck with a dangling edge | Already dropped by `indexEdges`; the cue term sees no partner |

---

## 11. Acceptance Criteria

**S1**

- **AC1** With a cue capability supplied, a due card that has a reachable
  partner ranks above an otherwise-equal card without one; **without** the
  capability, output is byte-identical to the pre-change result for the same
  fixture.
- **AC2** No card crosses `recencyK`, the age gate, deck scope or the success
  floor because of the cue term.
- **AC3** `dueSet` still does not mutate its inputs and is deterministic across
  repeated calls.
- **AC4** A cue-reachable partner is observed on the board end to end by the
  existing `smoke:connections` partner check.
- **AC5** `reviewDueEvents` fail-open is preserved (J2).

**S2**

- **AC6** Completing one round increments the streak **once**, not per card.
- **AC7** One miss in a calendar week is forgiven and the chain holds; a second
  miss yields "paused"; the next play resumes.
- **AC8** No paid repair, no shame copy and no broken-flame UI exists in the DOM
  or in copy.
- **AC9** The chip, the calendar and the level card are present together; the
  streak is not reachable alone.
- **AC10** 5–7 gets a non-numeric readout; unset gets the full one.
- **AC11** `smoke:streak` asserts the chip/calendar/forgiven/paused DOM contract
  under both normal and reduced motion.
- **AC12** No new persisted field appears in the stored user record.

**C1**

- **AC13** With deps absent, `npm test` fails **and** the failure text contains
  `npm --prefix tools/narration install`; with deps present,
  `validate:backlog` is green.
- **AC14** `npm run gen:backlog -- --raise-ceiling` raises the ceiling by
  exactly the needed amount and prints old → new (or the docs no longer name a
  flag that does not exist).

**C2**

- **AC15** The `contributing` anti-skew warning clears for `cc-timeline` and
  `world-history-first-timeline`; a sampled agreement figure is recorded; no new
  type is introduced; every touched edge still passes RULE 1.

**C3**

- **AC16** `world-literature` renders cues through the same path (smoke) and
  `validate:content` reports 0 errors; the bare-deck control is replaced by one
  that still proves a non-vacuous zero.

**Global**

- **AC17** `npm test` and `npm run validate` are green, with the two
  pre-existing reds reported as limitations rather than as passes.

---

## 12. MVP Scope

**In the MVP**

| Slice | Lane | Kind |
|---|---|---|
| S1 — cue-aware reach-back in `dueSet()` | Code | Code + Node tests |
| S2 — streak chip + calendar, paired with the live mastery level card | Code | Code + UI + smoke |
| C1 — gate honesty (A2, A3, A5) | Content | Small code + docs |
| C2 — `contributing` rebalance with a sampled agreement measure | Content | Editorial |
| C3 — `world-literature` edges | Content | Editorial |

**MVP exit criteria:** AC1–AC17 met, `npm test` and `npm run validate` green,
the new `smoke:streak` green, and the two known reds disclosed in the final
output.

---

## 13. Future Phases

- **Phase 2 (this workflow) — Design.** Module shapes, the `opts` contract, the
  CSS-grid calendar structure, and the test seams. Gated on approval of this
  document.
- **Phase 3 (this workflow) — Tasks.** An ordered, independently shippable slice
  queue with owners and falsifiers.
- **Deferred product work:** item 5 Plan B (the 321 unsourced events, a research
  program with falsifier 80→70→… errors and 321→311→… unsourced; B1 pilot = 10
  events in `world-history-first-timeline`); item 6 (S3 `.timedeck` — `fflate`
  ships a UMD build loadable as a plain `<script>`, with untrusted-ZIP guards
  already specified — and S4 daily challenge, client-side seeded and pure).
- **Deferred gamification phases:** achievements (6), first-run modeling (7),
  narration timing (8), quiet retrieval (9), family league (D6).
- **Deferred scheduler work:** FSRS behind A10's L2 seam (§15.9).

---

## 14. Assumptions

| ID | Assumption | Source |
|---|---|---|
| A-1 | The MVP is the code mastery/retention loop (S1 + S2), not the content program | Phase 0 |
| A-2 | The 321-event sourcing effort is a deferred, separate program | Phase 0 |
| A-3 | Streak granularity is **daily with D2 forgiveness** | §15.1 recommendation |
| A-4 | Item 3 is the **selection-aware** form (not enrichment-only), behind the L2 seam and age-gated per A2 | Phase 0 |
| A-5 | The vocabulary fix applies the existing codebook plus a sample agreement measure — no new vocabulary, no classifier | Phase 0 |
| A-6 | Item 7 is closed and item 6 is future | Phase 0 |
| A-7 | The streak calendar is a plain CSS-grid port of Trophy UI's *structure* only — no dependency, no React/Tailwind | `CLOUDLESS_PLAN` §2.1; §14 sources |
| A-8 | S1's cue term is a **boolean promotion**, chosen because it makes AC1's "identical without the capability" provable rather than approximate | this document, Q1 |

---

## 15. Open Questions

| # | Question | Recommendation / status | Blocks |
|---|---|---|---|
| Q1 | S1 cue term: boolean promotion or a small weighted bonus? | **Boolean promotion** (A-8) — the only form whose AC1 is trivially provable | Phase 3 |
| Q2 | Streak calendar placement: Home chip only, Stats only, or both? | **Both** — the chip is the habit signal, the calendar is the monitoring tool (A5) | Phase 2 |
| Q3 | C2 sample size for the agreement measure | Needs a number before Phase 3 (e.g. 30 edges spanning both decks) | Phase 3 |
| Q4 | C3 coverage target — all 80 events, or a documented subset? | Phase 0 flagged ~80–120 edges and explicitly **not** full coverage | Phase 3 |
| Q5 | Do all 162 `cc-timeline` edges get re-judged, or only those typed `contributing`? | The 85% figure suggests the latter, but a re-read may reclassify; needs a decision before authoring | Phase 3 |
| Q6 | §15.1 streak granularity — daily vs "X of 7 days" | A-3 recommends daily with D2 forgiveness; revisit only if 5–11 churn data says otherwise | not blocking |

---

## What changed / what remains open

**What changed.** The 7-item list is now one approval-ready spec with two lanes
that cannot block each other, and the MVP is fixed as **S1 + S2** with C1/C2/C3
running in parallel and Plan B / item 6 deferred by name. Every requirement
traces to a prior artefact — D1–D8, A2/A5/A10, `CONNECTIONS.md` §3/§8,
`CONTENT_BACKLOG_PLAN.md` §3, §15.1 — and every acceptance criterion names a
concrete check rather than a sentiment. Two baseline facts were **corrected
against the code while writing this**: (1) the narration backlog test's failure
**already** names the install command, so A3 is satisfied and FR21 is a
keep-it-true requirement rather than a change; and (2) `--raise-ceiling` is
confirmed unimplemented (`main()` reads only `--check`) while the generator
header and `AGENTS.md` rule 6 both advertise it, which is the honesty gap A5
closes. The streak's dependency on the level card is written as a **requirement**
(FR16), not a caution, and the smoke fixture that C3 invalidates is called out as
work in the same change (FR28).

**What remains open.** Q1–Q5 (Q1, Q3, Q4 and Q5 block Phase 3; Q2 blocks Phase 2
detail; Q6 is not blocking). Not verified this session and therefore never
claimed: `world-literature`'s sort key, pixel and print output, iOS Safari
behaviour, screen-reader spoken timing, and any learning-effect claim for the
cue. Two pre-existing reds stay red by design and are reported as limitations:
`validate:backlog` (dependency absent) and `validate:pipeline` (0 of 321 events
sourced, deliberately outside the `validate` chain).

---

## 16. Phase 2 — Design

Grounded in the research recorded in §16.6. Every decision below is traceable to
an FR or an AC.

### 16.1 S1 — where the cue term lives

The content-aware-SR literature separates the **memory model** (forgetting
curves — `replay`/`rate`) from the **scheduler** (which cards today — `dueSet`).
S1 is a **scheduler** change, so it touches `dueSet` only. `replay`, `rate` and
`masteryByEvent` are untouched, which is exactly the L2 seam A10 protects: a
future FSRS swap replaces the memory model and keeps this scheduler behaviour.

**The contract** (FR1): one new optional key on `opts`.

```js
dueSet(stateByEvent, deckId, band, {
  ...existing opts...,
  cue: Set<string> | string[],   // ids to promote; absent ⇒ output unchanged
  order: { [id]: number },       // optional; orders promoted ids ascending
})
```

**Why a supplied set and not a graph argument.** `dueSet` is DOM-free and has no
deck, no years and no edges — the graph lives in `connections.js` and the index
lives in `timeline.js`. Passing a precomputed id set keeps the scheduler dumb,
pure and unit-testable (NFR7), keeps all graph reasoning in the one place that
already owns it (`indexEdges`, RULE 1–4), and makes AC1 provable: **no `cue` key
⇒ no partition ⇒ byte-identical output.**

**The algorithm** (FR2, FR3, FR5):

1. Build `candidates` exactly as today (deck scope → `recencyK` → age gate).
2. Sort exactly as today (score desc, recency desc, id asc).
3. **New:** if `cue` is present, stably partition — candidates whose id is in
   `cue` first, the rest after, each group keeping step 2's order. If `order` is
   present, sort only the promoted group by `order` ascending.
4. Cap, then apply the success floor — unchanged.

Step 3 sits **after** every filter and **before** the cap and floor, so a cue
can never rescue a card that is not due, never cross the age gate, and never
soften the floor. Promotion cannot manufacture a candidate, so FR2 holds by
construction rather than by assertion.

**Why dependency order matters** (`order`). The cue's own RULE 2 only fires when
the partner is *already on the board*. In a review round the board starts empty,
so a promoted pair is only useful if the **earlier endpoint is asked first**.
`timeline.js` derives `order` from each event's storage sort key, so the
`from` endpoint precedes the `to` endpoint. Without this the feature would be
nominal — a promoted card whose partner arrives later shows no cue at all.

**Recorded risk (Anki's "bury siblings").** Anki deliberately keeps siblings out
of the same session because related cards interfere. This design does the
opposite on purpose: the cue needs the partner visible. The literature supports
both readings, so this is a **hypothesis with a falsifier** (§17), not a settled
finding: if cue rounds show a higher slip rate than non-cue rounds, the term is
net-negative and comes out.

### 16.2 S2 — streak surface

A recorded review of ten shipping streak screens supplies the state model, and
it lines up with D1/D2/A5 point for point:

**States** (the review's own list, mapped to this product):

| State | Meaning here | Rendered as |
|---|---|---|
| `none` | No qualifying day ever | First-day copy: *what counts* + the next action |
| `active` | Today already counts | Count + today marked |
| `at-risk` | Today not yet counted, chain alive | Count + today unmarked, no pressure copy |
| `frozen` | One missed day forgiven this week | Count + the forgiven day visibly *forgiven*, not failed |
| `paused` | Break longer than the grace window | Count preserved, "paused", resume on next play |
| `best` | Record held after a reset | Best shown beside current, never erased |

**Placement (Q2, resolved).** Both: the Home chip carries the count and today's
state; the Stats calendar carries the month, the forgiven days and the best. The
review is explicit that one number without context is not meaningful, and A5
explicitly frames the calendar as an SRL monitoring tool.

**Derivation (FR11, D3).** One pure function over `activeDays(p)` plus
`currentStreak(p)` — both already shipped — extended with a `streakState(p, now)`
that returns `{ count, best, today, forgiven: string[], paused, longest }`.
Nothing new is persisted: `best` is derived by scanning the same day set, so the
"preserve past bests" rule costs no storage and cannot drift.

**Calendar structure (A-7).** A plain CSS grid of day cells inside a `<table>`
with `<th scope="col">` weekday headers, so the grid is navigable as a table
rather than as a wall of divs. Each cell carries `data-state`
(`on` / `forgiven` / `missed` / `today` / `off`) and a text alternative in
`aria-label`, so the smoke can assert the contract and a screen reader gets
words instead of colour.

**Copy rules** (from the review's guardrails, all already repo law):
state what counts and the period; freeze terms visible **before** loss; no shame
on a break; milestones as orientation; never fireworks after one day.

### 16.3 C1 — `--raise-ceiling`

`main()` gains the flag it already advertises. It computes the ceiling the open
count actually needs, writes `CEILING` in the generator (the constant is the
ratchet — `AGENTS.md` rule 6), regenerates, and prints `old → new`. Refusing to
raise when the ceiling already suffices keeps the flag from being a blunt
"always pass" switch.

### 16.4 C2 — the instrument, not the 162 re-typings

This is the one place where the honest answer is **not** "the agent does it",
and the reason is this repo's own rule. Rule 6 forbids an LLM as the source of a
`reference`; the concept-map literature makes the **coding scheme plus an
inter-rater agreement measure** the validity instrument; and Phase 0 explicitly
rejected an automated/LLM classifier for exactly this task. An agent silently
re-typing 162 edges would be that rejected classifier wearing a different hat.

So C2 delivers the **instrument** and the **measurement**, and leaves the
re-typing to a human pass:

1. A machine-checkable audit that reports the per-type distribution per deck and
   names every edge that **fails** the counterfactual test for its own type (the
   existing codebook, applied mechanically as a screen — never as a verdict).
2. A documented sampling protocol: **30 edges** (above the 11–28 item range
   recommended for a κ study, drawn across both decks), two independent passes,
   κ reported with its interpretation bands (≥0.60 acceptable, ≥0.80 strong).
3. The recorded limitation that κ on a sample this size is a *screening* figure —
small-sample κ is known to be unreliable — so it can justify a re-type decision
but not a claim of instrument validity.

### 16.5 C3 — `world-literature` edges

1. **Sort key first** (FR26). `connections.js` already resolves this correctly —
   `sortYearOf()` prefers `sortYear`, falls back to `year` — so the authoring
   question is which one the deck actually populates, and RULE 1 is judged
   against that. This is checked before a single edge is written.
2. **Starter set, drafted and gated.** A small high-confidence set is authored so
   the deck stops being edge-free; `validate:content` enforces structure, and
   every authored rationale is a draft for review, not a verified claim.
3. **The smoke control is replaced in the same change** (FR28). Once the deck has
   edges it can no longer serve as the bare-deck control, so the control moves to
   a deck that is genuinely edge-free by construction, and the check that the
   zero is non-vacuous is kept.

### 16.6 Research grounding

| Source | What it settled |
|---|---|
| Content-aware SR (Rember/KARL; arxiv 2402.12291; Anki scheduler vs memory-model split) | S1 is a scheduler change; `replay`/`rate` stay untouched; a content-aware memory model is out of scope |
| Anki "bury siblings" (Anki manual; LessWrong Anki guide) | The interference caution that makes the cue term a hypothesis with a falsifier, not a settled win |
| Ten recorded streak screens (ScreensDesign) | The state model, freeze-before-loss disclosure, best-streak preservation, timezone/offline consistency, and the anti-shame guardrail |
| κ sample-size guidance (Bujang & Baharum; McHugh; Penn learning-analytics caveat) | Q3: 11–28 items minimum, use 30; κ≥0.60 acceptable / ≥0.80 strong; small-sample κ is a screen, not a verdict |
| CC "TASL" / 1EdTech provenance (already in `CONTENT_PIPELINE.md`) | C3's rationale drafts carry a source relationship and are reviewable |

---

## 17. Phase 3 — Tasks

Ordered so each slice is independently shippable and independently verifiable.
`?v=` bumps are part of the slice that edits the file (rule 3).

| # | Task | Files | Verify with | Falsifier |
|---|---|---|---|---|
| **T1** | S1: `opts.cue` + `opts.order` in `dueSet`; stable partition; no-cue path unchanged | `review-scheduler.js` (`?v=4`) | `node --test scripts/test/review-scheduler.test.mjs` | With no `cue`, output differs from the pre-change result for the same fixture |
| **T2** | S1: supply the cue set + order from `reviewDueEvents()` via the memoised connection index | `timeline.js` (`?v=207`) | smoke:connections + review suite | A promoted card's partner is not on the board when it is asked |
| **T3** | S1: cue-reachability unit tests (promotion, no-cue identity, floor/cap precedence, age gate, purity) | `scripts/test/review-scheduler.test.mjs` | `npm run test:review` | A cue promotes a card that is not due, or crosses the age gate |
| **T4** | C1: implement `--raise-ceiling`; document A2's install step in the plan's verification list | `scripts/gen-pronunciation-backlog.mjs`, `doc/CONTENT_BACKLOG_PLAN.md` | `npm run gen:backlog -- --raise-ceiling` prints old → new | The flag raises the ceiling when nothing needs it, or leaves docs advertising a flag that does not exist |
| **T5** | S2: `streakState()` derivation (count, best, forgiven, paused) | `timeline.js` | `node --test` + `smoke:streak` | A missed day is counted as active, or a reset erases the best |
| **T6** | S2: Home chip + Stats calendar (CSS grid in a `<table>`, `data-state`, `aria-label`) | `timeline.js`, `styles.css`, `index.html` | `npm run smoke:streak` | The streak renders without the level card, or any band sees a percentage it must not |
| **T7** | S2: `smoke:streak` — chip/calendar/forgiven/paused/band/reduced-motion contract | `tools/offline-smoke/streak.mjs`, `package.json` | `npm run smoke:streak` | The check passes while a state is unreachable |
| **T8** | C2: type-distribution + counterfactual-screen audit; 30-edge sampling protocol documented | `scripts/audit-connections.mjs` (new), `doc/CONNECTIONS.md` | `npm run audit:connections` | The screen reports a verdict instead of a screen, or the protocol claims validity a 30-item κ cannot support |
| **T9** | C3: confirm the deck's sort key; draft a starter edge set; replace the smoke's bare-deck control | `decks/world-literature/deck.json` (+ generated `deck.js`), `tools/offline-smoke/connections.mjs` | `npm run validate` + `smoke:connections` | An edge violates RULE 1, or the replacement control no longer proves a non-vacuous zero |
| **T10** | Verification pass | — | `npm test + npm run validate` + the four affected smokes | Any gate regresses |

**Slice order:** T1→T2→T3 (S1 ships whole), then T4 (independent), then T5→T6→T7 (S2 ships
whole), then T8, T9, T10. S1 and T4 are independent of S2 and could ship first
if S2 slips.

**Two genuine uncertainties, stated rather than papered over:**

1. **C2's 162 re-typings are human work.** §16.4 gives the reason — doing them
   mechanically would be the LLM-as-classifier the repo already rejected. The
   deliverable is the instrument plus the measured screen.
2. **C3's authored rationales are drafts.** `validate:content` enforces structure,
   never truth; each authored edge is a claim awaiting human verification, and the
   starter set is deliberately small and uncontroversial rather than complete: a
   large unverified edge set would be worse than a small verified one.

---

## What changed / what remains open

**What changed.** Phases 1–3 are complete in this one document. The design is
grounded in the research at §16.6 rather than in preference, and that research
**changed the design in three places**: S1 is now explicitly a *scheduler* change
(so the FSRS seam stays clean); the cue term is a supplied id set plus an
`order` map, because RULE 2 only fires when the partner is already on the board
and the promoted pair must therefore be asked in dependency order; and the streak
surface grew a state model (`none`/`active`/`at-risk`/`frozen`/`paused`/`best`)
with a preserved best streak, which the shipping-screen review shows is what
keeps a reset from erasing the record. Q1–Q4 are now **resolved** by that
research: boolean promotion (a set), both surfaces, a 30-edge κ sample, and a
starter edge set instead of full coverage.

**What remains open.** Q5 only, and it is a genuine uncertainty rather than a
missing decision: the 162 `cc-timeline` edges need a human re-typing pass, and
C2 deliberately ships the instrument and the measurement instead of an agent
guessing at 162 editorial calls (§16.4, §17). Also unverified by design and never
claimed: `world-literature`'s sort key (checked as T9's first step), pixels,
print, iOS Safari, screen-reader spoken timing, and the cue's learning effect.
Two pre-existing reds stay red: `validate:pipeline` (0 of 321 sourced).
`validate:backlog` was red at the start of implementation for a reason that was
fixable rather than structural — the dictionary dependency was simply absent
because `tools/narration` had never been installed. It is installed and
`validate:backlog` is **green** (§19).

**This document is no longer awaiting approval** — Phases 1–3 were auto-approved
under the standing instruction, and §§18–19 record what shipped and what the
gates say about it.

---

## 18. Phase 4 — Implementation record

Nine of the ten tasks landed. Each row states what the code actually does, not
what the task asked for, because two of them came out differently than planned.

| # | Shipped | Notes |
|---|---|---|
| **T1** | `review-scheduler.js` gained `opts.cue` (Set or array) and `opts.order` (id → number), applied as a **stable partition after every filter and before the cap and the success floor**. `CUE_ORDER_MISSING` sorts an unordered cue last instead of throwing. | The cue term is a *scheduler* term only: `replay`/`rate` (the memory model, and A10's FSRS seam) are untouched. `?v=4`. |
| **T2** | `timeline.js` gained `cuePlanFor(deck, candidateIds)`, and `reviewDueEvents()` now runs `dueSet()` **twice** — once uncued to learn the candidate set, then again with the plan. | This is the design's central safety property: a cue can promote *order within* the scheduler's own candidates, never *inject* a card the scheduler would not have served. `connectionIndex()` became `connectionIndexFor(deck)` with a **`WeakMap` cache**, because the focus panel's deck and `ui.deck` can differ and a single-slot cache returned the wrong graph. `?v=208`. |
| **T3** | 9 cue tests added; 41 total. | Covers: no-`cue` identity, promotion, `Set` ≡ array, dependency ordering, *cannot* rescue a not-due card, *cannot* cross the age gate, cap applied after promotion, floor applied after promotion, no input mutation. |
| **T4** | `--raise-ceiling` implemented in `scripts/gen-pronunciation-backlog.mjs`; the missing dependency was installed (`npm --prefix tools/narration install`). | The flag refuses when the ceiling already suffices and **fails closed without the dictionary** (verified: exit 1, generated file byte-identical by md5). It rewrites `export const CEILING` in the generator, not the generated file. `validate:backlog` is green. |
| **T5–T7** | `weekKeyOf()`, `streakState(p, now)` (states `none` / `active` / `at-risk` / `paused`, plus `count`, `best`, `longest`, `forgiven[]`, `activeToday`, `resumable`, `days`, `today`, `tz`, `graceDays`), `renderStreakChip()`, `streakCalendarEl()` (a real `<table>` with `<th scope="col">`, 35 cells, `data-state`, per-cell `aria-label`), `Gamify.streakState`, and a new `tools/offline-smoke/streak.mjs`. `currentStreak` is untouched and stays the primitive. | **The smoke caught two real bugs, both fixed at cause:** (1) the 35-day window was anchored on the *oldest* day, so today and the recent days fell outside the grid — it is now anchored to the end, on the current week; (2) `count` came from the unforgiving `currentStreak` while the calendar showed a forgiven day — `streakState` now steps *through* forgiven days. |
| **T8** | `scripts/audit-connections.mjs` + `npm run audit:connections`, and `doc/CONNECTIONS.md` §10 (the instrument, the screen, the current measurement, and the 30-edge two-pass κ protocol). | Reads the graph through the **shipped** `connections.js` `indexEdges()`, so it describes what the game serves, including the RULE 1 drops. Six screen codes; word-boundary matching after substring matching produced false hits (`against` contains `again`). Verified: 264 served edges, 4 flagged, 0 dropped. |
| **T9** | Sort key checked **before** authoring: none of `world-literature`'s 80 events carries a `sortYear`, so RULE 1 is evaluated against `year` on this deck. Three balanced starter edges authored; the smoke's bare-deck control became a synthetic deck registered through the real `window.registerDeck` API. | The control had to move in the same change: once `world-literature` had edges it could no longer prove a non-vacuous zero. Registering it at runtime (rather than shipping an edgeless deck forever) means no future deck can silently weaken the check. |
| **T10** | The verification pass — §19. | — |

**Two things came out differently from the plan, and both for a reason:**

1. **C1 needed an install, not just a flag.** The backlog gate was red at the
   start for a missing dependency, so `--raise-ceiling` alone would have been a
   flag that could never be used. The honest fix was to install
   `tools/narration`'s dependencies; the ceiling then held at 138 without needing
   to be raised at all, which is a better outcome than a raise.
2. **C2 shipped no re-typings, by design.** §16.4's reasoning held under
   contact with the corpus: the audit's own measurement is that `contributing` is
   **85%** of `cc-timeline` and **92%** of `world-history-first-timeline` — the
   §3 drift returning in a new corpus — and only a human can decide 200
   editorial calls. What the agent *can* do is make that pass measurable, which
   is what §10 of `doc/CONNECTIONS.md` now does.

## 19. Phase 5 — Verification record

Run on the shipped tree, after the last edit. Every command's own exit status is
preserved (no output filter can turn a failure into a pass here).

| Check | Result | Exit |
|---|---|---|
| `npm test` | **288 pass / 0 fail** (offline 19, review 41, connections 22, content-pipeline 129, narration 77 pass + 6 skipped) | 0 |
| `npm run validate` (full chain) | `validate:index` `:content` `:vendor` `:offline` `:recipe` `:narration` `:backlog` `:sourcing` all pass | 0 |
| `npm run smoke:mastery` | 18/18 | 0 |
| `npm run smoke:review` | 17/17 | 0 |
| `npm run smoke:connections` | 21/21 | 0 |
| `npm run smoke:streak` | 25/25 | 0 |
| `npm run smoke:offline` | 48/48 | 0 |
| `npm run audit:connections` | 264 edges, 4 flagged, distribution reported per deck | 0 (advisory) |
| `npm run validate:pipeline` | **260 errors, 355 warnings — FAIL, and deliberately outside the `validate` chain** | 1 |

**Generated artefacts were regenerated, not hand-patched:** `decks/index.{json,js}`,
`decks/world-literature/deck.js` and `offline-manifest.{json,js}` (134 files,
18.4 MB, generation `03639ecc4e00`) after the C3 deck edit, because
`validate:index` and `validate:offline` both check freshness and both failed
until they were.

**What this verification cannot cover, and is therefore never claimed:** iOS
Safari itself, print output, pixel appearance, the screen reader's spoken
timing, and whether the connection cue actually improves learning. The smokes
drive Chromium; those five need a device, a human, or a study.

## What changed / what remains open (final)

**What changed.** Phases 1–5 are complete in this one document. The research at
§16.6 changed the design in three places — S1 became explicitly a *scheduler*
change so the FSRS seam stays clean; the cue term is a supplied id set plus an
`order` map, because RULE 2 only fires when the partner is already on the board;
and the streak surface grew a state model with a preserved best streak, which is
what keeps a reset from erasing the record. Q1–Q4 are **resolved**. Implementation
then landed all nine code/content slices (§18) and every gate that can pass does
pass (§19).

**What remains open, stated as open rather than softened:**

1. **C2's re-typings are still owed by a human.** The instrument measures the
   vocabulary skew and the screen names 4 edges; it deliberately does not touch
   the other 200, and `doc/CONNECTIONS.md` §10.6 says so in the document the next
   author will read.
2. **No κ run has happened.** The protocol is written and the tooling is verified
   (κ = 0.723 on a hand-checked 30-row fixture), but two human coding passes have
   not been done, so no band in §10.5 describes this corpus yet.
3. **C3's three rationales are drafts**, structurally gated and factually
   unverified. A small reviewable starter set beat broad unverified coverage.
4. **`validate:pipeline` stays red** — 0 of 321 events carry a source, counted by
   deck in `content/sourcing-backlog.json` (ceiling 321, held in the generator).
   This is item 5 Plan B, deferred by name in §1, not an oversight.