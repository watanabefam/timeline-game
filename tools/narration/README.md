# tools/narration — the narration generator

**Author-time only. Nothing here is ever loaded by the game.** The player only
*plays* the files this produces (`narration.js`); speech is never synthesised in
the browser (AGENTS.md rule 6, `doc/CROSS_PLATFORM_ROADMAP.md` §19.12.1).

```
decks/<deck-id>/narration/<event-id>.mp3
```

| File | Role |
|---|---|
| `text.mjs` | **The spoken-text recipe.** One source of truth, shared with `scripts/validate-narration.mjs` and copied into `narration-recipe.js` for the browser fallback |
| `synth.mjs` | Loads Kokoro from the local model bundle and synthesises one line. The only file that touches the model |
| `audio.mjs` | ffmpeg: trim, two-pass loudness, deterministic MP3 encode, duration, audition strips |
| `generate.mjs` | The CLI (render / `--dry-run` / `--repair` / `--listen` / `--check`) |
| `pronounce.mjs` | Wraps the engine's own phonemizer, so the audit reports what will actually be spoken |
| `reference.mjs` | Compares those phonemes with the CMU Pronouncing Dictionary (ISC) |
| `lexicon-records.mjs` | The auditable record for every override: verified phoneme, status, reason, and which kind of evidence backs it |
| `pronunciation-backlog.json` | **Generated.** Every spoken word no dictionary knows, plus the ceiling this project has accepted for them |
| `wikipron.mjs` | Optional second reading (WikiPron, Apache-2.0) — shown, never obeyed |
| `audit.mjs` | Anticipation layer: ranks every deck's risky words into four tiers |
| `strips.mjs` | Audition strips: one tiny MP3 per candidate word, plus the listening sheet |
| `test/recipe.test.mjs`, `test/pronounce.test.mjs`, `test/audit.test.mjs` | Invariants over all 321 real cards and over the QA loop itself (`npm test`) |

## Setup (once per machine)

```bash
npm --prefix tools/narration install   # kokoro-js 1.2.1, phonemizer, cmu-pronouncing-dictionary
```

Plus `ffmpeg` on PATH (`brew install ffmpeg`) and the model bundle in
`tools/kokoro-authoring/` — see that directory's README. **Nothing is
downloaded at run time**: `allowRemoteModels` is off, so a missing model file
fails loudly instead of quietly fetching 326 MB.

Only `generate.mjs` rendering (and `--strips`) needs the install and the
model. `--dry-run`, `--repair`, `--listen`, `--check`, the audit and the tests
import no engine at all — and the audit and its tests degrade to spelling-only
behaviour if the optional dictionary is absent.

## Use

```bash
# what would be said, with the content key and a leak check — no engine, no audio
npm run narration -- --deck world-history-first-timeline --dry-run

# render every card whose words or settings changed
npm run narration -- --deck world-history-first-timeline

# one card, or the first few
npm run narration -- --deck world-history-first-timeline --only confucius
npm run narration -- --deck world-history-first-timeline --limit 3

# rebuild the recorded bytes/sha256/durationMs/textHash from files on disk
npm run narration -- --deck world-history-first-timeline --repair

# an HTML contact sheet for the listening pass
npm run narration -- --deck world-history-first-timeline --listen

# render in a lower-precision tier (fp32 is the default; q8 reproduces old output)
npm run narration -- --deck world-history-first-timeline --dtype q8

# the content gate (also part of `npm run validate`)
npm run narration -- --check

# which words deserve an ear, across every deck
npm run narration:audit

# …and the same list as tiny MP3s on one page
npm run narration:audit -- --strips

# the no-reference words as a fill-in-by-hand research worksheet, split into
# what is still open and what already has a terminal outcome
npm run narration:worksheet

# regenerate the committed backlog the worksheet summarises (a ratchet: it will
# refuse to raise the ceiling unless you ask it to)
npm run gen:backlog
npm run validate:backlog
```

`--deck` takes a deck id or a path (a scratch copy beside the real deck works —
the render cache is keyed by path, not by name). `--all` covers every folder
deck, creating a `narration` block for decks that have none.

Rendering writes the MP3, then refreshes that card's record in `deck.json`
(`bytes`, `sha256`, `textHash`, `durationMs`) and the file list in
`manifest.json`. Re-running only re-renders cards whose normalised text or
audio settings changed — the content key covers recipe + text + voice + model +
dtype + format + bitrate + sample rate + engine version.

## Model tier

The generator renders in **fp32** (`model.onnx`, 326 MB), which is the card's
own default and what `kokoro-js` uses when told nothing. `--dtype fp16|q8`
selects the half-size and 8-bit weights; both files can sit in the bundle at
once, and the tier in force is recorded in `deck.narration.dtype`.

fp32 is the default because the tier is a fidelity knob, not a size one: the
MP3 encode dominates the shipped bytes, quantization is documented as harmless
for this model, and q8 was only ever a download-size compromise. Switching
tiers re-renders every clip (the dtype is in the content key) — on this
machine that is 40 clips in about three minutes.

**A tier does not change a pronunciation.** Text → phoneme happens in the
phonemizer, upstream of the weights, so "theses" comes out `θəsˈiːz` at every
tier. Pronunciation is fixed by `LEXICON` and checked by the audit below.

## The recipe

`strip-years-v2` (see `text.mjs`) removes anything that would give the answer
away — the year, the decade, the date range, the dated parenthetical, the
century — and then repairs the sentence the removal left behind.

It exists because the older inline regex did neither: it turned "Built in
c. 2348 BC by the Nile" into "Built in by the Nile", and it left `1,789`
untouched. It also has to *keep* every number that is not a year, because the
corpus is full of them: "2,300 years", "3,000-year civilization", "~3,000
killed", "95 Theses", "Apollo 11".

Two properties are enforced by tests over the whole corpus: no card can speak a
year, and no card is re-worded, re-punctuated or re-capitalised when it holds no
year at all ("iPhone Launched" stays "iPhone Launched"). A title whose year *is*
the answer ("The War of 1812", "1984 (Orwell)") is dropped, and the card's fact
is spoken alone.

The browser's fallback voice uses the same rule via `narration-recipe.js`, which
is generated from `text.mjs` (`npm run gen:recipe`, checked by
`npm run validate:recipe`) — the two cannot drift.

## Audio

24 kHz mono MP3, 64 kbps, matching the clips already shipped. Per clip: trim to
the speech envelope (0.09 s lead / 0.15 s tail), then two-pass `loudnorm` to
**-16 LUFS under a -1.5 dBTP ceiling**, then verify by re-measuring the encoded
file.

The ceiling is a property of the **file**, not of the samples, and MP3 encoding
adds its own inter-sample overshoot. So `loudnorm` is aimed at
`ceiling - ENCODER_OVERSHOOT` (`normaliseTruePeak()` in `audio.mjs`) while the
verification still holds the file to the real ceiling. Aiming `loudnorm` at the
ceiling directly is the bug: `newcomen-engine` normalised to -1.5 dBTP and the
encoded file measured **-1.0**. It stayed hidden because the gate records only
`path, bytes, sha256, textHash, durationMs` — no loudness or peak — so
`renderClip`'s throw is the only enforcement, and it takes a deck with enough
peaky material to trip it. `test/audio.test.mjs` pins the arithmetic; that card
was only found by rendering a deck that had never been narrated.

Watch for the `(peak-limited)` note in the output. Speech with a high
peak-to-loudness ratio cannot be both at -16 LUFS and under the ceiling:
`loudnorm` honours the ceiling and lands quieter. The shipped clips behave the
same way (mean -17.1 LUFS, peaks around -1.8 dBTP), so consistency across the
deck — not the exact figure — is what the check enforces. A clip more than 2 LU
under target fails, because that means something is broken rather than peaky.
Aim low enough that the ceiling holds: since the encoder overshoot, the shipped
clips sit near -2.2 dBTP rather than just under -1.5.

Audio settings are **not** part of the render cache key, which covers text,
engine, dtype and voice. Retuning loudness or the ceiling therefore needs
`--force`, and the tool will not warn you that existing clips are stale.

Identical input gives identical bytes: the encode strips the metadata block that
carries the ffmpeg build (`-map_metadata -1 -fflags +bitexact -write_id3v2 0`),
so `sha256` is stable enough to record. The gate still keys on `textHash` —
bytes can legitimately change with a new LAME build.

## Known limits

- **One voice, one format, one file per card, named after the event id.** The
  naming is the contract the player relies on.
- **No chunking.** Kokoro caps a pass at 510 tokens; the longest spoken card in
  the corpus is 197 characters, so every clip is a single pass and nothing is
  stitched (measured, and asserted by a test).
## Pronunciation QA — a loop, not a one-off

The ear is the only judge of whether a word is *correct*; the machine is a fine
judge of whether our *fix* did what we meant. The system uses both, in five
layers, so a problem in any deck is found before it ships and fixed once:

1. **Anticipate** — `npm run narration:audit` (`tools/narration/audit.mjs`) runs a
   static pass over the spoken text of **every** deck and collects the words a
   listening pass is most likely to trip over: non-ASCII spellings, rare
   clusters (`tz/zh/kh/sch`), bare `q`, very long words, Latin plurals, a
   hand-kept homograph list, **and every proper noun in the fact text**.
   Names matter most and announce nothing about themselves — "sundiata" looks
   no more exotic than "school", and only its being a name makes it risky.
2. **Look up** — a proposal needs a real source, not a plausible one. **Search
   the name under its own script, not the English exonym**: `Cleisthenes` 404s
   in Wiktionary, `Κλεισθένης` has a dialect-by-dialect IPA chain *and* a
   Descendants block naming the English learned form (`→ English: Clisthenes
   (learned)`) — the citation for whatever anglicised reading we ship. An
   English-only probe reports a **false negative**, and `cleisthenes` once
   shipped a respelling (`kly-stee-neez`) that no source supported, justified by
   a record asserting Wiktionary had no entry for the name. It did; the entry
   was in Greek. See `doc/LIBRARY_RESEARCH.md` §4.7.5. Wikipedia's
   `{{IPAc-}}`/`{{respell}}` field — read it out of the wikitext, not the
   rendered page — is the next best thing: hand-maintained convention rather
   than a recording, but the closest free proxy for the form an English
   textbook uses. YouGlish hit *counts* tell you how rare a word is in speech
   (and that you should expect a range, not an answer); its auto-generated
   "sound it out" breakdown is boilerplate and worthless. The offline
   measurement that follows is the complement, not the substitute.
3. **Measure** — `tools/narration/reference.mjs` compares the engine's own
   phonemes (`pronounce.mjs` wraps the same `phonemizer` the renderer uses) with
   the **CMU Pronouncing Dictionary** (`cmu-pronouncing-dictionary`, ISC). The
   comparison is deliberately coarse — stress position plus the class of the
   stressed vowel — because an exact diff would flag every legitimate accent
   variant in the corpus. It still catches the failure that matters: plain
   `Theses` comes out `θəsˈiːz` ("thuh-SEEZ"), two syllables of stress away from
   the dictionary's `TH IY1 S IY0 Z`.

   Every candidate lands in one of four tiers, and the tiers are the whole
   point — the screen's job is to shrink the list:

   | tier | meaning | what it costs |
   |---|---|---|
   | `disagrees` | the engine contradicts the dictionary | a `LEXICON` respelling, machine-checkable |
   | `no-reference` | no dictionary entry — a name, a transliterated place, a compound | **a human source**; nothing offline can settle it |
   | `context` | a homograph: the reading depends on the sentence | an ear, in context |
   | `agrees` | verified | nothing — and this is most of the list |

   For `world-history-first-timeline` that is 52 candidates → 6 words (1
   disagrees, 4 need a source, 1 context), where the old spelling-only screen
   ranked 13 words it could not justify and silently ignored every name.

   **A second reading, shown but never obeyed.** CMUdict is American, and for a
   *borrowed* name its entry records the English reading of the letters — so the
   engine agrees with the dictionary, the audit says `agrees`, and the dynasty
   comes out as "kin". `qin` is the clean case: `K IH1 N` against `t͡ʃ ɪ n`.
   `npm run narration:wikipro` fetches **WikiPron** (Apache-2.0, CUNY-CL, human
   broad transcription, 106,931 entries) into `tools/narration/.cache/`, and the
   audit then prints it after the engine's phonemes:

   ```
   · qin    kˈɪn   [bare q]  kˈɪn vs K IH1 N ‖ wikipron t͡ʃ ɪ n  — engine agrees with the dictionary
   ```

   It is **advice for a human and never moves a tier.** An earlier version
   compared the two phone-by-phone and demoted `agrees` → `disagrees`; measured
   against real words it also reported `world`, `empire`, `napoleon` and `athens`
   as contested, because ARPAbet writes an r-coloured vowel as one phone (`ER`)
   where IPA writes two (`ɜ ɹ`) and the sequences are never index-aligned. That
   comparison has been removed; `test/reference.test.mjs` pins its absence. The
   data is also blind to the half that matters most here — **WikiPron's English
   file carries no stress marks**, so it cannot arbitrate `bastille` or
   `raskolnikov`, the cases CMUdict gets wrong. `BORROWED_NAMES` in `audit.mjs`
   stays the curated route to the ear. See `doc/LIBRARY_RESEARCH.md` §4.7.2.
4. **Audition** — `npm run narration:audit -- --strips` renders one tiny MP3 per
   candidate and writes a single listening sheet
   (`tools/narration/.cache/strips/<deck>/`). Context-sensitive words are
   spoken **in their own sentence** rather than bare, because that is the only
   way to hear a homograph; everything else is the word alone, which is the
   honest test of a respelling. Strips are evidence: gitignored, never shipped,
   peak-normalised rather than loudness-normalised (a 0.3 s word cannot hold a
   trustworthy EBU R128 reading), and re-rendered on demand with `--force`.
5. **Resolve** — the fix goes in `LEXICON` (`text.mjs`), which is covered by
   `textHash`, so editing one line re-renders exactly one clip
   (`npm run narration -- --deck <id>` skips the rest). **Every entry also needs
   a record in `lexicon-records.mjs`**, and the suite fails without one: an
   unevidenced override used to pass every test, with the only complaint being
   that the *audio* was stale — which a routine re-render cleared for good. The
   respelling is then verified against the phoneme recorded there, which is how
   a first, plausible-looking attempt (`thee-seez` → `ðiːsˈiːz`) was caught
   before it shipped.

   **The three kinds of source, and why there are three.** Not every fix came
   from looking something up, and forcing them into one shape would mean citing
   a dictionary for a style decision, which would be a lie:

   | kind | evidence | required |
   |---|---|---|
   | `reference` | an external authority was consulted | `citation` (plus `url` only where a page was actually opened) |
   | `measurement` | this project's own reference layer: engine phonemes against a dictionary reading, then confirmed by ear | `note` saying what was measured |
   | `decision` | a choice about **what this project says** — never a claim about what a language does | `decisionType` (`style` / `editorial` / `owner-ratified`) and `decidedBy` |

   A `reason` is required on every record but is **never** a substitute for a
   source: the two are tested independently, so a well-written rationalisation
   cannot stand in for a citation. "World War **One**" is a `style` decision
   ratified by the project owner; citing a dictionary for it would be dishonest,
   and that is the whole reason the kinds are kept apart.

   **A `reference` must then fess up about the URL.** Exactly one of `url` or
   `noUrlBecause`, never both and never neither, and `noUrlBecause` has to be a
   real sentence (over 30 characters) that is not a restatement of the citation.
   This exists because `cleisthenes` shipped with the citation *"Wiktionary has
   no entry for this name, so no URL is claimed"* — which was **false**: the
   entry is under `Κλεισθένης`, which the English-only lookup never found. It
   survived because it lived inside `citation`, where a test could only see that
   a string was present. Putting the claim in its own field makes it visible to
   a reader and testable. Note what this does *not* do: no test can check that
   a citation is **true**. It can only force the claim to be made explicitly.

   The governing principle, and the reason the "source confidence" label that
   was considered was rejected: **derive what a machine can compute, and only
   make a human write what it cannot.** A hand-authored confidence enum is a
   place to put `low: my hunch` — a guess with a rubber stamp — whereas an
   `unsourced` flag derived from whether a URL resolves cannot rot into
   optimism.

   **An LLM is never the source of a `reference`.** The usual source hierarchy
   puts "our own approved list" at the top, which is exactly wrong here: the
   assistant is often what wrote that list, so treating it as an authority makes
   the layer self-referential — every record would validate against the thing
   it is evidence for, and the suite would be green forever. If a reading rests
   on an assistant's say-so, the record is a `decision` (with `decidedBy`) or a
   `measurement` (only if the engine was actually checked). `reference` means a
   page was opened and it says that. The assistant's job is to find the page
   and read it — which is also the fastest way to repeat the `cleisthenes`
   mistake, because it is confident and picks the wrong headword.

   **`rejected` keeps the readings that lost.** Optional: a source that agrees
   with us needs no rebuttal, and no test can tell whether a stated reason is
   any good. But a source that *disagrees* and is then quietly dropped is the
   same silent loss as the false citation — the next person redoes the search,
   and may not find the rival. `cleisthenes` carries three: the two rival
   readings, and `kly-stee-neez`, which is the wrong one this project itself
   shipped. A correction whose history was deleted is a correction nobody can
   check.

   **Deferred words carry a `deferredKind`.** The prose `deferredBecause` says
   why; the kind says which class, so the limit is countable:
   `transliteration`, `historical-reconstruction`, `non-standard-form`,
   `no-established-pronunciation`, and `engine-limit`. The last one is about us
   rather than about the word — `tenochtitlan` is not a name nobody knows how
   to say, it is a reading the engine cannot be respelled into — and without it
   every deferred word would read as ignorance.

   **One record per grapheme form.** A key is a written form matched
   case-insensitively, so two keys differing only in case are the same entry and
   the second is unreachable (enforced). But `WWII` and `World War II` are
   *different* keys that both need entries, because the text may contain either
   — the W3C Pronunciation Lexicon's own `grapheme` concept. Note that keys and
   aliases are separate namespaces: `World War One` is an alias, never a key.

6. **Guard** — `test/pronounce.test.mjs`, `test/audit.test.mjs` and
   `test/lexicon-records.test.mjs` run in `npm test` and fail if a lexicon entry
   stops changing the phonemes, no longer produces its recorded phonemes,
   becomes dead (a deck edit removed the word), has no record, has no source of
   a valid kind, has a reason but no provenance, collides case-insensitively
   with another key, or has an alias that is itself a key — plus the existing
   audit guarantees (no hard finding, every candidate in a tier, proper nouns
   still detected, `agrees` still the bulk of the list). Also two matcher
   regression tests: a lexicon key is **literal text**, never a pattern. It used
   to be interpolated straight into a `RegExp`, so `a.b` also rewrote `axb` and
   `cote (divoire)` never matched at all. No shipped entry was affected, but the
   backlog is 159 exotic proper nouns — exactly the shape of name that trips it.

`--listen` remains the full-sentence evidence step: an HTML contact sheet of
players beside the card text, for auditing by ear.

## The backlog is generated, and ratcheted

`pronunciation-backlog.json` is derived by
`scripts/gen-pronunciation-backlog.mjs` from the same audit the worksheet uses,
and validated by `npm run validate:backlog`, exactly like
`decks/index.json`. It is generated rather than hand-written for the obvious
reason: a hand-maintained list drifts from the decks and then reads like a
control while disagreeing with reality.

`ceiling` is a high-water mark — 138 open words at the time of writing. The
count drifting down while the ceiling holds is the visible proof the work
happened. Growth (new decks, new cards) is legitimate but has to be asked for by
name, so it lands in a diff as a deliberate act rather than as arithmetic:

```
✗ the open backlog GREW: 137 → 138, and was not raised on purpose.
  Run: npm run gen:backlog -- --raise-ceiling
```

Deferred words are **not** counted as open. A deferred word has a terminal
outcome — looked up, understood, out of reach — so folding it into the open
count would make progress look like forgetting, while leaving it out entirely
would hide a real limitation. It is listed separately with its kind and its
reason.

Two details that are deliberate: the file carries a payload **hash** rather
than a generation date, because a date would make a fresh run differ every day
and turn `--check` into a calendar alarm (`git log` already answers "when");
and the gate **fails** if the audit cannot run, because a backlog generated
from partial data must never look like a smaller backlog. A check that cannot
run must never report clean.

**What this loop cannot do.** It catches the demonstrably-wrong class: a word
whose stress or stressed vowel contradicts a dictionary, or that no dictionary
has. It does **not** catch a model artefact (a dropped syllable, a mis-voiced
stop) — only the ear does — and it cannot tell a wrong-but-plausible name from a
right one, because for `tenochtitlan` there is no offline truth to compare
against. That is why `no-reference` asks for a human source rather than
pretending to a verdict.

**Escalation.** If a word resists respelling (foreign proper nouns are the
usual case), the researched path is author-time Python
[misaki](https://github.com/hexgrad/misaki), whose dictionaries and
exact-phoneme overrides are dictionary-grade — see `doc/LIBRARY_RESEARCH.md`
§4.7.

## Coverage

All 40 cards of `world-history-first-timeline` have a clip; the other three
decks have none and fall back to the system voice, which is a supported state —
`npm run validate:narration -- --require-complete` is the strict mode for when
a deck claims full coverage.
