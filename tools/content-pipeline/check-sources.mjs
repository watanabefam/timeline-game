#!/usr/bin/env node
// check-sources.mjs — has the article we pinned since been revised?
//
// Our prose is grounded in frozen snapshots committed to the repo, so a dead link
// cannot break the content. What *can* go stale is the grounding: if the article is
// rewritten, our content silently reflects a superseded source. This reports which
// pinned revisions are no longer current, for re-review.
//
// Author-time only. No API key; Wikimedia asks for a descriptive User-Agent (--ua).
// Exit: 0 all current · 1 drift or unresolved · 2 fatal.
//
// Usage:
//   node check-sources.mjs                       # every deck in the manifest
//   node check-sources.mjs ../../decks/world-history.js
//   node check-sources.mjs --format json --delay 2000

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeck } from "./lib/load.mjs";
import { pinnedRevisions, driftFor, wikipediaRevIdUrl } from "./lib/source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..");
const MANIFEST = join(REPO_ROOT, "decks", "manifest.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function die(msg) {
  console.error(`check-sources: ${msg}`);
  process.exit(2);
}

const argv = process.argv.slice(2);
let ua = "timeline-game-content-pipeline/0.1 (author-time tooling; set a contact via --ua)";
let delay = 1500;
let format = "text";
let file = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--ua") ua = argv[++i];
  else if (a === "--delay") delay = Number(argv[++i]) || 0;
  else if (a === "--format") format = argv[++i];
  else if (a.startsWith("-")) die(`unknown option: ${a}`);
  else if (!file) file = a;
}

let deckPaths;
if (file) {
  deckPaths = [file];
} else {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch (err) {
    die(`cannot read manifest: ${err.message}`);
  }
  deckPaths = (Array.isArray(manifest) ? manifest : manifest.decks || []).map((d) =>
    join(REPO_ROOT, "decks", typeof d === "string" ? d : d.file),
  );
}

const pins = [];
for (const p of deckPaths) {
  try {
    pins.push(...pinnedRevisions(loadDeck(p)));
  } catch (err) {
    die(`cannot load ${p}: ${err.message}`);
  }
}
if (!pins.length) {
  console.log("check-sources: no pinned sources found");
  process.exit(0);
}

const results = [];
for (const pin of pins) {
  let current = null;
  for (let attempt = 0; attempt < 3 && current == null; attempt++) {
    if (attempt) await sleep(2000 * attempt);
    try {
      const res = await fetch(wikipediaRevIdUrl(pin.title), {
        headers: { "User-Agent": ua, Accept: "application/json" },
      });
      if (!res.ok) continue;
      const json = await res.json();
      const page = json?.query?.pages?.[0];
      current = page?.revisions?.[0]?.revid ?? page?.lastrevid ?? null;
    } catch {
      /* retry */
    }
  }
  results.push(driftFor(pin, current));
  await sleep(delay);
}

const drifted = results.filter((r) => r.status === "drifted");
const unknown = results.filter((r) => r.status === "unknown");

if (format === "json") {
  console.log(
    JSON.stringify(
      { checked: results.length, current: results.length - drifted.length - unknown.length, drifted: drifted.length, unknown: unknown.length, results },
      null,
      2,
    ),
  );
} else {
  for (const r of results) {
    const mark = r.status === "current" ? "✓" : r.status === "drifted" ? "!" : "?";
    console.log(
      `${mark} ${r.event.padEnd(14)} ${r.title}  pinned ${r.pinned}${r.current ? ` → now ${r.current}` : " (unresolved)"}`,
    );
  }
  console.log(
    `\n${results.length} pinned source(s): ${results.length - drifted.length - unknown.length} current, ${drifted.length} drifted, ${unknown.length} unresolved`,
  );
}

process.exit(drifted.length || unknown.length ? 1 : 0);
