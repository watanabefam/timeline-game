// narration-worker.js — Kokoro-82M TTS module worker (added 2026-09).
// Loaded as a classic *module* document and spawned as a module worker by
// narration.js. First-party counterpart to narration.js; imports the vendored
// Kokoro web build. Protocol (main <-> worker):
//   -> { type:"generate", id, text, voice, quality, priority }   priority "now"|"prefetch"
//   <- { type:"status", phase, ... }                             lifecycle / model download progress
//   <- { type:"audio", id, pcm, sampleRate }                     pcm: Float32Array (transferable)
//   <- { type:"error", id, message }
// Quality maps to a bundled/remote ONNX dtype: standard=q8 (bundled offline),
// high=fp16 (remote, one-time), best=fp32 (remote, one-time).

"use strict";

import { KokoroTTS, env } from "./assets/vendor/kokoro/kokoro.web.js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const REMOTE_BASE = `https://huggingface.co/${MODEL}/resolve/main/`;
const LOCAL_MODEL = new URL(
  `./assets/vendor/kokoro/model/${MODEL}/`,
  import.meta.url
).href;

const QUALITY_DTYPE = Object.freeze({
  standard: "q8",
  high: "fp16",
  best: "fp32",
});

// Bundled q8 model files — pre-seeded into CacheStorage keyed by the remote
// URL the library looks them up under, so standard quality works fully offline.
const MODEL_FILES = Object.freeze([
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
]);

const VOICE_IDS = Object.freeze([
  "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore",
  "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael",
  "am_onyx", "am_puck", "am_santa",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
]);

const MAX_CHUNK = 110;
const MIN_CHUNK = 40;

// Point ONNX Runtime at the staged .mjs/.wasm (string = base directory).
env.wasmPaths = new URL(
  "./assets/vendor/kokoro/",
  import.meta.url
).href;

// --- Lifecycle --------------------------------------------------------------

let tts = null;          // KokoroTTS singleton
let ttsQuality = null;   // quality string currently loaded
let seeding = null;      // in-flight cache pre-seed promise
let queue = [];          // { id, text, voice, quality, priority }
let dropping = null;     // id of the prefetch being abandoned
let jobSerial = 0;

function post(msg) {
  postMessage(msg);
}

function postStatus(phase, extra) {
  post(Object.assign({ type: "status", phase }, extra || {}));
}

// --- Cache pre-seed (offline q8) ---------------------------------------------

// Fetch the bundled bytes and put them under the exact remote URL the library
// resolves to (CacheStorage key = k, the remote file URL). Idempotent.
async function seedCache(name, url, localUrl) {
  const cache = await caches.open(name);
  const hit = await cache.match(url);
  if (hit) return;
  const resp = await fetch(localUrl);
  if (!resp.ok) throw new Error(`seed ${localUrl} -> ${resp.status}`);
  await cache.put(url, new Response(await resp.arrayBuffer(), {
    headers: { "Content-Type": resp.headers.get("Content-Type") || "application/octet-stream" },
  }));
}

async function seedModel() {
  if (!seeding) {
    seeding = (async () => {
      postStatus("seed-start");
      const count = MODEL_FILES.length + VOICE_IDS.length;
      let done = 0;
      const bump = () => postStatus("seed-progress", { done: ++done, total: count });
      for (const f of MODEL_FILES) {
        await seedCache("transformers-cache", REMOTE_BASE + f, LOCAL_MODEL + f);
        bump();
      }
      for (const v of VOICE_IDS) {
        const f = `voices/${v}.bin`;
        await seedCache("kokoro-voices", REMOTE_BASE + f, LOCAL_MODEL + f);
        bump();
      }
      postStatus("seed-done", { total: count });
    })().catch((err) => {
      // Pre-seed is best-effort; remote fetch remains as fallback.
      postStatus("seed-failed", { message: String(err && err.message || err) });
    });
  }
  return seeding;
}

// --- Model loading ------------------------------------------------------------

function getDtype(quality) {
  return QUALITY_DTYPE[quality] || "q8";
}

async function getTTS(quality) {
  if (tts && ttsQuality === quality) return tts;
  const dtype = getDtype(quality);
  if (dtype === "q8") await seedModel(); // bundled offline path
  postStatus("model-start", { quality, dtype });
  tts = await KokoroTTS.from_pretrained(MODEL, {
    dtype: dtype === "q8" ? "q8" : dtype,
    device: "wasm",
    progress_callback: (p) => {
      if (p && p.status === "progress") {
        postStatus("model-progress", {
          file: p.file || "",
          loaded: p.loaded || 0,
          total: p.total || 0,
        });
      }
    },
  });
  ttsQuality = quality;
  postStatus("model-ready", { quality, dtype });
  return tts;
}

// --- Text chunking (40-110 chars, sentence-aware) -----------------------------

function splitWords(text) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0);
}

function chunkText(text) {
  const words = splitWords(text);
  if (words.length === 0) return [];
  const chunks = [];
  let current = "";
  let sentenceEnd = false;
  for (const w of words) {
    const would = current ? current + " " + w : w;
    if (current.length >= MIN_CHUNK && would.length > MAX_CHUNK && sentenceEnd) {
      chunks.push(current);
      current = w;
      sentenceEnd = /[.!?…]$/.test(w);
    } else if (would.length > MAX_CHUNK && current) {
      chunks.push(current);
      current = w;
      sentenceEnd = /[.!?…]$/.test(w);
    } else if (would.length > MAX_CHUNK) {
      current = would.slice(0, MAX_CHUNK);
      chunks.push(current);
      current = w.slice(MAX_CHUNK);
      sentenceEnd = false;
    } else {
      current = would;
      sentenceEnd = /[.!?…]$/.test(w);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// --- Silence trimming ----------------------------------------------------------
// Kokoro pads each generated chunk with leading/trailing silence. Concatenating
// chunks raw stacks that padding into audible pauses (and a long tail). Trim
// each chunk to its speech envelope, keeping a small natural gap (~90ms) so
// adjacent chunks don't sound clipped together.

const TRIM_THRESHOLD = 0.003;   // ~ -50 dBFS
const KEEP_MS = 90;             // natural inter-chunk gap to preserve
const SAMPLE_RATE = 24000;

function trimSilence(audio, keepSamples) {
  const n = audio.length;
  if (n === 0) return audio;
  let start = 0;
  while (start < n && Math.abs(audio[start]) < TRIM_THRESHOLD) start++;
  let end = n - 1;
  while (end > start && Math.abs(audio[end]) < TRIM_THRESHOLD) end--;
  if (end <= start) return audio; // all-silent chunk: leave as-is
  // Keep a little padding on both sides so speech never sounds clipped.
  start = Math.max(0, start - keepSamples);
  end = Math.min(n - 1, end + keepSamples);
  return audio.subarray(start, end + 1);
}

// --- Synthesis loop -----------------------------------------------------------

// Serial queue: only one job phonemizes+synthesizes at a time. A "now" job
// abandons queued prefetch jobs (and the currently-running one if it is a
// prefetch — the loop checks between chunks, keeping preemption cheap).
async function handleJob(job) {
  try {
    if (job.drop) {
      post({ type: "dropped", id: job.id });
      return;
    }
    const model = await getTTS(job.quality);
    if (job.drop || (job.priority !== "now" && dropping)) {
      post({ type: "dropped", id: job.id });
      return;
    }
    const chunks = chunkText(job.text);
    const out = [];
    let total = 0;
    for (const chunk of chunks) {
      if (job.drop || (job.priority !== "now" && dropping)) {
        post({ type: "dropped", id: job.id });
        return;
      }
      const piece = await model.generate(chunk, { voice: job.voice });
      const trimmed = trimSilence(piece.audio, Math.round((KEEP_MS / 1000) * SAMPLE_RATE));
      out.push(trimmed);
      total += trimmed.length;
    }
    if (job.drop || (job.priority !== "now" && dropping)) {
      post({ type: "dropped", id: job.id });
      return;
    }
    const pcm = new Float32Array(total);
    let off = 0;
    for (const a of out) {
      pcm.set(a, off);
      off += a.length;
    }
    // Trim the concatenated tail so the clip ends on speech, not 400ms+ of
    // accumulated model padding.
    const tail = trimSilence(pcm, Math.round((KEEP_MS / 1000) * SAMPLE_RATE));
    post({ type: "audio", id: job.id, pcm: tail, sampleRate: SAMPLE_RATE }, [tail.buffer]);
  } catch (err) {
    post({ type: "error", id: job.id, message: String(err && err.message || err) });
  }
}

let pumpRunning = false;
let runningJob = null; // job currently being handled (for prefetch->now promotion)
let queuedTexts = new Set(); // texts with a job queued or running (dedupe)
function pump() {
  if (pumpRunning) return;
  pumpRunning = true;
  (async () => {
    try {
      while (queue.length > 0) {
        const job = queue.shift();
        runningJob = job;
        try {
          await handleJob(job);
        } finally {
          if (runningJob === job) runningJob = null;
          queuedTexts.delete(job.text);
          if (job.priority === "now") dropping = null; // supersession over
        }
      }
    } finally {
      pumpRunning = false;
    }
  })();
}

self.addEventListener("message", (ev) => {
  const m = ev.data;
  if (!m || m.type !== "generate") return;
  // "now" = screen-aligned speech (preempts prefetch); "test" = deliberate
  // sample (jumps the queue but doesn't kill the running prefetch);
  // anything else = prefetch (cache warming).
  const priority = m.priority === "now" ? "now" : m.priority === "test" ? "test" : "prefetch";
  const text = String(m.text || "");
  if (priority === "now") {
    // Abandon the currently-running prefetch at its next chunk check, but do
    // NOT drop queued prefetches — they keep the cache warm so the next card
    // load plays instantly from IndexedDB instead of synthesizing fresh.
    dropping = m.id;
    // If a prefetch for this exact text is already running, promote it to
    // "now" (keeping its original job id — the main thread's inFlight promise
    // is keyed to that id) so its audio is delivered to the waiting
    // speakEvent instead of being dropped and re-synthesized from scratch.
    if (runningJob && runningJob.text === text && runningJob.priority === "prefetch") {
      runningJob.priority = "now";
      dropping = null; // it IS the now job now
    }
  } else if (priority === "prefetch" && queuedTexts.has(text)) {
    // Duplicate prefetch (re-prefetch after each placement) — skip it so the
    // worker never synthesizes the same card twice.
    post({ type: "dropped", id: m.id || `job${++jobSerial}` });
    return;
  }
  queuedTexts.add(text);
  queue.push({
    id: m.id || `job${++jobSerial}`,
    text,
    voice: m.voice || "af_heart",
    quality: m.quality || "standard",
    priority,
    drop: false,
  });
  // now-jobs run first; among equals, FIFO. test-jobs jump ahead of prefetch.
  queue.sort((a, b) => {
    const rank = (p) => (p === "now" ? 0 : p === "test" ? 1 : 2);
    return rank(a.priority) - rank(b.priority);
  });
  pump();
});