// Audition strips — AUTHOR-TIME ONLY.
//
// The audit says *which* words to hear. This says how to hear them fast:
// one tiny MP3 per candidate, every risky word of a deck on a single page,
// each with the phonemes the engine intends and the dictionary's answer
// beside it. Forty words in ninety seconds, instead of scrubbing through
// forty card-length clips to find the same eleven syllables.
//
// Strips live in tools/narration/.cache/strips/<deck>/ — gitignored, never
// shipped, and re-rendered on demand rather than recorded into the render
// cache: they are evidence, and evidence goes stale when the voice or the
// tier changes, which is exactly when you want to hear it again.
//
// The engine is imported lazily, so importing this module costs nothing and
// the audit still runs on a fresh clone with no npm install.
"use strict";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { DEFAULT_VOICE, REPO_ROOT, setVoice } from "./synth.mjs";
import { haveFfmpeg, renderStrip } from "./audio.mjs";

const CACHE_DIR = join(REPO_ROOT, "tools", "narration", ".cache");
const STRIP_ROOT = join(CACHE_DIR, "strips");

/** A filename-safe handle for a word (or a context phrase's slug). */
export function slug(text) {
  return (
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "word"
  );
}

/**
 * What to say for one audition strip.
 *
 * A bare word is the honest test of a respelling — "theeseez" has to work
 * with no context around it, because that is what the LEXICON hands the
 * engine. A context-sensitive word ("read", "lead") is the opposite: its
 * reading depends on the sentence, so the strip is the sentence.
 *
 * @param {{ word: string, tier: string, engine?: string|null, dict?: string|null,
 *           note?: string, why?: string[], count?: number, name?: boolean,
 *           context?: string }} finding
 */
export function stripScript(finding) {
  if (finding.tier === "context" && finding.context) return finding.context;
  return finding.word;
}

const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

/**
 * Render the audition strips for one deck and write the listening sheet.
 *
 * @param {{ deck: string, findings: Array<object>, sheet?: string }} input
 * @param {{ outDir?: string, force?: boolean, log?: (line: string) => void }} [opts]
 * @returns {Promise<{ dir: string, sheet: string, rendered: number, skipped: number }>}
 */
export async function renderStrips({ deck, findings, sheet }, opts = {}) {
  const log = opts.log ?? console.log;
  const outDir = opts.outDir ?? join(STRIP_ROOT, deck);
  if (!(await haveFfmpeg())) {
    throw new Error("ffmpeg is not on PATH — audition strips need it (brew install ffmpeg)");
  }
  mkdirSync(outDir, { recursive: true });

  const { synthesize } = await import("./synth.mjs");
  const rows = [];
  let rendered = 0;
  let skipped = 0;

  for (const finding of findings) {
    const script = stripScript(finding);
    const file = `${slug(script)}.mp3`;
    const path = join(outDir, file);
    if (!opts.force && existsSync(path)) {
      skipped += 1;
    } else {
      const { audio, samplingRate } = await synthesize(script);
      const strip = await renderStrip({ audio, samplingRate });
      writeFileSync(path, strip.mp3);
      rendered += 1;
      log(
        `  ♪ ${finding.word.padEnd(22)} ${(strip.durationMs / 1000).toFixed(1)}s  ` +
          `${(strip.bytes / 1024).toFixed(0)} KB  +${strip.gainDb} dB`
      );
    }
    rows.push({ finding, script, file });
  }

  const sheetPath = join(outDir, sheet ?? `audit-${deck}.html`);
  writeFileSync(sheetPath, listeningSheet(deck, rows));
  return { dir: outDir, sheet: sheetPath, rendered, skipped };
}

const TIER_LABEL = {
  disagrees: "disagrees with the dictionary",
  "no-reference": "needs a human source",
  context: "context-sensitive",
  agrees: "verified",
  unverified: "unverified (no reference layer)",
};

const TIER_COLOUR = {
  disagrees: "#b3261e",
  "no-reference": "#8a5a00",
  context: "#1b5e9c",
  agrees: "#2e6b33",
  unverified: "#666",
};

/** The one-page hearing sheet. Author-time HTML, never shipped. */
export function listeningSheet(deck, rows) {
  const body = rows
    .map(({ finding, script, file }) => {
      const tier = finding.tier ?? "unverified";
      const bits = [
        finding.name ? "name" : "",
        ...(finding.why ?? []),
        finding.count > 1 ? `×${finding.count}` : "",
      ].filter(Boolean);
      return `<tr>
  <td><input type="checkbox" data-word="${escapeHtml(finding.word)}"></td>
  <td class="word"><span class="badge" style="background:${TIER_COLOUR[tier] ?? "#666"}">${
    escapeHtml(tier)
  }</span>${escapeHtml(finding.word)}<div class="why">${escapeHtml(bits.join(" · "))}</div></td>
  <td class="ipa">${escapeHtml(finding.engine ?? "—")}<div class="dict">${
    finding.dict ? escapeHtml(finding.dict) : "no dictionary entry"
  }</div></td>
  <td class="note">${escapeHtml(finding.note ?? "")}</td>
  <td class="say">${escapeHtml(script)}</td>
  <td><audio controls preload="none" src="${encodeURI(file)}"></audio></td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en"><meta charset="utf-8">
<title>Audition strips — ${escapeHtml(deck)}</title>
<style>
 body { font: 14px/1.5 system-ui, sans-serif; margin: 24px; color: #111; }
 h1 { font-size: 18px; margin: 0 0 4px; }
 p.lede { color: #555; margin: 0 0 18px; max-width: 60ch; }
 table { border-collapse: collapse; width: 100%; }
 th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid #e3e3e3; }
 th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #666; }
 .word { font-weight: 600; min-width: 16ch; }
 .why { font-weight: 400; font-size: 12px; color: #777; margin-top: 3px; }
 .ipa { font-family: ui-monospace, monospace; font-size: 13px; white-space: nowrap; }
 .dict { color: #777; font-size: 12px; }
 .note { font-size: 13px; color: #444; max-width: 30ch; }
 .say { color: #333; max-width: 30ch; font-style: italic; }
 .badge { display: inline-block; font-size: 10px; font-weight: 700; color: #fff;
          text-transform: uppercase; letter-spacing: .04em; padding: 1px 6px;
          border-radius: 8px; margin-right: 7px; vertical-align: 2px; }
 audio { height: 32px; }
 #out { width: 100%; height: 52px; margin-top: 14px; font-family: ui-monospace, monospace; }
 .bar { position: sticky; top: 0; background: #fff; padding: 10px 0; }
</style>
<div class="bar">
<h1>Audition strips — ${escapeHtml(deck)}</h1>
<p class="lede">One word per row; a context-sensitive word is spoken in its own sentence instead.
Tick whatever sounds wrong and copy the list at the bottom. A <strong>disagrees</strong> row wants a
LEXICON respelling in <code>tools/narration/text.mjs</code>; a <strong>needs a human source</strong>
row wants a decision you can defend. These clips are evidence only — they are never shipped.</p>
</div>
<table>
<tr><th></th><th>word</th><th>engine / dictionary</th><th>finding</th><th>spoken here as</th><th>clip</th></tr>
${body}
</table>
<textarea id="out" placeholder="flagged words appear here"></textarea>
<script>
  var out = document.getElementById("out");
  document.addEventListener("change", function () {
    out.value = [].slice.call(document.querySelectorAll("input:checked"))
      .map(function (c) { return c.dataset.word; }).join(", ");
  });
</script>
`;
}

/** Repo-relative path, for console output. */
export function reportPath(path) {
  const rel = relative(REPO_ROOT, path);
  return (rel.startsWith("..") ? path : rel).split(sep).join("/");
}

/**
 * Audition arbitrary lines — the tool for a question the audit cannot
 * answer. The audit measures *which words* to hear; when the finding is
 * prosody instead ("it restarts at the third item of the list"), the only
 * way to settle it is to render candidate phrasings and let the ear choose,
 * without touching a deck or re-recording a shipped clip to compare.
 *
 * @param {Array<{ label: string, text: string, voice?: string }>} entries
 * @param {{ outDir?: string, force?: boolean, voice?: string }} [opts]
 * @returns {Promise<{ sheet: string, rendered: number }>}
 */
export async function renderTry(entries, opts = {}) {
  const outDir = opts.outDir ?? join(STRIP_ROOT, "scratch");
  if (!(await haveFfmpeg())) {
    throw new Error("ffmpeg is not on PATH — audition strips need it (brew install ffmpeg)");
  }
  mkdirSync(outDir, { recursive: true });
  const { currentVoice, synthesize } = await import("./synth.mjs");

  const rows = [];
  let rendered = 0;
  for (const [i, entry] of entries.entries()) {
    const file = `try-${i + 1}.mp3`;
    const path = join(outDir, file);
    // The voice is per entry, not per run: a sheet that A/Bs two timbres is
    // the whole point, and a global flag applied after parsing would label
    // every row with a voice it was not rendered in. Every entry sets it
    // explicitly — including the default — so no earlier call can leak in.
    const voice = entry.voice ?? opts.voice ?? DEFAULT_VOICE;
    setVoice(voice);
    const used = currentVoice();
    if (opts.force || !existsSync(path)) {
      const { audio, samplingRate } = await synthesize(entry.text);
      const strip = await renderStrip({ audio, samplingRate });
      writeFileSync(path, strip.mp3);
      rendered += 1;
    }
    rows.push({ ...entry, file, voice: used });
  }

  const sheet = join(outDir, "try.html");
  const body = rows
    .map(
      (row, i) => `<tr>
  <td><input type="checkbox" data-label="${escapeHtml(row.label)}"></td>
  <td class="label"><strong>${escapeHtml(row.label)}</strong><div class="why">${escapeHtml(row.voice)} · try-${i + 1}.mp3</div></td>
  <td class="say">${escapeHtml(row.text)}</td>
  <td><audio controls preload="none" src="${encodeURI(row.file)}"></audio></td>
</tr>`
    )
    .join("\n");

  writeFileSync(
    sheet,
    `<!doctype html>
<html lang="en"><meta charset="utf-8">
<title>Audition — candidate phrasings</title>
<style>
 body { font: 14px/1.5 system-ui, sans-serif; margin: 24px; }
 h1 { font-size: 18px; margin: 0 0 10px; }
 table { border-collapse: collapse; width: 100%; }
 th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid #ddd; }
 th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #666; }
 .label { min-width: 12ch; } .why { font-weight: 400; font-size: 12px; color: #777; }
 .say { max-width: 60ch; } audio { height: 32px; }
 #out { width: 100%; height: 46px; margin-top: 12px; font-family: ui-monospace, monospace; }
</style>
<h1>Audition — candidate phrasings</h1>
<table><tr><th></th><th>label</th><th>text</th><th>clip</th></tr>
${body}
</table>
<textarea id="out" placeholder="tick the ones that sound right"></textarea>
<script>
  var out = document.getElementById("out");
  document.addEventListener("change", function () {
    out.value = [].slice.call(document.querySelectorAll("input:checked"))
      .map(function (c) { return c.dataset.label; }).join(", ");
  });
</script>
`
  );
  return { sheet, rendered, dir: outDir };
}

/* -------------------------------------------------------------- CLI */

/**
 * `node tools/narration/strips.mjs --say "<text>" [--say "<text>"] [--label x]
 *   [--voice af_bella] [--out sheet-name]`
 * Renders each --say line into .cache/strips/scratch/[out]/ and writes a
 * sheet. --out keeps competing auditions side by side instead of overwriting
 * each other. --voice applies to every --say that FOLLOWS it, so one sheet can
 * hold a timbre A/B. Neither touches a deck.
 */
async function main() {
  const argv = process.argv.slice(2);
  const texts = [];
  const labels = [];
  let voice = null;
  let out = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--say" && argv[i + 1]) texts.push({ text: argv[++i], voice });
    if (argv[i] === "--label" && argv[i + 1]) labels.push(argv[++i]);
    if (argv[i] === "--voice" && argv[i + 1]) voice = argv[++i];
    if (argv[i] === "--out" && argv[i + 1]) out = argv[++i];
  }
  if (!texts.length) {
    console.log(
      [
        "audition strips",
        "",
        '  node tools/narration/strips.mjs --say "text to hear" [--say "another"] [--label name]',
        "                                       [--voice af_bella] [--out sheet-name]",
        "",
        "--voice applies to every --say after it, so one sheet can A/B two voices.",
        "Writes one MP3 per line and try.html to tools/narration/.cache/strips/scratch/.",
      ].join("\n")
    );
    return;
  }
  // Validate every requested voice up front, so a typo fails before anything
  // is rendered. renderTry sets the voice per entry and restores the default,
  // so leaving one set here cannot affect the output.
  try {
    for (const candidate of new Set(texts.map((t) => t.voice).filter(Boolean))) {
      setVoice(candidate);
    }
    setVoice(DEFAULT_VOICE);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exitCode = 2;
    return;
  }
  const entries = texts.map((t, i) => ({ ...t, label: labels[i] ?? `try-${i + 1}` }));
  const outDir = out ? join(STRIP_ROOT, "scratch", slug(out)) : undefined;
  const result = await renderTry(entries, { force: argv.includes("--force"), outDir });
  for (const entry of entries) console.log(`  ♪ ${entry.voice ?? "default"} · ${entry.label}`);
  console.log(`\n  → ${reportPath(result.sheet)} (rendered ${result.rendered})`);
}

if (process.argv[1] && process.argv[1].endsWith("strips.mjs")) {
  main().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exitCode = 2;
  });
}
