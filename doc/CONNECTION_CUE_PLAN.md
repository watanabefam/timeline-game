# Connection Cue at the Slip — Research & Plan

**Status:** ✅ **implemented** (planned 2026-10-02, shipped 2026-10-03)
**Date:** 2026-10-02 (implementation record §9)
**Scope:** replace the A8 phase-4 "why at the slip" line with a cue built from the
**already-authored `connections[]` edges**, rendered at the two slip moments (the rescue callout
and a slipped card's reveal). One line, age-safe, derived, no new dependency.
**Companions (source of truth above this doc):** `doc/CONNECTIONS.md` (edge model, §3 type
vocabulary, §3.1 readable phrases, §4 filter rule, §6 evidence, §8 implementation notes);
`doc/GAMIFICATION_BRIEF.md` (§11 phase 4 / A8, §5 age table, §9 copy rules); `doc/CLOUDLESS_PLAN.md`
§2 (working method) and §3 S2; evidence `doc/references/mcg_research_synthesis.md` §8, §9, §10,
§11, §13, §20.
**Governing rule (AGENTS.md):** this is a learning surface, so it cites the vendored evidence by §
number, derives everything from the append-only `reviewLog` + the deck (D3), adds no runtime
dependency (rule 1), and gives every new motion a reduced-motion story (D8).

> Planning artifact. Defines the requirements, the design and the ordered task plan. No game code
> is written until it is approved. **Implemented 2026-10-03** — see §9 for what landed and how it was
> verified.

---

## 0. Where we are, and what this supersedes

`doc/FEEDBACK_CONFIDENCE_PLAN.md` §7 shipped phase 4 (A8) on 2026-10-02. Two of its four parts are
being retired, and this plan is the replacement for the third:

| part | shipped | verdict |
|---|---|---|
| **4a** the one-line `why` at the slip reveal (`.tl-why`) | yes | **superseded by this plan.** `why` is a *significance* line ("A peak of 20th-century achievement"), so it cannot explain a **placement**; and it duplicates what the card's fact-sheet popover already renders (`factRow("Why it matters", e.why)`). |
| **4b** the predirected pre-reveal prompt | yes | **drop.** It fired on the round's first card, where "the event just before this one" is a given anchor (or does not exist), and the cue had no input — only *I'm sure / Not sure / Skip*. Structurally it was the two-button self-report §9 rates weakest (g=0.24), with an unanswerable question above it. |
| **4c** the `confidence` log field | yes | **drop.** Inference from `outcome` makes the field a pure function of `outcome`: identical information, and persisting it would violate D3. If calibration is wanted it belongs in the predict-then-disclose mode scoped at `doc/STUDY_MODES.md` §3.2 (12+, locked, not adjustable). See §5.5. |
| **4d** the 5–7 focus-panel star gate | yes | **keep as-is.** Not touched by this plan. |

**Ordering:** the revert of 4a/4b/4c landed **2026-10-02**. `prompt-plan.js` and its Node tests,
the `.tl-why`/`.tl-prompt*` CSS, `renderPrompt`, the `PROMPT` bridge, the `confidence` capture and
field, and the boot tag + manifest entry are all gone (manifest back to **133 files**, generation
`bbcaf47e1d82`; `timeline.js?v=203`, `styles.css?v=136`). This plan therefore starts from a clean
surface, and the revert is deliberately not a task in §5.

---

## 1. Research — why a connection, not a significance line

The whole justification is that **the slip is a feedback moment, and feedback must explain the
answer, not decorate it.**

| finding | source | consequence here |
|---|---|---|
| **EF with explanation (EFE) is the only feedback type effective for LOW prior knowledge**; all feedback types work for high-prior-knowledge learners | `§8` | The slip moment is where a beginner is. The line must *explain*, and a significance note does not. |
| Empty feedback ("Correct!" / "Incorrect" with no elaboration) is the canonical anti-pattern; **every quiz answer needs a why** | `§8` | Something must be at the slip. This plan keeps a line there — it just changes *what* the line is. |
| **Answer-Until-Correct with explanation (AUCE) is the strongest single feedback variant** | `§8` | This game already *is* AUCE: a wrong placement bounces back and, after `RESCUE_AFTER` misses, the correct spot is revealed with an explanation. The cue is the explanation half of a mechanic the evidence already favours. |
| Self-explanation prompts: 1–2 per section; prompt fatigue is real | `§9` | Reinforces dropping 4b, and caps this cue at **one line, one edge**. |
| Multiple-choice self-explanation is the weakest format (g=0.24) vs predirected (g=0.70) | `§9` | Dropping the two-button prompt costs the least of the four formats. |
| Retrieval practice > elaborative studying with concept mapping | `doc/CONNECTIONS.md` §6 (Karpicke & Blunt 2011) | The connection must be **spoken about**, not drawn. No graph UI, no editor. |
| Concept maps **g=.604\***; constructed (.819) > studied (.373) | `doc/CONNECTIONS.md` §6 (Nesbit & Adesope 2006) | The link is worth teaching; a cue is the cheap half of it. |
| A map's link **identifies the relationship** — the label is definitional | `doc/CONNECTIONS.md` §6 (Schroeder et al. 2018) | An unlabelled edge teaches nothing, which is why `rationale` is mandatory in the schema. |
| Explicit teaching of causal strategies + second-order concepts improves causal reasoning | `doc/CONNECTIONS.md` §6 (UvA) | The `type` is the curriculum; rendering the phrase is part of the lesson. |
| Keep retrieval success ≥ ~50% (desirable difficulty) | `§11` | The cue arrives with the answer, so it raises success rather than lowering it. |
| Calibration only improves with answer disclosure | `§13` | Retired with 4b/4c; see §5.5. |
| Age gate: 5–7 skip abstract self-rating; 8–11 one simple self-check | `§20` | Moot once the prompt is dropped; the *phrase* is age-safe at every band (see §4.4). |

**One tension, recorded honestly.** `§9`'s boundary conditions say fill-in-the-blank and predirected
are *most appropriate* for ages 5–7, which pulls against `§20`'s "5–7 skip". `GAMIFICATION_BRIEF`
makes `§20` the consolidated age table and the brief's conflict rules (`§17`) govern, so the prompt
still goes — but this is a case where the corpus disagrees with itself, not a clean reading.

**Where the concept-map evidence lives.** The causal-reasoning and concept-map sources
(Nesbit & Adesope 2006; Karpicke & Blunt 2011; Schroeder et al. 2018) are cited in
`doc/CONNECTIONS.md` §6, **not** in the vendored `doc/references/mcg_research_synthesis.md` — its
only Nesbit hit is Adesope & Nesbit 2011, a different paper (redundancy). They are cited where they
live rather than moved.

---

## 2. What we actually have (surveyed 2026-10-02)

### 2.1 The edges exist and are gated — but nothing reads them

```
$ grep -n "connections" timeline.js
(no output)
```

`connections[]` is authored, validated by `scripts/validate-content.mjs:383–476`, shipped to the
browser inside each deck's generated `deck.js` — and **consumed by exactly zero lines of the game.**
It is authored data with no runtime reader.

### 2.2 Coverage — one deck of four

| deck | events | events with any edge | edges |
|---|---|---|---|
| `inventions-discoveries` | 40 | 39 | **61** |
| `cc-timeline` | 161 | 0 | 0 |
| `world-history-first-timeline` | — | 0 | 0 |
| `world-literature` | — | 0 | 0 |

So the cue is a **progressive enhancement on 12% of the corpus.** `cc-timeline` — the flagship, and
the deck `smoke:feedback` drives — has none. This is the single biggest constraint in the plan and
it is why §4.6 makes "show nothing" a first-class, tested behaviour rather than an edge case.

**Update (2026-10-03) — two more decks authored.** `world-history-first-timeline` gained **38** edges
(31 of 40 events) and `cc-timeline` **162** edges (113 of 161 events), both passing `validate:content`.
`world-literature` is now the only deck with no `connections[]`, so the smoke's "renders nothing"
control moved there. The authoring is a curriculum-order (not calendar-order) graph for `cc-timeline`:
the deck sorts by a `sortYear` sequence, and an edge may only point forward in that sequence, so a
date-driven authoring pass would have produced RULE 1 violations. **Open quality item:** `contributing`
is 85% of the `cc-timeline` edges and 92% of the `world-history` edges, which the validator reports as
a warning ("a type that dominates the vocabulary teaches nothing", §3 of `doc/CONNECTIONS.md`) — a
follow-up editorial pass should re-derive some edges as `necessary`/`echo`/`trigger`.

Edge types on the pilot: `contributing` 28 (46%), `necessary` 19 (31%), `echo` 13 (21%),
`trigger` 1 (2%). One edge is `contested`. The gate's >50% balance warning does not fire.

### 2.3 The round is **not** chronological — so "is the partner on the board?" is a real test

`buildPuzzle` (`timeline.js:2122`) does not deal the timeline from the ends:

- `anchors` = the **first two of a shuffled draw**, then sorted by year (`timeline.js:2144`) — two
  *random* events, not the earliest and latest.
- `queue` = the remaining chosen events, **shuffled** (`seed + 7777`).

A card can therefore be placed before the first anchor or after the second, and whether a given
edge's partner is already on the board is a function of the shuffle. The cue's eligibility rule must
therefore be *"is the partner visible right now"*, evaluated against the live board — and the cue
must be **frozen when it is computed**, because the board keeps changing as later cards land.

### 2.4 Two of the 61 edges break the model's own storage rule, and the gate does not catch it

`doc/CONNECTIONS.md` §2: *"Edges are directed earlier → later and stored **only on the earlier
event**."* `validate-content.mjs` enforces array shape, `type`, rationale ≥20 chars, dangling `to`,
self-reference, duplicate target, `contested`, `via` — **but never checks the year order**, despite
its own comment asserting the rule.

Two edges violate it, both `echo`:

| stored on | points to | years |
|---|---|---|
| `timbuktu-scholars` | `house-of-wisdom` | 1493 → **813** |
| `mendeleev-periodic-table` | `newton-principia` | 1869 → **1687** |

Both are stored on the *later* event. `doc/CONNECTIONS.md` §5 also describes the second pair as
`newton-principia → mendeleev-periodic-table` — i.e. the doc and the data disagree about which
event holds the edge.

**Why this matters for a consumer:** the phrase table is direction-sensitive (§4.3), so a
misordered edge produces a sentence that is backwards. `timbuktu-scholars → house-of-wisdom` would
render as *"the House of Wisdom mirrored this"*, which is false — Timbuktu is the later mirror.
A runtime consumer therefore **cannot trust the storage rule**, and must verify it (`§4.2`) instead
of assuming it.

### 2.5 The two slip moments, in code

| moment | where | today |
|---|---|---|
| **stuck** — after `RESCUE_AFTER` misses | `attemptPlace` → `triggerRescue` (`timeline.js:3602–3758`) | `buildRescueCallout` prints `rescueOrderingText` ("It goes between X and Y") **plus** `ev.why \|\| ev.fact`. The why is already here. |
| **placed** — the card is committed and revealed | `commitPlacement` (`timeline.js:3521`) → `eventEl` (`timeline.js:3355`) | sets `state.revealedFacts[ev.id] = ev.fact` and `state.cardSlips[ev.id] = state.wrongOnCurrent`; `eventEl` then renders the fact and the 4a `.tl-why` line when slipped. |
| the card's popover | `factSheetHtml` (`timeline.js:2864`), row at `factRow` (`:2851`) | already renders `Why it matters` — the duplicate 4a created. |

When 4a shipped, the why appeared **up to three times** for one slipped card: the rescue callout,
the 4a inline line, and the popover. The 4a line has since been removed (§0), which still leaves the
callout and the popover saying it twice — worth de-duplicating (§4.5) rather than leaving as-is.

---

## 3. Requirements

### Functional
- **FR1 Derived only.** Every word of the cue comes from an authored `connections[]` edge already in
  the deck. No inferred links, no year arithmetic presented as a claim, no generated prose.
- **FR2 Partner must be visible.** The cue renders only when the edge's partner is **already on the
  player's timeline** (or is one of the two pre-placed anchors) at the moment the cue is computed.
  A causal claim about an event the player cannot see does not explain a placement.
- **FR3 One line, one edge.** At most one edge is shown at a time.
- **FR4 Same line at both slip moments** — the rescue callout and a slipped card's reveal — from a
  single selector, so the two surfaces can never disagree.
- **FR5 Replaces 4a.** The `.tl-why` significance line is removed; the popover's generic
  `Why it matters` row is replaced by the edge's `rationale` when a usable edge exists (§4.5).
- **FR6 Degrade to nothing.** A deck with no edges, a card with no usable edge, or an unknown event
  id renders **no** line and no placeholder. This is the common case (§2.2), not an error.
- **FR7 Direction is verified, never assumed.** The cue uses an edge only if
  `sortYear(from) <= sortYear(to)`, the model's own storage rule (§2.4). Offenders are dropped at
  runtime and reported as a content finding.
- **FR8 Age-safe copy.** The line uses only the plain phrase from `doc/CONNECTIONS.md` §3.1 — the
  abstract code (`necessary`/`contributing`/`trigger`/`echo`) is never shown, at any band. The
  `rationale` and the `contested` flag are 12+ only (§4.4).
- **FR9 Announced.** The line reaches the existing polite live region — the rescue callout already
  builds `data-announce`; the reveal line needs an equivalent.

### Non-functional
- **NFR1 Pure and Node-testable.** Edge indexing, eligibility, selection and the phrase table are
  DOM-free and unit-tested in Node, like `review-scheduler.js` and `prompt-plan.js` before it.
- **NFR2 Deterministic.** Same event + same board + same deck → same cue. Needed for both the tests
  and a stable freeze across re-renders.
- **NFR3 No new dependency** (rule 1) and **no new gate** — `validate:content` already validates
  connections (§4.7, with one addition).
- **NFR4 Reduced motion (D8).** The cue is static text; nothing animates, so the floor is met
  trivially — same as `.tl-prompt` before it.
- **NFR5 Bounded.** Index build is O(edges) per deck, once; selection is O(edges touching the card).
- **NFR6 Classic script, correct load order** (AGENTS.md rules 1 and 4), `?v=` bump on every edited
  first-party file (rule 3), and any new boot script added to the offline manifest `SHELL`.

### Acceptance criteria
- **AC1** On `inventions-discoveries`, a slipped card whose edge partner is on the board shows
  exactly one cue line, and the text is that edge's phrase + the partner's title.
- **AC2** The same card shows **no** cue on `cc-timeline` (no edges) and never shows a placeholder.
- **AC3** No cue is ever shown whose partner is not on the timeline.
- **AC4** The two misordered edges (§2.4) never render; a Node test pins them by id.
- **AC5** An `echo` cue reads in the corrected direction (the *later* event is the mirror), pinned
  by a Node test.
- **AC6** 5–7 and 8–11 never see a `rationale` or the word "contested"; 12+ may.
- **AC7** The rescue callout's announcement string contains the cue once (no duplicated text).
- **AC8** The pure module's tests are chained into `npm test`; `npm run validate` stays green bar
  the known `validate:backlog`; no new vendor surface.

### Falsifier
**The slice is wrong if** a cue renders for a partner that is not visible, or on a deck with no
edges, or states a direction the data contradicts (AC4/AC5); or if the line is shown more than once
per slip; or if **slips/run rises** after the change (`GAMIFICATION_BRIEF` §12 harm check); or if a
playtest shows players do not read the line — in which case it is decoration and should go.

---

## 4. Design

### 4.1 The module

A new pure classic script, `connections.js` → `window.Connections`, loaded **before `timeline.js`**
(index.html rule 4), evaluated directly in Node by `scripts/test/connections.test.mjs`. It is the
same shape as `review-scheduler.js` and `prompt-plan.js` — deliberately, so the seam is familiar.

```js
// Edge words per type — the age-safe phrase (doc/CONNECTIONS.md §3.1).
// For edge A -> B: `target` is used when the card being explained is B (the
// edge's target, so the partner is A); `source` when the card is A. `%s` is the
// PARTNER's title, and the two columns differ because `echo` reverses (§4.3).
PHRASES = {
  "necessary":    { target: "%s made this possible",    source: "This made %s possible" },
  "contributing": { target: "%s helped lead to this",   source: "This helped lead to %s" },
  "trigger":      { target: "%s set this off",          source: "This set off %s" },
  "echo":         { target: "This mirrored %s",         source: "%s mirrored this" },
}

indexEdges(events)              -> { out: Map<id, Edge[]>, in: Map<id, {from, edge}[]> }
cueFor(event, index, placedIds) -> Cue | null        // pure; the whole decision
cueText(cue)                    -> string            // player-facing line
cueAnnounce(cue)                -> string            // live-region sentence
```

`indexEdges` drops dangling targets (imported decks bypass the gate) and self-references, and
skips any edge failing FR7. It never throws on malformed input.

### 4.2 Eligibility

An edge is **usable** for card `X` when all hold:

1. `partner !== X.id`;
2. `sortYear(edge.from) <= sortYear(edge.to)` — the storage rule, verified not assumed (FR7);
3. `placedIds` contains `partner` (FR2).

The cue is computed against the board at the moment of the slip and then **frozen** —
`state.cardCue[X.id] = cue` inside `commitPlacement`, beside the existing
`state.cardSlips[X.id] = state.wrongOnCurrent`. That mirrors how `revealedFacts` and `cardSlips`
already work, keeps it stable across re-renders, and is required by §2.3 (the board keeps changing).

### 4.3 The phrase table is per-type **and** per-direction

A single template is wrong, and `echo` is the proof: the model's rule is earlier → later, so for
`echo` the *later* event is the mirror — the opposite of the causal types. A naive
`"%s" + phrase + "this"` renders `timbuktu-scholars → house-of-wisdom` as *"the House of Wisdom
mirrored this"*, which is backwards (and is exactly the class of edge that can be misordered,
§2.4). Hence the two-column table above and the Node test in AC5.

### 4.4 Age gating

| band | the phrase line | `rationale` | `contested` |
|---|---|---|---|
| 5–7 | yes | no | no |
| 8–11 | yes | no | no |
| 12–16 / 17+ / unset | yes | yes | yes |

`doc/CONNECTIONS.md` §3.1 already fixes the phrases as the player-facing form for the youngest
bands, so the line itself needs no gating — only the longer prose does. The band comes from the
existing `band(user)` / `bandForUserId(userId)` helper, never re-derived.

### 4.5 Two render sites, one selector

- **Rescue callout** (`buildRescueCallout`, `timeline.js:3716`): adds one `p.gap-callout__link` after
  `gap-callout__order` and before `gap-callout__why`; the cue text is appended once to
  `li.dataset.announce` (AC7).
- **Placed card** (`eventEl`, `timeline.js:3355`): the `.tl-why` block is replaced by a
  `.tl-conn` block, shown when `state.cardCue[e.id]` exists. The `slipped` guard is kept so the cue
  stays a *slip* surface.
- **Popover** (`factSheetHtml`): when the card has a usable edge, its `Why it matters` row becomes
  the edge's `rationale` (12+), so the popover and the inline line stop saying the same thing twice
  (FR5) — this is the fix for the duplication that motivated retiring 4a.

### 4.6 Failure modes

- No edges in the deck → `indexEdges` returns empty maps; `cueFor` returns `null`; nothing renders (AC2).
- Partner not placed → `null` (AC3). This will be the usual outcome early in a round (§2.3).
- Dangling `to` (only possible on an imported deck) → dropped by `indexEdges`.
- Unknown `type` → dropped (the gate blocks it for shipped decks; imports do not).
- Missing/unparseable `year` on either endpoint → the FR7 comparison cannot be made, so the edge is
  dropped rather than guessed.
- A structural write failure must never block finishing a round (fail-open).

### 4.7 One gate addition

The gate's own comment asserts the earlier→later storage rule but never checks it (§2.4). Add the
check to `scripts/validate-content.mjs` in the existing connections block: an edge whose endpoints
contradict the rule is an **error** for a shipped deck. This closes the gap that lets a consumer
render a backwards sentence, and it must land **before or with** the consumer. The two known
offenders (§2.4) are fixed by the content owner in the same pass — either by moving the edge to the
earlier event or by dropping it — and the decision is recorded in `doc/CONNECTIONS.md`.

---

## 5. Build plan

### 5.1 Dependencies and order

1. **Revert 4a/4b/4c** (§0) — small, separate, lands first.
2. **T1 + T6** (pure module + gate check) before **T2–T4** (the render sites), because the render
   sites consume the module and the gate guards the data they read.
3. **T5** (`?v=` bumps, load order, manifest) with the first render change, not after it.

### 5.2 Tasks

- **T1 — `connections.js` (pure).** `indexEdges` / `cueFor` / `cueText` / `cueAnnounce` / `PHRASES`.
  *Verify:* `scripts/test/connections.test.mjs` — the phrase table for all four types × both
  directions; eligibility (partner unplaced → `null`); the FR7 year rule; the two misordered edges
  by id (AC4); the `echo` direction (AC5); dangling/self/unknown-type drops; purity.
- **T2 — the rescue callout line.** One `p.gap-callout__link` in `buildRescueCallout`, folded into
  `dataset.announce` exactly once.
- **T3 — the reveal line.** `.tl-why` → `.tl-conn` in `eventEl`; `state.cardCue` written in
  `commitPlacement`; new state field in `createGameState`.
- **T4 — the popover de-duplication.** `factSheetHtml` uses the edge `rationale` (12+) in place of
  the generic `Why it matters` row when a usable edge exists.
- **T5 — boot wiring.** `connections.js` added to `index.html` before `timeline.js` and to
  `scripts/gen-offline-manifest.mjs` `SHELL`; `?v=` bumped on `connections.js`, `timeline.js`,
  `styles.css`; stale `.tl-why*` / `.tl-prompt*` rules removed; manifest regenerated.
- **T6 — the gate check (§4.7)** in `validate-content.mjs`, negative-tested against a deliberately
  reversed edge before it is trusted.
- **T7 — verification.** Node tests chained into `npm test`; extend the browser smoke — assert the
  cue appears on a seeded `inventions-discoveries` slip with a placed partner, that it is **absent**
  on the same shape in `cc-timeline`, and that no cue ever names a card not on the board.

### 5.3 Verification, concretely

- `npm test` (pure module chained), `npm run validate` green bar the known `validate:backlog`.
- `npm run smoke:feedback` (already drives `cc-timeline`) keeps passing with the cue absent — that
  absence **is** AC2.
- A new or extended browser smoke on `inventions-discoveries` covers AC1/AC3/AC7 and reduced motion.
- Hand checks (unchanged from the phase-4 checklist): pixels, print, iOS Safari.

### 5.4 What this plan cannot claim

That the cue helps learning. The mechanics and the data contract are testable; the learning claim is
`§12`-style playtest territory and the falsifier above is where it gets tested. Nor can it claim
coverage: on three of four decks it renders nothing, by design.

### 5.5 The retired `confidence` field, recorded

`doc/FEEDBACK_CONFIDENCE_PLAN.md` §7 shipped `confidence?` as the sanctioned §6 schema addition.
Retiring it is a decision about **inference**, not about UI:

- `outcome` (`firstTry`/`slip`) is already the accuracy signal, recorded on every placement row, and
  it is what A10's `rate(outcome)` seam consumes. The scheduler never needed a self-report.
- Inferring confidence from `outcome` yields a field that is a **pure function of `outcome`** —
  identical information, which D3 forbids persisting (derive, never store derived state).
- It also loses the reason the field was added: A8/A10 wanted correct+sure = `Easy`,
  correct+unsure = `Hard`, wrong = `Again`. From inference you can only produce `Again` and **one**
  of `Easy`/`Hard`, because a confident correct and a lucky correct are indistinguishable.
- The residual guess case is not random noise: guessing is likeliest where the board is sparse —
  early cards, unfamiliar decks, beginners — so the inflation is **systematic and upward for the very
  population the mastery estimate is built from**. A skill-correlated bias does not average out with
  volume the way random noise does.

So the field is dropped, and `outcome` stays the single accuracy signal. If calibration is wanted it
belongs in the dedicated predict-then-disclose mode already scoped at `doc/STUDY_MODES.md` §3.2
(12+, prediction locked before disclosure), where the prediction is genuinely independent of what
gets recorded. `doc/GAMIFICATION_BRIEF.md` §6 loses the `confidence?` line and §11 phase 4 is
amended to point here.

---

## 6. Non-goals

- **No Connections *mode*.** `doc/CONNECTIONS.md` §7 designs `#8 cause/effect`, `#17` as the
  distractor bank, and `#19 chain`. None of that is built here; this plan is one cue, not a mode.
- **No graph, no editor, no drag.** Karpicke & Blunt (§6) is explicit that retrieval beats mapping,
  and a canvas is the expensive half of the wrong one.
- **No rationale inline.** The long prose stays behind the popover; the line is one sentence.
- **No authoring.** No new edges are written in this slice beyond resolving the two offenders
  (§4.7), and the cue adds no authoring burden to `cc-timeline`.
- **No new gate, no new dependency, no schema change** — §4.7 adds a check to an existing gate; the
  edge schema is unchanged.
- **No scoring effect.** Connections never change score/XP/level (`GAMIFICATION_BRIEF` G5).
- **No change to the rescue mechanic** itself — only one line added to a callout that already exists.

---

## 7. Alternatives ledger

| alternative | verdict |
|---|---|
| Keep 4a's `why` line and add the cue beside it | **rejected** — that is three explanations at one slip moment (rescue + why + cue), and the why duplicates the popover. Replace, don't stack. |
| Recompute the cue on every render | **rejected** — the board changes (§2.3), so the same card would silently change its story. Freeze at commit (§4.2). |
| Trust the storage rule and skip the year check | **rejected** — two shipped edges already violate it (§2.4), and imports are ungated. Verify (FR7). |
| Show every edge touching the card | **rejected** — prompt fatigue (`§9`), and a median 1.5 edges/event means the median card would show two. One edge, one line (FR3). |
| Rank by type strength alone | **rejected** — for a *placement* cue the nearest visible partner is the most useful anchor. Rank by (causal type, then year distance). |
| Auto-author edges for `cc-timeline` | **out of scope** — `doc/CONNECTIONS.md` §9 measures the flagship as the *most* expensive deck to author (~250 edges, 0% `category`/`summary`). It is a content programme, not a side task. |
| Extend the cue to correct placements | **deferred** — A8's mandate is slip-moment feedback; the falsifier would have to change before this. |

---

## 8. Open questions

1. **The two misordered edges (§2.4): move or drop?** **Decided: move both** (2026-10-03).
   `timbuktu-scholars → house-of-wisdom` was moved onto `house-of-wisdom` (813) as
   `to: "timbuktu-scholars"`, and `mendeleev-periodic-table → newton-principia` was moved onto
   `newton-principia` (1687) as `to: "mendeleev-periodic-table"` — both kept their authored
   rationale, which already read in the corrected direction, and both source events dropped their
   `connections` key entirely. `validate:content` now **fails** on a reversed edge (§4.7), so this
   class of defect cannot return silently.
2. **Does the cue belong on the rescue callout, the reveal, or both?** **Decided: both**
   (2026-10-03). They are specified (FR4) and share one `freezeCue` selector, so they cannot
   disagree; the rescue is the stronger moment (the player is stuck) and the reveal is the durable
   record. If only one survives playtest, drop the reveal and keep the rescue.
3. **Should a correct-but-slow placement carry the cue?** Currently slipped-only, inherited from
   A8. Revisit after the falsifier runs.
4. **`rationale` length.** Some run to three lines and were written for an author, not a player
   (e.g. *"Translation is a second-order technology: it operates on texts that…"*). If the popover
   row reads badly, it needs an editorial pass before 12+ sees it.
5. **Does the cue feed the review scheduler?** `doc/CONNECTIONS.md` §8 wants a due event promptable
   from *any* edge touching it, in either direction. That is a reach-back feature; this plan does
   not touch `rate()` or `dueSet()`.

---

## 9. Implementation record (2026-10-03)

All of §5 landed. `connections.js` is a DOM-free classic IIFE exporting `PHRASES`,
`PROSE_BLOCKED_BANDS`, `indexEdges`, `storageRuleViolations`, `cueFor`, `cueText`, `cueAnnounce`,
`rationaleFor`, `isContested`, `sortYearOf`. `timeline.js` (`?v=204`) added `state.cardCue`, a
memoised `connectionIndex()` keyed on the deck object, `freezeCue(state, ev)` (slip-only;
`wrongOnCurrent > 0`; the board is `new Set(state.timeline)` at commit), and `bandForState(state)`
(split-screen aware). The two render sites are `buildRescueCallout` (`p.gap-callout__link`) and
`eventEl` (`.tl-conn` on a revealed slipped card); `commitPlacement` announces the reveal cue through
the existing `.rescue-status` polite region, **except** on the rescue path (where the callout already
announced it — no double-read). `factSheetHtml(e, includeMap, whyOverride)` lets the 12+ popover row
carry the edge `rationale` in place of the generic `Why it matters`.

Order (§5.1) was preserved: module + gate before the render sites, with `?v=`/load-order/manifest
changes in the same edit as the first render change.

**Verification (all run, all green unless noted):**

- `scripts/test/connections.test.mjs` — 20/20, chained into `npm test` as `test:connections` (phrase
  table 4×2, eligibility, FR7 year rule, the two moved edges by id, dangling/self/unknown/year-less
  drops, reverse index, selection order, age gate, purity, real-deck index sanity).
- `npm run validate:content` — **negative-tested**: re-adding the reversed `mendeleev → newton` edge
  printed one error naming the edge and exited 1; removing it returned the gate to 0 errors.
- `npm run smoke:connections` (new, Chromium, §T7) — 18/18. Drives an `inventions-discoveries` round:
  25 reveal lines and 25 rescue cue lines, each naming a partner on the board; a rescue callout's
  `data-announce` carries its cue exactly once; `world-literature` (no edges) renders neither surface while its rescue
  still fires; the 5–7 fact sheet never restates the cue; all of it holds under reduced motion.
- Regression: `npm run smoke:feedback` 24/24, `smoke:mastery` 18/18, `smoke:review` 17/17,
  `smoke:offline` 48/48, `smoke:webkit` 20/20 — the render changes did not disturb the retired
  surface or the offline layer.
- Gates: `validate:index`, `validate:content`, `validate:vendor`, `validate:offline` (134 files,
  generation `432de6335ad2`), `validate:recipe`, `validate:narration` (40 clips) all pass. The two
  known pre-existing reds are unchanged and were **not** touched: `validate:backlog` (needs
  `tools/narration/node_modules`; a check that could not run must never report clean) and
  `validate:pipeline` (0/321 events carry a `source`).
- Changed first-party files: `index.html` (`connections.js?v=1` before `timeline.js?v=204`,
  `styles.css?v=137`), `styles.css` (`.tl-conn`, `.gap-callout__link`),
  `scripts/gen-offline-manifest.mjs` (`SHELL`), `decks/inventions-discoveries/deck.json` +
  regenerated `deck.js`/`decks/index.{json,js}`.

**Still unverifiable by this work, and not claimed:** iOS Safari, print output, pixel appearance, and
whether the cue *improves learning* (§5.4 — a playtest question, not a code question).