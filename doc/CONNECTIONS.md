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
      "type": "enabling",
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

## 3. Type vocabulary — and the pilot's most important finding

Vocabulary as authored: `cause` | `enabling` | `influence` | `theme`.

**Pilot result on 61 edges:**

| type | n | share |
|---|---|---|
| `enabling` | **42** | **69%** |
| `theme` | 13 | 21% |
| `influence` | 5 | 8% |
| `cause` | 1 | 2% |

**One term taking 69% of cases means the vocabulary is not discriminating.** A learner trained on
these labels learns "almost everything is enabling", which is a worse lesson than no label at all.
The skew is not random: "X made Y possible" is the *safest* long-range claim and the easiest to
defend, so authoring drifts to it. "Cause" requires a stronger claim and got used once.

**Proposed fix — replace `enabling` with the historians' distinction:**

- `necessary` — without it, not. (Paper for the press. The transistor for ARPANET.)
- `contributing` — made it more likely; it could have happened otherwise. (The railway for the car.)

This is the distinction that *is* the skill. The UvA experimental work found that **explicit teaching
of second-order concepts and causal strategies improves 11th-graders' causal reasoning** — so the
type is not metadata, it is the curriculum. `cause` disappears into `contributing`; `influence`
(ideas/lineage, no mechanism) and `theme` (same mechanism, not causal) stay as they are.

**Decision needed:** adopt `necessary` / `contributing` / `influence` / `theme` and re-type the 61
edges, or keep the current set and accept a label that carries no information 69% of the time.

## 4. The filter rule

Every proposed edge gets this test, in order:

1. **Does one event change the probability or possibility of the other?** → causal (`necessary` /
   `contributing`)
2. **Does the second exemplify the same transferable mechanism as the first?** → `theme`
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
| `newton-principia → mendeleev-periodic-table` | Rejected *as causal*. Retained only as `theme` (predictive structure / the gaps), which is a same-mechanism claim, not an influence claim |
| `stockton-darlington → transatlantic-radio` | Two 19th-century networks on two continents. No mechanism |

**Two deliberate downgrades.** `newton-principia → einstein-relativity` is `influence`, not `cause` —
relativity *revises* Newton, and the revision is the lesson worth teaching. `wright-first-flight →
sputnik-1` is `theme`, not `cause` — the rockets came from a different lineage (which is exactly why
`goddard-rocket → sputnik-1` is separately typed `enabling`).

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
- **The reverse index is required for review cueing.** A due event must be promptable from *any* edge
  touching it, in either direction, or "additional retrieval paths" is a claim about one path.
- **No drag-only interaction** anywhere in the mode (WCAG 2.2 SC 2.5.7, already a hard requirement).
- **Rotate the cue.** Sometimes cue with the year, sometimes with the cause, sometimes with "what did
  this make possible?" One cue format is one retrieval route.

## 9. Pilot results — `inventions-discoveries`

| | |
|---|---|
| events | 40 |
| events with ≥1 outgoing edge | **36** (90%) |
| edges authored | **61** (median 1.5/event) |
| events with none | `fleming-penicillin`, `dna-double-helix`, `oral-contraceptive`, `iphone-launch` |
| dangling references | 0 |

The four unconnected events are legitimate: three are termini (the newest discoveries, with nothing
later in this deck to point at), and `fleming-penicillin` has none because its only candidate edge was
rejected as proximity (§5). Coverage is a warning in the validator, never an error — an event with no
outgoing edge is a finding, not a defect.

**Why this deck.** 40 events is small enough to author completely; 100% `summary` coverage supplies
the reasoning raw material a rationale is built from; median 24 candidate partners within ±200y is
dense enough that selection is a real act rather than the bottleneck.

**Gate.** `scripts/validate-content.mjs` enforces: dangling `to`, unknown `type`, rationale <20 chars,
self-reference, duplicate target, non-array `connections`, non-boolean `contested` — all **errors**;
a deck with no connections at all — a **warning**. The gate was negative-tested against all four
defect classes before being trusted.

**Authoring cost, measured.** 61 edges over 40 events is roughly one focused pass. That is the number
that decides the rest: scaled to `cc-timeline`'s 161 events it is ~250 edges, and `cc-timeline` has
0% `category` and 0% `summary`, so every rationale is written from scratch with nothing to work from.
**The flagship deck is the most expensive place to do this, not the cheapest.**
