// Tests for the reference layer and its optional second reference.
//
// The WikiPron cases here are mostly NEGATIVE tests, and that is the point.
// An earlier version compared CMUdict against WikiPron phone-by-phone and
// demoted "agrees" to "disagrees" on a mismatch. It looked like it worked —
// it does catch "qin" — but measured against real words it also reported
// "world", "empire", "napoleon" and "athens" as contested, because ARPAbet
// writes an r-coloured vowel as one phone (ER) where IPA writes two (ɜ ɹ), so
// the sequences were never index-aligned. The regression tests below pin
// those four so the temptation to re-add the comparison has to be paid for.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AGREES,
  DISAGREES,
  classify,
  referenceAvailable,
  tidyIpaReading,
} from "../reference.mjs";
import { WIKIPRON_TSV, wikipronAvailable, wikipronForms } from "../wikipron.mjs";

const hasReference = await referenceAvailable();
const skip = hasReference ? false : "reference layer unavailable (npm --prefix tools/narration install)";
const hasWikipron = wikipronAvailable();
const skipWp = hasWikipron ? false : `WikiPron not fetched (npm run narration:wikipro; looked in ${WIKIPRON_TSV})`;

/* ------------------------------------------------------------- no WikiPron */

test("the second reference is optional: absent data yields no reading, not an error", async () => {
  // This is the state a fresh clone is in, and it is the one that must not
  // break. Every consumer has to work with the file simply missing.
  if (hasWikipron) {
    assert.ok(WIKIPRON_TSV.endsWith("eng.tsv"));
    return; // data is present here; the missing-file path is covered below
  }
  assert.deepEqual(await wikipronForms("world"), []);
  assert.deepEqual(await wikipronForms(""), []);
  assert.deepEqual(await wikipronForms(undefined), []);
});

test("wikipronForms lowercases its lookup, so a capitalised name still resolves", { skip: skipWp }, async () => {
  const lower = await wikipronForms("constantinople");
  assert.ok(lower.length, "expected a reading for a common place name");
  assert.deepEqual(await wikipronForms("Constantinople"), lower);
  assert.deepEqual(await wikipronForms("CONSTANTINOPLE"), lower);
});

test("wikipronForms returns nothing for a word the corpus has never heard of", { skip: skipWp }, async () => {
  assert.deepEqual(await wikipronForms("qqqzzzxxwv"), []);
});

/* ------------------------------------------------------- the demotion trap */

test("REGRESSION: a second reference must not demote common words", { skip: skip || skipWp }, async () => {
  // Each of these was reported "contested" by the positional comparison. All
  // four are ordinary English and the engine is right about every one.
  for (const word of ["world", "empire", "napoleon", "athens"]) {
    const r = await classify(word);
    assert.notEqual(
      r.tier,
      DISAGREES,
      `"${word}" was wrongly demoted to disagrees; a WikiPron disagreement is advice, not a verdict`,
    );
  }
});

test("REGRESSION: the second reading is attached without moving the tier", { skip: skip || skipWp }, async () => {
  const r = await classify("qin");
  // "qin" is the motivating case: CMUdict has it as a spelling variant of
  // "kin" (K IH1 N), so engine and dictionary agree and the tier is AGREES.
  // WikiPron's t͡ʃ ɪ n is what makes the problem visible to a human.
  assert.equal(r.tier, AGREES, "the demotion was supposed to be removed, not merely softened");
  assert.ok(r.second, "expected a second reading to be attached for the human to weigh");
  assert.match(r.second, /ʃ/);
});

test("the second reading is omitted, not empty, when the source has no entry", { skip: skip || skipWp }, async () => {
  const r = await classify("qqqzzzxxwv");
  assert.equal(r.second, undefined);
});

/* ---------------------------------------------------------- what it can do */

test("tidyIpaReading normalises spacing and leaves phonetic marks intact", () => {
  // Tie bars, length marks and syllabic diacritics are real information and
  // must survive; only the ragged TSV spacing is cleaned up.
  assert.equal(tidyIpaReading("  b   æ s t ɪ l "), "b æ s t ɪ l");
  assert.equal(tidyIpaReading("t͡ʃ ɪ n"), "t͡ʃ ɪ n");
  assert.equal(tidyIpaReading("f ɪ l ə s ɑ f ɪ k l̩"), "f ɪ l ə s ɑ f ɪ k l̩");
  assert.equal(tidyIpaReading(""), "");
  assert.equal(tidyIpaReading(null), "");
});
