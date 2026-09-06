# Timeline Game

An open, no-backend **timeline-ordering game** inspired by [Timdle](https://www.timdle.com/) and [WHEN?](https://github.com/ethangreeney/when-timeline-game). Place each mystery event into the right gap of a growing timeline. Correct placement locks the card and scores more as the line grows; wrong placement costs a life.

It runs entirely in the browser — **no build step, no server, no account.**

## Features
- **Pluggable decks.** Each deck (`world-history`, `classical-conversations`, …) is a self-contained content pack with its own events **and** its own filter screens.
- **Multi-select filter screens.** Before playing, the deck can offer filter groups (e.g. *By Ages*, *By Weeks*, *By Continents*) where the player picks **one or more** options. Within a group the choice is OR; across groups it is AND. No selection in a group = whole deck. Empty combinations are caught and the Start button is disabled with a hint.
- **Every run is a fresh randomized puzzle** drawn from the chosen deck + filters + play count (seeded Fisher–Yates, era-balanced for variety).
- Two revealed anchors + insert-into-gaps loop (combines the Timdle anchor with the WHEN? incremental-insert mechanic).
- **Flat, transparent scoring:** every card you place is worth 3 points; each slip on it costs 1 (floor 0). Max = 3 × cards placed, so `score / (3N)` is an instant mastery percentage. Per-card `+N` chips on the results screen make the feedback micro-level (see Learning rationale). Same-year rule. Wrong placements bounce back — runs can't end early, which maximizes retrieval practice with immediate corrective feedback. The **Play count** selector sets how many events *you* place (2 anchors are pre-placed on top).
- Year + a one-line fact revealed after each placement.
- **Local player profiles** (no accounts): 👤 button on every screen opens a
  picker — add/switch/rename/delete players; each player's runs, per-event
  accuracy and mastery are stored locally (`timeline.users.v1` +
  `timeline.user.<id>.v1`). Clearing browser storage erases them.
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

This rule is **enforced for any future deck**: append a deck to `window.DECKS`
and `npm run validate` checks it too. The generator (`generate-events.mjs`) is
prompted to obey the same rule and to emit the structured `who` / `where` / `why`
fields that power the fact sheet.

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

To rebuild the bundled decks' facts after editing the enrichment maps, run
`npm run enrich` (rewrites `events-data.js`, bakes coordinates, and re-validates).


## Play it
Just open `index.html` in a browser. For module-free local serving:

```bash
cd timeline-game
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout
```
timeline-game/
├── index.html         # markup: hub / setup / game / results / browse
├── styles.css         # dark theme
├── events-data.js     # pluggable DECK registry (window.DECKS) + content
├── timeline.js        # core engine: deck select → filters → anchors, insert, score, lives, daily seed
├── generate-events.mjs  # AI content generator (optional)
├── assets/
│   ├── leaflet/        # vendored Leaflet 1.9.4 (offline map engine)
│   └── world-land.js   # Natural Earth 110m land outline as window.WORLD_LAND
├── scripts/
│   ├── validate-content.mjs  # enforces the fact-quality rule
│   ├── enrich-cc.mjs / enrich-general.mjs  # researched fact-sheet fields
│   ├── geo-fill.mjs    # bakes lat/lng/area from `where` via the gazetteer
│   └── gazetteer.mjs   # place → coordinates + area classification
├── .env.example
└── README.md
```

## The two bundled decks
1. **World History** — the original 33-event starter library (tech / culture / discovery / world).
2. **Classical Conversations** — the 161-event CC timeline (the user-supplied source list from `fiveintheforest.com/classical-conversations-timeline`), with:
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

## Add your own deck (pluggable)
Append one object to `window.DECKS` in `events-data.js`. No engine changes needed:

```js
window.DECKS.push({
  id: "my-deck",
  name: "My Topic",
  blurb: "One line of description.",
  emoji: "🧪",
  // optional multi-select filter groups; omit for a single-set deck
  filters: [
    { id: "era", label: "By Era", multi: true,
      options: [{ value: "ancient", label: "Ancient" }],
      get: (ev) => ageBucket(ev.year) },          // returns value or [values]
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

Then review `generated-events.json` and merge entries into a deck in `events-data.js`.

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

## Credits & attribution

- **Map basemap (Satellite mode):** NASA Blue Marble imagery served via
  [NASA GIBS](https://earthdata.nasa.gov/eosdis/daac/nasa-gibs) — public domain,
  no attribution required. Falls back to the offline vector outline when offline.
- **Gear icon:** [Lucide](https://lucide.dev/) (`settings` icon), MIT licensed,
  inlined as SVG.
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
