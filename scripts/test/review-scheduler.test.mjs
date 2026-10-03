#!/usr/bin/env node
/*
 * scripts/test/review-scheduler.test.mjs
 * ------------------------------------------------------------------
 * The reach-back review scheduler (review-scheduler.js) is pure and DOM-free,
 * which is the whole reason it can be tested here: `replay`/`rate`/`dueSet` are
 * functions of the append-only reviewLog and nothing else (D3). This evaluates
 * the SHIPPED file (in this realm, via `vm.runInThisContext`, so object
 * comparisons stay same-realm) — the assertions are about the file the game
 * actually serves, not a copy.
 *
 * Covered here: AC1 (recency threshold), AC2 (expanding/contracting interval),
 * AC3 (5–11 era/week block restriction), AC4 (empty log degrades), AC6
 * (determinism). The browser smoke for J1 surfacing (AC5/AC7) is a later task.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

vm.runInThisContext(readFileSync(join(root, "review-scheduler.js"), "utf8"), {
  filename: join(root, "review-scheduler.js"),
});
const RS = globalThis.ReviewScheduler;

const row = (eventId, outcome, deck = "d1") => ({ ts: 0, deck, eventId, outcome, mode: "free" });

test("the module exposes the seam and loads with no DOM (classic script)", () => {
  assert.deepEqual(
    Object.keys(RS).sort(),
    ["K_MAX", "K_MIN", "MASTERY_ALPHA", "MAX_POW", "dueSet", "intervalKFor", "masteryByEvent", "rate", "replay"]
  );
  assert.equal(typeof RS.replay, "function");
  assert.equal(typeof RS.rate, "function");
  assert.equal(typeof RS.dueSet, "function");
});

/* ----------------------------------------------------------- replay (FR1) */

test("replay folds the log into per-event state, from the log alone", () => {
  const log = [
    row("a", "firstTry"),
    row("b", "slip"),
    row("a", "firstTry"),
    row("c", "firstTry"),
  ];
  const s = RS.replay(log);
  // a: two first-tries in a row -> streak 2 -> intervalK 12; last seen 1 back
  assert.deepEqual(s.a, { deck: "d1", lastSeenPos: 1, attempts: 2, firstTry: 2, streak: 2, intervalK: 12 });
  // b: a slip -> streak 0 -> K_MIN; last seen 2 back
  assert.deepEqual(s.b, { deck: "d1", lastSeenPos: 2, attempts: 1, firstTry: 0, streak: 0, intervalK: 3 });
  // c: just seen -> lastSeenPos 0
  assert.equal(s.c.lastSeenPos, 0);
  assert.equal(s.c.intervalK, 6);
});

test("replay is deterministic — two runs of the same log agree (AC6)", () => {
  const log = [
    row("a", "firstTry"), row("b", "slip"), row("c", "firstTry"),
    row("a", "slip"), row("a", "firstTry"), row("b", "firstTry"),
  ];
  assert.deepEqual(RS.replay(log), RS.replay(log));
  // And the result is a function of the log, not of object identity.
  assert.deepEqual(RS.replay(log), RS.replay(log.map((r) => ({ ...r }))));
});

test("replay skips malformed rows and never throws", () => {
  assert.deepEqual(RS.replay(undefined), {});
  assert.deepEqual(RS.replay(null), {});
  assert.deepEqual(RS.replay([]), {});
  const s = RS.replay([null, 7, { outcome: "firstTry" }, row("a", "firstTry"), { eventId: "b" }]);
  assert.deepEqual(Object.keys(s), ["a", "b"]);
  // A missing outcome is not a success — it resets the streak like a slip.
  assert.equal(s.b.streak, 0);
});

test("replay carries the last deck an event was logged under", () => {
  const s = RS.replay([row("x", "firstTry", "d1"), row("x", "firstTry", "d2")]);
  assert.equal(s.x.deck, "d2");
  assert.equal(s.x.streak, 2);
});

/* ------------------------------------------------------ masteryByEvent (display) */

test("masteryByEvent seeds with the first observation (1 clean = 100, 1 slip = 0)", () => {
  assert.deepEqual(RS.masteryByEvent([row("a", "firstTry")]), { a: 100 });
  assert.deepEqual(RS.masteryByEvent([row("a", "slip")]), { a: 0 });
});

test("masteryByEvent weighs recent outcomes — finishing well reads higher", () => {
  // Equal counts, opposite order. A last-N window cannot see the difference.
  const alternating = [row("a","firstTry"),row("a","slip"),row("a","firstTry"),row("a","slip"),row("a","firstTry"),row("a","slip")];
  const finishing   = [row("a","slip"),row("a","slip"),row("a","slip"),row("a","firstTry"),row("a","firstTry"),row("a","firstTry")];
  const alt = RS.masteryByEvent(alternating).a;
  const fin = RS.masteryByEvent(finishing).a;
  assert.ok(fin > alt, `finishing well (${fin}) must read higher than alternating (${alt})`);
});

test("masteryByEvent: an added slip lowers the estimate", () => {
  const clean = RS.masteryByEvent([row("a","firstTry"), row("a","firstTry"), row("a","firstTry")]).a;
  const slipped = RS.masteryByEvent([row("a","firstTry"), row("a","firstTry"), row("a","slip")]).a;
  assert.equal(clean, 100);
  assert.equal(slipped, 70);
  assert.ok(slipped < clean, `${slipped} should be below ${clean}`);
});

test("masteryByEvent is per-event, skips malformed rows, never throws", () => {
  assert.deepEqual(RS.masteryByEvent(undefined), {});
  assert.deepEqual(RS.masteryByEvent("nope"), {});
  assert.deepEqual(RS.masteryByEvent([]), {});
  const m = RS.masteryByEvent([null, 7, { outcome: "firstTry" }, row("a","firstTry"), row("b","slip")]);
  assert.deepEqual(Object.keys(m).sort(), ["a", "b"]);
  assert.equal(m.a, 100);
  assert.equal(m.b, 0);
});

test("masteryByEvent does not mutate the log (D3)", () => {
  const log = [row("a","firstTry"), row("a","slip")];
  const before = JSON.stringify(log);
  RS.masteryByEvent(log);
  assert.equal(JSON.stringify(log), before, "masteryByEvent wrote to the persisted log");
});

test("masteryByEvent honours an explicit alpha (1 = only the latest outcome)", () => {
  assert.equal(RS.masteryByEvent([row("a","slip"), row("a","firstTry")], 1).a, 100);
  assert.equal(RS.masteryByEvent([row("a","firstTry"), row("a","slip")], 1).a, 0);
  // An out-of-range alpha falls back to the default rather than producing NaN.
  assert.equal(RS.masteryByEvent([row("a","firstTry")], 0).a, 100);
});

/* ----------------------------------------------------------- intervalK/rate */

test("intervalK grows by powers of two and clamps at K_MAX (AC2)", () => {
  assert.equal(RS.intervalKFor(0), 3);
  assert.equal(RS.intervalKFor(1), 6);
  assert.equal(RS.intervalKFor(2), 12);
  assert.equal(RS.intervalKFor(3), 24);
  assert.equal(RS.intervalKFor(4), 24);
  assert.equal(RS.intervalKFor(99), 24);
});

test("rate widens on firstTry and resets on slip, and returns the derived due (AC2)", () => {
  const clean = { deck: "d1", lastSeenPos: 4, attempts: 2, firstTry: 2, streak: 2, intervalK: 12 };
  const good = RS.rate(clean, "firstTry");
  assert.equal(good.state.streak, 3);
  assert.equal(good.state.intervalK, 24);
  assert.deepEqual(good.nextDue, { dueAfterPlacements: 24 });

  const miss = RS.rate(clean, "slip");
  assert.equal(miss.state.streak, 0);
  assert.equal(miss.state.intervalK, 3);
  assert.deepEqual(miss.nextDue, { dueAfterPlacements: 3 });
  assert.equal(miss.state.attempts, 3);
  assert.equal(miss.state.firstTry, 2); // a slip does not add a first-try
});

test("rate is pure: the input state is not mutated (NFR1)", () => {
  const clean = { deck: "d1", lastSeenPos: 4, attempts: 2, firstTry: 2, streak: 2, intervalK: 12 };
  const before = JSON.stringify(clean);
  RS.rate(clean, "firstTry");
  RS.rate(clean, "slip");
  assert.equal(JSON.stringify(clean), before);
});

test("rate on an unknown event returns a neutral state, never throws", () => {
  const r = RS.rate(undefined, "firstTry");
  assert.equal(r.state.attempts, 1);
  assert.equal(r.state.streak, 1);
  assert.deepEqual(r.nextDue, { dueAfterPlacements: 6 });
});

/* ---------------------------------------------------------- dueSet (FR3/4) */

test("dueSet only reaches back at least `recencyK` placements (AC1)", () => {
  const s = RS.replay([row("a", "firstTry"), row("b", "firstTry"), row("c", "firstTry"), row("d", "firstTry")]);
  // n = 4 -> lastSeenPos: a=3, b=2, c=1, d=0. Default recencyK is K_MIN = 3.
  assert.deepEqual(RS.dueSet(s, "d1", "17+", {}), ["a"]);
  // A larger reach-back window admits more.
  const wide = RS.dueSet(s, "d1", "17+", { recencyK: 1 });
  assert.deepEqual(wide, ["a", "b", "c"]);
});

test("dueSet is deterministic and stably ordered (AC1/AC6)", () => {
  const log = [];
  for (let i = 0; i < 6; i += 1) log.push(row("e" + i, i % 2 ? "slip" : "firstTry"));
  const s = RS.replay(log);
  const a = RS.dueSet(s, "d1", "17+", { events: logEvents(6) });
  const b = RS.dueSet(s, "d1", "17+", { events: logEvents(6) });
  assert.deepEqual(a, b);
  assert.ok(a.length > 0);
});

test("dueSet respects the size cap", () => {
  const log = [];
  for (let i = 0; i < 6; i += 1) log.push(row("e" + i, "firstTry"));
  const s = RS.replay(log);
  const capped = RS.dueSet(s, "d1", "17+", { cap: 2, events: logEvents(6) });
  assert.equal(capped.length, 2);
});

test("dueSet filters to the requested deck", () => {
  // Both decks' events are far enough back (n = 8 -> each is >= 4 back).
  const s = RS.replay([
    row("a", "firstTry", "d1"), row("b", "firstTry", "d2"),
    row("c", "firstTry", "d1"), row("d", "firstTry", "d2"),
    row("p1", "firstTry", "d1"), row("p2", "firstTry", "d2"),
    row("p3", "firstTry", "d1"), row("p4", "firstTry", "d2"),
  ]);
  const d1 = new Set(["a", "c", "p1", "p3"]);
  const d2 = new Set(["b", "d", "p2", "p4"]);
  const pick1 = RS.dueSet(s, "d1", "17+", {});
  const pick2 = RS.dueSet(s, "d2", "17+", {});
  assert.ok(pick1.length && pick2.length);
  assert.ok(pick1.every((id) => d1.has(id)), `d1 set leaked a foreign deck: ${pick1}`);
  assert.ok(pick2.every((id) => d2.has(id)), `d2 set leaked a foreign deck: ${pick2}`);
  assert.ok(pick1.includes("a") && !pick1.includes("b"));
  assert.ok(pick2.includes("b") && !pick2.includes("a"));
});

/* ----------------------------------------------------- age gate (FR4/AC3) */

test("bands 5–7 and 8–11 never cross the current era/week block (AC3)", () => {
  const s = RS.replay([
    row("ancient", "firstTry"), row("modern", "firstTry"),
    row("f1", "firstTry"), row("f2", "firstTry"), row("f3", "firstTry"),
  ]);
  const opts = {
    recencyK: 0,
    currentEra: "ancient",
    currentWeek: 1,
    events: [
      { id: "ancient", era: "ancient", week: 1 },
      { id: "modern", era: "modern", week: 9 },
    ],
  };
  for (const band of ["5-7", "8-11"]) {
    const set = RS.dueSet(s, "d1", band, opts);
    assert.ok(set.includes("ancient"), `${band} should still review within its block`);
    assert.ok(!set.includes("modern"), `${band} must not reach across eras`);
  }
});

test("a gated band with no current era/week serves nothing (fail safe)", () => {
  const s = RS.replay([row("a", "firstTry"), row("b", "firstTry"), row("c", "firstTry"), row("d", "firstTry")]);
  assert.deepEqual(RS.dueSet(s, "d1", "8-11", { events: [{ id: "a", era: "ancient", week: 1 }] }), []);
});

test("12+ and unset may cross eras, weighted toward earlier material", () => {
  const s = RS.replay([
    row("ancient", "firstTry"), row("modern", "firstTry"),
    row("f1", "firstTry"), row("f2", "firstTry"), row("f3", "firstTry"),
  ]);
  const opts = {
    recencyK: 0,
    currentEra: "modern",
    eraOrder: ["prehistory", "ancient", "medieval", "early-modern", "industrial", "modern"],
    events: [
      { id: "ancient", era: "ancient", week: 1 },
      { id: "modern", era: "modern", week: 9 },
    ],
  };
  const set = RS.dueSet(s, "d1", "12-16", opts);
  assert.ok(set.includes("ancient") && set.includes("modern"));
  // Ancient is several era steps earlier, so it ranks ahead of modern.
  assert.ok(set.indexOf("ancient") < set.indexOf("modern"));
  // Unset behaves as the highest band (GAMIFICATION_BRIEF §5).
  assert.ok(RS.dueSet(s, "d1", undefined, opts).includes("modern"));
});

/* ------------------------------------------------ success floor (§11/FR3) */

test("dueSet trims the hardest cards to hold success at or above the floor", () => {
  const log = [
    row("hard1", "slip"), row("hard1", "slip"), row("hard2", "slip"),
    row("easy", "firstTry"), row("easy", "firstTry"), row("easy", "firstTry"), row("easy", "firstTry"),
  ];
  const s = RS.replay(log);
  const set = RS.dueSet(s, "d1", "17+", { recencyK: 0 });
  const mean = set.reduce((t, id) => t + s[id].firstTry / s[id].attempts, 0) / set.length;
  assert.ok(mean >= 0.5, `mean success ${mean} should be >= 0.5`);
  assert.ok(set.includes("easy"));
  assert.equal(set.length, 2); // easy + one hard card -> 0.5 mean
});

test("the floor never trims an impossible set to empty — one hard card stays", () => {
  const s = RS.replay([row("hard1", "slip"), row("hard2", "slip")]);
  const set = RS.dueSet(s, "d1", "17+", { recencyK: 0 });
  assert.equal(set.length, 1, "trimming must stop at one, never at zero");
});

/* --------------------------------------------------------- empty (AC4) */

test("an empty log yields an empty due set with no error (AC4)", () => {
  assert.deepEqual(RS.replay([]), {});
  assert.deepEqual(RS.dueSet(RS.replay([]), "d1", "8-11", {}), []);
  assert.deepEqual(RS.dueSet(undefined, "d1", "17+", {}), []);
  assert.deepEqual(RS.dueSet(RS.replay([]), "d1", "17+", null), []);
});

/* ------------------------------------------------------------- audit pass */
// Findings from the 2026-10-02 audit of the shipped module: invariants that
// were assumed but not asserted. Each one pins behaviour a future change could
// silently break.
const mkState = (lastSeenPos, attempts = 1, firstTry = 1, deck = "d1") => ({
  deck, lastSeenPos, attempts, firstTry, streak: firstTry, intervalK: 3,
});

test("audit: replay never mutates the review log (D3 — append-only is sacred)", () => {
  const log = [
    { ts: 1, deck: "d1", eventId: "a", outcome: "firstTry", mode: "free" },
    { ts: 2, deck: "d1", eventId: "b", outcome: "slip", mode: "free" },
  ];
  const before = JSON.stringify(log);
  RS.replay(log);
  assert.equal(JSON.stringify(log), before, "replay wrote to the persisted log");
});

test("audit: dueSet does not mutate its inputs", () => {
  const states = { a: mkState(6), b: mkState(4, 2, 1) };
  const opts = { events: [{ id: "a", era: "modern", week: 1 }], recencyK: 0 };
  const statesBefore = JSON.stringify(states);
  const optsBefore = JSON.stringify(opts);
  RS.dueSet(states, "d1", "17+", opts);
  RS.dueSet(states, "d1", "5-7", opts);
  assert.equal(JSON.stringify(states), statesBefore, "dueSet rewrote the derived state");
  assert.equal(JSON.stringify(opts), optsBefore, "dueSet rewrote the options");
});

test("audit: equal scores break ties deterministically — recency first, then id", () => {
  // Ordering only, so hold the recency threshold open and let the sort decide.
  const opts = { recencyK: 0 };
  // Identical everything -> id ascending.
  const even = { x: mkState(5), y: mkState(5), z: mkState(5) };
  assert.deepEqual(RS.dueSet(even, "d1", "17+", opts), ["x", "y", "z"]);
  // A real score tie (7 vs 7) built from different recency/struggle mixes
  // (7+0 and 3+4) -> the most overdue wins.
  const rec = { z: mkState(7, 1, 1), x: mkState(3, 1, 0) };
  assert.deepEqual(RS.dueSet(rec, "d1", "17+", opts), ["z", "x"]);
  // Same tie with the letters swapped -> order follows the numbers, not a name.
  const rev = { y: mkState(3, 1, 0), w: mkState(7, 1, 1) };
  assert.deepEqual(RS.dueSet(rev, "d1", "17+", opts), ["w", "y"]);
});

test("audit: the success floor keeps the MOST overdue of two equally-hard cards", () => {
  // Regression for the audited defect: among equal (zero) success the trim used
  // to drop index 0 — the most overdue — trading away the oldest memory to make
  // the mean look gentler. It must drop the least overdue instead.
  const log = [
    row("hardA", "slip"), row("hardA", "slip"),
    row("hardB", "slip"),
    row("easy", "firstTry"), row("easy", "firstTry"), row("easy", "firstTry"), row("easy", "firstTry"),
  ];
  const s = RS.replay(log); // hardA is 5 back, hardB 4 back
  const set = RS.dueSet(s, "d1", "17+", { recencyK: 0 });
  assert.ok(set.includes("hardA"), `expected the more-overdue hardA, got ${JSON.stringify(set)}`);
  assert.ok(!set.includes("hardB"), `hardB is the less-overdue one and should be trimmed, got ${JSON.stringify(set)}`);
  assert.equal(set.length, 2);
});

test("audit: an event id shared by two decks resolves to the LAST deck seen", () => {
  // 0 shared ids across the 4 shipped decks (checked 2026-10-02), so this is
  // latent, not active. The harm direction matters: a collision HIDES the event
  // from the earlier deck's review set (derived state, self-healing) — it can
  // never leak another deck's card into a round, because dueSet filters on deck.
  const s = RS.replay([row("shared", "firstTry", "d1"), row("shared", "firstTry", "d2")]);
  assert.equal(s.shared.deck, "d2");
  assert.deepEqual(RS.dueSet(s, "d1", "17+", { recencyK: 0 }), []);
  assert.deepEqual(RS.dueSet(s, "d2", "17+", { recencyK: 0 }), ["shared"]);
});

test("audit: pruning the log derives from what remains, never assumes history", () => {
  const full = [row("old", "firstTry"), row("a", "firstTry"), row("b", "firstTry"), row("c", "firstTry"), row("d", "firstTry")];
  const tail = full.slice(1); // what REVIEW_LOG_CAP's splice(0, n-cap) would leave
  const s = RS.replay(tail);
  assert.ok(!("old" in s), "an event whose rows were pruned must not survive");
  assert.deepEqual(Object.keys(s).sort(), ["a", "b", "c", "d"]);
  assert.equal(s.a.lastSeenPos, 3); // positions are recomputed against the tail
});

test("audit: a non-array log (undefined/string) degrades instead of throwing", () => {
  assert.deepEqual(RS.replay("not-a-log"), {});
  assert.deepEqual(RS.replay(42), {});
  assert.deepEqual(RS.replay({ rows: [] }), {});
  assert.deepEqual(RS.dueSet(RS.replay("x"), "d1", "8-11", { events: [] }), []);
});

/* ------------------------------------------------ cue promotion (S1, T3) */
// doc/MVP_PLAN.md S1. The cue capability is a SUPPLIED id set, because this
// module has no deck, no years and no edges — the graph lives in
// connections.js. These tests pin the three properties the design rests on:
//   1. no `cue` key  -> byte-identical output (AC1, a code-path property)
//   2. a cue promotes  -> and can NEVER rescue a filtered-out card (FR2)
//   3. `opts.order`    -> the promoted pair is asked in dependency order

/** Six due cards, each 6..1 placements back, all with identical success. */
function cueFixture() {
  const states = {};
  for (let i = 0; i < 6; i += 1) {
    states["e" + i] = mkState(6 - i, 2, 2);
  }
  return states;
}

test("cue: absent `cue` leaves the due set byte-identical (AC1)", () => {
  const s = cueFixture();
  const opts = { recencyK: 0, events: logEvents(6) };
  const before = RS.dueSet(s, "d1", "17+", opts);
  // A cue set that names nothing must be inert, and an unrelated extra key must
  // not disturb the result either.
  assert.deepEqual(RS.dueSet(s, "d1", "17+", Object.assign({}, opts, { cue: [] })), before);
  assert.deepEqual(RS.dueSet(s, "d1", "17+", Object.assign({}, opts, { order: {} })), before);
});

test("cue: a promoted id moves to the front, and the rest keep their order", () => {
  const s = cueFixture();
  const opts = { recencyK: 0, events: logEvents(6) };
  const before = RS.dueSet(s, "d1", "17+", opts);
  const promotedId = before[before.length - 1]; // the lowest-ranked card
  const after = RS.dueSet(s, "d1", "17+", Object.assign({}, opts, { cue: [promotedId] }));
  assert.equal(after[0], promotedId, "the cued card must be asked first");
  // Same membership, same relative order for everyone else: a partition, not a
  // re-score.
  assert.deepEqual(after.slice().sort(), before.slice().sort());
  assert.deepEqual(after.slice(1), before.filter((id) => id !== promotedId));
});

test("cue: a Set works exactly like an array", () => {
  const s = cueFixture();
  const opts = { recencyK: 0, events: logEvents(6) };
  const arr = RS.dueSet(s, "d1", "17+", Object.assign({}, opts, { cue: ["e5"] }));
  const set = RS.dueSet(s, "d1", "17+", Object.assign({}, opts, { cue: new Set(["e5"]) }));
  assert.deepEqual(arr, set);
});

test("cue: `order` asks the promoted pair in dependency order", () => {
  const s = cueFixture();
  const opts = { recencyK: 0, events: logEvents(6) };
  // e1 ranks above e4 without an order; the caller says the dependency runs
  // e4 -> e1, so e4 must come first or the later card's partner is not yet on
  // the board when it is asked (RULE 2).
  const out = RS.dueSet(s, "d1", "17+", Object.assign({}, opts, {
    cue: ["e1", "e4"],
    order: { e4: 1, e1: 2 },
  }));
  assert.deepEqual(out.slice(0, 2), ["e4", "e1"]);
});

test("cue: promotion cannot rescue a card that is not due (FR2)", () => {
  const s = cueFixture();
  // e5 is only 1 placement back; recencyK 3 filters it out. Naming it in the
  // cue set must NOT bring it back.
  const out = RS.dueSet(s, "d1", "17+", { recencyK: 3, cue: ["e5"] });
  assert.ok(!out.includes("e5"), `cue resurrected a card that is not due: ${JSON.stringify(out)}`);
});

test("cue: promotion cannot cross the age gate (FR4)", () => {
  const s = RS.replay([
    row("ancient", "firstTry"), row("modern", "firstTry"),
    row("f1", "firstTry"), row("f2", "firstTry"), row("f3", "firstTry"),
  ]);
  const opts = {
    recencyK: 0,
    currentEra: "ancient",
    currentWeek: 1,
    cue: ["modern"],
    events: [
      { id: "ancient", era: "ancient", week: 1 },
      { id: "modern", era: "modern", week: 9 },
    ],
  };
  for (const band of ["5-7", "8-11"]) {
    const set = RS.dueSet(s, "d1", band, opts);
    assert.ok(!set.includes("modern"), `${band} must not reach across eras even when cued`);
  }
});

test("cue: the cap is applied AFTER promotion, so a cued card survives it", () => {
  const s = cueFixture();
  const opts = { recencyK: 0, events: logEvents(6), cap: 2 };
  const out = RS.dueSet(s, "d1", "17+", Object.assign({}, opts, { cue: ["e5"] }));
  assert.equal(out.length, 2);
  assert.ok(out.includes("e5"), `the cued card was dropped by the cap: ${JSON.stringify(out)}`);
});

test("cue: the success floor still runs after promotion and still holds", () => {
  const log = [
    row("hard1", "slip"), row("hard1", "slip"),
    row("hard2", "slip"),
    row("easy", "firstTry"), row("easy", "firstTry"), row("easy", "firstTry"), row("easy", "firstTry"),
  ];
  const s = RS.replay(log);
  const out = RS.dueSet(s, "d1", "17+", { recencyK: 0, cue: ["hard2"] });
  const mean = out.reduce((t, id) => t + s[id].firstTry / s[id].attempts, 0) / out.length;
  assert.ok(mean >= 0.5, `mean success ${mean} should still be >= 0.5`);
  assert.ok(out.includes("easy"), "the easy card must survive the trim");
  assert.ok(out.includes("hard2"), "the cued hard card is the one kept");
  assert.ok(!out.includes("hard1"), "the un-cued equally-hard card is the one trimmed");
});

test("cue: dueSet still does not mutate its inputs when a cue is supplied", () => {
  const states = cueFixture();
  const opts = { recencyK: 0, events: logEvents(6), cue: ["e5", "e4"], order: { e5: 1, e4: 2 } };
  const statesBefore = JSON.stringify(states);
  const optsBefore = JSON.stringify(opts);
  RS.dueSet(states, "d1", "17+", opts);
  assert.equal(JSON.stringify(states), statesBefore, "dueSet rewrote the derived state");
  assert.equal(JSON.stringify(opts), optsBefore, "dueSet rewrote the options");
});

/* ---------------------------------------------------------------- helpers */

function logEvents(n, deck = "d1") {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push({ id: "e" + i, era: "modern", week: 1, deck });
  return out;
}
