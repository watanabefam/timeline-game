# 📋 Audit Report: timeline-game

Date: 2026-09-08
Auditor: audit-project skill (adapted for a non-skill vanilla web project — SKILL.md/template/deployment-symlink phases N/A, weights redistributed)

## Overall Score: 89/100 — 🟡 Good

| Category | Score | Weight | Weighted |
|---|---|---|---|
| Deployment health | 95/100 | 25% | 23.8 |
| Convention gaps | 80/100 | 25% | 20.0 |
| Project health | 85/100 | 30% | 25.5 |
| Security scan | 100/100 | 20% | 20.0 |
| Structural compliance (SKILL.md) | N/A | — | excluded |
| Template consistency | N/A | — | excluded |
| **Total** | | | **89.3** |

Verdict: 🟡 PASS (0 failures, 2 warnings, several INFO)

## Items to Fix (ranked by impact)

1. 🟡 [WARN] **Entire FX layer is uncommitted** — `git status`: `M index.html`, `M timeline.js`, untracked `fx.js` (266 lines) + `assets/vendor/anime.umd.min.js` (118KB). This is the complete effects feature from the current work session sitting outside version control — one bad checkout away from loss. Commit it.
2. 🟡 [WARN] **No AGENTS.md** — the project is heavily agent-worked but documents its conventions only in README (player/content-facing). Agent-facing conventions are undocumented: no-build vanilla JS, vendor-script pattern with cache-busting `?v=`, deck schema + `npm run validate` gate, FX layer architecture (`window.FX`, reduced-motion contract), screen-order/curtain-direction map.
3. ℹ️ [INFO] No `.ignore`/`.agentignore` — `grep`/`glob` sweep `assets/vendor/`, `assets/leaflet/` (2,100+ KB of vendored minified code) on every search. Add an ignore file.
4. ℹ️ [INFO] `timeline.js` is a 2,180-line monolith — acceptable while no-build by design, but split per-screen modules when Phase 2 (Vite) lands per `doc/CROSS_PLATFORM_ROADMAP.md`.
5. ℹ️ [INFO] `index.html` has `<title>` but no `<meta name="description">`.
6. ℹ️ [INFO] Project is a LOW indexing candidate for codebase-memory (13 source files). Revisit if it grows past ~20 files.

## Detailed Findings

### Phase 0: Index availability
- codebase-memory-mcp: installed (present in agent toolset).
- Project not indexed; suitability LOW (13 source files < 20 threshold) → not a candidate, no prompt.

### Phase 1: Inventory
| Area | Files |
|---|---|
| App | `index.html` (324), `timeline.js` (2,180), `styles.css` (844), `fx.js` (266), `events-data.js` (83) |
| Decks | `decks/manifest.json`, `world-history.js`, `world-literature.js`, `classical-conversations.js` |
| Content tooling | `scripts/{validate-content,enrich-cc,enrich-general,gazetteer,geo-fill}.mjs`, `generate-events.mjs` |
| Vendored | `assets/vendor/{anime.umd.min.js, liquid-glass.js}`, `assets/leaflet/{leaflet.js,leaflet.css}`, `assets/world-land.js` |
| Docs | `README.md` (227), `doc/CROSS_PLATFORM_ROADMAP.md` |
| Config | `package.json` (no deps — Node tooling only), `.gitignore`, `.env.example` |

### Phase 2/3: SKILL.md & templates — N/A
Not an OpenCode skill project. No SKILL.md, AGENTS.md, `templates/`, `.opencode/`, `opencode.jsonc`, or `project-gate/`.

### Phase 4: Deployment health — 95/100
- ✓ Vendored deps pinned with version markers (anime.js v4.5.0 + MIT header, liquid-glass MIT header, Leaflet 1.9.4 + copyright retained).
- ✓ Cache-busting `?v=` on first-party scripts (`fx.js?v=11`, `timeline.js?v=81`).
- ✓ `file://` protocol support (commit b640767 fixed deck loading for it).
- ✓ Zero runtime npm dependencies — no supply-chain surface for the game itself.
- − No build/CI step yet (by design; roadmap Phase 2 adds Vite + Capacitor/Tauri).

### Phase 5: Convention gaps — 80/100
- ✓ Error handling: all `try/catch` sites log via `console.error` with context; FX layer degrades gracefully (`window.anime` / `window.FX` guards).
- ✓ No inline event handlers (addEventListener pattern — CSP-friendly).
- ✓ `prefers-reduced-motion` honored at call time in FX; OS setting overrides the in-game toggle.
- − [WARN] No AGENTS.md (see fix list #2).
- − [INFO] No `.ignore` (see fix list #3).

### Phase 7: Project health — 85/100
- 7a CLI: `npm run validate` → **passes** ("✓ All events pass the fact-quality rule", 3 decks). Content gate is real and enforced.
- 7b/7c: no tool defs / opencode config — N/A.
- 7d Git: branch `main`, 4 clean commits, no stash, no detached HEAD. − [WARN] 4 uncommitted/untracked paths = the whole FX feature (fix list #1).
- 7e File budget: `timeline.js` 2,180 lines (INFO — monolith, see fix list #4); `fx.js` 266 ✓; `styles.css` 844 ✓.
- 7f Gate: none installed (N/A; `project-optimizer` can deploy one if wanted).

### Phase 8: Security scan — 100/100
- ✓ No hardcoded secrets. `generate-events.mjs` reads `DEEPSEEK_API_KEY` from `.env` (git-ignored, verified via `git check-ignore`), `.env.example` documents setup, fails loudly when missing.
- ✓ No dangerous shell patterns (`eval`, `rm -rf /`, `curl | bash`, `sudo`) in any script.
- ✓ No inline event handlers in HTML.
- ℹ️ Network surface: `generate-events.mjs` calls DeepSeek API (offline content tooling, not runtime). Game runtime loads external map tiles in satellite mode (expected for Leaflet); land polygons are local (`world-land.js`).
- Heuristic scan — clean result is not a security guarantee.

## Strengths worth keeping
- Working content-validation gate (`npm run validate`) wired into the enrichment pipeline.
- Disciplined vendor convention: pinned versions, license headers retained, cache-busting.
- Accessibility baseline: `lang`, viewport, `prefers-reduced-motion` (call-time evaluation), aria-pressed toggles.
- Zero runtime dependencies for the game itself.
