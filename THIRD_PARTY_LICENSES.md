# Third-party licenses & attribution

Everything shipped by this game that we did not write, with its version, license
and the attribution it requires. Maintained by hand; **enforced** by
`npm run validate:vendor` (see [scripts/check-vendored.mjs](scripts/check-vendored.mjs)),
which fails the build on any copyleft / non-commercial marker under `assets/`
and on any vendored script whose header has lost its license or pinned version.

**Rule of thumb:** a package's declared license does **not** cover a copyleft
component it *bundles*. Check the bundle, not just `package.json`. This is the
rule that caught the Kokoro case below
([doc/LIBRARY_RESEARCH.md](doc/LIBRARY_RESEARCH.md) §2, §5).

Inventory date: 2026-09-30.

---

## 1. Runtime libraries (`assets/vendor/`)

| Asset | Version | License | Required attribution |
|---|---|---|---|
| `anime.umd.min.js` | 4.5.0 | MIT | Julian Garnier |
| `canvas-confetti-1.9.3.min.js` | 1.9.3 | ISC | Kiril Vatev |
| `globe.gl.min.js` | 2.46.2 | MIT (bundle also contains Apache-2.0 code) | vasturiano / globe.gl; **bundles Three.js r185 (MIT), three-globe (MIT), kapsule (MIT) and `h3-js` (Apache-2.0)** — the Apache-2.0 NOTICE must be preserved and reproduced in the app's licences screen |
| `vis-timeline-graph2d.min.js` + `.min.css` | 8.5.4 | Dual Apache-2.0 / MIT | visjs contributors, Almende B.V. |
| `liquid-glass.js` | unversioned upstream | MIT | rizzytoday/liquid-glass (converted from ESM to a classic script for the no-build setup) |

## 2. Maps, data & globe textures

| Asset | Source | License | Required attribution |
|---|---|---|---|
| `assets/leaflet/leaflet.js` + `leaflet.css` | Leaflet 1.9.4 | BSD-2-Clause | Vladimir Agafonkin, CloudMade |
| `assets/world-land.js` | Natural Earth 110m land outline | Public domain | None required (credit appreciated) |
| `assets/earth-textures.js` | NASA Blue Marble + NASA topology, re-encoded to data URIs | NASA imagery — free to use | **"Image courtesy NASA Earth Observatory"** — keep this credit visible (globe settings/about), not just in the file header |

> Live satellite basemap in Settings also uses NASA GIBS (public domain). The
> offline path is the vector outline above.

## 3. Audio (`assets/audio/`)

See also [assets/audio/LICENSE.txt](assets/audio/LICENSE.txt).

| Asset | Source | License | Required attribution |
|---|---|---|---|
| Interface / UI / Impact SFX (`ui-*.mp3`, `correct-*.mp3`, `wrong-*.mp3`, `place-*.mp3`, `tick-*.mp3`, `impact-*.mp3`) | Kenney.nl "Interface Sounds", "UI Audio", "Impact Sounds" (CC0), converted OGG → MP3 | CC0-1.0 | None required. **The Kenney logo is not CC0 and must not be used.** |
| `music-game.mp3` | Pixabay — "Orchestral Battle / Cinematic Heroic Orchestra" | Pixabay Content License | None required (source retained for reference) |
| `alex-morgan-battle-boss-fight-game-music-583276.mp3` | Pixabay — Alex Morgan | Pixabay Content License | None required |

## 4. Graphics, icons & type

| Asset | Source | License | Required attribution |
|---|---|---|---|
| Icon sprite in `index.html` (incl. `icon-settings`) | Phosphor Icons | MIT | Phosphor Icons |
| `assets/images/title.png`, `scroll.png`, `scroll-border.png`, `background.jpg` | ⚠ **provenance unrecorded** | unknown | Resolve before any store submission (see §7) |
| `assets/cursors/*.png` | ⚠ **provenance unrecorded** | unknown | Resolve before any store submission (see §7) |
| Body type | System font stack (`-apple-system`, Segoe UI, Roboto, …) | n/a | No webfont is bundled or fetched |

## 5. Narration

Shipped narration is **pre-rendered audio that we generate at author time** and
ship with the deck (`decks/<id>/narration/<event-id>.mp3`) — the game never
synthesizes speech at runtime
([roadmap §19.12](doc/CROSS_PLATFORM_ROADMAP.md)). Audio output is not a
derivative work of the engine's source, so no engine license propagates to the
MP3s; the engine is recorded here for audit anyway.

| Component | Version | License | Where it lives |
|---|---|---|---|
| Kokoro-82M (voice of the shipped MP3s) | v1.0 `onnx-community/Kokoro-82M-v1.0-ONNX`, voice `af_heart`, dtype **fp32** | Apache-2.0 | model weights, `tools/kokoro-authoring/` (gitignored) |
| kokoro-js | 1.2.1 (exact pin) | Apache-2.0 | author-time only, `tools/narration/package.json` devDependency |
| phonemizer | 1.2.1 | Apache-2.0 | author-time only, same install — imports the G2P that `pronounce.mjs` inspects. **Its eSpeak-NG payload is GPL-3.0-or-later: see §6** |
| cmu-pronouncing-dictionary | 3.0.0 | ISC | author-time only, same install — the reference pronunciations `reference.mjs` compares the engine against |
| ONNX Runtime (Node/WASM backend) | via kokoro-js → `@huggingface/transformers` | MIT | author-time only, in the same install |
| ffmpeg (`libmp3lame`) | system binary | LGPL-2.1+ / GPL build | author-time only, used as an external program — not linked, not shipped |

**The generator is author-time only.** `npm --prefix tools/narration install`
puts these in `tools/narration/node_modules/` (gitignored). They are never
loaded by the game, never staged into a package, and the game's own dependency
list remains empty. Rendering runs offline against the local model bundle;
nothing is downloaded at render time.

**ffmpeg is invoked as a separate program** (spawned, piped, never linked), and
the shipped artefact is an MP3 — so no ffmpeg or LAME license obligation
attaches to the app. LAME's patents are expired; the library is LGPL-licensed
and its *encoder output* is unencumbered.

## 6. Excluded — must never ship

| Component | License | Status |
|---|---|---|
| **eSpeak-NG** (Emscripten build + data, embedded by `phonemizer` inside the Kokoro browser bundle, and by the `phonemizer` package the npm `kokoro-js` dependency pulls in) | **GPL-3.0-or-later** | 🚩 **Neither copy is under `assets/` nor imported by any first-party file.** One lives in `tools/kokoro-authoring/kokoro/` (gitignored), the other in `tools/narration/node_modules/` (gitignored) — see [tools/kokoro-authoring/README.md](tools/kokoro-authoring/README.md) and [tools/narration/README.md](tools/narration/README.md). Both are author-time only and outside every shipping path; distributing a build that embeds eSpeak would arguably make the combined work GPL-3.0, which is why the shipping runtime synthesizes nothing. |
| The retired runtime narration worker, ORT WASM and 125 MB model bundle | n/a | Removed from the shipping tree 2026-09-29 (retirement ratified in roadmap §19.12.1, decision log 2026-09-20). `npm run validate:vendor` fails if these paths reappear under `assets/`. |

## 7. Deck content

Deck text is third-party-derived content with its own licensing
([roadmap §19.8](doc/CROSS_PLATFORM_ROADMAP.md)), tracked per deck in
`decks/<id>/manifest.json`:

| Deck | Declared license | Attribution recorded |
|---|---|---|
| `world-history-first-timeline` | CC-BY-SA-4.0 | `attribution: []` — **empty, needs filling** |
| `inventions-discoveries` | CC-BY-SA-4.0 | `attribution: []` — **empty, needs filling** |
| `cc-timeline` | none (grandfathered) | none |
| `world-literature` | none (grandfathered) | none |

The narration audio in `world-history-first-timeline` is generated from that
deck's text and inherits its CC-BY-SA-4.0 obligations.

## 8. Open items

1. **`assets/images/*` and `assets/cursors/*` have no recorded provenance.** They
   predate this inventory. Record the source and license for each, or replace
   them, before the game is distributed (roadmap §14, §18).
2. **Deck `attribution` arrays are empty** while two decks declare CC-BY-SA-4.0,
   which requires attribution. Fill them (or normalise to `sources[]`, see
   [doc/CONTENT_PIPELINE.md](doc/CONTENT_PIPELINE.md)) before shipping.
3. **Rebuild an in-app licences screen** from §1–§4 when the packaging layer
   exists ([roadmap §5.1](doc/CROSS_PLATFORM_ROADMAP.md)) — the Apache-2.0
   NOTICE in `globe.gl.min.js` and the NASA credit in §2 are the two that must
   appear there.
