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
 *   DISCOVERY — decks/index.json (folder packages) with graceful fallback
 *
 * Decks are migrating from flat `decks/<name>.js` files to folder packages:
 *   decks/<id>/manifest.json  — { formatVersion, id, name, version, entry,
 *                                 license, description, attribution[],
 *                                 assets[], grandfathered? }
 *   decks/<id>/deck.json      — the deck data
 *
 * `decks/index.json` is the generated deck list ({ formatVersion, decks: [...] })
 * whose entries carry `layout: "folder" | "file"`. We read it first, then fall
 * back to `decks/manifest.json`, then to scanning `decks/*.js`, so the gate
 * keeps working throughout the migration window and never hard-fails.
 *
 * Folder packages additionally get filesystem assertions (manifest + entry
 * present, required manifest fields, id matches directory, assets[] exist and
 * are safe paths) and an orphan-file warning for anything the manifest does
 * not reference.
 *
 * Run:  node scripts/validate-content.mjs
 * Exit code 1 on any failure (wire into CI / pre-commit).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename, relative, sep } from "node:path";
import { loadDeck } from "../tools/content-pipeline/lib/load.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..");
const decksDir = join(REPO_ROOT, "decks");

// Paths are always compared / printed with POSIX separators.
const posix = (p) => String(p).split(sep).join("/");

// ------------------------------------------------------------------
// Discovery: decks/index.json -> decks/manifest.json -> decks/*.js
// ------------------------------------------------------------------

function discoverEntries() {
  const indexPath = join(decksDir, "index.json");
  if (existsSync(indexPath)) {
    try {
      const idx = JSON.parse(readFileSync(indexPath, "utf8"));
      const list = Array.isArray(idx) ? idx : idx.decks || [];
      if (list.length) return list.map(normaliseEntry);
      console.warn("Warning: decks/index.json has no deck entries — falling back.");
    } catch (e) {
      console.warn(
        `Warning: could not read decks/index.json (${e.message}) — falling back.`
      );
    }
  }

  const manifestPath = join(decksDir, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const list = Array.isArray(manifest) ? manifest : manifest.decks || [];
      if (list.length) return list.map(normaliseEntry);
    } catch (e) {
      console.warn(
        `Warning: could not read decks/manifest.json (${e.message}) — falling back.`
      );
    }
  }

  console.warn("Warning: no decks/index.json or decks/manifest.json — scanning decks/*.js.");
  return readdirSync(decksDir)
    .filter((f) => f.endsWith(".js") && f !== "manifest.js" && f !== "index.js")
    .sort()
    .map((file) => ({ layout: "file", file }));
}

function normaliseEntry(e) {
  if (typeof e === "string") return { layout: "file", file: e };
  const layout = e.layout || (e.file ? "file" : "folder");
  return { ...e, layout };
}

// ------------------------------------------------------------------
// Record building — read folder manifests once, up front.
// ------------------------------------------------------------------

function buildRecord(e) {
  if (e.layout === "folder") {
    const dirName = posix(e.dir || e.id || "");
    const deckDir = join(decksDir, dirName);
    const manifestPath = join(deckDir, "manifest.json");

    let manifest = null;
    let manifestErr = null;
    if (existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch (err) {
        manifestErr = err;
      }
    } else {
      manifestErr = new Error("manifest.json is missing");
    }

    const entryName = posix(
      (manifest && manifest.entry) || e.entry || "deck.json"
    );

    return {
      layout: "folder",
      id: e.id || basename(dirName),
      label: dirName,
      dir: dirName,
      deckDir,
      manifest,
      manifestErr,
      entryName,
      loadPath: join(deckDir, entryName),
    };
  }

  const file = posix(e.file);
  return {
    layout: "file",
    id: e.id || file,
    label: file,
    loadPath: join(decksDir, file),
  };
}

// ------------------------------------------------------------------
// Folder-package filesystem assertions.
// ------------------------------------------------------------------

function walkFiles(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function validateFolderFilesystem(rec, id) {
  const { deckDir, entryName, manifest } = rec;

  if (rec.manifestErr) {
    deckErr(id, "(manifest)", rec.manifestErr.message);
  }

  if (manifest) {
    for (const field of ["formatVersion", "id", "entry"]) {
      if (manifest[field] == null || manifest[field] === "") {
        deckErr(id, "(manifest)", `missing required field "${field}"`);
      }
    }
    if (manifest.id != null && posix(manifest.id) !== rec.dir) {
      deckErr(
        id,
        "(manifest)",
        `id "${manifest.id}" does not match directory "${rec.dir}"`
      );
    }
  }

  if (!existsSync(rec.loadPath)) {
    deckErr(id, "(fs)", `entry file "${entryName}" is missing`);
  }

  const allowedAssets = new Set();
  const assets =
    manifest && Array.isArray(manifest.assets) ? manifest.assets : [];
  for (const raw of assets) {
    const p = posix(raw == null ? "" : raw);
    if (!p || p.startsWith("/") || p.split("/").includes("..")) {
      deckErr(
        id,
        "(manifest)",
        `asset path "${p || String(raw)}" is unsafe (absolute or contains "..")`
      );
      continue;
    }
    allowedAssets.add(p);
    if (!existsSync(join(deckDir, p))) {
      deckErr(id, "(fs)", `asset "${p}" listed in manifest.json does not exist`);
    }
  }

  const allowed = new Set(["manifest.json", entryName, ...allowedAssets]);
  // The generated browser mirror (see scripts/gen-deck-index.mjs) is expected.
  allowed.add(entryName.replace(/\.json$/, ".js"));
  const docNames = new Set(["LICENSE", "LICENSE.txt", "README.md", "README.txt"]);
  if (!existsSync(deckDir)) return; // already reported above
  let files;
  try {
    files = walkFiles(deckDir);
  } catch (e) {
    warn(id, "(fs)", `could not scan deck folder (${e.message})`);
    return;
  }
  for (const full of files) {
    const rel = posix(relative(deckDir, full));
    if (allowed.has(rel) || docNames.has(rel) || docNames.has(basename(rel))) {
      continue;
    }
    warn(id, "(fs)", `orphan file not referenced by manifest.json: ${rel}`);
  }
}

// ------------------------------------------------------------------
// Content rule helpers.
// ------------------------------------------------------------------

// Decks that predate the "years live only in the year field" rule are
// grandfathered so the gate stays green while their content is cleaned up.
// NEW decks are deliberately NOT listed here and must pass.
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

let errors = 0; // event-rule failures (fact quality / year leak)
let deckErrors = 0; // deck/package problems (load, manifest, filesystem)
let warns = 0;
const err = (deck, id, msg) => {
  errors++;
  console.log(`  ✗ [${deck}] ${id}: ${msg}`);
};
const deckErr = (deck, id, msg) => {
  deckErrors++;
  console.log(`  ✗ [${deck}] ${id}: ${msg}`);
};
const warn = (deck, id, msg) => {
  warns++;
  console.log(`  ⚠ [${deck}] ${id}: ${msg}`);
};

// ------------------------------------------------------------------

const records = discoverEntries().map(buildRecord);

console.log(`Validating ${records.length} deck(s)…\n`);

for (const rec of records) {
  let deck = null;
  let loadErr = null;
  try {
    deck = loadDeck(rec.loadPath);
    if (!deck) throw new Error("no deck registered (missing id/events)");
  } catch (e) {
    loadErr = e;
  }

  const id = (deck && deck.id) || rec.id;
  const count =
    deck && Array.isArray(deck.events) ? deck.events.length : null;
  console.log(
    `[${rec.layout}] ${rec.label} — ${
      count == null ? "load failed" : `${count} event(s)`
    }`
  );

  if (rec.layout === "folder") validateFolderFilesystem(rec, id);

  if (loadErr) {
    deckErr(id, "(deck)", `could not load (${loadErr.message})`);
    continue;
  }

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
if (errors || deckErrors) {
  if (errors) {
    console.error(
      `✗ ${errors} event(s) failed the "fact adds value beyond the title" rule` +
        (warns ? ` (${warns} warning(s)).` : ".")
    );
  }
  if (deckErrors) {
    console.error(`✗ ${deckErrors} deck/package problem(s).`);
  }
  process.exit(1);
}
console.log(
  `✓ All events pass the fact-quality rule` +
    (warns ? ` (${warns} opt-in warning(s) about structured fields).` : ".")
);
