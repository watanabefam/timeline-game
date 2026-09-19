#!/usr/bin/env node
// fetch-source.mjs — pin + snapshot one Wikipedia article for an event.
//
// One Action API request returns the FULL plain-text extract AND the numeric
// revision id (a human-verifiable ?oldid= permalink). Author-time only. No API
// key; Wikimedia asks only for a descriptive User-Agent (pass --ua). Retries
// with backoff on rate limits.
//
// Usage:
//   node fetch-source.mjs "Great Pyramid of Giza" --id pyramids
//   node fetch-source.mjs https://en.wikipedia.org/wiki/Penicillin --id penicillin --out content/sources
//   node fetch-source.mjs "Apollo 11" --id moon --revid 1371120273   # skip the lookup

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { wikipediaActionUrl, buildWikipediaSource, wikiTitleFromUrl } from "./lib/source.mjs";

function die(msg) {
  console.error(`fetch-source: ${msg}`);
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argv = process.argv.slice(2);
let title = null;
let id = null;
let out = "content/sources";
let lang = "en";
let ua = "timeline-game-content-pipeline/0.1 (author-time tooling; set a contact via --ua)";
let revIdArg = null;
let delayMs = 0;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--id") id = argv[++i];
  else if (a === "--out") out = argv[++i];
  else if (a === "--lang") lang = argv[++i];
  else if (a === "--ua") ua = argv[++i];
  else if (a === "--revid") revIdArg = argv[++i];
  else if (a === "--delay") delayMs = Number(argv[++i]) || 0;
  else if (!title) title = a;
  else die(`unexpected argument: ${a}`);
}

if (!title) {
  die(
    "usage: node fetch-source.mjs <title|url> --id <eventId> [--out dir] [--lang en] [--ua 'name (contact)'] [--revid N] [--delay ms]",
  );
}

if (delayMs) await sleep(delayMs);

const resolved = wikiTitleFromUrl(title) || title;
const url = wikipediaActionUrl(resolved, lang);

let data = null;
for (let attempt = 0; attempt < 4 && data == null; attempt++) {
  if (attempt) await sleep(2000 * attempt); // backoff on rate limit / transient error
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "application/json" } });
    if (!res.ok) continue;
    const json = await res.json();
    const page = json?.query?.pages?.[0];
    if (page && page.extract) {
      data = {
        title: page.title,
        extract: page.extract,
        revid: page.revisions?.[0]?.revid ?? null,
        missing: page.missing === true,
      };
    }
  } catch {
    /* retry */
  }
}

if (!data) die(`could not fetch "${resolved}" (network error or rate limit)`);
if (data.missing) die(`no article named "${resolved}"`);
const extract = data.extract.trim();
if (!extract) die(`no extract returned for "${resolved}"`);

const source = buildWikipediaSource({ title: data.title, revid: revIdArg ?? data.revid, lang });

mkdirSync(out, { recursive: true });
const fileName = `${id || data.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
const snapshotPath = join(out, fileName);
writeFileSync(snapshotPath, extract + "\n");

console.log(
  JSON.stringify({ id: id || null, snapshot: snapshotPath, bytes: extract.length, source }, null, 2),
);
