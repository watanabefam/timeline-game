/* prompt-plan.js — pure pre-reveal prompt plan → window.PromptPlan.
 *
 * The DOM-free half of the A8 feedback/confidence slice
 * (doc/FEEDBACK_CONFIDENCE_PLAN.md, GAMIFICATION_BRIEF §11 phase 4). It decides,
 * from the profile's age band alone, whether the one-per-round pre-reveal prompt
 * is shown and in which form — and it owns the two rules that must never drift:
 *
 *   promptPlan(band)             -> { show, kind }
 *       "5-7"                     -> { show:false, kind:"none" }        (§20: skip)
 *       "8-11"                    -> { show:true,  kind:"self-check" }   (one simple self-check)
 *       "12-16" | "17+" | unset   -> { show:true,  kind:"predirected" }  (full cycle)
 *   attachConfidence(row, answer) -> row' (+confidence ONLY for a real answer)
 *
 * `attachConfidence` is the schema guard for GAMIFICATION_BRIEF §6: `confidence`
 * is the only sanctioned log field, it is written **only** when the player
 * actually answered, and it is **never backfilled** — a skipped prompt leaves
 * the row exactly as it was, so absence stays meaningful and every reader must
 * tolerate `undefined`. The function never mutates its input.
 *
 * `createLatch()` is the once-per-round gate. It is deliberately a tiny object
 * rather than a boolean so the "take once" rule is unit-testable in Node: the
 * game holds one latch on its in-memory round state (never in storage, D3).
 *
 * No DOM, no persistence, no dependency (AGENTS.md rule 1). Loaded as a classic
 * script before timeline.js (index.html rule 4) and evaluated directly in Node
 * by scripts/test/prompt-plan.test.mjs.
 */
(function () {
  "use strict";

  // The band whose prompt is skipped entirely. 5–7 get progress indicators only
  // (working-memory overload from abstract self-rating; GAMIFICATION_BRIEF §20/A8).
  var SKIP_BAND = "5-7";
  // The band that gets the simplest self-check wording.
  var SELF_CHECK_BAND = "8-11";
  // Every value `confidence` may take on a log row. Anything else is treated as
  // "not answered" and writes no field.
  var CONFIDENCE_VALUES = ["sure", "unsure"];

  function promptPlan(band) {
    // Unset / unknown behaves as the highest band (GAMIFICATION_BRIEF §5: no
    // feature is hidden behind age unless the profile actually set it).
    if (band === SKIP_BAND) return { show: false, kind: "none" };
    if (band === SELF_CHECK_BAND) return { show: true, kind: "self-check" };
    return { show: true, kind: "predirected" };
  }

  function isValidConfidence(value) {
    return CONFIDENCE_VALUES.indexOf(value) !== -1;
  }

  function attachConfidence(row, answer) {
    if (!row || typeof row !== "object") return row;
    // A skipped / unknown answer must leave the row untouched — absence is the
    // signal, and fabricating a default would corrupt the calibration signal.
    if (!isValidConfidence(answer)) return row;
    var out = {};
    for (var k in row) {
      if (Object.prototype.hasOwnProperty.call(row, k)) out[k] = row[k];
    }
    out.confidence = answer;
    return out;
  }

  // Once-per-round gate. `take()` returns true exactly once.
  function createLatch() {
    var used = false;
    return {
      take: function () { if (used) return false; used = true; return true; },
      used: function () { return used; },
      reset: function () { used = false; },
    };
  }

  var api = {
    promptPlan: promptPlan,
    attachConfidence: attachConfidence,
    isValidConfidence: isValidConfidence,
    createLatch: createLatch,
    CONFIDENCE_VALUES: CONFIDENCE_VALUES,
  };

  var g = (typeof globalThis !== "undefined") ? globalThis : this;
  g.PromptPlan = api;
})();
