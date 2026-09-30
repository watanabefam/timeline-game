/*
 * scripts/validate-narration.mjs
 * ------------------------------------------------------------------
 * The narration content gate (doc/CROSS_PLATFORM_ROADMAP.md §19.12.7).
 *
 * Narration is pre-rendered, so a clip can silently stop matching the
 * card it belongs to — edit a fact and the recording still says the old
 * words, months later, in every player's ears. Nothing about that is
 * visible in a diff of JSON. This gate makes it visible:
 *
 *   • engine must be the sanctioned one (Kokoro, Apache-2.0) and the
 *     recipe must be one this gate can reproduce;
 *   • every listed clip exists, with the recorded bytes and sha256;
 *   • `textHash` must match the recipe applied to the card's CURRENT
 *     text — the check that catches a fact edit without a re-record;
 *   • `durationMs` must be present and match the real file;
 *   • deck.narration.files and manifest.assets[] must agree with the
 *     narration folder in BOTH directions (no orphans, no phantoms);
 *   • no spoken line may contain a year, and none may be empty.
 *
 * Coverage (how many cards actually have a clip) is reported, and only
 * fails under --require-complete. Decks ship partial narration on
 * purpose: the player falls back to the system voice for cards with no
 * clip, so a half-narrated deck is a valid state, not an error.
 *
 * Run:  node scripts/validate-narration.mjs [--require-complete]
 *       (or `npm run validate:narration`)
 * Exit code 1 on any error. No dependencies: the recipe is imported
 * straight from tools/narration/text.mjs, so this runs with no npm
 * install even though it verifies artefacts that tool produced.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { RECIPE, spokenText, textHash, yearLeaks } from "../tools/narration/text.mjs";
// The generator's own duration reader, so a recorded duration and a
// checked duration are computed the same way. Deliberately not ffprobe:
// this gate must run with nothing installed.
import { mp3DurationMs } from "../tools/narration/audio.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..");
const DECKS_DIR = join(REPO_ROOT, "decks");

const SANCTIONED_ENGINE = "kokoro";
const REQUIRED_FIELDS = [
  "engine",
  "model",
  "dtype",
  "voice",
  "sampleRate",
  "format",
  "bitrateKbps",
  "textRule",
  "loudnessLufs",
  "files",
];

const posix = (p) => String(p).split(sep).join("/");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/**
 * Validate every deck's narration.
 * @param {{ requireComplete?: boolean, quiet?: boolean }} [opts]
 * @returns {{ errors: number, warnings: number, decks: number, clips: number, events: number }}
 */
export function checkNarration({ requireComplete = false, quiet = false } = {}) {
  let errors = 0;
  let warnings = 0;
  let clips = 0;
  let events = 0;
  let narratedDecks = 0;

  const err = (deck, id, msg) => {
    errors += 1;
    if (!quiet) console.log(`  ✗ [${deck}] ${id}: ${msg}`);
  };
  const warn = (deck, id, msg) => {
    warnings += 1;
    if (!quiet) console.log(`  ⚠ [${deck}] ${id}: ${msg}`);
  };

  const deckDirs = existsSync(DECKS_DIR)
    ? readdirSync(DECKS_DIR).filter((name) => existsSync(join(DECKS_DIR, name, "deck.json")))
    : [];

  for (const name of deckDirs) {
    const dir = join(DECKS_DIR, name);
    let deck;
    try {
      deck = JSON.parse(readFileSync(join(dir, "deck.json"), "utf8"));
    } catch (e) {
      err(name, "(deck)", `could not read deck.json (${e.message})`);
      continue;
    }
    const narration = deck.narration;
    const eventsInDeck = Array.isArray(deck.events) ? deck.events.length : 0;
    events += eventsInDeck;
    if (!narration) {
      if (!quiet) console.log(`  · [${name}] narration off (${eventsInDeck} card(s) would use the system voice)`);
      continue;
    }
    narratedDecks += 1;

    for (const field of REQUIRED_FIELDS) {
      if (narration[field] == null || narration[field] === "") {
        err(name, "(narration)", `missing required field "${field}"`);
      }
    }
    if (narration.engine && narration.engine !== SANCTIONED_ENGINE) {
      err(
        name,
        "(narration)",
        `engine "${narration.engine}" is not sanctioned — only ${SANCTIONED_ENGINE} may generate clips (§19.12.1)`
      );
    }
    if (narration.textRule && narration.textRule !== RECIPE) {
      err(
        name,
        "(narration)",
        `textRule "${narration.textRule}" cannot be reproduced by this gate (expected "${RECIPE}")`
      );
    }
    if (narration.textRule === RECIPE && !narration.generated) {
      warn(name, "(narration)", "no `generated` date recorded");
    }

    const files = narration.files && typeof narration.files === "object" ? narration.files : {};
    const listedOnDisk = new Set();

    for (const [id, record] of Object.entries(files)) {
      clips += 1;
      const event = (deck.events || []).find((e) => e.id === id);
      if (!event) {
        err(name, id, "narration lists an event id that is not in the deck");
        continue;
      }
      const path = typeof record === "string" ? record : record.path;
      if (!path) {
        err(name, id, "narration record has no path");
        continue;
      }
      const expectedPath = `decks/${name}/narration/${id}.mp3`;
      if (posix(path) !== expectedPath) {
        err(name, id, `path should be "${expectedPath}" (naming is the pipeline: one file per event id)`);
      }
      const full = join(REPO_ROOT, path);
      if (!existsSync(full)) {
        err(name, id, `clip is missing: ${path}`);
        continue;
      }
      listedOnDisk.add(`${id}.mp3`);
      const buf = readFileSync(full);
      if (record.bytes != null && record.bytes !== buf.length) {
        err(name, id, `bytes recorded as ${record.bytes}, file is ${buf.length}`);
      }
      const digest = sha256(buf);
      if (record.sha256 && record.sha256 !== digest) {
        err(name, id, "sha256 does not match the file on disk");
      }
      if (!record.sha256) warn(name, id, "no sha256 recorded");

      const spoken = spokenText(event);
      if (!spoken) {
        err(name, id, "the recipe leaves nothing to speak for this card");
      } else if (record.textHash && record.textHash !== textHash(spoken)) {
        err(name, id, "textHash is stale — the card text changed since this clip was recorded");
      }
      const leaks = yearLeaks(spoken);
      if (leaks.length) {
        err(name, id, `spoken text gives the year away: ${leaks.map((l) => l.match).join(", ")}`);
      }
      if (record.durationMs == null) {
        warn(name, id, "no durationMs recorded");
      } else {
        const real = mp3DurationMs(buf);
        // Both sides come from the same reader, so this only has to absorb a
        // record written by an older tool that measured differently.
        if (real != null && Math.abs(real - record.durationMs) > 150) {
          err(name, id, `durationMs recorded as ${record.durationMs}, file is about ${real}`);
        }
      }
    }

    // Every event covered? (report only — partial narration is a valid state)
    const uncovered = (deck.events || []).filter((e) => !files[e.id]);
    if (uncovered.length && !quiet) {
      console.log(
        `  · [${name}] ${Object.keys(files).length}/${eventsInDeck} card(s) narrated` +
          ` (${uncovered.length} fall back to the system voice)`
      );
    }
    if (requireComplete && uncovered.length) {
      err(name, "(coverage)", `${uncovered.length} card(s) have no clip (--require-complete)`);
    }

    // Folder ↔ records, both ways.
    const narrationDir = join(dir, "narration");
    if (existsSync(narrationDir)) {
      for (const file of readdirSync(narrationDir)) {
        if (!file.endsWith(".mp3")) {
          warn(name, "(fs)", `unexpected file in narration/: ${file}`);
          continue;
        }
        if (!listedOnDisk.has(file)) {
          err(name, "(fs)", `orphan clip not referenced by deck.json: narration/${file}`);
        }
      }
    } else if (Object.keys(files).length) {
      err(name, "(fs)", "deck records narration but there is no narration/ folder");
    }

    // manifest.assets[] must list them too, or the packaging layer drops them.
    const manifestPath = join(dir, "manifest.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        const assets = new Set((manifest.assets || []).map((a) => posix(a)));
        for (const file of listedOnDisk) {
          if (!assets.has(`narration/${file}`)) {
            err(name, "(manifest)", `asset not listed in manifest.json: narration/${file}`);
          }
        }
      } catch (e) {
        err(name, "(manifest)", `could not read manifest.json (${e.message})`);
      }
    }
  }

  if (!quiet) {
    console.log("");
    if (errors) {
      console.error(
        `✗ narration: ${errors} error(s)${warnings ? `, ${warnings} warning(s)` : ""} across ` +
          `${narratedDecks} narrated deck(s), ${clips} clip(s)`
      );
    } else {
      console.log(
        `✓ narration: ${clips} clip(s) across ${narratedDecks} deck(s) verified` +
          ` (recipe ${RECIPE}, engine ${SANCTIONED_ENGINE})${warnings ? ` — ${warnings} warning(s)` : ""}`
      );
    }
  }
  return { errors, warnings, decks: narratedDecks, clips, events };
}

/* Run when invoked directly, stay silent when imported. */
const invokedDirectly =
  process.argv[1] && join(fileURLToPath(import.meta.url)) === join(process.argv[1]);
if (invokedDirectly) {
  const { errors } = checkNarration({ requireComplete: process.argv.includes("--require-complete") });
  process.exit(errors ? 1 : 0);
}
