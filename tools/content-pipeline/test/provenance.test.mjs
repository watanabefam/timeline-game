import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sha256, eventContentHash, buildProvenance } from "../lib/provenance.mjs";

describe("provenance", () => {
  test("sha256 is prefixed and stable", () => {
    assert.match(sha256("hello"), /^sha256:[0-9a-f]{64}$/);
    assert.equal(sha256("hello"), sha256("hello"));
    assert.notEqual(sha256("a"), sha256("b"));
  });

  test("content hash changes when content changes", () => {
    const a = eventContentHash({ id: "e", fact: "one" });
    const b = eventContentHash({ id: "e", fact: "two" });
    assert.notEqual(a, b);
  });

  test("builds a record with per-event hashes and review status", () => {
    const deck = {
      id: "d",
      events: [{ id: "e1", fact: "f", source: { url: "u", license: "MIT", revision: "7" } }],
    };
    const findings = [{ rule: "YEAR_LEAK", severity: "warning", event: "e1" }];
    const rec = buildProvenance(deck, {
      sources: { e1: "the source text" },
      findings,
      deckRevision: 3,
      generatedAt: "2026-09-13T00:00:00.000Z",
    });
    assert.equal(rec.deck, "d");
    assert.equal(rec.deckRevision, 3);
    assert.equal(rec.events.length, 1);
    assert.match(rec.events[0].contentHash, /^sha256:/);
    assert.match(rec.events[0].sourceHash, /^sha256:/);
    assert.equal(rec.events[0].review, "pending");
    assert.equal(rec.summary.warnings, 1);
  });

  test("an error blocks review", () => {
    const rec = buildProvenance(
      { id: "d", events: [{ id: "e1", fact: "f" }] },
      { findings: [{ rule: "LICENSE_FORBIDDEN", severity: "error", event: "e1" }] },
    );
    assert.equal(rec.events[0].review, "blocked");
    assert.equal(rec.summary.errors, 1);
  });

  test("an event without a source records null source/sourceHash", () => {
    const rec = buildProvenance({ id: "d", events: [{ id: "e1", fact: "f" }] });
    assert.equal(rec.events[0].source, null);
    assert.equal(rec.events[0].sourceHash, null);
  });
});
