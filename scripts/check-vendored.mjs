#!/usr/bin/env node
/*
 * scripts/check-vendored.mjs
 * ------------------------------------------------------------------
 * Guard-rail for AGENTS.md hard rule 2 ("never edit anything under assets/ —
 * it is vendored third-party code") and for the licensing rules recorded in
 * doc/LIBRARY_RESEARCH.md §2 and §5.
 *
 * The repo shipped a 125 MB Kokoro ONNX bundle that statically embedded an
 * Emscripten build of eSpeak-NG (GPL-3.0-or-later) inside an otherwise
 * Apache-2.0 package, reachable from one orphaned file (narration-worker.js).
 * Any naive app package would have copied it into a store build. This script
 * turns that class of mistake into a build failure instead of a review finding.
 *
 *   CHECK 1  copyleft scan    — no GPL/A?GPL/LGPL/EUPL/SSPL/FSL-1.1 marker, no
 *                               eSpeak/phonemizer, no CC-BY-NC (non-commercial)
 *                               in any text asset under assets/. Embedded
 *                               base64 data URIs and long base64 runs are
 *                               stripped first, so a JPEG payload cannot
 *                               produce a false positive (it once did).
 *   CHECK 2  retired paths    — no runtime-TTS bundle may reappear under
 *                               assets/ (kokoro / phonemizer / espeak / onnx),
 *                               per doc/CROSS_PLATFORM_ROADMAP.md §19.12.1.
 *   CHECK 3  retired imports  — no first-party file may reference the runtime
 *                               Kokoro bundle or the old narration worker:
 *                               narration is pre-rendered and shipped with the
 *                               deck (§19.12.1, §19.12.8).
 *   CHECK 4  license headers  — every vendored script under assets/vendor/
 *                               must carry a readable license marker and a
 *                               pinned version in its header. Files whose
 *                               upstream genuinely ships neither are
 *                               allow-listed in UNPINNED below, with the
 *                               reason, and are listed in THIRD_PARTY_LICENSES.md.
 *
 * Run:  node scripts/check-vendored.mjs
 * Exit code 1 on any failure (wired into `npm run validate`).
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..");
const ASSETS = join(REPO_ROOT, "assets");
const VENDOR = join(ASSETS, "vendor");

const errors = [];
const warnings = [];

/* ---------------------------------------------------------------- helpers */

const toPosix = (p) => relative(REPO_ROOT, p).split(sep).join("/");

/** Every file under dir, recursively (missing dir -> []). */
function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Header region of a file, as text (for banner checks). */
function header(path, bytes = 2048) {
  const buf = readFileSync(path);
  return buf.subarray(0, bytes).toString("utf8");
}

/*
 * Strip anything that is not prose before the copyleft scan:
 *   1. `data:` URIs (embedded images/fonts — the source of one false positive)
 *   2. long base64-ish runs (>= 60 chars of the base64 alphabet), which can
 *      synthesise word boundaries in the middle of a payload
 */
const DATA_URI = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi;
const BASE64_RUN = /[A-Za-z0-9+/=]{60,}/g;
function readable(text) {
  return text.replace(DATA_URI, " data-uri ").replace(BASE64_RUN, " base64-run ");
}

const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".css", ".json", ".txt", ".md", ".html"]);

/* Copyleft / non-commercial markers. Word-bounded so `aGPLx` inside a payload
   never trips them, and paired with a human-readable reason for the report. */
const COPYLEFT = [
  { re: /\bGNU (?:Affero |Lesser )?General Public License\b/i, what: "copyleft license" },
  { re: /\b(?:A|L)?GPL(?:[-\s]?v?[23](?:\.\d+)?)?\b/i, what: "copyleft license" },
  { re: /\beSpeak(?:-NG)?\b/i, what: "GPL-3.0 speech engine" },
  { re: /\bphonemizer\b/i, what: "package that embeds eSpeak-NG" },
  { re: /\bEUPL(?:-1\.2)?\b/i, what: "copyleft licence (distribution)" },
  { re: /\bSSPL\b/, what: "non-permissive license" },
  { re: /\bFSL-1\.1(?:-Apache-2\.0)?\b/i, what: "source-available, non-compete" },
  { re: /\bCC[- ]BY[- ]NC(?:[- ]\w+)?\b/i, what: "non-commercial license" },
];

/* Runtime-TTS artefacts that must never come back (§19.12.1). */
const RETIRED_PATH = /(?:^|[/\\])(?:kokoro|phonemizer|espeak|onnx)/i;
const RETIRED_REF = /vendor[/\\]kokoro|kokoro\.web\.js|narration-worker/i;

/* Licence/version banners. */
const LICENSE_MARKER =
  /\b(MIT|ISC|BSD-[23]-Clause|Apache-2\.0|Apache License|CC0|Unlicense|public domain)\b/i;
const VERSION_MARKER = /\bv?\d+\.\d+\.\d+\b/;

/* Files that legitimately carry no pinned version (framing: we may not edit
   vendored code, so the pin lives in THIRD_PARTY_LICENSES.md instead). */
const UNPINNED = new Map([
  ["liquid-glass.js", "upstream publishes no versioned release; MIT recorded in THIRD_PARTY_LICENSES.md"],
  ["vis-timeline-graph2d.min.css", "minified stylesheet ships no banner (vis-timeline 8.5.4, dual MIT/Apache-2.0)"],
]);

/* ------------------------------------------------------------------ checks */

// CHECK 1 — copyleft scan over text assets under assets/.
let scanned = 0;
for (const file of walk(ASSETS)) {
  const rel = toPosix(file);
  if (!TEXT_EXT.has(rel.slice(rel.lastIndexOf(".")))) continue;
  if (statSync(file).size > 8 * 1024 * 1024) {
    warnings.push(`${rel}: skipped by the copyleft scan (>8 MB text file)`);
    continue;
  }
  scanned += 1;
  const text = readable(readFileSync(file, "utf8"));
  for (const { re, what } of COPYLEFT) {
    const m = text.match(re);
    if (m) errors.push(`${rel}: contains "${m[0]}" (${what}) — remove it from the shipping tree`);
  }
}

// CHECK 2 — retired runtime-TTS paths.
for (const file of walk(ASSETS)) {
  const rel = toPosix(file);
  if (RETIRED_PATH.test(rel.replace(/^assets[/\\]/, ""))) {
    errors.push(`${rel}: runtime-TTS artefact under assets/ — narration is pre-rendered (§19.12.1)`);
  }
}

// CHECK 3 — first-party references to the retired runtime bundle.
const firstParty = [
  ...readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(?:js|mjs|html)$/.test(e.name))
    .map((e) => join(REPO_ROOT, e.name)),
  ...walk(join(REPO_ROOT, "scripts")),
  ...walk(join(REPO_ROOT, "tools")).filter((f) => !toPosix(f).startsWith("tools/kokoro-authoring/")),
];
for (const file of firstParty) {
  const rel = toPosix(file);
  if (!/\.(?:js|mjs|html)$/.test(rel)) continue;
  // This script documents what it guards; its own prose is not a reference.
  if (rel === "scripts/check-vendored.mjs") continue;
  const text = readable(readFileSync(file, "utf8"));
  const m = text.match(RETIRED_REF);
  if (m) {
    errors.push(`${rel}: references "${m[0]}" — the runtime Kokoro path is retired (§19.12.1)`);
  }
}

// CHECK 4 — vendored licence/version banners.
for (const file of walk(VENDOR)) {
  const rel = toPosix(file);
  if (!/\.(?:js|css)$/.test(rel)) continue;
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  const head = header(file);
  const pinned = UNPINNED.has(base);
  if (!LICENSE_MARKER.test(head)) {
    if (pinned) warnings.push(`${rel}: no license marker in header — ${UNPINNED.get(base)}`);
    else errors.push(`${rel}: no readable license marker in its header (first 2 KB)`);
  }
  if (pinned) continue;
  if (!VERSION_MARKER.test(head)) {
    errors.push(
      `${rel}: no pinned version in its header — add "@version x.y.z" when re-vendoring, ` +
        `or an UNPINNED entry in scripts/check-vendored.mjs plus a THIRD_PARTY_LICENSES.md row`
    );
  }
}

/* ------------------------------------------------------------------ report */

for (const w of warnings) console.log(`  warn  ${w}`);

if (errors.length) {
  console.error(`\nVendored-asset gate: ${errors.length} error(s) — FAIL\n`);
  for (const e of errors) console.error(`  error  ${e}`);
  console.error(
    `\nScanned ${scanned} text asset(s) under assets/ for copyleft markers.\n` +
      `Rule: a package's declared license does not cover a copyleft component it bundles.\n` +
      `See doc/LIBRARY_RESEARCH.md §2 and §5.\n`
  );
  process.exit(1);
}

console.log(`Vendored-asset gate: 0 error(s), ${warnings.length} warning(s) — PASS`);
console.log(`Scanned ${scanned} text asset(s) under assets/ for copyleft markers.`);
