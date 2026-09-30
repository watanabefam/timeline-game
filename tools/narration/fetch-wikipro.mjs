#!/usr/bin/env node
// Fetch the WikiPron English transcription, once, into the gitignored cache.
//
//   npm run narration:wikipro
//
// A second, independently sourced reference (see wikipron.mjs) is what lets
// the audit see a BORROWED name: where CMUdict and WikiPron disagree, an
// "engine agrees with the dictionary" verdict stops being evidence. Without
// this file the audit behaves exactly as it always has — the reference layer
// is optional by design — so this is a convenience, not a dependency.
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { WIKIPRON_TSV, WIKIPRON_URL, WIKIPRON_LICENCE } from "./wikipron.mjs";

const force = process.argv.includes("--force");

if (!force) {
  try {
    const existing = statSync(WIKIPRON_TSV);
    console.log(`  ✓ WikiPron already fetched (${Math.round(existing.size / 1e6)} MB)`);
    console.log(`    ${WIKIPRON_TSV}`);
    process.exitCode = 0;
  } catch {
    /* not there yet — fall through and fetch */
  }
} else {
  console.log("  fetching (--force) …");
}

mkdirSync(dirname(WIKIPRON_TSV), { recursive: true });
process.stdout.write(`  GET ${WIKIPRON_URL}\n`);
const res = await fetch(WIKIPRON_URL);
if (!res.ok) {
  console.error(`✗ HTTP ${res.status} ${res.statusText} — is the upstream path still right?`);
  process.exitCode = 1;
} else {
  const body = await res.text();
  const lines = body.split("\n").filter((l) => l.includes("\t")).length;
  if (lines < 1000) {
    console.error(`✗ only ${lines} usable lines — refusing to cache a truncated file`);
    process.exitCode = 1;
  } else {
    writeFileSync(WIKIPRON_TSV, body);
    console.log(`  ✓ ${lines} entries → ${WIKIPRON_TSV}`);
    console.log(`  licence: ${WIKIPRON_LICENCE}`);
    console.log("  Now run:  npm run narration:audit");
  }
}
