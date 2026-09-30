# tools/kokoro-authoring — author-time narration only

**This directory is author-time tooling. Nothing in it ships, and the large
parts of it are gitignored on purpose. No file here may ever be loaded by the
game at runtime.**

`kokoro/` (gitignored, ~450 MB with the fp32 weights) holds the engine used to
**generate** the pre-rendered narration MP3s that ship with the decks:

```
decks/<deck-id>/narration/<event-id>.mp3
```

The player never synthesizes speech. `narration.js` only *plays* those files
(with `speechSynthesis` as a last-resort fallback); what the fallback says is
governed by the shared recipe mirror `narration-recipe.js`, generated from
`tools/narration/text.mjs`. See
`doc/CROSS_PLATFORM_ROADMAP.md` §19.12.

## Why it is not under `assets/`

`kokoro.web.js` (**kokoro-js 1.2.1**) is Apache-2.0 and the **Kokoro-82M** model
it loads is Apache-2.0, but the bundle statically imports `phonemizer`, which
embeds an Emscripten-compiled **eSpeak-NG** build and data.
**eSpeak-NG is GPL-3.0-or-later** — a package's declared license does not
relicense a copyleft component it bundles.

Keeping it out of `assets/` keeps AGENTS.md hard rule 2 absolute (nothing under
`assets/` is ever edited or removed by us) and keeps the copyleft bundle out of
every shipping path. `npm run validate:vendor` fails if it — or any other
copyleft/non-commercial marker — reappears under `assets/`.

## Provenance (pin these exactly when regenerating)

| Item | Value |
|---|---|
| Runtime | **kokoro-js 1.2.1** — this browser bundle produced the original 10 clips; the generator now uses the **npm `kokoro-js` 1.2.1 package in Node** (`tools/narration/package.json`), because the bundle cannot run outside a browser |
| Model | `onnx-community/Kokoro-82M-v1.0-ONNX` |
| Dtype | **fp32** (`onnx/model.onnx`, 326 MB) — the value recorded in the shipped decks' `narration` blocks, matching what the generator renders. `--dtype fp16\|q8` selects `model_fp16.onnx` / `model_quantized.onnx` instead; fp32 became the default on 2026-09-30, and the whole deck was re-rendered |
| Voices | `af_heart` (the voice recorded in the shipped decks' `narration` block) |
| ONNX runtime | `ort-wasm-simd-threaded.jsep` (WASM, ships with the bundle) |
| Bundled with | an eSpeak-NG G2P build (**GPL-3.0-or-later — author-time only**) |

To restore the bundle on a fresh machine, re-download kokoro-js 1.2.1 and the
`onnx-community/Kokoro-82M-v1.0-ONNX` files into `kokoro/` at the paths
`kokoro.web.js` expects. Do **not** copy it back under `assets/`.

The generator does **not** fetch weights at run time (`allowRemoteModels` is
off), so the tiers you want must already be on disk:

```bash
cd tools/kokoro-authoring/kokoro/model/onnx-community/Kokoro-82M-v1.0-ONNX
curl -L -o onnx/model.onnx \
  https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx   # 326 MB, fp32 (default)
# optional: onnx/model_fp16.onnx (163 MB) and onnx/model_quantized.onnx (92 MB)
```

All three are Apache-2.0 and gitignored here; a missing one fails loudly with
the exact path it wanted.

## Regenerating narration

The generator is **`tools/narration/`** — it is written and in use. From the
repo root:

```bash
npm run narration -- --deck world-history-first-timeline --dry-run  # print the words each card will speak
npm run narration -- --deck world-history-first-timeline            # render missing/changed clips
npm run narration -- --deck world-history-first-timeline --repair   # rebuild records from files on disk
npm run validate:narration                                          # verify every shipped clip
```

Other flags: `--all`, `--only <event-id>`, `--force` (re-render regardless of
the content key), `--dtype fp32|fp16|q8` (model tier), `--listen` (write an
HTML review sheet), `--check` (non-writing verification). It loads the same
`onnx-community/Kokoro-82M-v1.0-ONNX` model but through the npm package in
Node — this directory's browser bundle stays here as provenance for the
original 10 clips only. Spoken text comes from the shared `strip-years-v2`
recipe in `tools/narration/text.mjs`. Pronunciation QA is a separate command:
`npm run narration:audit` (what to hear) and `npm run narration:audit --
--strips` (hear it). Full instructions: `tools/narration/README.md`.

Vendored/third-party inventory and attribution: `THIRD_PARTY_LICENSES.md`.
