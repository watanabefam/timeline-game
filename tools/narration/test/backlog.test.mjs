// Tests for the generated pronunciation backlog.
//
// The file is generated (like decks/index.json) precisely so it cannot rot into
// a list that reads like a control while disagreeing with the decks. These
// tests therefore do not check the CONTENT — the generator derives that — they
// check the two things that make it a control rather than a note:
//
//   1. it is current (regenerating it changes nothing), and
//   2. its ratchet is honest (open <= ceiling, and deferred words are held
//      apart from open ones).
//
// Both fail if someone hand-edits the JSON, which is the point.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildBacklog, CEILING, renderBacklog } from "../../../scripts/gen-pronunciation-backlog.mjs";
import { DEFERRED, RECORDS, validDeferredKind } from "../lexicon-records.mjs";

const TARGET = join(dirname(fileURLToPath(import.meta.url)), "..", "pronunciation-backlog.json");
const committed = readFileSync(TARGET, "utf8");
const parsed = JSON.parse(committed);

/** Built once: the audit loads a dictionary and is not cheap. */
let built;
test("the committed backlog is current, not hand-edited", async () => {
  built = await buildBacklog();
  assert.equal(
    renderBacklog(built),
    committed,
    "pronunciation-backlog.json is stale or hand-edited — run: npm run gen:backlog"
  );
});

test("the ceiling is held in code, so the generated file cannot raise it", () => {
  // The first version of this ratchet kept the ceiling IN the JSON, and
  // `--check` read it from disk — so editing the generated file raised the
  // ceiling and the check still passed. The constant lives in the generator
  // now, and this asserts the two agree: a hand-edited JSON fails here even
  // if someone also hand-edits the count.
  assert.equal(parsed.ceiling, CEILING, "ceiling in the file disagrees with the ceiling in code");
});

test("the open backlog is at or under its ceiling", () => {
  assert.equal(parsed.openCount, parsed.open.length, "openCount must match the rows");
  assert.ok(
    parsed.openCount <= parsed.ceiling,
    `the ratchet is broken: ${parsed.openCount} open words against a ceiling of ${parsed.ceiling}`
  );
  assert.equal(parsed.hash.length, 12, "the payload hash should identify the content");
});

test("no open word has already reached a terminal outcome", () => {
  // A word with a record is settled — the engine reads it right, a respelling
  // shipped, or it was investigated and deferred. Listing it as open would
  // send the next person to redo finished work, which is the exact failure
  // `worksheetRows` guards against in the worksheet.
  const settled = parsed.open.filter((o) => RECORDS.has(o.word));
  assert.deepEqual(
    settled.map((o) => `${o.word}/${o.deck}`),
    [],
    "words with records must not appear as open"
  );
});

test("every deferred word is listed, once, with a reason this project recognises", () => {
  const listed = new Set(parsed.deferred.map((d) => d.word));
  for (const [word, r] of RECORDS) {
    if (r.status !== DEFERRED) continue;
    assert.ok(listed.has(word), `"${word}" is deferred in the records but missing from the backlog`);
    listed.delete(word);
  }
  // Nothing listed that the records do not justify: the backlog is generated
  // from the records, so a stray entry means one of the two is wrong.
  assert.deepEqual([...listed], [], "the backlog defers a word the records do not");

  for (const d of parsed.deferred) {
    assert.ok(
      validDeferredKind(d.deferredKind),
      `"${d.word}" has deferredKind ${JSON.stringify(d.deferredKind)}`
    );
    assert.ok(d.deferredBecause, `"${d.word}" is listed as deferred with no reason`);
    assert.ok(d.decks.length > 0, `"${d.word}" is listed as deferred in no deck`);
  }
});

test("a word is listed at most once per deck", () => {
  const seen = new Set();
  for (const o of parsed.open) {
    const key = `${o.deck}/${o.word}`;
    assert.equal(seen.has(key), false, `"${key}" is listed twice`);
    seen.add(key);
  }
});

test("the per-deck counts add up to the open rows", () => {
  const total = Object.values(parsed.counts).reduce((a, b) => a + b, 0);
  assert.equal(total, parsed.open.length, "counts and rows disagree — the file is internally inconsistent");
});