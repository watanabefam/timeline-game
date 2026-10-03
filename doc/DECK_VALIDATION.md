# Deck validation — what the gate checks and why

> The rules behind `npm run validate:content`
> (`scripts/validate-content.mjs`), the evidence each one rests on, the numbers
> the corpus actually produces today, and the items this gate deliberately
> leaves to a human.

**Last updated:** 2026-10-03 · **Gate:** `scripts/validate-content.mjs` (always
green, part of `npm run validate`) · **Companion gates:**
`tools/content-pipeline` (the provenance/licensing gate, honestly red) and
`scripts/audit-connections.mjs` (the edge-quality instrument).

---

## 1. Why a second layer of rules

The existing gate had one shape of rule: *look at one event, decide whether its
`fact` earns its place*. That is the right first rule and it stays. But this is
a game scored on **relations between events** — "did this come before that?" —
so the defects that reach a player are mostly deck-level, and a gate that only
looks one event at a time cannot see them:

| Found by | Defect | Player-visible as |
|---|---|---|
| the new rules | `tess` had `category: "tragedy"`, a value the deck's own genre filter never declared | the event silently missing from every genre filter |
| the new rules | 10 events dated outside the era range their own label declares | a filter chip that puts a 1327 novel in "Contemporary (1960+)" |
| the new rules | 2 filter options that match no event | a chip that returns nothing |
| the new rules | `apollo-11-moon` has both `noMap` and coordinates | a pin the deck says not to show, or a broken map frame |
| reporting | 9 sort-key ties covering 18 events | pairs that measure nothing about ordering |
| reporting | every deck's prose sits far above a 5–7 reading level | a band the product offers that the content does not meet |

None of these is a "who invented the printing press" question. They are contract
and measurement questions, which is exactly the class a machine should settle.

## 2. What each new rule is, and what backs it

### 2.1 `id` integrity — **error**

The id is not cosmetic: narration clips ship as
`decks/<id>/narration/<event-id>.mp3`, and the review log, the connection graph
and the stats screen all key on it. An id that is not a safe slug breaks an
asset path; a duplicate id makes every one of those lookups ambiguous. Rule:
non-empty, `^[a-z0-9][a-z0-9-]*$`, unique within the deck.

### 2.2 The filter contract — **error**, with a warning for the empty chip

A field-based filter resolves to equality on one field
(`get: { "field": "era" }`, `events-data.js` `resolveGet`). So:

* an event whose value is not among the filter's declared `options` matches
  **nothing** and disappears from that filter — an **error**, because it is a
  defect with no valid reading, and the fix is unambiguous (either declare the
  value or use a declared one);
* a declared option that matches no event is a **warning**, not an error: a
  deck may legitimately offer a bucket it has not filled yet.

This rule is the reason `decks/world-literature`'s `tess` was changed from
`category: "tragedy"` to `category: "literary"`. No editorial judgement was
involved — `tragedy` is not in the deck's own list of genres and cannot be.

### 2.3 Declared ranges — **warning**

A filter option may now carry `min` / `max` (seconds omitted = open). That
matters because a gate otherwise has to recover era boundaries by parsing the
human label — `"Medieval (500–1300)"` — which is a hack that breaks the first
time someone reword a label. `world-literature`'s era options now state their
ranges as data, and the gate checks each event's year against the range its own
option declares.

It is a **warning** because resolving a mismatch is an *editorial* decision: an
event dated 1387 labelled `medieval` (declared to 1300) can be fixed by moving
the event to `renaissance`, or by widening the range to 1400 — both defensible,
and which one is right is a claim about literary periodisation, not a lint fix.
The gate's job is to name the ten of them, precisely.

### 2.4 Ordering determinacy — **reported, never failed**

Item-quality research is unambiguous that an item needs one correct answer
(Haladyna et al. 2002, k=91 studies; Rodriguez 2005 — both summarised in
`doc/references/mcg_research_synthesis.md` §12), and an item with two
acceptable answers measures nothing about the construct.

This game already honours that: `timeline.js` `correctIndexRange()` returns an
**inclusive** `[before, atOrBefore]` range, so two events sharing a sort key can
be placed in either order and both are correct. A tie is therefore **not** a
scoring bug, and failing the build on it would be wrong. What it is, is a pair
that cannot discriminate — so the gate reports the count and the event ids:

| deck | sort-key ties | events |
|---|---|---|
| `inventions-discoveries` | 1 (`1969`: `arpanet-first-message` / `apollo-11-moon`) | 2 |
| `world-literature` | 8 (`1600`, `1740`, `1759`, `1782`, `1847`, `1925`, …) | 16 |
| `cc-timeline`, `world-history-first-timeline` | 0 (curriculum `sortYear` is unique) | — |

Whether a tie is *desirable* is a difficulty question — two books from the same
year make a fine hard round and a terrible easy one. That belongs to the round
builder, not to the gate.

### 2.5 Relative-order cues — **warning**

The year rule ("years live only in the year field") stops an **absolute**
leak. It does not stop the **relative** one: "after the fall of Rome",
"decades later", "years before the war". Those answer the exact question the
round asks. Counts today:

| deck | events with relative-order language in narrated text |
|---|---|
| `cc-timeline` | 45 / 161 |
| `inventions-discoveries` | 23 / 40 |
| `world-history-first-timeline` | 20 / 40 |
| `world-literature` | 20 / 80 |

A warning, never an error, for three reasons: a relative cue is also
legitimate scaffolding for a learner who has no anchor yet (and the younger
bands get no rationale prose at all, so this is the only cue they get); the
regex reads words, not meaning — "after" in "After the Second World War" is a
cue, "after" in "the patient recovered after surgery" is not, and no regex can
tell those apart; and a rule that fires on 45 of 161 events teaches everyone to
skip the line. `first` and `then` are only counted in `fact`/`why`, because in a
name they are titles ("First Consul").

### 2.6 Readability — **reported, counted nowhere**

Flesch–Kincaid grade level over `title + fact`, using the *same*
`fleschKincaidGrade` implementation the content pipeline grades `summary` with,
imported rather than copied: two grade-level implementations in one repo drift,
and a drifting readability number is worse than no number.

| deck | median | p90 | over grade 3 | over 6 | over 9 |
|---|---|---|---|---|---|
| `cc-timeline` | 6.8 | 11.2 | 143 | 96 | 40 |
| `inventions-discoveries` | 7.4 | 9.7 | 40 | 33 | 6 |
| `world-history-first-timeline` | 8.3 | 12.3 | 40 | 31 | 17 |
| `world-literature` | 8.9 | 12.6 | 80 | 77 | 39 |

**Read this honestly.** The bands are grade 3 / 6 / unbounded
(`doc/references/mcg_research_synthesis.md` §20 puts "recall only" at 5–7 and
`doc/CONTENT_PIPELINE.md` §2 uses 3–9 as its summary band). Essentially every
shipped fact is above grade 3, and `world-literature` sits at a median of 8.9 —
adult reading level. The product offers a 5–7 band that **this content does not
meet**, and that is a product finding, not a deck defect: the fix is either
band-specific prose (a second, simpler `fact` per event) or an honest statement
that the decks are for 8+. Nothing in the gate pretends otherwise, and nothing
fails on it.

### 2.7 Coverage and representativeness — **reported, counted nowhere**

Measured per deck: year span, densest century, and the continent / category mix.

| deck | span | densest century | continent mix |
|---|---|---|---|
| `cc-timeline` | −4004…2018 | 1900s, 27 events | europe 68%, asia 19%, americas 7%, africa 4% |
| `inventions-discoveries` | −3500…2007 | 1900s, 13 | europe 48%, americas 23%, middle-east 10%, asia 10% |
| `world-history-first-timeline` | −65000…1994 | 1900s, 8 | europe 35%, asia 18%, africa 15%, americas 13% |
| `world-literature` | −1250…2018 | 1900s, 17 | europe 71%, americas 15%, asia 10%, africa 4% |

The history-education literature is consistent that what a curriculum selects is
itself a bias, and that the remedy is measurement rather than assertion
(Wilkening 2026, *History Education Research*; Zurné 2026, Cogitatio — both
reporting Euro-American and gender skews in assigned content; *Teaching on a
Moving Train*, History Workshop 2015). `world-literature` at 71% Europe and
`cc-timeline` at 68% are **findings to publish or fix, not failures**: a
Classical Conversations deck is *about* a European curriculum, and pretending
otherwise would be its own kind of dishonesty. `world-history-first-timeline` at
35% Europe with 15% Africa is the deck that shows the measurement is capable of
reporting a different shape.

### 2.8 Map integrity — **warning**, plus one **error**

Off-the-globe coordinates fail; `noMap` together with coordinates, or neither
`noMap` nor coordinates, warns. One real hit:
`inventions-discoveries` / `apollo-11-moon`.

## 3. What is deliberately NOT a rule here

* **Factual accuracy of an event.** That is the provenance gate's job
  (`tools/content-pipeline`), which is honestly red at 0 of 321 sourced events
  and is deliberately outside `npm run validate`. Duplicating it here would add
  a second, weaker copy of a check that already exists.
* **Era or category re-labelling.** See §2.3: the gate names the disagreement,
  a human resolves it.
* **Difficulty curves and round composition.** A tie (§2.4) or a dense century
  (§2.7) is an input to round building, not a content defect.
* **Reading level as a build failure.** See §2.6.

## 4. Open, bounded, and named

1. **10 era-range mismatches** in `world-literature` (`canterbury-tales` 1387,
   `decameron` 1353, `divine-comedy` 1308, `piers-plowman` 1370,
   `heart-of-darkness` 1899, `handmaids-tale` 1985, `catch-22` 1961,
   `shogun` 1600, `name-of-the-rose` 1327, `pachinko` 1910). Each needs one
   editorial decision — move the event or move the boundary.
2. **9 sort-key ties** covering 18 events (§2.4). Informational for round
   building; not wrong.
3. **2 empty filter options** — `Oceania` in `inventions-discoveries` and
   `world-literature`. Either fill them or drop them.
4. **1 `noMap`/coordinate contradiction** — `apollo-11-moon`.
5. **Readability vs bands** (§2.6) — a product decision, not a deck fix.
6. **Nothing above is claimed to be fixed.** These are reported because a
   measured finding nobody has read is not a finding.

## 5. Adding a rule

A rule earns its place here by answering three questions, in this order:

1. **Can a machine decide it?** If it needs a judgement about the world, it
   belongs to the provenance gate and a human, and the honest thing is to
   report the disagreement instead (see §2.3 and the connection audit's
   screen-not-verdict rule in `doc/CONNECTIONS.md` §10.2).
2. **Does it reach a player?** A rule that can only fail on a deck that will
   never ship should not sit in the always-green chain; that is what
   `validate:pipeline` is for, and why it is excluded.
3. **Is it reported at the right volume?** Errors block; warnings advise;
   measurements print. A finding that fires on half the corpus is a
   measurement, not a warning — the order-cue count (§2.5) is exactly that, and
   it is why `info()` exists and counts nothing.
