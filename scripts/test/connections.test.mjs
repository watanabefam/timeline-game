#!/usr/bin/env node
/*
 * scripts/test/connections.test.mjs
 * ------------------------------------------------------------------
 * The connection cue (connections.js) is pure and DOM-free, which is the
 * whole reason it can be tested here: `indexEdges`/`cueFor`/`cueText` are
 * functions of the deck's authored `connections[]` graph and the player's
 * board, and nothing else (doc/CONNECTION_CUE_PLAN.md §4.1, NFR1). This
 * evaluates the SHIPPED file (in this realm, via `vm.runInThisContext`, so
 * object comparisons stay same-realm) — the assertions are about the file the
 * game actually serves, not a copy.
 *
 * Covered here: the phrase table for all four types × both directions (AC5);
 * eligibility — a partner must be ON the board (FR2/AC3); the direction-
 * verifying year rule (FR7/AC4); the two edges that once violated it, pinned
 * by id against the shipped deck; dangling / self / unknown-type / missing-year
 * drops; selection order; the age gate (AC6); purity and determinism (NFR2).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

vm.runInThisContext(readFileSync(join(root, "connections.js"), "utf8"), {
  filename: join(root, "connections.js"),
});
const C = globalThis.Connections;

// ---- fixtures ------------------------------------------------------------
// An event as the module sees it: id/title/year (+ optional sortYear), and the
// authored, directed connections[] stored on it.
const ev = (id, year, connections, extra = {}) => ({
  id,
  title: extra.title || id,
  year,
  ...extra,
  connections,
});
const edge = (to, type, extra = {}) => ({ to, type, rationale: "a rationale long enough to pass", ...extra });

// A -> B, one edge of the given type, stored on the earlier event.
const pair = (type, extra = {}) => [
  ev("a", 1000, [edge("b", type, extra)], { title: "Alpha" }),
  ev("b", 2000, [], { title: "Beta" }),
];

function deckEvents() {
  return JSON.parse(
    readFileSync(join(root, "decks", "inventions-discoveries", "deck.json"), "utf8")
  ).events;
}

/* ------------------------------------------------------------- module shape */

test("the module exposes the seam and loads with no DOM (classic script)", () => {
  assert.deepEqual(Object.keys(C).sort(), [
    "PHRASES",
    "PROSE_BLOCKED_BANDS",
    "cueAnnounce",
    "cueFor",
    "cueText",
    "indexEdges",
    "isContested",
    "rationaleFor",
    "sortYearOf",
    "storageRuleViolations",
  ]);
  assert.equal(typeof C.cueFor, "function");
  assert.equal(typeof C.indexEdges, "function");
  assert.equal(typeof C.storageRuleViolations, "function");
});

/* ----------------------------------------------------- phrase table (AC5) */

test("cueText is per-type AND per-direction — the phrase is never backwards", () => {
  // [type, direction, expected] with the partner titled "Partner".
  const cases = [
    ["necessary", "target", "Partner made this possible."],
    ["necessary", "source", "This made Partner possible."],
    ["contributing", "target", "Partner helped lead to this."],
    ["contributing", "source", "This helped lead to Partner."],
    ["trigger", "target", "Partner set this off."],
    ["trigger", "source", "This set off Partner."],
    // echo is the mirror image: when the CARD is the later event it mirrored
    // the partner; when the card is the earlier event, the partner mirrored it.
    ["echo", "target", "This mirrored Partner."],
    ["echo", "source", "Partner mirrored this."],
  ];
  for (const [type, direction, want] of cases) {
    const cue = { type, direction, partnerTitle: "Partner", partnerId: "p" };
    assert.equal(C.cueText(cue), want, `${type}/${direction}`);
  }
});

test("cueText degrades to an empty string on anything it cannot phrase", () => {
  assert.equal(C.cueText(null), "");
  assert.equal(C.cueText(undefined), "");
  assert.equal(C.cueText({ fact: "x" }), "");
  assert.equal(C.cueText({ type: "bogus", direction: "target", partnerId: "p" }), "");
  assert.equal(C.cueText({ type: "necessary", direction: "sideways", partnerId: "p" }), "");
  assert.equal(C.cueText({ type: "necessary", direction: "target" }), "");
  // A missing title falls back to the id so the line is never blank.
  assert.equal(C.cueText({ type: "necessary", direction: "target", partnerId: "pid" }), "pid made this possible.");
});

test("cueAnnounce labels the sentence for the live region", () => {
  const cue = { type: "necessary", direction: "target", partnerTitle: "Partner" };
  assert.equal(C.cueAnnounce(cue), "Connection: Partner made this possible.");
  assert.equal(C.cueAnnounce(null), "");
});

/* ------------------------------------------------------- eligibility (FR2) */

test("a cue needs a partner that is already on the board (RULE 2 / AC3)", () => {
  const events = pair("necessary");
  const idx = C.indexEdges(events);
  const [a, b] = events;
  // Nothing placed -> no cue, even though edges exist.
  assert.equal(C.cueFor(b, idx, []), null);
  assert.equal(C.cueFor(a, idx, []), null);
  assert.equal(C.cueFor(b, idx, new Set()), null);
  // The other endpoint is visible -> the edge explains this card.
  const forB = C.cueFor(b, idx, ["a"]);
  assert.equal(forB.partnerId, "a");
  assert.equal(forB.type, "necessary");
  assert.equal(forB.direction, "target");
  assert.equal(C.cueText(forB), "Alpha made this possible.");
  const forA = C.cueFor(a, idx, new Set(["b"]));
  assert.equal(forA.partnerId, "b");
  assert.equal(forA.direction, "source");
  assert.equal(C.cueText(forA), "This made Beta possible.");
});

test("a card with no edge at all yields no cue, never a placeholder", () => {
  const events = [...pair("necessary"), ev("c", 3000, [])];
  const idx = C.indexEdges(events);
  assert.equal(C.cueFor(events[2], idx, ["a", "b"]), null);
});

/* ------------------------------------------------ direction check (FR7) */

test("indexEdges drops an edge whose endpoints contradict the earlier→later rule", () => {
  // Stored on the LATER event (2000) pointing at the earlier one (1000).
  const events = [
    ev("late", 2000, [edge("early", "echo")]),
    ev("early", 1000, []),
  ];
  const idx = C.indexEdges(events);
  assert.equal((idx.out.get("late") || []).length, 0, "a backwards edge must not be indexed forward");
  assert.equal((idx.in.get("early") || []).length, 0);
  assert.equal(C.cueFor(events[0], idx, ["early"]), null);
  assert.equal(C.cueFor(events[1], idx, ["late"]), null);
  // ...but it IS reported: dropping is silent, reporting is not.
  assert.deepEqual(C.storageRuleViolations(events), [
    { from: "late", to: "early", fromYear: 2000, toYear: 1000 },
  ]);
});

test("same-year edges are allowed (the rule is <=, not <)", () => {
  const events = [ev("a", 1000, [edge("b", "contributing")]), ev("b", 1000, [])];
  const idx = C.indexEdges(events);
  assert.equal(C.storageRuleViolations(events).length, 0);
  assert.ok(C.cueFor(events[1], idx, ["a"]));
});

/* --------------------------------------------------------- echo (AC5) */

test("an echo edge reads with the LATER event as the mirror (AC5)", () => {
  const events = [
    ev("house", 800, [edge("timbuktu", "echo")], { title: "House" }),
    ev("timbuktu", 1400, [], { title: "Timbuktu" }),
  ];
  const idx = C.indexEdges(events);
  const forTimbuktu = C.cueFor(events[1], idx, ["house"]);
  assert.equal(forTimbuktu.type, "echo");
  assert.equal(forTimbuktu.direction, "target");
  assert.equal(C.cueText(forTimbuktu), "This mirrored House.");
  const forHouse = C.cueFor(events[0], idx, ["timbuktu"]);
  assert.equal(forHouse.direction, "source");
  assert.equal(C.cueText(forHouse), "Timbuktu mirrored this.");
});

/* ------------------------------------------- selection / determinism */

test("the nearest visible partner wins, then the stronger type breaks a tie", () => {
  // Card c at 2000; partners at 1990 (contributing) and 1900 (echo).
  const events = [
    ev("p_near", 1990, [edge("c", "contributing")]),
    ev("p_far", 1900, [edge("c", "echo")]),
    ev("c", 2000, []),
  ];
  const idx = C.indexEdges(events);
  const cue = C.cueFor(events[2], idx, ["p_far", "p_near"]);
  assert.equal(cue.partnerId, "p_near");

  // Equal distance: necessary outranks echo (both are valid earlier partners).
  const tie = [
    ev("p_needed", 1900, [edge("c", "necessary")]),
    ev("p_echo", 1900, [edge("c", "echo")]),
    ev("c", 2000, []),
  ];
  const tidx = C.indexEdges(tie);
  assert.equal(C.cueFor(tie[2], tidx, ["p_needed", "p_echo"]).partnerId, "p_needed");
});

test("cueFor is deterministic and does not mutate its inputs (NFR2)", () => {
  const events = pair("contributing");
  const idx = C.indexEdges(events);
  const before = JSON.stringify(events);
  const placed = ["a"];
  const one = C.cueFor(events[1], idx, placed);
  const two = C.cueFor(events[1], idx, placed);
  assert.deepEqual(one, two);
  assert.deepEqual(placed, ["a"], "cueFor must not write to the caller's board");
  assert.equal(JSON.stringify(events), before, "cueFor must not write to the deck");
});

test("indexEdges does not mutate the deck it indexes", () => {
  const events = pair("necessary");
  const before = JSON.stringify(events);
  C.indexEdges(events);
  assert.equal(JSON.stringify(events), before);
});

/* -------------------------------------------------- malformed input (FR6) */

test("indexEdges drops dangling, self, unknown-type and year-less edges — and never throws", () => {
  const events = [
    ev("a", 1000, [
      edge("ghost", "necessary"), // dangling
      edge("a", "necessary"), // self
      edge("b", "bogus"), // unknown type
      edge("c", "necessary"), // target has no year
      { to: "b" }, // no type
      null,
      edge("b", "trigger", { rationale: 7 }), // non-string rationale -> ""
    ]),
    ev("b", 2000, [{ to: "a", type: "necessary", rationale: "ok long enough for a rationale" }], { title: "B" }),
    ev("c", null, [], { title: "C" }),
  ];
  const idx = C.indexEdges(events);
  const outA = idx.out.get("a") || [];
  assert.equal(outA.length, 1, "only the valid a->b edge survives");
  assert.equal(outA[0].to, "b");
  assert.equal(outA[0].rationale, "");
  // b -> a is backwards (2000 -> 1000) and must be dropped, so b has no
  // outgoing edge and a gains no incoming one from it.
  assert.equal((idx.out.get("b") || []).length, 0);
  assert.equal((idx.in.get("a") || []).length, 0);
});

test("indexEdges and cueFor degrade on non-array / null input", () => {
  for (const bad of [undefined, null, "x", 7, {}]) {
    const idx = C.indexEdges(bad);
    assert.equal(idx.out.size, 0);
    assert.equal(idx.in.size, 0);
    assert.equal(C.cueFor({ id: "a" }, idx, []), null);
  }
  assert.deepEqual(C.storageRuleViolations(null), []);
  assert.deepEqual(C.storageRuleViolations("x"), []);
  assert.equal(C.cueFor(null, C.indexEdges([]), []), null);
  assert.equal(C.cueFor({ id: "a" }, null, []), null);
  assert.equal(C.cueFor({ id: "a" }, {}, []), null);
});

/* ---------------------------------------------------- the reverse index */

test("a card is cued from an INCOMING edge too (the derived reverse index)", () => {
  // The edge is stored on the earlier a; b has no outgoing connections but must
  // still be cued.
  const events = pair("trigger");
  const idx = C.indexEdges(events);
  assert.equal((idx.out.get("b") || []).length, 0);
  assert.equal((idx.in.get("b") || []).length, 1);
  const cue = C.cueFor(events[1], idx, ["a"]);
  assert.equal(cue.partnerId, "a");
  assert.equal(cue.direction, "target");
});

/* ---------------------------------------------------- age gate (AC6) */

test("only 12+ see the rationale or the contested flag (AC6)", () => {
  const cue = {
    type: "necessary",
    direction: "target",
    partnerId: "p",
    rationale: "Some authored prose.",
    contested: true,
  };
  for (const band of ["5-7", "8-11"]) {
    assert.equal(C.rationaleFor(cue, band), null, `${band} must not see prose`);
    assert.equal(C.isContested(cue, band), false, `${band} must not see "contested"`);
  }
  for (const band of ["12-16", "17+", undefined, "unknown"]) {
    assert.equal(C.rationaleFor(cue, band), "Some authored prose.", `${band} may see prose`);
    assert.equal(C.isContested(cue, band), true, `${band} may see "contested"`);
  }
  assert.equal(C.rationaleFor({ type: "necessary" }, "17+"), null);
  assert.equal(C.isContested({ type: "necessary" }, "17+"), false);
  assert.deepEqual(C.PROSE_BLOCKED_BANDS, ["5-7", "8-11"]);
});

/* ------------------------------------------------------- year helper */

test("sortYearOf prefers sortYear, falls back to year, else null", () => {
  assert.equal(C.sortYearOf({ sortYear: -1200, year: -1200 }), -1200);
  assert.equal(C.sortYearOf({ sortYear: 5, year: 99 }), 5);
  assert.equal(C.sortYearOf({ year: 42 }), 42);
  assert.equal(C.sortYearOf({}), null);
  assert.equal(C.sortYearOf({ year: "nope" }), null);
  assert.equal(C.sortYearOf(null), null);
});

/* -------------------------------------------------- the shipped deck */

test("the shipped pilot deck has no edge that breaks the storage rule (§4.7)", () => {
  // AC4 — pinned against the real data. Before this feature the deck carried
  // exactly two violations (timbuktu-scholars -> house-of-wisdom, and
  // mendeleev-periodic-table -> newton-principia); both were MOVED onto the
  // earlier event rather than dropped, so the gate now passes and the cue
  // renders them in the corrected direction (see the next test).
  const bad = C.storageRuleViolations(deckEvents());
  assert.deepEqual(bad, [], `unexpected storage-rule violations: ${JSON.stringify(bad)}`);
});

test("the two moved echo edges render in the CORRECTED direction, by id", () => {
  const events = deckEvents();
  const idx = C.indexEdges(events);
  const byId = (id) => events.find((e) => e.id === id);

  // house-of-wisdom (813) -> timbuktu-scholars (1493), an echo.
  const house = byId("house-of-wisdom");
  const timbuktu = byId("timbuktu-scholars");
  const cueT = C.cueFor(timbuktu, idx, [house.id]);
  assert.equal(cueT.type, "echo");
  assert.equal(cueT.partnerId, "house-of-wisdom");
  assert.match(C.cueText(cueT), /^This mirrored .*House of Wisdom.*\.$/);
  const cueH = C.cueFor(house, idx, [timbuktu.id]);
  assert.equal(cueH.partnerId, "timbuktu-scholars");
  assert.match(C.cueText(cueH), /Timbuktu.* mirrored this\.$/);

  // newton-principia (1687) -> mendeleev-periodic-table (1869), an echo.
  const newton = byId("newton-principia");
  const mendeleev = byId("mendeleev-periodic-table");
  const cueM = C.cueFor(mendeleev, idx, [newton.id]);
  assert.equal(cueM.type, "echo");
  assert.equal(cueM.partnerId, "newton-principia");
  assert.match(C.cueText(cueM), /^This mirrored .*\.$/);
});

test("the real deck indexes forward and reverse, and names every partner by title", () => {
  const events = deckEvents();
  const idx = C.indexEdges(events);
  assert.ok(idx.out.size > 0 && idx.in.size > 0);
  assert.equal(idx.titles.size, events.length, "every event has a title in the index");
  // Every indexed edge is resolvable from both directions.
  let edges = 0;
  for (const list of idx.out.values()) edges += list.length;
  let back = 0;
  for (const list of idx.in.values()) back += list.length;
  assert.equal(back, edges);
});
