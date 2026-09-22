#!/usr/bin/env node
// verify-all.mjs — run the pipeline gate across every deck in the manifest.
//
// Grandfathered decks (manifest entry `grandfathered: true`) downgrade
// SOURCE_MISSING to a warning until their sources are backfilled. New decks get
// the full gate (SOURCE_MISSING is an error).
//
// Exit: 0 pass · 1 findings >= --fail-level · 2 fatal.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeck, loadSources } from "./lib/load.mjs";
import { loadRegistry } from "./lib/schema.mjs";
import { eventDepth } from "./lib/rules.mjs";
import { verifyDeck } from "./lib/verify.mjs";
import { summarize, exitCode, RULE_HINTS } from "./lib/findings.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..");
const INDEX = join(REPO_ROOT, "decks", "index.json");
const LEGACY_MANIFEST = join(REPO_ROOT, "decks", "manifest.json");

function resolveDeckPath(entry) {
  return entry.layout === "folder"
    ? join(REPO_ROOT, "decks", entry.dir, entry.entry || "deck.json")
    : join(REPO_ROOT, "decks", entry.file);
}

function normaliseEntry(entry) {
  if (typeof entry === "string") return { layout: "file", file: entry };
  if (entry && entry.layout) return entry;
  if (entry && entry.file) return { ...entry, layout: "file" };
  if (entry && entry.dir) return { ...entry, layout: "folder" };
  return entry || {};
}

// New generated decks/index.json, falling back to the old decks/manifest.json
// and finally to scanning decks/*.js — so this never hard-fails mid-migration.
function loadDeckIndex() {
  for (const path of [INDEX, LEGACY_MANIFEST]) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      const decks = Array.isArray(parsed) ? parsed : parsed.decks || [];
      return decks.map(normaliseEntry);
    } catch {
      /* try the next source */
    }
  }
  return readdirSync(join(REPO_ROOT, "decks"))
    .filter((f) => f.endsWith(".js") && f !== "manifest.js")
    .sort()
    .map((file) => ({ layout: "file", file }));
}

function die(msg) {
  console.error(`verify-all: ${msg}`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { failLevel: "error", format: "text", verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fail-level") args.failLevel = argv[++i];
    else if (a === "--format") args.format = argv[++i];
    else if (a === "--verbose" || a === "-v") args.verbose = true;
    else if (a.startsWith("-")) die(`unknown option: ${a}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!["error", "warning", "info"].includes(args.failLevel)) die(`bad --fail-level: ${args.failLevel}`);

const registry = loadRegistry();
const sources = loadSources(join(REPO_ROOT, "content", "sources"));
const decks = loadDeckIndex();

const byDeck = [];
let all = [];

for (const d of decks) {
  const path = resolveDeckPath(d);
  const label = d.file || d.id || d.dir || "(deck)";
  let deck;
  try {
    deck = loadDeck(path);
  } catch (err) {
    die(`cannot load ${label}: ${err.message}`);
  }
  let findings = verifyDeck(deck, { registry, sources });
  if (d.grandfathered) {
    findings = findings.map((f) =>
      (f.rule === "SOURCE_MISSING" || f.rule === "FIELD_TRACE_MISSING")
        ? { ...f, severity: "warning", message: `${f.message} (grandfathered)` }
        : f,
    );
  }
  const deckId = (deck && deck.id) || label;
  all = all.concat(findings);
  const depth = { deep: 0, shallow: 0, "fact-only": 0 };
  for (const e of deck.events || []) depth[eventDepth(e)] += 1;
  byDeck.push({ file: label, id: deckId, events: (deck.events || []).length, findings, depth, grandfathered: !!d.grandfathered });
}

const code = exitCode(all, args.failLevel);

if (args.format === "json") {
  console.log(
    JSON.stringify(
      {
        failLevel: args.failLevel,
        decks: byDeck.map((d) => ({ ...d, summary: summarize(d.findings) })),
        summary: summarize(all),
        exitCode: code,
      },
      null,
      2,
    ),
  );
} else {
  for (const d of byDeck) {
    const s = summarize(d.findings);
    const tag = d.grandfathered ? " (grandfathered)" : "";
    const status = s.errors ? "✗" : s.warnings ? "!" : "✓";
    const cov = d.depth.deep || d.depth.shallow
      ? `  · ${d.depth.deep} deep / ${d.depth.shallow} shallow`
      : "";
    console.log(`${status} ${d.id}${tag}  — ${d.events} events, ${s.errors} error(s), ${s.warnings} warning(s)${cov}`);
    if (args.verbose) {
      for (const f of d.findings) {
        console.log(`    ${f.severity.toUpperCase().padEnd(5)} ${f.rule.padEnd(20)} ${f.message}${f.event ? ` [${f.event}]` : ""}`);
      }
    }
  }
  const s = summarize(all);
  const td = byDeck.reduce((a, d) => a + d.depth.deep, 0);
  const ts = byDeck.reduce((a, d) => a + d.depth.shallow, 0);
  console.log(`\nContent gate: ${s.errors} error(s), ${s.warnings} warning(s) — ${code ? "FAIL" : "PASS"}`);
  console.log(`Coverage: ${td} event(s) claim-grounded (deep) · ${ts} editorial-only (shallow — summary reviewed against source, not traced to claims)`);
}

process.exit(code);
