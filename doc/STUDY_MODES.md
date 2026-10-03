# Study Modes — Design & Implementation

**Status:** proposal **v2** (evidence-backed, not yet ratified) · **Verified:** 2026-10-01
**Revision:** v2 supersedes v1 in place. v1's mode catalog and TL;DR are preserved verbatim in §14
with the reason for every change. v2 was prompted by a research pass that (a) confirmed three v1
deferrals as documented core purposes of timeline teaching, (b) corrected one headline citation, and
(c) **rejected one mode v1 never had** and **re-rated the flagship**.
**Purpose:** decide *which study formats* to add to the timeline game, *why*, and *how* to build
them in the no-build vanilla stack. This closes the gap recorded in `CONTENT_PIPELINE.md:543`
("a post-story sort or quiz. Not built") and feeds the mastery system in `AGENTS.md` /
`doc/GAMIFICATION_BRIEF.md`.

Companion docs:
- `doc/GAMIFICATION_BRIEF.md` — the ratified motivational layer (D1–D8, A1–A6, age-band gating).
- `doc/LIBRARY_RESEARCH.md` — library/stack-fit research (includes the ts-fsrs pick).
- `course-studio/mcg_research_synthesis.md` — the project's own evidence corpus (§9, §10, §11, §12).
- `scripts/validate-content.mjs` + `tools/content-pipeline/` — the content gate to extend.

---

## 1. TL;DR

1. **Add two instruction surfaces first — the catalog had none.** **Modelled timeline** (a narrated
   worked example) and **completion timeline** (partially-filled ordering). All ten v1 modes were
   testing surfaces; the project's own corpus has a whole research front (worked examples, g=0.48;
   fading d=0.46–0.82) with no surface. Teaching before testing.
2. **Then the two auto-authorable practice modes:** **exact-year / cloze ("Pinpoint")** and
   **flashcards**. Both fully auto-generatable from existing deck fields — but see the citation
   correction in §3.
3. **Add structured self-explanation and replace free recall with it.** Elaborative interrogation
   works from ~age 8 (and has been demonstrated with preschoolers), so it is not the 12+ mode v1
   assumed. Free recall stays deferred and is superseded.
4. **Add MCQ and matching conditionally:** only with immediate elaborated feedback and
   well-constructed items (priming, accessibility, young learners — never sole mastery evidence).
5. **Elevate cause/effect and simultaneity out of the defer list.** Annenberg's timeline pedagogy
   names "identifying cause and effect relationships" and "how historic events, eras and topics
   overlap in time" as the *purposes* of timeline teaching — these are the documented point of the
   artefact, not extras. A competitor already ships them (§3.3).
6. **Keep timeline placement as the flagship, but stop calling it the best-evidenced.** Ordering is
   the gateway skill and the market's table stake; it is *not* the most durable outcome, and the
   flagship's evidence now cuts both ways (Timewise supportive; Prangsma's decay warning).
7. **Do not build an ordering-cloze ("insert the missing event").** Considered and rejected: the
   generation effect *impairs* memory for order (Nairne, Riegler & Serra 1991; Greene, Thapar &
   Westerman 1998). Generating the thing you are testing degrades the thing being tested.
8. **Every mode is mode-blind to the scheduler:** `render(event, mode) → signals → rate(signals) →
   Rating → scheduler.next()`. Persist the rating, not just a boolean.
9. **Every mode needs a single-pointer, non-drag path** — the shipped timeline placement included
   (WCAG 2.2 SC 2.5.7, AA).
10. **Don't ship a flat mode grid.** One guided default ("Review") + progressive disclosure.

---

## 2. Evidence base

### 2.1 From the project's own corpus (authoritative here)

| Finding | Source | Consequence for modes |
|---|---|---|
| Self-explanation formats with **their own cell k**: fill-in-the-blank **g=0.90 (k=2)**, predirected **g=0.70 (k=8)**, interrogative **g=0.56 (k=36)**, imperative g=0.40 (k=12), multiple-choice **g=0.24 (k=2)** | corpus §9 (Bisra et al. 2018) | Cloze maps exactly to `year` — **but justify it on the generation effect and the well-powered cells, not on 0.90**, which rests on two studies (corrected v2; see §3, §14.3 #2) |
| Anti-pattern #1: *"MCQ self-explanation prompts when fill-in-the-blank is just as easy to write"* | corpus §9 | Prefer cloze over MCQ for year recall |
| Spacing g=0.28 (weaker in humanities); interleaving **hurts verbal/expository (g=−0.39)**; **5–11 never interleave** | corpus §10–§11 | Block practice by era/deck for young; no mode-mixing for 5–11 |
| Elaborated feedback on **every** attempt; generic "Correct!" is an anti-pattern | corpus §8 | Every mode reveals the year + a one-sentence why |
| MCQ item quality: **3 options optimal**; plausible distractors; avoid negative stems / "all of the above" | corpus §12 (Rodriguez 2005; Haladyna 2002) | Auto-generation must obey these |
| Constructive alignment: the assessment format must match the outcome verb | corpus §12 (Biggs) | "Explain why" ≠ an ordering task; don't conflate |

**One correction that must not be lost:** corpus §9's **g=0.24 is MCQ as a *self-explanation
prompt format*** — it is **not** evidence that MCQ-as-testing is weak. MCQ-as-retrieval has a real
positive testing effect. Do not let the g=0.24 line be cited as "MCQ is bad."

### 2.2 External evidence (chronology + retrieval)

| Finding | Source | Consequence |
|---|---|---|
| Retrieval practice ≫ restudy, **g≈0.50**; feedback moderates the effect substantially (reported **g=0.73 with vs 0.39 without** — ⚠️ these values are **reported-not-verified**) | Rowland, C. A. (2014), *Psychological Bulletin* 140(6) 1432–1463, DOI 10.1037/a0037559. ⚠️ **Corrected v2:** the link here previously pointed to `10.1007/s10648-021-09595-9`, which resolves to **Agarwal et al. (2021)**, *Retrieval Practice Consistently Benefits Student Learning* — a different paper | Every mode is a retrieval event + feedback |
| Generation effect **d≈0.40** (largest for cued recall) | [Bertsch et al. 2007](https://link.springer.com/article/10.3758/BF03193441) | Cloze/typed recall > recognition |
| Timeline construction gave **short-term** time-learning gains; advantage **disappeared at retention** | [Prangsma et al. 2008](https://doi.org/10.1016/j.learninstruc.2007.04.004) | Don't overclaim durable learning from ordering alone |
| Children can **order** dates before they can **manipulate** them; teaching method (not age) drives it | [Hodkinson](https://dialnet.unirioja.es/descarga/articulo/6079824.pdf) | Relative → absolute sequence |
| MCQ **negative suggestion effect**: lure answers 5%→12%; children without feedback *hurt* on hard items (+23% lure errors); **with feedback correction 2%→57%** | [Roediger & Marsh 2005](http://psychnet.wustl.edu/memory/wp-content/uploads/2018/04/Roediger-Marsh-2005_JEPLMC.pdf), [Marsh et al. 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3700528/) | MCQ requires immediate feedback or it harms |
| **Don't drop items after one success:** dropped-after-0/1/2 correct → later recall 19%/62%/88% | [Kornell & Bjork 2008](https://sites.lifesci.ucla.edu/psych-bjorklab/wp-content/uploads/sites/13/2016/07/Kornell_Bjork_2008_Memory.pdf) | No "I know this" dismissal in any mode |
| Working-memory focus ≈ **4 chunks** | [Cowan 2001](https://europepmc.org/article/MED/11515286) | Cap matching sets at 4 premises |

---

## 3. Mode catalog

Ratings are **recommendation strength /100** for *this game* (evidence + fit + cost), not library
quality. Status: ✅ shipped · 🔜 do next · ⚖️ conditional · ⏸ defer.

**v2 ratings (research-aligned), superseding v1's.** v1 scored *recommendation strength for this
game* (evidence + fit + **cost + market table-stake**). v2 scores **research alignment**:
**E** evidence strength /25 · **A** constructive alignment /20 · **D** durability at a delayed
retention test /20 · **C** cost & auto-generability /15 · **X** accessibility /10 · **G** age-gate
safety /10. The two rubrics deliberately differ — that is why the shipped flagship scores lower here
than its v1 98. v1's table is preserved in §14.

Status: ✅ shipped · 🔜 do next · ⚖️ conditional · ⏸ defer · ❌ superseded/dropped.

| Mode | v2 | v1 | Status | E | A | D | C | X | G | Why |
|---|---|---|---|---|---|---|---|---|---|---|
| **Modelled timeline** *(new)* | **87** | — | 🔜 **1st** | 22 | 18 | 18 | 11 | 9 | 9 | Worked example g=0.48, effective in ill-defined/humanities domains (Rourke & Sweller 2009; Kyun & Kalyuga 2013). **The only instruction surface in the catalog** |
| **Completion timeline** *(new)* | **84** | — | 🔜 | 21 | 17 | 17 | 13 | 7 | 9 | van Merriënboer's **completion strategy** (1990) + Renkl's fading; the standard example→problem bridge. Auto from deck order |
| **Structured self-explanation** *(new)* | **82** | — | 🔜 | 20 | 18 | 18 | 9 | 9 | 8 | Self-explanation g=0.55; *conceptualize* g=0.87; elaborative interrogation works from ~8 (Symons 1993; Woloshyn 1992). **Replaces free recall** |
| **Flashcard (tap-to-reveal)** | **81** | 90 | 🔜 | 21 | 12 | 15 | 15 | 9 | 9 | Testing + spacing; cheapest, most accessible. A=12: self-graded rating is a weak signal |
| **Exact-year / cloze "Pinpoint"** | **78** | 95 | 🔜 | 19 | 14 | 15 | 14 | 8 | 8 | Still right — **citation corrected**: v1 rested it on fill-in-blank g=0.90, which is a **k=2 cell**. Defensible support is the generation effect (item, not order) + interrogative g=0.56 (k=36) / predirected g=0.70 (k=8) |
| **Timeline placement** (existing) | **77** | 98 | ✅ | 20 | 13 | 14 | 15 | 6 | 9 | Gateway skill + table stake (Timeline, 2010). A=13: ordering ≠ understanding. X=6: WCAG 2.5.7 non-drag path still unbuilt |
| **Transfer / judgment** *(new)* | **77** | — | ⏸ | 16 | 18 | 17 | 11 | 8 | 7 | Reisman 2012 (*Reading Like a Historian*) — document-based inquiry works via cognitive apprenticeship, i.e. **via modelling**, so it pairs with the modelled timeline |
| **Cause/effect ("why")** | **76** | 80\* | ⚖️ **elevated** | 18 | 19 | 18 | 6 | 8 | 7 | Highest **alignment** in the batch. Annenberg names cause-and-effect as a core *purpose* of timeline teaching. Only C=6 (human `why`) keeps it mid |
| **Confidence calibration** *(new)* | **76** | — | ⏸ 12+ | 17 | 16 | 15 | 13 | 9 | 6 | Calibration improves only with answer disclosure (§2.1); trainable via app (Gruetzemacher et al. 2024) |
| **Era / century sorting** | **70** | 82 | ⚖️ | 16 | 13 | 13 | 12 | 7 | 9 | Unchanged role: mid difficulty between ordering and absolute dating |
| **Multiple choice** | **70** | 78 | ⚖️ | 16 | 13 | 13 | 13 | 9 | 6 | Real testing effect; negative-suggestion risk means immediate feedback is mandatory, not optional |
| **Simultaneity** *(new)* | **70** | — | ⚖️ **elevated** | 14 | 15 | 14 | 10 | 9 | 8 | "how events, eras and topics **overlap in time**" is a documented timeline purpose; a competitor ships it (§3.3) |
| **Matching (event↔who/where)** | **64** | 76 | ⚖️ | 11 | 12 | 11 | 13 | 8 | 9 | Recognition-level, thinnest evidence in the batch. A competitor ships it as "Who Did" (§3.3) |
| **Free recall ("brain dump")** | **63** | 55 | ❌ **superseded** | 9 | 12 | 14 | 15 | 9 | 4 | G=4 kills it below 12 (~8% initial success). Superseded by structured self-explanation, which dominates open recall |
| **Timeline repair** *(new)* | **60** | — | ⏸ | 10 | 14 | 14 | 8 | 8 | 6 | Error detection is useful, but incorrect examples **without explicit correction confuse novices** (§4, corpus §14) |
| **Map placement** | **55** | 74 | ⏸ | 13 | 12 | 11 | 8 | 5 | 6 | Backfires at 11–14; least accessible; `lat`/`lng` coverage unaudited. **Highest mass appeal of any mechanic** (§3.3) — a marketing asset, not a learning one |
| **Timed / arcade** | **41** | 60 | ⏸ | 5 | 6 | 6 | 10 | 9 | 5 | No learning mechanism. A competitor ships private duels — age-gate, never public leaderboards (§4.6) |
| ~~Insert-the-missing-event~~ | — | — | ❌ **dropped** | — | — | — | — | — | — | Considered v2, rejected: the **generation effect impairs memory for order** (Nairne, Riegler & Serra 1991; Greene, Thapar & Westerman 1998). Generates the very thing it tests |

\* v1 rated cause/effect for its own outcome, not as a substitute for recall.

\* Rated for its own outcome, not as a substitute for recall.

### 3.1 Specs for the two "do next" modes

**Exact-year / cloze ("Pinpoint")**
- Prompt renders the event (`title` + `fact`/`summary` with the year blanked), learner types a year.
- Accepts `476`, `AD 476`, `476 CE`, `c. 476`, `476–480`, `44 BC`. Tolerant marking (§9.2).
- Reveal on submit: the year + the `why`/`fact` elaboration (never bare "correct").
- Optional **tap fallback** for pre-typing ages: multiple-choice year options (generated by §9.1).

**Flashcard (tap-to-reveal)**
- Front: `emoji` + `title` (and optionally a prompt). Back: `year` + `summary`/`fact`.
- Self-grade: "Got it / Missed" (young) or a 3–4 point scale (older). Maps to a Rating (§5.2).
- A `<button>` labelled "Show answer" + a pre-existing answer region — never a `<div onclick>` (§10.2).

---

### 3.2 Specs for the new v2 modes

**Modelled timeline (instruction surface).**
- A pre-solved ordering, narrated: each placement explained aloud — *why* this event sits here, what
  cue distinguishes it from its neighbour. A worked example with a **think-aloud**, not a demo.
- Deck-level, one per deck (plus one per era boundary in large decks). Reuses the existing
  narration pipeline. **Writes no review row** — it is consumed, not measured (see §4.3 as amended).
- **Fade it:** show it once at deck entry; thereafter offer it only as an on-demand "show me how".
  Expertise reversal is the governing risk (Kalyuga et al. 2003) — an expert forced through a
  narrated walkthrough is harmed, not helped.
- Sequencing: modelled timeline → completion timeline → independent placement. That is the
  example→completion→problem order the fading literature prescribes.

**Completion timeline.**
- The shipped placement, pre-populated with *k* of *n* events correctly placed; the learner places
  the remainder. Forward fade: remove later steps first (Renkl et al.; Sweller's guidance-fading
  design).
- `k` steps down across sessions (e.g. 4 → 3 → 2 → 1 → 0) driven by the same review log. Log `mode:
  "completion"` and the scaffold level so fade can be calibrated later.
- Obey the §10.1 non-drag requirement — completing a placement is still a placement.

**Structured self-explanation.**
- Prompt: *"This event matters because ___"* / *"It comes before X because ___"* — a **structured**
  probe, never "explain in your own words" (open-ended prompts fail; principle-based ones work:
  Wittwer & Renkl 2010, d=0.40).
- **Reflection, not assessment** — no right/wrong, no rating. Model one strong answer at first
  occurrence (corpus §9 anti-pattern: "no modeling").
- **Age: from ~8, not 12+.** Elaborative interrogation is demonstrated with elementary and preschool
  children (Symons et al. 1993; Woloshyn et al. 1992). v1 deferred all "why" work to 12+; that was
  too conservative.
- Cap at 1–2 prompts per session (prompt-fatigue ceiling, corpus §9).

**Simultaneity.**
- *"What else was happening in ___?"* — pick the era, show 3–5 contemporaneous events, learner
  matches or selects. Builds the overlap-in-time sense that timelime teaching exists to produce.
- Cheap: derived entirely from `year`/`era` already in the deck.

**Transfer / judgment.**
- *"Which of these could NOT have happened by 1500?"* — scenario judgment over deck content.
- Pairs with the modelled timeline: Reisman (2012) found document-based inquiry worked **via
  cognitive apprenticeship**, so the modelling surface is the mechanism that makes this one land.
- 12+ only; needs the §5.2 rating mapping for a judgment (not recall) signal.

**Confidence calibration.**
- Predict-then-disclose: learner commits a confidence rating **before** the answer is revealed
  (locked, not adjustable — that is the mechanism; see corpus §13 / corrections §14).
- 12+; surfaces on a separate calibration track, not the mastery estimate.

### 3.3 Competitive read (verified 2026-10-01)

**TimeToTime.app** — the closest comparable. Deep Tuition Ltd; iOS/iPad/Mac/visionOS + Android + web;
v6.5.2 (updated within the week); 68.6 MB; age 4+; EN/FR/IT/ES; **$2.99/mo or $24.99/yr**, free tier.

| Their shipped feature | Our position | Read |
|---|---|---|
| **Connections** — "link events by cause, influence, or theme… each connection creates additional retrieval paths" | v1 **deferred** cause/effect | **They ship what we defer.** Validates the mode AND means we arrive behind |
| **Variety of test-card types** — exact date + before/after ordering | Pinpoint 🔜; placement ✅ | Direct overlap with our top two |
| **Spaced-repetition scheduling** ("guided repetitions") | Planned (ts-fsrs), not built | They are live; we are not |
| **"Learn gently" exposure-first onboarding** | Not specified in v1 | Closest market analogue to §3.2 #11 — but it is **passive exposure, not a narrated worked example**. #11 stays a real differentiator *if it explains the reasoning* |
| Shared decks; **duels** (private, timed, over a shared deck) | Pluggable decks; no social layer | Market-validated demand for user authoring |
| **Major System mnemonics** | Not in catalog | Worth considering. Evidence is thinner than spacing/retrieval — the **method of loci** has a systematic review + meta-analysis; the Major System does not |
| **Accessibility: "developer has not yet indicated which accessibility features this app supports"** | WCAG 2.2 AA work planned (§6) | **Genuine differentiator.** Ship it and say so |
| **Adoption: App Store shows no ratings overview — "hasn't received enough ratings or reviews"** | — | The closest comparable has **not** proven demand |

**Other comparables.** **PlayMemorize** ships three history games — *Ordering*, *When Did*
(year-pinning), *Who Did* (attribution) — i.e. our flagship, our Pinpoint and our Matching, already
shipped. **Historo AI** (AI lessons + quiz), **Histolumo** (audio narrative history), **Histography**,
**Chronas** (interactive historical map, 50M+ data points, **Patreon: 366 members / $79 per month**).

**The strategic finding.** The *history-timeline-learning* category has **no proven mass-market
winner**: the closest comparable is too new to be rated, and the most ambitious map project is funded
at $79/month. The proven mass-appeal mechanics sit **outside** this category — geography (GeoGuessr,
Seterra) and flashcards (Quizlet, Anki). Treat "learn history from a timeline" as an **unproven
category with proven component mechanics**, not as a validated market.

**Market-size caution.** Published 2025 estimates for the educational-games market disagree by more
than 2× — $8.04B (WiseGuyReports) vs $15.88B (TechSci) vs $17.72B for K-12 alone (Dataintelo). All
are vendor-produced and mutually inconsistent; **do not cite any of them**.

**Company-reported vs third-party.** GeoGuessr's own site claims "100 million players"; third-party
reporting gives 10M (2019) → **65M**. Quizlet's "60M users" is a company claim. **AnkiDroid is
≈23.9M downloads** (chrome-stats, 2026-09-26) — use that, not the older "10M+".

### 3.4 Open-source reference implementations (added 2026-10-02)

Full repo + dataset catalogue in `MARKET_COMPARISON.md` §9. The three worth opening for
*this* doc's build:

| Repo | License | Why it matters here |
|---|---|---|
| [misty-step/chrondle](https://github.com/misty-step/chrondle) | **MIT** | Ships an exact-year **range** mode + which-came-first + ordering in one app. Read its era-scaled scoring (`scoring.ts`) and hint ladder for §9.2 |
| [kyletscheer/historicle](https://github.com/kyletscheer/historicle) | **GPL-3.0** ⚠️ | The **only no-build vanilla** exact-year implementation (`index.html`+`script.js`+`dates.js`, ~300 events). Read the guess→feedback loop; do **not** copy GPL code |
| [kimfrithiof/moments](https://github.com/kimfrithiof/moments) | Code **MIT** | The "timeline shuttle" drag → exact year, with **era-scaled tolerance** (a per-card half-life) — the idea to steal for §9.2's tolerance model |

**Seed datasets** (best fit for exact-year decks): [slashyear.com/data](https://slashyear.com/data)
(CC BY-SA 4.0; 121,329 entries with frozen Wikipedia revision IDs) and
[Wikidata](https://www.wikidata.org) (facts CC0). Full list in `MARKET_COMPARISON.md` §9.3.

---

## 4. What NOT to do

1. **No flat mode grid.** Four equally-weighted tiles on first run risks choice overload
   ([NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)).
2. **Don't let the easiest mode become the default by salience.** Quizlet's *Match* was the most-used
   mode yet contributed ~nothing to vocabulary growth vs recall/mixed modes ([Platzer](https://e-flt.nus.edu.sg/wp-content/uploads/docroot/v17n22020/platzer.pdf)).
3. **No *assessment* mode that doesn't write the review log.** A fun mode with separate scoring
   spends design budget without improving the learner model. **Amended v2:** this rule as written
   in v1 excluded *instruction* surfaces too, which is how the catalog ended up ten ways to test and
   no way to teach. Instruction modes (modelled timeline) are exempt by design — they consume the
   log, they don't write it.
4. **No MCQ without immediate elaborated feedback** (child harm on hard items, above).
5. **No "I know this" card-dropping** (Kornell & Bjork).
6. **No public leaderboards / streak-loss shame for 5–11** (`GAMIFICATION_BRIEF` D5/D6 + IDC 2026
   exit-dark-pattern findings).
7. **No hard age-gating of mechanics** — gate *presentation/copy*, never capability (brief §5).

---

## 5. Architecture: one mode-blind scheduler

### 5.1 The Anki decomposition (recommended)

```
Event (deck fields)  ──►  Mode = pure fn render(event, mode) → {prompt, responseKind, signals}
                     ──►  rate(signals) → Rating  (Again | Hard | Good | Easy)
                     ──►  scheduler.next(card, now, rating)
```

- **Modes never touch the scheduler.** The scheduler is mode-blind — exactly Anki's model, where
  presentational variety (note types/templates) is invisible to the algorithm.
- **One FSRS memory state per `eventId`** (not per mode). The learning objective is knowledge *of
  the event*; 6 modes × every event would multiply the due queue 6×. Log `mode` so per-mode
  calibration can be added later without a schema break (Anki's own data shows different card types
  calibrate better with separate presets — flag this trade-off).
- **Queue composition:** each due event is rendered in **one** mode per session (default chosen by
  content availability: flashcard always; MCQ if ≥3 sibling events; map only if coords exist).

### 5.2 Rating normalization (per mode)

Community rubric: **Easy** = correct, no hesitation · **Good** = correct, little hesitation ·
**Hard** = partially correct / much hesitation · **Again** = incorrect. FSRS itself ignores response
time; auto-rating from time alone is explicitly warned against.

```
if !correct                       → Again
else if partial || slow || guessed → Hard
else if fast && confident          → Easy
else                               → Good   // conservative default
```

| Mode | Signal | Mapping sketch |
|---|---|---|
| Flashcard | self-report | direct (self-grade → Rating) |
| Cloze | objective correct + latency | incorrect→Again; slow→Hard; fast+confident→Easy; else Good |
| MCQ | objective + "guessed" flag | incorrect→Again; correct+guessed→Hard; **never auto-Easy without confidence** |
| Matching | objective per-pair | any miss→Again (or Hard if partial); clean→Good; fast→Easy |
| Era sort | objective order | correct→Good; perfect+fast→Easy; inversion→Again/Hard |
| Map | distance band | within tolerance→Good; precise→Easy; outside→Again |

> **Flag:** there is **no research** mapping heterogeneous exercise outcomes to FSRS ratings. This
> is a synthesis of the community rubric + auto-rating warnings — a starting heuristic. **Log the
> raw signals** so it can be re-derived.

### 5.3 Review-log schema (additive evolution)

Current (`GAMIFICATION_BRIEF.md:256`): `{ ts, deck, eventId, outcome: "firstTry"|"slip", mode }`.

```js
{
  v: 1,                 // per-entry schema version
  ts: 1699999999999,    // epoch ms
  deck, eventId,
  mode: "timeline"|"flash"|"cloze"|"mcq"|"match"|"era"|"map",
  outcome: "firstTry"|"slip",   // kept for backward-compat + streak predicates
  rating: 1|2|3|4,              // ★ the value fed to ts-fsrs (Rating), persisted
  latencyMs: 4210,              // optional; NOT a primary scheduler input
  confidence: 1|2|3             // optional; self-report where available
}
```

Rules: append-only; add optional fields freely (tolerant reader); **bump `v` + upcast on read** only
when semantics change. **Stop hard-pruning at ~2000 rows** — pruning degrades FSRS parameter
optimization *and* breaks streak/achievement predicates that scan history; prefer a derived
rollup for display and archive rather than drop. `ts-fsrs` 5.4.2 (FSRS-6, MIT, UMD) is the target;
SM-2 remains acceptable behind `rate(outcome) → nextDue`.

---

## 6. Accessibility (hard requirements)

### 6.1 The drag problem — WCAG 2.2 SC 2.5.7 (AA)

> *All functionality that uses a dragging movement can be achieved by a single pointer without
> dragging, unless dragging is essential.* — [W3C](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)

**Keyboard equivalence is not sufficient** — the no-drag path must itself be clickable/tappable
(switch/head-pointer/eye-gaze users). This applies to the **shipped timeline placement** too.

Endorsed patterns (pick per mode):
- **Tap-to-select → tap-to-place** (two clicks) — era buckets, map, matching. Every target is a real
  `<button>`; selected gets `aria-pressed="true"`.
- **Move Up / Move Down buttons** per item — ordering. Keep focus on the moved control so repeated
  presses are cheap (the APG rearrangeable-listbox discipline).
- **"Move to position" `<select>`** — long lists; native keyboard + SR support.

`aria-grabbed`/`aria-dropeffect` are **deprecated with no replacement** — don't use them; expose
the equivalent action + announce moves in a `role="status"` region. Precedents:
[APG listbox (rearrangeable)](https://www.w3.org/WAI/ARIA/apg/example-index/listbox/listbox-rearrangeable.html),
[GOV.UK reorderable_list](https://components.publishing.service.gov.uk/component-guide/reorderable_list)
(buttons-first; drag disabled on small viewports; no-JS index fallback).

### 6.2 Accessibility ranking & per-mode notes

**Most → least accessible:** MCQ/flashcard tap ▸ cloze typed (with tolerant matching) ▸ matching
(tap-pair) ▸ era-sort (tap-select-then-place) ≫ drag-only variants; map lowest.

- **Flashcard:** real `<button>` "Show answer" + `aria-expanded`/`aria-controls`; reveal announced
  via a pre-existing `role="status"`; un-hide content synchronously, motion is decoration only;
  reduced-motion read at call time (project convention).
- **Cloze:** tolerate formats — a formatting slip must not score as wrong knowledge (COGA). Offer
  voice input; normalize whitespace/separators.
- **MCQ:** native `<fieldset>`+`<legend>` + `input[type=radio]` (free arrow-key nav & grouping);
  feedback in a pre-existing `aria-live="polite"` region; disable options after answering; move
  focus to the single *Next* action.
- **Targets:** ≥24×24 CSS px (SC 2.5.8). **Reduced motion:** every mode needs a story (project hard
  floor).

---

## 7. Session & UX model

### 7.1 "Today's Voyage" (recommended flow)

```
Today screen:  Due today: 9 (≈7 min)   [Start review]   [Choose how to practice ▸]   [Pause week]
Session:       blocked by era, reviews-first, 1 mode, immediate elaborated feedback
Close:         process progress → mastery words → optional next
```

- **One guided default + progressive disclosure.** The primary CTA is scheduler-driven
  "Review". The mode chooser is a secondary link with job labels, not jargon:
  *Matching (gentle) · Flashcards (recall) · MCQ (quick check) · Fill-the-gap (hard, sticks best)*.
- **One mode per session** by default; switching only between sessions or via an explicit pause.
- **No mid-item mode picker.**

### 7.2 Session length & volume (by age)

| Band | Default session | Items (guide) |
|---|---|---|
| 5–7 | 8–12 min | ~6–10 |
| 8–11 | 12–18 min | ~8–12 |
| 12–16 | 20–30 min | ~12–18 |
| 17+ | 30–45 min | 15–20 |

Reviews-first; cap new; **pause new when backlogged**. Adopt Anki's throttle model (new-card limit
is the workload throttle; review limit stays high). Auto step down difficulty if running success
drops below ~50% (desirable-difficulty ceiling).

### 7.3 Feedback

Immediate verification + **one-sentence elaboration** on every attempt (year + why-it-matters + a
cue). End-of-session recap re-shows misses once (a spaced second exposure). Tone informational, not
controlling: *"Not quite — [year]. You'll see this again soon."* Avoid moralized loss language.
Offer a "Why?" expander for 12+.

### 7.4 Mastery display

- 3–4 levels max (Khan: Attempted → Familiar → Proficient → Mastered) with an explicit
  **"Not enough data yet"** state.
- **Separate effort from mastery** (sessions/days practiced vs recall estimate).
- Streaks: secondary, repairable, **pausable** ("Pause week — no guilt"). Never monetize pause.
- Process-goal progress ("8/12 due reviewed") alongside outcome — goal monitoring d≈0.40.

---

## 8. Age-band gating (presentation only)

| Surface | 5–7 | 8–11 | 12–16 | 17+ |
|---|---|---|---|---|
| Default mode | Matching/tap-only | Matching → MCQ | MCQ → Cloze/Flash | full choice |
| Practice mix | Blocked (era/week) | Blocked | Blocked → optional mixed | mixed OK |
| Feedback depth | 1 idea, read-aloud | 1 sentence + cue | + "Why?" expander | full + strategy |
| Mastery display | words/stars, no % | simple | full | full + stats |
| Competition | none | none/public-off | opt-in, private | opt-in |
| Mode prompts | max 1/session | max 1/session | ≤2/session | as desired |

Never hide mechanics behind age unless the profile set `ageBand` (brief §5). Unset behaves as
adult/casual.

---

## 9. Auto-item generation (deterministic, in-browser, no LLM)

Hand-roll `study-items.js` (classic script, seeded PRNG, ~150 lines incl. gates). **No permissive
library exists that does backend-free sibling-sampling distractor generation from tabular data** —
this is a build, not a vendor decision, so it has no `THIRD_PARTY_LICENSES` impact. Seed with the
existing `mulberry32` + `hashString` (`timeline.js`), keyed on `(deckId, eventId, type)`.

### 9.1 MCQ

- **3 options** (1 key + 2 distractors) — [Rodriguez 2005](https://eric.ed.gov/?id=EJ718250).
- **Numeric stem ("In which year did X happen?"):** distractors = other events' years, filtered to
  same era/category where possible, **outside an adjacency band** (`ADJ ≥ 10 y` default; wider for
  `circa`), deduplicated, never the key, never inside `[year, yearEnd]`.
- **Title stem ("Which event happened in Y?"):** distractors = sibling titles, same era/category,
  length-parity (±40%).
- Obey the item-writing rules: single key; pairwise-distinct options; homogeneous; consistent
  numeric format (+ logical order or documented seeded shuffle of key position); no negative stems;
  no "all/none of the above"; no stem↔key word-repeat cue.

### 9.2 Cloze / exact-year tolerance

Tolerance models come from e-learning standards: [Moodle nominal](https://docs.moodle.org/dev/Question_Engine_2:Numerical_tolerances),
[Canvas exact+margin / range](https://canvas.instructure.com/doc/api/quiz%5Fquestions.html),
[STACK absolute/relative](https://docs.stack-assessment.org/en/Authoring/Answer_Tests/Numerical/),
[QTI tolerance-mode](https://www.imsglobal.org/spec/qti/v3p0/info/).

**Project rule (recommendation — no source prescribes circa-year tolerance):**
- **Exact events:** tolerance **0** (compare normalized integers). Relative tolerance is
  indefensible for dates (STACK's 5% default would allow ±24 y on 476).
- **`circa` events:** nominal **±5 years** (kept below the MCQ adjacency band so the two modes can't
  contradict).
- **Ranges:** any value in `[year, yearEnd]` is correct.

**⚠️ BCE convention — use the repo's, not astronomical numbering.** The game stores `year` as a
plain signed integer where **negative magnitude = the BCE year** (`-146` = 146 BCE; `timeline.js:838`
renders `Math.abs(year)` + " BCE"). So normalizing `"146 BCE"` must give **`-146`**, *not* `-145`
(astronomical year numbering has a year 0 and would shift every BCE value by one). A ~40-line
parser (strip era tokens, `-digits` for BCE, accept ranges) is the implementation; **never** use
`Date.parse` for BCE math.

### 9.3 Matching

Precompute `count(who)`, `count(where)`, `count(era)` per deck; drop any pair whose response value
is not **unique in-deck** (never keep a 2-keys-1-response item). Normalize + dedupe de-facto
duplicates. Cap at **4 premises + 1–2 extra responses** (Cowan's ~4 chunks; "more responses than
premises" kills process-of-elimination). Paginate larger decks into multiple 4-sets.

### 9.4 Era / century sorting

Bucket by numeric `year`; **`era` is a display label, never a sort key**. Use an explicit BCE-aware
`centuryLabel()` helper (write + test `-1…-100 → 1st c. BCE`). Reject `year === 0`.

### 9.5 Quality gates (reject before the learner sees it)

| # | Rule | Basis |
|---|---|---|
| V1 | Exactly one correct answer; distractors ≠ key; none inside `[year,yearEnd]` or cloze tolerance | Haladyna #19; NBME |
| V2 | Options pairwise unique after normalization | Haladyna #22 |
| V3 | Numeric distractors outside adjacency band, deduped | plausibility↔confusability trade-off |
| V4 | ≥1 distractor shares era/category (homogeneity) | Haladyna #23; NBME |
| V5 | Consistent numeric format + logical order (or seeded shuffle) | Haladyna #21 |
| V6 | No negative stems; no "all/none of the above" | Haladyna #17/#25/#26/#27 |
| V7 | No answer-leakage cues (stem↔key word-repeat, absolute terms, longest-key, convergence) | Haladyna #28; [Frontiers 2026](https://www.frontiersin.org/journals/computer-science/articles/10.3389/fcomp.2026.1831250/full) |
| V8 | Title options length-parity + same grammatical shape | Haladyna #24 |
| V9 | Cloze: exactly one blank; honest `c.`/BCE/range rendering; normalized tolerance marking | §9.2 models |
| V10 | Matching: unique responses; ≤4 premises + 1–2 extras; homogeneous; one screen | Cowan; item-writing guides |
| V11 | Reading load: stem ≤ ~25 words | Haladyna #8/#13/#16 |
| V12 | Topicality: every option from the same deck | KNIGHT / [arXiv](https://www.arxiv.org/pdf/2602.20135) |
| V13 | Determinism: same `(deckId, eventId, type, seed)` → same item; log gate outcomes | architecture precedent |

**Mirror V1–V13 in the Node content gate** (`scripts/validate-content.mjs` / `tools/content-pipeline`)
so auto-generated items are checked by `npm run validate`.

---

## 10. Vanilla-JS implementation patterns

### 10.1 One state object + `render(state)` + one delegated listener

```js
var Study = (function () {
  "use strict";
  var state = { screen: "question", qIndex: 0, picked: null, done: 0, total: 10 };
  var root = document.getElementById("studyRoot");
  var status = document.getElementById("studyStatus");        // one role="status" OUTSIDE root

  function render() {                                          // pure fn of state
    if (state.screen === "question") root.innerHTML = questionView(state);
    else if (state.screen === "feedback") root.innerHTML = feedbackView(state);
    else root.innerHTML = doneView(state);
  }
  root.addEventListener("click", function (e) {                // survives re-renders
    var b = e.target.closest("[data-action]"); if (!b) return;
    handle(b.getAttribute("data-action"), b);
  });
  return { start: render };
}());
```

Rules: transitions only inside `handle`; feedback text via `textContent` (never `innerHTML` from
deck strings); keep the single `role="status"` region **outside** the re-rendered root so
announcements aren't destroyed; move focus to the single next action after each step.

### 10.2 Per-mode patterns (sketches)

- **Flashcard** — `<button aria-expanded aria-controls>` + hidden answer `<div>`; un-hide
  synchronously; motion decorative.
- **Cloze** — `<label>` + `<input inputmode="numeric">`; normalize → parse → tolerant compare;
  echo the normalized reading back ("We read that as 146 BCE") so era mistakes are visible.
- **MCQ** — `<fieldset><legend>` + 3 `<input type=radio>`; submit → disable → feedback in live
  region → focus *Next*.
- **Matching** — two `<ul>` of `<button aria-pressed>`; select-left → select-right; correct pairs
  lock (`disabled`); wrong pairs don't punish re-navigation; "2 of 4" progress via `role="status"`.
- **Era sort** — tap-to-select card, then tap a bucket's "Place here" button; or Move Up/Down
  buttons; announce new position.
- **Map** — tap-to-place **plus** a redundant "choose the location" list; markers alone are not
  keyboard-operable; grade by distance band, not pixels.
- **Progress** — native `<progress max value>` + `<label for>`; announce milestones only
  (completion, streak), never every increment; avoid score-anxiety patterns.

### 10.3 No vendoring required

Nothing in this doc needs a new third-party library. `ts-fsrs` (already the ratified target) is the
only candidate dependency, and it's already covered in `doc/LIBRARY_RESEARCH.md`. MCQ/cloze/matching
generation and all UI are hand-rolled.

---

## 11. Build order

**v2 order — instruction before assessment.** v1 put two *testing* modes first and had no
instruction surface at all; the learner was to be tested on content the game never taught.

1. **Mode-blind plumbing first** (unchanged, still the prerequisite): review-log schema (`rating`,
   `latencyMs`, `confidence`, `v`), the `rate(signals) → Rating` normalizer, `ts-fsrs` behind it.
2. **Modelled timeline** — *new, and first.* The only instruction surface; it makes every later mode
   land on a prepared learner, and it is the cheapest high-leverage build (§3.2). Ship it inside the
   default session flow, **not** as a mode tile users must discover — instruction does not sell
   itself in a mode grid.
3. **Completion timeline** — *new.* The fade bridge from #2 to independent placement.
4. **Cloze / exact-year ("Pinpoint")** — unchanged position, **corrected citation** (§3).
5. **Flashcards** — unchanged.
6. **Structured self-explanation** — *new.* Ship it with free recall **removed**, not alongside.
7. **WCAG 2.5.7 non-drag path** for the existing placement (unchanged, and it now also gates
   completion-timeline, simultaneity and any tap-to-place mode).
8. **MCQ** (V1–V13 gates + mandatory immediate feedback) and **Matching** (conditional) — unchanged.
9. **Cause/effect then Simultaneity** — *elevated out of the defer list*: both are documented
   timeline purposes and a competitor already ships the first (§3.3).
10. Then: transfer/judgment, confidence calibration (12+), era-sort, timeline repair, map placement,
    timed/arcade. **Free recall: remove from the plan** (superseded). **Insert-the-missing-event: do
    not build** (generation impairs order memory).

Each step: extend `npm run validate` with the new gates; re-verify `docs/LIBRARY_RESEARCH.md`
entries if any library is touched; add the modes to the `AGENTS.md` file map.

---

## 12. Open questions & speculative constants (calibrate by playtest)

- **ADJ=10 y**, **circa ±5 y**, **length-ratio ±40%**, **4+2 matching cap**, "never synthesize
  years", "era is display-only" — all sourced-analogous, none directly evidenced for history dates.
- **One FSRS state per event vs per (event, mode)** — chose per-event; Anki's own data suggests
  per-format calibration differs. Log `mode` to enable a later split.
- **When should MCQ appear for 5–7?** Evidence says grade 2+ *with immediate feedback*; this game's
  band defaults should be playtested.
- **Map `lat`/`lng` coverage** across decks is unaudited — measure before promising the mode.
- **Session-length numbers** are extrapolated from attention-span + Anki/Duolingo heuristics; no
  history-specific dose study exists.
- **Cross-format transfer** (does cloze skill transfer to timeline ordering?) is not established.

---

## 13. Sources

**Project corpus:** `course-studio/mcg_research_synthesis.md` §8 (feedback), §9 (self-explanation),
§10 (retrieval/spacing), §11 (interleaving), §12 (alignment/MCQ quality); `doc/GAMIFICATION_BRIEF.md`;
`doc/CONTENT_PIPELINE.md:543`; `timeline.js` (mulberry32, BCE formatting).

**External (selection):** Rowland 2014 · Bertsch 2007 · Prangsma 2008 · Hodkinson · Marsh 2012 /
Roediger & Marsh 2005 · Kornell & Bjork 2008 · Cowan 2001 · Rodriguez 2005 · Haladyna, Downing &
Rodriguez 2002 · NBME Item-Writing Guide · W3C WCAG 2.2 SC 2.5.7/2.5.8 · WAI-ARIA APG listbox ·
GOV.UK reorderable_list · NN/g progressive disclosure · Platzer 2020 (Quizlet mode usage) ·
Moodle/Canvas/STACK/QTI numeric-tolerance models · IDC 2026 (exit dark patterns) · CHI 2026 (CET rewards).

**Added in v2 (verified against the primary record, 2026-10-01):**
van Merriënboer 1990 (*the completion strategy*, Univ. Twente) · Renkl, Atkinson & Maier (fading
worked-out solution steps) · Rourke & Sweller 2009, *Learning and Instruction* 19(2) 185–199 (worked
examples in ill-defined domains; ERIC EJ826508) · Kyun & Kalyuga 2013, *J. Experimental Education*
81(3), DOI 10.1080/00220973.2012.727884 (worked examples for essay writing in English literature) ·
van Drie & van Boxtel 2007, *Educational Psychology Review*, DOI 10.1007/s10648-007-9056-1
(historical reasoning) · de Groot-Reuvekamp 2017, *Timewise* (UvA doctoral thesis, 23-11-2017) ·
Reisman 2012, *Cognition and Instruction* 30(1), DOI 10.1080/07370008.2011.634081 (Reading Like a
Historian) · Symons et al. 1993, *Applied Cognitive Psychology*, DOI 10.1002/acp.2350070306 ·
Woloshyn et al. 1992, *J. Educational Psychology*, ERIC EJ443903 · **Nairne, Riegler & Serra 1991**,
*JEP:LMC* 17(4) 702–709, DOI 10.1037//0278-7393.17.4.702 · **Greene, Thapar & Westerman 1998**,
*J. Memory and Language* (effects of generation on memory for order) · Gruetzemacher, Lee & Paradice
2024, *Futures & Foresight Science* 6(2) e177 (calibration training via app) · Chi et al. 1994
(eliciting self-explanations) · Annenberg Learner, *Teaching with Timelines* (learner.org).

**Market sources (NOT peer-reviewed — see the cautions in §3.3):** Asmodee/Hazgaard *Timeline*
(Henry & Blossier, 2010) · TimeToTime.app (Deep Tuition Ltd; live pages + Apple/Google listings,
2026-10-01) · PlayMemorize · GeoGuessr / Seterra install & user figures · chrome-stats AnkiDroid
download count · Quizlet company claim · market-research reports (mutually inconsistent — do not cite).

*Full inline URLs appear beside each claim above.*

---

## 14. Changelog — superseded configuration (v1) and reasons

**Preserved verbatim so the change is auditable.** v1 rated *recommendation strength /100 for this
game* — evidence, fit, **cost and market table-stake**. v2 rates **research alignment** (§3 header).
The rubrics differ on purpose; the flagship's drop from 98 to 77 is a change of *question*, not a
reversal on the same question.

### 14.1 v1 mode catalog (superseded)

| Mode | Rating | Status | Why | Authoring | Feeds FSRS |
|---|---|---|---|---|---|
| **Timeline placement** (existing) | **98** | ✅ | Ordering = the gateway chronology skill; table stake; every competitor shares it | shipped | yes |
| **Exact-year / cloze "Pinpoint"** | **95** | 🔜 | Fill-in-blank g=0.90 + generation d≈0.40; the niche's proven second axis ([Sorting History](https://sorting-history.appstor.io/)) | **auto** from `year`/`yearEnd`/`circa` | yes — ideal |
| **Flashcard (tap-to-reveal)** | **90** | 🔜 | Testing + spacing; exactly Anki's flip-and-rate; cheapest, most accessible review surface | **auto** (`title`/`fact` ↔ `year`/`summary`) | yes (self-report) |
| **Era / century sorting** | **82** | ⚖️ | Middle difficulty between ordering and absolute dating; trains era sense; good for 8–11 | auto from `era`/`year` + one era taxonomy | yes |
| **Multiple choice** | **78** | ⚖️ | Real testing effect, but lure risk; needs immediate feedback + item-writing rules | **auto** (sibling distractors) | conditional |
| **Matching (event↔who/where)** | **76** | ⚖️ | Recognition-level (weaker than generative); earliest-appropriate for 5–7; thin evidence | auto from `who`/`where`/`era` | yes |
| **Map placement** | **74** | ⏸ | Dual-coding justified, but spatial encoding **backfires at 11–14**; least accessible; `lat`/`lng` coverage unaudited | auto where coords exist + tolerance rules | yes |
| **Cause/effect ("why")** | **80**\* | ⏸ | Raises second-order knowledge, but transfer to explanations weak — a *different outcome* | human (`why`/`summary`) | separate axis |
| **Free recall ("brain dump")** | **55** | ⏸ | Strong for adults (d≈4.0) but **fails for young/novices** (~8% initial success) | none | yes |
| **Timed / arcade** | **60** | ⏸ | Fun only; must write the same log. Quizlet deleted Gravity → maintenance cost + lasting ill-will | manual | only if logged |

\* v1 rated cause/effect for its own outcome, not as a substitute for recall.

### 14.2 v1 TL;DR (superseded)

> 1. **Add two modes now:** **exact-year / cloze ("Pinpoint")** and **flashcards** (the review
>    surface for the mastery queue). Both are fully auto-generatable from existing deck fields.
> 2. **Add MCQ and matching conditionally:** only with immediate elaborated feedback and
>    well-constructed items (priming, accessibility, young learners — never sole mastery evidence).
> 3. **Keep timeline placement the flagship.** Ordering is the best-supported chronology skill and
>    the market's table stake; the new modes are *practice surfaces*, not replacements.

### 14.3 Every change, and why

| # | Change | v1 → v2 | Reason | Evidence |
|---|---|---|---|---|
| 1 | **Add an instruction surface (×2)** | none → modelled timeline 87, completion timeline 84 | All ten v1 modes were *assessment*; the corpus has a whole research front on worked examples with no surface. The game tested content it never taught | Barbieri 2023 (g=0.48); van Merriënboer 1990; Renkl et al.; Rourke & Sweller 2009; Kyun & Kalyuga 2013 |
| 2 | **Pinpoint citation corrected** | rated on fill-in-blank **g=0.90** → rated on the generation effect + interrogative/predirected cells | The 0.90 cell rests on **k=2**; the effect-size index attached the parent meta's k=68 to it. Mode kept, support changed | library audit 2026-10-01; corrections §27 |
| 3 | **Self-explanation added; age gate lowered** | "why" deferred to 12+ → structured self-explanation at **8+** | Elaborative interrogation is demonstrated with **elementary and preschool** children. The v1 age gate was too conservative | Symons et al. 1993; Woloshyn et al. 1992 |
| 4 | **Cause/effect elevated** | ⏸ defer → ⚖️ build after MCQ/matching | Annenberg names cause-and-effect as a core *purpose* of timeline teaching; a competitor already ships it | *Teaching with Timelines*; van Drie & van Boxtel 2007; TimeToTime §3.3 |
| 5 | **Simultaneity added** | not in catalog → 70, ⚖️ | "how events, eras and topics overlap in time" is the other named purpose; cheap from existing `year`/`era` | *Teaching with Timelines* |
| 6 | **Free recall superseded** | ⏸ 55 → ❌ | Structured self-explanation dominates open recall, and free recall's failure at young ages is the reason it was deferred in the first place | corpus §9; Symons 1993 |
| 7 | **Flagship re-rated, not demoted** | 98 → 77 | v2 asks a different question (alignment + durability, not cost + table-stake). Ordering remains the flagship and the gateway skill | de Groot-Reuvekamp 2017 (Timewise, supportive); Prangsma 2008 (decay warning) |
| 8 | **§4.3 amended** | "no mode that doesn't write the review log" → "no *assessment* mode…" | As written it excluded instruction surfaces — which is how the catalog ended up all-testing | this revision |
| 9 | **Insert-missing-event rejected** | considered v2, never built | The generation effect **impairs memory for order**; the task generates the exact thing it tests | **Nairne, Riegler & Serra 1991**; **Greene, Thapar & Westerman 1998** |
| 10 | **Market claims downgraded** | "the niche's proven second axis" / market-validated | The category has **no proven mass-market winner** (closest comparable too new to be rated; the ambitious map project funded at $79/mo). Market-report figures are mutually inconsistent (2× spread) | §3.3 |

### 14.4 What did NOT change

- The **architectural spine**: one mode-blind scheduler, `render → signals → rate → Rating`, one FSRS
  state per `eventId`, append-only log, `rating` persisted (§5). v2 inherits it wholesale.
- The **WCAG 2.2 requirement** and the §10.1 patterns. v2 extends the non-drag requirement to the new
  placement-shaped modes.
- The **V1–V13 item-quality gates** and the §9 generation rules.
- **MCQ and matching remain conditional** — the negative-suggestion risk and the item-writing burden
  are unchanged.
- **Map placement stays deferred** despite having the *highest* mass appeal of any mechanic: its
  pedagogy is the weakest (backfires at 11–14) and its accessibility is the worst. **A marketing
  asset is not a learning asset.**

