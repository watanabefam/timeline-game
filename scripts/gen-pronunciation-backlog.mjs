#!/usr/bin/env node
/*
 * scripts/gen-pronunciation-backlog.mjs
 * ------------------------------------------------------------------
 * Generates tools/narration/pronunciation-backlog.json — the list of
 * spoken words that no dictionary knows, and which therefore need a human
 * lookup before they can be called right.
 *
 * WHY THIS IS GENERATED AND NOT HAND-WRITTEN
 * The count was 138 across four decks when this was written. A worksheet
 * nobody reads is not a control, and a hand-maintained list is worse than
 * none: it drifts from reality and then reads as a control while lying. So
 * the list is derived from the audit the same way decks/index.json is
 * derived from the deck folders, and validated the same way, with `--check`.
 *
 * THE CEILING IS A RATCHET, AND IT LIVES IN THIS FILE
 * `CEILING` below is the highest `open` count this project has accepted.
 * The count falling while the ceiling holds is the proof the work happened;
 * growth has to be asked for by editing the constant.
 *
 * It is a constant in CODE and not a field in the generated file on purpose.
 * The first version kept it in the JSON, and it was bypassable: `--check`
 * read the ceiling from the file on disk, so editing the JSON raised the
 * ceiling and the check still passed. Here there is nothing to hand-edit —
 * `--check` compares the file against this constant, so moving the ceiling
 * means changing a line of code, which is the one form of growth that cannot
 * look like anything other than a deliberate act.
 *
 * NO TIMESTAMP
 * The banner carries a hash of the payload, not a generation date. A date
 * would make the file differ from a fresh run every day and turn `--check`
 * into a calendar alarm; `git log` already answers "when was this last
 * touched".
 *
 * DEFERRED WORDS ARE NOT OPEN
 * A deferred word has a terminal outcome — it was looked up, understood, and
 * found out of reach of a respelling — so it is counted separately and keeps
 * its reason. That is why "deferred" is a status and not a bucket in the
 * worksheet: folding it into the open count would make progress look like
 * forgetting, and leaving it out entirely would hide a real limitation.
 *
 * OFFLINE BEHAVIOUR
 * Nothing here touches the network: the dictionary is the vendored CMU
 * package and the second reference is a cached file. If the dictionary
 * cannot be loaded this script FAILS. It must never write a smaller file
 * because it ran on partial data, and it must never report "clean" for a
 * check it could not perform.
 *
 * Run:
 *   node scripts/gen-pronunciation-backlog.mjs            # write
 *   node scripts/gen-pronunciation-backlog.mjs --check    # exit 1 if stale or over ceiling
 *   node scripts/gen-pronunciation-backlog.mjs --raise-ceiling   # allow growth, loudly
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { triageAll, worksheetRows } from "../tools/narration/audit.mjs";
import { DEFERRED, RECORDS } from "../tools/narration/lexicon-records.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const TARGET = join(repoRoot, "tools", "narration", "pronunciation-backlog.json");

/**
 * The highest number of open words this project has accepted.
 *
 * 138 when the ratchet was fitted. Lower this number when you want to tighten
 * it (words have been resolved and the slack should go); raise it only when a
 * deck has genuinely added unsourced content — `npm run gen:backlog` refuses to
 * write a file that breaks it either way, so the edit is always visible.
 */
export const CEILING = 138;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/**
 * The payload, derived. Pure: no clock, no network, no argv — so a test can
 * call it and compare the result with the committed file.
 *
 * @returns {Promise<{open: object[], deferred: object[], counts: object}>}
 */
export async function buildBacklog() {
  let triaged;
  try {
    triaged = await triageAll();
  } catch (err) {
    // Deliberately fatal. A partial run must never look like a smaller
    // backlog.
    fail(
      `the audit could not run, so the backlog cannot be derived: ${err && err.message}\n` +
        "  This gate needs tools/narration/node_modules (npm --prefix tools/narration install).\n" +
        "  It is refusing to write a file from partial data rather than reporting a clean check."
    );
  }

  const rows = triaged.flatMap((t) => worksheetRows(t));
  const open = [];
  const deferredByWord = new Map();
  const counts = {};

  for (const r of rows) {
    counts[r.deck] = (counts[r.deck] ?? 0) + (r.settled ? 0 : 1);
    if (!r.settled) {
      open.push({ word: r.word, deck: r.deck, count: r.count, engine: r.engine, events: r.events });
      continue;
    }
    if (r.record.status !== DEFERRED) continue;
    // A record is global while an `open` row is per deck, so the same word can
    // be spoken in two decks. Grouping here keeps one line per limitation —
    // otherwise `tenochtitlan` appears twice and reads as two problems.
    const seen = deferredByWord.get(r.word) ?? { word: r.word, decks: [] };
    if (!seen.decks.includes(r.deck)) seen.decks.push(r.deck);
    seen.deferredKind = r.record.deferredKind ?? null;
    // The prose is kept because the kind is a category and the prose is what
    // stops the next person redoing the investigation.
    seen.deferredBecause = r.record.deferredBecause ?? null;
    deferredByWord.set(r.word, seen);
  }

  const deferred = [...deferredByWord.values()];
  for (const d of deferred) d.decks.sort();

  // Deterministic order, so the file is stable and a diff means something.
  const byWord = (a, b) => (a.deck === b.deck ? a.word.localeCompare(b.word) : a.deck.localeCompare(b.deck));
  open.sort(byWord);
  deferred.sort((a, b) => a.word.localeCompare(b.word));
  return { open, deferred, counts: Object.fromEntries(Object.entries(counts).sort()) };
}

/** Render the whole file from a derived backlog and the code-held ceiling. */
export function renderBacklog(backlog) {
  const payload = {
    ceiling: CEILING,
    openCount: backlog.open.length,
    counts: backlog.counts,
    deferred: backlog.deferred,
    open: backlog.open,
  };
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
  return (
    `{\n  "banner": "GENERATED FILE, DO NOT EDIT. tools/narration/pronunciation-backlog.json ` +
    `— every spoken word no dictionary knows, and the ceiling this project has accepted for them. ` +
    `Regenerate: npm run gen:backlog   ·   Verify: npm run validate:backlog   ·   payload hash: ${digest}",\n` +
    `  "hash": "${digest}",\n` +
    Object.entries(payload)
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).split("\n").join("\n  ")}`)
      .join(",\n") +
    `\n}\n`
  );
}/** The message for a backlog that has outgrown the ceiling it was given. */
function overCeiling(openCount, what) {
  return (
    `${what} has outgrown its ratchet: ${openCount} against a ceiling of ${CEILING}.\n` +
    "  Growth is allowed, but it has to be asked for in code: raise CEILING in\n" +
    "  scripts/gen-pronunciation-backlog.mjs. A number that changes inside a\n" +
    "  generated file is not a decision anyone can review."
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");

  const backlog = await buildBacklog();

  if (check) {
    const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
    if (current !== renderBacklog(backlog)) {
      fail(
        `pronunciation-backlog.json is stale (${backlog.open.length} open word(s) now, on disk: ` +
          `${JSON.parse(current || "{}").openCount ?? "nothing"}).\n  Run: npm run gen:backlog`
      );
    }
    if (backlog.open.length > CEILING) fail(overCeiling(backlog.open.length, "the open backlog"));
    const perDeck = Object.entries(backlog.counts)
      .map(([d, n]) => `${d} ${n}`)
      .join(", ");
    console.log(
      `✓ pronunciation backlog: ${backlog.open.length} open word(s) (ceiling ${CEILING}), ` +
        `${backlog.deferred.length} deferred — ${perDeck}`
    );
    process.exit(0);
  }

  if (backlog.open.length > CEILING) fail(overCeiling(backlog.open.length, "the open backlog"));

  writeFileSync(TARGET, renderBacklog(backlog));
  console.log(
    `✓ pronunciation-backlog.json written (${backlog.open.length} open, ceiling ${CEILING}, ` +
      `${backlog.deferred.length} deferred)`
  );
  const slack = CEILING - backlog.open.length;
  if (slack > 0) {
    console.log(
      `  · ${slack} word(s) of headroom. Once the backlog is comfortable, tighten the ratchet by\n` +
        `    lowering CEILING to ${backlog.open.length} in scripts/gen-pronunciation-backlog.mjs.`
    );
  }
}

if (process.argv[1] && process.argv[1].endsWith("gen-pronunciation-backlog.mjs")) {
  try {
    await main();
  } catch (err) {
    console.error(`✗ ${err && err.stack ? err.stack : err}`);
    process.exitCode = 1;
  }
}