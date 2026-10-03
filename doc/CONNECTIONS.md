# Connections — edge model, filter rule, and pilot

**Status:** pilot complete on one deck (`inventions-discoveries`) · **Date:** 2026-10-01
**Scope:** how to model, author and gate a causal/connection graph over timeline decks.
**Companion:** `doc/STUDY_MODES.md` §3 (mode catalog), §3.2 (mode specs), §3.3 (competitive read).

---

## 1. What a connection is

An **authored, directed, labelled claim that one event changed the likelihood or the possibility of
another.** Not proximity. Two events in the same era with no contact are not connected — that is the
deck's Simultaneity material, and using it as a Connections edge is the single most common error in a
world-history deck (see §5).

## 2. The edge model

```json
{ "id": "gutenberg-bible",
  "connections": [
    { "to": "copernicus-revolutions",
      "type": "contributing",
      "rationale": "A heliocentric argument published by hand-copying in 1543 stays in a handful of libraries. Copernicus reached readers because he could be printed." }
  ]
}
```

| field | required | notes |
|---|---|---|
| `to` | yes | id of another event **in the same deck** |
| `type` | yes | one of the controlled vocabulary (§3) |
| `rationale` | yes | ≥20 chars. The reason the link exists. **Not optional** |
| `contested` | no | boolean; marks a claim historians argue about |

**Direction and placement.** Edges are directed *earlier → later* and stored **only on the earlier
event**. The reverse index is derived at load time, so a missing back-edge is not a defect and two
events can never disagree about the same link.

**The rule is enforced, twice (2026-10-03).** `validate-content.mjs` now errors on any edge whose
endpoint is earlier than the event holding it (naming the correct holder), and `connections.js`
re-checks the same rule at load time (`indexEdges` drops a misordered edge) because imported decks
never pass through the gate. Two shipped edges violated it before this landed —
`timbuktu-scholars → house-of-wisdom` (1493 → 813) and `mendeleev-periodic-table →
newton-principia` (1869 → 1687). Both were **moved onto the earlier event**, keeping their authored
rationales (which already read in the corrected direction) rather than dropped; see
`doc/CONNECTION_CUE_PLAN.md` §8 Q1 and §9.

**Why the rationale is mandatory.** This is not a stylistic choice. IHMC's **CXL** (Concept Mapping
Extensible Language), the canonical interchange format for concept maps, models a map as
`concept-list` + **`linking-phrase-list`** + `connection-list` + `proposition-list`. The linking
phrase is a **first-class object with its own id**, and the unit of meaning is the **proposition**
(concept → linking phrase → concept) — not the pair. Schroeder et al. (2018) state the same thing
definitionally: *"each link identifies the relationship between the two concepts it connects."* An
unlabelled edge is not a concept map; it is a line. The validator enforces this.

**Controlled vocabulary is separate from the rationale.** The `type` is a shared linking phrase used
by many edges; the `rationale` is unique prose per edge. That split is what CXL's separate
`linking-phrase-list` buys, and it is what makes the type statistically inspectable (§3).

## 3. Type vocabulary — one axis, and the pilot's most important finding

**Adopted 2026-10-01.** `type` is **one axis: causal strength.** The player-facing linking phrase
is derived from it (age-gated, §3.1):

| `type` | test (apply in order) | reads to the player as |
|---|---|---|
| `necessary` | *Without X, Y would **not** have happened.* A hard material or logical dependency — "could only", "presupposes", "X **is** Y on Z". | *made possible* |
| `contributing` | *X made Y **more likely** / easier / faster, but it could still have happened.* Distribution, reach, ecosystem, created-need, ideas/lineage. | *helped lead to* |
| `trigger` | *X **set it off now** — the proximate spark, not the background condition.* | *set off* |
| `echo` | *Not causal at all* — the same mechanism or problem recurring. | *mirrored* |

**`via` is a second, optional axis — the mechanism, never the type:** `idea` (intellectual
transmission: notation, theory, a problem-space) | `material` (physical: industry, tooling, an
ecosystem). It preserves what `influence` used to carry, without polluting the strength scale.

**Why one axis.** The pilot's set — `cause | enabling | influence | theme` — mixed two different
kinds of label: `necessary`/`contributing` are degrees of *strength*, while `enabling`/`influence`
are *kinds of mechanism*, and `theme` is not causal at all. A flat list spanning two axes cannot
answer one question consistently, which is why authoring drifted into the safest word.

**Pilot result on 61 edges (before):**

| type | n | share |
|---|---|---|
| `enabling` | **42** | **69%** |
| `theme` | 13 | 21% |
| `influence` | 5 | 8% |
| `cause` | 1 | 2% |

**One term taking 69% of cases means the vocabulary is not discriminating.** A learner trained on
these labels learns "almost everything is enabling", which is a worse lesson than no label at all.
The skew is not random: "X made Y possible" is the *safest* long-range claim and the easiest to
defend, so authoring drifts to it.

**After re-typing the same 61 edges (2026-10-01):**

| type | n | share |
|---|---|---|
| `contributing` | 28 | 46% |
| `necessary` | 19 | 31% |
| `echo` | 13 | 21% |
| `trigger` | 1 | 2% |

The modal label is now 46%, down from 69%, and each label is applied by a stated counterfactual
test rather than by whatever is easiest to defend. `contributing` is legitimately the most common
real relation in a long-range deck — most causes make things *more likely*, not inevitable — so a
plurality here is the honest shape of the data, not a fresh skew. `trigger` is rare on purpose: a
long-range deck has few proximate sparks (`sputnik-1 → apollo-11-moon`, "sparked a space race", is
the clean case).

**This is the curriculum, not metadata.** The UvA experimental work found that **explicit teaching
of second-order concepts and causal strategies improves 11th-graders' causal reasoning** — so the
*type* is what the learner is practising. `necessary` vs `contributing` is a counterfactual judgement
(Seixas: *"historical events are not inevitable"*; *"causes vary in influence and significance"*) —
exactly the second-order skill history teaching is for.

### 3.1 Decision rule & readable phrases

Run the §4 filter to decide *whether* an edge is causal, then the strength test above to pick
`necessary` / `contributing` / `trigger`. `echo` is chosen when the §4 test fails but a
same-mechanism parallel is still worth teaching. The **readable phrase is what the player sees** and
is age-gated: 5–7 and 8–11 see only the plain phrase (*made possible*, *helped lead to*, *set off*,
*mirrored*), never the abstract code — consistent with A2/A3. The phrase is also the **retrieval cue**
(§6, Karpicke & Blunt): ask "What did X make possible?" rather than having the learner draw a line.

**Anti-skew guard.** `scripts/validate-content.mjs` warns when any single `type` exceeds **50%** of a
deck's edges, so the 69% drift cannot return unnoticed.

## 4. The filter rule

Every proposed edge gets this test, in order:

1. **Does one event change the probability or possibility of the other?** → causal (`necessary` /
   `contributing` / `trigger`)
2. **Does the second exemplify the same transferable mechanism as the first?** → `echo`
3. **Neither** → reject. Two things that happened near each other are a coincidence, and a confident
   spurious causal claim teaches worse than no claim.

**Never derive edges from `year`.** `cc-timeline` dated "British Queen Victoria's Rule Over India" to
**1947** — the year of India's independence, and 46 years after Victoria died. Gandhi
(`cc-145`) is genuinely 1947. A date-driven generator produces a *confident* edge between them. Edges
are authored against the rationale, and the rationale is what is reviewed.

## 5. Rejections (logged so the judgment is auditable)

Eight candidate edges were rejected during the pilot. The rejections are the point — a graph with no
logged rejections has not been filtered.

| rejected edge | why |
|---|---|
| `volta-battery → transatlantic-radio` | Early wireless used **spark-gap** discharge — *static* electricity. The "steady current" mechanism does not apply |
| `newcomen-engine → edison-light-bulb` | Electric generation comes from dynamos, not steam pumping engines. Both are "power"; the mechanisms never meet |
| `edison-light-bulb → hd-tv-service` | "Electricity in the home" is a diffuse background condition true of thousands of pairs. Fails test 1 |
| `wheeled-vehicles → apollo-11-moon` | The lunar module landed on legs. The rover is not an event in this deck |
| `jenner-vaccination → dna-double-helix` | 157-year gap, and immunology and genetics are separate lineages here. Proximity plus "both are biology" |
| `fleming-penicillin → oral-contraceptive` | The archetypal proximity pair: both medicine, 32 years apart, entirely different mechanisms (antibiosis vs hormonal suppression) |
| `newton-principia → mendeleev-periodic-table` | Rejected *as causal*. Retained only as `echo` (predictive structure / the gaps), which is a same-mechanism claim, not a causal one |
| `stockton-darlington → transatlantic-radio` | Two 19th-century networks on two continents. No mechanism |

**Two deliberate downgrades.** `newton-principia → einstein-relativity` is `contributing` (via
`idea`), not `necessary` — relativity *revises* Newton, and the revision is the lesson worth
teaching. `wright-first-flight → sputnik-1` is `echo`, not causal — the rockets came from a
different lineage (which is exactly why `goddard-rocket → sputnik-1` is separately typed
`necessary`).

## 6. Research grounding

| finding | source |
|---|---|
| Concept maps overall **g=.604\*** (k=67, N=5,818); **constructed .819\*** (k=27); **studied .373\*** (k=40) | Nesbit & Adesope (2006), *Review of Educational Research* 76(3) 413–448 |
| **Humanities largest: 1.265\*** (CI .886–1.643) — but rests on **k=3** | same |
| Secondary **.165\*** (k=7) vs intermediate .905\* (k=4) vs postsecondary .773\* (k=7) — **non-monotonic** | same |
| **Retrieval practice > elaborative studying with concept mapping** | **Karpicke & Blunt (2011), *Science* 331, 772–775** |
| A map's link *identifies the relationship* — the label is definitional | Schroeder et al. (2018), *Educational Psychology Review* 30:431–455 (142 effect sizes, n=11,814) |
| Historical causation is **ill-structured** — students "cannot be guided through a problem-space of well-defined moves to reach a correct answer" | Oxford ORA, *A knowledge-based coach for reasoning about historical causation* |
| Causal-diagram **completion** improves monitoring accuracy and comprehension | causal diagramming study |
| Explicit teaching of causal strategies + second-order concepts improves 11th-grade causal reasoning | UvA (Stoel, van Drie & van Boxtel) |
| Dialogic game-based learning scaffolds historical causal thinking | Stoel et al., *Playing with the future past* |
| Links between verbal and visuospatial codes "provide additional retrieval paths" | Nesbit & Adesope (2006), citing dual coding (Paivio 1986) |

**The deciding constraint is Karpicke & Blunt.** Concept mapping is good (.604\*) but retrieval
practice beats it head-to-head. So Connections must make the connection a **retrieval target**, not a
mapping activity. A free-form graph editor buys the weaker of the two — and it is the expensive one.

**On the phrase "additional retrieval paths."** Its provenance is dual coding — verbal +
visuospatial coding give two routes to the same content. It is not a property that graph edges have.
Competitor copy borrows the language and changes the referent.

## 7. Mode design

Connections does **not** need a new mode. It is the implementation of existing `#8 cause/effect`,
with `#17 simultaneity` repurposed, plus one genuinely new mode.

- **`#8 cause/effect`** — unit is an **authored chain**, not a free graph. Play: chain with link(s)
  hidden → complete → explain. The explanation is reflection and is **never scored** (ill-structured;
  there is no correct answer to grade).
- **`#17 simultaneity` repurposed as the distractor bank** — its near-miss contemporaries become the
  lures. The deck's worst false-positive risk (Olmecs/Shang, Rome/Maya: same era, no contact) is
  exactly the item pool a "what did this make possible?" question needs. The trap becomes the bank.
- **New `#19 chain`** — the multi-node authored sequence as the playable object
  (`cc-026 → cc-027 → cc-029 → cc-030 → cc-031`). `#8` is pairwise; this is the systematic form, and
  it is what the .819\* constructed-map effect actually speaks to.

**Sequence:** model one chain narrated → complete a chain → retrieve the link from a cue → argue the
relation (12+). Age gates are provisional: the secondary-student figure (.165\*) is *worse* than
intermediate (.905\*), so calibrate by playtest rather than assuming older learners benefit more.

## 8. Implementation notes

- **Accessibility is the differentiator.** The closest competitor's App Store listing says the
  developer "has not yet indicated which accessibility features this app supports." Graphs are the
  hard case: **WAI-ARIA Graphics Module** is the applicable spec for interactive graphics, and
  Telerik's diagram ships WCAG 2.2 AA against it. The graph must also be navigable as a **list/tree
  structure** for screen readers — that is the `Data Navigator` (CMU) and `Olli` pattern, and it must
  be implemented here rather than adopted, since this project is no-build vanilla JS.
- **The reverse index is required for review cueing — and it now exists.** `connections.js`
  (`indexEdges` / `cueFor`, the cue shipped 2026-10-03; `doc/CONNECTION_CUE_PLAN.md`) builds `out`,
  `in`, `years` and `titles` in one pass, so a card is promptable from *any* edge touching it, in
  either direction. Wiring the cue into `dueSet()` is a separate reach-back slice and is not built.
- **No drag-only interaction** anywhere in the mode (WCAG 2.2 SC 2.5.7, already a hard requirement).
- **Rotate the cue.** Sometimes cue with the year, sometimes with the cause, sometimes with "what did
  this make possible?" One cue format is one retrieval route.

## 9. Pilot results — `inventions-discoveries`

| | |
|---|---|
| events | 40 |
| events with ≥1 outgoing edge | **34** (85%) |
| edges authored | **61** (median 1.5/event) |
| events with none | `fleming-penicillin`, `dna-double-helix`, `oral-contraceptive`, `iphone-launch`, plus `timbuktu-scholars` and `mendeleev-periodic-table` (their single edge each was misordered and moved onto the earlier event — §2) |
| dangling references | 0 |

The four unconnected events are legitimate: three are termini (the newest discoveries, with nothing
later in this deck to point at), and `fleming-penicillin` has none because its only candidate edge was
rejected as proximity (§5). Coverage is a warning in the validator, never an error — an event with no
outgoing edge is a finding, not a defect.

**Why this deck.** 40 events is small enough to author completely; 100% `summary` coverage supplies
the reasoning raw material a rationale is built from; median 24 candidate partners within ±200y is
dense enough that selection is a real act rather than the bottleneck.

**Gate.** `scripts/validate-content.mjs` enforces: dangling `to`, unknown `type`, rationale <20 chars,
self-reference, duplicate target, non-array `connections`, non-boolean `contested`, and — added
2026-10-03 — an edge whose `to` endpoint is **earlier than the event holding it** (the storage rule,
§2) — all **errors**; a deck with no connections at all — a **warning**. The gate was negative-tested
against all four original defect classes, and the year-order error was negative-tested by
re-introducing the reversed `mendeleev → newton` edge (one error, exit 1) before removal.

**Authoring cost, measured.** 61 edges over 40 events is roughly one focused pass. That is the number
that decides the rest: scaled to `cc-timeline`'s 161 events it is ~250 edges, and `cc-timeline` has
0% `category` and 0% `summary`, so every rationale is written from scratch with nothing to work from.
**The flagship deck is the most expensive place to do this, not the cheapest.**
