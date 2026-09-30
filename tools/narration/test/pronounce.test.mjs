// Guard rails for the pronunciation QA system.
//
// The ear is the judge of whether a word is *correct*; the machine is the
// judge of whether our fix does what we intended. These tests freeze the
// second half so a kokoro-js upgrade cannot silently change every clip's
// pronunciation underneath us.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LEXICON, spokenText } from "../text.mjs";
import { RECORDS, FIXED } from "../lexicon-records.mjs";
import { audit, deadLexicon } from "../audit.mjs";
import { phonemizerAvailable, phonemesFor } from "../pronounce.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const hasPhonemizer = await phonemizerAvailable();
const skip = hasPhonemizer ? false : "phonemizer not installed (npm --prefix tools/narration install)";

const decks = readdirSync(join(REPO_ROOT, "decks"))
  .filter((name) => existsSync(join(REPO_ROOT, "decks", name, "deck.json")))
  .map((name) => ({ dir: name, deck: JSON.parse(readFileSync(join(REPO_ROOT, "decks", name, "deck.json"), "utf8")) }));

test("every LEXICON entry changes the phonemes it was meant to change", { skip }, async () => {
  assert.ok(LEXICON.size > 0, "the lexicon is empty — is the fix still needed?");
  for (const [word, respelling] of LEXICON) {
    const before = await phonemesFor(word);
    const after = await phonemesFor(respelling);
    assert.notEqual(after, before, `"${word}" → "${respelling}" sounds identical; the entry does nothing`);
  }
});

test("every fixed entry still produces its recorded phonemes", { skip }, async () => {
  // The un-fakeable gate. `phonemesFor` runs the SAME phonemizer the renderer
  // uses, so this is a computation rather than a claim: a proposed respelling
  // that does not land on the recorded sounds fails here. It is what caught
  // "thee-seez" before it shipped, and it is why a lookup or a model can
  // propose a pronunciation but never simply assert one.
  for (const [word, record] of RECORDS) {
    if (record.status !== FIXED) continue;
    const respelling = LEXICON.get(word);
    assert.ok(respelling, `a record fixes "${word}" but LEXICON has no entry for it`);
    const actual = await phonemesFor(respelling);
    assert.equal(actual, record.phoneme, `"${word}" → "${respelling}" no longer yields ${record.phoneme} (got ${actual}) — the engine changed under us; re-listen and re-pick`);
  }
});

test("no LEXICON entry is dead — every fix still applies to something we speak", () => {
  const dead = deadLexicon(audit());
  assert.deepEqual(dead, [], `stale lexicon entries (spoken by no deck): ${dead.join(", ")} — remove them or add the word`);
});

test("the audit raises no hard findings on any deck", () => {
  for (const r of audit()) {
    const hard = r.events.flatMap((e) => e.hard.map((h) => `${r.deck}/${e.id}: ${h}`));
    assert.deepEqual(hard, [], hard.join("\n"));
  }
});

test("names Kokoro is known to mangle are in a deck, and get heard", { skip }, async () => {
  // Places whose pronunciation is genuinely uncertain — the first names that
  // reached the lexicon. A deck edit that deletes the word invalidates the
  // expectation, which is the point: the list is maintained, not decorative.
  const KNOWN = new Map([["theses", "θˈiːsiːz"]]);
  for (const [word, expected] of KNOWN) {
    // Check the SOURCE text: the recipe respells the word away by design, so
    // the only place it can still be found is the deck content itself.
    const spokenSomewhere = decks.some(({ deck }) =>
      deck.events.some((ev) => new RegExp(`\\b${word}\\b`, "i").test(`${ev.title ?? ""} ${ev.fact ?? ""}`)),
    );
    assert.ok(spokenSomewhere, `no deck speaks "${word}" any more — retire the KNOWN entry`);
    const respelling = LEXICON.get(word) ?? word;
    assert.equal(await phonemesFor(respelling), expected, `"${word}" phonemes drifted`);
  }
});
