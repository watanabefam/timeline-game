// load.mjs — load a deck (JSON or .js) and a directory of source snapshots.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..", "..");

/**
 * @param {string} path  .json (draft contract) or .js (window.registerDeck) deck
 * @returns {object} deck
 */
export function loadDeck(path) {
  if (path.endsWith(".json")) return JSON.parse(readFileSync(path, "utf8"));

  // .js deck: run events-data.js first (defines window.DECKS + option globals),
  // then the deck file, and capture the last registered deck.
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  const eventsData = join(REPO_ROOT, "events-data.js");
  try {
    vm.runInContext(readFileSync(eventsData, "utf8"), sandbox, { filename: eventsData });
  } catch {
    /* events-data globals are optional for a standalone deck */
  }
  vm.runInContext(readFileSync(path, "utf8"), sandbox, { filename: path });
  const decks = sandbox.window.DECKS || [];
  return decks[decks.length - 1];
}

/** Read `<dir>/*.txt` into `{ <eventId>: text }`. Missing dir → {}. */
export function loadSources(dir) {
  const out = {};
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) return out;
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".txt")) out[basename(f, ".txt")] = readFileSync(join(dir, f), "utf8");
  }
  return out;
}
