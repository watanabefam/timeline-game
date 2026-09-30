#!/usr/bin/env node
/*
 * scripts/gen-sourcing-backlog.mjs
 * ------------------------------------------------------------------
 * Generates content/sourcing-backlog.json — how many events in each deck
 * have no registered source behind them, and the ceiling this project has
 * accepted for that.
 *
 * WHY THIS EXISTS
 * `tools/content-pipeline/README.md` states the policy: "No source → no ship.
 * New decks require a registered, licensed source per event. Pre-existing
 * decks are grandfathered (warning) until backfilled."
 *
 * "Until backfilled" had no end date and no number. Measured on 2026-09-30:
 * ZERO of 321 events in any deck carry a `source`, and two decks carry
 * `"grandfathered": true`, which downgrades SOURCE_MISSING and
 * FIELD_TRACE_MISSING to warnings. So the content gate reported 80 errors —
 * one per event in the two UNFLAGGED decks — and 201 findings as warnings.
 * It was reporting 29% of a uniform gap and calling the rest grandfathered.
 *
 * That made `npm run validate` permanently red, which is worse than it sounds:
 * a gate that is always red is a gate people stop reading, and the six strict
 * gates shared a command with it. The chain no longer includes
 * `validate:pipeline`; this file is what keeps the excluded gap VISIBLE and
 * BOUNDED rather than merely unmentioned.
 *
 * THE CEILING IS A RATCHET, AND IT LIVES IN THIS FILE
 * `CEILING` is the highest unsourced count this project has accepted. Any deck
 * that adds unsourced events fails the gate until someone raises the constant
 * — in code, where the change is reviewable. It is deliberately not a field in
 * the generated JSON: an earlier version of this pattern kept the ceiling in
 * the file and `--check` read it from disk, so editing the file raised the
 * ceiling and the check still passed. See §4.7.6 in doc/LIBRARY_RESEARCH.md.
 *
 * WHAT THIS DOES NOT DO
 * It does not discount the grandfathering, and it does not fix anything. It
 * converts an unbounded, undated exemption into a number that cannot grow
 * quietly. The sourcing work is content research: tens of documents, tracked
 * separately.
 *
 * Run:
 *   node scripts/gen-sourcing-backlog.mjs          # write
 *   node scripts/gen-sourcing-backlog.mjs --check  # exit 1 if stale or over ceiling
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDeck, loadSources } from "../tools/content-pipeline/lib/load.mjs";
import { loadRegistry } from "../tools/content-pipeline/lib/schema.mjs";
import { verifyDeck } from "../tools/content-pipeline/lib/verify.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const TARGET = join(repoRoot, "content", "sourcing-backlog.json");
const INDEX = join(repoRoot, "decks", "index.json");

/**
 * The highest number of unsourced events this project has accepted.
 *
 * 321 when the ratchet was fitted — every event in every deck, because no
 * event anywhere carries a `source`. That is the honest baseline: it is not a
 * target, and it lets every new deck be judged by the same number instead of
 * by whether someone remembered to flag it.
 */
export const CEILING = 321;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function readDeckIndex() {
  if (!existsSync(INDEX)) fail(`decks/index.json is missing — run: npm run gen:index`);
  const parsed = JSON.parse(readFileSync(INDEX, "utf8"));
  const decks = Array.isArray(parsed) ? parsed : parsed.decks || [];
  return decks.map((e) => (typeof e === "string" ? { layout: "file", file: e } : e));
}

function deckPath(entry) {
  return entry.layout === "folder"
    ? join(repoRoot, "decks", entry.dir, entry.entry || "deck.json")
    : join(repoRoot, "decks", entry.file);
}

/**
 * The payload, derived. Pure apart from the filesystem reads, so a test can
 * call it and compare with the committed file.
 *
 * `unsourced` counts EVENTS, taken from the same `SOURCE_MISSING` finding the
 * content gate raises — derived from the gate itself rather than from a
 * parallel notion of "has a source", so the two cannot disagree.
 */
export function buildSourcingBacklog() {
  const registry = loadRegistry();
  const sources = loadSources(join(repoRoot, "content", "sources"));
  const decks = [];

  for (const entry of readDeckIndex()) {
    const path = deckPath(entry);
    let deck;
    try {
      deck = loadDeck(path);
    } catch (err) {
      fail(`cannot load ${entry.file || entry.dir}: ${err.message}`);
    }
    const findings = verifyDeck(deck, { registry, sources });
    const events = (deck.events || []).length;
    const unsourced = findings.filter((f) => f.rule === "SOURCE_MISSING").length;
    decks.push({
      id: deck.id || entry.dir || entry.file,
      events,
      sourced: events - unsourced,
      unsourced,
      // Kept so the exemption is visible in the file rather than implied by
      // which severity happened to come out.
      grandfathered: entry.grandfathered === true,
    });
  }

  decks.sort((a, b) => a.id.localeCompare(b.id));
  const total = decks.reduce((n, d) => n + d.events, 0);
  const unsourcedTotal = decks.reduce((n, d) => n + d.unsourced, 0);
  return {
    decks,
    totalEvents: total,
    sourcedEvents: total - unsourcedTotal,
    unsourcedEvents: unsourcedTotal,
    grandfatheredDecks: decks.filter((d) => d.grandfathered).map((d) => d.id),
  };
}

/** Render the whole file from a derived backlog and the code-held ceiling. */
export function renderSourcingBacklog(backlog) {
  const payload = {
    ceiling: CEILING,
    totalEvents: backlog.totalEvents,
    sourcedEvents: backlog.sourcedEvents,
    unsourcedEvents: backlog.unsourcedEvents,
    grandfatheredDecks: backlog.grandfatheredDecks,
    note:
      "No source → no ship (tools/content-pipeline/README.md). Grandfathered " +
      "decks downgrade SOURCE_MISSING to a warning; this file counts them " +
      "anyway, so an exemption never hides a number.",
    decks: backlog.decks,
  };
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
  return (
    `{\n  "banner": "GENERATED FILE, DO NOT EDIT. content/sourcing-backlog.json ` +
    `— events with no registered source, and the ceiling this project has accepted for them. ` +
    `Regenerate: npm run gen:sourcing   ·   Verify: npm run validate:sourcing   ·   payload hash: ${digest}",\n` +
    `  "hash": "${digest}",\n` +
    Object.entries(payload)
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).split("\n").join("\n  ")}`)
      .join(",\n") +
    `\n}\n`
  );
}

function overCeiling(unsourced) {
  return (
    `the unsourced backlog has outgrown its ratchet: ${unsourced} against a ceiling of ${CEILING}.\n` +
    "  A new deck adding unsourced events is exactly what the policy forbids, so this is\n" +
    "  not a false alarm. Either source the events, or raise CEILING in\n" +
    "  scripts/gen-sourcing-backlog.mjs — in code, so the change is reviewable."
  );
}

function main() {
  const check = process.argv.includes("--check");
  const backlog = buildSourcingBacklog();

  if (check) {
    const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
    if (current !== renderSourcingBacklog(backlog)) {
      const onDisk = JSON.parse(current || "{}").unsourcedEvents;
      fail(
        `sourcing-backlog.json is stale (${backlog.unsourcedEvents} unsourced event(s) now, ` +
          `on disk: ${onDisk ?? "nothing"}).\n  Run: npm run gen:sourcing`
      );
    }
    if (backlog.unsourcedEvents > CEILING) fail(overCeiling(backlog.unsourcedEvents));
    console.log(
      `✓ sourcing backlog: ${backlog.sourcedEvents} of ${backlog.totalEvents} event(s) sourced ` +
        `(${backlog.unsourcedEvents} unsourced, ceiling ${CEILING}) — ` +
        `${backlog.grandfatheredDecks.length} grandfathered deck(s)`
    );
    process.exit(0);
  }

  if (backlog.unsourcedEvents > CEILING) fail(overCeiling(backlog.unsourcedEvents));

  writeFileSync(TARGET, renderSourcingBacklog(backlog));
  console.log(
    `✓ sourcing-backlog.json written (${backlog.sourcedEvents} of ${backlog.totalEvents} sourced, ` +
      `ceiling ${CEILING})`
  );
  const slack = CEILING - backlog.unsourcedEvents;
  if (slack > 0) {
    console.log(
      `  · ${slack} event(s) of headroom. Once sources land, tighten the ratchet by lowering\n` +
        `    CEILING to ${backlog.unsourcedEvents} in scripts/gen-sourcing-backlog.mjs.`
    );
  }
}

if (process.argv[1] && process.argv[1].endsWith("gen-sourcing-backlog.mjs")) {
  try {
    main();
  } catch (err) {
    console.error(`✗ ${err && err.stack ? err.stack : err}`);
    process.exitCode = 1;
  }
}