# Timeline Game: Cloud-less Track — working method & queue

> A **client-side-only product track**: what we can research, plan, build and
> verify with **no server, no account, no API key and no build step**. This is an
> *interleaved* track, not a replacement for `doc/CROSS_PLATFORM_ROADMAP.md`
> (which is cloud-phased). Where the two disagree, this doc records the
> disagreement rather than silently diverging.
>
> **Last updated:** 2026-09-30 (v4) | **Status:** **D-CL1 ratified** — web-PWA
> only, split into **S1a (installability) → S1b (service worker)**, offline
> payload = **precache everything, audio included** (~19 MB; §4). **S1a and S1b
> are code-complete and browser-verified**: `manifest.webmanifest` + `icons/` +
> `offline.js` + `sw.js` + the generated `offline-manifest.*`, tested in Node and
> driven through two real engines (`npm run smoke:offline` in Chromium, 48/48;
> `npm run smoke:webkit` in Safari's engine, 20/20) — see §3 S1. What remains is
> the handful of behaviours no container can reproduce (iOS Safari itself, the
> browser's own install dialog, eviction under memory pressure). The mastery
> layer's browser smoke (GAMIFICATION_BRIEF phase 2) is now also automated —
> `npm run smoke:mastery` — so S2's level card is no longer owed a manual pass.
> D-CL2 remains open.
>
> **Interpretation note:** "cloud-less" here means *product builds that need no
> cloud infrastructure*. It does not mean "no network" (the game is served over
> HTTPS) and it does not mean "no author-time tooling" (`tools/` and `scripts/`
> are exempt from the no-build rule and may use npm).

---

## 1. What is in scope

Already true today, and the reason this track is viable at all: the shipped
product is a **static HTTPS site with no backend** (roadmap §1 is explicit —
"Backend | None | Fully client-side"), decks load as classic scripts rather than
`fetch`, maps are vector/offline, narration is pre-rendered at author time, and
deck import/export is already client-side (`decks-io.js`).

| In scope (cloud-less) | Out of scope (needs the cloud) |
|---|---|
| PWA: manifest + service worker, installable + offline shell | Auth / cloud profiles (roadmap §6) |
| Gamification phases 2–9 (`GAMIFICATION_BRIEF.md` §11) | Leaderboards / server social (§10.1) |
| Mastery scheduler + review log (already partly shipped) | AI generation with a server-held key (§8, §8.2) |
| `.timedeck` packages, Tier 2 (§19.10) + IndexedDB store | Entitlement / IAP / offline lease (§7, §19.10 T3) |
| Daily challenge via client-side seeded PRNG (replaces §10.2's `Deno.cron`) | Institutional / LMS integrations (§11) |
| Cross-platform staging script + shells (§5.1) | Cloud content delivery (§19.7) |
| Deck sharing via file/URL (organic growth) | Analytics infrastructure |

**Not in scope for this doc:** the cloud phases themselves. This track never
builds a local stand-in for a cloud feature *that the cloud will later replace* —
see the permanence test in §2.4.

---

## 2. The working method

The proposed loop — **research → plan → build → verify**, iterated per slice — is
right. These are the four refinements that make it work *in this repo*, each one
paid for by something that actually bit us.

### 2.1 Research must be constraint-filtered, and it ends in a licence + format verdict

Generic research ("best practice for a streak calendar", "how to do offline
storage") returns React/Tailwind/bundler answers that are **unusable here**. One
session of library research already produced three dead ends and one keeper:

| Candidate | Verdict | Why |
|---|---|---|
| Trophy UI / LingoKit UI | ❌ not importable | React + Tailwind *source* via shadcn CLI; no UMD/ESM bundle. Structure/design only, hand-ported. |
| cal-heatmap | ❌ rejected | d3-based, ESM/CJS only, no UMD — fails the classic-script rule. A CSS grid is lighter anyway. |
| ts-fsrs | ✅ vendorable | ships `index.umd.min.js`, MIT. |
| Trophy's streak design | ✅ as *pattern* | ported to plain CSS behind existing `styles.css` tokens. |

So the research step has exactly two outputs, and the **second is a hard gate**:

1. *What should the outcome be?* (best practice, with the evidence rated)
2. *Is the minimal implementation actually loadable here?* — check the
   **release's real entrypoints**, not the README: bundle format (classic/UMD, or
   an ESM build permitted by hard rule 1), licence (permissive, redistributable,
   no NC/copyleft — `npm run validate:vendor` enforces the copyleft half), pinned
   version, total bytes.

**No slice gets planned until its dependencies pass that gate.** Getting this
backwards is the single most expensive mistake available on this track.

### 2.2 Plan = one page, including the falsifier

Each slice's plan states: the outcome in one sentence; what changes; the file
list; the **age / accessibility / reduced-motion** story (AGENTS.md makes
reduced motion a hard floor for any new motion); and **the falsifier** — the
observation that would prove the slice wrong. If the falsifier can't be written,
the slice isn't understood yet. (Worked example: A7 in `GAMIFICATION_BRIEF.md`
names its own counterweight and is marked ⚠️ *because* the falsifier is live.)

### 2.3 Build = the fewest changes, in repo conventions

IIFE + `"use strict"`, `const`/`let`, `$("id")` lookup helper, template literals;
`?v=N` bumped on every touched first-party script (hard rule 3); vendored libs
pinned with their licence header (hard rule 2); no new runtime dependency.
Prefer editing an existing file over adding one.

### 2.4 The permanence test (what keeps this from being work done twice)

Before building the local form of anything, ask: **is the local form the
permanent design, or a stand-in for the server's?** Build the first, defer the
second. The repo already has the model for this: the review log is append-only
and all state is *derived* (D3), specifically so a future server can replicate
the log verbatim and re-derive — the local form **is** the final form.

Applying it: a client-side seeded daily challenge is **permanent** (Wordle's
daily is completely client-side — identical puzzle for everyone, no server
evaluation). Mastery/FSRS is permanent. `.timedeck` is permanent *and reused*
(§19.10 Phase 3 ships the identical artifact behind entitlement). By contrast, a
local-only "cloud sync" or a browser-stored BYO AI key would be a stand-in worth
refusing.

### 2.5 Verify in this order, and say what was *not* verified

The game has **no unit-test framework**, and the existing gates (`npm run
validate`, `npm test`) cover content and narration, **not game behaviour**. So:

1. `node --check <file>` on every touched first-party script.
2. **Pure logic in Node.** Anything derivable — day keys, streaks, PRNG
   sequences, cache keys, package manifests — gets a throwaway Node script with
   the edge cases. This is not ceremony: it is how the DST bug was caught
   (24-hour arithmetic returned 0 where calendar-day math returned 1, across the
   Berlin spring-forward). DOM-free logic must be provably correct *without* a
   browser.
3. `npm run validate` and `npm test` — knowing the **known-failing backlog gate**
   (`pronunciation-backlog.json` stale; see `GAMIFICATION_BRIEF.md` §12) so a
   real regression isn't lost in a known one.
4. **Browser smoke on the served path.** For the offline layer this is now
   *automated* — `npm run smoke:offline` (Chromium) and `npm run smoke:webkit`
   drive a real browser against a real server in `tools/offline-smoke/`, and
   `npm run smoke:mastery` covers the S2 level card — so
   prefer it over clicking by hand; the one thing to keep in mind is that a
   browser download (`npm --prefix tools/offline-smoke install`, plus
   `npm --prefix tools/offline-smoke run browsers`) is a prerequisite. For
   anything else, `python3 -m http.server 8000`. A `file://` pass is **never**
   evidence the hosted build works — AGENTS.md is explicit that the two load
   paths genuinely differ.
5. Reduced-motion emulation for anything animated; `aria-pressed` for anything
   toggleable.
6. Close with an explicit **"not verified:"** line.

---

## 3. The queue

Ordered by (value × permanence) ÷ risk, respecting dependencies. Slice 0 was a
decision, not a build; it gates slices 1 and 5 and is now **ratified** (§4 D-CL1).

### S0 — Decide the delivery target (decision only) → §4 D-CL1
Offline is expressed **twice** in this repo's plans and the two forms conflict:
a PWA service worker, and native shells that **must exclude** the service worker
(roadmap §5.1: iOS WKWebView cannot register a SW on the `capacitor://` scheme,
and a stale registered SW on Android serves cached old builds over new ones).
Deciding this *first* prevents building offline twice.

### S1 — PWA: installability (S1a), then offline (S1b)
**Ratified 2026-09-30:** web-PWA only (D-CL1 Option A), in two slices — the
manifest cannot serve a user the wrong code, the cache can, so the cache is the
slice that needs its own verification and rollback.

*S1a — installability.* `manifest.webmanifest` (name/short_name, **192px and
512px icons — neither exists yet; no favicon, no app icons at all**, `start_url`,
`display: standalone`, theme/background colour), the `<link rel="manifest">` tag,
`apple-touch-icon` + iOS meta, `theme-color`, and an install affordance
detected via `beforeinstallprompt` — absent on iOS by design, so it must degrade
to nothing rather than to a dead button. **No caching, therefore no staleness
risk.** Research: a service worker is *not* required to be installable (MDN,
2026-09; Chrome dropped the fetch-handler requirement for install-from-menu in
108/112 and still wanted one only for the automatic prompt).

*S1b — offline.* A hand-written classic-script `sw.js` (no Workbox — a build-step
tool, hard rule 1), registered from first-party code guarded on protocol
(`file://` has no service worker) and on a shell (`window.__TAURI__` / Capacitor
— roadmap §5.1), plus a `navigator.storage.persist()` request whose **result is
checked** (WebKit grants it on heuristics that favour installed web apps, and a
refusal is a normal outcome to design for, not an error).

*The trap, named now:* `?v=N` exists precisely because returning players got
stale code (hard rule 3). A naive cache-first SW recreates that bug.
**The audit is done — there are three classes of URL, not two:**

| class | URLs | strategy |
|---|---|---|
| versioned | the 8 root scripts (`timeline.js?v=199`, `styles.css?v=132`, …) and every deck script (`decks/<dir>/deck.js?v=<revision>`, from the generated index) | cache-first is safe *because* the version is in the URL |
| immutable by policy | `assets/vendor/*`, `assets/leaflet/*` (pinned, never edited — rule 2) | cache-first |
| unversioned + mutable | `index.html`, `decks/index.js`, `decks/index.json`, `assets/world-land.js`, `assets/earth-textures.js`, `assets/images/*`, `assets/cursors/*` | network-first / stale-while-revalidate |
| unversioned + regenerated | `assets/audio/*.mp3`, `decks/<id>/narration/*.mp3`, `decks/<id>/deck.js` | precached — but see the audio note |

*The payload is ratified: precache everything, audio included.* ~19 MB measured —
shell ≈5.5 MB + audio ≈13.9 MB. Note the earlier figure was mis-attributed:
`assets/audio` is ~10.6 MB of music and SFX, the narration corpus is only
2.9 MB, so **"narration" was never the bulk of the weight** — the two default-on
music tracks are. Precache the whole corpus and request `storage.persist()` so
the iOS side is best-effort-*plus* rather than best-effort.

*The consequence that must be designed for:* **audio has no `?v=`.** A clip is
keyed by event id and its path does not change when it is re-rendered, so a
precached clip is served forever unless the cache generation changes. The repo
has already shipped stale-but-plausible audio once (the `loudnorm`/`textHash`
failure in `tools/narration/README.md` — no loudness or peak in the record, so
nothing caught it), and this would recreate that class of bug for every listener
offline. Therefore the precache list must be **generated** —
`scripts/gen-offline-manifest.mjs` → a classic-script mirror exposing the asset
list, exactly as `decks/index.json` is generated, with a freshness gate beside
`validate:index` — and the cache generation must be **derived from that list**,
never hand-typed. 86+ files and their revisions drift otherwise.

*Two code-level requirements found by the audit:* the app issues
`fetch(url, { cache: "no-cache" })` for deck JSON (`timeline.js:4442`) and
`{ cache: "force-cache" }` for narration (`narration.js:179`), so the SW must
**normalise the cache mode** rather than forward `event.request` (a forwarded
`no-cache` forces revalidation and fails offline); and it must **scope by URL**,
because a catch-all handler would cache the remote NASA tiles.

*Not needed:* the offline map already works. Satellite tiles are the **default**
map mode and are already guarded at `timeline.js:3074` by
`navigator.onLine !== false` plus a `tileerror` → local vector fallback
(`world-land.js`). Making satellite the default when offline would be a UI
choice, not a caching one.

*Verify:* served-path reload with the network off; bump `?v=N` → new file
arrives; **re-render one clip → the new audio arrives, not the cached one**;
audio plays offline from a cold start; the `persist()` result is inspected; the
SW is absent from the staged app; unregister + hard reload leaves no stale SW
behind (one SW per origin+scope — a dev server on the same port can collide).

*Landed 2026-09-30.* `manifest.webmanifest` + generated `icons/` (S1a);
`offline.js` (`window.Offline`: install affordance, worker registration,
update timing, `storage.persist()`, offline status, clear-offline-data) and
`sw.js` (S1b). The precache list is generated by
`scripts/gen-offline-manifest.mjs` into `offline-manifest.json` +
`offline-manifest.js`: **132 files, 18.2 MiB (19.1 MB decimal)**, one content
revision per file, and one generation hash over the lot — so the worker's script
URL (`sw.js?v=<hash>`) moves whenever any shipped byte moves, including a clip
re-rendered at an unchanged path. The earlier "125 files" figure in this plan was
an estimate made before the artifact existed; the measured set is 132.

**What is machine-verified:** every manifest entry exists with a true size and
revision; the generation hash is derived, not stored twice; no repo-only path can
leak in (allow-list + a deny check); everything `index.html` requests at boot is
precached (offline boot cannot 404); the manifest declares every member
installability requires, with icon dimensions read back from the PNGs; the icons
are distinct, are drawn (not flat), and the maskable one is opaque at the corner
while the `any` one is not; and the worker's routing — install precaches and
skips unchanged files, one failure does not reject the install, exhausted quota
degrades instead of rejecting, `activate` prunes only what the generation omits,
a `no-cache` request is still served from cache, a changed revision is a miss
(never a stale serve), cross-origin and `offline-manifest.*` are untouched,
navigation is network-first with a cached-shell and then an inline offline-page
fallback, and `install` never calls `skipWaiting`. That is 18 tests in
`scripts/test/offline.test.mjs`, run first by `npm test` so a pre-existing
failure in a later suite cannot hide them; `npm run validate:offline` sits before
the known-red `validate:backlog` for the same reason.

**What is browser-verified** — added 2026-09-30, because "the workspace has no
browser" stopped being true: Chrome and Playwright's WebKit (Safari's engine) were
installed into a scratch dir, and the checklist became two runnable smokes in
`tools/offline-smoke/` (author-time only, never shipped; deliberately **not** part
of `npm test`, which must not depend on a browser download).

`npm run smoke:offline` — real Chromium, real HTTP server, **48/48**, ~30 s: the
manifest parses with no warnings; the worker registers as `sw.js?v=<hash>` over a
scope that covers the game; the page learns precache completion from the
worker→page message; the cache holds all 132 entries with content-addressed keys
and nothing cross-origin; the install affordance appears *because*
`beforeinstallprompt` fired, and pressing it really calls `prompt()`; storage
persistence is requested once and a refusal is stated as best-effort; with the
server **stopped** the shell boots, every deck loads, and a narration clip and
the 5.2 MB music track come out of the cache; a device with the worker but no
cache is shown the offline page; a re-rendered clip at an unchanged path is
served with its new bytes and the old revision is pruned, at a cost of **1
downloaded file, not 132**; an update does **not** apply mid-game and does apply
when the game screen is left, exactly once; two tabs converge on one generation
with no leftovers; an installed (standalone) tab is never asked to install
itself while a normal tab is; a browser with no usable worker registry says so
and still plays; and a native shell registers no worker and creates no cache
(roadmap §5.1).

`npm run smoke:webkit` — the same layer in WebKit, **20/20**, ~5 s: boots, every
deck loads, the iOS-facing head is complete (apple-touch-icon, tab icon and
manifest all 200; `apple-mobile-web-app-*` and theme-color present; manifest
served as `application/manifest+json`), **no `beforeinstallprompt` fires and no
install button is offered** (iOS has no such event — the affordance must not be a
dead button), the worker precaches all 132 files under content-addressed keys,
and with the server stopped the shell boots, the decks load, a clip and the
music track come from cache, and the status line still tells the truth.

Two real defects were found by these runs, not by reasoning: a first install was
briefly reported as `waiting` by Chrome, so the page reloaded a brand-new
visitor's tab mid-download; and offline, the Settings line sat on "checking…"
forever — the manifest probe is network-only by design, so the page could not say
whether the game was stored even with a complete cache in front of it. The second
is fixed by remembering the last probed generation (`timeline.offline.manifest.v1`),
consulted **only** when the network cannot answer — the generation it names is the
one the installed worker holds, so the page can never disagree with the worker
serving it — plus an offline-aware "incomplete — connect once" wording instead of
a progress claim that will never finish.

**What is still NOT verified (and must stay on the AGENTS.md checklist):** iOS
**Safari** itself — the Add-to-Home-Screen flow, iOS's storage eviction, and
`navigator.standalone` (WebKit-on-Linux is not iOS); the browser's own install
dialog (headless fires the event and `prompt()` is really called, but the dialog
cannot be seen or accepted); and eviction under memory pressure, which cannot be
induced in a container (the degraded path is pinned by the worker's quota tests
instead). `file://` remains a dev convenience and is never evidence.

### S2 — Gamification phases 2–9
*Build scope:* exactly `GAMIFICATION_BRIEF.md` §11, in its revised order
(mastery leveling → reach-back due-queue → feedback depth + pre-reveal prompt →
streak UI → achievements → first-run modeling → narration timing + quiet mode).
All client-side; no new dependency is required by any phase.
*Verify:* the brief's own §13 checklist, plus the Node-testable derivations.
*Landed 2026-09-30:* **phase 2 (mastery leveling)** — `masteryOf()`/`band()` in
`timeline.js`, the level card in `renderStats()`, and the stats-screen age gate
(§11 has the design decisions). `npm run validate` stays green apart from the
pre-existing `validate:backlog` ratchet, and the pure derivations are
machine-checked. **The browser smoke is no longer owed** — the level card's DOM
contract is now asserted end-to-end by `tools/offline-smoke/mastery.mjs`
(`npm run smoke:mastery`, 21/21 in Chromium): one seeded profile whose score is
exactly 15, the stats screen reached through the real UI, the DOM checked
against `window.Gamify.mastery()`, and the age gate (17+ numeric, 8–11
name-first, 5–7 name-only with no badge/bar/percentage) plus unset-band and
reduced-motion paths all covered. What it does not cover: print output, pixel
appearance, iOS (the same honesty rule as S1).
*Note:* the one item here that touches a shipped feature is **A7** (narration
currently autoplays a verbatim read-along over the deciding moment) — it is a
one-call-site change and it needs its own measurement.

### S3 — `.timedeck` packages, Tier 2 (roadmap §19.10)
*Research question:* entrypoint + licence verdict for a ZIP library — `fflate`
(MIT) is the roadmap's proposal, and it **must be confirmed to ship a classic/UMD
build** before planning (see §2.1; this is exactly the check that killed
cal-heatmap).
*Build scope:* vendored ZIP lib under `assets/vendor/`, `ContentPackStore`
(IndexedDB `assets` store, one `Blob` per asset, `URL.createObjectURL` — decision
log 2026-09-18), the pack reader, and an authoring script under `tools/` (exempt
from no-build).
*Reuse the guards already specified* (roadmap §19, before any decode): cap entry
count; cap total uncompressed bytes; cap per-entry bytes; reject compression
ratio ≳200:1; reject overlapping/duplicate entries. A ZIP from a user is
**untrusted input**.
*Dependency note:* this is the prerequisite for deck sharing and for the offline
content story — and it is the same artifact Phase 3 later serves behind
entitlement, so it is permanent (§2.4).

### S4 — Daily challenge, client-side (replaces roadmap §10.2's Supabase `Deno.cron`)
*Research question:* confirm no server evaluation is needed (prior art: Wordle's
daily is entirely client-side; the "same puzzle for everyone today" property comes
from seeding, not from a server).
*Build scope:* `mulberry32`-style seeded PRNG keyed on date + deck; deterministic
event selection; a results/"share" surface.
*Verify:* two runs on the same local day → identical set; a different day →
different set; a different timezone's local day → its own set (reuses the
existing `localDayKey`/`meta.tz` logic); pure function, so **Node-testable**.

### S5 — Cross-platform staging script + shells (roadmap §5.1)
*Build scope:* `scripts/build-app.mjs` (does not exist yet) — an app-only copy
that filters site-only assets and **must exclude the service worker**; then
Capacitor/Tauri pointed at the staging dir. Depends on S0 and on S1 for the
exclusion to mean anything.
*Research question:* which native plugins are actually needed (haptics, splash)
vs. optional, and TWA-vs-Capacitor for Android (roadmap §5.2 already recommends
TWA as the near-zero path).

---

## 4. Decisions this track forces

### D-CL1 — Delivery target: PWA-first vs native-first? (blocks S1/S5)
- **Option A (PWA-first):** service worker now, shells later; the SW is excluded
  from staging per §5.1; Android rides a TWA. Offline is the product, and the
  TWA path needs no wrapper toolchain.
- **Option B (native-first):** skip the SW; rely on shell asset bundling and
  Capacitor Filesystem. Cheaper *if* stores are the near-term goal, but the PWA
  then degrades to a by-product.
- **RATIFIED 2026-09-30 — Option A, web-PWA only, in two slices:** S1a
  installability, then S1b service worker. Native shells stay deferred (S5), which
  costs nothing because a shell must exclude the SW anyway; nothing built here is
  wasted there.
- **Payload, ratified with it:** precache **everything, audio included** (~19 MB
  measured). The trade is deliberate — offline completeness over install weight —
  and it makes the generated-manifest requirement in §3 S1 load-bearing rather
  than optional.

### D-CL2 — Roadmap phase order (for the user to rule on)
Roadmap **Phase 1 is server-side infrastructure**, and phases 3–6 depend on it.
If the product is complete without a server, Phase 1 buys nothing until a cloud
feature is genuinely wanted — so either (a) leave the roadmap intact and treat
this doc as an interleaved track that simply doesn't wait for Phase 1, or
(b) reorder the roadmap to make the cloud-less product the launch path.
**Not decided here.** Recommendation: (a) plus a pointer, because reordering a
2980-line plan for a hypothesis is the more disruptive change; revisit once S1–S4
are shipped and the offline claim is proven in the market.

### D-CL3 — Is any BYO-credential AI worth it?
Roadmap §8.2 streams AI generation client-side but routes the key through a
server proxy (decision log 2026-09-06) precisely so the key is never exposed. A
browser-held key is cloud-less but breaks that decision. Treat as **out of scope**
unless the user explicitly wants the tradeoff.

---

## 5. Verify protocol for this track (summary)

Everything in §2.5, plus three track-level bars that must hold as slices land:

- **Offline claim is only made when proven**: airplane-mode reload on the served
  path, not "it should work".
- **No `file://` inference.** Every claim is made against the served build.
- **Known-failing gate is disclosed** in each slice's verification note, so a new
  failure is never masked by the pre-existing `validate:backlog` one.

---

## 6. Open questions

1. Does the PWA need to work on iOS Safari *installed* only, or also as a normal
   tab? (Changes how much SW lifecycle work is worth doing.)
2. Should decks migrate from `decks/*.js` to pre-built `.timedeck` at launch, or
   do bundled free decks stay as scripts (roadmap §19.11 Q4)? Affects S3's scope.
3. Is the daily challenge *per-deck* or *global across the active deck set*?
