/*
 * tools/narration/synth.mjs
 * ------------------------------------------------------------------
 * Author-time speech synthesis (Kokoro-82M, offline, CPU).
 *
 * AUTHOR-TIME ONLY. Nothing in tools/ is ever loaded by the game: the
 * player only ever *plays* the MP3s this produces (AGENTS.md rule 6).
 *
 * `kokoro-js` is imported lazily so every other mode of the tooling —
 * --dry-run, --repair, --listen, --check, the tests, and the content
 * gate — works with no npm install at all.
 *
 * The model files are the ones already on disk under
 * tools/kokoro-authoring/ (see that directory's README for provenance);
 * remote model downloads are disabled so a missing file fails loudly
 * instead of silently pulling ~326 MB.
 *
 * MODEL TIER. The generator renders in fp32 (the card's own default and
 * what kokoro-js uses when told nothing) because the tier is a fidelity
 * knob, not a size knob we need to win: q8 cost us nothing in bytes here
 * (the MP3 encode dominates), and quantization is documented as harmless
 * for this model, so there was no reason to accept its risk. q8 and fp16
 * stay selectable with `--dtype` for anyone reproducing older output.
 *
 * What a tier does NOT do is change a pronunciation: text → phoneme
 * happens in the phonemizer, upstream of the weights. A wrong vowel stays
 * wrong in every tier — that is what the LEXICON and the audit are for
 * (see text.mjs and pronounce.mjs).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "..", "..");

/**
 * The engine/voice/format identity, minus the tier and the voice: everything
 * that does not depend on which weights or timbre are loaded.
 */
export const IDENTITY = Object.freeze({
  engine: "kokoro",
  engineVersion: "1.2.1",
  model: "onnx-community/Kokoro-82M-v1.0-ONNX",
  sampleRate: 24000,
});

/** The voice the shipped decks record. Changing it re-renders everything. */
export const DEFAULT_VOICE = "af_heart";

let voice = DEFAULT_VOICE;

/** The voice in force for this process. */
export function currentVoice() {
  return voice;
}

/**
 * Choose the voice (`--voice`). The list is the one the model card publishes;
 * kokoro-js validates it too and prints its own table, so this only needs to
 * catch an obviously malformed id early.
 */
export function setVoice(next) {
  const wanted = String(next ?? "").trim();
  if (!wanted) return voice;
  if (!/^(?:af|am|bf|bm)_[a-z]+$/.test(wanted)) {
    throw new Error(
      `narration: "${wanted}" is not a Kokoro voice id — expected af_/am_/bf_/bm_ followed by a name, e.g. af_bella`
    );
  }
  voice = wanted;
  return voice;
}

/**
 * Model tiers, by the file name the model card publishes for each. Only
 * the three worth having: the default, the half-size near-equivalent,
 * and the one this repo shipped before fp32 became the default.
 */
export const DTYPES = Object.freeze({
  fp32: { file: "model.onnx", about: "float32 — the default" },
  fp16: { file: "model_fp16.onnx", about: "half precision, ~163 MB" },
  q8: { file: "model_quantized.onnx", about: "8-bit quantised, ~92 MB (pre-fp32 output)" },
});

export const DEFAULT_DTYPE = "fp32";

let dtype = DEFAULT_DTYPE;

/** The tier in force for this process. */
export function currentDtype() {
  return dtype;
}

/**
 * Choose the model tier (`--dtype`). Returns the tier now in force, so a
 * CLI can report it. Must run before the engine is loaded; changing the
 * tier afterwards drops the loaded engine so the next render re-loads.
 *
 * @param {string|null|undefined} wanted
 * @returns {string} the tier in force
 */
export function setDtype(wanted) {
  const next = String(wanted ?? "").trim();
  if (!next) return dtype;
  if (!Object.hasOwn(DTYPES, next)) {
    throw new Error(
      `narration: unknown dtype "${next}" — choose one of ${Object.keys(DTYPES).join(", ")}`
    );
  }
  if (next !== dtype) {
    dtype = next;
    enginePromise = null; // the loaded weights are the wrong ones now
  }
  return dtype;
}

/** The exact engine/voice/format identity recorded in `deck.narration`. */
export function engineIdentity() {
  return { ...IDENTITY, dtype, voice };
}

/** Absolute path of the weights file for a tier. */
export function weightsPath(tier = dtype) {
  return join(modelDir(), "onnx", DTYPES[tier].file);
}

/** Where the authoring model bundle lives (gitignored, outside assets/). */
export const MODEL_ROOT = join(REPO_ROOT, "tools", "kokoro-authoring", "kokoro", "model");
const CACHE_DIR = join(REPO_ROOT, "tools", "kokoro-authoring", "cache");

let enginePromise = null;

function modelDir() {
  return join(MODEL_ROOT, ...IDENTITY.model.split("/"));
}

/**
 * Load (once) and return the synthesis engine.
 * @param {{ device?: string, quiet?: boolean }} [opts]
 */
export function loadEngine(opts = {}) {
  if (!enginePromise) enginePromise = createEngine(opts).catch((err) => {
    enginePromise = null; // let a later call retry with a clear error
    throw err;
  });
  return enginePromise;
}

async function createEngine({ device = "cpu" } = {}) {
  const weights = weightsPath();
  if (!existsSync(weights)) {
    throw new Error(
      `narration: the ${dtype} weights are missing.\n` +
        `  expected: ${weights}\n` +
        `  Fetch it as described in tools/kokoro-authoring/README.md — the generator\n` +
        `  never downloads model files at run time.\n` +
        `  (Other tiers: ${Object.keys(DTYPES).join(", ")} — pick one with --dtype.)`
    );
  }
  const { KokoroTTS, env } = await import("kokoro-js").catch((err) => {
    throw new Error(
      `narration: the authoring dependency is not installed.\n` +
        `  Run: npm --prefix tools/narration install\n` +
        `  (${err.message})`
    );
  });

  // Local-only: never reach the network for weights. The layout under
  // MODEL_ROOT is already <org>/<repo>, which is what localModelPath wants.
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = MODEL_ROOT;
  env.useFSCache = true;
  env.cacheDir = CACHE_DIR;

  const tts = await KokoroTTS.from_pretrained(IDENTITY.model, {
    dtype,
    device,
  });
  return tts;
}

/**
 * Synthesise one spoken line.
 * @param {string} text
 * @param {{ device?: string, speed?: number }} [opts]
 * @returns {Promise<{ audio: Float32Array, samplingRate: number }>}
 */
export async function synthesize(text, opts = {}) {
  if (!text || !text.trim()) throw new Error("narration: refusing to synthesise empty text");
  const tts = await loadEngine(opts);
  const out = await tts.generate(text, { voice, speed: opts.speed ?? 1 });
  const audio = out.audio instanceof Float32Array ? out.audio : Float32Array.from(out.audio);
  return { audio, samplingRate: out.sampling_rate || IDENTITY.sampleRate };
}
