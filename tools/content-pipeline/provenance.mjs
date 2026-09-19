#!/usr/bin/env node
// provenance.mjs — write an auditable provenance record for a deck.
//
// Usage:
//   node provenance.mjs <deck.json> [--sources <dir>] [--out <path>] [--revision N]
//
// Default output: content/provenance/<deckId>.json (relative to the repo root).

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeck, loadSources } from "./lib/load.mjs";
import { loadRegistry } from "./lib/schema.mjs";
import { verifyDeck } from "./lib/verify.mjs";
import { buildProvenance } from "./lib/provenance.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..");

function die(msg) {
  console.error(`provenance: ${msg}`);
  process.exit(2);
}

const argv = process.argv.slice(2);
let file = null;
let sourcesDir = null;
let out = null;
let revision = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--sources") sourcesDir = argv[++i];
  else if (a === "--out") out = argv[++i];
  else if (a === "--revision") revision = Number(argv[++i]);
  else if (a.startsWith("-")) die(`unknown option: ${a}`);
  else if (!file) file = a;
}

if (!file) {
  die("usage: node provenance.mjs <deck.json> [--sources <dir>] [--out <path>] [--revision N]");
}

let deck;
try {
  deck = loadDeck(file);
} catch (err) {
  die(`cannot load deck: ${err.message}`);
}
if (!deck) die(`no deck found in ${file}`);

const registry = loadRegistry();
const sources = loadSources(sourcesDir);
const findings = verifyDeck(deck, { registry, sources });
const record = buildProvenance(deck, {
  sources,
  findings,
  deckRevision: Number.isFinite(revision) ? revision : null,
});

const outPath = out || join(REPO_ROOT, "content", "provenance", `${deck.id}.json`);
mkdirSync(dirname(resolve(outPath)), { recursive: true });
writeFileSync(resolve(outPath), JSON.stringify(record, null, 2) + "\n");

console.log(
  `wrote ${outPath} — ${record.summary.events} event(s), ${record.summary.errors} error(s), ${record.summary.warnings} warning(s)`,
);
process.exit(record.summary.errors ? 1 : 0);
