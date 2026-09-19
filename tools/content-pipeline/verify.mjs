#!/usr/bin/env node
// verify.mjs — CLI for the content verification core.
// Exit codes: 0 pass · 1 findings >= --fail-level · 2 fatal/config error.

import { loadDeck, loadSources } from "./lib/load.mjs";
import { loadRegistry } from "./lib/schema.mjs";
import { verifyDeck } from "./lib/verify.mjs";
import { summarize, exitCode, RULE_HINTS } from "./lib/findings.mjs";

function die(msg) {
  console.error(`verify: ${msg}`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { file: null, sources: null, failLevel: "error", format: "text" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sources") args.sources = argv[++i];
    else if (a === "--fail-level") args.failLevel = argv[++i];
    else if (a === "--format") args.format = argv[++i];
    else if (a.startsWith("-")) die(`unknown option: ${a}`);
    else if (!args.file) args.file = a;
  }
  return args;
}

const ICON = { error: "ERROR", warning: "WARN ", info: "INFO " };

function formatText(findings, file) {
  const lines = [];
  if (!findings.length) {
    lines.push(`✓ ${file} — no findings`);
    return lines.join("\n");
  }
  lines.push(`${exitCode(findings, "error") ? "✗" : "!"} ${file}`);
  for (const f of findings) {
    const loc = [f.event && `event "${f.event}"`, f.path].filter(Boolean).join(" ");
    lines.push(`  ${ICON[f.severity]}  ${f.rule.padEnd(20)} ${f.message}${loc ? `  [${loc}]` : ""}`);
    if (f.hint) lines.push(`         ↳ ${f.hint}`);
  }
  return lines.join("\n");
}

// ---- main -----------------------------------------------------------------
const argv = process.argv.slice(2);

if (argv[0] === "explain") {
  const rule = argv[1];
  if (!rule || !RULE_HINTS[rule]) die(`unknown rule: ${rule ?? "(none)"}`);
  console.log(`${rule}\n  ${RULE_HINTS[rule].hint}`);
  process.exit(0);
}

const args = parseArgs(argv);
if (!args.file) die("usage: node verify.mjs <deck.json> [--sources <dir>] [--fail-level error|warning|info] [--format text|json]");
if (!["error", "warning", "info"].includes(args.failLevel)) die(`bad --fail-level: ${args.failLevel}`);
if (!["text", "json"].includes(args.format)) die(`bad --format: ${args.format}`);

let deck, registry, sources;
try {
  deck = loadDeck(args.file);
  if (!deck) die(`could not load a deck from ${args.file}`);
  registry = loadRegistry();
  sources = loadSources(args.sources);
} catch (err) {
  die(err.message);
}

const findings = verifyDeck(deck, { registry, sources });
const code = exitCode(findings, args.failLevel);

if (args.format === "json") {
  console.log(
    JSON.stringify(
      { file: args.file, failLevel: args.failLevel, summary: summarize(findings), findings },
      null,
      2,
    ),
  );
} else {
  console.log(formatText(findings, args.file));
  const s = summarize(findings);
  const verdict = code ? "FAIL" : "PASS";
  console.log(`\nSummary: ${s.errors} error(s), ${s.warnings} warning(s) — ${verdict}`);
}

process.exit(code);
