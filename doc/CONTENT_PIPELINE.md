# Timeline Game: Event Content Pipeline

> Plan for generating **complete, grounded decks** (universal event records:
> title, year, fact, who, where, why, summary, story, map data) — AI-drafted,
> source-grounded, gated, and human-reviewed before it ships. Any specific
> curriculum (including Classical Conversations) is just one deck spec, never
> the template.
>
> **Last updated:** 2026-09-14 | **Version:** 1.47

---

## Table of Contents

1. [Decision (TL;DR)](#1-decision-tldr)
2. [Why not Wikipedia directly](#2-why-not-wikipedia-directly)
3. [Content model](#3-content-model)
4. [The pipeline (author-time)](#4-the-pipeline-author-time)
5. [Trust model: AI drafts, humans verify](#5-trust-model-ai-drafts-humans-verify)
6. [Tooling (permissive licenses — verify at pin time)](#6-tooling-permissive-licenses--verify-at-pin-time)
7. [User / AI-generated decks](#7-user--ai-generated-decks)
8. [Small version plan](#8-small-version-plan)
9. [Non-goals](#9-non-goals)
10. [Open decisions](#10-open-decisions)

---

## 1. Decision (TL;DR)

- **Bundle a short, original `summary` per event** in the deck data. It works
  offline, reads at a kid-appropriate level, and is safe to show.
- **Do not embed Wikipedia** (iframe) and do not make a Wikipedia link the
  primary content.
- **Wikipedia is a source to verify against, not the product.** Use it as a
  research input; present your own vetted prose.
- **Prefer sources better than Wikipedia.** Institutions and reference works
  first; mine Wikipedia's references rather than citing Wikipedia itself (§2).
- **AI may draft; a human verifies.** The pipeline enforces grounding so the
  draft cannot drift from its source.
- Everything here is **author-time tooling** (`scripts/`), so it does not touch
  the no-build / no-runtime-dependency rule for the shipped game.
- **Scope: full deck generation.** Input is a **deck spec** (topic, era range,
  declared groupings, worldview); output is a complete deck in a **universal
  schema** — every field grounded, gated, and reviewed. Classical Conversations
  is one instance (curriculum-specific `week`/`songOrder`), not the default shape.

---

## 2. Why not Wikipedia directly

| Concern | Curated `summary` | Wikipedia article |
|---|---|---|
| **Readability** | You set the grade level | ~73% of articles score below the "standard" reading threshold; median Flesch–Kincaid grade ≈ 9 (avg. adult reads at grade 7–8) |
| **Safety** | You control every word | Wikipedia is explicitly **not censored** (violence, nudity, sexual content); Common Sense Media rates it 13+; schools have blocked it |
| **Credibility** | Sourced, consistent, controlled | Contested in education; only ~40% of academics call it reliable |
| **Offline** | Ships with the deck | Needs network; runtime caches are not durable (iOS may evict storage after ~7 days idle) |
| **Payload** | ~2 KB of text | Full article ≈ 1.26 MB incl. ~53 images |

Credibility here comes from **sourcing**, not from the Wikipedia brand: a curated
summary that cites its sources is a stronger trust claim than a link to an
uncensored, grade-9+ article that can change tomorrow.

> "Simple English" Wikipedia does **not** solve this: research shows it is still
> above its target reading level (and declining), and it remains uncensored.

### Source hierarchy (prefer better than Wikipedia)

Wikipedia's own policy is that it is **not a reliable source for any purpose** and
that citing it elsewhere is **circular sourcing**. The evidence is narrower than
"Wikipedia is inaccurate": the *Nature* 2005 study found it roughly comparable to
Britannica on science, but Rector (2008) measured history articles at **80%** vs
**95–96%** for Britannica and specialist references, and the dominant failure is
**omission**. Its real weaknesses are **niche topics, contested topics, and bias** —
exactly the corners a world-history deck reaches into.

| Tier | Sources | Use for |
|---|---|---|
| **1** | Museum, archive, university, government, peer-reviewed | Prefer first |
| **2** | **Britannica, Oxford Reference, subject encyclopedias** | **Default tier** |
| **3** | Quality journalism, reputable magazines | Cross-check before use |
| **4** | **Wikipedia** | Finding aid only; pin `?oldid=` if linked |

- **Cite what Wikipedia cites.** The reliable move is to follow its references to
  the underlying Tier-1/2 source — that is the "trace to the original" habit
  (SIFT) every university library teaches.
- **Tier 2 is the honest default** for this audience. Britannica runs named
  experts, fact-checkers, subject editors — and children's editors who rewrite for
  reading level.
- **Never let Wikipedia be the sole source** for a niche or contested fact. If only
  Wikipedia asserts it, **soften or drop the claim** — that is the citogenesis
  failure mode (a Wikipedia claim repeated by a "reliable" outlet and cited back).
- **Authoritative ≠ infallible.** Even Tier 1/2 carries ~3–5% error, so the
  **two-source rule** (§5) still applies to anything surprising, contested, or
  numeric.

---

## 3. Content model

Add an **optional `summary` field** to each event, alongside the existing
`fact` / `who` / `where` / `why`:

```js
{ id: "moon", title: "Humans first walk on the Moon", year: 1969,
  category: "discovery", emoji: "🌕",
  fact: "About 600 million people watched the landing live on television.",
  who: "Armstrong & Aldrin (Apollo 11)", where: "The Moon",
  why: "A peak of 20th-century achievement.",
  summary: "In July 1969, Neil Armstrong and Buzz Aldrin became the first "
         + "humans to walk on the Moon while Michael Collins orbited above.…",
  noMap: true }
```

Rules:

- **`summary` is optional.** Imported / AI decks may omit it; the engine falls
  back (`ev.summary || ev.why || ev.fact`).
- **Shown only after placement.** Because it is not narrated and appears
  post-reveal, a `summary` *may* contain the year — no year-leak check is needed.
  (The existing year rule for `fact/who/where/why` is unchanged.)
- **Provenance stays out of the shipped deck.** Store it in
  `content/provenance.json` (author-time only): source title, permalink,
  revision id, snapshot path, model, verified date, reviewer.
- **Imported decks degrade gracefully** — see §7.
- **`story` (optional, deep layer):** a short *narrative nonfiction* retelling —
  the real events told as a story, Story-of-the-World style. Rules:
  - **Default device: a real passage.** Quote a surviving text verbatim where one
    exists; otherwise *adapt* it (modernise spelling, shorten, gloss) and disclose
    the adaptation. Start from the evidence — a diary, a chronicle, a letter, a
    treaty — not from a reconstruction.
  - **`invented` is a last resort, not a device.** Use it only when no usable
    record exists *and* the event still needs telling, and frame it as such.
    Invented stories underperform quoted/adapted ones and carry a disclosure burden
    the real passage never needs — so prefer a real passage wherever the record
    allows one.
  - **No invented events or facts.** Dates, names, and numbers must match the
    frozen source (same checks as `summary`).
  - **Disclosure rule:** any imagined detail (reconstructed dialogue, interior
    thoughts) must be clearly marked as imagined.
  - Opened by a **"Read the story"** button that renders **only when `story`
    exists** (never a dead affordance).
- **`details` (optional, deep layer):** the expository deep-dive — dates, people,
  significance, "what happened next" — shown as a secondary section in the same
  takeover as the story.

### Deep-layer architecture (one button, one destination)

```
Hover/tap → Fact sheet (level 1: who/where/why + summary — expository, quick)
              └─ "Read the story" (one button) → full-screen takeover (level 2)
                  ├─ The Story (narrative nonfiction — primary)
                  └─ More details (expository — reference section)
```

- **One button, not two.** Readers don't reliably self-select the structure that
  helps them (2026 text-structure study); offering both in one destination serves
  kids (story) and curious adults (details) without a choice burden.
- **Convergent claims rule:** the story and the details are generated from the
  **same verified claim set** — consistent facts across both forms is what
  produces the best learning (Aydın). The trace tags (§4) prove it.
- **Layer contract applies across all three surfaces:** fact-sheet (level 1),
  story, and details must not restate each other's claims.

### Two content tiers (`depth`)

Not every event carries a deep layer, and the product is honest about that rather
than implying coverage it does not have:

| Tier | Has | Prose grounding |
|---|---|---|
| **deep** | `story` (+ `storyTrace` / `fieldTrace`) | Every unit traced to a claim with a verbatim source quote |
| **shallow** | `summary` + fact-sheet surfaces | **Editorially reviewed against the cited source — not claim-grounded** |
| *fact-only* | `fact` / `why` only | No prose layer to ground |

`depth` is **derived** from the content (a `story`, else a `summary`, else `fact-only`),
never stored — the same rule as `precision`/`certainty`. A stored copy could contradict
the content it describes, and a whitespace-only field must not claim a tier.

The gate reports the split (`DEPTH_SHALLOW`, info, on every shallow event) and
`verify-all` prints per-deck coverage, so a PASS can never be misread as "all prose is
verified":

```
Content gate: 0 error(s), 371 warning(s) — PASS
Coverage: 1 event(s) claim-grounded (deep) · 7 editorial-only (shallow — summary
reviewed against source, not traced to claims)
```

**This is a labelling decision, not a closure.** A shallow event's `summary` carries
exactly the exposure that motivated the pipeline — an unchecked claim about the world,
the class of error that produced the three invented-material failures. The tier
**enumerates** that exposure so it is visible and bounded; it does not remove it.
Grounding the shallow tier (claims + `fieldTrace` on `summary`) is tracked separately.
The `source` shape on those events is still the legacy lone string rather than
`sources[]`; normalising it belongs in the same pass.

### Story formats, disclosure & attribution

The story's **format** is the *how*; its **source relationship** is the *honesty*.
Both are declared, and the UI derives its statement and its attribution table from them.

**Formats** (`story_type`): `narrative` (default), `diary`, `letter`, `newspaper`,
`biography`, `micro-history`, `multi-perspective`. All are supported by the
primary-source pedagogy literature (LOC/National Archives) and the children's
historical-fiction tradition (Dear America).

**Source relationship** (`storySource`) — one declared value, grounded in existing
standards rather than invented:

- **schema.org** models this as a single repeatable `isBasedOn` property ("derived
  from… a modification or adaptation") and deliberately carries **no vocabulary for
  *how*** a source was used.
- **Creative Commons** ("Recommended practices for attribution") requires **TASL** —
  Title, Author, Source, Licence — *"whether you're sharing the work as-is or if you
  have made an adaptation"*, plus **stating that it is an adaptation** *"so viewers
  can see what has changed"*.
- **IFLA FRBR / LRM / RDA** supply the controlled vocabulary for derivations
  (LRM-R22 *"is a transformation of"* — by audience, genre, style; FRBR:
  abridgement, adaption, arrangement, supplement, translation).
- **Children's publishing** uses the plain-English forms: *"retold by…"*,
  *"adapted by…"*, *"retold from the original by…"*.

| `storySource` | Badge (top of panel) | Attribution title |
|---|---|---|
| `retold` *(default)* | A true story | **Retold from** |
| `adapted` | A true story | Adapted from |
| `abridged` | A true story | Abridged from |
| `paraphrased` | A true story | Paraphrased from |
| `summarised` | A true story | Summarised from |
| `translated` | A true story | Translated from |
| `quoted` | A true story | Quoted from |
| `invented` | An imagined story, based on real events | Based on |
| `original` | Written for this game | — |

- **`retold` is the default** — the children's-publishing term for a narrative
  retelling for a younger audience, i.e. LRM's "adaptation for children". Prefer it
  over `adapted`; never write "adapted **and rewritten**" (an adaptation *is* a
  rewrite).
- **`quoted` is the strongest relationship** — use it whenever a passage can be
  reproduced as-is. It needs no adaptation disclosure and is the easiest to defend.
- **`invented` is a last resort** — it has no equivalent in any standard (schema.org,
  FRBR and CC all assume a *source*, not the disclosure of *fiction*), and it is the
  only value that reads as a warning. Keep it for events with no usable record; never
  make it the default. If a source exists, quote or adapt it instead.

### Disclosure rules

- **The story states what it is, where the story is** — the relationship line at the
  head of the story block (*"Retold from the sources below"*), not a panel-level
  badge. A badge at the top of the panel would sit above the factual sections and
  mislabel them, and it duplicates the relationship. Essential info must not be
  hidden in a tooltip (NN/g 2026); young children need the fact/fiction boundary
  explicit (Aydın; Backman); clear wording beats ambiguous (Frontiers 2026).
- **`invented` is the one case that reads as a warning** — its line is *"An imagined
  story, based on the sources below"*, styled distinctly. Fiction must announce
  itself.
- **Invented stories additionally carry a `<details>` — "What's real in this
  story"** — at the end, separating fact from invention (Dear America Historical
  Note pattern). Specific summary, never a vague triangle. **No `?` tooltip** for
  the essential disclosure.
- **Own-voice rule:** for sensitive/cultural topics prefer sources we can credit, or
  flag for careful human review (the Dear America critique shows the risk of
  outsiders inventing accounts of marginalized experiences).
- **Convergent-claims rule:** an invented *voice* is the only ungrounded part; every
  fact must still match the verified claims.

### Attribution (the sources table)

Attribution is **structured data, not a sentence**. The story declares its
relationship (`storySource`); each source is a row:

```js
storySource: "retold",
sources: [
  { author: "Wikipedia contributors", title: "Great Pyramid of Giza",
    publisher: "Wikipedia", url: "https://en.wikipedia.org/wiki/Great_Pyramid_of_Giza",
    revision: "1374404809", license: "CC-BY-SA-4.0",
    usedFor: "Workers, the diary, construction details" }
]
```

Rendered as **one table with a neutral title**, two columns. The title is neutral
because the sources back the **whole panel** (summary, story *and* details) — the
relationship is stated **with the story** instead, where it belongs:

```
THE STORY
Retold from the sources below        ← the relationship, with the story
For twenty-six years, gangs of…

MORE DETAILS
The pyramid's blocks came from…
────────────────────────────────────────────────────────────────
SOURCES                              ← neutral: these are the panel's sources
┌──────────────────────────────────────────────┬───────────────────────────┐
│ Source                                       │ Used for                  │
├──────────────────────────────────────────────┼───────────────────────────┤
│ Wikipedia contributors, 'Great Pyramid of    │ Workers, the diary,       │
│ Giza', Wikipedia · revision 1374404809       │ construction details      │
│ · CC-BY-SA-4.0                               │                           │
└──────────────────────────────────────────────┴───────────────────────────┘
```

- **Specific, not vague.** Every source names **author + title + publisher + licence**
  (CC's TASL) and, where the source is versioned, the **pinned revision** — a citation
  the reader can check. "Based on a true story" is banned (ambiguous labels cause
  avoidance, Frontiers 2026).
- **`usedFor` says what each source backs up** — which is how the two-source rule (§5)
  becomes checkable data.
- **"What changed" note** — a `changed` field rendered as a line **under the sources
  table** (`Changes: …`), not in the story subtitle and not as a footnote marker. It
  is a statement about the *adaptation*, so **one line covers any number of sources**.
  CC requires you to *indicate* that changes were made (the relationship label does
  that); *describing* them is the encouraged practice, so `CHANGED_MISSING` warns
  rather than blocks. **No asterisk**: bare markers are announced unreliably by screen
  readers and need link + heading + back-link machinery, and the label already points
  "below" in words.
- **Two fields, two jobs.** `changed` states what we did to the **text** (the treatment
  — *rewritten as a scene, shortened*); `storyNote` states the **fact/fiction boundary
  inside the story** (*what is record, what is invention*). Neither restates the other:
  `META_OVERLAP` flags it when they do. That check runs at a **lower threshold (0.25)
  than `LAYER_REDUNDANCY`**, because these two fields are short and dense — the generic
  0.6 threshold did not catch a real duplication here.
- **Rights check:** recent sources (e.g. 20th-century diaries) may be under copyright —
  prefer public-domain or cleared sources (e.g. LOC "Free to Use and Reuse"); record
  the rights status in provenance.
- **Source drift.** Our prose is grounded in *frozen snapshots committed to the repo*,
  so a dead link cannot break the content. What can go stale is the **grounding**: if
  the article is rewritten, the content silently reflects a superseded source.
  `check-sources.mjs` queries each pinned revision's current id and reports drift —
  a **review trigger, never an auto-fix** (re-pinning would silently change what the
  content is grounded in). Run it periodically, and when a source changes materially,
  re-review the events that cite it.
- **No access date.** Retrieval dates are academic overhead for this product; the
  pinned revision already fixes the point in time.

### Rights: can I use this passage?

**"It's old, so it's free" is false often enough to be dangerous.** Two traps: the
**age of the event is not the age of the text** (a 1950 history book about ancient
Rome is in copyright), and **a translation is its own work** (a modern translation
of an ancient chronicle is protected even though the original is not). Unpublished
material — letters, diaries, sermons — gets the **longest** terms, so it is the
hardest category, not the easiest.

Work top-to-bottom; stop at the first yes:

1. **Is it a fact or an idea?** → Write it in your own words. Free.
2. **US federal government work** (9/11 Commission Report, NASA transcripts,
   statutes)? → Public domain in the US. *(Federal only — state/local and contractor
   works are not.)*
3. **Which edition are you copying — the original text or a translation?** Date the
   **translation**, not the author.
4. **First published in the US in 1930 or earlier?** → Public domain in the US.
5. **Was it ever published?** Letters / diaries / manuscripts → assume protected.
6. **A short, attributed quotation carrying your own point?** → Fair use / quotation
   exception — but *not* automatic. A commercial app, an unpublished work, or
   quoting the "heart" of the source all cut against you.
7. **Adapting / abridging / translating it?** → Needs permission unless the source is
   public domain.
8. **In doubt?** → Substitute a public-domain edition, write from the facts, or get a
   licence. Never ship on a guess.

**Not safe, despite being "primary":** MLK's speeches, Mandela's *Long Walk to
Freedom*, Churchill's writings, Anne Frank's diary, Billy Graham's sermons, missionary
journals and letters, and most 20th-century photographs. Estates and publishers
control these, and some enforce actively.

**Safely reusable:** US federal works; US publications from **1930 or earlier**;
**CC0** open-access material (the Met, the Smithsonian); and **public-domain
translations** of ancient and medieval texts — **LacusCurtius** and **Fordham's
curated PD-Loeb list** are the right starting points. **Perseus prohibits commercial
use**, and the Loeb Classical Library is largely modern and licensed. The app is
hosted worldwide, so design to the **stricter** standard (the UK/EU quotation
exception), not only US fair use.

> Not legal advice — clear anything commercially significant with counsel.

### Writing the story: match the device to the evidence

The form (`story_type`) is a **loose label, never a template** — a diary is not one
prescribed shape, and neither is a vignette. What actually decides the writing is
the **evidence**. *The Story of the World* is instructive here: across its four
volumes the dominant device shifts as the record thickens — reconstruction in the
Ancient volume, real diaries quoted by the Early Modern one, newspaper material
throughout the Modern one. The reconstruction framing disappears exactly when it
stops being needed.

**The rule:** *match the device to the evidence, not to the genre.* Quote where a
record exists; adapt where it needs simplifying; narrate where the event is
documented; reconstruct — **and frame it** — only where the record is thin. The
first three are the target; the last is the fallback.

Real voices are worth using for **authenticity and defensibility**, not for a
measured memory boost — the evidence on that is thin and mixed (the app's own
review log can test it).

**The palette** (mix freely; none is required — best-evidenced first):

| Device | Use when | Basis |
|---|---|---|
| Primary-source quotation | a diary / letter / report survives | documented |
| Adapted document | a real text needs simplifying | documented |
| Documentary narration | the event is well recorded | documented |
| Expository bridge | moving between scenes | either |
| Dialogue | it carries voice — quote it, or mark it imagined | either |
| Second-person immersion | the reader should *be* there | reconstructed |
| Reconstruction vignette | **no** usable record exists (last resort) | reconstructed |

**`pov`** — the immersive axis, **orthogonal to form**: `third` (a character),
`first` (a diary/letter voice), `second` ("you"). A diary and a vignette share a POV
choice; a newspaper and a letter differ by form, not POV. Default `third`.

**Framing.** A reconstructed story opens with a plain-language line that says so —
**written in our own words, not borrowed ones.** The oval label carries the formal
disclosure; the opening line carries the reader in.

**Worked example — one event, two devices** (`pyramids`):

*A — documented narration* (`storySource: retold`, `pov: third`)

> Red paint on the stone still spells out a name: Khnum-Khufu. The men who set that
> block were one of the gangs who built the Great Pyramid, working in crews of forty,
> each with its own overseer and its own name. One of their supervisors, Merer, kept
> a papyrus diary of the limestone he ferried up the Nile from Tura. More than two
> million blocks went into the pyramid — and the only words its builders left behind
> are the names of their gangs.

*B — framed reconstruction* (`storySource: invented`, `pov: third`)

> Nobody recorded what an ordinary day at Giza felt like; the records give us the
> gangs, the crews and Merer's diary, and not much else. So this scene is imagined.
> A girl carries water up from the canal, past the sledges and the shouting
> overseers. She has lived her whole life in the workers' camp below the pyramid,
> and has never seen the horizon without it.

Both use the **same sources**; only the **device** differs. **A is the target** — a
real diary, quoted and narrated, with nothing invented to disclose. B is the fallback
for events whose record is genuinely thin; it must be framed and labelled, and it
costs the reader a fact/fiction explanation that A never needs.

### The spine (goal-directed episode)

A story is not a tour of scenes. The unit readers encode is the **goal-directed
episode** — want → obstacle → turn → outcome — and recall follows **cause > then >
and**. Brewer & Lichtenstein (1982) had readers rate causally-ordered narratives with
a significant outcome as "stories," and otherwise identical sequences as *nonstories*.
That experimental result *is* the difference between a scene and a story, and it is the
mechanism behind the reviewer complaint that a draft "lacks direction."

So every story **declares its spine before drafting** — `storySpine` with `want`,
`obstacle`, `turn`, `outcome` — for the same reason `format` and `pointOfView` are
declared fields: the drafter is told what to write and the reviewer has something to
check against. When the four beats are undeclared the brief emits them as prompts and
the gate raises `SPINE_MISSING` (warning).

**Every target fact must sit ON the chain.** This is the part that is easy to get
wrong, and it is measurable. The seductive-details literature (Rey 2012: retention
d ≈ 0.30, transfer d ≈ 0.48) shows interesting-but-irrelevant additions *reduce*
learning. The **narrative-distance effect** (Glaser et al.) shows facts tied to the
plotline are learned **better**, and off-plotline facts **worse**. Drama that carries
the content helps; drama that decorates it is an own-goal. An arc that makes the target
facts plot-critical is evidence-based — an arc that adds excitement *around* them is a
seductive detail.

### Is the story about the event? (`STORY_OFF_EVENT`)

The layer contract stopped a story from *repeating* `summary`/`details`. **Nothing
required it to be *about* the event** — and four fresh drafts then dramatised adjacent
subjects: *"Traditional founding of Rome"* got a story about archaeology while the card
itself reads `who: "Romulus (legend)"`; *"Alexander the Great dies"* got a mutiny four
years earlier; *"Homer's Iliad and Odyssey composed"* got a festival singer rather than
the poems.

Root cause, worth recording: **the pipeline caused this.** Its story contract permitted
only one story-kind — *an ordinary person's scene dramatising a grounded fact* — so a
**legend**, a **text**, and a **death** had no shape they could take, and drafters routed
around them. Fixing the contract (typed story kinds) is separate, larger work.

**`identityClaims` is declared, not derived — and that was tested, not assumed.** The
first implementation derived it from `fieldTrace.fact` and failed in *both* directions at
once:

| Event | Derived identity | Result | Why it was wrong |
|---|---|---|---|
| `pyramids` | C010 | false positive | its `fact` is a *legacy* statement ("tallest for more than 3,700 years"), so the story about the building never cites it |
| `rome-founded` | C003, C010 | false negative | its `fieldTrace.fact` includes a context claim ("settlements emerged"), so an archaeology story passed by citing background |

Identity is an editorial judgement — the same reason `format` and `storySpine` are
declared. So each story-bearing event declares `identityClaims`: the claim(s) stating
what the event **IS**.

- `STORY_OFF_EVENT` (warning) — the story cites none of them.
- `IDENTITY_CLAIMS_MISSING` (warning) — a story-bearing event that hasn't declared them.
- `IDENTITY_CLAIM_UNKNOWN` (error).
- `IDENTITY_NOT_IN_FACT` (info) — the identity claim isn't among the claims backing
  `fact`, i.e. the headline and the identity describe different things. **This fires on
  `pyramids`**, whose `fact` states significance ("tallest for 3,700 years") while its
  identity is the building (C002). It is the same drift as the `why`-restates-`fact`
  defect, seen from the other side — `fact` drifting *up* into significance while `why`
  drifts *down* into fact.

**First run caught exactly the two real failures** (`rome-founded`, `alexander`) and
nothing else — no noise on `homer`, `aqueduct`, or `pyramids`.

**Limit, stated plainly:** this checks **citation, not centrality**. A story can cite its
identity claim and still be about something else. The faithfulness literature (FactCC,
SummaC, AttrScore) shares precisely this blind spot — those metrics ask *"is this
supported?"*, never *"is this about it?"*.

#### Disclosure is a box, not prose

**Superseded (2026-09-14).** v1.45 told drafters to *mark the time gap* — and they marked it
at both ends of every story, so all four new drafts opened with "This scene is imagined" and
closed with "imagined from what the Romans wrote down". The repetition was the predictable
result of asking a prose author to voice the same statement twice.

**The evidence says prose is the wrong home for it anyway:**

| Finding | Source |
|---|---|
| Fact-vs-fiction **labelling did not change** narrative transportation or story-consistent beliefs | Green & Brock 2000 |
| Warnings **before or after** both failed to stop readers using embedded false facts | Marsh & Fazio 2006 |
| Highlighting to-be-evaluated phrases **increased** later suggestibility | Eslick, Fazio & Marsh 2011 |
| The one clean timing result favours disclosing **after** exposure over labelling before it | Brashier et al., *PNAS* 2021 |
| Museums: a terse identity label **adjacent to the object**; a bare disclaimer is insufficient | ICOM §4.7; NPS treatment standards; British Museum (proximity) |
| Children's fact/fiction hybrids put the substantive note in **back matter** | publishing convention |

So: **no disclosure in the story prose at all.** The story stays inside its own time. The
product renders **one box after the story** (`.story-disclosure`, adjacent) assembled from
`storySource` + `storyNote` + `changed` — written once, rendered identically every time. The
head carries no disclosure line. If a genre marker is ever wanted there it must be a
**different object with a different job** (a chip, not a sentence), or it will re-create the echo.

**Consequence for the time gap.** The insight holds — the narrator stands in the present
while the scene is in the past — but the remedy changed. Do **not** cross the gap to comment
on the record: retrospective material belongs in `details`, and the fact/fiction boundary
belongs in `storyNote`.

**This does not make the reader safe.** Disclosure serves the parent and the reviewer; the
evidence is that it does *not* stop a child absorbing invented detail as fact. What works is
**active discrimination with feedback** (source-monitoring training; detect-the-error tasks)
— a post-story sort or quiz. Not built; recorded as the follow-up.

#### Choose a stake the evidence can settle#### Choose a stake the evidence can settle

The hardest constraint, and the one our own failure taught us. A want about the
**present** resolves inside the scene and needs nothing the record lacks. A want about
the **future** — what became of them, whether they lived to see it — requires the
narrator to know what no source says.

The `pyramids` pilot is the case in point. The first draft reached for its turn at
"it will take twenty-six years" — a real, *documented* turn (C002) — and then went one
step past it: *"She will not see it finished."* That step is error #2 on the record.
The desire for direction and the omniscience error were **the same pressure, one
sentence apart.** The rewrite keeps the documented turn and drops the step past it,
by giving the protagonist a stake the scene itself can settle.

This is a declared policy in `devices.json` `universalRules` — so it prints in every
brief — plus a human review item. It is deliberately **not a gate rule**: whether a
stake is settleable is not mechanisable, and we do not fake a heuristic for it, any
more than `LAYER_REDUNDANCY` pretends to be a claim-level verifier.

**Evidence quality (stated plainly).** The story-grammar findings are old (Stein &
Glenn 1979; Mandler & Johnson 1977) and the seductive-details meta-analyses are
contested (Rey's own tally: 11/39 supported, 13 mixed, 15 found no harm). This is
strong *analogical* evidence for a 400-word historical micro-narrative for children —
enough to act on, not enough to be certain. What no study supports is the monomyth:
Vogler's twelve stages were built for 90–120 minute films, and the hero's journey is
contested as a cross-cultural universal (Dundes 2005; Hambly 2021) — a poor fit for a
world-history product, quite apart from the scale. Third-person narration, already the
house choice, is separately endorsed by the historical-empathy literature, where
first-person "imagine you are…" tasks *increase* presentism.

### Length, pacing and wording

**Length — enforced.** Measured from *The Story of the World*: its story sections run **~530–1,000
words**. That is not arbitrary — it sits exactly in the published range for the age
band: grade 3 chapters are **500–1,000 words**, grade 4 **1,000–1,500** (Hasbrouck &
Tindal reading rates put a 500–1,000-word chapter at **6–12 minutes** of reading).
Our first vignette was **110 words** — a *summary*, not a scene. Target **~400–600
words** for `story` (the fact sheet, details and sources sit around it). The gate
enforces a **`STORY_LENGTH` warning outside 300–700 words** — the rule that would have
caught our original 110-word "story" automatically.

**Why scenes cost words.** From a survey of nonfiction picture-book biographies
(Larson 2024; average 1,116 words): *"Crafting vivid scenes — snippets of
minute-by-minute action with thoughts/emotion and potentially dialogue — requires
more words than summarizing information after the fact."* A scene has to be **long**;
a summary has to be short. That is the whole reason ours didn't read as a story.

**Pacing.**
- **One scene**, not a survey. A moment, not a period.
- **A child protagonist** — the reader's proxy (recommended practice for read-alouds).
- **A stake** the reader can hold: something wanted, or at risk.
- **Balance suspense and relief** — *"it's hard to sustain the 'sitting on the edge of
  your seat' feeling"*.
- **End on a turn**, so the reader wants the next thing.
- **Exposition goes in the bridge** (our `details`), not the scene. Children *"find it
  hard to sit through pages and pages of description."*

**Wording — define terms where they appear.** Unfamiliar terms must be explained
**at first mention**, in place, **one sentence or less**, in plain language — the
appositive is the standard form (*"an 'Overseer of Ten' — a foreman in charge of ten
men"*). *"Define only terms the reader needs right now"*; **do not define everything**
— too many definitions crowd the prose. Children's nonfiction guidance is blunt that
terms *"have to be explained wherever they appear"*: an unexplained "Overseer of Ten"
is a failure, not a flourish.

**Invented people, not invented facts.** A reconstruction may invent people, scenes
and dialogue; it may **not** smuggle in false claims about the real world. The
disclosure covers the *people*, not the *society* around them. A line like *"it will
take twenty-six years — longer than anyone she has ever met has been alive"* is a
false claim about ancient Egypt (its low **average** life expectancy is driven by
infant mortality; plenty of adults passed thirty), wearing the costume of
scene-setting. Everything the story asserts about the world must still be grounded —
which is what `storyNote` exists to make explicit. Two more shapes of the same
error, both caught in `pyramids` after the first pass:

- **No unsupported omniscience.** *"She will not see it finished"* asserts a
  character's death, which nothing in the record supports — an invented character may
  be invented, but the narrator may not claim to know what is unknowable.
- **No unmotivated implication.** *"One of those rolls survived. Almost nothing else
  from the camp did."* invents a **catastrophe** the sources never mention. Papyrus
  decays; nothing *destroyed* it. Say what the record says (the roll was found in
  2013 at Wadi al-Jarf, dated to Khufu's 27th year), not what makes a good line.

**Point of view (`pointOfView`)** — `third` | `first` | `second`, orthogonal to form.
Not decoration: it is *"a ubiquitous and inescapable textual property"* of narrative
(Bal), and it measurably changes the reader. First person raises immersion,
transportation and identification (Hartung et al. 2016; Samur et al. 2020, N=541;
Chen & Bell 2022 meta-analysis of 16 studies); third person induces a detached
observer stance; second person places the reader *in* the scene. It is declared so
the drafter is told which to write and the reviewer can check the story keeps it.

**Brief the drafter — the control point is *before* writing.** Our gate grades a
finished story; by then an authoring error is already made — and three were. The
closest repo, `history-tales`, runs its guardrails *between outline and script
generation* and feeds the findings **into the generation prompt**. Ours: `brief.mjs`
emits a per-event brief from the event data — the device (`format`), the point of
view, the length target, the **claims with their verbatim quotes (the only facts that
may be asserted)**, the declared invented cast, and the **forbidden moves**.

**The device palette is data, not prose.** `registry/devices.json` gives each device
its description, the sources it wants, and its `forbiddenMoves` — borrowed from
history-tales' Narrative Lens Registry (*"lenses bias emphasis… they NEVER override
facts"*). Its library already catalogues the shapes of our three errors:
*"Treating the journalist as omniscient narrator"* (= *"she will not see it finished"*),
*"False closure"*, *"NEVER suppress uncertainty labelling"* (= the "survived" implication).

**Where their doctrine is stricter than ours, we don't follow it.** Their lenses forbid
*"Inventing civilian characters"*, *"Invented child characters"* and *"Inventing family
relationships"* — because they write **documentary** scripts. **We deliberately allow
declared composites**: Meryt and her father are the device (SOW's Tarak and Chin),
governed by the disclosure and the `characters` field, not forbidden. An invented
person's inner life *is* the invention; only a **real** figure's is off-limits.

The universal rules, which every device inherits:

> never assert a fact not covered by a claim · never give a **real** figure words or
> thoughts they didn't leave · **never assert an outcome the record doesn't support — a
> fate, an ending** · never imply events the sources don't mention · never assert a
> social generalisation (life expectancy, literacy) no claim supports · never suppress
> recorded uncertainty · invented people are **declared composites**, and their inner
> life is the invention.

*Adopted from `history-tales` — MIT-declared in its README (no LICENSE file; ask the
author before commercial reuse).*

**Name your people.** A proper name makes a character markedly more prominent in
the reader's memory than a role description ("a girl") — naming is *"a major factor
in focus control"* (Sanford, Moar & Garrod 1988; Peracchi 2004) — and it is the
convention in children's narrative history (SOTW's Tarak and Chin). Three rules:

- **Suits the time and place** — and must not *feel* anachronistic even when
  technically attested (the "Tiffany Problem").
- **Declared as invented.** List the composite cast in `characters`. That both
  discloses the invention and excludes those names from the grounding check — a
  *declared* invention is not an unsourced fact. An **undeclared** invented name
  still fails `GROUNDING`, which is the point.
- **Never name a real historical figure and invent their words.** *Named real person
  = responsibility; composite = flexibility.*

**Trace every sentence.** A mechanism borrowed from two repos: `history-tales` appends
a trace tag per paragraph (`[Beat Bxx | Claims Cxxx]`), strips them for output and keeps
them for audit; `data2story`'s Inspector resolves every sentence to evidence ids and
counts `traced` vs `untraced`. Ours follows `data2story`'s resolution, and uses the
**same unit, the same validator and the same sentinels as `fieldTrace`** — so the two
cannot drift apart. Each *sentence* of the story declares what backs it:

| Entry | Means |
|---|---|
| `["C007","C008"]` | These claims back this sentence. Each must exist and carry a verbatim source quote. |
| `[]` | Declared invented narrative — **the device, not a defect**. |
| `["?"]` | An assertion about the world that **no claim covers** — unresolved. |

The gate checks one entry per sentence (`STORY_TRACE_COUNT`), each entry's shape, and
that every cited claim exists (`_UNKNOWN_CLAIM`), is not repeated (`_DUPLICATE_CLAIM`)
and has a quote (`_UNSUPPORTED_CLAIM`). The story trace now enforces everything the
field trace does; previously it checked only the count and unknown ids.

**Why the unit is the sentence, and why `["?"]` exists.** At paragraph grain a single
cited claim made a whole paragraph read as *documented*, whatever else it asserted.
`pyramids`' closing paragraph cited C008 — so it passed as grounded — while its first
sentence (*"The crews who raised it left no names of their own"*) claimed considerably
more than C008 supports. Paragraph grain **flattered the story**: *1 of 9 paragraphs
invented*. Sentence grain tells the truth: *16 of 29 sentences invented, 2 unresolved*.

`["?"]` exists because narrative sentences are not only *grounded* or *invented* — a
sentence can assert something about the world that nothing backs. With only two tokens,
an author must either cite a claim that does not support the sentence, or bury it in
`[]`. Burying it is precisely how an overstatement survives review *looking like*
declared invention. `["?"]` makes the gap **visible** instead of disguising it, and it
**warns rather than errors**: the honest fixes are to ground the sentence or make it
assert less, and an error-severity gate would just push authors back to `[]`.

**A census, not a defect list.** The trace must not bury its own output. `[]` is
*counted, not itemised* in a story — `STORY_TRACE_INVENTED` reports
`16 of 29 sentences invented; 2 unresolved` — because invented prose is the norm there;
itemising it emitted 16 info findings and hid the 2 warnings that matter. In an
expository field an invented sentence *is* unusual, so `FIELD_TRACE_EMPTY` itemises it.
Same validator, different reporting, because the two surfaces differ.

It **cannot judge whether an invented sentence is true**. What it does is *isolate
every untraceable assertion and put it in front of a reviewer* — which is exactly where
the invented-material errors live (false world-claims, unsupported omniscience,
unmotivated implication). That is the honest limit of automation here, and both repos
agree: neither judges truth; both surface the untraced. Worth knowing: all three
`pyramids` errors were in the **3 invented** paragraphs the trace now flags.

**Paragraphing.** The story is stored as one string and rendered as **separate
paragraphs** — a blank line in the source becomes a paragraph break. Break where
narrative does (a new beat, speaker, actor, or a shift in time or place — *"think of
each paragraph as a single camera shot"*). **Vary the length**: short paragraphs
quicken the pace, long ones slow it; a one-sentence paragraph earns its emphasis.
Formatting follows the web convention — **whitespace between paragraphs, never a
first-line indent** — with the gap (1.25em) clearly exceeding the leading inside a
paragraph (1.65).

### Making the story read as a story

If a narrative section sits in the *same* treatment as the factual sections, it
reads like another fact block. The editorial rule is that a **distinct class of
content must be visibly distinct** — *"You can see they are different without
reading the text"* (CreativePro, *Nonfiction Design*).

| Class | Voice | Marking |
|---|---|---|
| Fact sheet (summary · who · where · why) | reference | plain, compact |
| **Story** | **narrative** | **a rule down its left side** + named section + relationship line |
| Details | reference | plain, compact |
| Sources | apparatus | small, tabular |

- **A rule down the story's left side, wrapping the story content** — the
  Story-of-the-World device. It encloses the prose **and** the story's own
  "what's real" disclosure, so the fact/fiction note sits inside the story it
  qualifies; the section's labels (heading, relationship) sit above it, unruled.
  The marking is a rule, **not a different typeface**: the game stays
  single-typeface throughout.
- **A named section** (*"The Story"*) with the relationship as an **oval label**
  (*"Retold from the sources below"*) — the same pill treatment the removed panel
  badge used.
- **A serif body was considered and rejected** — it is the strongest typographic
  signal (*"serif for body signals article"*), but the house style is one typeface.
- **A drop cap was considered and rejected** — strong (*"Start reading here"*; +18%
  first-paragraph completion in one 2026 eye-tracking study) but it suits long,
  desktop, prose-first pieces, not ~100-word stories read on a phone, and it breaks
  screen readers without careful markup. Revisit if stories grow.

### The layer contract (anti-duplication)

Each field has one job; restating another field's claim is a contract violation
the gate flags for review:

| Field | Job | Anti-duplication rule |
|---|---|---|
| `title` | The name (who/what/when in a phrase) | Must not restate `fact` or `why` |
| `fact` | The **hook** — one distinctive detail | Must not restate `why`, `summary`, or `story` |
| `who` / `where` | Entities (short) | — |
| `why` | One-line **significance** | Must not restate `fact` or `summary` |
| `summary` | Short expository paragraph (2–4 sentences) | Must not restate `fact` or `why` claims |
| `story` | Narrative nonfiction (deep layer) | Must not restate `summary` or `details` claims |
| `details` | Expository deep-dive (dates, people, significance) | Must not restate `summary`, `story`, or fact-sheet claims |

Redundancy is **approximated by lexical overlap** (`LAYER_REDUNDANCY`) — a triage
heuristic, *not* a claim-level verifier. Token overlap cannot prove two fields state
the same claim: long fields dilute a repeated sentence, short fields over-trigger, and
synonyms are missed. It **flags candidates for human review**; entity co-occurrence is
expected and *not* a violation — the summary *should* mention the year and the people.

### Field-level traceability (`fieldTrace`)

Paragraph traces (`storyTrace`) cover the deep-layer narrative only. `fieldTrace`
extends the same idea to the expository surfaces: every factual unit of `fact`,
`why`, `summary` and `details` declares the claim ids that back it.

```jsonc
"fieldTrace": {
  "fact":    [["C010"]],
  "why":     [["C011"]],
  "summary": [["C012","C016"], ["C013"], ["C010"]],
  "details": [["C004","C005"], ["C004","C005"], ["C014"], ["C015"], ["C016","C006"]]
}
```

- **Unit = sentence** for `summary`/`details` (prose), **the whole line** for
  `fact`/`why` (single lines by contract).
- **`[]` means "declared reconstructed/invented"** — the same convention as
  `storyTrace`, and an explicit declaration rather than an evasion: the gate reports
  it (`FIELD_TRACE_EMPTY`, info) so a reviewer sees exactly what to inspect.
- **A claim may back several units; a unit may cite several claims.**

Rule ids: `FIELD_TRACE_MISSING` (error on new curated content, warning when
grandfathered), `FIELD_TRACE_COUNT`, `FIELD_TRACE_SHAPE`,
`FIELD_TRACE_UNKNOWN_CLAIM`, `FIELD_TRACE_DUPLICATE_CLAIM`,
`FIELD_TRACE_UNSUPPORTED_CLAIM` (cited claim has no verbatim quote), plus the
`FIELD_TRACE_EMPTY` info finding.

**Scope.** The rule applies to events that *have* claims — with no claims there is
nothing to trace against, and demanding a trace would be vacuous (it would warn on
every unclaimed event in a grandfathered deck). *Whether a story-bearing event ought
to carry claims at all* is separate, and still open.

**What it does and does not prove.** This is *declared provenance*, not semantic
entailment. A unit is not true because it cites a claim; the declaration says only
"someone asserts this unit rests on these facts". Lexical verification (the claim's
quote is in the source), structural verification (counts and ids), and semantic
verification (does the prose actually say what the claim says?) stay separate — and
the last one is human.

**Sentence splitting is a shared contract.** The gate and the renderer both split
text through `lib/text.mjs` (`paragraphs`, `sentences`). It uses `Intl.Segmenter`
with a normalisation pass in front, because Node's ICU splits on `c.` (*circa*) and
on common abbreviations — `Dr.`, `No.`, `e.g.`, `B.C.` — that our prose uses
constantly. Counts are always reported, so an author can reconcile a mismatch; but a
disagreement about where a sentence ends is a normalisation bug to fix, not a content
bug to argue about.

### Universal event schema (CC is one instance)

**Core fields (always):** `id`, `title`, `year` (**nullable** — events without a
year use `sortYear` for ordering), `yearEnd` (ranges), `circa`, `fact`, `who`,
`where`, `why`, `emoji`, `lat`, `lng`, `area`.

**Grouping fields (only as the deck spec declares):** any stored field a deck
chooses to group by — e.g. `category`, `continent`, or a curriculum-specific
field such as `week`. The generator emits exactly the fields the declared groups
need, and **only** those.

**Ordering:** default is **by year** (`sortYear` when `year` is null). A
curriculum deck may override with a custom order (CC's `songOrder`/`week`) —
that is the exception, not the default.

**Groups are declared in the deck spec, not hard-coded.** Common defaults:
`category` (stored field), `continent` (stored field), `era`/`age` (derived from
`year` via `ageBucket`). Curriculum-specific groups (e.g. CC `week`) are options.
The generator emits the stored fields and builds the deck's `filters` array from
the declared groups.

### Date & uncertainty policy

- **`sortYear` is the canonical ordering value.** The game sorts **exclusively by
  `sortYear`** — there is no runtime fallback to `year`. For ordinary events `sortYear`
  equals `year`; for null-year or approximate events it is an **editorial placement
  value**. Validation requires `sortYear` wherever ordering is needed.
- **Display is separate from data.** Store machine values (`year`, negative for
  BCE); *display* them conventionally ("c. 2560 BCE", "14 October 1066").
- **Precision and certainty are *derived*, not stored:** precision is `range` when
  `yearEnd` is present, else `year`; certainty is `approximate` when `circa`, else
  `known`. Never imply more precision than the source supports.
- **Certainty** (`confirmed` | `approximate` | `disputed`): `circa` marks
  approximate; disputed dates must be labelled, not asserted.
- **Ranges** use `yearEnd` (e.g. Middle Ages 450–1500); display as a range.
- **Rule:** no false precision — if the source says "circa", the UI says "c.".

### Deck versioning & revision

- **`schemaVersion` in every deck** — the app knows the expected format.
- **A `revision` number per deck**, bumped on every content change.
- **Cache-busting is mandatory:** deck scripts load with `?v=<revision>`
  (`decks/world-history.js?v=3`). A simple revision number is sufficient for a
  no-build project — content-hash filenames are more tooling than needed.
- **Keep the previous revision** for rollback; revalidate after any rollback or
  source-sensitive change.
- **Per-deck changelog:** a dated note of what changed and why (auditability).

> Known bug: `loadExternalDecks()` currently injects deck scripts **without**
> `?v=`, so returning players can receive stale decks (observed 2026-09). Fix
> when adding the `revision` field.

---

## Deck package format

> One format, **two transports**: a **folder** (bundled with the game / served
> by the static host) and a **zip** (later, for distribution and cloud
> delivery). The folder is the **source**; the zip is an **artifact built from
> it** — never a second source of truth.

Decks ship today as a script-tag global in `decks/*.js`. The package format is
the shape they move to: a deck is a **folder**, loaded identically whether it
arrived bundled or unpacked. The precedent is everywhere — Minecraft resource
packs, VS Code extensions, npm packages, Obsidian plugins and Chrome extensions
all ship **one folder and one packed artifact built from one source**.

| Transport | Role | Built from |
|---|---|---|
| `decks/<id>/` folder | the **source**; bundled and served by the static host | authored |
| `<id>.timedeck` zip | the **artifact**; distribution / cloud delivery (deferred) | the folder |

### Layout

```
decks/<id>/
  manifest.json   # package manifest (authored)
  deck.json       # deck data (authored)
  LICENSE         # optional
  assets/         # optional; images/, audio/ … (media lives here when a deck has it)
```

Only `manifest.json` and `deck.json` are required; `LICENSE` and `assets/`
appear only when the deck needs them.

### Naming rule

| File | Authored? | Job |
|---|---|---|
| `decks/index.json` | **generated** | the index of bundled decks the game discovers |
| `decks/<id>/manifest.json` | **authored** | the package manifest for one deck |

Two similarly-named files with two different jobs. The index is written by the
tooling and never hand-edited; the manifest is the author's declaration for one
deck. **Never confuse the two.**

### Package manifest fields

| Field | Type | Required? | Purpose |
|---|---|---|---|
| `formatVersion` | integer | **yes** | the format **epoch** — incremented when this spec changes |
| `id` | string | **yes** | the deck id; **must equal the directory name** |
| `name` | string | **yes** | user-visible deck name |
| `version` | string | **yes** | the **user-visible content version** of the deck |
| `entry` | string | **yes** (default `deck.json`) | the deck-data file the package loads |
| `license` | string | **yes** for decks bundling third-party media | SPDX expression for the package |
| `description` | string | optional | short package blurb |
| `attribution[]` | array | optional | per-asset credit (see below) |
| `assets[]` | array | optional | the asset paths the deck uses |
| `grandfathered` | boolean | optional | **legacy-only**, pipeline use: marks a deck not yet migrated to the package format |

> **`formatVersion` is not `schemaVersion`.** `formatVersion` versions the
> **package** (folder layout + this manifest); the deck's `schemaVersion`
> versions the **deck-data shape** inside `deck.json`. A package can be
> reformatted without the content schema changing, and vice versa. They move
> independently and must never be conflated.

### `attribution[]` entry shape

One entry per **third-party asset**, so a redistributed deck carries its credits
with it:

```json
{ "asset": "assets/theme.mp3", "author": "…", "source": "…",
  "license": "CC-BY-4.0", "licenseUrl": "https://…" }
```

`asset` (document-relative) is required; `author`, `source`, `license` and
`licenseUrl` carry TASL-shaped credit so the licence is checkable.

### Versioning: three concepts, never conflated

| Concept | Field | Owner | Job |
|---|---|---|---|
| Package format epoch | `formatVersion` | manifest | **parse gate** — the loader refuses a package it does not understand |
| User-visible release | `version` | manifest | the release a person sees |
| Content hash | `revision` | **generated index** | change detection / cache-busting; used as `?v=<revision>` |

`revision` is **computed from the content** by the generated index — authored by
neither the manifest nor the deck. Three distinct questions: *can this runtime
read it?* (`formatVersion`) · *what release is this?* (`version`) · *have the
bytes changed?* (`revision`).

### Paths

Every asset reference is **document-relative** (`assets/theme.mp3`), resolved
against the file that names it.

- **Never root-relative** (`/decks/…`). A leading slash breaks under a GitHub
  Pages **sub-path** and inside a **zip**, where the folder is not the site root.
- **Never use `<base>`.** It rewrites every relative URL in the document —
  including ones the game core does not own — and behaves differently from a
  sub-path to an unpacked archive.

### Declarative filters

JSON cannot hold a `get` function, so a packaged deck cannot ship the inline
closures a classic script deck passed. Filters and group strategies therefore
**declare** how to bucket an event and the runtime **resolves** it. The
vocabulary is closed:

| Declaration | Means |
|---|---|
| `{ "field": "<eventField>" }` | bucket by a stored event field (e.g. `category`, `continent`) |
| `{ "strategy": "ageBucket" }` | bucket by derived age, from `sortYear` |
| `{ "strategy": "eraBucket" }` | bucket by derived era |
| `{ "strategy": "continentGeneral" }` | bucket by continent, with the general bucket |
| `{ "strategy": "none" }` | no filtering group |

A classic-script deck may still pass a **real function** — that path is not
removed. The **resolver** lives in `events-data.js` (`resolveGet` /
`normaliseDeck`), so both shapes normalise to one runtime form.

### Deferred (not implemented)

- **Packaging** — the `.timedeck` zip and its build step.
- **Media handling** — copying, optimising or validating assets beyond the path rules above.
- **Signatures** — cryptographic signing of packages.

---

## 4. The pipeline (author-time)

Think "careful school report": give the AI one book, make it work only from that
book, check the facts, then a person approves.

1. **Retrieve + freeze the source.** One source per event (usually the matching
   Wikipedia article). Pin a specific revision, save a snapshot in
   `content/sources/`, and record `revid`, `sha1`, timestamp, permalink, license.
2. **Extract atomic claims.** Split **every field** (`title`, `fact`, `who`,
   `where`, `why`, `summary`, `story`) into individual claims (date, number,
   name, place, quote, superlative) — never verify a paragraph as one unit.
3. **Lexical consistency checks first.** Confirm that dates, numbers, and
   identified entities in the draft are present in the frozen source —
   **normalized** (case, Unicode, punctuation, accents) and with **aliases**
   (e.g. `Jinnah` / `M. A. Jinnah`, `Muhammad Ali Jinnah`). This is *lexical*
   matching only: it does **not** prove the source supports the sentence (the
   source may mention two dates; a name may appear only in a bibliography; cause
   and effect may be reversed). Unmatched or ambiguous items are **flagged for
   review**, not auto-rejected.
4. **One local faithfulness detector.** Does the source support each sentence?
   A second, independent signal (NLI entailment) is optional — see §6.
5. **Generate only from approved claims.** Compose the player-facing prose using
   only claims that passed. (Stronger than "generate, then verify": it prevents
   drift by construction.)
6. **Deterministic validator + readability.** Enforce in
   `scripts/validate-content.mjs`: normalized entity matches (flag on ambiguity),
   causal-language block, source present, and the **claim-risk source-count
   policy** (§5). Treat readability as a **range filter**, not proof of quality,
   and pair it with the editorial checklist below.
7. **Human review + auditable provenance.** A person approves each summary once.
   Record the source revision, source hash, model and verifier versions,
   reviewer, review date, and a content hash; commit it (**Git + SHA-256**). Add
   cryptographic signing **only** once signing-key management (storage, rotation,
   verification) exists.

**Detectors flag *unsupported* text, not *false* text.** A claim can match the
source yet still be wrong (and the source itself can be wrong). Treat scores as a
**review-triage signal**, never an automatic publish gate.

### Drafting is pluggable (the draft contract)

Only the drafting steps (claims extraction, cross-check, draft, fact-tighten) need
an LLM. Everything verifiable — source freeze, deterministic validators, the
local faithfulness detector, license gates, provenance — is pure code. So
**drafting is a swappable stage behind a draft contract** (a JSON schema), and the
gates are identical regardless of who drafted:

```
draft contract (JSON schema)
   ├─ drafter: an agent (e.g. a coding agent)   → drafts/<deck>.json
   ├─ drafter: the API (DeepSeek / OpenAI)      → same shape
   └─ drafter: a human                          → same shape
        ↓
verify.mjs (code) → gates + review artifact → human review → merge
```

- **Agent-drafted is a first-class path:** the agent produces the draft JSON; no
  API key is needed anywhere in the pipeline (the detector is local).
- **API-drafted is the reproducible path:** scriptable, schema-enforced, and — at
  this volume — effectively free (fractions of a cent per deck).
- **Trade-off:** agent drafting gives better prose and judgment on hard content
  but is not reproducible or CI-able; API drafting is reproducible but less
  nuanced. Recommendation: draft pilots and hard cases with an agent, production
  with the API — switchable without rewriting anything.
- **`generate-deck.mjs` accepts a draft**, rather than mandating an LLM call. (If
  the agent harness exposes a scriptable CLI/API, it can be wired in as just
  another drafter backend.)

### Implementation status (2026-09-13)

The **verification core is built and tested**: `tools/content-pipeline/`
(`schema/`, `registry/`, `lib/`, `verify.mjs`, `verify-all.mjs`,
`fetch-source.mjs`, `provenance.mjs`, `review.mjs`; **45** `node --test` tests,
no keys, no network). It is wired into `npm run validate` as
`validate:pipeline`.

**Built:** the draft contract (schema + claims + claim grounding), the source
allowlist and fail-closed license gate, the source pin/snapshot fetcher
(`fetch-source.mjs` → numeric `?oldid=` revision), the deterministic rule set,
the per-deck gate (`verify-all.mjs`), the **review packet** (`review.mjs` →
self-contained HTML), and the provenance ledger.

**Backfilled:** the **8 pilot events** (telescope, penicillin, moon, magna-carta,
columbus, beethoven, pyramids, aqueduct) now carry pinned Wikipedia sources —
`content/sources/*.txt` with numeric revisions — and pass grounding. The
remaining events are *staged* as **grandfathered**, so `SOURCE_MISSING` is a
warning (not an error) until their sources are added.

**Deep-layer UI (built):** a "Read the Story" control renders **only when an
event has a `story`** (no dead affordance), on the post-placement surfaces that
own the action — the **in-game result card**, the results rows, and the library
rows. It is deliberately **not** inside a fact sheet (those are `role="tooltip"`,
which must not contain interactive content) and **not** on the pre-placement
prompt card (which would leak the year). The signifier is a **trailing arrow, not
a caret** — a caret means "expands in place" (NN/g), whereas this opens a separate
window; the control carries `aria-haspopup="dialog"` + `aria-controls`, and its
accessible name includes the event title so repeated controls on a list stay
distinct. It opens the **fact-sheet window grown**: a native `<dialog>` that opens
at the fact sheet's **exact rectangle** and animates its **box**
(`left`/`top`/`width`/`height`) to full screen — animating the box (not a
transform or clip-path) is what makes the **text reflow** as the window widens.
The **fact sheet is retained** (summary + who/where/why + map) with the story and
the "More details" section **appended beneath** it, plus a source credit. The
panel uses the **same frosted glass as the result cards and the tooltip** (it is
never an opaque fill) — verified byte-identical computed `background-image` and
`backdrop-filter` — with the same opaque fallback under
`prefers-reduced-transparency`. The scroll container spans the **full panel** (the
reading column is constrained inside it, not by the scroller), `overscroll-behavior:
contain` stops scroll chaining, and the page behind is scroll-locked via
`html:has(dialog[open])`. **The story states what it is, at the head of the story
block** — a line derived from `storySource`: *"Retold from the sources below"*,
*"Adapted from the sources below"*, …, *"An imagined story, based on the sources
below"* for `invented` (styled as a disclosure), *"Written for this game"* for
`original` — never the vague "based on a true story". Attribution is a **structured
sources table** titled
neutrally **"Sources"** (the sources back the whole panel), with `Source | Used for`
columns, each source naming author + title + publisher + licence (CC's TASL) and,
where versioned, the **pinned revision** as a checkable `?oldid=` link. The
relationship is stated **with the story** — an **oval label** (*"Retold from the
sources below"*) under the *"The Story"* heading. The **story prose is marked by a
rule down its left side** (the Story-of-the-World device; the labels sit above it,
unruled) — the game stays single-typeface — so narrative and reference read as
distinct classes
of content. Invented stories additionally
carry a `<details>` *"What's real in this story"* note. The sources table closes with
a **`Changes:` line** (CC's "indicate if changes were made") — a statement about the
adaptation, so it stays one line however many sources are listed. A story cannot ship
without a relationship (`STORY_SOURCE_MISSING`), nor a source without a `usedFor`
(`SOURCE_USEDFOR_MISSING`) — both hard gate errors; omitting the changes note warns
(`CHANGED_MISSING`).
Focus moves to the heading on open and returns to the opener on close; Escape and
the backdrop are handled by the browser; Back contracts the panel to its origin
rectangle, then closes; the back control is top-left on desktop and a thumb-zone
bottom bar on mobile; the motion is skipped under reduced motion.

**Not yet built:** the drafting backends themselves (agent / API).

### Readability editorial checklist

Readability formulas distort on short texts, names, dates, abbreviations, and
quotations. Use the score as a range check, and also check by hand:

- average sentence length is short;
- no unnecessary jargon; unfamiliar names are briefly explained;
- concrete wording, not vague abstraction;
- no age-inappropriate detail;
- uncertainty is not written as certainty.

### Implementation patterns (verified from repos, 2026-09-14)

Borrowed from `devbyomar/history-tales-script-generator` (README declares MIT at
lines 411–413; **no LICENSE file** anywhere in the tree and GitHub's licensee reports
`license: null` — so **reimplement, do not copy expression**) and `data2story-skill`.
Modules live under `history_tales_agent/` (`nodes/cross_check.py`,
`nodes/fact_tighten.py`, `validators.py`, `narrative/lenses.py`).

> **Corrections (2026-09-14).** A second pass over the repo found five errors in this
> section as first recorded. They are fixed below and called out because this section
> is cited as "verified from repos": (1) `hard` **does not block** the pipeline;
> (2) there are **14 validators, not four**; (3) the `consensus_vs_contested` trigger is
> `conflicting_info`, not the `Contested` label; (4) `recommended_treatment` has **no
> enum**; (5) `ESSAY_BLOCK`'s entity test needs **two** capitalised words.

**Claims model** (`state.py`): each claim carries `claim_id` (`C001…`), `claim_text`,
`source_name`, `source_url`, `source_type` (Primary/Secondary/Derived), `confidence`
(High/Moderate/Contested), `cross_checked`, `date_anchor`, `named_entities[]`,
`quote_candidate`, `script_language`. Extraction is one batched LLM call, capped at
**5 sources × 6000 chars** and **50 claims**. We strengthen this: their
`quote_candidate` is a boolean hint, whereas our `claims[].quote` must appear
**verbatim** in the frozen snapshot.

**Cross-check** (`nodes/cross_check.py`) — **100% LLM, no deterministic component.** One
`call_llm_json` at `tier="fast"`: claims (cap 30) × up to 10 corpus excerpts (2000 chars
each, joined and truncated to 8000). The contract returns `confidence_after_check` and
free-text `conflicting_info`.
- The `consensus_vs_contested` bucket is triggered by **non-empty `conflicting_info`**,
  *not* by the `Contested` label. A claim labelled Contested with no conflict never
  enters it; a Moderate claim with conflict does.
- `recommended_treatment` has **no enum** — free text. `"Note disagreement"` is only the
  fallback when the field is missing.

Downstream, `confidence` is **overwritten** by the LLM's value and generation filters
`if c.confidence in ("High","Moderate")` — contested claims are **excluded**, not
downweighted. **We do not adopt this step** (non-deterministic and unconstrained).

**Two-stage generation with trace tags** (`nodes/fact_tighten.py`): Stage A drafts from
verified claims; Stage B rewrites appending hidden tags per paragraph —
`[Beat Bxx | Claims C001,C012]` — stripped via `extract_trace_tags()`. Untraceable text
is tagged **`C000`**, which *silently hides* what our `["?"]` surfaces. An **85%
word-count floor** falls back to the draft if the model summarised instead of tightening.

**Deterministic validators** (`validators.py`) — **14 functions / ~20 rule codes**, not
the four first recorded. All are pure regex/set/arithmetic; none calls an LLM. Split
into a pre-script gate (outline word-sum, open loops, tension, twist distribution,
timeline) and a post-script gate (word count, entity provenance, rehook cadence, essay
blocks, sentence length, fact repetition, exposition drift, anti-poetic). The four we
had recorded, corrected:
- `ENTITY_NOT_IN_CLAIMS` — every named human must appear in verified claims or beats.
  **Rejected by us** (see the fork note below).
- `WORD_COUNT_UNDER/OVER` — strict bounds (`min_words=1674`, `max_words=2046`).
- `ESSAY_BLOCK` — a block of **≥60 whitespace-delimited words** with no named human, no
  sensory token and no decision verb. The entity test needs **two capitalised words**, so
  a single-word name like `Meryt` is invisible to it; the sensory/decision lists are
  war-documentary vocabulary (`blood`, `stench`, `scream`) lacking `water`, `stone`,
  `sun` and lacking `found`, `went`, `stood`, `carried`.
- `FACT_REPETITION` — stopword-filtered 4-grams repeated > 2×, whole-script; our
  `LAYER_REDUNDANCY` is the cross-field analogue.

Plus `EXPOSITION_DRIFT` (>3 consecutive exposition blocks, same three tests),
`SENTENCE_OVER_LIMIT` / `SENTENCE_AVG_HIGH` (25 / 20 words), `REHOOK_GAP`,
`OPEN_LOOP_UNRESOLVED`, `TENSION_*`, `TWIST_*`, `RETENTION_NEW_ENTITY`,
`ANTIPOETIC_*` (7 regexes), `TIMELINE_*`.

**Severity labels are advisory, not enforcement.** `severity` is `"hard"`/`"soft"`, and
`"hard"` only sets `ValidationReport.passed=False` — the nodes log the issues and
**proceed**. `hard_guardrails.py` says so in its own docstring: *"The pipeline proceeds
regardless."* Their README's claim that hard failures block is **not implemented**. Our
`error`/`warning`/`info` differs in kind: `error` genuinely fails the gate.

**Narrative Lens Registry** (`narrative/lenses.py`): **28 lenses**, each a frozen
contract (`scene_priorities`, `tension_patterns`, `preferred_artifacts`,
`forbidden_moves`, `hook_templates`) plus four universal rules (lenses never override
facts; never invent internal thoughts; never suppress uncertainty; avoid POV whiplash).
The `forbidden_moves` split into two kinds, and only one is ours to borrow:
- **Structural** — worth mining for `devices.json`: `logistics` *"turning logistics into
  dry exposition"*; `bureaucracy` *"making bureaucracy boring — every stamp is a
  decision"*; `couriers` *"treating the courier as a plot device"*; `journalists`
  *"treating the journalist as omniscient narrator"*; `reconstruction` *"triumphalist
  rebuilding narrative"*; `recovery` *"false closure"*.
- **Documentary doctrine** — rejected. Eight lenses forbid *"Inventing …"* characters
  (`children`: *"Invented child characters"*; likewise `civilians`, `families`, `medics`,
  `pow`, `spies`, `enforcers`, `partisans`). Their system is a hard anti-fabrication
  documentary system; ours deliberately permits declared composites.

> **The fork is structural, not a tuning difference.** `ENTITY_NOT_IN_CLAIMS` plus
> `fact_tighten`'s *"REMOVE fabricated names … replace the name with a role description"*
> would **block the `pyramids` story outright** — Meryt appears in no claim. We resolved
> this deliberately (§"Name your people"): declared in `characters` = allowed; undeclared
> = `GROUNDING` warning. Any future borrowing from this repo runs through an explicit
> adopt/**reject** table, never adopt alone.

**Ported: `ESSAY_BLOCK` + `EXPOSITION_DRIFT`** (2026-09-14) as one shared predicate in
`lib/rules.mjs` (`checkExposition`), warning-level. The test: a block of **≥45 words**
with no **actor**, no **sensory** token and no **action** verb has stopped telling a
story and become an essay. It is the deterministic proxy for the "directionless prose"
failure — it cannot judge whether a story is *good*, only whether a block is still
narrative at all. Four deliberate departures from their implementation, each because
theirs misbehaves on our register:

1. **Actor test is `characters`-aware.** Theirs requires **two** capitalised words, so
   `Meryt` — a declared composite — was invisible to it. Ours matches declared names by
   substring, and allows a personal pronoun **only when the event declares a cast** for
   it to refer to. Without that gate the rule is near-vacuous on pronoun-led narrative;
   with it, a castless abstract block still fails. `it`/`its` are excluded (they usually
   stand for a thing, not an actor).
2. **Our own vocabularies.** Theirs are war-documentary (`blood`, `stench`, `scream`)
   and lack `water`, `stone`, `sun`, `found`, `went`, `stood`, `carried`.
3. **Threshold 45, not 60.** A 60-word block is a fifth of a 300-word story.
4. **Warning, not their "hard"** — which anyway does not block (see above). Its inputs
   are word-lists: same stance as `LAYER_REDUNDANCY`, a triage flag, not a verifier.

**Honest limit:** on current content it fires **never** (373 warnings before and after).
Our prose is pronoun-led and its actors are declared, so the guard is *preventive* — a
check against drift, particularly once machine drafters write stories — not a scorer.
An empirically-fragile rule is worth having only if it is described as what it is.

**Story readability — now checked** (2026-09-14). `READABILITY_BAND` graded only
`summary`, so a story could read at grade 12 and nothing would say a word. Measured on
real content, the story is *fine on average* (grade 4.1) while hiding a **37-word
sentence** — the general problem with Flesch–Kincaid: it averages, so it cannot see
outliers, and on short texts dense with proper nouns, dates and quotations it distorts
(hence the editorial checklist's "use the score as a range check"). The story now gets
three checks that earn their place differently:

| Rule | Catches | Band |
|---|---|---|
| `STORY_READABILITY` | **drift** — a drafter producing grade-10 prose | FK grade outside 3–7 |
| `SENTENCE_OVER_LIMIT` | **outliers** — the defect an average cannot see | any sentence over 30 words |
| `SENTENCE_AVG_HIGH` | the "plain language" floor | story average over 18 words |

Band rationale: ages 8–11 are grades 3–5, and the story is typically **read aloud** by an
adult — comprehension of read-aloud text runs ~2 grades above a child's independent
level, which is also the slack FK needs for its inflation on names and dates. Hence 3–7:
a range check, not a target. The per-sentence limit is deliberately loose (30) because
our longest *legitimate* narrative sentence is 25 words, and the failure mode that
matters is the one FK hides.

**It fired on the first run.** `pyramids` sentence 6 — *"Her father was away on the
boats that brought the fine white limestone down the river from Tura, and she wanted to
be able to tell him, when he came back, that the water had gone round"* (37 words) — is
a real defect the grade-4.1 average had concealed. Gate: 373 → **374** warnings, all of
it earned.

**Measured, for reference:** `pyramids` story FK 4.1 / avg 14.2 / max 37; `summary` FK
4.1; `details` FK 9.3 / avg 20.6 / max 35.

**`details` is deliberately ungraded — decided 2026-09-14.** One band across every
surface would force the reference layer down to the story's level, which is the wrong
trade. `details` is *supposed* to be denser: it carries reign-dates, dynasties, building
phases and the object's afterlives. Flattening it would make the deep dive worth less.

| Surface | Reader | Band |
|---|---|---|
| `summary` | the child, independently | 3–9 |
| `story` | the child, read aloud | 3–7 |
| `details` | an older reader, or an adult taking the deep dive | **none — by decision** |

What the reference layer owes is **adult accessibility**, not age-banding. The risk this
accepts, stated plainly: a curious 10-year-old who taps through meets grade-9.3 prose.
We judge that an acceptable price for a layer meant to go deeper — **and we have written
the choice down so it cannot later be mistaken for an oversight.** (Same move as the
shallow tier: a gap that is *named* is not a gap that is *forgotten*.)

**Testing note.** ICU's segmenter will not break a sentence before a *lowercase* word
(its abbreviation guard), so contrived fixtures silently merge sentences. Test prose must
start its sentences with a capital, exactly as real prose does.

**Contestedness: a recorded limitation.** We adopted the `confidence: contested`
vocabulary but have **no detector**. Theirs is 100% LLM and therefore not portable into a
deterministic gate. A deterministic replacement (two claims sharing
`(subject, predicate, date)` with conflicting objects) requires **≥2 independent
sources**, and every event currently pins exactly one. So the class of error that C002
("about 26 years") belongs to is **not deterministically detectable today** — it is a
human review item, and plural `sources[]` is the prerequisite for making it mechanical.

**Evidence viewer for review** (data2story `inspector`): every sentence in the
story/details traces to its claim IDs; a self-contained `viewer.html` (works on
`file://`, no fetch) shows the chain — 🔍 toggle, sentence IDs as superscripts,
click-to-scroll both ways. This is the human-review packet's visual layer.

---

## 5. Trust model: AI drafts, humans verify

- **AI is the drafting tool, never the source of truth.** Grounding comes from the
  pipeline (frozen source → constrained generation → checks → human sign-off),
  not from the model.
- **The corpus is small** (~a few hundred events), so verifying every summary
  once is practical — and more defensible than trusting a score.
- **One approved source per ordinary event; two independent approved sources for
  risky claims.** Ordinary dates, places, and basic descriptions may rest on **one**
  source. **Numbers, casualty figures, superlatives ("first / only / largest"),
  disputed facts, and causal claims require two independent sources.**
- **"Independent" is defined, not assumed:** two pages that copy the same wire report
  are *not* independent; a source that merely cites the first is *not* independent; a
  primary record **plus** an independent scholarly or institutional source **may**
  count. Independence is a **review judgement recorded in provenance**.
- **The source-count rule is enforced, not advisory** — wire it into the
  validator by claim type (see §4.6).
- **Keep the receipt.** Frozen source + revision + reviewer + date make every
  claim re-checkable and let you show provenance to a sceptical parent or auditor.

---

## 6. Tooling (permissive licenses — verify at pin time)

All picks below are permissively licensed and run locally. **Author-time only** —
none of this ships in the game. Licenses and model cards change; the register
below records status at a point in time and must be re-checked when pinned.

| Stage | Pick | License |
|---|---|---|
| Fetch + pin source | MediaWiki Action API `prop=revisions` (revid + sha1 + content); REST `/page/summary/{title}/{rev}` | content CC BY-SA 4.0 |
| Parse wikitext (optional) | `mwparserfromhell` | MIT |
| Readability (Node) | `text-readability` | ISC |
| Readability (Python, cross-check) | `textstat` | MIT |
| Structured output | provider `json_schema` + `ajv` + `jsonrepair` | MIT |
| Faithfulness detectors | `LettuceDetect`; `HHEM-2.1-Open`; `MiniCheck` `lytang/*` checkpoints | MIT / Apache-2.0 |
| Entailment (optional) | DeBERTa-v3 NLI cross-encoders (ONNX → Node via Transformers.js) | MIT / Apache-2.0 |
| Citation check | `citations` (verifies quoted passages resolve) | MIT |
| Provenance | Git + SHA-256 (via `node:crypto`) | — |

### License register (fill before calling the stack commercial-safe)

```json
{
  "name": "exact-project-name",
  "repository": "owner/repository",
  "version": "tag-or-commit",
  "checkpoint": "exact-model-id-if-applicable",
  "code_license": "…",
  "model_license": "…",
  "dataset_license": "…",
  "commercial_use_checked_on": "YYYY-MM-DD",
  "notes": "…"
}
```

Distinguish **known risks** (the avoid list) from **routine confirmations**
(expected-permissive; pin and move on).

### License enforcement (deterministic gates)

Licensing is enforced by gating the **process** (which sources, what
attribution), not the substance (derivative-work judgment can't be automated):

1. **Source allowlist registry** — `fetch-source.mjs` refuses any source not in a
   machine-readable registry (domain + recorded license + rights status).
   Unregistered source = hard fail.
2. **License field required** — every source record must carry a license in the
   approved set (`CC-BY-SA-4.0`, `CC0`, `public-domain`, `cleared`). Missing or
   unknown = hard fail.
3. **Attribution presence** — if the license requires attribution (CC BY-SA), the
   event must carry the attribution fields (source link + license notice);
   missing = hard fail.
4. **Rights status** — recent/copyrighted sources are rejected unless explicitly
   cleared; the rights status is recorded in provenance.
5. **No images by default** — images only from sources cleared for image reuse
   (each image has its own license).
6. **Merge gate** — `npm run validate` fails if any event's provenance fails the
   above; a deck cannot merge into `decks/` without passing.

This is the license register made machine-readable and enforced. Example: a repo
whose README says MIT but has no LICENSE file is flagged `unverified` and refused
until confirmed.

### Candidates to evaluate (status checked 2026-09-12)

Older academic faithfulness models. They are **alternatives, not upgrades** over
the maintained detectors above; verify exact repo + checkpoint before use.

| Tool | Status | Note |
|---|---|---|
| **FactCC** (`salesforce/factcc`) | BSD-3-Clause ✅ | Canonical summary-vs-source check, but **repo archived** (last push 2025-05) |
| FactSumm | license **unverified** | Cited as Apache-2.0; repo/license not confirmed |
| DeFacto | license **unverified** | Repo ambiguous (`microsoft/DeFacto`?); confirm before use |
| WeCheck (`nightdessert/WeCheck`) | license **unclear** | Very low adoption (~30 downloads); not recommended |

### Avoid (not commercially usable as-is)

| Tool | License | Note |
|---|---|---|
| Lynx 8B/70B | CC-BY-NC-4.0 | non-commercial |
| Bespoke-MiniCheck-7B | CC-BY-NC-4.0 | use the MIT `lytang/*` checkpoints instead |
| Jina embeddings v3/v4 | CC-BY-NC-4.0 | non-commercial |
| ClaimBuster | ToS forbids commercial | — |
| `wikitextparser` | GPL-3.0 | use `mwparserfromhell` (MIT) |
| `libzim` / Kiwix | GPL-2.0/3.0 | wrong fit anyway (no per-revision pinning) |
| PyMuPDF / AnyStyle | AGPL | prefer `pdfplumber` / `pypdf` |

No RAG framework (LlamaIndex / Haystack / vector DB) is needed — at this scale
there is one source document per event, so there is nothing to retrieve.

---

## 7. User / AI-generated decks

Today, AI generation is **not in the app**: `generate-events.mjs` is a developer
Node script (needs your `.env` key), and `decks-io.js` only imports/exports JSON
to `localStorage`. The full verified pipeline **cannot** run in-app:

- A static site with no backend **cannot hold an API key** (it would be public) —
  in-app generation needs BYOK or a backend.
- There is **no human reviewer** at runtime.
- The selected detectors are **not currently suitable for reliable browser
  execution** within the game's size, performance, and compatibility constraints
  (some small models can run via WebAssembly/WebGPU, but not these, reliably).
- `localStorage` (~5 MB, iOS-evictable) **cannot reliably store** source snapshots.

### Untrusted content (security rule)

Treat **user prompts, uploaded documents, fetched webpages, imported decks, and
model outputs as untrusted data, never as instructions.** The pipeline must not
follow instructions found inside source material — a fetched page can contain text
designed to manipulate generation (prompt injection). This matters especially if a
future user deck can fetch URLs.

### Status model

| Status | Meaning | Sharing |
|---|---|---|
| `draft` | Generated, not fully checked | Private only |
| `automatically_checked` | Passed automated checks, no human approval | Shareable **with warning** |
| `reviewed` | Human approved, sources recorded | Eligible for curated/featured use |

Curated content is `reviewed`; user/AI decks default to `draft` until they pass
checks, and never blend with curated content.

**Promotion path:** a player may *submit* a deck; if it passes **your** full
pipeline, it becomes `reviewed`. Verification effort stays deliberate (you choose
what to promote) rather than imposed on every user deck.

**Pre-existing caveat:** imported decks live only in `localStorage`, so on iOS they
can silently vanish after ~7 days. Fix persistence (export/import or IndexedDB)
before building on top of it.

---

## 8. Small version plan

Start lean, prove it on a pilot, then expand **only on evidence**.

### v0 — does it feel right? (tiny, no pipeline)

- Add `summary` to **8 carefully chosen** `world-history` events; render in the
  existing post-placement fact-sheet; no link; Node-only.
- Add `story` to the same 8 events; open it via a **"Read the story"** button
  (rendered only when `story` exists) → **full-screen takeover**: content fades
  out fully → swap → fades in (~200ms; short fade under reduced motion), **back
  button top-left on desktop / bottom on mobile**, Escape on desktop, swipe-down
  on mobile, focus + scroll restored to the opener on close.
- Pick events that cover different content types:
  1. a scientific/technological event;
  2. a political event;
  3. a cultural event;
  4. an exploration event;
  5. an ancient-history event;
  6. an event with a well-known person;
  7. an event with a place-based explanation;
  8. an event where the existing `why` text is weak.
- Test desktop + mobile; run `npm run validate`; bump `timeline.js?v=`.

### v1 — the honest loop (one deck)

- **Phase 1 — freeze sources:** `scripts/fetch-source.mjs` pins one Wikipedia
  revision per pilot event → `content/sources/<id>.txt` + metadata.
- **Phase 2 — deterministic checks first:** extend `scripts/validate-content.mjs`
  with normalized entity matching (flag on ambiguity), the claim-risk source-count
  policy, readability as a **range filter**, and a required source entry.
- **Phase 3 — drafting:** draft grounded on the frozen source (provider
  `json_schema`, or hand-written for the pilot) with claim → source-quote mapping.
- **Phase 4 — one detector (optional, evidence-gated):** add **one** faithfulness
  detector; measure against ~30 hand-labelled summaries; add NLI/HHEM only if it
  measurably helps.
- **Phase 5 — review + provenance:** human approves each summary; write the
  **auditable** provenance record; ship.

**Do not start with four neural verifiers.** Deterministic checks + one detector +
human review first; expand on results.

### v2 — deck generation (universal)

- **Deck spec → events:** `scripts/generate-deck.mjs` takes a spec (topic, era
  range, declared groups, worldview) and drafts a full deck in the universal
  schema — year-sorted by default, custom ordering only when the spec asks.
- **Deep layer:** for each event, generate `story` + `details` from the same
  verified claim set (convergent-claims rule), via the two-stage trace-tag
  pipeline (§4).
- **All-field grounding:** every field verified against its frozen source.
- **Layer-contract gate:** claim-level redundancy checks flag for review.
- **Review + merge:** human approves; `npm run validate`; merge into `decks/`.

---

## 9. Non-goals

- No in-game Wikipedia browser or iframe embed.
- No runtime LLM call in the shipped game.
- No RAG framework, vector DB, or backend.
- No third-party runtime dependencies added to the game core.
- Wikipedia is not the presented product — only a source and a citable reference.
- **No third-party analytics, and no personal-data collection.** If analytics are
  ever introduced, a child-privacy review (COPPA and equivalents) is required
  first. Note: COPPA is not triggered merely by being "for kids" — it depends on
  whether the service is directed to under-13s and what personal information is
  collected — but the conservative no-third-party default is the right stance.
  If a metric is needed now, allow only **local, non-identifying aggregate
  counters that never leave the device**.

---

## 10. Open decisions

1. **Toolchain language:** stay Node-only (`text-readability` + Transformers.js
   ONNX NLI), or allow a small Python verifier service.
2. **Link-out:** ✅ resolved — no link from the kids' play surface (COPPA / Apple
   Kids); external sources live in a parent-facing area.
3. **Reveal surface:** ✅ resolved — summary renders in the existing fact-sheet;
   the story opens in a full-screen takeover ("Read the story").
4. **Images:** include lead images in summaries? (Each has its own license — adds
   provenance work.)
5. **Summary length + reading band:** target words and Flesch–Kincaid grade range.
6. **Story length + voice:** ✅ resolved — `story` targets **400–600 words**; the gate
   warns outside **300–700**. (Voice: see the device registry.)
7. **Deck spec format:** how a generation request is expressed (JSON spec vs
   prompt) — topic, era range, declared groups, worldview, event count.

---

## Version history

- **1.48** (2026-09-20) — **Sources better than Wikipedia; real passages over
  invention.** Three additions from research. (1) §2 gained a **source hierarchy**
  (institutions and reference works first; Wikipedia as a finding aid — *"cite what
  Wikipedia cites"*), with the evidence: Wikipedia's own policy calls it uncitable,
  Rector 2008 measured history articles at **80%** vs **95–96%** for specialist
  references, and the dominant failure is **omission** — worst on niche and contested
  topics. (2) `invented` is **demoted to a last resort** across the story rules, the
  `storySource` table and the device palette. The default is now a **real passage**:
  quoted where one survives, else adapted with disclosure. The worked example's
  framing flipped so the documented narration is the target, not the reconstruction.
  Real voices are justified on **authenticity and defensibility**, *not* a measured
  memory boost — the evidence for that is thin and mixed. (3) Added a
  **"Can I use this passage?"** rights checklist: the age of the event is not the age
  of the text, a **translation is its own work**, unpublished material carries the
  **longest** term, and "primary = free" is false for MLK, Mandela, Churchill, Anne
  Frank and Billy Graham. Safe lanes: US federal works, US publications from 1930 or
  earlier, CC0 open access, and **public-domain translations** (LacusCurtius,
  Fordham's PD-Loeb list; Perseus prohibits commercial use). No schema or code change.
- **1.47** (2026-09-14) — **Disclosure moved out of the prose into a rendered box.** v1.45's
  "mark the time gap" rule made every draft open *and* close with "this scene is imagined" —
  repetition was the predictable result of asking prose to voice one statement twice. Research
  then showed prose is the wrong home regardless: labelling does not change beliefs (Green &
  Brock 2000), warnings before *or* after fail to stop false-fact uptake (Marsh & Fazio 2006),
  and pre-warning can backfire (Eslick 2011) — while the one clean timing result favours
  disclosing **after** exposure (Brashier, *PNAS* 2021). Doctrine now forbids disclosure in the
  story; the product renders one adjacent box after the story from `storySource` + `storyNote` +
  `changed` (head line removed; `changed` moved out of the sources table). Stripped the
  disclosure sentences from all five stories with trace realignment (pyramids −2, homer −3,
  rome-founded −1, alexander −1, aqueduct −4) — which resolved one of pyramids' two
  `STORY_TRACE_UNRESOLVED` warnings, since the disclosure sentence was itself an ungroundable
  claim. Noted the unfixed part: disclosure is for the parent, not the child; only active
  discrimination works. 123 tests.
- **1.46** (2026-09-14) — **`STORY_OFF_EVENT`: does the story dramatise the event?** A
  reviewer noticed *"Traditional founding of Rome"* had a story about archaeology while the
  card reads `who: "Romulus (legend)"` — and two more drafts had the same defect
  (`alexander` told a mutiny four years before his death; `homer` a festival singer rather
  than the poems). Root cause recorded: **our own contract caused it** — it permitted only
  one story-kind, so a legend, a text and a death had no shape to take. Added
  `identityClaims` (declared) + `STORY_OFF_EVENT`, and recorded that the derivation was
  **tried and failed both ways** (pyramids false-positive, rome-founded false-negative).
  Also surfaced `IDENTITY_NOT_IN_FACT`: `pyramids`' `fact` states significance, so its
  headline and identity disagree — the same `fact`/`why` confusion as the 7 restatements,
  from the other direction. First run caught the two real failures and nothing else.
- **1.45** (2026-09-14) — **`details` deliberately ungraded, and the time gap named.**
  (1) `details` gets no readability band *by decision*: one band across all surfaces would
  force the reference layer down to the story's level, and it is *supposed* to be denser
  (reign-dates, dynasties, afterlives). What it owes is adult accessibility, not age-
  banding; the accepted risk (a 10-year-old meets grade-9.3 prose) is written down so it
  cannot be mistaken for an oversight — the same move as the shallow tier. (2) Reading our
  own closing paragraphs surfaced a craft rule: the story is a scene in the *past* whose
  narrator stands in the *present*, and crossing that gap unmarked makes the scene appear
  to assert modern claims. Discovered along the way: **the two `["?"]` warnings and the
  time-gap problem are one defect**, because a sentence asserting an **absence** ("nobody
  wrote it down") can never be quote-backed — *a quote cannot support an absence* — so
  negative claims are ungroundable by construction. Added to `universalRules` (prints in
  every brief); **deliberately not gate-checkable**, since the trace shows the symptom,
  not the cause.
- **1.44** (2026-09-14) — **Story readability is now checked.** `READABILITY_BAND` graded
  only `summary`, so a story could read at grade 12 and nothing would say so. Measurement
  first, and it set the design: the story is fine on **average** (FK 4.1) while hiding a
  **37-word sentence** — Flesch–Kincaid averages, so it cannot see outliers. Added
  `STORY_READABILITY` (grade band 3–7, catching *drift*; wider at the top because ages
  8–11 stories are read aloud and read-aloud comprehension runs ~2 grades ahead),
  `SENTENCE_OVER_LIMIT` (>30 words, catching the outlier) and `SENTENCE_AVG_HIGH` (>18,
  the plain-language floor). It **fired on the first run** on a real concealed defect;
  gate 373 → 374 warnings. Recorded the open question: `details` reads at **grade 9.3
  with a 35-word sentence** and is still unchecked — correct or a gap, deliberately left
  as a decision. 115 tests.
- **1.43** (2026-09-14) — **`ESSAY_BLOCK` + `EXPOSITION_DRIFT` ported** (design, not
  expression) as one shared warning-level predicate, `checkExposition`. A ≥45-word block
  with no actor, no sensory token and no action verb has become exposition. Four
  departures from theirs, each because their version misbehaves on our register: the
  actor test is `characters`-aware (theirs needed two capitalised words, so `Meryt` was
  invisible), the vocabularies are ours (theirs are war-documentary), the threshold is
  45 not 60, and it warns rather than claiming to block. Recorded honestly: **it fires
  never on current content** — it is a guard against drift, not a scorer. 108 tests.
  Also opened the next gap: `READABILITY_BAND` reads only `summary`, so **story
  readability is unchecked by any rule**.
- **1.42** (2026-09-14) — **§6 corrected, and the fork with `history-tales` named.**
  A second read of `devbyomar/history-tales-script-generator` found **five errors in our
  own prior-art notes**, including repeating their README's false claim that hard
  validators block the pipeline (their `hard` only logs; *"the pipeline proceeds
  regardless"*), and "the four validators" where there are **14**. Also corrected: the
  `consensus_vs_contested` trigger is `conflicting_info` not the `Contested` label;
  `recommended_treatment` has no enum; `ESSAY_BLOCK`'s entity test needs two capitalised
  words so single-word names are invisible. Recorded the real fork: their
  `ENTITY_NOT_IN_CLAIMS` + "remove fabricated names" + the `children` lens's *"Invented
  child characters"* would **block `pyramids` outright** — the divergence is structural
  doctrine, not tuning. And recorded the honest limit: contestedness is **not
  deterministically detectable with one source**, so it stays a human review item.
- **1.41** (2026-09-14) — **`storyTrace` is sentence-level**, the one universal fix in
  the GPT review: it needed no new source and no editorial judgement, and it removed a
  contradiction in our own architecture (`fieldTrace` was sentence-level; the story was
  not). Story and fields now share **one validator**, one unit and one set of sentinels.
  Added the third sentinel `["?"]` — an assertion about the world that no claim covers —
  because narrative sentences are not only grounded or invented, and with two tokens the
  only way to express a gap is to cite a claim that does not support it or bury it in
  `[]`. It **warns**, not errors. Suppressed per-sentence `[]` itemisation in stories
  (counted, not itemised) so the trace reports a *defect list* rather than a census.
  Immediate payoff: the false overstatement in `pyramids`' closing paragraph surfaced as
  `STORY_TRACE_UNRESOLVED` instead of hiding behind a C008 citation — and the honest
  ratio changed from `1/9 paragraphs invented` to `16/29 sentences invented, 2
  unresolved`. Revision 15 → 16.
- **1.40** (2026-09-14) — **The spine: a goal-directed episode.** A reviewer read
  the stories as directionless, and the text agreed: the 9 paragraphs of `pyramids` ran
  on "and then" — Meryt wanted nothing, attempted nothing, met no obstacle, resolved
  nothing. Research (Brewer & Lichtenstein 1982; Stein & Glenn 1979; Forster) says the
  unit readers encode is want → obstacle → turn → outcome, with recall following
  cause > then > and; the monomyth is the wrong instrument (built for 90–120 min films;
  contested as a cross-cultural universal). Added `storySpine` (declared, brief-enforced
  via `SPINE_MISSING`/`SPINE_SHAPE`/`SPINE_UNUSED`), a "choose a stake the evidence can
  settle" policy in `universalRules`, and the spine section in `lib/brief.mjs`. Rewrote
  `pyramids` as the pilot: 412 words, and invented paragraphs fell **3 → 1** because the
  documented facts now *move* the story instead of decorating it. Revision 14 → 15.
  Key insight recorded: the original's turn ("twenty-six years", documented) and its
  omniscience error ("she will not see it finished") were the same pressure one sentence
  apart — direction and overreach have one cause.
- **1.39** (2026-09-14) — **Two content tiers declared.** The other seven pilot
  events turned out to have no `story` at all — just a ~50-word `summary` and a lone
  `source` string on the pre-`sources[]` model — so the gate's PASS was implying
  coverage that did not exist: nothing linked their prose to their citation. Rather
  than fake a migration, "shallow" is now a legitimate declared tier. `depth` is
  **derived** (story → deep; summary → shallow; else fact-only), never stored, and the
  gate prints per-deck coverage so PASS cannot be misread. The exposure is enumerated,
  not closed. Also: the world-history deck's `id` is `general` while its file is
  `world-history.js` — flagged, not touched.
- **1.38** (2026-09-14) — **Field-level traceability (`fieldTrace`)**. Claims
  constrained the *story* but not the expository fields, so `fact`/`why`/`summary`/
  `details` could drift from the claims unchecked. `fieldTrace` closes that: each unit
  declares its backing claims (or `[]` for reconstructed material), enforced by seven
  new rule ids. Built `lib/text.mjs` as the shared sentence/paragraph contract; the
  first `Intl.Segmenter` version was wrong twice over (it splits on `c.` and on
  `Dr.`/`No.`), caught by tests and fixed with a normalisation pass. Migrating
  `pyramids` added claims C010–C016 and — by forcing every sentence to cite a quote —
  surfaced two numbers that had drifted from the pinned source ("nearly 3,800 years"
  → "more than 3,700"; "about 4,500" → "about 4,600 years ago"). Deck revision 12 → 14.
- **1.37** (2026-09-14) — **Internal contradictions resolved** (found by an external
  review, all verified): the stale §10 story-length target (≈80–150) removed; the
  date/changed notes dated correctly; `LAYER_REDUNDANCY` described as the lexical
  *heuristic* it is, not "claim-level" (the doc overstated); `sortYear` given one
  invariant (sort exclusively by it, no runtime fallback); "one book per event"
  replaced with "one approved source per ordinary event, two independent for risky
  claims", with **independence defined**; `precision`/`certainty` marked **derived**,
  not stored (they were documented but never in the schema). Code hardening:
  `STORY_LENGTH` message now matches the doc; `contentTokens` is Unicode-aware (was
  stripping accents); `STOP` completed; `checkClaims` rejects duplicate claim IDs and
  empty text.
- **1.36** (2026-09-13) — **`changed` and `storyNote` separated, and the overlap now
  checked.** They had drifted into saying the same thing: `changed` now states only the
  **treatment of the text**, `storyNote` only the **fact/fiction boundary**. New rule
  `META_OVERLAP` (threshold 0.25 — the generic 0.6 missed a real duplication at 0.41),
  with tests both ways. Recorded: extending `LAYER_REDUNDANCY` to these fields did *not*
  work, which is why the dedicated check exists.
- **1.35** (2026-09-13) — **Corrected: invented characters are not an error.** 1.34
  conflated two things — history-tales' `forbidden_moves` against *inventing characters*
  and *family relationships* are **their documentary doctrine**, not our mistakes. We
  deliberately allow declared composites (Meryt, her father — SOW's Tarak and Chin).
  Also fixed the registry rule that would have wrongly barred an invented character's
  inner life: it now targets a **real** figure's interior and unsupported **outcomes**
  ("a scene shows a moment, not an ending"). Our three errors remain: false
  world-claim, unsupported omniscience, unmotivated implication.
- **1.34** (2026-09-13) — **The drafting brief — control moved *before* writing.**
  Second deep look at `history-tales` (README does declare MIT; no LICENSE file).
  Adopted from it: (a) **`registry/devices.json`** — the device palette as *data*,
  each device carrying `forbiddenMoves`, mirroring their Narrative Lens Registry
  ("lenses bias emphasis… never override facts"); (b) **`brief.mjs`** — a per-event
  drafting brief (device, POV, length, the claims and their quotes as *the only facts
  that may be asserted*, the invented cast, the forbidden moves), the pre-generation
  control point our pipeline lacked entirely; (c) a **`format`** field + `FORMAT_MISSING`
  / `FORMAT_UNKNOWN` rules. Their lens library already catalogued our three error
  shapes as `forbidden_moves`.
- **1.33** (2026-09-13) — **Source-drift check.** `check-sources.mjs` (npm run
  pipeline:sources) queries the current revision id of every pinned source and reports
  drift for re-review. The one gap from the GPT review worth acting on: not "dead
  links" (our content is locally snapshotted, so a 404 changes nothing) but **grounding
  drift** — an article revised after we pinned it. Treated as a review trigger, never
  an auto-fix. First run found real drift: `columbus` (Christopher Columbus) pinned
  1373266789 → now 1374739074.
- **1.32** (2026-09-13) — **Paragraph-level traceability**, the mechanism borrowed from
  `history-tales` (per-beat trace tags, stripped for output / kept for audit) and
  `data2story`'s Inspector (traced vs untraced sentences). New `storyTrace` field: one
  entry per paragraph citing the claims that back it, `[]` = invented narrative. Gate:
  `STORY_TRACE` (error on count/claim mismatch), `STORY_TRACE_MISSING` (warning),
  `STORY_TRACE_INVENTED` (info — the review list). The review packet shows
  `6 documented · 3 invented` per event. Residual documented: it cannot judge whether
  an *invented* paragraph is true; it isolates them for human review — which is where
  all three `pyramids` errors were. Added claims C007–C009 so the trace is honest.
- **1.31** (2026-09-13) — **Two more reconstruction errors caught and fixed** in
  `pyramids`: an unsupported omniscient assertion (*"She will not see it finished"* —
  claims a death nothing supports) and an unmotivated implication (*"One of those
  rolls survived. Almost nothing else from the camp did."* — invents a catastrophe).
  Replaced with the record's own facts (the roll was found in 2013 at Wadi al-Jarf,
  dated to Khufu's 27th year). Both failure shapes added to the §3 rule.
- **1.30** (2026-09-13) — **Gap closure.** (a) `pov` renamed **`pointOfView`** and given
  a job — surfaced in the review packet — after research confirmed POV is a
  fundamental narrative property with measured reader effects (1st-person raises
  immersion/identification; Chen & Bell 2022 meta-analysis). (b) **`STORY_LENGTH`**
  warning added: a story outside 300–700 words warns — the rule that would have
  caught the original 110-word "story" mechanically. (c) Inline definitions left to
  `GROUNDING`, which already flags an undeclared unfamiliar name.
- **1.29** (2026-09-13) — **Characters named and declared.** Researched naming: a
  proper name sharply improves a character's prominence in memory vs a role
  description (Sanford/Moar/Garrod 1988; Peracchi 2004), and naming is the children's
  narrative-history convention — so the `pyramids` girl is now **Meryt** (glossed
  in-line). Added a `characters` field (the invented cast): it discloses the
  invention and excludes those names from the grounding check, so an *undeclared*
  invented name still fails `GROUNDING`. Naming rules recorded in §3 (period-fit /
  Tiffany Problem; declare; never voice a real figure).
- **1.28** (2026-09-13) — **"Invented people, not invented facts."** An invented line
  in the `pyramids` reconstruction asserted a *false fact about the world* ("longer
  than anyone she has ever met has been alive" — false for ancient Egypt); corrected.
  Added the §3 rule: a reconstruction may invent people, scenes and dialogue, but not
  claims about the real world — the disclosure covers the people, not the society.
- **1.27** (2026-09-13) — **Story rendered as paragraphs.** The story is stored as a
  single string and split on blank lines into separate paragraphs — it was one
  unbroken wall of text. Break where narrative does (new beat / speaker / actor /
  shift in time or place); vary paragraph length for pace. Formatted to web
  convention: whitespace between paragraphs (1.25em), never a first-line indent,
  clearly exceeding the 1.65 leading inside a paragraph. `pyramids` is now 9
  paragraphs.
- **1.26** (2026-09-13) — **Vignette shipped at length; disclosure moved inside the
  ruled section.** `pyramids` rewritten to a 364-word scene (from 110) — every
  unfamiliar term defined in place (`zau`, "Overseer of Ten") — and the `<details>`
  "What's real in this story" now renders **inside** the left rule with the prose,
  instead of after the details section. The rule wraps the story *content*; the
  section's labels sit above it.
- **1.25** (2026-09-13) — **Story length, pacing and wording researched and specified.**
  Measured SOTW story sections at ~530–1,000 words, matching published grade-3/4
  chapter lengths (500–1,000 / 1,000–1,500) and 6–12 minutes of reading. Added §3
  guidance: target **400–600 words**; the reason scenes cost words ("crafting vivid
  scenes… requires more words than summarizing"); pacing rules (one scene, child
  protagonist, a stake, suspense-and-relief, end on a turn, exposition in the bridge);
  and the inline-definition rule (define at first mention, appositive, one sentence,
  only what's needed).
- **1.24** (2026-09-13) — **Story writing: match the device to the evidence.** Studied
  all four *Story of the World* volumes: the dominant device shifts with the record
  (reconstruction → documentary → quoted primary sources), and the framing disappears
  when it is no longer needed. Added §3 guidance: `story_type` is a **loose label,
  never a template**; a **seven-device palette** to mix freely; a new **`pov`** field
  (`third`/`first`/`second`) as the immersive axis, orthogonal to form; framing written
  **in our own words**. Worked example: `pyramids` written two ways (documented
  narration and framed reconstruction) on identical sources.
- **1.23** (2026-09-13) — **The changes note implemented.** Added an optional `changed`
  field, rendered as a `Changes: …` line **under the sources table** — a statement
  about the adaptation, so one line covers any number of sources. New warning-level
  gate rule `CHANGED_MISSING` (CC requires *indicating* changes; *describing* them is
  the encouraged practice, so it warns rather than blocks). Asterisk footnotes
  evaluated and rejected — unreliable for screen readers, and the relationship label
  already points "below" in words. `pyramids` carries a changes note.
- **1.22** (2026-09-13) — **Rule marks the story prose only; relationship is an oval
  label.** The left rule moved from the whole story block to the prose alone, so the
  *"The Story"* heading and the relationship sit above it unruled. The relationship
  (*"Retold from the sources below"*) now renders as an oval label — the same pill
  treatment as the removed panel badge; `invented` renders it in the warning colour.
- **1.21** (2026-09-13) — **Removed the panel-level badge.** It was redundant (the
  story's own line already states the relationship) and wrongly placed (it sat above
  the factual sections and mislabelled them). The statement now lives where the story
  does — the relationship line at the head of the story block; `invented` renders it
  as a styled disclosure, and `original` as *"Written for this game"*.
- **1.20** (2026-09-13) — **Story marked by a left rule, not a font change.** The
  story block gets a rule down its left side (the Story-of-the-World device) with the
  *"The Story"* label and the *"Retold from the sources below"* relationship line;
  the serif body was reverted — the game stays single-typeface. The table is titled
  neutrally **"Sources"**.
- **1.19** (2026-09-13) — **The story now reads as a story.** Applied the editorial
  rule that different classes of information must look different: the story body is
  set in **serif** against the sans fact sheet and details, under a named
  *"The Story"* section with the relationship line *"Retold from the sources below"*.
  Moved the relationship **out of the table title** (the sources serve the whole
  panel) and retitled the table neutrally **"Sources"**. Recorded the drop-cap
  research (rejected: short, mobile, screen-reader cost) in §3.
- **1.18** (2026-09-13) — **Grounded disclosure & attribution vocabulary.**
  Replaced the overlapping `storyTier` (real/adapted/invented) and relationship
  pair with one `storySource` value — `retold` (default) / `adapted` / `abridged`
  / `paraphrased` / `summarised` / `translated` / `quoted` / `invented` /
  `original` — grounded in schema.org `isBasedOn`, Creative Commons TASL, IFLA
  FRBR/LRM derivation terms and children's-publishing usage ("retold by…"). Added
  structured `sources[]` (author, title, publisher, url, revision, license,
  usedFor) rendered as **one table titled by the relationship** with
  `Source | Used for` columns; dropped the access date. New gates:
  `STORY_SOURCE_MISSING`, `SOURCE_USEDFOR_MISSING`.
- **1.17** (2026-09-13) — **Story disclosure & attribution implemented.** Added
  `storyTier` (`real`/`adapted`/`invented`) to the event schema and a
  `STORY_TIER_MISSING` hard-gate rule (a story cannot ship unlabelled). The tier
  renders as an **explicit badge at the very top of the panel, always visible**
  (above the fact sheet), with attribution worded to match (*From…* / *Adapted
  from…* / *Based on…*); invented stories also get a "What's real in this story"
  `<details>`. `pyramids` is tiered `adapted`.
- **1.16** (2026-09-13) — **Panel scroll + glass parity fixed.** The scroller now
  spans the full panel (the reading column is an inner `.story-col`), so a scroll
  gesture on the glass at either side scrolls the panel instead of the game;
  added `overscroll-behavior: contain` and a `html:has(dialog[open])` page
  scroll-lock. Confirmed the panel's glass is byte-identical to the result cards'
  (same `background-image` + `backdrop-filter`).
- **1.15** (2026-09-13) — **Expansion is a real window grow**: the panel opens at
  the fact sheet's exact rect and animates its box to full screen so the **text
  reflows** (previous version used a clip-path reveal, which did not). The **fact
  sheet is now retained** (summary + who/where/why + map) with the deep layer
  appended beneath, rather than replaced. Panel uses the **same frosted glass as
  the result cards/tooltip** (not opaque), with the matching opaque fallback under
  `prefers-reduced-transparency` / no `backdrop-filter`.
- **1.14** (2026-09-13) — **Affordance corrected**: "Read the Story" moved out of
  the fact sheet (a `role="tooltip"` must not contain interactive content) and
  onto the post-placement surfaces that own the action (in-game result card,
  results rows, library rows). Signifier changed from a caret to a **trailing
  arrow** — NN/g: a caret means "expands in place", which is wrong for a control
  that opens a separate window. Added `aria-haspopup="dialog"`/`aria-controls`
  and a per-event accessible name.
- **1.13** (2026-09-13) — **Deep-layer UI built**: "Read the Story" affordance in
  `factSheetHtml` (only when a `story` exists), opening a native `<dialog>`
  full-screen takeover (fact-sheet stays; story + details beneath; source credit).
  Post-placement surfaces only — the prompt card can't leak the year. Accessible
  by default (focus trap/inert/Escape/return-focus); responsive back control
  (top-left desktop, bottom bar mobile); reduced-motion aware.
- **1.12** (2026-09-13) — **Pilot sources backfilled**: the 8 pilot events carry
  pinned full-article Wikipedia sources (`fetch-source.mjs` now fetches the full
  plain-text extract + numeric revision in one Action API request, with backoff).
  Grounding is wired into the repo gate via `content/sources/`. Sourced events
  pass grounding; the rest remain grandfathered.
- **1.11** (2026-09-13) — **Verification core implemented** (`tools/content-pipeline/`):
  draft contract + claims + claim grounding; SPDX source allowlist with
  fail-closed licensing; source pin/snapshot fetcher; deterministic rules
  (schema, grounding, redundancy, year-leak, readability); repo-wide gate wired
  into `npm run validate`; provenance ledger; 45 tests, no keys/network.
- **1.10** (2026-09-12) — **Drafting is pluggable**: the LLM steps sit behind a
  draft contract with swappable drafter backends (agent / API / human); gates are
  identical regardless. Agent-drafted is a first-class no-API-key path;
  API-drafted is the reproducible path. `generate-deck.mjs` accepts a draft
  rather than mandating an LLM call.
- **1.9** (2026-09-12) — Four minimal additions from the gap review: date &
  uncertainty policy; deck versioning (`schemaVersion` + `revision` + `?v=`
  cache-busting, closes the known stale-deck bug); per-deck changelog + rollback;
  analytics decision (no third-party default, child-privacy review before any
  analytics, local-only counters otherwise).
- **1.8** (2026-09-12) — **Deterministic license enforcement**: source allowlist
  registry, required license field, attribution presence, rights status, no
  images by default, merge gate. The license register becomes machine-readable
  and enforced (unverified sources refused).
- **1.7** (2026-09-12) — **Attribution rules for real/adapted tiers**: specific
  source credit ("From the diary of X, [date], [archive]" / "Adapted from…"),
  never the vague "based on a true story"; credit lives in the end "What's real
  in this story" details; provenance carries source/rights into the UI; rights
  check for recent (possibly copyrighted) sources.
- **1.6** (2026-09-12) — **Story formats & credibility tiers**: `story_type`
  (narrative/diary/letter/newspaper/biography/micro-history/multi-perspective) and
  `credibility_tier` (real/adapted/invented). Disclosure rules for invented tier:
  inline label at top (essential info visible, NN/g), "What's real in this story"
  `<details>` at end (Dear America pattern), no ? tooltip, own-voice rule.
- **1.5** (2026-09-12) — **Deep-layer architecture**: one "Read the story" button
  → takeover with story (narrative) + details (expository) from the same verified
  claims (convergent-claims rule). Implementation patterns verified from
  history-tales (claims schema, two-stage trace-tag fact-tighten, deterministic
  validators incl. FACT_REPETITION as the layer-contract check) and data2story
  (evidence viewer for review).
- **1.4** (2026-09-12) — **Universal deck generator**: year-sorted by default
  (`sortYear` for null-year events); `songOrder`/`week` are curriculum-specific
  overrides, not the default. Groups declared in the deck spec (category,
  continent, era-derived, or arbitrary extras like CC `week`); generator emits
  only the fields the declared groups need.
- **1.3** (2026-09-12) — Scope = **full deck generation** (CC-schema target):
  layer contract (each field's job + claim-level anti-duplication), all-field
  grounding, CC nuances (nullable `year` + `sortYear`, `yearEnd`, `circa`,
  `week`/`songOrder`, `continent` enum), v2 deck-generation phase.
- **1.2** (2026-09-12) — Deep layer = **narrative nonfiction** ("Read the story",
  Story-of-the-World model): no invented facts, disclosure rule for imagined
  detail, button only when `story` exists, full-screen takeover interaction spec
  (fade out/in, responsive back button), link-out resolved to parent-facing only.
- **1.1** (2026-09-12) — Applied GPT review corrections: auditable provenance
  (not "signed"); normalized entity matching + aliases; lexical ≠ semantic;
  source-count policy enforced; license register + softened claims; readability as
  filter; browser-detector wording; untrusted-content/prompt-injection rule;
  three-status model.
- **1.0** (2026-09-12) — Initial plan.
