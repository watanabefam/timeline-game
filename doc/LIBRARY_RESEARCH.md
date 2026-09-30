# Library & Dependency Research — timeline-game

**Purpose:** the decision record for **what we build features with**. It consolidates
every third-party library evaluated for the improvement backlog — candidate repos,
licenses, build formats, sizes, and a **stack-fit rating /100** — so that future
sessions don't re-derive it.

Companion docs (don't duplicate them here):
- `doc/MARKET_COMPARISON.md` — *what to build* (competitors, feature gaps).
- `doc/GAMIFICATION_BRIEF.md` — *how it should behave* (D1–D8, A1–A6).
- `doc/CROSS_PLATFORM_ROADMAP.md` — *how it ships* (packaging, backend, monetization phases).
- `AGENTS.md` — the hard rules this research is rated against.

---

## 1. Rating methodology

Ratings are **stack-fit /100**, not "quality of library." They encode the repo's
constraints (`AGENTS.md` rules 1–4) and are gated in this order:

1. **License gate.** MIT / Apache-2.0 / BSD / ISC / CC0 / public-domain pass.
   **GPL / AGPL / LGPL / EUPL / FSL / CC-BY-NC are disqualified** for a commercial
   product (marked 🚩). A permissive license cannot launder a copyleft component
   bundled inside it.
2. **Loadability gate.** Must work as a vendored classic `<script>` (UMD/IIFE) or,
   since the HTTPS-hosting change, a vendored **ESM** file via
   `<script type="module">`. A package that **requires a bundler / build step** is
   capped low. (`file://` is *best-effort*, not a gate — AGENTS.md.)
3. **Maintenance gate.** Dead/archived repos are penalised even when tiny.
4. **Fit + size.** Does it earn its bytes for this specific feature? "Oversized"
   is *informational only* — it never caps a rating.

**Making a change?** Ratings are point-in-time. Entries were verified
**2026-09-27** (see §8 for method). Re-verify version/license before vendoring —
especially anything `🚩` or `⏸`.

Legend: ✅ shipped · 🔜 recommended next · ⏸ deferred (phase/backend-gated) ·
🎯 target algorithm · 🚫 avoid · 🚩 disqualified by license

---

## 2. ⚠️ Headline finding — the vendored Kokoro bundle contains GPL-3.0 code *(resolved 2026-09-29; kept as the case record)*

`assets/vendor/kokoro/kokoro.web.js` (kokoro-js **1.2.1**) is **Apache-2.0**, and
the **Kokoro-82M** model it loads is **Apache-2.0** — but the bundle statically
imports `phonemizer`, which embeds an Emscripten-compiled **eSpeak-NG**
build + data. **eSpeak-NG is GPL-3.0-or-later.**

- The `phonemizer`/`kokoro-js` packages labelling themselves Apache-2.0 does **not**
  relicense the GPL-3.0 component they embed. Shipping the bundle is arguably
  distributing a combined work under GPL-3.0 — a problem for a proprietary product.
- **Exposure at verification (2026-09-27) was low but real:** the only
  first-party file that imported it was **`narration-worker.js`**, which was
  **orphaned** — nothing instantiated a Worker, and `narration.js` does not
  synthesize at runtime. The shipped path is
  **pre-rendered MP3s** (`decks/<id>/narration/<event-id>.mp3`, produced by Kokoro
  at author time) with **`speechSynthesis` fallback**. GPL covers the *program*, not
  normally its *output*, so the MP3s themselves are fine.
- **It was untracked in git** (`?? assets/vendor/kokoro/`), yet it sat in the
  shipping tree — a naive staging/copy script would have bundled ~ONNX model +
  WASM into the app.

**Status 2026-09-29 — resolved.** The fate question was decided in favour of
pre-rendered audio only (`doc/CROSS_PLATFORM_ROADMAP.md` §19.12.1, ratified
2026-09-20, executed 2026-09-29):

| Action | Where it landed |
|---|---|
| 1. Retire runtime synthesis | `narration-worker.js` **deleted** (it was orphaned — nothing instantiated a Worker). The 125 MB bundle was **moved, not deleted**, out of `assets/vendor/` to `tools/kokoro-authoring/kokoro/`, which is gitignored, so author-time regeneration still works and AGENTS.md rule 2 (`assets/` is never edited) stays absolute. See `tools/kokoro-authoring/README.md` |
| 2. Do not ship the eSpeak-based phonemizer | Satisfied by 1 — the contaminant is outside `assets/` and outside any shipping path. `narration.js` keeps the pre-rendered MP3 path plus the `speechSynthesis` fallback (§19.12.8) |
| 3. Packaging exclusion list | `tools/kokoro-authoring/` added alongside `sw.js` (roadmap §5.1). `.gitignore` carries the same exclusion so the payload can never enter history |
| 4. `THIRD_PARTY_LICENSES` manifest | Added at the repo root, with the eSpeak exclusion recorded in its §6 |
| **5. Authoring runtime (2026-09-29)** | `tools/narration/` pins npm **`kokoro-js@1.2.1`** as a devDependency, mirroring the `tools/content-pipeline` precedent. It pulls the same `phonemizer`/eSpeak tree, installed under a gitignored `node_modules/` — same analysis as §2, same containment |
| **Enforcement (new)** | `scripts/check-vendored.mjs` + `npm run validate:vendor`, wired into `npm run validate`. It fails on GPL/A?GPL/LGPL/EUPL/SSPL/FSL-1.1/CC-BY-NC markers under `assets/`, on any retired runtime-TTS path reappearing there, on a first-party reference to the Kokoro bundle, and on a vendored script missing its license or pinned-version header (embedded base64 is stripped before scanning, so a data-URI payload cannot false-positive) |

---

## 3. Current inventory (already in the repo)

| Asset | Version | License | Status |
|---|---|---|---|
| [anime.js](https://github.com/juliangarnier/anime) | 4.5.0 | MIT | ✅ FX layer |
| [canvas-confetti](https://github.com/catdad/canvas-confetti) | 1.9.3 (1.9.4 avail.) | ISC | ✅ celebrations |
| [globe.gl](https://github.com/vasturiano/globe.gl) | 2.46.2 | MIT (bundle also has Apache-2.0 H3 → **attribution required**) | ✅ globe dock |
| [vis-timeline](https://github.com/visjs/vis-timeline) | 8.5.4 | Apache-2.0 **or** MIT (dual) | ✅ timeline render |
| [Leaflet](https://leafletjs.com) | 1.9.4 | BSD-2-Clause | ✅ maps |
| [Phosphor Icons](https://github.com/phosphor-icons/core) | inline sprite | MIT | ✅ icons |
| [liquid-glass](https://github.com/rizzytoday/liquid-glass) | — | MIT | ✅ converted to classic script |
| **kokoro-js + Kokoro-82M** | 1.2.1 | Apache-2.0 **over GPL-3.0 eSpeak-NG** | 🚩 removed from `assets/` 2026-09-29 — author-time only: model bundle in `tools/kokoro-authoring/`, npm dependency in `tools/narration/` (see §2) |
| [ffmpeg](https://ffmpeg.org) (narration post-processing) | 8.1.2 | LGPL-2.1+ / GPL build | ✅ **external program only** — spawned and piped, never linked or shipped; needs no vendoring |
| [ajv](https://github.com/ajv-validator/ajv) | 8.17.1 (+ajv-formats) | MIT | ✅ **tool-side only** (`tools/content-pipeline`, devDependency) |
| SFX (`assets/audio`) | — | Kenney CC0-1.0 | ✅ |
| Music (`assets/audio`) | — | Pixabay Content License | ✅ |
| [Node built-in test runner](https://nodejs.org/api/test.html) | `node --test` | n/a | ✅ content-pipeline tests |

---

## 4. Master recommendation tables

Columns: **Option** (clickable) · **License** · **Build** · **Rating /100** ·
**Status** · **Notes**. "Oversized" is noted in the Notes column where relevant.

### 4.1 Retention & habit

| Option | License | Build | Rating | Status | Notes |
|---|---|---|---|---|---|
| **Date-seeded daily** — reuse existing `hashString`+`mulberry32` | n/a (public domain) | first-party | **98** | 🔜 **top pick** | `muulberry32` is already in `timeline.js:50`; `hashString` (FNV-1a) + `utcDateKey()` already exist. Seed key: `` `timeline-v1:${deckId}:${utcDayNumber}` `` |
| [bryc/code PRNGs](https://github.com/bryc/code/blob/master/jshash/PRNGs.md) (`xmur3`, `sfc32`, `splitmix32`) | Public domain (MIT fallback) | snippets | 96 | 🔜 ref | **Not Unlicense.** Note: bryc flags mulberry32 as skipping ~⅓ of 32-bit values; `splitmix32`/`sfc32` are stronger |
| **Streak tracking** — hand-rolled, derived from the review log | n/a | first-party | **95** | 🔜 | **Mandated by `GAMIFICATION_BRIEF.md` D3** (streak is a pure function of the append-only log). Store dates `YYYY-MM-DD`; one `dayOf()` clock for puzzle **and** streak |
| [use-streak](https://github.com/jsjoeio/use-streak) | MIT | UMD 1.5KB | **40** | 🚫 | Real UMD + framework-agnostic, **but dead (2022)** and **buggy** (compares day-of-month only → resets at every month boundary). Borrow the idea, not the code |
| **Shareable result grid** — hand-rolled emoji/canvas | n/a | first-party | **95** | 🔜 | `shareText()` exists but is one flat `🟩🟥` line; upgrade to per-round rows. No cross-origin imagery → no canvas taint |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (FSRS-6) | MIT | UMD `dist/index.umd.js` (~72KB) | **92** | 🎯 target | Latest **5.4.2**; implements FSRS-6. Node ≥20 is a *tooling* requirement only — UMD is unaffected |
| **SM-2** — hand-rolled behind `rate(outcome)→nextDue` | n/a | first-party | 88 | acceptable start | Only if you want zero vendored deps day one |
| [sm-2](https://github.com/cnnrhill/sm-2) (cnnrhill) | MIT *declared, no LICENSE file* | none | **20** | 🚫 | **Dead since 2017**, not on npm, unlicensed. Do not use |
| **Notifications** — native Notification API | platform | n/a | **92** | ⏸ | Opt-in only; HTTPS available |
| [browser-notification](https://github.com/HeyHugo/browser-notification) | MIT | UMD 1.7KB | 35 | 🚫 | Dead since **2017**; trivial to inline |
| **Ghost-replay opponent** — hand-rolled seeded replay | n/a | first-party | 96 | ⏸ | Validate replays; never trust an imported score |

### 4.2 Content & replayability

| Option | License | Build | Rating | Status | Notes |
|---|---|---|---|---|---|
| **Deck import/export** — native Blob + FileReader | n/a | first-party | **100** | ✅ shipped | `decks-io.js`, incl. Edge blank-tab quirk handled |
| **Deck validation** — shared custom validator | n/a | first-party | **90** | 🔜 | `decks-io.js` has a *light* validator; `scripts/validate-content.mjs` has the full rule (fact-quality + years-only-in-year). Extract a shared core for in-browser import |
| [ajv](https://github.com/ajv-validator/ajv) | MIT | v8: **no browser bundle** | 55 | ✅ tool-side | Already correct as a Node devDependency; would be a poor runtime choice |
| [SortableJS](https://github.com/SortableJS/Sortable) | MIT | UMD `Sortable.min.js` (~44KB) | **96** | 🔜 | Latest **1.15.7**; the deck-builder drag-reorder pick. Hand-rolling touch DnD is a rabbit hole |
| [lz-string](https://github.com/pieroxy/lz-string) | MIT | global `LZString` (~4.8KB) | 92 | ⏸ | Share links for decks. **npm frozen at 1.5.0 (2023)**; file header still says WTFPL (legacy) but LICENSE is MIT |
| [fflate](https://github.com/101arrowz/fflate) | MIT | UMD `umd/index.js` (~33KB) | 90 | ⏸ | More active alternative if payloads grow. Pin explicit path (jsDelivr default entry is wrong) |
| **Year slider** — native `<input type=range>` | platform | n/a | **100** | ⏸ | Exact-year mode |
| [noUiSlider](https://github.com/leongersen/noUiSlider) | MIT | UMD (~27.7KB) | 85 | ⏸ | Dormant (2024) but stable; only if custom styling is needed |
| **Speed timer** — hand-rolled | n/a | first-party | **95** | ⏸ | |
| [tocktimer](https://github.com/mrchimp/tock) | MIT | classic script (~4.8KB) | 85 | ⏸ | ⚠️ npm **`tock`** is an unrelated Node cron framework — use **`tocktimer`** |

### 4.3 Competition & social

| Option | License | Build | Rating | Status | Notes |
|---|---|---|---|---|---|
| **AI opponent** — hand-rolled seeded heuristic | n/a | first-party | **97** | ⏸ | No permissive lib exists; keep deterministic under the daily seed |
| **Local leaderboard** — hand-rolled | n/a | first-party | 96 | ⏸ | Online boards must recompute/verify server-side |
| [Trystero](https://github.com/dmotz/trystero) | MIT | **ESM-only** | 82 | ⏸ | **0.25.4**; serverless (BitTorrent/Nostr/MQTT/IPFS…). **Prototype-grade only** — no authoritative server; never ranked play |
| [PeerJS](https://github.com/peers/peerjs) | MIT | **classic IIFE** (~87KB) | 80 | ⏸ | 1.5.5; still needs a signaling server; maintenance slow |
| [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) | service | server | 80 | ⏸ | **Now on the Free plan** (SQLite). Authoritative rooms = the production path. ⚠️ bill by GB-s — use **WebSocket Hibernation** or costs balloon |
| **Pass-and-play** — hand-rolled turn state | n/a | first-party | 95 | ⏸ | |

### 4.4 Learning & accessibility

| Option | License | Build | Rating | Status | Notes |
|---|---|---|---|---|---|
| **Narration (shipped)** — pre-rendered MP3 + `speechSynthesis` | n/a / platform | n/a | **95** | ✅ shipped | `narration.js`. **Keep** — see §2 re: Kokoro |
| [easy-speech](https://github.com/jankapunkt/easy-speech) | MIT | IIFE (~38KB) | 85 | — | Unnecessary; native path already in use |
| **Hints** — native [Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) | platform | n/a | 92 | 🔜 | Add fallback; never hide *critical* instructions behind it |
| **Learn-more** — Wikipedia REST `fetch` | content CC-BY-SA | first-party | 95 | ⏸ | CORS `*` verified; cache in `localStorage` |
| **Modals** — native [`<dialog>` + `inert`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog) | platform | n/a | 95 | ⏸ | Test focus-return + Escape |
| **Colorblind-safe feedback** — palettes + text | [Tol/Okabe–Ito](https://davidmathlogic.com/colorblind/) | data | 96 | 🔜 | Never colour-only: "Correct — 1789 belongs between 1600 and 1800" |
| [driver.js](https://github.com/nilbuild/driver.js) | MIT | **IIFE** `driver.js.iife.js` (~25KB) | 86 | ⏸ deferred | 1.8.0. Prefer a lighter first-run (one sentence + highlighted event) first |
| [shepherd.js](https://github.com/shipshapecode/shepherd) | 🚩 **AGPL-3.0 + Commercial** | ❌ **no UMD/IIFE** | **10** | 🚫 | Doubly disqualified (license + no browser build) |
| **Keyboard** — [tinykeys](https://github.com/jamiebuilds/tinykeys) | MIT | UMD (~2KB) | **88** | 🔜 | 4.0.1; best for ~10 bindings |
| [hotkeys-js](https://github.com/jaywcjlove/hotkeys-js) | MIT | global (~8.3KB) | 85 | — | 4.0.8; heavier, but richer modifier handling |

### 4.5 Platform, backend & monetization

| Option | License | Build | Rating | Status | Notes |
|---|---|---|---|---|---|
| **PWA** — hand-rolled SW + manifest | n/a | first-party | **90** | 🔜 | A service worker is **no longer required for installability** (Chrome 108/112+), but add one for offline. Network-first HTML, cache-first assets; `updateViaCache:"none"` |
| [workbox-sw](https://developer.chrome.com/docs/workbox/modules/workbox-sw) | MIT | CDN `importScripts` | 65 | ⏸ | 7.4.1 works without a bundler, but pulls modules from Google's CDN and needs a hand-maintained precache manifest — no win here |
| [@supabase/supabase-js](https://github.com/supabase/supabase-js) | MIT | **UMD**, global `window.supabase` | 88 | ⏸ | 2.117.2; UMD **~54.3 KiB gzip**; officially CDN-supported; **lazy-load on first sign-in**. ⚠️ v3 in `next` |
| supabase **auth without the SDK** | n/a | — | 45 | 🚫 | Refresh tokens are single-use, HMAC counter-based (2025-10); hand-rolling rotation/reuse-detection is a trap |
| [Cloudflare Workers + KV + D1](https://developers.cloudflare.com/workers/platform/pricing/) | service | server | 85 | ⏸ | Free: 100k req/day, KV 1k writes/day, D1 5GB |
| **Error tracking** — hand-rolled `onerror` + `unhandledrejection` → Worker | n/a | first-party | 88 | ⏸ | Never log deck contents / learner data |
| [@sentry/browser](https://github.com/getsentry/sentry-javascript) | MIT (client) | UMD (~30.6KB gz) | 78 | ⏸ | ⚠️ **self-hosted server is FSL-1.1** (non-compete) — SaaS sidesteps it |
| [GlitchTip](https://glitchtip.com/) | MIT | server | 70 | ⏸ | Permissive Sentry-compatible alternative |
| **Analytics** — [Umami](https://github.com/umami-software/umami) | MIT | 2.3KB snippet | 82 | ⏸ | 2.10.0; lightest **fully permissive** end-to-end; Hobby free / self-host |
| [Fathom Lite](https://github.com/usefathom/fathom) | MIT | server | 72 | ⏸ | Maintenance-only |
| [GoatCounter](https://github.com/arp242/goatcounter) | ISC snippet / **EUPL server** | snippet | 65 | ⏸ | 🚩 EUPL on the server |
| [Plausible](https://github.com/plausible/analytics) | 🚩 AGPL-3.0 (server) | snippet | 30 | 🚫 | Tracker is MIT; server is AGPL |
| [Matomo](https://github.com/matomo-org/matomo) | 🚩 GPL-3.0 | server | 30 | 🚫 | |
| **i18n** — hand-rolled table + [`Intl`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl) | n/a | first-party | 92 | ⏸ | |
| **Achievements** — hand-rolled over the review log | n/a | first-party | 97 | ⏸ | Celebrates with the already-vendored canvas-confetti |
| [RevenueCat purchases-capacitor](https://www.npmjs.com/package/@revenuecat/purchases-capacitor) | MIT | npm (shell layer) | 80 | ⏸ | 13.6.1; free ≤ $2.5k MTR, then 1% |
| [RevenueCat purchases-js](https://www.revenuecat.com/docs/web/web-billing/web-sdk) | MIT | **UMD**, global `Purchases` | 78 | ⏸ | 1.65.0; scripts the API as `Purchases.Purchases.configure()` |

### 4.6 Polish & developer tooling

| Option | License | Build | Rating | Status | Notes |
|---|---|---|---|---|---|
| **SEO/OG** — static meta + committed PNG | n/a | first-party | 98 | ⏸ | Crawlers don't run JS |
| **Undo/redo** — hand-rolled history stack | n/a | first-party | 97 | ⏸ | |
| **Theming** — CSS custom props + `data-theme` | n/a | first-party | 97 | 🔜 | |
| **Easter eggs** — hand-rolled key listener | n/a | first-party | 95 | ⏸ | |
| **Haptics** — native `navigator.vibrate` | platform | n/a | 92 | ⏸ | No iOS Safari support |
| **Share image** — hand-drawn canvas card | n/a | first-party | 90 | ⏸ | Most robust; no CORS/taint |
| [modern-screenshot](https://github.com/qq15725/modern-screenshot) | MIT | UMD (`dist/index.js`) | 88 | ⏸ | 4.7.0; best DOM-snapshot fallback |
| [html-to-image](https://github.com/bubkoo/html-to-image) | MIT | UMD | 85 | ⏸ | 1.11.13 |
| [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) | platform | n/a | 90 | 🔜 | `navigator.canShare({files})` → `navigator.share()`. **Firefox desktop has none** — keep a download/clipboard fallback |
| [html2canvas](https://github.com/niklasvh/html2canvas) | MIT | UMD | 60 | 🚫 | Inert (1.4.1, 2022) |
| **Minification** — one-shot `esbuild --minify` (no bundle) | MIT | CLI (dev) | 90 | ⏸ | Fold into the packaging staging script; no bundler |
| **Content pipeline** — [ajv](https://github.com/ajv-validator/ajv) + `node --test` | MIT / n/a | tool-side | ✅ shipped | ✅ | `tools/content-pipeline`; tests already run via `npm test` |
| **Testing** — [Playwright](https://github.com/microsoft/playwright) | Apache-2.0 | dev-only | 88 | ⏸ | `file://` is a documented first-class path; add FX smoke tests to the manual checklist |

### 4.7 Narration authoring & pronunciation quality (verified 2026-09-29)

Research question: after Kokoro mispronounced "Theses" in a shipped clip, what
is the ecosystem's answer to pronunciation control — and would a higher model
tier have helped?

| Option | License | Build | Rating | Status | Notes |
|---|---|---|---|---|---|
| **LEXICON respeller** — `tools/narration/text.mjs` | n/a | first-party | **96** | ✅ shipped | Word→respelling `Map` applied to the spoken text only, covered by `textHash`/content key, so one new line re-renders exactly one clip. Proven on `"theses" → "thee-seez"`. Evidence ritual: `npm run narration -- --deck <id> --listen` |
| [misaki](https://github.com/hexgrad/misaki) (Kokoro's official G2P engine) | Apache-2.0 (LICENSE read from repo) | **Python** (PyPI 0.9.4, pre-1.0) | **80** | ⏸ escalation path | The real "lexicon library" of this ecosystem: gold/silver pronunciation dictionaries + rule layer, eSpeak only as fallback, and exact-phoneme overrides (`[Misaki](/misˈɑki/)`). Cost: a Python toolchain beside the Node one — adopt only for words a respelling cannot fix (foreign proper nouns: Tenochtitlan, Taíno) |
| **Model tier upgrade** — fp32 `model.onnx` (326 MB) or fp16 (163 MB) | Apache-2.0 (model) | ONNX files | 70 | ✅ **adopted as default 2026-09-30** (was ⏸) | fp32 is the top tier of this family, and the official model card calls the model "resilient to quantization". Adopted on cost grounds, not correctness: q8 was only a download-size compromise (the MP3 encode dominates shipped bytes) and the extra 234 MB is gitignored, author-time only. All 40 clips re-rendered in ~3 min. **Still not a correctness knob:** the text→phoneme step is identical across tiers, so no tier fixes a mispronunciation. `--dtype fp16\|q8` keeps the others selectable |
| **Reference-pronunciation dictionary** — [`cmu-pronouncing-dictionary`](https://www.npmjs.com/package/cmu-pronouncing-dictionary) | ISC | npm devDependency | **90** | ✅ shipped (`tools/narration/reference.mjs`) | CMUdict, 135k entries. It cannot *fix* a word, but it can **measure** one: comparing the engine's stress + stressed-vowel class against a reference turns the audit from a spelling guess (42 words in one deck, most of them innocent) into a verdict — `disagrees` (fixable), `no-reference` (needs a human source), `context` (homograph), `agrees` (skip). Author-time only, 4.5 MB, optional: the audit degrades to spelling-only |
| **WikiPron `eng_latn_us_broad`** (CUNY-CL) | Apache-2.0 | TSV, 106,931 lines | **78** | ✅ shipped, **advice only** (`tools/narration/wikipron.mjs`) | Human broad transcription, so it is **independent evidence** rather than a restatement of the engine — it gives the right `qin`→`t͡ʃ ɪ n`, `hijra`→`h ɪ d͡ʒ ɹ ə`, `mali`→`mɑli`, `pericles`→`pɛɹɪkliːz`. Printed beside the engine's own phonemes in the audit so the `qin` case is visible at a glance. It **never moves a tier**: an earlier version demoted `agrees`→`disagrees` on a phone mismatch and measurement killed it (it also flagged `world`, `empire`, `napoleon`, `athens`) — see §4.7.2. **No stress marks**, so it cannot arbitrate the stress cases (Bastille, Raskolnikov) CMUdict gets wrong, and it lacks `cleisthenes`/`mughal`/`babur`/`raskolnikov`/`taino`/`aotearoa` |
| **Voice change** (af_heart → af_bella…) | Apache-2.0 | voice `.bin` | 60 | ⏸ | The lever listeners notice more than quantization; switching means a full re-render (the content key machinery covers it) |

### 4.7.1 ❌ Rejected: `beshkenadze/kokoro-ipa-lexicons` (re-probed 2026-09-30)

An IPA lexicon with **stress marks** for Kokoro, 124,447 English entries — on paper
exactly the missing stress authority, and the only candidate found that carries
`ˈ`/`ˌ` where WikiPron does not. Rejected on two independent grounds, the first
of which is decisive and measured:

1. **It is the engine's own output, pre-baked.** The README states the data is
   extracted from `espeak/lexicon.db` in the `gruut-lang-*` packages, generated by
   eSpeak-NG. Compared against our own `phonemizer` (the eSpeak-NG build inside
   `tools/narration/node_modules/`) over a 599-word sample: **581 identical, 18
   differing — and all 18 are dialect artifacts** of the default en-GB voice
   (`ɪn` for `ɪŋ`, `ə` for `ɚ`), not different analysis. It is the *same oracle*,
   so it can never flag a word the engine gets wrong — it repeats the error
   instead of catching it. It is a cache, not a second reference. It agrees with
   us on every word we have shipped a fix for, and it is **absent** for
   `hijra`, `pericles`, `mexica`, `cleisthenes`, `mughal`, `babur`,
   `raskolnikov`, `taino`, `aotearoa`, `ii` — precisely the addressable set.
2. **Licence is unresolved by the author's own account.** No `LICENSE` file in
   the repo, no licence metadata, and the README states the eSpeak-derived data is
   "generated via espeak-ng (GPL v3)" whose "legal status of bulk phonemization
   output from a GPL tool is debated". Rule 2 requires permissively licensed
   material; shipping or depending on this would import that ambiguity.

The generalisable lesson: **a stress-marked lexicon is only worth having if it is
not derived from the engine you are auditing.** For Kokoro that rules out every
eSpeak-derived IPA lexicon, however well-formed, and leaves human transcription
(WikiPron, CMUdict) or misaki's gold dictionaries as the only real options.

### 4.7.2 ❌ Rejected: automatic cross-notation phone comparison (WikiPron vs CMUdict)

The idea was to compare a WikiPron reading against the CMUdict one phone by
phone and demote `agrees` → `disagrees` on a mismatch. That would have been the
automatic signal for the borrowed-name class — the failure §4.7 records as
undetectable offline — and on the motivating word it works: `qin` is K IH1 N
against `t͡ʃ ɪ n`.

It does not survive contact with ordinary words. Measured over real candidates
it reported **`world`, `empire`, `napoleon` and `athens`** as contested. Two
structural causes, neither a tuning problem:

- **Segmentation differs.** ARPAbet writes an r-coloured vowel as ONE phone
  (`ER`, `AY R`) where IPA writes TWO (`ɜ ɹ`, `aɪ ɚ`). So `W ER1 L D` is
  `[W,R,L,D]` against `w ɜ ɹ l d` is `[W,V,R,L,D]` — four against five, not
  index-aligned, and any position-wise difference is an artefact. The
  `length difference > 1 → abstain` guard did not catch it because the gap is
  exactly 1.
- **The two vowel classifiers name their classes differently** (`"front"` vs
  `"close-front"`), so even a length-matched pair drifts apart on naming. A
  hand-written `REDUCED` merge bridged some pairs and still let `napoleon`
  through on `OW`/`əʊ` and `IY`/`i`.

A verdict that flags "world" as disputed would send the commonest words in the
corpus to the ear, which is the queue-explosion failure the reference layer
exists to prevent. **Shipped instead: the reading is shown, never obeyed** —
`classify()` returns it as `second` and the audit prints it after the engine's
own phonemes, so `qin` shows `K IH1 N … ‖ wikipron t͡ʃ ɪ n` and a human sees
the problem instantly. `BORROWED_NAMES` remains the curated route to the ear.
Pinned by `test/reference.test.mjs` (the two REGRESSION tests fail if the
comparison is re-added).

Doing this properly needs a real phone aligner, not a positional diff. That is
the honest next step if the class ever needs to be automatic.

### 4.7.3 Evaluated: `kokorog2p` (2026-09-30) — rejected on engineering, not licence

[kokorog2p](https://pypi.org/project/kokorog2p/) (Holger Nahrstaedt, **Apache-2.0**)
is a purpose-built Kokoro G2P with curated gold dictionaries, and was the
escalation path worth measuring. **Rejected** — but *not* on licence, and
recording that correction matters because I initially judged it too strictly.

**Licence is a non-issue here, and the repo has already settled the principle.**
kokorog2p is Apache-2.0, author-time, never under `assets/`, never in a shipping
path. More decisively, `THIRD_PARTY_LICENSES.md` already documents eSpeak-NG as
GPL-3.0 and accepts that **the generated audio ships while the code does not** —
the 40 shipped clips are already the output of a GPL phonemizer. Applying a
stricter bar to a candidate than to the shipped pipeline is inconsistent, so
licence drops out as a criterion.

Rejected instead on three engineering grounds:

1. **Its English data is not auditable and not in-repo.** The wheels ship *no*
   dictionaries; `en-us:gold` must be provisioned by a separate `lexphon` CLI
   from a third-party catalog (`g2lex-data`), in a `kokoro-v1` encoding. That is
   an external availability and provenance dependency for author-time tooling.
2. **It is a far larger machine than the job needs** — multi-language routing,
   span overrides, an evidence model, 19 language frontends — for a
   single-language, one-deck-at-a-time tool.
3. **The dictionary it would use is the asset that is actually missing.** Its
   English gold is the same class of data as [misaki](https://github.com/hexgrad/misaki)'s
   `us_gold.json`, which *is* auditable (Apache-2.0, in-repo, plain JSON, no
   provisioning, no Python needed to read it). Measured against our real
   candidate set, that dictionary is **silent on exactly the words that motivate
   all of this work** — `qin`, `qing`, `cleisthenes`, `mughal`, `babur`,
   `raskolnikov`, `sundiata`, `tenochtitlan` are absent from both its gold and
   silver layers. 85 of 263 candidates are in neither.

**The valuable part is the dictionary, not the G2P engine** — and as a
*reference* it is a genuine third opinion that carries stress marks, which
WikiPron does not. It independently confirms three shipped `LEXICON` fixes:
`hijra` → `hˈɪʤɹə` (the j survives), `theses` → `θˈisˌiz`, `medina` → `mədˈinə`.
Those are direct string readings, so they need no comparison to trust.

**Recorded failure — a disagreement count I could not make valid.** Three
attempts, all invalid, all the same family of trap as §4.7.2:
(i) comparing stress *position* by token index — misaki writes IPA unspaced
(`dˈɛzəɹt` is one token), so indices are not comparable; (ii) 790 of its values
are objects, not strings, which silently zeroed the comparison; (iii) the
notation-safe retry — comparing the stressed *vowel symbol* via the existing
`vowelClassIpa`/`vowelClassArpa` maps — still fails, because **misaki writes a
Kokoro-specific ASCII phoneme alphabet, not IPA** (`A`=ɑ, `O`=ɔ, `I`=ɪ, `E`=ɛ,
`T`=ᵊ). So `vowelClassIpa` misreads it, and a raw 48-agree/17-differ split is
contaminated. **No disagreement count is claimed.** Making one sound needs that
alphabet mapped, plus the aligner §4.7.2 already calls for.

Findings recorded so they aren't re-derived:

- **Kokoro has no first-class lexicon.** hexgrad/kokoro#156 ("How to correct a
  word's pronounce?") is open and unanswered; the npm kokoro-js path does G2P
  through its embedded eSpeak build **without misaki's dictionaries** — which is
  exactly why "theses" read wrong.
- **The ecosystem pattern is a self-maintained override map** (TTS reader apps
  implement word/regex rules; kokoro-rs documents custom lexicons the same way).
  Our `LEXICON` *is* that pattern, already integrated with the render cache.
- **Quality ladder (model card):** fp32 326 MB → fp16 163 → q8 92.4 → q8f16 86 →
  uint8 177 → q4 154. Quantization changes rendering fidelity only, never which
  sounds are produced.
- **A screen is not a verdict, and a measurement is a screen.** Spelling
  heuristics ("non-ASCII, rare clusters, long words") over-flag by an order of
  magnitude and, worse, *silently skip names* — the one class with no ordinary
  English reading to fall back on. Comparing against a reference dictionary
  made `world-history-first-timeline` go from 13 unjustified candidates to 6
  actionable ones (1 disagrees, 4 need a human source, 1 context), and it is
  what makes `tenochtitlan`/`sundiata` visible at all. CMUdict is American, so
  British spellings need a variant lookup or they masquerade as unknown words.

---

### 4.7.4 The auditable record layer, and what a respelling cannot do (2026-09-30)

**The gap this closed.** Provenance for pronunciation overrides lived in prose
comments beside the entry, where nothing could check it. Injecting an
unevidenced `LEXICON` entry passed the entire suite — the only failure was
`textHash` staleness, an objection to the *audio* being out of date, which a
routine re-render clears permanently. `lexicon-records.mjs` now holds one record
per grapheme form (verified phoneme, status, reason, and one of three typed
sources) and the suite fails without one. Re-injecting the same probe now fails
**two** gates that a re-render cannot clear.

**Three sources, not two.** Forcing every fix into "reference or decision" would
have meant citing a dictionary for "World War **One**", which is a style choice
and not a fact. The third kind is `measurement`: the evidence is this project's
own reference layer (engine phonemes against a dictionary reading, then the ear).
`reason` is required but is never a substitute for provenance — the two are
tested independently, so a well-written rationalisation cannot stand in for a
citation. `reference` entries carry a `url` only where a page was actually
opened; a plausible-looking link nobody read is worse than no link.

**A third terminal status was needed.** Clearing the first real deck produced a
word no respelling could reach, and with only `fixed` and `confirmed` it had
nowhere to live except a worksheet nobody reads. `deferred` records the
investigation *and the reason*, so the next person does not start from zero.

**What a respelling cannot do — `tenochtitlan`.** The standard reading is
teh-NOCH-tee-TLAHN, five syllables with the `/tl/` cluster intact. The engine
force-syllabifies `/tl/` as `/t.l/` in **every** candidate tried (ten of them),
each yielding six syllables with a doubled "tee": a respelling cannot express an
unbroken cluster. This is the same wall as Raskolnikov's stress, reached for a
different reason, and it is a real limit of the `LEXICON` approach rather than a
missing entry. The generalisable form: **the respelling layer cannot create a
syllabic structure the engine's own segmenter will not produce.** It fixes
vowels, stress, and consonant identity — not syllable count.

**And a matcher bug found on the way.** `applyLexicon` interpolated the key
straight into `new RegExp`, so a key was a pattern: `a.b` also rewrote `axb`, and
`cote (divoire)` never matched at all. Both silent. No shipped entry was affected
— all eight keys were metacharacter-free by luck — but the backlog is 143
exotic proper nouns, exactly the shape of name that trips it. The exported
matcher is also deliberately non-global, because a `/g` regex is stateful under
`.test()` and turns the second assertion about any pattern into a different
question.

### 4.7.5 Look the name up under its own script (2026-09-30)

**The false negative, and what it cost.** A Wiktionary probe of the English
exonym `Cleisthenes` returned 404, so the worksheet's advice ("open Wiktionary")
was followed, found nothing, and the record was written as *"Wiktionary has no
entry for this name, so no URL is claimed"* — a confident, checkable, **false**
statement committed to the provenance layer. Checking the same name under its
Greek script, `Κλεισθένης`, returns a full entry: an IPA chain across dialects
(5th BCE Attic `/kleːs.tʰé.nɛːs/` → Koine → Medieval → Constantinopolitan, all
`/klisˈθe.nis/`) and a **Descendants** block that names the English learned form
outright — `→ English: Clisthenes (learned)`, plus the modern Greek descendant
`Κλεισθένης (Kleisthénis)`. Everything the record needed was in the entry the
lookup never opened.

The lesson generalises past this word: **the English exonym is the headword
least likely to have an entry.** `Cleisthenes` and `Babur` both 404; `Odoacer`
and `Moghul` exist. A `no-reference` verdict from an English-only probe is
untested, not negative. The worksheet's `LOOK_FIRST` now leads with the native
script and names the Descendants block as the citation route for whatever
anglicised reading we ship.

**And the shipped reading was wrong.** Having found the entry, the respelling
turned out to be unsupported. The record claimed `kly-stee-neez`
(`/klˈaɪstˈiːnˈiːz/`) as "the reading used in English histories"; three sources
say otherwise:

| source | reading | what kind of evidence |
|---|---|---|
| English Wikipedia lead | `/ˈklaɪsθɪniːz/` **KLYS-thin-eez** | `{{IPAc-en}}` + `{{respell}}` in the wikitext — hand-maintained convention, **not** an `{{audio}}` recording |
| Wiktionary descendants | `/klisˈθe.nis/` kli(s)-THEN-is | derived from the living modern Greek name, not from Attic reconstruction |
| Wiktionary, son of Sibyrtius | "KLYSSE-thin-eez" | a second hand-maintained respelling, variant cluster |

The respelling is now `klys-thin-eez` → `/klˈaɪzθˈɪnˈiːz/`, which matches
Wikipedia's phone sequence exactly (`/sθɪniːz/`); the single `/z/` is eSpeak
voicing the final `/s/` of the respelling, a mechanism artefact like the
per-chunk stress marks. **Wikipedia's `{{IPAc-}}` field is the closest thing to
"the form an English textbook uses" that is free, stable and citable** — but it
is a convention, and the record now says so rather than implying a recording.

**On the earlier record's failure mode.** "Anglicised reading used in English
histories of Athens" was a real, defensible intuition, and it was also
unfalsifiable as written — which is exactly how it survived. A source of kind
`reference` is only worth having if it names something a reader can open; the
test suite cannot check a citation's truth, so a citation that is a rationalisation
is indistinguishable from one that is a source until a human opens it. The
cheapest defence is the one now built in: the *lookup procedure* is written down
(`LOOK_FIRST`), so the next person repeats the probe and finds the entry.

### 4.7.6 What the record layer can and cannot enforce (2026-09-30)

§4.7.4 built the record layer and §4.7.5 found a false citation sitting in it.
The second one is the more useful result, because it says what shape of
guarantee is actually available.

**The pipeline is strong on internal consistency and blind to external truth.**
After the fix, four failure classes are genuinely closed: an override with no
record, a respelling that has drifted from its recorded phonemes, a lexicon
entry that no deck speaks any more, and audio that has not caught up with the
fact text. All four fail a gate. What is still open is the failure that actually
occurred — a citation that is *shaped* like a source and is not one.

The test suite cannot check that a citation is true. It can check that a
`reference` record either names a resolvable URL or admits in a field of its own
that no page was opened. That is a real gain and a modest one: it converts an
unfalsifiable sentence into a visible claim, and it is why `noUrlBecause` is a
required field rather than a convention. The honest summary is that the layer
now makes dishonesty *cost something* without making it impossible.

**A confidence label was proposed and rejected.** The instinct is to add
`confidence: high | medium | low` to distinguish "good enough" from "settled".
That is a third orthogonal axis beside `source.kind` and `status`, and it is
hand-authored — so `low: my reading` becomes a guess with a rubber stamp that
satisfies the schema. The principle that settles it: **derive what a machine can
compute, only make a human write what it cannot.** A machine can check that a
URL resolves and that a record exists; it cannot check that a citation is
truthful. Confidence is the one field that cannot be derived and does not need
to be, because `url` XOR `noUrlBecause` already carries the part that matters.

**Deferred needed a kind, not a bucket.** The suggestion to add a separate
"not resolvable" category was right about the information and wrong about the
structure: `deferred` already exists as a terminal status. What was genuinely
missing was the *reason* being countable, so `deferredKind` was added —
`transliteration`, `historical-reconstruction`, `non-standard-form`,
`no-established-pronunciation`, `engine-limit`. The last is the one that matters
here, because `tenochtitlan` is not a name nobody knows how to say; it is a
reading the engine cannot be respelled into. Without it, a mechanism limit and
an evidential gap look identical in the only report anyone reads.

**The backlog is generated because a hand-kept list lies.** 138 open words
across four decks is too many to hold in a wiki page, and too many to fix
casually; a list nobody reads is not a control, and a list someone maintains by
hand is worse than none, because it drifts from the decks and then reads like a
control while disagreeing with reality. It is derived by
`scripts/gen-pronunciation-backlog.mjs` on the same `--check` pattern as
`decks/index.json`, with a ceiling that is a high-water mark: the open count
falls as work lands, the ceiling holds, and growth must be requested by name
(`--raise-ceiling`) so it appears in a diff as an act rather than as arithmetic.
Verified in all three directions — stale file fails, unacknowledged growth
fails, acknowledged growth succeeds.

Two details are load-bearing. The file carries a **hash, not a timestamp**: a
date makes every fresh run differ, which turns a staleness gate into a calendar
alarm, and `git log` already answers "when". And the gate **fails when the
audit cannot run**, because a backlog generated from partial data must never
look like a smaller backlog — a check that could not run must never report
clean. This is the same rule the native-script probe will have to obey, and it
is why that probe is an audit-time enrichment and not a gate: it is networked,
and a networked gate fails on someone else's rate limit.

**The ceiling does not belong in the generated file.** The pronunciation ratchet
was first built with `ceiling` as a field in the JSON, and `--check` read it
from disk — so raising the number in the generated file raised the ceiling and
the check still passed. That is a ratchet anyone can defeat without noticing,
which is the same failure as an unratcheted list wearing a control's clothes.
The ceiling is now a `CEILING` constant in the *generator script* for both
backlogs, so moving it means editing code. The general form: **a ratchet must
be anchored outside the artefact it governs**, or it is decoration.

**The second ratchet, and why the content gate left the chain.**
`npm run validate` was permanently red: `tools/content-pipeline/README.md`
states "no source → no ship", and measured on 2026-09-30 **0 of 321 events in
any deck carried a `source`** — `content/sources/` holds 11 documents for 321
events, so the policy has never been met, only exempted. Two decks carry
`"grandfathered": true`, which downgrades `SOURCE_MISSING` and
`FIELD_TRACE_MISSING` to warnings, so the gate reported 80 errors (one per
event in the two *unflagged* decks) and 201 findings as warnings. It was
surfacing 29% of a uniform gap and calling the rest grandfathered.

Two obvious fixes were both rejected. Grandfathering the other two decks is two
lines and makes `validate` green, but it makes all four decks exempt and the
policy applies to nothing — retiring a rule by paperwork. Backfilling sources
is the intended path but is content research on a scale nothing else here
touches: each event needs a registered source with a known licence and
attribution, plus verbatim claim quotes, behind `SOURCE_UNREGISTERED`,
`LICENSE_MISSING`, `ATTRIBUTION_MISSING`, `CLAIM_NO_QUOTE` and
`CLAIM_UNSUPPORTED`. So the gate was taken **out of the chain** and the gap
turned into a counted, bounded, visible number instead, with `validate`
printing a pointer to it and to how to run it.

The interesting part is that neither number is wrong. `0 of 321 sourced` and
`80 errors` are both true; the defect was that they were reported through a
channel that is supposed to be green, which trains people to ignore red. Same
lesson as the false citation, one level up: **the danger is not a bad number,
it is a number delivered in a form nobody reads.**

**What this buys, stated plainly.** The 138 words do not get smaller by being
listed better; they get smaller when someone does the lookup. What changed is
that the count is now bounded, visible, cannot rot, and cannot be quietly
reduced by running something on partial data. The pipeline still cannot tell a
wrong-but-well-cited pronunciation from a right one — only an ear, and a human
opening the page, can do that.

## 5. License traps (quick reference)

| License | Applies to | Risk |
|---|---|---|
| **GPL-3.0** | **eSpeak-NG** (inside kokoro's `phonemizer`), **Matomo** | 🚩 strongest copyleft — see §2 |
| **AGPL-3.0** | **Plausible** (server), **shepherd.js** | 🚩 network-use source disclosure |
| **EUPL-1.2** | **GoatCounter** (server) | 🚩 copyleft on distribution |
| **FSL-1.1-Apache-2.0** | **Sentry self-hosted** server | 🚩 source-available, non-compete (→ Apache after 2 yrs) |
| **Apache-2.0 (bundled)** | **globe.gl** → Uber **H3**; vis-timeline | ✅ permissive, **but attribution/NOTICE required** |
| **MIT / ISC / BSD / CC0** | everything else in §3–§4 | ✅ |

**Rule of thumb:** a package's declared license does not cover a copyleft component
it *bundles*. Check the bundle, not just `package.json`.

---

## 6. Implementation patterns (verified best practice)

**Daily seed (make the Daily genuinely shared).** Reuse what's already there —
`hashString` (FNV-1a) + `mulberry32` + `utcDateKey()`:
```js
const DAILY_VERSION = "v1";
function dailySeed(now, deckId) {
  const day = Math.floor(now / 86400000);          // UTC day number: no DST, worldwide-stable
  return hashString(`timeline-${DAILY_VERSION}:${deckId}:${day}`);
}
// startGame(): mode === "daily" ? dailySeed(Date.now(), deck.id)
//                          : (Date.now() >>> 0) ^ ((Math.random() * 1e9) >>> 0)
```
- Bump `DAILY_VERSION` to intentionally reshuffle all dailies (document it).
- **Gotcha:** `buildPuzzle()` selects from the *current* deck, so editing a deck
  silently rewrites historical dailies. If archive stability matters, add the deck's
  `manifest.version` to the seed key.

**Streak = derived, never stored.** Per `GAMIFICATION_BRIEF.md` D1–D3, the review log
is the only write; streak/longest/freeze are pure functions. Duolingo-style freeze =
one auto-freeze per calendar week; a ≤3-day gap shows "paused", never a broken flame.

**Service worker (no-build).** Cache name = a version token (mirror the `?v=N`
discipline); `activate` deletes non-allow-listed caches; **network-first for
navigations** (never stale-while-revalidate on the shell), cache-first for assets;
serve `sw.js` with `Cache-Control: no-store`.

**Supabase without a bundler.** Vendor the UMD (`window.supabase`), **lazy-load on
first sign-in** via script injection; pin the exact version. Don't hand-roll auth.

**Share card.** Draw a fixed canvas (emoji/text/vector only — no cross-origin
imagery, so the canvas never taints) → `canvas.toBlob` → `navigator.share({files})`
when `canShare`, else `<a download>`, else clipboard. Always keep a visible fallback
(Firefox desktop has no Web Share).

**Exclude from app packages (roadmap §5.1):** `sw.js`, `doc/`, `scripts/`,
`.freebuff/`, **and** the author-time `tools/kokoro-authoring/` tree — see §2.
Nothing copyleft lives under `assets/` any more, and `npm run validate:vendor`
keeps it that way.

---

## 7. Corrections log (things earlier research got wrong)

Recorded so they aren't re-litigated:

- **`tock` ≠ the timer.** npm `tock` is a Node cron framework; the countdown timer is **`tocktimer`**.
- **`sm-2` (cnnrhill) is dead.** Last commit 2017, no LICENSE file, not on npm — do not depend on it (hand-roll or use ts-fsrs).
- **`use-streak` is real but dead + buggy.** It *does* ship a 1.5KB UMD and *is* framework-agnostic (not a React hook), but it's abandoned (2022) and resets at month boundaries.
- **`shepherd.js` is AGPL-3.0 + Commercial, and ships no UMD** as of v15 — a double disqualifier.
- **`chroma.js` v3 dropped classic-script builds** (UMD only ≤ 2.4.2).
- **The "170KB gzipped WebView threshold"** is a misattributed 2018 *web-transfer* budget; irrelevant when assets load from disk in Capacitor/Tauri (see roadmap §3).
- **supabase-js is MIT** (not Apache-2.0), and its UMD is **~54 KiB gzip** (the "218KB" figure was the *unminified* file).
- **Capacitor/Tauri do NOT require a bundler** (roadmap §5.1 — official vanilla templates wrap raw static dirs).
- **`bryc` PRNGs are public-domain-with-MIT-fallback**, not Unlicense; and bryc notes mulberry32 skips ~⅓ of 32-bit values.

---

## 8. Verification provenance

- **Date:** 2026-09-27. Method: five parallel research passes over npm registry
  metadata, jsDelivr/unpkg file trees (to confirm browser builds actually exist),
  raw LICENSE/source files, and GitHub API (archived flag, last push), plus two
  independent cross-AI reviews of an earlier draft.
- **Repo state** at verification: `decks-io.js`, `narration.js`/`narration-worker.js`,
  `globe.js`, `tools/content-pipeline/`, folder decks with `manifest.json`, and the
  vendored `assets/vendor/kokoro/` tree all present.
- **Follow-up (2026-09-29):** §2 is recovered — `narration-worker.js` is gone and
  the Kokoro tree now lives (gitignored, author-time) at `tools/kokoro-authoring/`.
  Everything else in this document was left as verified on 2026-09-27.
- **Follow-up (2026-09-29, pronunciation research):** §4.7 added from a web pass
  over the HF model card, the misaki repo (Apache-2.0 confirmed from its LICENSE
  file) and hexgrad/kokoro#156. No repo state changes; misaki not adopted.
- **Follow-up (2026-09-30, pronunciation QA + tier):** §4.7's model-tier row moved
  to ✅ (fp32 is now the generator's default; the whole narrated deck re-rendered,
  `deck.narration.dtype` flipped to `fp32`) and a new row records
  `cmu-pronouncing-dictionary` 3.0.0 (ISC, read from the package's npm metadata
  and its bundled `license` file). `phonemizer` was also promoted from an
  indirect dependency to an explicit devDependency: `tools/narration` imports it
  directly, and relying on npm hoisting was an accident waiting to happen.
- **Re-verify before adopting.** Prioritise: any 🚩/⏸ item, anything pinned to a
  version, and the watch-list below.

**Watch-list:** supabase-js **v3** (`next`); Cloudflare **DO SQLite storage billing**
(live 2026-01) and the GB-s **hibernation** cost trap; RevenueCat Stripe
tax-behaviour default (**2026-05-01**); **canvas-confetti 1.9.4** bump available.
