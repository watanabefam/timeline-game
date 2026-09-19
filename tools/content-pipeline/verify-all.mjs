#!/usr/bin/env node
// verify-all.mjs — run the pipeline gate across every deck in the manifest.
//
// Grandfathered decks (manifest entry `grandfathered: true`) downgrade
// SOURCE_MISSING to a warning until their sources are backfilled. New decks get
// the full gate (SOURCE_MISSING is an error).
//
// Exit: 0 pass · 1 findings >= --fail-level · 2 fatal.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeck, loadSources } from "./lib/load.mjs";
import { loadRegistry } from "./lib/schema.mjs";
import { eventDepth } from "./lib/rules.mjs";
import { verifyDeck } from "./lib/verify.mjs";
import { summarize, exitCode, RULE_HINTS } from "./lib/findings.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..");
const MANIFEST = join(REPO_ROOT, "decks", "manifest.json");

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
let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (err) {
  die(`cannot read manifest: ${err.message}`);
}
const decks = (Array.isArray(manifest) ? manifest : manifest.decks || []).map((d) =>
  typeof d === "string" ? { file: d } : d,
);

const byDeck = [];
let all = [];

for (const d of decks) {
  const path = join(REPO_ROOT, "decks", d.file);
  let deck;
  try {
    deck = loadDeck(path);
  } catch (err) {
    die(`cannot load ${d.file}: ${err.message}`);
  }
  let findings = verifyDeck(deck, { registry, sources });
  if (d.grandfathered) {
    findings = findings.map((f) =>
      (f.rule === "SOURCE_MISSING" || f.rule === "FIELD_TRACE_MISSING")
        ? { ...f, severity: "warning", message: `${f.message} (grandfathered)` }
        : f,
    );
  }
  const deckId = (deck && deck.id) || d.file;
  all = all.concat(findings);
  const depth = { deep: 0, shallow: 0, "fact-only": 0 };
  for (const e of deck.events || []) depth[eventDepth(e)] += 1;
  byDeck.push({ file: d.file, id: deckId, events: (deck.events || []).length, findings, depth, grandfathered: !!d.grandfathered });
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
