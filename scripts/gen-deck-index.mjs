#!/usr/bin/env node
/*
 * scripts/gen-deck-index.mjs
 * ------------------------------------------------------------------
 * Generates decks/index.json — the single source of truth for the decks
 * actually present in decks/. It supersedes the old gen-deck-manifest.mjs
 * / decks/manifest.json pair, so the deck list is never hand-maintained
 * (the old hand-written list plus a hardcoded duplicate in timeline.js
 * drifted and silently dropped a deck).
 *
 * Two deck layouts are recognised. Each index entry carries a content
 * `revision` (12 hex chars of a sha256) plus `bytes`, so a returning
 * player always fetches a changed deck and never a stale one:
 *
 *   folder — decks/<dir>/manifest.json plus an entry file (default
 *            "deck.json"). The revision hashes every file in the package,
 *            keyed by relative POSIX path, so a rename busts it as well as
 *            an edit. A `grandfathered` flag is copied through.
 *   file   — a legacy flat decks/<name>.js deck, loaded through the shared
 *            content-pipeline loader to read its registered id.
 *
 * A deck id that appears as both a folder and a flat file is a HARD ERROR:
 * the script never silently picks one.
 *
 * Run:
 *   node scripts/gen-deck-index.mjs          # write decks/index.json + index.js
 *   node scripts/gen-deck-index.mjs --check  # exit 1 if stale (CI gate)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import { loadDeck } from "../tools/content-pipeline/lib/load.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const decksDir = join(here, "..", "decks");
const indexPath = join(decksDir, "index.json");
const check = process.argv.includes("--check");

// Non-content files are never decks: dotfiles, `_`-prefixed helpers, and the
// stale generated browser global left over from gen-deck-manifest.mjs.
const ignored = (name) => name.startsWith(".") || name.startsWith("_");
const GENERATED = new Set(["manifest.js", "index.js"]);

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/** All non-ignored files under `dir`, recursively. */
function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** sha256 over a package's files, sorted by relative POSIX path. */
function hashFolder(dir, exclude = new Set()) {
  const files = listFiles(dir)
    .map((full) => ({ full, rel: relative(dir, full).split(sep).join("/") }))
    .filter((f) => !exclude.has(f.rel))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const hash = createHash("sha256");
  let bytes = 0;
  for (const { full, rel } of files) {
    const buf = readFileSync(full);
    bytes += buf.length;
    hash.update(rel);
    hash.update("\0");
    hash.update(buf);
  }
  return { revision: hash.digest("hex").slice(0, 12), bytes };
}

function folderEntry(name) {
  const dir = join(decksDir, name);
  const manifestPath = join(dir, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    fail(`decks/${name}/manifest.json is not valid JSON: ${e.message}`);
  }
  if (typeof manifest.id !== "string" || !manifest.id.trim()) {
    fail(`decks/${name}/manifest.json is missing a string "id"`);
  }
  const entry = manifest.entry == null ? "deck.json" : manifest.entry;
  if (typeof entry !== "string" || !entry.trim()) {
    fail(`decks/${name}/manifest.json has an invalid "entry" (expected a non-empty string)`);
  }
  if (!existsSync(join(dir, entry))) {
    fail(`decks/${name}/manifest.json entry "${entry}" does not exist in the folder`);
  }
  // A classic-script mirror the browser injects, so decks load without fetch()
  // — fetch is blocked under file:// (origin "null"). It is GENERATED from the
  // entry, so it is excluded from the hash: the entry it mirrors is hashed.
  const script = entry.replace(/\.json$/, ".js");
  const { revision, bytes } = hashFolder(dir, new Set([script]));
  const out = {
    id: manifest.id.trim(),
    layout: "folder",
    dir: name,
    entry,
    script,
    revision,
    bytes,
  };
  if (manifest.version !== undefined) out.version = manifest.version;
  if (manifest.license !== undefined) out.license = manifest.license;
  if (manifest.attribution !== undefined) out.attribution = manifest.attribution;
  if (manifest.grandfathered === true) out.grandfathered = true;
  return out;
}

function fileEntry(name) {
  const full = join(decksDir, name);
  let deck;
  try {
    deck = loadDeck(full);
  } catch (e) {
    fail(`decks/${name} failed to load: ${e.message}`);
  }
  if (!deck || !deck.id) fail(`decks/${name} registered no deck id`);
  const buf = readFileSync(full);
  return {
    id: deck.id,
    layout: "file",
    file: name,
    revision: createHash("sha256").update(buf).digest("hex").slice(0, 12),
    bytes: buf.length,
  };
}

const where = (e) => (e.layout === "folder" ? `decks/${e.dir}/` : `decks/${e.file}`);

const dirents = readdirSync(decksDir, { withFileTypes: true }).filter(
  (e) => !ignored(e.name)
);
const folders = dirents
  .filter((e) => e.isDirectory() && existsSync(join(decksDir, e.name, "manifest.json")))
  .map((e) => e.name)
  .sort();
const files = dirents
  .filter((e) => e.isFile() && e.name.endsWith(".js") && !GENERATED.has(e.name))
  .map((e) => e.name)
  .sort();

const decks = [...folders.map(folderEntry), ...files.map(fileEntry)].sort((a, b) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0
);

const seen = new Map();
for (const d of decks) {
  const prev = seen.get(d.id);
  if (prev) {
    fail(`duplicate deck id "${d.id}" — ${where(prev)} and ${where(d)} both claim it`);
  }
  seen.set(d.id, d);
}

const index = { formatVersion: 1, decks };
const next = JSON.stringify(index, null, 2) + "\n";

// A classic-script mirror of the index, so the browser can read it without
// fetch() — works offline, under file://, and behind a strict CSP. This is the
// file timeline.js injects; the .json is for the Node tooling.
const jsPath = join(decksDir, "index.js");
const nextJs =
  "/* GENERATED by scripts/gen-deck-index.mjs — do not edit by hand. */\n" +
  "window.DECK_INDEX = " +
  JSON.stringify(index, null, 2) +
  ";\n";

const split = `${folders.length} folder, ${files.length} file`;

if (check) {
  const curJson = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
  const curJs = existsSync(jsPath) ? readFileSync(jsPath, "utf8") : "";
  if (curJson !== next || curJs !== nextJs) {
    console.error(
      "✗ decks/index.json / index.js are out of date — run: node scripts/gen-deck-index.mjs"
    );
    process.exit(1);
  }
  console.log(`✓ decks/index.{json,js} up to date (${decks.length} decks: ${split}).`);
  process.exit(0);
}

writeFileSync(indexPath, next);
writeFileSync(jsPath, nextJs);

// Per-deck script mirrors. Each carries the package metadata (version/licence/
// attribution) merged onto the deck data, so the runtime deck is complete
// without a second request.
let written = 0;
if (true) {
  for (const d of decks) {
    if (d.layout !== "folder") continue;
    const dir = join(decksDir, d.dir);
    const data = JSON.parse(readFileSync(join(dir, d.entry), "utf8"));
    if (d.version !== undefined) data.version = d.version;
    if (d.license !== undefined) data.license = d.license;
    if (d.attribution !== undefined) data.attribution = d.attribution;
    writeFileSync(
      join(dir, d.script),
      "/* GENERATED by scripts/gen-deck-index.mjs — do not edit by hand. */\n" +
        "window.registerDeck(" +
        JSON.stringify(data, null, 2) +
        ");\n"
    );
    written++;
  }
}

console.log(`✓ Wrote decks/index.{json,js} (${decks.length} decks: ${split}).`);
console.log(`✓ Wrote ${written} per-deck script mirror(s) (decks/<id>/deck.js).`);
