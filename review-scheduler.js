/* review-scheduler.js — pure reach-back review scheduler → window.ReviewScheduler.
 *
 * The learning engine behind the review queue (doc/REVIEW_QUEUE_PLAN.md). It is
 * deliberately DOM-free and side-effect-free: every function derives its answer
 * from the append-only `reviewLog` passed in, and NOTHING here persists mutable
 * scheduler state (GAMIFICATION_BRIEF D3). That is what keeps the state a
 * function of the log — and therefore sync-safe later — and what lets the whole
 * module be unit-tested in Node.
 *
 *   replay(logRows)                            -> { [eventId]: EventState }
 *   rate(state, outcome)                       -> { state, nextDue: { dueAfterPlacements } }
 *   dueSet(stateByEvent, deckId, band, opts)   -> string[]   (ordered, age-gated & capped)
 *   masteryByEvent(logRows, alpha?)            -> { [eventId]: 0-100 } (display mastery)
 *
 *   EventState = { deck, lastSeenPos, attempts, firstTry, streak, intervalK }
 *
 * Design notes (all traceable to the plan / evidence base):
 *   - "Round" = one logged placement. Reach-back uses LOG-TAIL recency
 *     (`lastSeenPos` = placements since last seen), never wall-clock, so it is
 *     schema-free and DST-proof (plan Phase 1, Assumption 1 / Edge Cases).
 *   - `intervalK` is derived, never stored:
 *         intervalK = clamp(K_MIN · 2^min(streak, MAX_POW), K_MIN, K_MAX)
 *     A `firstTry` extends the streak (wider interval); a `slip` resets it to
 *     K_MIN (Leitner-style promotion). (plan FR2.)
 *   - Age gate (FR4 / A2, §20): bands 5–7 and 8–11 only ever review an event in
 *     the SAME era/week block; 12+, 17+ and unset may cross eras. When a gated
 *     band arrives without a current era/week, the safe answer is an empty set —
 *     never cross-era content for the youngest players.
 *   - Success floor (§11): the served set's mean first-try rate is held at or
 *     above ~50%, so a queue of the hardest cards cannot turn review into a
 *     demoralising grind.
 *   - `deck` is carried on EventState (a small, needed extension to the plan's
 *     list) so `dueSet` can scope to one deck without re-reading the log.
 *
 * This is the L2 seam named in GAMIFICATION_BRIEF A10: a future FSRS swap
 * replaces the bodies of `replay`/`rate` only — never this interface, and never
 * a fork of the vendored lib. See doc/LIBRARY_RESEARCH.md:112.
 */
(function () {
  "use strict";

  // ---- tuning (plan Phase 3 defaults) ------------------------------------
  var K_MIN = 3;       // placements before the easiest card is due again
  var K_MAX = 24;      // ceiling, so a long streak cannot bury a card forever
  var MAX_POW = 3;     // 3 → 6 → 12 → 24, then clamped
  var STRUGGLE_W = 4;  // a fully-slipped card outweighs 4 placements of recency
  var EARLIER_W = 2;   // older eras are preferred by this much per step
  var DEFAULT_SUCCESS_FLOOR = 0.5;
  var GATED_BANDS = ["5-7", "8-11"];

  function clamp(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }

  function intervalKFor(streak) {
    var s = streak > 0 ? streak : 0;
    var pow = s < MAX_POW ? s : MAX_POW;
    return clamp(K_MIN * Math.pow(2, pow), K_MIN, K_MAX);
  }

  function baseState(deck) {
    return {
      deck: deck == null ? null : String(deck),
      lastSeenPos: 0,
      attempts: 0,
      firstTry: 0,
      streak: 0,
      intervalK: K_MIN,
    };
  }

  function successOf(state) {
    if (!state || !state.attempts) return 0;
    return state.firstTry / state.attempts;
  }

  // ---- replay: fold the log into per-event state --------------------------
  function replay(logRows) {
    var rows = Array.isArray(logRows) ? logRows : [];
    var states = {};
    var lastIndex = {};
    for (var i = 0; i < rows.length; i += 1) {
      var r = rows[i];
      if (!r || typeof r !== "object") continue;
      var id = r.eventId;
      if (id == null) continue;
      id = String(id);
      var s = states[id];
      if (!s) s = states[id] = baseState(r.deck);
      if (r.deck != null) s.deck = String(r.deck);
      s.attempts += 1;
      if (r.outcome === "firstTry") {
        s.firstTry += 1;
        s.streak += 1;
      } else {
        // Any non-firstTry outcome (a slip, or an unknown value) is not a
        // success — reset the streak rather than guess.
        s.streak = 0;
      }
      s.intervalK = intervalKFor(s.streak);
      lastIndex[id] = i;
    }
    var n = rows.length;
    Object.keys(states).forEach(function (id) {
      states[id].lastSeenPos = (n - 1) - lastIndex[id];
    });
    return states;
  }

  // ---- masteryByEvent: recency-weighted mastery for DISPLAY ---------------
  // Same log as `replay`, different question: "what's due?" vs "how well do I
  // know this now?". An exponential moving average over each event's own rows,
  // seeded with the first observation (one clean attempt reads 100, one slip
  // reads 0). EMA is the mastery criterion the literature recommends for
  // progress bars specifically: unlike a last-N window it distinguishes
  // 1,0,1,0 from 0,0,1,1, and a correct answer always moves the estimate up
  // (Pelanek & Rihak, "Experimental Analysis of Mastery Learning Criteria";
  // Pavlik et al., "Move Your Lamp Post" — recent data predicts knowledge
  // best). `alpha` weights the newest outcome; 0.3 leaves the last 3-5 attempts
  // carrying most of the signal — the spacing window in
  // doc/references/mcg_research_synthesis.md §10. Derived on read, never
  // stored (D3), and pure like the rest of the module.
  var MASTERY_ALPHA = 0.3;
  function masteryByEvent(logRows, alpha) {
    var rows = Array.isArray(logRows) ? logRows : [];
    var a = (typeof alpha === "number" && alpha > 0 && alpha <= 1) ? alpha : MASTERY_ALPHA;
    var ema = {};
    for (var i = 0; i < rows.length; i += 1) {
      var r = rows[i];
      if (!r || typeof r !== "object" || r.eventId == null) continue;
      var id = String(r.eventId);
      var x = (r.outcome === "firstTry") ? 1 : 0;
      ema[id] = (ema[id] === undefined) ? x : (a * x + (1 - a) * ema[id]);
    }
    var out = {};
    Object.keys(ema).forEach(function (id) { out[id] = Math.round(ema[id] * 100); });
    return out;
  }

  // ---- rate: apply one outcome, return the next derived due ----------------
  function rate(state, outcome) {
    var s = (state && typeof state === "object") ? state : baseState(null);
    var attempts = (s.attempts | 0) + 1;
    var firstTry = s.firstTry | 0;
    var streak = s.streak | 0;
    if (outcome === "firstTry") { firstTry += 1; streak += 1; }
    else { streak = 0; }
    var next = {
      deck: s.deck == null ? null : String(s.deck),
      lastSeenPos: 0, // just seen
      attempts: attempts,
      firstTry: firstTry,
      streak: streak,
      intervalK: intervalKFor(streak),
    };
    return { state: next, nextDue: { dueAfterPlacements: next.intervalK } };
  }

  // ---- dueSet: reach-back selection ---------------------------------------
  function isGatedBand(band) { return GATED_BANDS.indexOf(band) !== -1; }

  // Normalize `opts.events` (array or id→meta map) into a plain lookup.
  function metaIndex(events) {
    var map = {};
    if (Array.isArray(events)) {
      for (var i = 0; i < events.length; i += 1) {
        var e = events[i];
        if (e && e.id != null) map[String(e.id)] = e;
      }
    } else if (events && typeof events === "object") {
      Object.keys(events).forEach(function (k) { map[String(k)] = events[k]; });
    }
    return map;
  }

  function dueSet(stateByEvent, deckId, band, opts) {
    var o = opts || {};
    var states = (stateByEvent && typeof stateByEvent === "object") ? stateByEvent : {};
    var recencyK = typeof o.recencyK === "number" ? o.recencyK : K_MIN;
    var floor = typeof o.successFloor === "number" ? o.successFloor : DEFAULT_SUCCESS_FLOOR;
    var meta = metaIndex(o.events);
    var gated = isGatedBand(band);
    var eraOrder = Array.isArray(o.eraOrder) ? o.eraOrder : [];
    var currentEraIdx = eraOrder.indexOf(o.currentEra);

    var candidates = [];
    Object.keys(states).forEach(function (id) {
      var s = states[id];
      if (!s || !s.attempts) return;
      // Strict: a review set must not leak a card from another deck. A row that
      // never recorded a deck cannot be attributed, so it is not served here.
      if (deckId != null && s.deck !== String(deckId)) return;
      if (s.lastSeenPos < recencyK) return; // not far enough back yet
      var m = meta[id];
      if (gated) {
        // Only ever the current era/week block. With no current context the
        // safe answer is to serve nothing (FR4 / §20).
        var sameEra = o.currentEra != null && m && m.era === o.currentEra;
        var sameWeek = o.currentWeek != null && m && m.week === o.currentWeek;
        if (!(sameEra || sameWeek)) return;
      }
      var struggle = 1 - successOf(s);
      var earlier = 0;
      if (!gated && currentEraIdx >= 0 && m && eraOrder.indexOf(m.era) >= 0) {
        earlier = Math.max(0, currentEraIdx - eraOrder.indexOf(m.era));
      }
      candidates.push({
        id: id,
        score: s.lastSeenPos + STRUGGLE_W * struggle + EARLIER_W * earlier,
        recency: s.lastSeenPos,
        success: successOf(s),
      });
    });

    // Deterministic order: score desc, then recency desc, then id asc.
    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.recency !== a.recency) return b.recency - a.recency;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });

    var cap = typeof o.cap === "number" && o.cap >= 0 ? o.cap : candidates.length;
    var selected = candidates.slice(0, cap);

    // Success floor: drop the likeliest-to-fail cards until the served set's
    // mean first-try rate is at or above the floor (§11). Never trim below 1.
    while (selected.length > 1) {
      var mean = selected.reduce(function (t, c) { return t + c.success; }, 0) / selected.length;
      if (mean >= floor) break;
      // Among equally hard cards, drop the LEAST overdue (the later one):
      // selection is most-overdue-first, so keeping the earliest preserves the
      // card that has waited longest — a reach-back queue must not trade away
      // its own oldest memory to make the numbers look gentler.
      var worst = 0;
      for (var j = 1; j < selected.length; j += 1) {
        if (selected[j].success <= selected[worst].success) worst = j;
      }
      selected.splice(worst, 1);
    }

    return selected.map(function (c) { return c.id; });
  }

  var api = {
    replay: replay,
    rate: rate,
    dueSet: dueSet,
    masteryByEvent: masteryByEvent,
    // Exposed so callers and tests can reason about the same numbers.
    K_MIN: K_MIN,
    K_MAX: K_MAX,
    MAX_POW: MAX_POW,
    intervalKFor: intervalKFor,
    MASTERY_ALPHA: MASTERY_ALPHA,
  };

  var g = (typeof globalThis !== "undefined") ? globalThis : this;
  g.ReviewScheduler = api;
})();
