# Timeline Game

An open, no-backend **timeline-ordering game** inspired by [Timdle](https://www.timdle.com/) and [WHEN?](https://github.com/ethangreeney/when-timeline-game). Place each mystery event into the right gap of a growing timeline. Correct placement locks the card and scores more as the line grows; a wrong placement bounces the card back with the correct slot revealed, so a run can never end early (see [Learning rationale](#learning-rationale)).

It runs entirely in the browser — **no build step, no server, no account.**

## Features
- **Pluggable decks.** Each deck is a self-contained package in `decks/<id>/` (`manifest.json` + `deck.json` + a generated classic-script mirror `deck.js`) with its own events **and** its own filter screens. Four ship today: `world-history-first-timeline`, `cc-timeline`, `world-literature`, `inventions-discoveries`.
- **Multi-select filter screens.** Before playing, the deck can offer filter groups (e.g. *By Ages*, *By Weeks*, *By Continents*) where the player picks **one or more** options. Within a group the choice is OR; across groups it is AND. No selection in a group = whole deck. Empty combinations are caught and the Start button is disabled with a hint.
- **Every run is a fresh randomized puzzle** drawn from the chosen deck + filters + play count (seeded Fisher–Yates, era-balanced for variety).
- Two revealed anchors + insert-into-gaps loop (combines the Timdle anchor with the WHEN? incremental-insert mechanic).
- **Flat, transparent scoring:** every card you place is worth 3 points; each slip on it costs 1 (floor 0). Max = 3 × cards placed, so `score / (3N)` is an instant mastery percentage. Per-card `+N` chips on the results screen make the feedback micro-level (see Learning rationale). Same-year rule. Wrong placements bounce back — runs can't end early, which maximizes retrieval practice with immediate corrective feedback. The **Play count** selector sets how many events *you* place (2 anchors are pre-placed on top).
- Year + a one-line fact revealed after each placement.
- **Local player profiles** (no accounts): 👤 button on every screen opens a
  picker — add/switch/rename/delete players; each player's runs, per-event
  accuracy and mastery are stored locally (`timeline.users.v1` +
  `timeline.user.<id>.v1`). Clearing browser storage erases them.
- **Two-player split-screen.** Tick *Two-player split-screen* on the setup
  screen and each player gets their own pane, keyboard controls, timeline rail
  and globe; the results screen shows the head-to-head.
- **Voice narration** (optional, off by default). Decks that ship pre-rendered
  audio (`decks/<id>/narration/<event-id>.mp3`) read each card's title + fact
  aloud as it appears; decks without audio fall back to the system voice.
  Toggle it in **Settings → Voice narration**, where *Play sample* tests it.
  Years are never spoken, so narration cannot give the answer away: the words
  come from one recipe (`tools/narration/text.mjs`) that both the generator and
  the fallback voice use. Only *World History: A First Timeline* ships audio so
  far (10 of its 40 cards) — see [tools/narration/README.md](tools/narration/README.md)
  to make more.
- **Import / export decks** (Settings → Decks). Export one deck or all of
  them as JSON, edit, and import back; importing an id that already exists
  replaces that deck. Client-side only — no server, no build step.
- **Globe dock.** A collapsible 3D globe (bundled offline textures) that docks
  onto the timeline and library screens — one per player in split-screen.
- **Focus practice**: once a player has finished a run, the home screen shows
  one-click **Focus** options — a "Focus round" built from their toughest
  events, and practice rounds for their weakest weeks. The 👤 → progress page
  reports overview stats, mastery by week (with "not enough data yet" below 3
  attempts), focus areas and recent runs.
- **Background music** that starts on load (browser autoplay rules allow it from the first interaction) with a ♫ play/pause button and volume slider next to the interface-sound control; preferences persist.
- Shareable spoiler-free result (attempt grid + points + slips).
   - **Browse** the full event library of any deck.
   - **Fact sheets.** Every placed card (and the Results / Browse screens) shows a
      small structured table — **Who · Where · Why it matters** — plus a one-line
      `fact`, so each event teaches something, not just its date.
    - **Mini location map.** The fact sheet includes a small map: a **pin** for a
       specific place (city) or an **area circle** for a region / country /
       continent (e.g. *China* is shaded, not pinned), built from the event's
       `lat` / `lng` / `area`. Off-Earth events (the Moon) show a note instead.
       The basemap is configurable in **Settings** (gear icon, any screen):
       **Satellite** (NASA Blue Marble imagery, needs internet) or **Plain**
       (offline vector outline). Offline play always uses the Plain map.

## Content quality rule (enforced)

A timeline game only teaches if the reveal text actually *adds* to the title.
Every event must obey:

> **RULE — "A fact must add information the title does NOT already give."**

The validator (`scripts/validate-content.mjs`, run via `npm run validate`) fails
the build when any event's `fact`:
1. is empty,
2. is identical to the `title`,
3. is a (near-)substring of the `title`,
4. shares ≥ 70% of its meaningful words with the `title` (i.e. just rewords it), or
5. carries no concrete detail — no year/number, proper noun, or causal word
   (`because`, `invented`, `founded`, `led to`, …).

This rule is **enforced for any future deck**: append or import a deck and
`npm run validate` checks it too (the gate runs `validate:index`,
`validate:content`, `validate:vendor`, `validate:recipe` and
`validate:narration` — the last two verify the spoken-text recipe and every
shipped narration clip — plus `validate:pipeline`).

Drafting a **new** deck goes through `tools/content-pipeline/`
(`npm run pipeline:brief` → draft → `npm run pipeline:review`, with
`pipeline:fetch` / `pipeline:provenance` / `pipeline:sources` for grounded
sources) — see `doc/CONTENT_PIPELINE.md`. `generate-events.mjs` is the older,
ungrounded AI generator (still optional).

### Event shape

```js
{ id, title, year, circa?, yearEnd?,  // yearEnd -> displayed as a RANGE (display only; ordering uses sortYear/year)
  continent?, week?, emoji, category?,
  fact,          // one engaging sentence that ADDS a detail beyond the title
  who?,          // key person / group for the fact sheet
  where?,        // place / region
  why?,          // one sentence on why it matters
  lat?, lng?,    // coordinates for the mini map
  area? }        // km radius -> drawn as a circle; "world" -> whole globe; omit -> pin
```

Coordinates are **baked** from `where` by `scripts/geo-fill.mjs` (run via
`npm run geo`, or automatically at the end of `npm run enrich`). The gazetteer in
`scripts/gazetteer.mjs` maps a `where` string to `lat` / `lng` / `area`; add new
place names there so future decks get maps too. Off-Earth `where` values (e.g.
`"The Moon"`) get `noMap: true` instead.

> **Known issue — the enrichment pass is stale.** `npm run enrich`
> (`scripts/enrich-cc.mjs`, `scripts/enrich-general.mjs`) still rewrites the
> pre-migration `events-data.js`, which is now the deck *registry* and holds no
> events. It therefore no longer touches deck content, which lives in
> `decks/<id>/deck.json`. Re-pointing the enrichment maps at the folder packages
> is tracked work, not done. `npm run geo` is unaffected.


## Play it

**Hosted over HTTPS is the shipping target.** Open the folder in any browser
(or `python3 -m http.server 8000`), but note that `file://` is a best-effort
dev-convenience path only — narration and deck loading behave differently there,
and it is never the build we ship.

```bash
cd timeline-game
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout
```
timeline-game/
├── index.html         # all screens (home / setup / game / results / browse / stats) + Settings
├── styles.css         # dark theme
├── events-data.js     # deck registry + shared filter helpers (window.DECKS, registerDeck)
├── decks-io.js        # deck JSON import/export (Blob + FileReader, no server)
├── timeline.js        # core engine: decks → filters → anchors, insert, score, split-screen, share text
├── fx.js              # interface effects layer (window.FX)
├── globe.js           # 3D globe dock (window.GlobeDock)
├── narration.js       # pre-rendered deck narration playback (window.Narrator)
├── narration-recipe.js # GENERATED browser copy of the spoken-text recipe (npm run gen:recipe)
├── decks/
│   ├── index.json     # GENERATED deck list (per-package revision + bytes)
│   ├── index.js       # GENERATED classic-script mirror of index.json
│   └── <id>/          # manifest.json + deck.json + deck.js (+ narration/*.mp3)
├── assets/            # vendored third-party code + media (never edited — AGENTS.md rule 2)
├── scripts/           # Node content tooling: content gate, index generation, geo, enrich
├── tools/content-pipeline/  # schema, provenance, briefs, source checks
├── tools/narration/   # author-time narration generator (recipe + Kokoro + ffmpeg)
├── doc/               # roadmap, gamification brief, content pipeline, market & library research
└── THIRD_PARTY_LICENSES.md  # attribution manifest, enforced by `npm run validate:vendor`
```

## The bundled decks

Four decks ship today — 321 events in total.

1. **World History: A First Timeline** (`world-history-first-timeline`) — 40 moments from the first Australians to Mandela, and the only deck with **voice narration** shipped so far (10 of its 40 events). Filters: Era (6), Continent (7), Theme (7). CC-BY-SA-4.0.
2. **Inventions & Discoveries** (`inventions-discoveries`) — 40 inventions and discoveries. CC-BY-SA-4.0.
3. **Classical Conversations** (`cc-timeline`) — the 161-event CC timeline (the user-supplied source list from `fiveintheforest.com/classical-conversations-timeline`), with:
   - **researched/confirmed years**, joined from two authoritative CC sources:
     - **week tags** from the canonical CC week-by-week grouping
       (fiveintheforest.com/classical-conversations-timeline),
     - **years + card order** from the dated CC reference list
       (religiousaffections.org classical-conversations timeline).
     Every Week-N card carries `week: N`; every continent filter returns only that
     continent (including the starting anchors — verified by test). Dates marked
     `circa` are approximate by CC's nature; "Creation" uses the Ussher chronology
     (c. 4004 BC) and "The Flood" c. 2348 BC as conventional anchors.
   - a **`week`** tag (CC Foundations 1–24) and a **`continent`** tag (africa / asia / europe / americas / oceania) on every event,
   - filter screens **By Ages**, **By Weeks**, and **By Continents**.

   > CC teaches order, not exact years — dates marked `circa` are approximate by nature. "Creation" uses the Ussher chronology (c. 4004 BC) as a conventional earliest anchor. The CC card "Rising Tide of Freedom" is placed at c. 2000 AD per the CC song's closing.

4. **World Literature** (`world-literature`) — 80 famous literary works ordered by the story's **setting** date, not its composition date; each card carries a display-only `composed` field. Filters: Era (7), Genre (7), Region (5).

## Add your own deck (pluggable)

Three routes, no engine changes needed:

1. **Import JSON from the app (easiest).** Settings → Decks → *Import from
   file*. A single deck object (or an export from this app) is validated and
   registered locally; re-importing an existing id replaces that deck.
2. **Drop a folder into `decks/`.** `decks/<id>/manifest.json` (id, name,
   version, license, description, `assets[]`) plus `decks/<id>/deck.json` (the
   deck data), then run `npm run gen:index` to regenerate `decks/index.json` +
   `index.js`. `npm run validate` asserts the package is complete and safe.
3. **Register it from a classic script** — `window.registerDeck(deck)` from a
   file loaded in `index.html`; no engine changes needed.

### Adding narration to a deck

```bash
npm run narration -- --deck <id> --dry-run   # review the words first (fast)
npm run narration -- --deck <id>             # render what changed
npm run narration -- --deck <id> --listen    # listening pass, by ear
npm run validate:narration                   # the gate
```

Rendering needs `ffmpeg` plus a one-time `npm --prefix tools/narration install`;
`--dry-run`, `--listen` and the gate need neither. Details, prerequisites and
the audio policy live in [tools/narration/README.md](tools/narration/README.md).

Deck shape (JSON decks cannot carry functions, so a filter declares *how* to
bucket an event and `events-data.js` resolves it):

```js
window.registerDeck({
  id: "my-deck",
  name: "My Topic",
  blurb: "One line of description.",
  emoji: "🧪",
  // optional multi-select filter groups; omit for a single-set deck
  filters: [
    { id: "era", label: "By Era", multi: true,
      options: [{ value: "ancient", label: "Ancient" }],
      get: { strategy: "ageBucket" },   // or { field: "continent" }
    },
  ],
  events: [
    { id: "ev1", title: "…", year: 1903, continent: "europe", week: 12,
      emoji: "🔬", fact: "Revealed after a correct placement." },
  ],
});
```

The engine reads `deck.filters` (multi-select, OR-within / AND-across), builds the subset, then runs the same anchor + insert + scoring loop. A deck needs at least 11 events (2 anchors + 8 placements + 1 spare) to be playable; smaller subsets disable Start with a hint.

## Grow the library with AI (optional)
Events follow this shape (WHEN?-style):
```js
{ id, title, year, category?: "tech"|"culture"|"discovery"|"world",
  continent?, week?, emoji, fact, circa? }
```

The generator uses a **cheap model — DeepSeek V3** (`deepseek-chat`) via the OpenAI-compatible endpoint. At mid-2026 rates that's roughly **$0.27 / 1M input and $1.10 / 1M output**, so a 10-event batch costs a fraction of a cent. Any OpenAI-compatible endpoint works (Groq, Together, OpenRouter…).

```bash
npm init -y
npm i openai dotenv
cp .env.example .env      # paste your DEEPSEEK_API_KEY
node generate-events.mjs  # writes generated-events.json
```

Then review `generated-events.json` and merge the entries into a deck —
`decks/<id>/deck.json` for a bundled package, or import them through
**Settings → Decks** for a local deck. This generator is ungrounded: it emits
plausible text with no source trail, so prefer `tools/content-pipeline/` for
anything that ships.

### Other cheap model options (mid-2026)
| Model | Input / 1M | Output / 1M | Notes |
|---|---|---|---|
| **DeepSeek V3** (`deepseek-chat`) | ~$0.27 | ~$1.10 | Default here; strong structured output |
| Gemini 2.5 Flash | ~$0.30 | ~$2.50 | Free tier; great if you want zero spend |
| GPT-4o-mini | ~$0.15 | ~$0.60 | Cheap, widely available |
| Llama 3.1-8B (Groq) | ~$0.05 | ~$0.08 | Cheapest; weaker facts, verify output |

## Tuning
Edit the constants at the top of `timeline.js`:
- `TOTAL_PLACEMENTS` — default placements when no game is running (Timdle = 8).
- `POINTS_PER_CARD` — points for a cleanly placed card (slips subtract 1 each).
- `ANCHOR_COUNT` — pre-placed events (WHEN? = 2).
- `MIN_PLACEMENTS` — smallest playable puzzle.

## Learning rationale

The failure rule is deliberately forgiving, per retrieval-practice research:
wrong placements **never end the run** — the student retries immediately with
corrective feedback, while slips reduce that card's points to zero (so the
score still rewards careful thinking).

- Unsuccessful retrieval attempts followed by feedback enhance learning as much
  as successful retrieval — Kornell, Hays & Bjork (2009),
  *J. Exp. Psychol.: LMC* — "taking challenging tests, instead of avoiding
  errors, may be one key to effective learning."
- Retrieval success vs. failure per se doesn't change learning outcomes; what
  matters is the attempt plus processing the feedback — Kornell & Vaughn (2016),
  *Psychol. Bull. Rev.*-style review — while warning that consistent failure
  can undermine motivation.
- Ending a run after N mistakes would cut practice volume short and often deny
  the student the full timeline reveal — the actual history content. Points
  provide the stakes; the retry loop provides the learning.

Research behind the learning and retention layer is filed in the repo:
`doc/GAMIFICATION_BRIEF.md` (ratified spec, with its own peer-reviewed evidence
list) and `doc/SUCCESS_FACTORS.md` (external "why education apps succeed"
research, evidence-graded, and explicitly subordinate to the other two).

## Credits & attribution

- **Map basemap (Satellite mode):** NASA Blue Marble imagery served via
  [NASA GIBS](https://earthdata.nasa.gov/eosdis/daac/nasa-gibs) — public domain,
  no attribution required. Falls back to the offline vector outline when offline.
- **Icons:** [Phosphor Icons](https://phosphoricons.com/) (MIT), inlined as one
  SVG sprite at the top of `index.html`.
- **Globe textures:** NASA Blue Marble and topology imagery, re-encoded as data
  URIs in `assets/earth-textures.js` — *image courtesy NASA Earth Observatory*.
- **Narration:** pre-rendered at author time with Kokoro-82M (Apache-2.0) by
  [`tools/narration/`](tools/narration/README.md); the runtime synthesis path is
  retired and nothing speech-related ships to the browser beyond the MP3s and
  the ~9 KB generated recipe the fallback voice reads from.
- **Full third-party manifest:** [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)
  — versions, licenses, the attributions that must appear in the app, and the
  components deliberately kept out of the shipping tree. `npm run validate:vendor`
  enforces it.
- **Liquid-glass refraction:** [rizzytoday/liquid-glass](https://github.com/rizzytoday/liquid-glass)
  (MIT), vendored at `assets/vendor/liquid-glass.js` and converted to a classic
  script for the no-build setup. Controls get true lens refraction on
  Chromium; Safari/Firefox fall back to CSS frosted glass automatically.
- **Design guidance:** UI/UX Pro Max skill (best-practice design system reference).
- **Background music:** "Battle Boss Fight Game Music" by Alex Morgan (Pixabay
  Content License, free to use) — `assets/audio/`. Loops continuously; paused
  and volume are remembered between visits.
- **Map library:** [Leaflet](https://leafletjs.com/) 1.9.4, vendored locally; land
  outline from [Natural Earth](https://www.naturalearthdata.com/) (public domain).
- **Timeline summaries:** [vis-timeline](https://github.com/visjs/vis-timeline)
  8.5.4 (MIT / Apache-2.0), vendored standalone build at `assets/vendor/` —
  interactive pan/zoom timeline on the Progress and Library pages, colored by
  the player's per-event progress (green first-try / amber slips / grey not
  attempted), with BCE-aware axis labels.

## License
MIT — fork it, host it, extend it.
