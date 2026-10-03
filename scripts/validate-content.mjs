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
 * RULE — "A deck is scored on relations BETWEEN events."
 *
 * Everything above looks at ONE event in isolation. A timeline game asks "did
 * this come before that?", so the defects that hurt most live at deck level,
 * and the gate now checks them too (doc/DECK_VALIDATION.md has the argument,
 * the corpus counts and the thresholds for each):
 *
 *   * id integrity (error) — the id is a narration filename
 *     (`decks/<id>/narration/<event-id>.mp3`) and the key for every lookup, so
 *     it must be a unique, safe slug.
 *   * filter contract (error) — a field-based filter matches by equality, so an
 *     event carrying a value the filter never declared vanishes from every
 *     option of that filter, silently. An option matching no event at all is a
 *     chip that returns nothing (warning).
 *   * declared ranges (warning) — a filter option may declare `min`/`max`, so a
 *     deck states its own era boundaries as DATA. An event dated outside the
 *     range its own label declares is reported: resolving it means deciding
 *     which side is wrong, which is an editorial call, not a lint fix.
 *   * ordering determinacy (reported, never failed) — two events sharing a sort
 *     key are BOTH accepted in either order (`correctIndexRange` returns an
 *     inclusive range), so a tie is not a scoring bug; it is a pair that
 *     measures nothing about ordering, which is worth knowing.
 *   * relative-order cues (warning) — the year rule stops an ABSOLUTE leak;
 *     this catches the relative one ("after the printing press"). Reported
 *     because a relative cue is also legitimate scaffolding.
 *   * readability + coverage (reported, counted nowhere) — Flesch–Kincaid on
 *     title+fact against each age band's ceiling, and the year span, densest
 *     century and continent/category mix. Representativeness is measured rather
 *     than asserted, and a coverage number that counted as a warning would
 *     train everyone to ignore the warnings.
 *
 * Run:  node scripts/validate-content.mjs
 * Exit code 1 on any failure (wire into CI / pre-commit).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename, relative, sep } from "node:path";
import { loadDeck } from "../tools/content-pipeline/lib/load.mjs";
import { fleschKincaidGrade } from "../tools/content-pipeline/lib/rules.mjs";

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
// Reports and measurements: printed, counted nowhere. A coverage number that
// incremented the warning count would train everyone to ignore the warnings.
const info = (msg) => console.log(`  · ${msg}`);

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

  // Connections reference other events by id, so the full id set is needed first.
  const eventIds = new Set(deck.events.map((e) => e.id).filter(Boolean));
  const eventById = new Map(
    deck.events.filter((e) => e.id).map((e) => [e.id, e])
  );
  // The chronological key a consumer sorts by (mirrors sortYearOf in
  // timeline.js / connections.js). `null` means "cannot be known".
  const sortYearOf = (e) =>
    typeof e.sortYear === "number" ? e.sortYear : (e.year == null ? null : e.year);
  const connTypeCounts = {}; // per-deck type histogram, for the balance check below

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

    // CONNECTIONS — see doc/CONNECTIONS.md for the edge model and the filter rule.
    // Integrity is an error; coverage is a warning. Edges are directed earlier->later
    // and stored on the EARLIER event only; the reverse index is derived at load time,
    // so a missing back-edge is not a defect.
    // One axis only — causal STRENGTH — plus `echo` for the non-causal parallel.
    // (The pilot's `cause|enabling|influence|theme` mixed "how strong" with "what
    // kind", so `enabling` took 69% and the label carried no information. See
    // doc/CONNECTIONS.md §3.) `via` is an optional SECOND axis — the mechanism —
    // never the type.
    const CONN_TYPES = new Set(["necessary", "contributing", "trigger", "echo"]);
    const CONN_VIA = new Set(["idea", "material"]);
    if (ev.connections != null) {
      if (!Array.isArray(ev.connections)) {
        err(deck.id, id, "connections must be an array");
      } else {
        const seen = new Set();
        for (const [ci, c] of ev.connections.entries()) {
          const at = `connections[${ci}]`;
          if (!c || typeof c !== "object") {
            err(deck.id, id, `${at} must be an object`);
            continue;
          }
          if (typeof c.rationale !== "string" || c.rationale.trim().length < 20) {
            err(
              deck.id,
              id,
              `${at} needs a rationale — an unlabelled link teaches nothing (min 20 chars)`
            );
          }
          if (!CONN_TYPES.has(c.type)) {
            err(
              deck.id,
              id,
              `${at}.type "${c.type}" is not one of ${[...CONN_TYPES].join(" | ")}`
            );
          }
          if (!eventIds.has(c.to)) {
            err(deck.id, id, `${at}.to "${c.to}" is not an event in this deck`);
          }
          if (c.to === id) {
            err(deck.id, id, `${at} links the event to itself`);
          }
          // RULE — edges are directed earlier -> later and stored on the
          // EARLIER event (doc/CONNECTIONS.md §2). This was asserted in the
          // comment above but never checked, and two shipped edges violated it.
          // A consumer (connections.js) renders a direction-sensitive phrase,
          // so a backwards edge produces a sentence that is simply false.
          const target = eventById.get(c.to);
          const fromYear = sortYearOf(ev);
          const toYear = target ? sortYearOf(target) : null;
          if (fromYear !== null && toYear !== null && toYear < fromYear) {
            err(
              deck.id,
              id,
              `${at} points to "${c.to}" (${toYear}), which is EARLIER than this event (${fromYear}) — store the edge on the earlier event (doc/CONNECTIONS.md §2)`
            );
          }
          if (c.to && seen.has(c.to)) {
            err(deck.id, id, `${at} duplicates a link to "${c.to}"`);
          }
          seen.add(c.to);
          if (c.contested != null && typeof c.contested !== "boolean") {
            err(deck.id, id, `${at}.contested must be a boolean`);
          }
          if (c.via != null && !CONN_VIA.has(c.via)) {
            err(deck.id, id, `${at}.via "${c.via}" is not one of ${[...CONN_VIA].join(" | ")}`);
          }
          if (CONN_TYPES.has(c.type)) {
            connTypeCounts[c.type] = (connTypeCounts[c.type] || 0) + 1;
          }
        }
      }
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

  // ------------------------------------------------------------------
  // Deck integrity, ordering determinacy, and coverage.
  // ------------------------------------------------------------------
  // These rules exist because the ones above only ever looked at ONE event in
  // isolation. A timeline game is scored on relations BETWEEN events, so the
  // defects that matter most live at deck level. Each rule below is traceable
  // to something, not to taste; doc/DECK_VALIDATION.md carries the full
  // argument, the corpus counts and the thresholds.
  //
  //   * The scoring rule is "one placement, one correct answer" — the
  //     item-quality literature's "one correct" rule
  //     (Haladyna et al. 2002, k=91 studies, via
  //     doc/references/mcg_research_synthesis.md §12). Where the game already
  //     accepts both orders (timeline.js `correctIndexRange` returns an
  //     inclusive range), a tie is NOT a defect and is reported as a count.
  //     Where a filter cannot match a value, the event silently disappears from
  //     a view every player can reach — that IS a defect.
  //   * Representativeness is measured, never asserted (history-education
  //     literature: Wilkening 2026 HERJ; Zurné 2026 Cogitatio; History
  //     Workshop 2015). A deck is allowed to be narrow; it is not allowed to be
  //     narrow without anyone having looked.
  //   * Readability is reported per band using the SAME Flesch–Kincaid
  //     implementation the content pipeline grades `summary` with, imported
  //     above — two grade-level implementations in one repo would drift, and a
  //     drifting readability number is worse than none.

  const events = deck.events;

  // -- id integrity ------------------------------------------------------
  // The id is not cosmetic: narration clips are shipped as
  // `decks/<id>/narration/<event-id>.mp3` and the fact sheet links by it, so an
  // id carrying a slash or a space breaks an asset path, and a duplicate id
  // makes every id lookup (review scheduler, connections, stats) ambiguous.
  const idCounts = new Map();
  for (const ev of events) {
    const raw = typeof ev.id === "string" ? ev.id : "";
    if (!raw) {
      err(deck.id, "(deck)", "an event has no id — every lookup keys on it");
      continue;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(raw)) {
      err(
        deck.id,
        raw,
        `id is not a safe slug (lowercase letters, digits, "-") — it becomes narration/<id>.mp3 and a lookup key`
      );
    }
    idCounts.set(raw, (idCounts.get(raw) || 0) + 1);
  }
  for (const [id, n] of idCounts) {
    if (n > 1) err(deck.id, id, `id appears ${n} times — every id lookup is ambiguous`);
  }

  // -- filters: declared values are the contract -------------------------
  // A field-based filter matches by equality (`get: { field: "era" }`), so an
  // event carrying a value the filter never declared is excluded from EVERY
  // option of that filter and no error is ever raised. This is the one defect
  // class a player hits as "the filter is missing an event".
  for (const f of deck.filters || []) {
    if (!f || !f.get || !f.get.field || !Array.isArray(f.options)) continue;
    const field = f.get.field;
    const declared = new Map(f.options.map((o) => [String(o.value), o]));
    const used = new Map();
    for (const ev of events) {
      const v = ev[field];
      if (v == null || v === "") continue;
      const key = String(v);
      (used.get(key) || used.set(key, []).get(key)).push(ev.id);
      if (!declared.has(key)) {
        err(
          deck.id,
          ev.id,
          `${field} "${key}" is not one of the ${f.options.length} options the "${f.id}" filter declares — this event is excluded from that filter entirely`
        );
      }
    }
    for (const [value, ids] of used) {
      if (!declared.has(value)) continue;
      const opt = declared.get(value);
      // Declared ranges (min/max, seconds omitted = open) let the deck state
      // its own era boundaries as data instead of leaving a gate to parse them
      // back out of the human label.
      if (typeof opt.min === "number" || typeof opt.max === "number") {
        const lo = typeof opt.min === "number" ? opt.min : -Infinity;
        const hi = typeof opt.max === "number" ? opt.max : Infinity;
        for (const id of ids) {
          const ev = eventById.get(id);
          const y = sortYearOf(ev);
          if (y === null || y < lo || y > hi) {
            warn(
              deck.id,
              id,
              `${field} "${value}" declares ${opt.min ?? "-∞"}..${opt.max ?? "+∞"} but this event is dated ${y} — the label and the year disagree`
            );
          }
        }
      }
    }
    for (const o of f.options) {
      if (!used.has(String(o.value))) {
        warn(
          deck.id,
          `(filter ${f.id})`,
          `option "${o.label || o.value}" matches no event in this deck — a chip that returns nothing`
        );
      }
    }
  }

  // -- ordering determinacy (reported, not failed) -----------------------
  const bySortKey = new Map();
  for (const ev of events) {
    const k = sortYearOf(ev);
    if (k === null) {
      warn(deck.id, ev.id, "no year and no sortYear — it cannot be ordered at all");
      continue;
    }
    (bySortKey.get(k) || bySortKey.set(k, []).get(k)).push(ev.id);
  }
  const tiedPairs = [...bySortKey.entries()].filter(([, ids]) => ids.length > 1);
  const tiedEvents = tiedPairs.reduce((n, [, ids]) => n + ids.length, 0);

  // -- order cues in narrated text (reported) -----------------------------
  // The year rule above stops an ABSOLUTE giveaway. This one catches the
  // RELATIVE one: "after the printing press", "decades later" — language that
  // answers the very question the round asks. It is a warning, never an error:
  // a relative cue is also legitimate scaffolding (and the younger bands get
  // no rationale prose at all), so the count is what a human needs, not a ban.
  const CUE_RE =
    /\b(after|before|later|earlier|eventually|subsequently|subsequent to|preceded|followed by|years later|decades later|centuries later|by the time|first|then)\b/i;
  // `first` and `then` are also titles and names ("First Consul"), so they are
  // only treated as cues in the prose fields; a bare relation word in a name is
  // not a leak, and a check that cries wolf on every Roman numeral teaches
  // everyone to skip the line.
  const NARROW_CUE_RE =
    /\b(after|before|later|earlier|eventually|subsequently|preceded|followed by|years later|decades later|centuries later|by the time)\b/i;
  const cueHits = [];
  for (const ev of events) {
    for (const f of ["fact", "who", "where", "why"]) {
      const v = ev[f];
      if (typeof v !== "string") continue;
      const re = f === "fact" || f === "why" ? CUE_RE : NARROW_CUE_RE;
      if (re.test(v)) cueHits.push(`${ev.id}.${f}`);
    }
  }
  if (cueHits.length) {
    warn(
      deck.id,
      `(deck)`,
      `${cueHits.length}/${events.length} events carry relative-order language in narrated text (${cueHits.slice(0, 8).join(", ")}${cueHits.length > 8 ? ", …" : ""}) — the year rule stops absolute leaks, this one is relative`
    );
  }

  // -- readability report (one line, no per-event flood) ------------------
  const grades = events
    .map((e) => fleschKincaidGrade(`${e.title}. ${e.fact || ""}`))
    .filter((g) => Number.isFinite(g))
    .sort((a, b) => a - b);
  if (grades.length) {
    const med = grades[Math.floor(grades.length / 2)];
    const over = (t) => grades.filter((g) => g > t).length;
    info(
      `${deck.id}: fact readability (Flesch–Kincaid, title+fact) median ${med.toFixed(1)}, p90 ${grades[Math.floor(grades.length * 0.9)].toFixed(1)} · over grade 3: ${over(3)}, over 6: ${over(6)}, over 9: ${over(9)}`
    );
  }

  // -- coverage report ---------------------------------------------------
  // The CALENDAR year, deliberately, not sortYear: cc-timeline's sortYear is a
  // curriculum index (-161..-1), so reporting "densest century -100s" from it
  // would be a true number about nothing.
  const ys = events.map((e) => e.year).filter((y) => typeof y === "number");
  const centuries = new Map();
  for (const y of ys) {
    const c = Math.floor(y / 100) * 100;
    centuries.set(c, (centuries.get(c) || 0) + 1);
  }
  const topCentury = [...centuries.entries()].sort((a, b) => b[1] - a[1])[0];
  const hist = (field) => {
    const m = new Map();
    for (const e of events) {
      const v = e[field];
      if (v == null || v === "") continue;
      m.set(String(v), (m.get(String(v)) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const show = (name, pairs) => {
    if (!pairs.length) return null;
    const total = pairs.reduce((n, [, c]) => n + c, 0);
    return `${name}: ${pairs.slice(0, 4).map(([v, c]) => `${v} ${c} (${Math.round((100 * c) / total)}%)`).join(", ")}`;
  };
  const clauses = [show("continent", hist("continent")), show("category", hist("category"))].filter(Boolean);
  info(
    `${deck.id}: coverage — ${events.length} events over ${ys.length ? `${Math.min(...ys)}..${Math.max(...ys)}` : "no dates"}` +
      (topCentury ? `, densest century ${topCentury[0]}s at ${topCentury[1]} events` : "") +
      (clauses.length ? ` · ${clauses.join(" · ")}` : "")
  );

  // -- map integrity ------------------------------------------------------
  for (const ev of events) {
    const hasCoords = typeof ev.lat === "number" && typeof ev.lng === "number";
    if (hasCoords && (Math.abs(ev.lat) > 90 || Math.abs(ev.lng) > 180)) {
      err(deck.id, ev.id, `coords (${ev.lat}, ${ev.lng}) are off the globe`);
    }
    if (ev.noMap && hasCoords) {
      warn(deck.id, ev.id, "noMap is set but lat/lng are present — one of the two is lying");
    }
    if (!ev.noMap && !hasCoords) {
      warn(deck.id, ev.id, "no noMap and no lat/lng — the map has nothing to point at");
    }
  }

  if (tiedEvents) {
    info(
      `${deck.id}: ${tiedPairs.length} sort-key tie(s) covering ${tiedEvents} event(s) — both orders are accepted there (correctIndexRange), so those pairs measure nothing about ordering`
    );
  }

  // Coverage, not correctness: an event may legitimately be a terminus.
  const linked = deck.events.filter((e) => (e.connections || []).length).length;
  if (linked === 0) {
    warn(
      deck.id,
      "(deck)",
      "no connections at all — see doc/CONNECTIONS.md; author edges before shipping a Connections mode"
    );
  }

  // Balance guard: one type dominating means the vocabulary is not
  // discriminating (the pilot's `enabling` at 69% was exactly this) — a single
  // label that fits almost everything teaches nothing. See doc/CONNECTIONS.md §3.
  const totalEdges = Object.values(connTypeCounts).reduce((a, b) => a + b, 0);
  for (const [t, n] of Object.entries(connTypeCounts)) {
    if (totalEdges && n / totalEdges > 0.5) {
      warn(
        deck.id,
        "(deck)",
        `connections: "${t}" is ${Math.round((100 * n) / totalEdges)}% of ${totalEdges} edges — a type that dominates the vocabulary teaches nothing (see doc/CONNECTIONS.md §3)`
      );
    }
  }
}

console.log("");
if (errors || deckErrors) {
  if (errors) {
    console.error(
      `✗ ${errors} event-level failure(s) against the fact-quality, deck-integrity and filter-contract rules` +
        (warns ? ` (${warns} warning(s)).` : ".")
    );
  }
  if (deckErrors) {
    console.error(`✗ ${deckErrors} deck/package problem(s).`);
  }
  process.exit(1);
}
console.log(
  `✓ All events pass the fact-quality and deck-integrity rules` +
    (warns ? ` (${warns} warning(s) — see the ⚠ lines above).` : ".")
);
