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
    ["K_MAX", "K_MIN", "MAX_POW", "dueSet", "intervalKFor", "rate", "replay"]
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

/* ---------------------------------------------------------------- helpers */

function logEvents(n, deck = "d1") {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push({ id: "e" + i, era: "modern", week: 1, deck });
  return out;
}
