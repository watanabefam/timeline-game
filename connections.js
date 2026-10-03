/* connections.js — the authored connection graph, as a placement cue.
 * → window.Connections
 *
 * The DOM-free half of the slip-moment cue (doc/CONNECTION_CUE_PLAN.md). Decks
 * already carry an authored, directed `connections[]` graph (doc/CONNECTIONS.md);
 * until now nothing in the game read it. This module turns one edge into the one
 * line a player sees when they slip.
 *
 * The four rules it owns, none of which the game may re-derive:
 *   *   indexEdges(events)            -> { out, in, years, titles }
 *       Builds the forward and reverse indexes in one pass. It drops every edge
 *       it cannot trust: a dangling `to` (imported decks bypass the content
 *       gate), a self-reference, an unknown `type`, an endpoint whose year is
 *       not a number, and — RULE 1 — any edge whose endpoints contradict the
 *       model's "directed earlier -> later" storage rule.
 *
 *   cueFor(event, index, placedIds) -> cue | null
 *       The whole decision. RULE 2: only an edge whose PARTNER IS ALREADY ON
 *       THE PLAYER'S TIMELINE is eligible, because a causal claim about an event
 *       the player cannot see does not explain a placement. Returns null when
 *       nothing is eligible, which is the common case.
 *
 *   cueText(cue) / cueAnnounce(cue)
 *       RULE 3: the phrase is per-type AND per-direction, because `echo` is the
 *       mirror image of the causal types — the LATER event is the echo. One
 *       template for all four types writes a sentence that is backwards.
 *
 *   rationaleFor(cue, band) / isContested(cue, band)
 *       RULE 4: the age gate. The one-line phrase is safe at every band (it is
 *       the plain form doc/CONNECTIONS.md §3.1 already fixes), but the authored
 *       `rationale` is long prose and only 12+ see it.
 *
 * Why RULE 1 is checked here rather than trusted: `validate:content` asserts the
 * storage rule for shipped decks (it gained the check with this feature), but
 * imported decks never pass through that gate — and two shipped edges violated
 * the rule before they were moved. A misordered edge is not a cosmetic problem:
 * because the phrase table is direction-sensitive, it renders a sentence that is
 * simply false. So the runtime verifies, and the gate enforces.
 *
 * No DOM, no persistence, no dependency (AGENTS.md rule 1). Loaded as a classic
 * script before timeline.js (index.html rule 4) and evaluated directly in Node by
 * scripts/test/connections.test.mjs.
 */
(function () {
  "use strict";

  // The player-facing linking phrase, per type and per DIRECTION (doc/CONNECTIONS.md
  // §3.1). For an edge stored on A pointing at B, the card being explained can be
  // either endpoint: `target` is used when the card IS B, `source` when it is A.
  // `%s` is the partner's title.
  //   necessary    A made B possible        -> card B: "A made this possible"
  //   contributing A helped lead to B       -> card B: "A helped lead to this"
  //   trigger      A set off B              -> card B: "A set this off"
  //   echo         B is the later recurrence -> card B: "This mirrored A"
  // The echo row is the reverse of the others on purpose; see RULE 3 above.
  var PHRASES = {
    necessary: { target: "%s made this possible", source: "This made %s possible" },
    contributing: { target: "%s helped lead to this", source: "This helped lead to %s" },
    trigger: { target: "%s set this off", source: "This set off %s" },
    echo: { target: "This mirrored %s", source: "%s mirrored this" },
  };

  // Which type wins when two eligible edges are equally close in years. Lower is
  // stronger: a hard dependency explains a placement better than a parallel. The
  // year distance is the PRIMARY key (a near neighbour is the better anchor), so
  // this only ever breaks a tie.
  var TYPE_RANK = { necessary: 0, trigger: 1, contributing: 2, echo: 3 };

  // The bands that never see the authored `rationale` (long prose) or the
  // `contested` flag. Anything else — including an unset or unknown band — is
  // allowed, because §5 says no feature is hidden behind an age the player never
  // set.
  var PROSE_BLOCKED_BANDS = ["5-7", "8-11"];

  /** The year the timeline sorts by, or null when it cannot be known. */
  function sortYearOf(ev) {
    if (!ev) return null;
    if (typeof ev.sortYear === "number" && isFinite(ev.sortYear)) return ev.sortYear;
    if (typeof ev.year === "number" && isFinite(ev.year)) return ev.year;
    return null;
  }

  function push(list, key, value) {
    var cur = list.get(key);
    if (cur) cur.push(value);
    else list.set(key, [value]);
  }

  /**
   * One pass over every event's connections -> { out, in, years }.
   *
   * `out`: eventId -> [edge]                  (edges stored on that event)
   * `in`:  eventId -> [{ from, edge }]         (the derived reverse index — the
   *        one doc/CONNECTIONS.md §8 requires so a card can be cued from any edge
   *        touching it, in either direction)
   * `years`: eventId -> sortYear               (so cue selection can rank by
   *        year distance without a second lookup)
   * `titles`: eventId -> title                (the cue names the partner by title;
   *        a cue that names an id is not a cue)
   *
   * Never throws on malformed input; anything unusable is simply absent.
   */
  function indexEdges(events) {
    var out = new Map();
    var inc = new Map();
    var years = new Map();
    var titles = new Map();
    var empty = { out: out, in: inc, years: years, titles: titles };
    if (!Array.isArray(events)) return empty;
    var byId = new Map();
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e && typeof e.id === "string") {
        byId.set(e.id, e);
        var y = sortYearOf(e);
        if (y !== null) years.set(e.id, y);
        if (typeof e.title === "string" && e.title) titles.set(e.id, e.title);
      }
    }
    for (var j = 0; j < events.length; j++) {
      var ev = events[j];
      if (!ev || typeof ev.id !== "string" || !Array.isArray(ev.connections)) continue;
      var fromYear = sortYearOf(ev);
      for (var k = 0; k < ev.connections.length; k++) {
        var c = ev.connections[k];
        if (!c || typeof c !== "object") continue;
        if (typeof c.to !== "string" || c.to === ev.id) continue;
        var target = byId.get(c.to);
        if (!target) continue; // dangling — possible on an imported deck
        if (typeof c.type !== "string" || !PHRASES[c.type]) continue;
        var toYear = sortYearOf(target);
        // RULE 1: cannot verify the direction -> do not claim it.
        if (fromYear === null || toYear === null) continue;
        if (toYear < fromYear) continue;
        var edge = {
          from: ev.id,
          to: c.to,
          type: c.type,
          rationale: typeof c.rationale === "string" ? c.rationale : "",
          contested: c.contested === true,
        };
        push(out, ev.id, edge);
        push(inc, c.to, { from: ev.id, edge: edge });
      }
    }
    return { out: out, in: inc, years: years, titles: titles };
  }

  /**
   * Every edge that breaks the "stored on the earlier event" rule, as
   * { from, to, fromYear, toYear }. The content gate asserts this is empty for a
   * shipped deck; exported so that assertion can be a test rather than a claim.
   */
  function storageRuleViolations(events) {
    var bad = [];
    if (!Array.isArray(events)) return bad;
    var byId = new Map();
    for (var i = 0; i < events.length; i++) {
      if (events[i] && typeof events[i].id === "string") byId.set(events[i].id, events[i]);
    }
    for (var j = 0; j < events.length; j++) {
      var ev = events[j];
      if (!ev || typeof ev.id !== "string" || !Array.isArray(ev.connections)) continue;
      var fromYear = sortYearOf(ev);
      for (var k = 0; k < ev.connections.length; k++) {
        var c = ev.connections[k];
        if (!c || typeof c !== "object" || typeof c.to !== "string") continue;
        if (c.to === ev.id) continue;
        var target = byId.get(c.to);
        if (!target) continue; // dangling is a different defect
        var toYear = sortYearOf(target);
        if (fromYear === null || toYear === null) continue;
        if (toYear < fromYear) bad.push({ from: ev.id, to: c.to, fromYear: fromYear, toYear: toYear });
      }
    }
    return bad;
  }

  function asSet(placedIds) {
    if (placedIds instanceof Set) return placedIds;
    if (Array.isArray(placedIds)) return new Set(placedIds);
    if (placedIds && typeof placedIds.has === "function") return placedIds;
    return new Set();
  }

  function candidate(edge, partnerId, direction, cardYear, index, placed) {
    if (partnerId === edge.from && partnerId === edge.to) return null;
    if (!placed.has(partnerId)) return null; // RULE 2
    var partnerYear = index.years ? index.years.get(partnerId) : undefined;
    var distance =
      cardYear === null || partnerYear === undefined ? Infinity : Math.abs(partnerYear - cardYear);
    return {
      partnerId: partnerId,
      partnerYear: partnerYear === undefined ? null : partnerYear,
      type: edge.type,
      direction: direction,
      rationale: edge.rationale,
      contested: edge.contested,
      distance: distance,
    };
  }

  /**
   * The one cue for this card, or null. Pure and deterministic.
   *
   * @param {{id:string, title?:string}} event the card being explained
   * @param {{out:Map,in:Map,years:Map}} index from indexEdges
   * @param {Set<string>|string[]} placedIds the ids already on the player's timeline
   */
  function cueFor(event, index, placedIds) {
    if (!event || typeof event.id !== "string") return null;
    if (!index || !index.out || !index.in) return null;
    var placed = asSet(placedIds);
    var cardYear = sortYearOf(event);
    var found = [];

    var outgoing = index.out.get(event.id) || [];
    for (var i = 0; i < outgoing.length; i++) {
      var co = candidate(outgoing[i], outgoing[i].to, "source", cardYear, index, placed);
      if (co) found.push(co);
    }
    var incoming = index.in.get(event.id) || [];
    for (var j = 0; j < incoming.length; j++) {
      var ci = candidate(incoming[j].edge, incoming[j].from, "target", cardYear, index, placed);
      if (ci) found.push(ci);
    }
    if (!found.length) return null;

    found.sort(function (a, b) {
      if (a.distance !== b.distance) return a.distance - b.distance;
      var ra = TYPE_RANK[a.type] === undefined ? 99 : TYPE_RANK[a.type];
      var rb = TYPE_RANK[b.type] === undefined ? 99 : TYPE_RANK[b.type];
      if (ra !== rb) return ra - rb;
      return a.partnerId < b.partnerId ? -1 : a.partnerId > b.partnerId ? 1 : 0;
    });

    var best = found[0];
    // Name the partner by title; fall back to the id only when the deck has none,
    // so the line is always something rather than a blank.
    var partnerTitle = best.partnerId;
    if (index.titles && typeof index.titles.get === "function") {
      var t = index.titles.get(best.partnerId);
      if (typeof t === "string" && t) partnerTitle = t;
    }
    return {
      cardId: event.id,
      partnerId: best.partnerId,
      partnerTitle: partnerTitle,
      type: best.type,
      direction: best.direction,
      rationale: best.rationale,
      contested: best.contested,
      distance: best.distance,
    };
  }

  /** The player-facing line, e.g. "The House of Wisdom made this possible." */
  function cueText(cue) {
    if (!cue || typeof cue !== "object") return "";
    var row = PHRASES[cue.type];
    if (!row) return "";
    var template = row[cue.direction];
    if (!template) return "";
    var title = typeof cue.partnerTitle === "string" && cue.partnerTitle ? cue.partnerTitle : cue.partnerId;
    if (typeof title !== "string" || !title) return "";
    return template.replace("%s", title) + ".";
  }

  /** The same cue as a sentence for a live region, labelled so it is not a stray line. */
  function cueAnnounce(cue) {
    var text = cueText(cue);
    return text ? "Connection: " + text : "";
  }

  function proseAllowed(band) {
    return PROSE_BLOCKED_BANDS.indexOf(band) === -1;
  }

  /** The authored rationale, for 12+ only. null when absent or age-blocked. */
  function rationaleFor(cue, band) {
    if (!cue || typeof cue !== "object") return null;
    if (typeof cue.rationale !== "string" || !cue.rationale) return null;
    return proseAllowed(band) ? cue.rationale : null;
  }

  /** True only for a contested link the band may see. */
  function isContested(cue, band) {
    if (!cue || typeof cue !== "object" || cue.contested !== true) return false;
    return proseAllowed(band);
  }

  var api = {
    indexEdges: indexEdges,
    storageRuleViolations: storageRuleViolations,
    cueFor: cueFor,
    cueText: cueText,
    cueAnnounce: cueAnnounce,
    rationaleFor: rationaleFor,
    isContested: isContested,
    sortYearOf: sortYearOf,
    PHRASES: PHRASES,
    PROSE_BLOCKED_BANDS: PROSE_BLOCKED_BANDS,
  };

  var g = typeof globalThis !== "undefined" ? globalThis : this;
  g.Connections = api;
})();
