# AGENTS.md — timeline-game

Agent-facing conventions for this repo. Player/content docs live in `README.md`;
the cross-platform plan lives in `doc/CROSS_PLATFORM_ROADMAP.md`; the ratified
gamification-layer spec lives in `doc/GAMIFICATION_BRIEF.md`.

## What this is

A no-backend timeline-ordering game (place historical events in chronological
order) built as **plain HTML/CSS/JS with no build step**. Decks are pluggable
folder packages (`decks/<id>/`, loaded through a generated classic-script
index — see rule 4). Deployed as a static site served over **HTTPS** — the final product
is hosted, so secure-context-only APIs (service workers, notifications) are
available. **`file://` is a best-effort convenience for local testing only, and
is never a shipping target.** Prefer designs that keep working there when it is
cheap — e.g. decks load through generated `<script>` mirrors rather than
`fetch`, because `fetch` is blocked under `file://` (origin `null`) — but a
feature that *cannot* work under `file://` (anything needing `fetch`, ES
modules, service workers, or reliable storage) is **not blocked** by it. Never
contort a design for `file://` parity, and never treat a `file://` pass as
proof the hosted build works: the two load paths genuinely differ.

**Product direction (2026-09):** this is an **educational** game — primary
audience homeschooling families, but accessible to everyone. Treat learning
features accordingly: Focus practice is evolving from "replay missed events"
into a mastery system. When building it, persist **raw review outcomes**
`(event_id, profile_id, timestamp, outcome)` as an append-only log and derive
scheduler state from it, behind a `rate(outcome) → nextDue` interface —
target algorithm is **FSRS** ([ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs),
MIT, vendored UMD); SM-2 is an acceptable starting point behind the same
interface. Never make features educational-audience-only — everything stays
playable by casual users. When building the motivational surfaces around the
mastery core (streak/calendar, leveling, achievements, feedback copy), follow
the ratified design in `doc/GAMIFICATION_BRIEF.md` (decisions D1–D8, amendments
A1–A11, age-band gating, derived-state rule). The learning-science evidence
those amendments rest on is vendored in `doc/references/` — read it before
designing any learning or motivational surface, and cite it by § number.

## Hard rules

1. **No build step, no framework, no npm runtime dependencies.** The game is
   served over HTTPS; `file://` is a best-effort dev convenience, **not a
   requirement** (see above) — a feature that needs `fetch`, ES modules,
   service workers, or reliable storage may work only over HTTP(S). Everything
   first-party is a classic (non-module) script loaded by
   `index.html`. Vendored third-party libs may ship an **ESM build** loaded via
   `<script type="module">` (allowed since the hosting change) — but never a
   bundler-required npm package.
   **Scope:** rules 1–4 and 6 govern the web game core (`index.html`, `timeline.js`,
   `fx.js`, `globe.js`, `narration.js`, `decks-io.js`, `events-data.js`,
   `decks/`, `assets/`). The cross-platform
   packaging layer planned in `doc/CROSS_PLATFORM_ROADMAP.md` (Capacitor/Tauri
   shells, staging scripts, npm dev tooling) is exempt from the no-build rule —
   but it must **wrap the game core unmodified**, not rewrite it. Capacitor and
   Tauri do **not** require a bundler; point `webDir`/`frontendDist` at a
   staging directory produced by a copy script (see roadmap §5.1).
2. **Never edit anything under `assets/`** — it is vendored third-party code.
   To add a library: download the release bundle into `assets/vendor/`, keep
   its license header, pin the version (record it in the file header comment),
   and load it with a `<script>` tag (or `<script type="module">` for ESM
   builds). **Vendored code must be permissively licensed** (MIT / ISC / BSD /
   Apache-2.0 / CC0 / public domain) and recorded in `THIRD_PARTY_LICENSES.md`:
   a package's *declared* license does not cover a copyleft component it
   bundles. `npm run validate:vendor` enforces this — it fails on
   GPL/AGPL/LGPL/EUPL/SSPL/FSL-1.1/CC-BY-NC markers, on runtime-TTS artefacts
   reappearing under `assets/`, on a first-party reference to the retired
   Kokoro runtime bundle, and on a vendored script losing its license/version
   header. *(One-time exception, 2026-09-29: the Kokoro + ONNX-Runtime bundle
   was **moved out of** `assets/vendor/` — moved, never edited — into the
   gitignored `tools/kokoro-authoring/`. See `doc/LIBRARY_RESEARCH.md` §2.)*
3. **Cache-busting:** first-party scripts load with `?v=N`
   (`fx.js?v=26`, `timeline.js?v=203`). Bump `N` whenever you edit that file,
   or returning players get stale code.
4. **Script load order in `index.html` matters** (classic scripts, sync):
   `events-data.js` → `decks-io.js` → Leaflet → `world-land.js` →
   `liquid-glass.js` → `vis-timeline` → `anime.umd.min.js` →
   `canvas-confetti` → `fx.js` → `globe.js` → `narration-recipe.js` →
   `narration.js` → `offline.js` → `review-scheduler.js` → `timeline.js`.
   `fx.js` (defines `window.FX`), `globe.js` (`window.GlobeDock`),
   `narration-recipe.js` (`window.NarrationText`, generated),
   `narration.js` (`window.Narrator`) and `review-scheduler.js`
   (`window.ReviewScheduler`) must all load before `timeline.js`, which uses
   them. Decks themselves arrive from `decks/index.js` (generated)
   via the `window.registerDeckSource` registry in `events-data.js`.
   `offline.js` (`window.Offline`) is independent of all of them — it touches
   only its own DOM hooks — and `sw.js` is never a `<script>` tag at all: the
   service worker is fetched by the browser from `offline.js`'s registration.
   `<script type="module">` tags are deferred by spec — they run after all
   classic scripts, so a module can rely on `window.FX`/`window.DECKS` being
   present, but classic scripts can never rely on a module.
5. **Run the content gate after touching deck data:**
   `npm run validate` (Node ≥18) — `validate:index` (generated deck list is
   fresh), `validate:content` (the fact-quality and year-placement rules across
   every deck in `decks/`), `validate:vendor` (rule 2), `validate:offline` (the
   generated precache manifest is fresh and the app icons in `icons/` match),
   `validate:recipe` (the generated browser copy of the narration recipe is
   fresh), `validate:narration` (every clip's records, hashes, duration and
   coverage), `validate:backlog` (the pronunciation backlog is current and
   under its ceiling), `validate:sourcing` (the sourcing backlog is current and
   under its ceiling). `validate:offline` sits **before** the known-red
   `validate:backlog` on purpose: a gate chained after a permanently-red one
   never runs, so it reports nothing.

   **`validate:pipeline` is deliberately NOT in that chain, and `npm run
   validate` exits 0 without it.** The content-pipeline gate is honestly red:
   **0 of 321 events carry a `source`**, against a documented "no source → no
   ship" policy (`tools/content-pipeline/README.md`). Two decks
   (`cc-timeline`, `world-literature`) carry `"grandfathered": true`, which
   downgrades `SOURCE_MISSING` to a warning, so the gate reports 80 errors —
   one per event in the two *unflagged* decks — and 201 findings as warnings.
   Chaining a permanently-red gate into the always-green one made all six
   strict gates unreadable, which is a bigger risk than the content gap.

   The gap is kept visible and bounded rather than merely unmentioned:
   `content/sourcing-backlog.json` is generated by
   `scripts/gen-sourcing-backlog.mjs` and counts every unsourced event **by the
   gate's own `SOURCE_MISSING` finding**, so an exemption never hides a number.
   `validate` prints a pointer to the excluded gate. Do not "fix" the red by
   grandfathering the other two decks: that would make the policy apply to
   nothing. Both ratchets hold their ceiling in the generator **script**, not
   in the generated file — an earlier version read the ceiling from disk, so
   hand-editing the JSON raised it and the check still passed. `npm run test` runs the Node
   tests for the offline layer (`scripts/test/offline.test.mjs`, first, so a
   pre-existing failure in a later suite cannot hide it), then the content
   pipeline, then narration. The enrichment
   scripts (`npm run enrich`) run the gate too, but the enrichment pass itself
   is stale — see `README.md`.
6. **Narration is pre-rendered, never synthesized at runtime.** Voice audio
   ships beside the deck (`decks/<id>/narration/<event-id>.mp3`), recorded in
   the deck's `narration` block in `deck.json` — engine, dtype, voice and the
   per-clip records — and listed under `assets` in `manifest.json`.
   `narration.js` only plays it, with a
   system-voice fallback for decks that have no audio. Nothing may load a TTS
   engine in the browser (`doc/CROSS_PLATFORM_ROADMAP.md` §19.12).

   **Every override needs a record.** `tools/narration/lexicon-records.mjs` holds
   one record per grapheme form: the verified phonemes, a status (`fixed`,
   `confirmed` or `deferred`), a reason, and one of three typed sources
   (`reference` with a citation, `measurement` for the audit's own
   engine-vs-dictionary comparison, or `decision` for a project style choice —
   never a citation for a preference). A `LEXICON` entry with no record fails
   `npm test`; so does a record with no source. A reason is never a substitute
   for provenance. Add the alias to `LEXICON` in `text.mjs` and the record in
   `lexicon-records.mjs` — either alone fails.

   **A `reference` must carry exactly one of `url` or `noUrlBecause`.** Never
   both, never neither, and `noUrlBecause` must be a real sentence rather than a
   restatement of the citation. `cleisthenes` shipped the claim "Wiktionary has
   no entry for this name, so no URL is claimed", which was false — the entry is
   under `Κλεισθένης` — and it survived inside `citation`, where a test could
   only see that a string existed. Derive what a machine can compute; only make
   a human write what it cannot, which is why there is deliberately **no**
   hand-authored confidence field. A `deferred` record also needs a
   `deferredKind` (`transliteration`, `historical-reconstruction`,
   `non-standard-form`, `no-established-pronunciation`, `engine-limit`), so a
   word that is out of reach of the *mechanism* is not filed beside words
   nobody knows how to say.

   **An LLM is never the source of a `reference`.** The usual hierarchy puts
   "our own approved list" first, which is wrong here: an assistant often wrote
   that list, so it cannot also be its authority — that makes every record
   validate against the thing it is evidence for. A reading resting on an
   assistant's say-so is a `decision` (with `decidedBy`) or a `measurement`
   (only if the engine was actually checked); `reference` means a page was
   opened and it says that. Where sources disagree, record the losers in
   `rejected` — `cleisthenes` keeps the reading this project itself shipped,
   because a correction whose history was deleted is a correction nobody can
   check.

   **The open backlog is generated and ratcheted.**
   `tools/narration/pronunciation-backlog.json` comes from
   `scripts/gen-pronunciation-backlog.mjs` (as `decks/index.json` comes from
   the deck folders) and is checked by `npm run validate:backlog`. Its
   `ceiling` is a high-water mark: the count falls as work lands, the ceiling
   holds, and growth must be asked for by name (`npm run gen:backlog --
   --raise-ceiling`) so it shows up in a diff as a deliberate act. Deferred
   words are listed separately, not counted as open. The gate **fails** if the
   audit cannot run — a check that could not run must never report clean.

   The clips are produced by `tools/narration/` (author-time, never shipped).
   `tools/narration/text.mjs` is the **single source of truth** for the words
   that get spoken; `narration-recipe.js` is generated from it for the browser
   fallback, so the player and the generator can never disagree about how a
   card is worded. Never hand-edit `narration-recipe.js`, and never let a second
   copy of the recipe appear in first-party code.

## File map

| File | Role |
|---|---|
| `index.html` | All screens (home/setup/game/results/browse/stats), Settings modal, script tags |
| `timeline.js` | The entire game: state, screens, placement logic, split-screen, vis-timeline rendering, Leaflet maps, glass init, settings |
| `fx.js` | Interface effects layer → `window.FX` (see below) |
| `globe.js` | 3D globe dock → `window.GlobeDock` (and `GlobeDockP2` for the split-screen pane) |
| `narration.js` | Pre-rendered deck narration playback → `window.Narrator` (rule 6) |
| `narration-recipe.js` | **Generated** browser copy of the spoken-text recipe → `window.NarrationText`; never hand-edited, regenerate with `npm run gen:recipe` |
| `decks-io.js` | Deck JSON import/export → `window.exportDeck` / `exportAllDecks` / `importDeckFromFile` / `loadImportedDecks` (Blob + FileReader, no server) |
| `events-data.js` | Deck registry (`window.DECKS`, `registerDeck`) + deck *sources* + shared filter helpers. **Holds no event data.** |
| `review-scheduler.js` | Pure reach-back review scheduler → `window.ReviewScheduler` (`replay`/`rate`/`dueSet`, the A10 L2 seam). DOM-free classic script; unit-tested under `scripts/test/` |
| `decks/index.json` + `index.js` | **Generated** deck list (revision + bytes per package) — never hand-edited; regenerate with `npm run gen:index` |
| `manifest.webmanifest` + `icons/` | Web app manifest and **generated** app icons (installability, S1a). Icons live here, not in `assets/`, because `assets/` is vendored and never edited (rule 2). Regenerate with `npm run gen:icons` |
| `offline.js` | Installability affordance + service-worker registration, update timing, storage persistence, offline status → `window.Offline` |
| `sw.js` | The offline service worker (classic, hand-written, no build step). Fetched by the browser through `offline.js`, never a `<script>` tag |
| `offline-manifest.json` + `offline-manifest.js` | **Generated** precache list — per-file content revision + generation hash — never hand-edited; regenerate with `npm run gen:offline` |
| `tools/narration/pronunciation-backlog.json` | **Generated** list of spoken words no dictionary knows, plus the accepted ceiling — never hand-edited; regenerate with `npm run gen:backlog` |
| `content/sourcing-backlog.json` | **Generated** count of events with no registered source, per deck, plus the accepted ceiling — never hand-edited; regenerate with `npm run gen:sourcing` |
| `decks/<id>/` | A deck package: `manifest.json` + `deck.json` + generated `deck.js` (+ `narration/*.mp3`) |
| `scripts/*.mjs` | Node content tooling only (never loaded by the game): deck index + content/vendor/narration/offline gates, the recipe mirror and icon generators |
| `tools/narration/` | Author-time narration generator: the recipe, Kokoro synthesis, ffmpeg post-processing, tests (see its README) |
| `tools/offline-smoke/` | Author-time browser smokes: the offline layer (`smoke.mjs` in Chromium, `webkit.mjs` in Safari's engine), the S2 mastery level card (`mastery.mjs`), the review queue (`review.mjs`) and the A8 feedback/confidence slice (`feedback.mjs`) — all Chromium except `webkit.mjs`. Not part of `npm test` — they need a real browser download, and a check that cannot run must never report clean |
| `tools/kokoro-authoring/` | Author-time TTS model bundle only, gitignored and **never shipped** (see rule 2) |
| `THIRD_PARTY_LICENSES.md` | Attribution manifest for everything third-party; enforced by `npm run validate:vendor` |
| `doc/GAMIFICATION_BRIEF.md` | Ratified spec for the gamification layer over the mastery review log (streaks, leveling, achievements, feedback copy) |
| `doc/LIBRARY_RESEARCH.md` | Decision record for third-party libraries: stack-fit ratings, licenses, and the traps |
| `doc/SUCCESS_FACTORS.md` | Evidence-graded external research; subordinate to the brief and `MARKET_COMPARISON.md` |
| `doc/references/mcg_research_synthesis.md` | Vendored learning-science evidence base (26 fronts; effect sizes, boundary conditions, anti-patterns, cross-front conflict rules). Citable by § number |
| `doc/references/evidence-base.md` | Per-pattern evidence ratings for the borrowed patterns. Written for the sibling Montessori grammar project — **only its §7 gamification row and general SDT/feedback rows transfer here** |
| `doc/CROSS_PLATFORM_ROADMAP.md` | Cross-platform, cloud, monetization and packaging plan (§19 deck packages, §19.12 narration) |
| `doc/CLOUDLESS_PLAN.md` | The **cloud-less track**: working method (research → plan → build → verify), ordered slice queue, and the two decisions it gates on. Start here for any client-side-only feature |
| `doc/STUDY_MODES.md` | Mode catalog (v2). Ratings on a research-alignment rubric, new instruction surfaces, competitive read, and a mandated instruction-before-assessment build order. **v1's catalog and TL;DR are preserved verbatim in §14** with the reason for every change |
| `doc/CONNECTIONS.md` | The connection/causal edge model: schema, type vocabulary, the filter rule, the logged rejections, and the `inventions-discoveries` pilot (61 authored edges). Read before touching `connections[]` |

## FX layer (`fx.js` → `window.FX`)

Architecture notes an agent must respect when touching animations:

- **Engine:** anime.js v4 UMD (`window.anime`). Curtain animations run on the
  **WAAPI/compositor path**; shake and reduced-motion crossfade use native
  `element.animate`. The score count-up is JS-driven (it writes text).
- **Curtain = Motion's clipWipe pattern:** a static full-viewport panel whose
  slanted edge is an animated `clip-path` polygon. Cover 260ms / reveal 340ms.
- **Direction is derived, not passed:** `SCREEN_ORDER` in `timeline.js`
  (`home/stats: 0, setup/browse: 1, game: 2, results: 3`) — destination
  further along = forward (sweeps right, top leans right); earlier = backward
  (mirrored). Titles: setup carries the deck name, game says "Game Start!",
  others come from `SCREEN_TITLES`.
- **The swap + glass init run between cover and reveal** (curtain static-full).
  Do not move work onto the main thread while phases are animating.
- **anime.js v4 gotchas (all hit in practice):**
  - `timeline.add(targets, params, position)` — two arguments, NOT the v3
    merged-object form (it silently animates the config object).
  - `"<"` means END of previous; `"<<`" means start (opposite of GSAP).
  - `waapi.animate` transform shorthands (`x`) are main-thread-driven and
    break if you write an inline `transform` after starting. Use native
    `element.animate` for composited transforms; set inline holds BEFORE
    starting.
- **Reduced motion:** read `matchMedia("(prefers-reduced-motion: reduce)")` at
  call time, never cached. OS setting always overrides the in-game FX toggle
  (`localStorage "timeline.fx"`). Reduced-motion curtain = 200ms opacity
  crossfade, no displacement; shake is skipped.
- **Glass:** `initGlassOnScreen()` is synchronous on purpose (kills the
  unstyled flash). It runs inside the curtain swap and at load.

## Verification workflow (no game test suite)

There is no test harness for the game itself (no DOM/browser runner) — the
Node tests under `tools/content-pipeline/` (`npm run test`) cover the content
schema and gate only. Verify game changes in a real browser:

```bash
python3 -m http.server 8000        # then open http://localhost:8000
```

Smoke checklist for FX changes: curtain sweeps both directions with correct
slant, title carries deck name (setup) / "Game Start!" (game), no console
errors, glass present at load and after transitions, reduced-motion emulation
swaps instantly, `?v=` bumped on edited files.

Additional checks for the surfaces built after this doc was last revised:

- **Narration:** toggle it in Settings; *Play sample* plays on a narrated deck
  (`world-history-first-timeline`) and degrades to the system voice on a deck
  with no audio; no 404s and no attempt to load a TTS engine. Confirm the
  fallback speaks the same words a clip would (that comes from
  `narration-recipe.js`, so check it loaded — a missing one speaks the title
  alone).
- **Narration authoring:** `npm run narration -- --deck <id> --dry-run` prints
  the words each card would speak with a leak check (no model, no ffmpeg);
  `npm run validate:narration` verifies every shipped clip against the current
  deck text; `--repair` rebuilds records from the files on disk. Rendering
  needs `ffmpeg` and the one-time `npm --prefix tools/narration install`.
  Clips render in **fp32** by default; `--dtype fp16|q8` selects another tier
  (and re-renders everything, because the tier is in the content key).
- **Pronunciation QA:** `npm run narration:audit` ranks every deck's risky words
  against the CMU dictionary (`disagrees` / `no-reference` / `context` /
  `agrees`); `npm run narration:audit -- --strips` renders one tiny MP3 per
  candidate and writes a listening sheet. Findings are advisory; only year
  leaks and dead `LEXICON` entries fail the run. Resolving a `no-reference`
  word means looking it up **under its own script** — the English exonym is the
  headword least likely to have a Wiktionary entry, so an English-only probe
  reports a false negative (`Cleisthenes` 404s; `Κλεισθένης` does not, and its
  Descendants block names the English form). `npm run narration:worksheet`
  prints the ranked lookup procedure.
- **Split-screen:** both panes accept input independently (keyboard **and**
  pointer), each header shows its own deck/filters, results show head-to-head.
- **Deck I/O:** export a deck, re-import it, confirm it replaces by id.
- **Offline / install:** run the automated smoke first — it drives a real
  browser, so it is the only check that can be trusted for this surface:
  `npm run validate:offline`, then `npm --prefix tools/offline-smoke install`,
  then `npm run smoke:offline` (Chromium, ~30 s) and `npm run smoke:webkit`
  (Safari's engine, ~5 s, needs `npm --prefix tools/offline-smoke run browsers`
  once for the WebKit build). Both must be green; they cover installability and
  the install affordance, offline boot with the server actually stopped,
  playback from the downloaded clips, a re-rendered clip being heard rather
  than the cached one, update timing, two tabs, granted and refused storage
  persistence, an installed/standalone run, a no-worker browser, and a native
  shell. **What they cannot cover — check by hand on a device:** iOS Safari
  itself (Add to Home Screen, iOS storage eviction), the browser's own install
  dialog, and eviction under memory pressure. `sw.js` must also stay **not**
  registered under `file://`.
- **Mastery level card (S2, phase 2):** run the automated smoke —
  `npm run smoke:mastery` (Chromium, ~8 s) covers the stats-screen age gate and
  the level card's DOM contract for all four bands plus unset and
  reduced-motion: the card's title/badge/bar must agree with
  `window.Gamify.mastery()`, 17+ and unset show the numeric breakdown, 8–11
  drops it, 5–7 loses the badge, the bar, the card's percentage and the level
  number and turns the weekly rows into a star readout. **What it cannot
  cover:** print output, pixel appearance, and iOS — check those by hand. (The
  stats-screen "Avg score" percentage is not a mastery number and stays.)
- **Feedback surface — the retired A8 prompt and why-line (S2, phase 4):** run
  the automated smoke — `npm run smoke:feedback` (Chromium, ~14 s, 24 checks)
  proves the removal is real rather than trusting a diff: no band ever renders
  `.tl-prompt`, no revealed card ever renders `.tl-why`, no stylesheet rule
  matches `.tl-prompt`, and no review-log row carries a `confidence` field —
  while the 5–7 focus panel still shows stars and no percentage (17+ still shows
  it) and all of it holds under reduced motion. The decision record for the
  removal is `doc/CONNECTION_CUE_PLAN.md` §0. **What it cannot cover:** the
  connection cue that replaces the why-line (not built yet), scoring/round
  order, pixels and iOS.
- **Review queue (S2, phase 3):** `npm run smoke:review` (Chromium) covers the
  Focus-panel Review round, the derived due count, the fail-open small set, the
  5–7 era/week cap, the J2 empty state and reduced motion.
- **Vendored assets:** `npm run validate:vendor` passes (rule 2).

## Conventions

- **Style:** the codebase uses IIFE + `"use strict"`, `const`/`let`, template
  literals, `$("id")` helper for DOM lookups. Match it. First-party code stays
  classic-script IIFE — no JSX, no TypeScript. ESM is allowed only for
  vendored third-party libs (rule 1).
- **State:** game state lives in module-level objects inside the
  `timeline.js` IIFE; persistence via `localStorage` with `try/catch` guards
  (keys: `timeline.users.*`, `timeline.fx`, `timeline.mapMode`, …).
- **A11y:** `prefers-reduced-motion` is a hard floor — any new motion needs a
  reduced-motion story. Toggles use `aria-pressed`.
- **Commits:** short imperative one-liners (`Fix deck loading on file://
  protocol: hardcoded fallback`).
- `audit-report.md` is generated by the audit skill and safe to regenerate;
  commit it only if you want the snapshot in history.
