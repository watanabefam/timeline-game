/*
 * tools/narration/test/recipe.test.mjs
 * ------------------------------------------------------------------
 * The spoken-text recipe is the one thing here that can silently leak
 * the answer to players, so it is pinned two ways: adversarial fixtures,
 * and invariants over the whole real corpus. Run with `npm test`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RECIPE,
  contentKey,
  spokenText,
  stripYearSpans,
  textHash,
  yearLeaks,
} from "../text.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Every folder deck in the repo, as { dir, deck }. */
function loadDecks() {
  const decksDir = join(REPO_ROOT, "decks");
  return readdirSync(decksDir)
    .filter((name) => existsSync(join(decksDir, name, "deck.json")))
    .map((name) => ({
      dir: name,
      deck: JSON.parse(readFileSync(join(decksDir, name, "deck.json"), "utf8")),
    }));
}

/* ------------------------------------------------------------ fixtures */

test("removes the date and repairs the sentence around it", () => {
  assert.equal(
    stripYearSpans("Built in c. 2348 BC by the Nile."),
    "Built by the Nile."
  );
  assert.equal(
    stripYearSpans("The city fell in 1826 after a long siege."),
    "The city fell after a long siege."
  );
  assert.equal(
    stripYearSpans("Rome absorbs Greece in 146 BC, adopting much of its culture."),
    "Rome absorbs Greece, adopting much of its culture."
  );
  assert.equal(
    stripYearSpans("Legend says twin brothers founded Rome in 753 BC."),
    "Legend says twin brothers founded Rome."
  );
});

test("keeps a number that is not a year", () => {
  const keep = [
    "Built the pyramids and a 3,000-year civilization along the Nile.",
    "Built over roughly 2,300 years, from the Great Pyramid to the Lighthouse.",
    "Terrorist attacks on the U.S. kill ~3,000 and reshape global policy.",
    "Luther's 95 Theses split Western Christianity.",
    "Apollo 11 Lands on the Moon",
    "Sputnik 1 Launched",
    "A standoff between the USA and USSR short of direct war.",
    "Leif likely reached North America ~500 years before Columbus.",
    "Moses leads Israel out of Egypt and through 40 years in the wilderness.",
  ];
  for (const text of keep) {
    assert.equal(stripYearSpans(text), text, `should have been left alone: ${text}`);
  }
});

test("a card with no year in it is spoken exactly as written", () => {
  // No re-punctuation and no re-capitalisation: mixed-case product names,
  // curly quotes and em dashes all survive untouched.
  const cases = [
    "iPhone Launched",
    "More\u2019s fictional island features universal education \u2014 coined the word \u201cutopia.\u201d",
    "Catch-22 (Heller)",
  ];
  for (const text of cases) assert.equal(stripYearSpans(text), text);
});

test("strips decades, ranges, parentheticals and centuries", () => {
  assert.equal(stripYearSpans("A 19th-c. revival stressing personal faith."), "A revival stressing personal faith.");
  assert.equal(stripYearSpans("Settlers pushed the frontier to the Pacific through the 1800s."), "Settlers pushed the frontier to the Pacific.");
  assert.equal(stripYearSpans("Key civil-rights laws in the 1950s\u201360s."), "Key civil-rights laws.");
  assert.equal(stripYearSpans("A long war (431\u2013404 BC) in which Athens lost to Sparta."), "A long war in which Athens lost to Sparta.");
  assert.equal(stripYearSpans("The Edict of Milan (313) ended persecution of Christians."), "The Edict of Milan ended persecution of Christians.");
  assert.equal(stripYearSpans("A peak of Muslim science (8th\u201313th c.)."), "A peak of Muslim science.");
  assert.equal(stripYearSpans("A lifetime in 6th-century Scandinavia."), "A lifetime in Scandinavia.");
});

test("a date phrase keeps its preposition when the phrase continues", () => {
  // The preposition belongs to what follows the date, so only the date goes.
  assert.equal(
    stripYearSpans("On the eve of the 1832 Reform Bill, personal failure meets politics."),
    "On the eve of the Reform Bill, personal failure meets politics."
  );
  assert.equal(
    stripYearSpans("Resists missionaries until his world collapses in 1890s Nigeria."),
    "Resists missionaries until his world collapses in Nigeria."
  );
});

test("titles that ARE the year are dropped, so the fact speaks alone", () => {
  assert.equal(stripYearSpans("The War of 1812"), "");
  assert.equal(stripYearSpans("1984 (Orwell)"), "");
  assert.equal(stripYearSpans("September 11, 2001"), "September 11.");
  // …while a short title with no year is kept as the deck wrote it
  assert.equal(stripYearSpans("Kush"), "Kush");
  assert.equal(stripYearSpans("Punic Wars"), "Punic Wars");
  assert.equal(
    spokenText({ title: "The War of 1812", fact: "The U.S. and Britain fight to a draw." }),
    "The U.S. and Britain fight to a draw."
  );
});

test("yearLeaks finds what the strip is meant to remove", () => {
  assert.ok(yearLeaks("The battle of 1066 changed England.").length > 0);
  assert.ok(yearLeaks("Completed c. 516 BC.").length > 0);
  assert.ok(yearLeaks("A 19th-c. revival.").length > 0);
  assert.deepEqual(yearLeaks("A 3,000-year civilization."), []);
  assert.deepEqual(yearLeaks("Apollo 11 lands."), []);
});

test("hashing is stable and the content key tracks every audio-changing input", () => {
  assert.equal(textHash("hello"), textHash("hello"));
  assert.notEqual(textHash("hello"), textHash("hello."));
  assert.equal(RECIPE, "strip-years-v2");

  const base = { text: "A card.", voice: "af_heart", model: "m", dtype: "q8", format: "mp3", bitrateKbps: 64, sampleRate: 24000 };
  assert.equal(contentKey(base), contentKey({ ...base }));
  for (const field of ["text", "voice", "model", "dtype", "format", "bitrateKbps", "sampleRate"]) {
    assert.notEqual(contentKey(base), contentKey({ ...base, [field]: "changed" }), `${field} must change the key`);
  }
});

/* --------------------------------------------------------- corpus rules */

const decks = loadDecks();

test("no card anywhere can speak a year", () => {
  const offenders = [];
  for (const { dir, deck } of decks) {
    for (const event of deck.events) {
      const spoken = spokenText(event);
      const leaks = yearLeaks(spoken);
      if (leaks.length) offenders.push(`${dir}/${event.id}: ${JSON.stringify(leaks)}`);
      assert.ok(spoken.length > 0, `${dir}/${event.id} speaks nothing at all`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("no spoken line ends on a dangling function word or stray punctuation", () => {
  const dangling =
    /\b(?:in|on|at|by|of|from|to|since|until|during|after|before|around|about|near|the|a|an|and|but|or|with|as|for)\s*[.!?]$|[,;:]\s*[.!?]$|[.]{2,}|\s+[.!?,;:]/i;
  const offenders = [];
  for (const { dir, deck } of decks) {
    for (const event of deck.events) {
      const spoken = spokenText(event);
      if (dangling.test(spoken)) offenders.push(`${dir}/${event.id}: ${spoken}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("every card is spoken in one Kokoro pass (no chunk seams)", () => {
  // The model caps a pass at 510 tokens; the corpus' longest line is far
  // under it, so clips never stitch mid-sentence.
  for (const { dir, deck } of decks) {
    for (const event of deck.events) {
      const spoken = spokenText(event);
      assert.ok(spoken.length <= 510, `${dir}/${event.id} is ${spoken.length} chars`);
    }
  }
});

test("the shipped clips' recorded textHash still matches the recipe", () => {
  // No shipped fact contains a digit, so v2 must reproduce v1's hash for
  // them exactly — that is what makes the recipe upgrade free of any
  // re-recording. If this ever fails, those clips need regenerating.
  let checked = 0;
  for (const { dir, deck } of decks) {
    if (!deck.narration || !deck.narration.files) continue;
    for (const [id, record] of Object.entries(deck.narration.files)) {
      const event = deck.events.find((e) => e.id === id);
      assert.ok(event, `${dir}: narration lists an unknown event ${id}`);
      assert.equal(textHash(spokenText(event)), record.textHash, `${dir}/${id} needs regeneration`);
      checked += 1;
    }
  }
  assert.ok(checked >= 10, `expected the shipped clips to be checked, saw ${checked}`);
});
