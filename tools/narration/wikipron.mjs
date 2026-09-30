// A SECOND reference, scraped from Wiktionary — AUTHOR-TIME ONLY.
//
// CMUdict is the reference layer, but it is an AMERICAN dictionary and the
// corpus is full of names English has *borrowed*: the entry records the
// English reading of the letters, not the name. "Qin" is the clean example —
// CMUdict has it as a spelling variant of "kin" (K IH1 N), so the engine
// agrees with the dictionary, the audit calls it verified, and the dynasty
// comes out as "kin" instead of "chin".
//
// A second, independently sourced reference turns that false comfort into
// something a human can act on: the reading is printed beside the engine's
// own phonemes, so "qin" shows CMUdict's K IH1 N and WikiPron's t͡ʃ ɪ n side
// by side and the discrepancy is obvious.
//
// It is ADVICE, NOT A VERDICT, and that is a measured decision rather than
// caution. An earlier version compared the two readings phone-by-phone and
// demoted "agrees" to "disagrees" on a mismatch; against real words it
// flagged "world", "empire", "napoleon" and "athens", because ARPAbet and
// IPA segment r-coloured vowels differently and the sequences are not
// index-aligned. See the comment on `tidyIpaReading` in reference.mjs and
// doc/LIBRARY_RESEARCH.md §4.7.
//
// WikiPron is scraped from Wiktionary and is Apache-2.0 (CUNY-CL), so rule 2
// is satisfied. It is NOT vendored under assets/ — it is a 3 MB data file the
// author fetches, and every consumer degrades gracefully when it is absent.
//
//   npm run narration:wikipro      # one-time fetch into .cache/
//
// KNOWN LIMIT: the English data is a BROAD transcription with no stress
// marks — "bastille" is `b æ s t i l`, which cannot distinguish BAST-ill from
// bas-STIL. So a second reference catches the consonant-and-vowel half of the
// problem and is blind to the stress half, which is why the curated
// BORROWED_NAMES list in audit.mjs is still needed for words like that.
//
// This module is DATA ONLY on purpose: the phone-level comparison lives in
// reference.mjs, next to the class maps it needs, so the dependency between
// the two runs one way and there is no import cycle.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Where the fetched TSV lives. Gitignored; absent is a supported state. */
export const WIKIPRON_TSV = join(here, ".cache", "wikipron", "eng.tsv");

/** Upstream file, Apache-2.0 (CUNY-CL/wikipron, data/scrape/tsv). */
export const WIKIPRON_URL =
  "https://raw.githubusercontent.com/CUNY-CL/wikipron/master/data/scrape/tsv/eng_latn_us_broad.tsv";

/** Licence and provenance, for THIRD_PARTY_LICENSES.md if it is ever vendored. */
export const WIKIPRON_LICENCE = "Apache-2.0 (CUNY-CL/wikipron; data scraped from Wiktionary)";

let table = null; // word -> string[]

/** True when the fetched data is present. Never throws. */
export function wikipronAvailable() {
  return existsSync(WIKIPRON_TSV);
}

/**
 * Load the TSV once, memoised on the promise so concurrent callers share the
 * read. A missing file yields an empty table rather than an error, which is
 * what makes the second reference optional everywhere downstream.
 */
async function load() {
  if (table) return table;
  table = (async () => {
    const map = new Map();
    if (!wikipronAvailable()) return map;
    for (const line of readFileSync(WIKIPRON_TSV, "utf8").split("\n")) {
      const tab = line.indexOf("\t");
      if (tab < 0) continue;
      const word = line.slice(0, tab).toLowerCase();
      const phones = line.slice(tab + 1).trim();
      if (!word || !phones) continue;
      const list = map.get(word);
      if (list) {
        if (list.length < 3) list.push(phones);
      } else {
        map.set(word, [phones]);
      }
    }
    return map;
  })();
  return table;
}

/** All readings WikiPron offers for a word (at most 3), or []. */
export async function wikipronForms(word) {
  const dict = await load();
  return dict.get(String(word || "").toLowerCase()) ?? [];
}
