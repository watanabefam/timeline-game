#!/usr/bin/env node
// brief.mjs — print the drafting brief for an event (or every event in a deck).
// The brief is what a drafter is given BEFORE writing: the claims (the only facts
// that may be asserted), the device, the POV, the length target, and the forbidden
// moves. Usage: node brief.mjs <deck.js> [--id <eventId>] [--out <dir>]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadDeck } from "./lib/load.mjs";
import { loadDevices, buildBrief } from "./lib/brief.mjs";

const argv = process.argv.slice(2);
let file = null, id = null, out = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--id") id = argv[++i];
  else if (a === "--out") out = argv[++i];
  else if (!file) file = a;
}
if (!file) { console.error("brief: usage: node brief.mjs <deck.js> [--id <eventId>] [--out <dir>]"); process.exit(2); }
const deck = loadDeck(file);
const reg = loadDevices();
const events = (deck.events || []).filter((e) => !id || e.id === id);
if (!events.length) { console.error("brief: no event matched"); process.exit(2); }
for (const e of events) {
  const text = buildBrief(e, reg);
  if (out) { mkdirSync(out, { recursive: true }); const p = join(out, `${e.id}.md`); writeFileSync(p, text); console.log(`wrote ${p}`); }
  else process.stdout.write(text + "\n");
}
