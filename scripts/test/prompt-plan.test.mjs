#!/usr/bin/env node
/*
 * scripts/test/prompt-plan.test.mjs
 * ------------------------------------------------------------------
 * The pre-reveal prompt plan (prompt-plan.js) is pure and DOM-free, which is
 * the whole reason it can be tested here: the band gate and the `confidence`
 * schema guard are functions of their inputs and nothing else. This evaluates
 * the SHIPPED file (in this realm, via `vm.runInThisContext`, so object
 * comparisons stay same-realm) — the assertions are about the file the game
 * actually serves, not a copy.
 *
 * Covered here:
 *   AC1 (band matrix: 5–7 skipped, 8–11 self-check, 12+/unset full)
 *   AC3 (confidence written only for a real answer; never backfilled; pure)
 *   the once-per-round latch's "take exactly once" rule (T1)
 *   failure modes: unknown band = highest, non-object rows degrade
 *
 * The DOM half of the slice — the prompt actually rendering before the reveal,
 * the 4a why-at-slip copy, the 4d focus-panel gate and the row reaching storage
 * — is asserted by the browser smoke tools/offline-smoke/feedback.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

vm.runInThisContext(readFileSync(join(root, "prompt-plan.js"), "utf8"), {
  filename: join(root, "prompt-plan.js"),
});
const PP = globalThis.PromptPlan;

test("the module exposes the seam and loads with no DOM (classic script)", () => {
  assert.deepEqual(
    Object.keys(PP).sort(),
    ["CONFIDENCE_VALUES", "attachConfidence", "createLatch", "isValidConfidence", "promptPlan"]
  );
  assert.equal(typeof PP.promptPlan, "function");
  assert.equal(typeof PP.attachConfidence, "function");
  assert.equal(typeof PP.createLatch, "function");
  assert.deepEqual(PP.CONFIDENCE_VALUES, ["sure", "unsure"]);
});

/* --------------------------------------------------- promptPlan (AC1) */

test("the band matrix gates the prompt exactly as §20/A8 specify (AC1)", () => {
  assert.deepEqual(PP.promptPlan("5-7"), { show: false, kind: "none" });
  assert.deepEqual(PP.promptPlan("8-11"), { show: true, kind: "self-check" });
  assert.deepEqual(PP.promptPlan("12-16"), { show: true, kind: "predirected" });
  assert.deepEqual(PP.promptPlan("17+"), { show: true, kind: "predirected" });
});

test("an unset or unknown band behaves as the highest band (§5)", () => {
  // No feature is hidden behind age unless the profile actually set it.
  assert.deepEqual(PP.promptPlan(undefined), { show: true, kind: "predirected" });
  assert.deepEqual(PP.promptPlan(null), { show: true, kind: "predirected" });
  assert.deepEqual(PP.promptPlan(""), { show: true, kind: "predirected" });
  assert.deepEqual(PP.promptPlan("nonsense"), { show: true, kind: "predirected" });
  assert.deepEqual(PP.promptPlan("5-8"), { show: true, kind: "predirected" });
});

test("only 5–7 is ever skipped (AC1)", () => {
  for (const band of ["5-7", "8-11", "12-16", "17+", undefined, "bogus"]) {
    assert.equal(PP.promptPlan(band).show, band !== "5-7", `band=${band}`);
  }
});

/* --------------------------------------------- attachConfidence (AC3) */

test("a real answer adds confidence; the field is the only change (AC3)", () => {
  const row = { ts: 1, deck: "d1", eventId: "a", outcome: "slip", mode: "free" };
  const withSure = PP.attachConfidence(row, "sure");
  assert.deepEqual(withSure, { ...row, confidence: "sure" });
  const withUnsure = PP.attachConfidence(row, "unsure");
  assert.deepEqual(withUnsure, { ...row, confidence: "unsure" });
});

test("a skipped prompt writes NO field — absence is meaningful, never backfilled (AC3)", () => {
  const row = { ts: 1, deck: "d1", eventId: "a", outcome: "firstTry", mode: "free" };
  assert.deepEqual(PP.attachConfidence(row, null), row);
  assert.deepEqual(PP.attachConfidence(row, undefined), row);
  assert.deepEqual(PP.attachConfidence(row, ""), row);
  assert.deepEqual(PP.attachConfidence(row, "maybe"), row);
  assert.deepEqual(PP.attachConfidence(row, 1), row);
  assert.deepEqual(PP.attachConfidence(row, true), row);
  assert.ok(!("confidence" in PP.attachConfidence(row, null)), "a skip must not add the key");
});

test("attachConfidence is pure: the input row is not mutated (NFR1)", () => {
  const row = { ts: 1, deck: "d1", eventId: "a", outcome: "slip", mode: "free" };
  const before = JSON.stringify(row);
  PP.attachConfidence(row, "sure");
  PP.attachConfidence(row, "unsure");
  assert.equal(JSON.stringify(row), before);
  assert.ok(!("confidence" in row));
});

test("a malformed row degrades instead of throwing", () => {
  assert.equal(PP.attachConfidence(null, "sure"), null);
  assert.equal(PP.attachConfidence(undefined, "sure"), undefined);
  assert.equal(PP.attachConfidence("not-a-row", "sure"), "not-a-row");
});

test("isValidConfidence accepts only the two documented values", () => {
  assert.equal(PP.isValidConfidence("sure"), true);
  assert.equal(PP.isValidConfidence("unsure"), true);
  assert.equal(PP.isValidConfidence("Sure"), false);
  assert.equal(PP.isValidConfidence(undefined), false);
  assert.equal(PP.isValidConfidence(null), false);
});

/* ----------------------------------------------------- latch (T1) */

test("the once-per-round latch yields exactly one take (T1)", () => {
  const latch = PP.createLatch();
  assert.equal(latch.used(), false);
  assert.equal(latch.take(), true);   // first take wins
  assert.equal(latch.take(), false);  // every later take is refused
  assert.equal(latch.take(), false);
  assert.equal(latch.used(), true);
});

test("two latches are independent, and a reset re-arms (T1)", () => {
  const a = PP.createLatch();
  const b = PP.createLatch();
  assert.equal(a.take(), true);
  assert.equal(b.take(), true, "a second round's latch must not be spent by the first");
  assert.equal(a.take(), false);
  a.reset();
  assert.equal(a.used(), false);
  assert.equal(a.take(), true);
});
