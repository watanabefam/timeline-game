# Timeline Game: the two content backlogs — plan

> Plan for the two things the content gates cannot currently close on their own:
> the **pronunciation backlog gate** (`npm run validate:backlog`) and the **321
> unsourced events** (`content/sourcing-backlog.json`). Both are *ratchets*: the
> number is honest, the ceiling holds, and the work is content research rather
> than code. This doc records what the outside evidence says, then sequences the
> work so each slice has a falsifier.
>
> **Last updated:** 2026-10-02 (v1) | **Status:** proposed — no slice ratified.
> Companion docs: `doc/CONTENT_PIPELINE.md` (the sourcing policy and schema),
> `tools/content-pipeline/README.md` (what the gate encodes),
> `AGENTS.md` rules 5–6 (how the ratchets work), and `doc/COMMERCIAL_PLAN.md`
> §7 (why sourcing — not access — is the commercial asset).

---

## 1. The two problems, measured

| # | Problem | Where it is recorded | Current state | Why it is red / open |
|---|---|---|---|---|
| A | **Pronunciation backlog gate** | `tools/narration/pronunciation-backlog.json`, checked by `npm run validate:backlog` | 138 open words, ceiling 138 — the data is *correct* | The gate cannot be **derived** in a workspace without `tools/narration/node_modules`. `triageAll()` degrades silently to spelling-only, so the derived count is 0 and `--check` calls the committed 138-word file "stale" — a message that points the reader at a command (`gen:backlog`) which would **overwrite** it with the empty file. |
| B | **321 unsourced events** | `content/sourcing-backlog.json`, checked by `npm run validate:sourcing` (passing, at its ceiling) and `npm run validate:pipeline` (red: 80 errors, 201 warnings) | 0 of 321 events carry a `source` | No event anywhere has a registered source. `validate:sourcing` *passes* because the ceiling equals the count — the number is bounded and visible, not fixed. `validate:pipeline` is deliberately outside the always-green chain and reports the honest 80 errors for the two *unflagged* decks. |

The two are different in kind. A is a **defect in a gate** (it reports the wrong
thing when it cannot run). B is **missing content** (no code change closes it).
The plan therefore has two shapes: fix the gate's honesty, then run a
content-research program behind the ratchet that already exists.

---

## 2. What the research says

### 2.1 A check that cannot run must never report clean (fail-closed)

The general principle is established and applies directly: **fail-closed** means
an unavailable or errored check *denies* rather than *allows*, because the
protection the check provided is gone for as long as it is down. [S1][S2][S3]
`AGENTS.md` rule 5 already states the project's own version of this for
`validate:backlog`: "a gate that cannot run must never report clean." The defect
in §3 is the case where the code *claims* that behaviour and does not have it.

The trap is that the failure is **silent, not exceptional**. `triageAll()` does
not throw when the dictionary is missing — `triage()` downgrades every candidate
to the spelling-only `UNVERIFIED` tier, and `worksheetRows()` then returns zero
`no-reference` rows. The `try/catch` in `buildBacklog()` that was meant to catch
this is unreachable, because there is nothing to catch. The lesson generalises:
*a guard on an exception only guards the exceptional path; a guard on the
**precondition** guards the real one.* [S1]

### 2.2 Provenance is a first-class product artefact, not an internal note

1EdTech's **AI-Generated Content Best Practices v1.0** (education-sector
consortium, non-normative recommendations) makes provenance an explicit
recommendation and names the fields: model, version, prompts, date, link to the
model, plus risk-based human oversight and disclosure. [S4] It converges with
emerging legislation (EU AI Act; California, Utah, Texas). This is the standard
the repo's existing `content/provenance.json` shape already gestures at, and it
argues for treating the sourcing pass as **building an auditable provenance
layer**, not merely filling a missing string.

### 2.3 Licences: the sourcing pass is also a rights pass

`tools/content-pipeline/registry/sources.json` is fail-closed (`unknownLicense:
"forbidden"`) and the Creative Commons BY-SA 4.0 deed requires attribution, a
link to the licence, and an indication that changes were made — plus ShareAlike
on derivatives. [S5] Two consequences for the plan:

- Every event sourced from Wikipedia text needs TASL (Title, Author, Source,
  Licence) **and** the "changes were made" line. The gate already enforces
  `ATTRIBUTION_MISSING`; the sourcing pass must not treat the error going away as
  proof the attribution is *sufficient*.
- If any deck is ever sold, CC BY-SA content in it makes the derived work
  share-alike. That is a licensing decision (`doc/COMMERCIAL_PLAN.md` §6), and it
  is cheaper to prefer Tier-1/2 sources (public-domain, CC0, explicitly cleared)
  for commercial decks than to unpick it later. `world-history-first-timeline`
  and `inventions-discoveries` are the decks most likely to be sold.

### 2.4 A ratchet only works if the ceiling is out of reach of the data

The repo already implements the strongest form of the "baseline file" pattern:
the ceiling lives in the **generator script**, not in the generated JSON, so
editing the file cannot raise it (§4.7.6 reasoning in
`doc/LIBRARY_RESEARCH.md`). The general pattern (lint baselines / TODO files that
allow "no new violations" while legacy debt is paid down) fails when the baseline
is hand-editable. [S6] The plan keeps the repo's form and adds only two
disciplines: **lower the ceiling when the count falls**, and **never raise it
except by a named, reviewable act**.

### 2.5 Backfilling is a program, not an afternoon

Data-backfilling practice is consistent about the shape: scope the gap, choose a
small pilot, prove the tooling end-to-end, then batch; keep a correction log; and
prefer idempotent re-runs. [S7] That is the structure of §4.

---

## 3. Plan A — make the pronunciation gate honest, then runnable

### A1. Fail closed on the precondition *(implemented this session)*

**Change:** `scripts/gen-pronunciation-backlog.mjs` asserts
`await referenceAvailable()` before deriving anything, and `fail()`s with the
install command if it is false. This puts the guard on the precondition instead
of on an exception that is never thrown.

**Why it matters beyond the message:** without it, `npm run gen:backlog` in a
fresh clone silently **deletes 1,266 lines** of accepted backlog. That is the
real hazard — not the red gate.

**Falsifier:** with `tools/narration/node_modules` absent,
`node scripts/gen-pronunciation-backlog.mjs` must exit 1 and leave
`tools/narration/pronunciation-backlog.json` byte-identical. ☑ verified this
session.

### A2. Make the gate runnable where it must run

**Change:** install the author-time dependency, and record the step where a
person will look for it (already documented; add it to the plan's verification
list). Nothing ships — `tools/narration/` is author-time only.

```bash
npm --prefix tools/narration install     # vendored CMUdict + phonemizer (dev only)
npm run validate:backlog                 # expect: 138 open word(s) (ceiling 138)
```

**Falsifier:** `validate:backlog` prints `138 open word(s) (ceiling 138), N
deferred`, exit 0. If it prints anything else, a deck's spoken text changed and
the backlog is genuinely stale — regenerate, do not "fix" the number by hand.

### A3. Make the test's failure honest, not merely red

`tools/narration/test/backlog.test.mjs` fails on a fresh clone because the
dictionary is absent. Two options:

| Option | Effect | Verdict |
|---|---|---|
| `skip` when `referenceAvailable()` is false, as `reference.test.mjs:23` does | `npm test` goes green on a fresh clone | ❌ **fail-open** — a skipped ratchet is the exact silence rule 5 forbids |
| Keep failing, but name the cause and the fix | `npm test` stays red until deps are installed | ✅ recommended — same posture as the gate itself |

**Change:** keep the test strict; if its message does not already name
`npm --prefix tools/narration install`, add it. Do **not** add a skip.

**Falsifier:** with deps present the suite passes; with them absent it fails
*and* the failure text contains the install command.

### A4. Work the queue (content, not code)

```bash
npm run narration:worksheet              # ranked lookup sheet
npm run narration:audit -- --strips      # render one MP3 per candidate to listen
```

Per `AGENTS.md` rule 6, resolving a word means: look it up **under its own
script** (an English exonym is the headword least likely to have a Wiktionary
entry), then add the alias to `LEXICON` in `text.mjs` **and** a record in
`lexicon-records.mjs` with a typed source (`reference` needs a real citation and
exactly one of `url` / `noUrlBecause`; `measurement` only when the engine was
actually compared; `decision` for a project style call). An LLM is never the
source of a `reference`.

### A5. Reconcile the documented `--raise-ceiling` with reality

`AGENTS.md` rule 6 and the generator's own header both tell the reader that
`npm run gen:backlog -- --raise-ceiling` is the named way to raise the ceiling.
The flag is **not implemented** — `main()` only reads `--check`. The intended
escape hatch is therefore documented in two places and exists in neither, which
is its own small honesty gap: a maintainer who needs to raise the ceiling will
run the documented command, see it fail, and conclude the ratchet is broken.

**Change:** either implement the flag (raise `CEILING`, regenerate, print a
loud one-line record of the old and new value) or delete both references and
say plainly that the only way is to edit the constant. Prefer implementing it:
`--raise-ceiling` makes the deliberate act greppable in a diff, which is the
whole point of putting the ceiling in code.

**Falsifier:** the command in `AGENTS.md` runs, raises the ceiling by exactly
the amount needed, and prints old → new; or the docs no longer name a flag that
does not exist.

### A6. Tighten the ratchet as words resolve

After each batch, lower `CEILING` in `scripts/gen-pronunciation-backlog.mjs` to
the new count **in the same change** that resolved the words, and regenerate.

**Falsifier for the whole plan:** the `open` count falls batch over batch while
`CEILING` follows it down and never rises.

---

## 4. Plan B — retire the 321-event exemption

### B0. The rules that do not move

1. **No source → no ship** (`tools/content-pipeline/README.md`).
2. **Do not grandfather the two unflagged decks** (`inventions-discoveries`,
   `world-history-first-timeline`). `AGENTS.md` rule 5 is explicit: doing so
   "would make the policy apply to nothing."
3. **Do not hand-edit** `content/sourcing-backlog.json`.
4. **Never raise `CEILING`** in `scripts/gen-sourcing-backlog.mjs` to make room.
   It only ever moves **down**.
5. Counts come from the gate's own `SOURCE_MISSING` finding, so the backlog and
   the pipeline can never disagree.

### B1. Pilot: 10 events, end-to-end, in one deck

**Deck:** `world-history-first-timeline` (40 events). It is the only narrated
deck and the natural demo deck, and its manifest already declares
`CC-BY-SA-4.0` — so sourcing it also grounds narration that already ships.
`inventions-discoveries` (40) is the fallback if Tier-1 science sources prove
easier to fetch first.

**Loop per event** (the toolchain exists; the pilot is to prove it end-to-end):

```bash
npm run pipeline:fetch "Great Pyramid of Giza" --id pyramids --out content/sources
#   → prints a source record; paste it into the event's `sources[]`
npm run pipeline:provenance  <deck.json>     # auditable provenance record
npm run pipeline:sources                     # drift check vs. the pinned revision
npm run validate:pipeline                    # the honest gate, run directly
```

**Falsifier:** after 10 events, `validate:pipeline` error count falls from **80 →
70**, `validate:sourcing` unsourced falls **321 → 311**, and the 10 events each
carry a licensed source with attribution present. If the count does not move by
exactly 10, the sourcing pass is not wired to the gate and the plan stops here
until it is.

### B2. Batch the rest of deck 1, then deck 2

Source the remaining 30 events of `world-history-first-timeline`, then all 40 of
`inventions-discoveries`. Each deck reaches **0 errors** in `validate:pipeline`
independently; finish one before starting the other so the falsifier stays sharp.

**Falsifier:** `validate:pipeline` reports 0 errors for that deck alone.

### B3. Tighten the ratchet after every batch

Lower `CEILING` in `scripts/gen-sourcing-backlog.mjs` (321 → 311 → 281 → 241 →
201 …) and `npm run gen:sourcing`. The `grandfathered` flag is **not** removed
here — it belongs to the two remaining decks.

**Falsifier:** `npm run validate:sourcing` prints a strictly smaller unsourced
count than the previous batch, and the ceiling equals it.

### B4. The grandfathered decks last

`cc-timeline` (161) and `world-literature` (80) are the largest and the ones with
the most niche/contested claims — exactly the corners where `CONTENT_PIPELINE.md`
§2 warns Wikipedia is weakest. Source them last, and prefer Tier-1/2 references
(public-domain / CC0 / cleared) so the decks most likely to be sold do not
inherit a ShareAlike obligation (§2.3).

**When — and only when — a grandfathered deck reaches 0 unsourced events, remove
`"grandfathered": true` from its manifest and re-run the gate.** The flag must
come off as the *result* of the work, not a step in it.

**Falsifier for the whole plan:** `CEILING` reaches 0 and
`grandfatheredDecks` is `[]` in `content/sourcing-backlog.json`.

### B5. Effort, honestly

321 events × (1–3 authoritative lookups + a provenance record + a
`validate:pipeline` pass). This is tens of hours of **research**, not
engineering; it is the single largest remaining content task in the repo, and it
is also the task that makes the "sourced, trustworthy educational deck" claim
true. It does not need a cloud, a key, or a build step.

---

## 5. Anti-patterns (what NOT to do)

| Anti-pattern | Why it is wrong here |
|---|---|
| Grandfather the two unflagged decks to make the gate green | Applies the policy to nothing (`AGENTS.md` rule 5). |
| Raise `CEILING` to quiet a red | The ratchet exists to make growth visible in a diff. |
| Hand-edit `sourcing-backlog.json` / `pronunciation-backlog.json` | Generated; a test fails; the change is invisible as a decision. |
| `skip` the backlog test when the dictionary is missing | A skipped control is the fail-open the gate was built to prevent. |
| Treat "Wikipedia is allowed" as "Wikipedia is sufficient" | `CONTENT_PIPELINE.md` §2: never the sole source for a niche or contested fact. |
| Ship Wikipedia-derived prose in a paid deck without a licence decision | CC BY-SA ShareAlike travels with the derivative; prefer PD/CC0/cleared for commercial decks. |
| Cite `doc/SUCCESS_FACTORS.md` commercially | Forbidden (§6.5); `doc/COMMERCIAL_PLAN.md` is the independent corpus. |

---

## 6. Sequence and falsifiers

| Slice | Kind | Falsifier | Status |
|---|---|---|---|
| A1 | code | absent deps → exit 1, committed file byte-identical | ☑ done |
| A2 | setup | `validate:backlog` → 138 open ≤ ceiling, exit 0 | open |
| A3 | test honesty | failure text names the install command; no skip added | open |
| A4–A6 | content | open count falls; `CEILING` follows down, never up | open |
| B1 | content pilot | pipeline 80 → 70 errors; sourcing 321 → 311 | open |
| B2 | content batch | each unflagged deck reaches 0 errors | open |
| B3 | ratchet | ceiling strictly falls per batch | open |
| B4 | content | ceiling 0; `grandfatheredDecks` = `[]` | open |

Verification commands, in order, for any slice:

```bash
node --check scripts/gen-pronunciation-backlog.mjs
npm run validate:backlog
npm run validate:sourcing
npm --prefix tools/content-pipeline run test
npm run validate:pipeline          # red until B is done — run it, read the number
```

---

## 7. Sources (evidence-graded)

| # | Source | Grade | Used for |
|---|---|---|---|
| S1 | *Understanding "Failed Open" and "Fail Closed"* — authzed.com/blog/fail-open | Medium (vendor blog; the principle is well-established practice) | §2.1 fail-closed; guard the precondition, not the exception. |
| S2 | *Fail-Open vs Fail-Closed: Choosing a Safe Default* — systemdesignschool.io | Low–Medium (tutorial) | §2.1 "protection is gone while the check is down". |
| S3 | *Security Fundamentals: Fail Open vs Fail Closed* — community.opentext.com | Low–Medium (vendor blog) | §2.1 corroboration. |
| S4 | **1EdTech AI-Generated Content Best Practices v1.0** — imsglobal.org | High (education-standards consortium; non-normative but sector ratifier) | §2.2 provenance fields, SME oversight, disclosure, risk-based review. |
| S5 | **Creative Commons BY-SA 4.0 deed** — creativecommons.org/licenses/by-sa/4.0/deed.en | High (primary licence text) | §2.3 attribution + indicate-modifications + ShareAlike. |
| S6 | Repo's own §4.7.6 in `doc/LIBRARY_RESEARCH.md`; general lint-baseline practice | Medium (internal, paid for by a real bypass) | §2.4 ceiling out of the data's reach. |
| S7 | Data-backfill practitioner guidance (lakeFS, metaplane, Dremio) | Low–Medium (practitioner blogs; consistent across sources) | §2.5 scope → pilot → prove → batch; correction log. |

Vendor-bias caveat for §2.1: S1–S3 sell security/observability tooling, so treat
the framing as practice-reporting rather than measurement. The principle itself
is corroborated by the project's own incident (§3 A1).
