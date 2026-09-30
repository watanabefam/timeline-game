// Tests for the generated sourcing backlog.
//
// The file exists because `npm run validate` was permanently red: the content
// gate raised 80 SOURCE_MISSING errors, one per event in the two decks without
// a `"grandfathered": true` flag, while the other 201 findings came out as
// warnings. Removing `validate:pipeline` from the chain made the strict gates
// readable again; this file is what keeps the excluded gap visible and bounded.
//
// These tests do not re-derive the sourcing state — the generator does that.
// They check the two properties that make it a control rather than a note: it
// is CURRENT (regenerating changes nothing), and its ratchet is HONEST (the
// ceiling is held in code, and the grandfathering never hides a count).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSourcingBacklog,
  CEILING,
  renderSourcingBacklog,
} from "../../../scripts/gen-sourcing-backlog.mjs";

const TARGET = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "content", "sourcing-backlog.json");
const committed = readFileSync(TARGET, "utf8");
const parsed = JSON.parse(committed);

/** Built once: this walks every deck and runs the full rule set. */
let built;
test("the committed sourcing backlog is current, not hand-edited", () => {
  built = buildSourcingBacklog();
  assert.equal(
    renderSourcingBacklog(built),
    committed,
    "content/sourcing-backlog.json is stale or hand-edited — run: npm run gen:sourcing"
  );
});

test("the ceiling is held in code, so the generated file cannot raise it", () => {
  // Keeping the ceiling in the JSON made the ratchet bypassable — `--check`
  // read it from disk, so a hand-edit raised it and the check still passed.
  // The constant lives in the generator, and this pins the two together.
  assert.equal(parsed.ceiling, CEILING, "ceiling in the file disagrees with the ceiling in code");
});

test("the unsourced count is at or under its ceiling", () => {
  assert.equal(
    parsed.unsourcedEvents,
    parsed.totalEvents - parsed.sourcedEvents,
    "sourced and unsourced do not add up to the event count"
  );
  assert.ok(
    parsed.unsourcedEvents <= parsed.ceiling,
    `the ratchet is broken: ${parsed.unsourcedEvents} unsourced events against a ceiling of ${parsed.ceiling}`
  );
});

test("the per-deck rows add up to the totals, and every event is accounted for", () => {
  const events = parsed.decks.reduce((n, d) => n + d.events, 0);
  const unsourced = parsed.decks.reduce((n, d) => n + d.unsourced, 0);
  const sourced = parsed.decks.reduce((n, d) => n + d.sourced, 0);
  assert.equal(events, parsed.totalEvents, "deck event counts do not sum to the total");
  assert.equal(unsourced, parsed.unsourcedEvents, "deck unsourced counts do not sum to the total");
  assert.equal(sourced, parsed.sourcedEvents, "deck sourced counts do not sum to the total");
  for (const d of parsed.decks) {
    assert.equal(d.sourced + d.unsourced, d.events, `${d.id}: sourced + unsourced != events`);
  }
});

test("a grandfathered deck is listed visibly, and never counted as sourced", () => {
  // The whole point of this file: the flag downgrades the finding's SEVERITY,
  // which is a decision about the gate, not about the content. The count must
  // not follow the severity, or the exemption would hide the gap it exempts.
  const flagged = parsed.decks.filter((d) => d.grandfathered).map((d) => d.id);
  assert.deepEqual(
    flagged.slice().sort(),
    parsed.grandfatheredDecks.slice().sort(),
    "the grandfathered list disagrees with the per-deck flags"
  );
  // The grandfathered decks are the ones whose SOURCE_MISSING findings arrive as
  // warnings — so if they ever reported 0 unsourced events, the severity has
  // leaked into the count.
  assert.ok(
    parsed.grandfatheredDecks.every((id) => parsed.decks.find((d) => d.id === id).unsourced > 0),
    "a grandfathered deck is reported as fully sourced — the exemption has hidden a count"
  );
});

test("every deck in the index appears exactly once", () => {
  const ids = parsed.decks.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, "a deck is listed twice");
  const indexed = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "decks", "index.json"), "utf8")
  );
  const expected = (Array.isArray(indexed) ? indexed : indexed.decks || []).map((e) => e.dir || e.file || e.id);
  for (const id of expected) {
    assert.ok(ids.includes(id), `deck "${id}" is in the index but not in the sourcing backlog`);
  }
});
