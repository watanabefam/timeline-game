# AGENTS.md — timeline-game

Agent-facing conventions for this repo. Player/content docs live in `README.md`;
the cross-platform plan lives in `doc/CROSS_PLATFORM_ROADMAP.md`.

## What this is

A no-backend timeline-ordering game (place historical events in chronological
order) built as **plain HTML/CSS/JS with no build step**. Decks are pluggable
data files. Runs from any static server **and from `file://`**.

## Hard rules

1. **No build step, no framework, no npm runtime dependencies.** The game must
   keep working when opened via `file://`. Everything first-party is a classic
   (non-module) script loaded by `index.html`.
2. **Never edit anything under `assets/`** — it is vendored third-party code.
   To add a library: download the release bundle into `assets/vendor/`, keep
   its license header, pin the version (record it in the file header comment),
   and load it with a `<script>` tag.
3. **Cache-busting:** first-party scripts load with `?v=N`
   (`fx.js?v=11`, `timeline.js?v=81`). Bump `N` whenever you edit that file,
   or returning players get stale code.
4. **Script load order in `index.html` matters** (classic scripts, sync):
   `events-data.js` → Leaflet → `world-land.js` → `liquid-glass.js` →
   `vis-timeline` → `anime.umd.min.js` → `fx.js` → `timeline.js`.
   `fx.js` must load before `timeline.js` (it defines `window.FX`).
5. **Run the content gate after touching deck data:**
   `npm run validate` (Node ≥18). It enforces the fact-quality rule across all
   decks in `decks/`. The enrichment scripts (`npm run enrich`) also run it.

## File map

| File | Role |
|---|---|
| `index.html` | All screens (home/setup/game/results/browse/stats), Settings modal, script tags |
| `timeline.js` | The entire game: state, screens, placement logic, vis-timeline rendering, Leaflet maps, glass init, settings |
| `fx.js` | Interface effects layer → `window.FX` (see below) |
| `events-data.js` | Deck loader + `window.DECKS` registry |
| `decks/*.js` | Deck data files (script-tag globals, not modules — `file://` safe) |
| `scripts/*.mjs` | Node content tooling only (never loaded by the game) |

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

## Verification workflow (no test suite)

There is no unit test framework. Verify changes in a real browser:

```bash
python3 -m http.server 8000        # then open http://localhost:8000
```

Smoke checklist for FX changes: curtain sweeps both directions with correct
slant, title carries deck name (setup) / "Game Start!" (game), no console
errors, glass present at load and after transitions, reduced-motion emulation
swaps instantly, `?v=` bumped on edited files.

## Conventions

- **Style:** the codebase uses IIFE + `"use strict"`, `const`/`let`, template
  literals, `$("id")` helper for DOM lookups. Match it; don't introduce
  modules, JSX, or TypeScript.
- **State:** game state lives in module-level objects inside the
  `timeline.js` IIFE; persistence via `localStorage` with `try/catch` guards
  (keys: `timeline.users.*`, `timeline.fx`, `timeline.mapMode`, …).
- **A11y:** `prefers-reduced-motion` is a hard floor — any new motion needs a
  reduced-motion story. Toggles use `aria-pressed`.
- **Commits:** short imperative one-liners (`Fix deck loading on file://
  protocol: hardcoded fallback`).
- `audit-report.md` is generated by the audit skill and safe to regenerate;
  commit it only if you want the snapshot in history.
