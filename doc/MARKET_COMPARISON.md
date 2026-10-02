# Timeline Game — Market Comparison & Feature Research

Comprehensive competitive research compiled from marketplace searches, codebase review, and AI-assisted evaluation.
Prepared for the `timeline-game` repo (Education/timeline-game).

---

## 1. Market Landscape

The timeline-ordering / chronological-sorting niche is well-populated across three platforms:

- **Web daily-puzzle games** — browser-based, Wordle-style daily puzzles, free, minimal friction
- **Mobile apps** — iOS/Android, free-to-play with IAP/subscriptions, larger content libraries
- **Physical card games** — retail products that inspired the digital genre

Your game sits in a hybrid position: the **web daily-puzzle mechanic** with **pluggable decks**, **offline capability**, and **no account / no ads / no IAP** — a differentiator none of the digital competitors match.

---

## 2. Competitor Profiles

### 2.1 Web / Browser Games

| Game | URL | Platform | Pricing | Description |
|---|---|---|---|---|
| **Timeline Game (yours)** | `https://<your-host>/` | Web, offline-capable | Free, no ads | 3 decks, 283 events, pluggable content, vis-timeline progress, fact sheets, Leaflet maps, player profiles, focus practice |
| **Chronle** | https://chronle.com | Web | Free | Daily puzzle, 6 moves max, same events for everyone, shareable stats, account optional, ~100+ events, Wordle-style |
| **Chrono Game** | https://apps.apple.com/us/app/chrono-game/id6449153769 | iOS | Free | Daily history game, 4.9★, no IAP noted |
| **Timdle** | https://www.timdle.com | Web | Free | Daily timeline puzzle, Wordle-style, limited events per day, shareable results |
| **Defrag — Daily Chronology** | https://apps.apple.com/us/app/defrag-daily-chronology-game/id6758625499 | iOS | Free / IAP | Daily 16-tile grid, streak tracking, streak freeze tokens, Pro $2.99/mo or $29.99/yr |

### 2.2 Mobile Apps (iOS / Android)

| Game | URL | Platform | Pricing | Description |
|---|---|---|---|---|
| **Chronology: History Puzzle** | https://apps.apple.com/us/app/chronology-history-puzzle/id6759166799 | iOS | Free / IAP | 2026 release, history puzzle, minimalist interface, multi-topic categories, drag-and-drop |
| **TimeSort** | https://apps.apple.com/us/app/timesort-history-game/id6479203877 | iOS | Free / IAP | Fact sheets, unlock categories, 3→6 cards progression, events/monuments/books/literature, subscription $1.99/mo, $12.99/yr, $29.99 lifetime |
| **Sorting History** | https://sorting-history.appstor.io/ / https://sortinghistory.com/compare/ | iOS | Free / Subscription | 1,200+ events, 12 categories, Daily Challenge, streak tracking, two game modes, Explorer $1.99/mo or $9.99/yr or $29.99 lifetime; Historian $2.99/mo or $14.99/yr or $44.99 lifetime |
| **History Shuffle** | Search: "History Shuffle Android" | Android | Free / IAP | AI opponent, multiple difficulty tiers, ad-supported |
| **When Did It Happen?** | Search Android store | Android | Free | Simple chronological ordering, minimal features |
| **Past Puzzle — History Game** | https://apps.apple.com/us/app/past-puzzle-history-game/id6751806998 | iOS | Free / IAP | Explorer $3.99, Chronicler $89.99 (one-time) |
| **Krono History Trivia** | https://apps.apple.com/us/app/krono-history-trivia/id1613353323 | iOS | Free / IAP | Monthly $1.99, yearly $12.99, one-time $19.99, lifeline packs |
| **Timeline Quiz** | https://apps.apple.com/us/app/timeline-quiz/id6673895850 | iOS | Free | Single-device multiplayer, offline, card images |
| **The Timeline Game** | https://apps.apple.com/us/app/the-timeline-game/id1502237831 | iOS | Free | Ancient/Middle Ages/Modern, drag-and-drop, achievements |

### 2.3 Physical Card Games

| Game | URL | Pricing | Description |
|---|---|---|---|
| **Timeline (Asmodee 2025 Refresh)** | https://store.asmodee.com/products/timeline-2025-refresh | ~$15–20 | 96 cards, 2–6 players, ages 8+, 15 min playtime, multiple themes |
| **Timeline: Events (BGG)** | https://boardgamegeek.com/boardgame/113401/timeline-events | Varies | Original 2011 edition, 12+ expansions |
| **Chronology (Buffalo Games)** | https://buffalogames.com/chronology/ | $21.99 | 429 cards, 858 events, 2–8 players, ages 14+, made in USA |

---

## 3. Comprehensive Feature Comparison

Legend: ✅ = supported · 🟡 = partial/limited · ❌ = not supported · — = not applicable / unknown

| Feature | Timeline Game (yours) | Chronle | TimeSort | Sorting History | Chronology (iOS) | Timeline (Asmodee) | Chronology (Buffalo) |
|---|---|---|---|---|---|---|---|
| **Core Mechanic** |
| Chronological ordering | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Drag-and-drop placement | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (cards) | ✅ (cards) |
| Growing timeline | ✅ | ❌ (fixed set) | ❌ (fixed set) | ✅ | ❌ | ✅ | ✅ |
| Feedback: correct/incorrect | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Content** |
| Pluggable deck system | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (expansions) |
| Multi-select filters | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Deck import/export | ✅ (JSON) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Custom deck builder | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Voice narration | ✅ (pre-rendered, shipped with the deck) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Number of events | 321 | ~100+ | Not disclosed | 1,200+ | Not disclosed | 96 cards | 858 events |
| Number of categories/decks | 4 | 1 | Multiple (events/monuments/books/art) | 12 | Multiple topics | Multiple themes | 1 |
| Fact sheets (who/where/why) | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Mini location maps | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Game Modes** |
| Unlimited play | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Daily challenge | ❌ (single mode; no daily-puzzle loop — reseeded daily researched, not built) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Streak tracking | ❌ (designed in `GAMIFICATION_BRIEF.md` D1–D3, unbuilt) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Streak freezes | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Shareable results | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Exact-year guessing mode | ❌ | ❌ | ❌ | ✅ (History Pinpoint) | ❌ | ❌ | ❌ |
| Speed-round / timed | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| AI opponent | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Multiplayer (local/online) | ✅ (split-screen, one device) | ❌ | ❌ | ❌ | ❌ | ✅ (pass-and-play) | ✅ (pass-and-play) |
| **Learning & Accessibility** |
| Focus / spaced-repetition | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Player profiles | ✅ | ❌ | ❌ | ✅ (mastery paths) | ❌ | ❌ | ❌ |
| Progress tracking | ✅ | ✅ (account) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Dyslexia-friendly / structured literacy | 🟡 (designed for) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Age-appropriate content | ✅ (homeschool) | 🟡 | ✅ | ✅ | ✅ | ✅ (8+) | ✅ (14+) |
| **Technical** |
| Runs in browser | ✅ | ✅ | ❌ (iOS) | ❌ (iOS) | ❌ (iOS) | N/A | N/A |
| No account required | ✅ | ✅ | ❌ | ❌ | ❌ | N/A | N/A |
| Offline capable | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | N/A |
| No ads | ✅ | ❌ | ❌ | 🟡 (free tier has ads) | ❌ | N/A | N/A |
| No IAP | ✅ | ❌ | ❌ | ❌ | ❌ | N/A | N/A |
| Open source / inspectable | ✅ | ✅ (AGPL) | ❌ | ❌ | ❌ | N/A | N/A |
| **Visual / UX** |
| vis-timeline progress | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| FX layer (confetti, animations) | ✅ | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ |
| Historical images | ❌ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ |
| Leaderboards | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 4. Pricing Summary

| Game | Free Tier | Premium / IAP |
|---|---|---|
| **Timeline Game (yours)** | Free, no ads, no IAP | N/A |
| **Chronle** | Free (daily puzzle) | None known |
| **Chrono Game** | Free | None noted |
| **Timdle** | Free | None known |
| **Defrag** | Free daily puzzle | Pro $2.99/mo, $29.99/yr; coins $0.99–$7.99 |
| **Chronology (iOS)** | Free download | IAP: full game unlock $1.99 |
| **TimeSort** | Free | Subscription $1.99/mo, $12.99/yr, $29.99 lifetime |
| **Sorting History** | Free with ads | Explorer $1.99/mo, $9.99/yr, $29.99 lifetime; Historian $2.99/mo, $14.99/yr, $44.99 lifetime |
| **Past Puzzle** | Free | Explorer $3.99, Chronicler $89.99 one-time |
| **Krono History Trivia** | Free | $1.99/mo, $12.99/yr, $19.99 one-time; lifelines $0.99–$3.99 |
| **ChronoPath** | 5 free generations | Pro $4.99/mo or $39.99/yr; coins $1.99–$9.99 |
| **Timeline (Asmodee)** | — | ~$15–20 retail |
| **Chronology (Buffalo)** | — | $21.99 retail |

---

## 5. Competitive Gaps & Opportunities

### 5.1 What You Do Better Than Any Competitor

| Advantage | Evidence |
|---|---|
| **Free + no ads + no IAP + offline** | No digital competitor offers all four. Every mobile app monetises via ads or subscriptions. |
| **Pluggable deck system** | No digital competitor lets users swap content packs with independent filter screens. Sorting History's 12 categories are baked in. |
| **Fact sheets + location maps** | Only TimeSort and Sorting History approach this; yours adds Leaflet maps and vis-timeline progress simultaneously. |
| **No account / no build step** | Runs from any static host. Chronle requires an account for cross-device progress. (`file://` is a best-effort dev convenience only — never the shipping target.) |
| **Voice narration** | No competitor in the niche reads the cards aloud, and none ships the audio (runtime TTS would need a network + a synthesis engine). Pre-rendered MP3s ship with the deck, work offline, and never speak the answer year. |

### 5.2 Highest-Value Missing Features (with proven market demand)

| # | Feature | Proof of Demand | Effort | Priority |
|---|---|---|---|---|
| 1 | **Daily challenge mode** — 🔜 researched, not built (`doc/LIBRARY_RESEARCH.md` §4.1: date-seeded from the existing PRNG, no new dependency) | Chronle, Timdle, Sorting History, Defrag all use it; single strongest retention mechanic in the niche | Low | Critical |
| 2 | **More content / decks** — ✅ now 4 decks / 321 events; still the biggest content gap | Sorting History has 1,200+ events across 12 categories | Medium | High |
| 3 | **Shareable result grid** — 🟡 a flat text result already ships (`shareText()`); the per-round row grid does not | Chronle/Timdle shareable grids drive organic acquisition; zero-cost virality | Low | High |
| 4 | **Streak tracking + freezes** — 🔜 designed (`doc/GAMIFICATION_BRIEF.md` D1–D3, including the no-dark-pattern rules), not built | Defrag, Sorting History, Chronle all have it; proven retention multiplier | Low | High |
| 5 | **Difficulty progression / unlock system** | TimeSort unlocks 3→6 cards; gives players a progression goal | Low | Medium |
| 6 | **Deck import/export + community sharing** — ✅ import/export shipped (`decks-io.js`); 🟡 community *sharing* (a shareable deck artefact) is not | No competitor offers user-generated content; would differentiate the platform | Medium | Medium |
| 7 | **Exact-year guessing mode** | Sorting History's History Pinpoint; broadens audience | Medium | Medium |
| 8 | **Timed / speed-round mode** | Untapped; easy to build on existing code | Low | Medium |
| 9 | **Age-tiered content** — 🔜 designed (`doc/GAMIFICATION_BRIEF.md` §5: optional `ageBand` gating copy/practice-mix only, never features) | Homeschool market explicitly needs kids vs. adult pools | Medium | Medium |
| 10 | **Local pass-and-play multiplayer** — ✅ shipped as split-screen two-player (per-pane input, rail and globe; head-to-head results) | Physical card games prove the mechanic; zero backend needed | Medium | Low |
| 11 | **AI opponent** | History Shuffle has it; competitive mode increases engagement | Medium | Low |
| 12 | **Online multiplayer** | Highest effort; defer until daily challenge + social are proven | High | Low |

---

## 6. Source Notes

- Competitor pricing and feature claims verified via App Store listings, official websites, and direct app pages as of 2026-09-08.
- Chronle license: AGPL-3.0 (https://github.com/ajhenry/chronle.com) — free to inspect, but AGPL requires sharing modifications if serving publicly.
- Your game codebase reviewed (refreshed 2026-09-29): 4 deck packages (`world-history-first-timeline`, `inventions-discoveries`, `cc-timeline`, `world-literature`), 321 events, deck JSON import/export, pre-rendered narration, split-screen two-player, vendored UMD scripts, no build step.
- Feature ratings based on direct codebase inspection, not marketing copy. Competitor columns are unchanged since 2026-09-08 and were not re-verified on 2026-09-29.

---

## 7. Next Steps

*Status as of 2026-09-29 — see `doc/LIBRARY_RESEARCH.md` for the build decisions behind each.*

1. **Prioritise Tier 1** (Daily challenge, streak, share grid) — these compound and are proven in-market, and all three are still unbuilt. Streak depends on the mastery review log (`AGENTS.md` product direction), so the log is the real first step.
2. **Grow content library** — the pluggable-deck mechanism is ready and now holds 4 decks / 321 events; content volume remains the biggest gap vs. Sorting History.
3. **Shipped since this research:** deck import/export, split-screen two-player, voice narration. Keep them out of the backlog.
3. **Validate homeschool angle** — no competitor explicitly targets homeschooling families; this is a positioning advantage worth testing.

---

*Research compiled from OpenCode session `ses_f80534df6ffeKuq3dtXfM24EEs` (2026-09-08) plus live web verification.*

---

## 8. Corroborating research (added 2026-09-11)

A second, independent line of research — **why successful education apps succeed**
(Duolingo, Khan Academy, Coursera, Quizlet, SplashLearn, Seesaw, Socratic) — has
been filed, source-by-source and evidence-graded, in
[`SUCCESS_FACTORS.md`](./SUCCESS_FACTORS.md).

What it changes here:

- **§5.2 #1 (daily challenge), #3 (shareable result grid), #4 (streak tracking)**
  each gain a second, independent practitioner line of support. Their priority is
  unchanged and their evidence grade is **not** upgraded — that corpus carries no
  effect sizes and no peer-reviewed source.
- **§5.2 #6 (deck import/export + community sharing)** is re-read as the *growth*
  mechanic rather than a convenience: for a static, backend-free app the only
  organic loop is the artefact a learner can hand to another learner. Quizlet's
  verified growth came from user-created content, not marketing.
- Its monetization lessons (IAP, subscriptions, "profitability from day one") do
  **not** apply while this game is free, ad-free, and IAP-free — see
  `SUCCESS_FACTORS.md` §5 and §9 Q1.
- It must **not** be cited in a commercial plan (`SUCCESS_FACTORS.md` §6.5, §7).

**Footnote on the "Daily challenge ❌" row above:** that means *no shared
Wordle-style daily puzzle*, which is still accurate. The app's own on-screen
`DAILY` tag is a vestigial label — the game runs a single mode (wrong placements
bounce back; `ENDLESS_LIVES` survives only in unreachable loss copy). See
`SUCCESS_FACTORS.md` §3.

---

## 9. Open-source comparables & seed datasets (added 2026-10-02)

The competitor profiles above are **closed-source** (no repo for Timdle, Chrono,
Sorting History / History Pinpoint, TimeSort, or TimeToTime). This section catalogues
the open-source games in the same space and the openly-licensed datasets that could
seed decks. Licenses verified via the GitHub REST API (license field) + README reads,
2026-10-02. This repo's vendoring rule is **permissive-only** (`AGENTS.md` rule 2) —
anything marked ⚠️ is study-only.

### 9.1 Exact-year / "guess the year" repos

| Repo | License | Stack | Mechanic | Notes |
|---|---|---|---|---|
| [misty-step/chrondle](https://github.com/misty-step/chrondle) | **MIT** | Next.js/React | Drag a year **range** onto the timeline; Classic + Duel + Order | Best pick: MIT, active (pushed 2026-10), ships three target modes |
| [kimfrithiof/moments](https://github.com/kimfrithiof/moments) | Code MIT; prose CC BY 4.0; images mixed | React/Vite | Drag card along a continuous timeline "shuttle"; era-scaled tolerance | Best exact-year UX study |
| [kyletscheer/historicle](https://github.com/kyletscheer/historicle) | **GPL-3.0** ⚠️ | **Vanilla, no build** | Wordle-style date guesser; ~300 Wikipedia-linked events | Only exact-year **no-build** example; read, don't copy |
| [bananashell/timegame](https://github.com/bananashell/timegame) | None ⚠️ | Next.js | Guess the year, stay chronologically consistent | Reference only |
| [davjhan/guess-the-year-game](https://github.com/davjhan/guess-the-year-game) | None ⚠️ | Svelte | Type the year; 48★ | Stale 2021; depends on an unpublished pkg (won't build) |
| [Naught0/inventedle](https://github.com/Naught0/inventedle) | **AGPL-3.0** ⚠️ | Next.js | Guess an invention's year within a range | Copyleft — ideas only |
| [win-wiz/time-guessr-game](https://github.com/win-wiz/time-guessr-game) | None ⚠️ | Next.js | Guess year **+ location** from photos | Pinpoint + map hybrid |
| [SachaCarniere/historyguessr](https://github.com/SachaCarniere/historyguessr) | None ⚠️ | PHP | Year from historical images | Abandoned 2020 |
| [savreline/what-year](https://github.com/savreline/what-year), [PhillipAC/Rydle](https://github.com/PhillipAC/Rydle) | None ⚠️ | MERN / — | Year-guessing trivia | Minor |

### 9.2 Ordering / timeline repos

| Repo | License | Stack | Notes |
|---|---|---|---|
| [tom-james-watson/wikitrivia](https://github.com/tom-james-watson/wikitrivia) | **MIT** | Next.js | 598★, most maintained; Timeline-board clone. **Data factory** is the prize: Wikidata SPARQL → plain JSON decks in `public/decks/` |
| [wimmers/timeliner](https://github.com/wimmers/timeliner) | None ⚠️ | React | Multi-deck JSON (`events/inventions/architecture/climate/fashion`), Survival/Forever |
| [ValdesDev/Timeline](https://github.com/ValdesDev/Timeline) | None ⚠️ | **Vanilla, no build** | Faithful Timeline-clone skeleton (gap-insertion, 3-strikes) — best no-build structure example |
| [ondrejsaba/timeline-trivia](https://github.com/ondrejsaba/timeline-trivia) | **MIT** | React | Simple chronological sort |
| [whatnote/…beforeorafter](https://github.com/whatnote/ms2historybeforeorafter), [Megwana/whatcamefirst](https://github.com/Megwana/whatcamefirst) | None ⚠️ | **Vanilla, no build** | Higher/lower before–after logic |
| [clemensfiedler/history-quiz](https://github.com/clemensfiedler/history-quiz) | None ⚠️ | React | CSV→JSON pipeline + **era tags** (reusable taxonomy idea) |
| [ajhenry/chronle.com](https://github.com/ajhenry/chronle.com) | **AGPL-3.0** ⚠️ | Next.js | Daily drag-into-order (already noted §6) |
| [ethangreeney/when-timeline-game](https://github.com/ethangreeney/when-timeline-game) | None ⚠️ | Next.js | The README's cited inspiration; 902 curated events |

### 9.3 Seed datasets (dated historical events)

| Dataset | License | Notes |
|---|---|---|
| [Wikidata](https://www.wikidata.org) facts + [Wikipedia](https://en.wikipedia.org) text | **CC0** facts / **CC BY-SA** text | Dates are free; descriptions/images need attribution |
| [slashyear.com/data](https://slashyear.com/data) | **CC BY-SA 4.0** | **121,329 dated entries** (79,250 events + 42,079 births/deaths); bulk NDJSON + CORS-open REST + MCP; each row carries a frozen Wikipedia revision ID |
| [HistoryMap-Data](https://github.com/AdamKmet1997/HistoryMap-Data) | **CC BY-SA 4.0** | JSON per event with `title/year/lat/lng/country/category/sources[]`, 35+ countries — cleanest deck shape (+ coords for a map mode) |
| [EventKG](https://zenodo.org/records/1205373) | CC BY-SA | Wikidata+DBpedia+YAGO RDF; heavyweight |
| [vizgr.org Historical Events API](https://vizgr.org/historical-events/) | ⚠️ uncertain | ~192k events; discovery only until the license is confirmed |

**Absences.** No open-source repo/implementation exists for **Timdle, Chrono, Sorting
History / History Pinpoint, TimeSort, or TimeToTime** — the exact-year mechanic is
studyable only via the repos above.

