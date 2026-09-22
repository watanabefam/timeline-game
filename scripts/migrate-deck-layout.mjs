#!/usr/bin/env node
/*
 * scripts/migrate-deck-layout.mjs
 * ------------------------------------------------------------------
 * One-shot migration: flat deck files -> folder packages.
 *
 *   decks/<name>.js  ->  decks/<id>/deck.json      (deck data, JSON)
 *                        decks/<id>/manifest.json  (package metadata)
 *
 * Filter and group `get` functions cannot survive JSON, so they are rewritten
 * to declarative specs resolved at registration (see events-data.js
 * `resolveGet`). Any function that does not match a known pattern is a HARD
 * ERROR — a new deck must add a spec rather than silently lose its filter.
 *
 * Usage:
 *   node scripts/migrate-deck-layout.mjs            # dry run (prints the plan)
 *   node scripts/migrate-deck-layout.mjs --write    # perform the migration
 *   node scripts/migrate-deck-layout.mjs --write --delete-legacy
 *
 * --delete-legacy removes the original decks/<name>.js only after the folder
 * has been written. Git history is the rollback.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeck } from "../tools/content-pipeline/lib/load.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const decksDir = join(here, "..", "decks");

const WRITE = process.argv.includes("--write");
const DELETE_LEGACY = process.argv.includes("--delete-legacy");

// Content licence per deck. Left undefined where it still needs review — the
// gate should flag a missing licence on NEW decks, so we do not invent one.
const LICENSE = {
  "world-history-first-timeline": "CC-BY-SA-4.0",
  "inventions-discoveries": "CC-BY-SA-4.0",
};
const DEFAULT_VERSION = "1.0.0";

// Ordered: the most specific patterns first (continentGeneral before the plain
// "return ev.continent" field pattern).
const GET_PATTERNS = [
  { test: "=> null", spec: { strategy: "none" } },
  { test: 'ev.era === "prehistory"', spec: { strategy: "eraBucket" } },
  { test: "window.ageBucket(ev)", spec: { strategy: "ageBucket" } },
  { test: 'ev.area === "world"', spec: { strategy: "continentGeneral" } },
  { test: "return ev.era", spec: { field: "era" } },
  { test: "return ev.category", spec: { field: "category" } },
  { test: "return ev.continent", spec: { field: "continent" } },
  { test: "=> ev.week", spec: { field: "week" } },
  { test: "=> ev.era", spec: { field: "era" } },
  { test: "=> ev.category", spec: { field: "category" } },
  { test: "=> ev.continent", spec: { field: "continent" } },
];

function specFor(fn, deckId, where) {
  if (typeof fn !== "function") {
    // Already declarative — leave it alone.
    return fn;
  }
  const src = fn.toString().replace(/\s+/g, " ");
  const hit = GET_PATTERNS.find((p) => src.includes(p.test));
  if (!hit) {
    throw new Error(
      `migrate: ${deckId} ${where} has an unrecognised get() — add a spec:\n    ${src}`
    );
  }
  return hit.spec;
}

function convertDeck(deck) {
  if (Array.isArray(deck.filters)) {
    deck.filters.forEach((f, i) => {
      if (f) f.get = specFor(f.get, deck.id, `filter[${i}] "${f.id}"`);
    });
  }
  if (Array.isArray(deck.groupStrategies)) {
    deck.groupStrategies.forEach((g, i) => {
      if (g) g.get = specFor(g.get, deck.id, `groupStrategy[${i}] "${g.id}"`);
    });
  }
  return deck;
}

// Generated index artefacts — never treated as decks.
const GENERATED = new Set(["manifest.js", "index.js"]);

const files = readdirSync(decksDir)
  .filter((f) => f.endsWith(".js") && !GENERATED.has(f))
  .sort();
if (!files.length) {
  console.log("No flat deck files found — nothing to migrate.");
  process.exit(0);
}

const plan = [];
for (const file of files) {
  const deck = loadDeck(join(decksDir, file));
  if (!deck || !deck.id) throw new Error(`migrate: ${file} registered no deck`);

  // Convert filter/group `get` functions to declarative specs FIRST — a
  // JSON round-trip would silently drop every function-valued `get`.
  convertDeck(deck);
  const data = JSON.parse(JSON.stringify(deck));

  const manifest = {
    formatVersion: 1,
    id: deck.id,
    name: deck.name || deck.id,
    version: DEFAULT_VERSION,
    entry: "deck.json",
    description: deck.blurb || "",
    attribution: [],
  };
  // Only set a licence we can actually justify. A deck without one is flagged
  // by the package gate rather than given a fabricated SPDX id.
  if (LICENSE[deck.id]) manifest.license = LICENSE[deck.id];

  plan.push({ file, id: deck.id, dir: join(decksDir, deck.id), data, manifest });
}

for (const p of plan) {
  console.log(`${p.file.padEnd(32)} ->  decks/${p.id}/{manifest.json, deck.json}   (${p.data.events.length} events)`);
}

if (!WRITE) {
  console.log("\nDry run — nothing written. Re-run with --write to migrate.");
  process.exit(0);
}

for (const p of plan) {
  mkdirSync(p.dir, { recursive: true });
  writeFileSync(join(p.dir, "manifest.json"), JSON.stringify(p.manifest, null, 2) + "\n");
  writeFileSync(join(p.dir, "deck.json"), JSON.stringify(p.data, null, 2) + "\n");
  console.log(`✓ wrote decks/${p.id}/`);
  if (DELETE_LEGACY) {
    rmSync(join(decksDir, p.file));
    console.log(`  removed decks/${p.file}`);
  }
}

if (!DELETE_LEGACY) {
  console.log("\nLegacy .js files kept. Re-run with --delete-legacy to remove them.");
}
console.log(`\n✓ Migrated ${plan.length} deck(s). Run: node scripts/gen-deck-index.mjs`);
