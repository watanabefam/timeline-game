/*
 * scripts/validate-content.mjs
 * ------------------------------------------------------------------
 * Enforceable content rule for EVERY timeline deck (current or future):
 *
 *   RULE — "A fact must add information the title does NOT already give."
 *
 * For each event the check fails when ANY of these hold:
 *   1. fact is empty
 *   2. fact is identical to the title (ignoring case / punctuation / spaces)
 *   3. fact is a substring of the title or vice-versa (near-duplicate)
 *   4. fact shares >= 70% of its meaningful words with the title
 *      (i.e. it just re-words the title instead of adding a detail)
 *   5. fact carries no concrete "value-add" signal — a year/number, a
 *      proper noun (capitalized word), or a causal/significance connector
 *      (because, first, invented, led to, founded, largest, ...). A fact
 *      that merely restates the event in different words fails here.
 *
 * Optional (warning, not error): structured fields who/where/why. We
 * report coverage but do not fail the build on them yet, so existing
 * decks can opt in gradually.
 *
 *   RULE — "Years live only in the year field."
 *
 * Narration reads the title + fact aloud, so any year embedded in
 * fact/who/where/why would give the answer away before placement. New
 * decks must keep years solely in `year` (and `yearEnd`/`sortYear`).
 * Existing decks are grandfathered: this is reported as a warning for
 * them so the gate stays green while content is cleaned up over time.
 *
 * Run:  node scripts/validate-content.mjs
 * Exit code 1 on any failure (wire into CI / pre-commit).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "..", "events-data.js");
const src = readFileSync(srcPath, "utf8");

// events-data.js assigns window.DECKS — give it a fake window.
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

// Load deck files from decks/manifest.json
const decksDir = join(here, "..", "decks");
const manifestFiles = new Set();
const deckFile = new Map(); // deck id -> manifest file it was loaded from
try {
  const manifestPath = join(decksDir, "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const deckFiles = (
      Array.isArray(manifest) ? manifest : manifest.decks || []
    ).map((d) => (typeof d === "string" ? d : d.file));
    for (const file of deckFiles) {
      manifestFiles.add(file);
      const deckSrc = readFileSync(join(decksDir, file), "utf8");
      const before = (sandbox.window.DECKS || []).length;
      vm.runInContext(deckSrc, sandbox);
      const after = sandbox.window.DECKS || [];
      if (after.length > before) deckFile.set(after[after.length - 1].id, file);
    }
  }
} catch (e) {
  console.warn("Warning: could not load deck files:", e.message);
}

const decks = sandbox.window.DECKS || [];

// Decks that predate the "years live only in the year field" rule are
// grandfathered so the gate stays green while their content is cleaned up.
// NEW decks are deliberately NOT listed here and must pass — listing a deck in
// the manifest used to grandfather it automatically, which made the rule
// impossible to fail.
const LEGACY_DECKS = new Set(["cc-timeline", "world-literature"]);

const STOP = new Set(
  "the a an and or of to in on for with by at from into over under is was were be been being as that this these those it its their his her our your my we they he she you i them us than then so but not no do did does".split(
    " "
  )
);

const CausalRe =
  /\b(because|since|first|last|only|also|led to|leading to|invented|discovered|founded|born|died|killed|conquered|united|divided|built|wrote|painted|ruled|created|began|ended|largest|smallest|oldest|youngest|made|introduced|spread|launched|established|produced|developed|transformed|inspired|shaped|gave|mark|marked|showed|proved|fought|won|lost|toppled|codified|revived|halted|preserved|exported)\b/i;

function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function tokens(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}
function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size && !sb.size) return 0;
  let inter = 0;
  sa.forEach((w) => {
    if (sb.has(w)) inter++;
  });
  const uni = sa.size + sb.size - inter;
  return uni ? inter / uni : 0;
}

let errors = 0;
let warns = 0;
const err = (deck, id, msg) => {
  errors++;
  console.log(`  ✗ [${deck}] ${id}: ${msg}`);
};
const warn = (deck, id, msg) => {
  warns++;
  console.log(`  ⚠ [${deck}] ${id}: ${msg}`);
};

console.log(`Validating ${decks.length} deck(s)…\n`);

for (const deck of decks) {
  if (!deck.events || !deck.events.length) {
    warn(deck.id, "(deck)", "no events");
    continue;
  }
  for (const ev of deck.events) {
    const id = ev.id || "(no id)";
    const title = ev.title || "";
    const fact = ev.fact || "";

    if (!fact.trim()) {
      err(deck.id, id, "missing fact");
      continue;
    }
    if (norm(fact) === norm(title)) {
      err(deck.id, id, "fact duplicates the title");
      continue;
    }
    if (
      norm(fact).startsWith(norm(title)) ||
      norm(title).startsWith(norm(fact))
    ) {
      err(deck.id, id, "fact is a near-duplicate of the title");
      continue;
    }
    const j = jaccard(tokens(title), tokens(fact));
    if (j >= 0.7) {
      err(
        deck.id,
        id,
        `fact just rewords the title (word-overlap ${j.toFixed(2)})`
      );
      continue;
    }
    const hasNumber = /\d/.test(fact);
    const hasProperNoun = /\b[A-Z][a-z]{2,}\b/.test(fact);
    if (!hasNumber && !hasProperNoun && !CausalRe.test(fact)) {
      err(
        deck.id,
        id,
        "fact adds no concrete detail (needs a year/number, name, or causal word)"
      );
      continue;
    }

    // Optional structured fields — report coverage only.
    const missing = ["who", "where", "why"].filter(
      (k) => ev[k] == null || ev[k].trim() === ""
    );
    if (missing.length === 3) {
      warn(deck.id, id, "no structured fields (who/where/why) — consider adding");
    }

    // RULE — "Years live only in the year field." Narration reads title+fact
    // aloud, so a year in fact/who/where/why leaks the answer. Legacy decks
    // (LEGACY_DECKS) warn; every other deck fails.
    const YearRe =
      /\b(?:c\.|circa)?\s*\d{1,4}s?\s*(?:–|-|to)?\s*\d{0,4}s?\s*(?:BC|AD|BCE|CE)\b|\b(?:1[0-9]{3}|2[0-9]{3})s?\b/i;
    const leaky = ["fact", "who", "where", "why"].filter(
      (k) => ev[k] && YearRe.test(ev[k])
    );
    if (leaky.length) {
      const msg = `year mentioned in ${leaky.join("/")} — keep years in the year field only (narration reads this aloud)`;
      if (LEGACY_DECKS.has(deck.id)) warn(deck.id, id, msg);
      else err(deck.id, id, msg);
    }
  }
}

console.log("");
if (errors) {
  console.error(
    `✗ ${errors} event(s) failed the "fact adds value beyond the title" rule` +
      (warns ? ` (${warns} warning(s)).` : ".")
  );
  process.exit(1);
}
console.log(
  `✓ All events pass the fact-quality rule` +
    (warns ? ` (${warns} opt-in warning(s) about structured fields).` : ".")
);
