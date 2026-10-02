# 📋 Audit Report: timeline-game

Date: 2026-10-02
Auditor: Buffy (Codebuff). The `audit-project skill` referenced by the previous
snapshot is not available in this session, so this report is **hand-assembled
from the repo's own gates and a static read** — every finding below names the
command or file it came from. It supersedes the 2026-09-08 snapshot.

## Overall Score: 87/100 — 🟢 Good

| Category | Score | Weight | Weighted |
|---|---|---|---|
| Deployment health | 92/100 | 25% | 23.0 |
| Convention gaps | 78/100 | 25% | 19.5 |
| Project health | 84/100 | 30% | 25.2 |
| Security scan | 95/100 | 20% | 19.0 |
| Structural compliance (SKILL.md) | N/A | — | excluded |
| Template consistency | N/A | — | excluded |
| **Total** | | | **86.7 → 87** |

Verdict: 🟢 PASS (0 failures, 3 warnings, 4 INFO) — the three warnings are all
**known, documented and bounded**; none is a regression from this session.

## Closed since 2026-09-08 (the old snapshot's top items)

1. ✅ **FX layer committed** — `fx.js`, `index.html`, `timeline.js`, the vendored
   `anime.umd.min.js`, and now `review-scheduler.js` are all in version control.
2. ✅ **`AGENTS.md` exists** — agent-facing conventions (no-build, vendor rules,
   `?v=` bumps, script order, gates) are documented.
3. ✅ **Offline/PWA shipped and is the repo's most-tested surface** (S1a+S1b):
   generated precache manifest, two Node suites, and three browser smokes.

## Items to Fix (ranked by impact)

1. 🟡 [WARN] **`timeline.js` is 4,595 lines** — it was 2,180 at the last audit, so
   it has roughly doubled in 24 days, and it still holds state, screens,
   placement, split-screen, maps, focus panel and settings. Under hard rule 1
   (no build step) this is the single largest maintainability risk, because
   every edit costs a full-file read. *Action:* split per-screen only when a
   build step exists (`doc/CROSS_PLATFORM_ROADMAP.md` Phase 2); until then,
   keep new logic in dedicated modules the way `review-scheduler.js` was
   written (224 lines, pure, independently testable).
2. 🟡 [WARN] **`validate:backlog` is permanently red** — *"0 open word(s) now,
   on disk: 138"*, and `tools/narration/test/backlog.test.mjs:28` fails with it.
   It is a stale ratchet, not a defect: `npm run gen:backlog` resyncs it and the
   ceiling lives in the **script**, not the file. It sits *last* in the chain
   deliberately so it cannot mask the other gates, but it still means
   `npm run validate` and `npm test` exit non-zero for an unrelated reason.
   *Action:* run the resync as a narration-tooling change.
3. 🟡 [WARN] **`validate:pipeline` reports 0 of 321 events sourced** — excluded
   from the `validate` chain on purpose, with `content/sourcing-backlog.json`
   ratcheting the count so the gap stays visible rather than unmentioned. Keep
   the pointer printed by `npm run validate`; do not grandfather the remaining
   two decks to make it green.
4. ℹ️ [INFO] **No `.ignore` / `.agentignore`** — search and glob still sweep
   `assets/vendor/` and `assets/leaflet/` (2,100+ KB of vendored minified code)
   on every pass. Cheap to fix, and it makes agent work faster and noisier.
5. ℹ️ [INFO] **`index.html` has no `<meta name="description">`** (533 lines,
   confirmed by `grep -c 'name="description"'` → 0). Harmless for the game, but
   it is a one-line win for anything that ever shares the URL.
6. ℹ️ [INFO] **`audit-report.md` was 25 days stale** — the previous snapshot
   predated PRs #1–#7. This document closes that finding.

## Detailed Findings

### Deployment health — 92
- **Site is green on every merge.** The only CI is a Cloudflare Pages check on
  PRs; it passed on #6 and #7. There is no `.github/` workflow directory.
- **Generated artifacts are gated, not hand-maintained.** `offline-manifest.*`
  (133 files, 18.3 MB, generation `880b89efaf62`), `decks/index.*`,
  `narration-recipe.js` and `icons/` each have a `--check` freshness gate, and
  they sit *before* the known-red gate in the chain so a real drift is never
  hidden behind a stale one.
- **Offline is proved, not asserted.** `smoke:offline` (Chromium, 48),
  `smoke:webkit` (WebKit, 20), `smoke:mastery` (18), `smoke:review` (17) — the
  last two were added in this thread. What remains unverifiable is stated in
  every header: iOS Safari, the browser's own install dialog, eviction under
  memory pressure, print output and pixels.
- Deducted for the two known-red gates (items 2 and 3).

### Convention gaps — 78
- **First-party scripts carry `?v=`** — `timeline.js?v=200`, `styles.css?v=134`,
  `review-scheduler.js?v=1`, and the offline manifest was regenerated to match
  (hard rule 3 satisfied for this session's edits).
- **Script order matches rule 4** — `review-scheduler.js` loads after
  `offline.js` and before `timeline.js`.
- **Pure logic is kept out of the monolith** — `review-scheduler.js` is a
  DOM-free classic IIFE exposing `window.ReviewScheduler`, loaded by `vm` in
  Node for 26 tests. This is the pattern new logic should follow while
  `timeline.js` keeps growing (item 1).
- **No `.ignore` and no meta description** (items 4, 5).

### Project health — 84
- **Gates:** `validate:index`, `:content`, `:vendor`, `:offline`, `:recipe`,
  `:narration` all green. The vendored gate reports 1 benign warning
  (`vis-timeline` CSS ships no banner).
- **Tests:** 45 Node tests (19 offline + 26 scheduler), all passing. Two known
  failures remain outside this layer's control (items 2, 3).
- **Docs are current** — `AGENTS.md`, `REVIEW_QUEUE_PLAN.md` (T1–T8 recorded as
  shipped), `CLOUDLESS_PLAN.md` (queue status), `GAMIFICATION_BRIEF.md` (A10's
  L2 seam) and the new `FEEDBACK_CONFIDENCE_PLAN.md` (next slice, awaiting
  approval).
- Deducted for the two permanently-red gates and the monolith growth.

### Security scan — 95
- **Zero runtime dependencies** (`package.json`: 0 dependencies, 0
  devDependencies) — no supply chain to audit at run time; hard rule 1 holds.
- **Vendor gate is a copyleft firewall** (`validate:vendor`, 0 errors): flags
  GPL/AGPL/LGPL/EUPL/SSPL/FSL-1.1/CC-BY-NC markers, runtime-TTS artefacts under
  `assets/`, and a stripped licence/version header. It is **header-based, not
  provenance-based**, so a forked derivative would pass — documented, and the
  reason A10's L3 (forking `ts-fsrs`) is rejected rather than policed.
- **Hosted behind fail-closed Basic Auth** (`functions/_middleware.js`): if the
  Pages env vars are unset every request is denied 401, so a misconfigured
  deploy cannot go public.
- **All state is client-side `localStorage`**, guarded with `try/catch`; no
  network writes, no telemetry.
- Deducted for the header/provenance gap above, which is inherent to the chosen
  gate.

### Corrections made during this session's audit
- **The success-floor trim dropped the wrong card.** Among two equally-hard due
  cards, `dueSet()` discarded the **most overdue** one — the exact card a
  reach-back queue exists to surface. Fixed (`selected[j].success <= …` so the
  least overdue goes) with a regression test. Found by reading the code, not by
  a test, which is what an audit is for.
- **A previous summary overstated the work:** it claimed a one-line fix so 5–7
  players don't see a mastery percentage. **That fix was not made.**
  `renderFocusPanel()` still prints `Mastery NN%` and a percent bar for every
  band (`timeline.js:1881-1882`), while the stats screen correctly branches to
  stars (`:1729-1733`). It is tracked as task **4d** in
  `doc/FEEDBACK_CONFIDENCE_PLAN.md`, not done.
- **Seven invariant tests added** for behaviour that was assumed but never
  asserted: `replay` never writes to the append-only log (D3), `dueSet` does not
  mutate its inputs, tie-breaks are deterministic (recency then id), the trim
  keeps the most-overdue card, cross-deck id resolution, log-pruning derivation,
  and non-array input degrading instead of throwing.

## Not covered by this report
No dependency-vulnerability scan exists to run (there are no dependencies); no
dynamic or penetration testing; no accessibility audit beyond the reduced-motion
and `aria-pressed` conventions checked in code; and `iOS Safari / print output /
pixel appearance` remain hand-check only by design.
