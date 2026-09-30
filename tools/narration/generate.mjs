#!/usr/bin/env node
/*
 * tools/narration/generate.mjs
 * ------------------------------------------------------------------
 * The narration generator: card text → the MP3 that ships in the deck.
 *
 *   decks/<deck-id>/narration/<event-id>.mp3
 *
 * AUTHOR-TIME ONLY. The player never synthesises speech (AGENTS.md rule
 * 6): it only plays these files. Nothing here is loaded by the game, and
 * only text/audio/crypto are imported at module scope, so every mode
 * except rendering runs with no npm install and no model on disk.
 *
 * Modes
 *   --dry-run   print the exact words each card would speak, with the
 *               content key and a leak check. No engine, no audio.
 *   (default)   render every card whose words or settings changed, write
 *               the MP3, refresh deck.json + manifest.json.
 *   --repair    rebuild the recorded bytes/sha256/durationMs/textHash
 *               from the files on disk. No engine.
 *   --listen    write an HTML contact sheet for the listening pass.
 *   --check     run the content gate (scripts/validate-narration.mjs).
 *
 * Scope selectors: --deck <id|dir>, --all, --only <id,id>, --limit <n>,
 *                  --force, --dtype <fp32|fp16|q8>, --voice <af_heart|…>.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  IDENTITY,
  REPO_ROOT,
  currentDtype,
  currentVoice,
  engineIdentity,
  setDtype,
  setVoice,
  synthesize,
} from "./synth.mjs";
import { RECIPE, contentKey, spokenText, textHash, yearLeaks } from "./text.mjs";
import { haveFfmpeg, mp3DurationMs, renderClip } from "./audio.mjs";
import { checkNarration } from "../../scripts/validate-narration.mjs";

const DECKS_DIR = join(REPO_ROOT, "decks");
const CACHE_DIR = join(REPO_ROOT, "tools", "narration", ".cache");
const STATE_PATH = join(CACHE_DIR, "state.json");

/** Format settings. Must match what the shipped clips already use. */
const FORMAT = Object.freeze({
  format: "mp3",
  bitrateKbps: 64,
  sampleRate: IDENTITY.sampleRate,
  loudnessLufs: -16,
  truePeakDb: -1.5,
});

/** The order `deck.narration` keys are written in (schema order). */
const NARRATION_KEYS = [
  "engine",
  "model",
  "dtype",
  "voice",
  "sampleRate",
  "format",
  "bitrateKbps",
  "textRule",
  "loudnessLufs",
  "generated",
  "files",
];

const posix = (p) => String(p).split(sep).join("/");
const rel = (from, to) => posix(relative(from, to));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ args */

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};

if (has("help")) {
  console.log(
    [
      "narration generator",
      "",
      "  node generate.mjs --deck <id> [--only a,b] [--limit n] [--force]",
      "  node generate.mjs --all [--limit n] [--dtype fp32|fp16|q8] [--voice af_heart]",
      "  node generate.mjs --deck <id> --dry-run     # words, keys, leak check",
      "  node generate.mjs --deck <id> --repair      # records from files on disk",
      "  node generate.mjs --deck <id> --listen      # HTML listening sheet",
      "  node generate.mjs --check                   # content gate",
    ].join("\n")
  );
  process.exit(0);
}

if (has("check")) {
  const { errors } = checkNarration();
  process.exit(errors ? 1 : 0);
}

// Pick the model tier and voice before anything plans a card: both are part
// of the content key, so an unrecognised value must fail before any work.
try {
  if (opt("dtype")) setDtype(opt("dtype"));
  if (opt("voice")) setVoice(opt("voice"));
} catch (err) {
  fail(err.message);
}
const ENGINE = engineIdentity();

/* ------------------------------------------------------------------ decks */

function listDeckDirs() {
  return readdirSync(DECKS_DIR)
    .filter((name) => existsSync(join(DECKS_DIR, name, "deck.json")))
    .sort()
    .map((name) => join(DECKS_DIR, name));
}

function resolveTargets() {
  const deck = opt("deck");
  const only = opt("only")
    ? new Set(
        opt("only")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;
  if (deck) {
    const byId = join(DECKS_DIR, deck);
    const dir = existsSync(join(byId, "deck.json")) ? byId : resolve(deck);
    if (!existsSync(join(dir, "deck.json"))) fail(`no deck.json found for --deck ${deck}`);
    return { dirs: [dir], only };
  }
  if (has("all")) return { dirs: listDeckDirs(), only };
  fail("choose a deck: --deck <id> or --all (see --help)");
  return null;
}

function loadDeck(dir) {
  const entry = join(dir, "deck.json");
  const manifestPath = join(dir, "manifest.json");
  const deck = JSON.parse(readFileSync(entry, "utf8"));
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : null;
  // The render cache is keyed by PATH, not by name: two checkouts (or a
  // scratch copy beside the real deck) share a basename but not content,
  // and a name-keyed cache would silently skip the wrong deck's cards.
  const repoRel = rel(REPO_ROOT, dir);
  return {
    dir,
    id: basename(dir),
    stateId: repoRel.startsWith("..") ? posix(dir) : repoRel,
    entry,
    manifestPath,
    manifest,
    deck,
  };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/* ------------------------------------------------------------------ state */

function readState() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeJson(STATE_PATH, state);
}

/* ------------------------------------------------------------------ plan */

/** Everything the renderer needs to know about one card. */
function planCard(target, event) {
  const spoken = spokenText(event);
  const leaks = yearLeaks(spoken);
  return {
    event,
    spoken,
    leaks,
    key: contentKey({ ...ENGINE, ...FORMAT, text: spoken }),
    hash: textHash(spoken),
    file: join(target.dir, "narration", `${event.id}.mp3`),
    titleDropped: !spoken.startsWith(String(event.title || "").trim()),
  };
}

/** A deck's narration file path as the deck records it (repo-relative). */
function recordPath(file) {
  const repoRel = rel(REPO_ROOT, file);
  return repoRel.startsWith("..") ? posix(file) : repoRel;
}

/* ------------------------------------------------------------------ modes */

function dryRun(target, cards) {
  console.log(`\n${target.id}: ${cards.length} card(s)`);
  let leaked = 0;
  for (const card of cards) {
    if (card.leaks.length) leaked += 1;
    console.log(`  ${card.event.id.padEnd(26)} ${card.key.slice(0, 12)}  ${card.spoken || "«NOTHING — would speak silence»"}`);
    if (card.leaks.length) {
      console.log(`  ${" ".repeat(26)} ⚠ LEAK: ${card.leaks.map((l) => l.match).join(", ")}`);
    }
    if (card.titleDropped && card.spoken) {
      console.log(`  ${" ".repeat(26)} · title dropped (it carried a year), fact spoken alone`);
    }
  }
  const empty = cards.filter((c) => !c.spoken).length;
  console.log(`  → ${cards.length - leaked - empty} clean, ${leaked} leaking, ${empty} silent`);
  return { leaked, empty };
}

async function render(target, cards, state, { force }) {
  const deckState = state[target.stateId] || (state[target.stateId] = {});
  let rendered = 0;
  let skipped = 0;
  const failures = [];

  for (const card of cards) {
    if (!card.spoken) {
      failures.push(`${card.event.id}: the recipe left nothing to speak`);
      continue;
    }
    const known = deckState[card.event.id];
    if (!force && known && known.key === card.key && existsSync(card.file)) {
      skipped += 1;
      continue;
    }
    try {
      const { audio, samplingRate } = await synthesize(card.spoken);
      const clip = await renderClip({
        audio,
        samplingRate,
        loudnessLufs: FORMAT.loudnessLufs,
        bitrateKbps: FORMAT.bitrateKbps,
        truePeakDb: FORMAT.truePeakDb,
      });
      mkdirSync(dirname(card.file), { recursive: true });
      writeFileSync(card.file, clip.mp3);
      deckState[card.event.id] = {
        key: card.key,
        sha256: sha256(clip.mp3),
        bytes: clip.bytes,
        durationMs: clip.durationMs,
        textHash: card.hash,
        loudness: clip.loudness,
        renderedAt: new Date().toISOString().slice(0, 10),
      };
      rendered += 1;
      console.log(
        `  ✓ ${card.event.id.padEnd(26)} ${(clip.durationMs / 1000).toFixed(1)}s  ` +
          `${(clip.bytes / 1024).toFixed(0)} KB  ${clip.loudness} LUFS  ${clip.truePeak} dBTP` +
          (clip.peakLimited ? "  (peak-limited)" : "")
      );
      writeState(state);
    } catch (err) {
      failures.push(`${card.event.id}: ${err.message}`);
      console.error(`  ✗ ${card.event.id}: ${err.message}`);
    }
  }
  return { rendered, skipped, failures };
}

/** Refresh deck.json's narration block + manifest.json's asset list. */
function applyRecords(target, state) {
  const deckState = state[target.stateId] || {};
  const files = target.deck.narration && target.deck.narration.files ? target.deck.narration.files : {};
  const events = target.deck.events;

  for (const event of events) {
    const known = deckState[event.id];
    if (!known) continue;
    const file = join(target.dir, "narration", `${event.id}.mp3`);
    files[event.id] = {
      path: recordPath(file),
      bytes: known.bytes,
      sha256: known.sha256,
      textHash: known.textHash,
      durationMs: known.durationMs,
    };
  }
  // Key order matches the schema's documented order and the shipped decks.
  const values = {
    engine: ENGINE.engine,
    model: ENGINE.model,
    dtype: ENGINE.dtype,
    voice: ENGINE.voice,
    sampleRate: FORMAT.sampleRate,
    format: FORMAT.format,
    bitrateKbps: FORMAT.bitrateKbps,
    textRule: RECIPE,
    loudnessLufs: FORMAT.loudnessLufs,
    generated: new Date().toISOString().slice(0, 10),
    // `files` keeps the order the deck already recorded (assignment to an
    // existing key does not move it) and appends new cards at the end —
    // reordering by event order would rewrite all ten shipped records for
    // no reason.
    files,
  };
  const wanted = new Set(NARRATION_KEYS);
  const rebuilt = {};
  for (const key of NARRATION_KEYS) rebuilt[key] = values[key];
  const existing = target.deck.narration || {};
  for (const key of Object.keys(existing)) if (!wanted.has(key)) rebuilt[key] = existing[key];
  target.deck.narration = rebuilt;
  writeJson(target.entry, target.deck);

  if (target.manifest) {
    const keep = (target.manifest.assets || []).filter((a) => !String(a).startsWith("narration/"));
    const narration = Object.values(rebuilt.files)
      .map((r) => rel(target.dir, r.path))
      .sort();
    target.manifest.assets = [...keep, ...narration];
    writeJson(target.manifestPath, target.manifest);
  }
}

function repair(target, cards) {
  const { deck, dir } = target;
  const existing = (deck.narration && deck.narration.files) || {};
  const narrationDir = join(dir, "narration");
  let fixed = 0;
  let changed = 0;

  const onDisk = existsSync(narrationDir)
    ? readdirSync(narrationDir).filter((f) => f.endsWith(".mp3"))
    : [];
  const covered = new Set();

  for (const card of cards) {
    const rec = existing[card.event.id];
    const { file, hash } = card;
    if (!rec && !existsSync(file)) continue;
    if (!existsSync(file)) {
      console.error(`  ✗ ${card.event.id}: deck records a clip that is not on disk (${recordPath(file)})`);
      continue;
    }
    covered.add(basename(file));
    const buf = readFileSync(file);
    const bytes = buf.length;
    const digest = sha256(buf);
    const durationMs = mp3DurationMs(buf);
    if (
      !rec ||
      rec.bytes !== bytes ||
      rec.sha256 !== digest ||
      rec.textHash !== hash ||
      rec.path !== recordPath(file) ||
      rec.durationMs == null
    ) {
      existing[card.event.id] = {
        path: recordPath(file),
        bytes,
        sha256: digest,
        textHash: hash,
        durationMs: durationMs ?? rec?.durationMs ?? 0,
      };
      changed += 1;
      console.log(`  · ${card.event.id.padEnd(26)} record refreshed (${(bytes / 1024).toFixed(0)} KB)`);
    }
    fixed += 1;
  }

  for (const orphan of onDisk.filter((f) => !covered.has(f))) {
    console.warn(`  ⚠ ${orphan}: on disk but not referenced by deck.json — delete it or re-render`);
  }

  // Identity fields, incl. dtype: the tier the shipped clips were made with.
  if (!deck.narration) deck.narration = {};
  deck.narration.files = existing;
  deck.narration.engine = ENGINE.engine;
  deck.narration.model = ENGINE.model;
  deck.narration.dtype = ENGINE.dtype;
  deck.narration.voice = ENGINE.voice;
  deck.narration.sampleRate = FORMAT.sampleRate;
  deck.narration.format = FORMAT.format;
  deck.narration.bitrateKbps = FORMAT.bitrateKbps;
  deck.narration.textRule = RECIPE;
  deck.narration.loudnessLufs = FORMAT.loudnessLufs;
  deck.narration.generated = deck.narration.generated || new Date().toISOString().slice(0, 10);

  const state = readState();
  const deckState = state[target.stateId] || (state[target.stateId] = {});
  for (const [id, rec] of Object.entries(deck.narration.files)) {
    deckState[id] = { ...(deckState[id] || {}), sha256: rec.sha256, bytes: rec.bytes, durationMs: rec.durationMs, textHash: rec.textHash };
  }
  writeState(state);

  if (changed) {
    const ordered = {};
    for (const key of NARRATION_KEYS) ordered[key] = deck.narration[key];
    deck.narration = ordered;
    writeJson(target.entry, deck);
  }
  console.log(`  → ${fixed} clip(s) on disk, ${changed} record(s) refreshed`);
  return { fixed, changed };
}

function listenSheet(target, cards) {
  const { deck } = target;
  const rows = cards
    .map((card) => {
      const event = card.event;
      const url = rel(join(CACHE_DIR), card.file);
      return `<tr>
  <td><input type="checkbox" data-id="${event.id}"></td>
  <td class="id">${event.id}</td>
  <td class="yr">${event.year ?? ""}</td>
  <td class="spoken">${escapeHtml(card.spoken)}</td>
  <td class="was">${escapeHtml(String(event.fact || ""))}</td>
  <td><audio controls preload="none" src="${url}"></audio></td>
</tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en"><meta charset="utf-8">
<title>Narration listening pass — ${escapeHtml(target.id)}</title>
<style>
 body { font: 14px/1.5 system-ui, sans-serif; margin: 24px; }
 table { border-collapse: collapse; width: 100%; }
 th, td { text-align: left; vertical-align: top; padding: 6px 10px; border-bottom: 1px solid #ddd; }
 .id { font-family: ui-monospace, monospace; font-size: 12px; }
 .yr { color: #666; }
 .was { color: #777; font-style: italic; }
 audio { height: 32px; }
 #out { width: 100%; height: 60px; margin-top: 16px; }
 .bar { position: sticky; top: 0; background: #fff; padding: 8px 0; }
</style>
<div class="bar">
  <strong>${escapeHtml(deck.name || target.id)}</strong> — tick anything that sounds wrong, then copy the list.
  <button onclick="document.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=false)">clear</button>
</div>
<table>
<tr><th></th><th>id</th><th>year</th><th>spoken (what the clip says)</th><th>card fact</th><th>clip</th></tr>
${rows}
</table>
<textarea id="out" placeholder="flagged ids appear here"></textarea>
<script>
  var out = document.getElementById("out");
  document.addEventListener("change", function () {
    out.value = [].slice.call(document.querySelectorAll("input:checked")).map(function (c) { return c.dataset.id; }).join(", ");
  });
</script>
</html>
`;
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, `listen-${target.id}.html`);
  writeFileSync(path, html);
  console.log(`  → ${rel(REPO_ROOT, path)} (${cards.length} clip(s))`);
  return path;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ------------------------------------------------------------------ main */

const mode = has("repair") ? "repair" : has("listen") ? "listen" : has("dry-run") ? "dry-run" : "render";
const { dirs, only } = resolveTargets();

if (mode === "render" && !(await haveFfmpeg())) {
  fail("ffmpeg is not on PATH — install it (brew install ffmpeg) before rendering");
}

const state = readState();
let totals = { rendered: 0, skipped: 0, failed: 0, changed: 0 };

if (mode === "render") {
  console.log(
    `narration engine: ${ENGINE.engine} ${ENGINE.engineVersion} · ${currentDtype()} · ` +
      `${currentVoice()} · ${FORMAT.bitrateKbps} kbps mono @ ${FORMAT.sampleRate} Hz`
  );
}

for (const dir of dirs) {
  const target = loadDeck(dir);
  const cards = target.deck.events
    .filter((e) => !only || only.has(e.id))
    .slice(0, Number(opt("limit") || target.deck.events.length))
    .map((event) => planCard(target, event));
  if (!cards.length) continue;

  if (mode === "dry-run") {
    const { leaked, empty } = dryRun(target, cards);
    if (leaked || empty) totals.failed += leaked + empty;
  } else if (mode === "listen") {
    listenSheet(target, cards);
  } else if (mode === "repair") {
    console.log(`\n${target.id}: repairing records`);
    const { fixed, changed } = repair(target, cards);
    totals.changed += changed;
    totals.rendered += fixed;
  } else {
    console.log(`\n${target.id}: rendering ${cards.length} card(s)`);
    const { rendered, skipped, failures } = await render(target, cards, state, { force: has("force") });
    if (rendered) applyRecords(target, state);
    totals.rendered += rendered;
    totals.skipped += skipped;
    totals.failed += failures.length;
  }
}

if (mode === "render") {
  console.log(
    `\n${totals.failed ? "✗" : "✓"} rendered ${totals.rendered}, skipped ${totals.skipped} (unchanged), failed ${totals.failed}`
  );
} else if (mode === "repair") {
  console.log(`\n✓ ${totals.rendered} clip(s) verified on disk, ${totals.changed} record(s) refreshed`);
}

// exitCode, not process.exit(): the ONNX runtime's threads are still winding
// down, and tearing the process out from under them aborts with a native
// "mutex lock failed" instead of returning our status.
process.exitCode = totals.failed ? 1 : 0;
