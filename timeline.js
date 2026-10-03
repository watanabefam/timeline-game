/*
 * timeline.js — core game engine for the Timeline Game
 * ------------------------------------------------------------------
 * Pluggable by DECK. Each deck (window.DECKS) carries its own events and
 * its own filters (multi-select groups). The flow per run:
 *
 *   hub  -> pick a deck (and optional Daily/Endless mode)
 *   setup-> for the chosen deck, show its filter screens (By Ages / By Weeks /
 *           By Continents, etc.); the player picks one or more options per
 *           group; within a group the choice is OR, across groups it is AND;
 *           "no selection" in a group = whole deck.
 *   game -> the(optionally filtered) subset is seeded, two anchors are
 *           revealed, and the player inserts the rest into gaps (Timdle/WHEN?
 *           loop). Scoring rises 1..N as the line grows.
 *   results -> score screen + full reveal.
 *
 * No build step, no backend. Loads after events-data.js in the page.
 */

(function () {
  "use strict";

  // ---- tunables --------------------------------------------------
  const TOTAL_PLACEMENTS = 8;     // default placements when game is null (Timdle = 8)
  const POINTS_PER_CARD = 3;      // flat value per placed card; each slip costs 1 (floor 0)
  const MIN_PLACEMENTS = 3;       // smallest playable puzzle
  const ANCHOR_COUNT = 2;         // pre-placed events (WHEN? = 2)
  const ENDLESS_LIVES = 2;        // WHEN? = 2
  // After this many misses on one card the game reveals the answer: it scrolls
  // to the correct gap, highlights it, explains *why*, and lets the player place
  // it themselves (guided completion, not auto-place). Productive-failure
  // research (GAMIFICATION_BRIEF A6/§9) requires the canonical answer to follow
  // sustained floundering; keeping the final tap with the learner preserves
  // agency and the worked-example benefit. A further stray tap auto-places.
  const RESCUE_AFTER = 3;
  // MIN_SUBSET removed: placements adapt to the selected scope, so a single
  // week (7 cards) or small continent can be played. The "Play count" selector
  // sets how many events YOU place; total cards = count + 2 pre-placed
  // anchors (>= MIN_PLACEMENTS). "All" places the whole filtered subset.

  // ---- keyboard input layer ----------------------------------------
  // keyMap → state object → game reads state. The game never listens to raw
  // key events; it reads `input.held` (continuous) and subscribes to
  // `input.onPress` (one-shot actions). event.code = physical key, so
  // bindings survive AZERTY/Dvorak layouts. preventDefault is whitelisted
  // (game keys only — Ctrl+R, Ctrl+Tab etc. keep working). State clears on
  // window blur so a tab switch can't leave keys stuck "held".
  const input = (() => {
    const held = new Set();       // codes currently down (movement/scroll)
    const pressHandlers = new Map(); // code -> fn, fired on initial press only
    const GAME_KEYS = new Set([
      "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "Home", "End", "Enter", "Space",
      "KeyW", "KeyA", "KeyS", "KeyD", "KeyE",
    ]);

    function onKeyDown(e) {
      if (!GAME_KEYS.has(e.code)) return;
      // Never hijack keys while the user is typing in a field.
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.repeat) return; // held keys: only the initial press fires actions
      held.add(e.code);
      const fn = pressHandlers.get(e.code);
      if (fn) fn(e); // handlers call preventDefault only when they act
    }
    function onKeyUp(e) {
      held.delete(e.code);
    }
    function onBlur() {
      held.clear();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return {
      held,
      onPress(code, fn) { pressHandlers.set(code, fn); },
      offPress(code) { pressHandlers.delete(code); },
    };
  })();

  // ---- roving tabindex for the timeline gaps ------------------------
  // One gap is in the tab order (tabindex="0"); the rest are reachable with
  // arrow keys (tabindex="-1"). Follows the settings-tabs pattern already in
  // this file. syncGapTabindex promotes the focused gap (or the first) after
  // every rebuild/insert; initGapRoving wires arrow/Home/End navigation.
  function syncGapTabindex(tl, ctx) {
    if (!tl) return;
    const gaps = Array.from(tl.querySelectorAll(".gap"));
    if (!gaps.length) return;
    let target;
    if (ctx && splitCtx && splitCtx.length) {
      // Split: follow the player's virtual cursor, not DOM focus — the browser
      // has one activeElement but each player owns their own cursor.
      target = ctx.cursor;
    } else {
      // Promote the focused gap if it's still a gap; else the first gap.
      const active = document.activeElement;
      const activeIdx = gaps.indexOf(active);
      target = activeIdx >= 0 ? activeIdx : 0;
    }
    if (target < 0 || target >= gaps.length) target = 0;
    gaps.forEach((g, i) => g.setAttribute("tabindex", i === target ? "0" : "-1"));
  }

  // Smooth-scroll a gap to the vertical center of its pane. Interruptible:
  // every call cancels the pane's in-flight animation, so rapid cursor moves
  // never queue — each restart begins from the live scrollTop and the total
  // time stays ~one duration. Keyboard cursor moves call this; mouse clicks
  // keep the browser's default minimal scroll (no yank).
  const paneScrollRaf = new WeakMap(); // pane -> in-flight rAF id
  function smoothCenterGap(gap, pane) {
    if (!gap || !pane) return;
    // getBoundingClientRect deltas are robust to offsetParent (the timeline
    // isn't positioned); clamp into the scrollable range.
    const gapMid = gap.getBoundingClientRect().top - pane.getBoundingClientRect().top +
      gap.offsetHeight / 2;
    const target = pane.scrollTop + gapMid - pane.clientHeight / 2;
    const max = pane.scrollHeight - pane.clientHeight;
    const clamped = Math.max(0, Math.min(max, target));
    const ongoing = paneScrollRaf.get(pane);
    if (ongoing) cancelAnimationFrame(ongoing);
    paneScrollRaf.delete(pane);
    // Reduced motion (read at call time): instant center, no animation.
    const reduced = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { pane.scrollTop = clamped; return; }
    if (Math.abs(clamped - pane.scrollTop) < 2) return; // already centered
    const start = pane.scrollTop;
    const dur = 220;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      pane.scrollTop = start + (clamped - start) * eased;
      if (p < 1) paneScrollRaf.set(pane, requestAnimationFrame(step));
      else paneScrollRaf.delete(pane);
    };
    paneScrollRaf.set(pane, requestAnimationFrame(step));
  }

  function initGapRoving(root) {
    const tl = root ? root.querySelector(".timeline") : $("timeline");
    if (!tl) return;
    const move = (dir) => {
      const gaps = Array.from(tl.querySelectorAll(".gap"));
      if (!gaps.length) return;
      const idx = gaps.indexOf(document.activeElement);
      if (idx === -1) return; // focus not on a gap — don't hijack
      // Skip locked gaps (rescue makes every non-target gap inert).
      let next = idx + dir;
      while (next >= 0 && next < gaps.length && gaps[next].classList.contains("gap--locked")) {
        next += dir;
      }
      if (next < 0 || next >= gaps.length) return;
      gaps.forEach((g, i) => g.setAttribute("tabindex", i === next ? "0" : "-1"));
      // Suppress the browser's instant jump; the smooth follow owns the scroll.
      gaps[next].focus({ preventScroll: true });
      smoothCenterGap(gaps[next], root);
    };
    const jump = (toEnd) => {
      const gaps = Array.from(tl.querySelectorAll(".gap"));
      if (!gaps.length) return;
      if (gaps.indexOf(document.activeElement) === -1) return;
      let next = toEnd ? gaps.length - 1 : 0;
      while (next >= 0 && next < gaps.length && gaps[next].classList.contains("gap--locked")) {
        next += toEnd ? -1 : 1;
      }
      if (next < 0 || next >= gaps.length) return;
      gaps.forEach((g, i) => g.setAttribute("tabindex", i === next ? "0" : "-1"));
      gaps[next].focus({ preventScroll: true });
      smoothCenterGap(gaps[next], root);
    };
    // User takes over: a manual scroll cancels any in-flight follow animation
    // so the two never fight.
    ["wheel", "touchstart", "pointerdown"].forEach((ev) => {
      root.addEventListener(ev, () => {
        const ongoing = paneScrollRaf.get(root);
        if (ongoing) { cancelAnimationFrame(ongoing); paneScrollRaf.delete(root); }
      }, { passive: true });
    });
    // Pane-scoped keydown: only acts when focus is INSIDE this pane, so two
    // split panes never steal each other's arrow keys. (Global input.onPress
    // would collide — one handler per code.)
    root.addEventListener("keydown", (e) => {
      if (splitCtx && splitCtx.length) return; // split: keys are document-level
      if (!root.contains(document.activeElement)) return;
      // Step: W/← up, S/→ down. Jump: E/↑ (start), D/↓ (end). Home/End also
      // jump. Same semantics as the split bindings.
      if (e.key === "ArrowRight" || e.key === "s" || e.key === "S") { move(1); e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "w" || e.key === "W") { move(-1); e.preventDefault(); }
      else if (e.key === "ArrowUp" || e.key === "e" || e.key === "E" || e.key === "Home") { jump(false); e.preventDefault(); }
      else if (e.key === "ArrowDown" || e.key === "d" || e.key === "D" || e.key === "End") { jump(true); e.preventDefault(); }
    });
  }

  // ---- handicap system ----------------------------------------------
  // Per-player difficulty levers, so mixed-age siblings can play fairly.
  // Each mode declares which levers it supports (HANDICAP_LEVERS); the setup
  // screen shows only those. Levers are additive offsets from the base rules.
  const HANDICAP_LEVERS = {
    timeline: {
      startDelayMs: { step: 1000, max: 5000, label: "Delayed start", unit: "s" },
      toleranceYears: { step: 5, max: 25, label: "Extra tolerance", unit: "yr" },
      extraSlips: { step: 1, max: 3, label: "Extra slips", unit: "" },
    },
  };
  function createPlayer(name, handicap) {
    return { id: name, name, score: 0, handicap: handicap || {} };
  }
  // Wrap a one-shot action in the player's input delay (0 = immediate).
  function withInputDelay(player, fn) {
    const ms = (player.handicap && player.handicap.inputDelayMs) || 0;
    if (!ms) return fn;
    return () => setTimeout(fn, ms);
  }
  // Read the setup-screen handicap sliders into a handicap object for a mode.
  function readHandicap(mode, which) {
    const levers = HANDICAP_LEVERS[mode] || {};
    const out = {};
    Object.keys(levers).forEach((lever) => {
      const el = $("handicap-" + which);
      if (el) out[lever] = parseInt(el.value, 10) || 0;
    });
    return out;
  }

  // ---- deterministic RNG (mirrors WHEN?'s FNV-1a + mulberry32) ----
  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(items, seed) {
    const rnd = mulberry32(seed);
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // ---- date helpers ----------------------------------------------
  function utcDateKey(d) {
    return d.toISOString().slice(0, 10);
  }
  function localDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function dayNumber(dateKey) {
    const [y, m, d] = dateKey.split("-").map(Number);
    return Math.max(1, Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000) + 1);
  }

  // ---- era buckets (shared by age filters) -----------------------
  const ERAS = [
    { name: "prehistory", test: (y) => y == null },
    { name: "ancient", test: (y) => y < 450 },
    { name: "medieval", test: (y) => y >= 450 && y < 1500 },
    { name: "early-modern", test: (y) => y >= 1500 && y < 1760 },
    { name: "industrial", test: (y) => y >= 1760 && y < 1970 },
    { name: "modern", test: (y) => y >= 1970 },
  ];
  function eraOf(year) {
    const e = ERAS.find((er) => er.test(year));
    return e ? e.name : "modern";
  }

  // ---- deck registry helpers -------------------------------------
  function getDeck(deckId) {
    return window.DECKS.find((d) => d.id === deckId) || window.DECKS[0];
  }
  function eventById(deck, id) {
    return deck.events.find((e) => e.id === id);
  }

  // Apply a deck's filter selections to produce the playable subset.
  // selections: { filterId: [value, ...] }   (missing/empty = whole deck)
  function filterSubset(deck, selections) {
    return deck.events.filter((ev) => {
      for (const f of deck.filters || []) {
        const picked = (selections && selections[f.id]) || [];
        if (!picked.length) continue; // no selection in this group => pass
        const got = f.get(ev);
        const gotArr = Array.isArray(got) ? got : [got];
        if (!gotArr.some((g) => picked.includes(g))) return false; // AND across groups
      }
      return true;
    });
  }

  function maxScore(state) {
    // Flat scoring: every placed card is worth POINTS_PER_CARD at its best.
    const n = (state && state.placements) || TOTAL_PLACEMENTS;
    return POINTS_PER_CARD * n;
  }

  // ---- state -----------------------------------------------------
  let game = null;
  let statsUserId = null;
  let statsDeckId = null;
  let statsTlMode = "all";   // timeline summary: "all" | "practiced"
  let browseTlMode = "all";
  let statsTimeline = null;
  let browseTimeline = null;
  let groupedTimeline = null; // preview grouped timeline (library, below the flat one)
  let groupedStrategyId = "continent";
  let ui = {
    deck: null,
    selections: {},
    setupFilterIdx: 0,
    maxEvents: null, // null = play all filtered events
    subset: [],
  };

  // ---- persistence ----------------------------------------------
  const USERS_KEY = "timeline.users.v1";
  function userKey(id) { return "timeline.user." + id + ".v1"; }
  function readUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)); } catch (_) { return null; }
  }
  function writeUsers(u) { try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch (_) {} }
  function newUser(name) {
    return { id: "u" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
             name, createdAt: Date.now(), hue: nameHue(name) };
  }
  function nameHue(name) {
    let h = 0;
    for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  }
  function ensureUsers() {
    let u = readUsers();
    if (!u || !Array.isArray(u.users) || !u.users.length) {
      // Migration: the old single-profile install becomes "Player 1".
      u = { users: [newUser("Player 1")], activeId: null };
      u.activeId = u.users[0].id;
      writeUsers(u);
    }
    if (!u.users.some((x) => x.id === u.activeId)) u.activeId = u.users[0].id;
    return u;
  }
  function activeUser() {
    const u = ensureUsers();
    return u.users.find((x) => x.id === u.activeId) || u.users[0];
  }
  const GMAIL_COLORS = [
    "#039BE5","#7B1FA2","#E67C73","#C2185B","#F4511E",
    "#3F51B5","#00897B","#689F38","#FDD835","#F57C00",
    "#5C6BC0","#00ACC1","#D81B60","#8E24AA","#3949AB",
    "#00897B","#43A047","#FDD835","#FB8C00","#546E7A",
  ];
  function letterColor(ch) {
    const code = ch.toUpperCase().charCodeAt(0);
    if (code < 65 || code > 90) return GMAIL_COLORS[0];
    return GMAIL_COLORS[(code - 65) % GMAIL_COLORS.length];
  }
  function isDefaultName(name) { return /^Player \d+$/.test(name.trim()); }
  function updateAppbarAvatars() {
    const u = activeUser();
    const letter = (u.name.trim()[0] || "?").toUpperCase();
    const showAvatar = !isDefaultName(u.name);
    document.querySelectorAll(".user-btn").forEach((btn) => {
      const icon = btn.querySelector(".ico");
      const av = btn.querySelector(".appbar-avatar");
      if (!icon || !av) return;
      if (showAvatar) {
        icon.classList.add("hidden");
        av.classList.remove("hidden");
        av.style.background = letterColor(u.name.trim()[0] || "P");
        av.textContent = letter;
      } else {
        icon.classList.remove("hidden");
        av.classList.add("hidden");
      }
    });
  }
  function readUser(id) {
    try { return JSON.parse(localStorage.getItem(userKey(id))) || { decks: {} }; }
    catch (_) { return { decks: {} }; }
  }
  function writeUser(id, p) { try { localStorage.setItem(userKey(id), JSON.stringify(p)); } catch (_) {} }

  // ---- review log + derived streak (GAMIFICATION_BRIEF §6, §11 phase 1) ----
  // The motivational layer (streak, level, achievements) is DERIVED, never
  // stored: only this append-only outcome log (+ tiny meta) is written, so a
  // future cloud sync (roadmap §6.4) can replicate the log verbatim and
  // re-derive every surface. Phase 1 is data only — no UI yet.
  const REVIEW_LOG_CAP = 2000;
  function localTimeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
    catch (_) { return "UTC"; }
  }
  // `Intl.DateTimeFormat` construction is expensive, so one formatter is
  // cached per zone and reused across all log rows (the streak walks up to
  // REVIEW_LOG_CAP rows, which must not build a formatter each time).
  const DAY_FORMATTERS = new Map();
  function dayFormatter(tz) {
    let fmt = DAY_FORMATTERS.get(tz);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      });
      DAY_FORMATTERS.set(tz, fmt);
    }
    return fmt;
  }
  // Local calendar day (YYYY-MM-DD) for a UTC timestamp in an IANA zone. The
  // IANA id (not a fixed offset) carries the DST rules, and we read the parts
  // rather than a locale string so the key is unambiguous.
  function localDayKey(ts, tz) {
    try {
      const parts = dayFormatter(tz || localTimeZone()).formatToParts(new Date(ts));
      const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
      return `${get("year")}-${get("month")}-${get("day")}`;
    } catch (_) {
      return new Date(ts).toISOString().slice(0, 10);
    }
  }
  // Move a YYYY-MM-DD key by whole CALENDAR days. Never 24-hour arithmetic:
  // a DST day is 23 or 25 hours long, so "now - 86400000" can land on the
  // wrong local date (it silently skips back two days across a spring-forward).
  function shiftDayKey(key, delta) {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + delta));
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  function appendReviewLog(p, rows) {
    const log = Array.isArray(p.reviewLog) ? p.reviewLog : (p.reviewLog = []);
    for (const r of rows) log.push(r);
    if (log.length > REVIEW_LOG_CAP) log.splice(0, log.length - REVIEW_LOG_CAP);
    p.meta = Object.assign({}, p.meta, { tz: localTimeZone() });
  }
  // Sorted unique active days (ascending) from the review log.
  function activeDays(p) {
    const tz = (p && p.meta && p.meta.tz) || localTimeZone();
    const set = new Set();
    for (const r of Array.isArray(p && p.reviewLog) ? p.reviewLog : []) {
      if (r && r.ts) set.add(localDayKey(r.ts, tz));
    }
    return [...set].sort();
  }
  // Current streak: walk backward one CALENDAR day at a time from today (or
  // from yesterday, so a day not yet played today is forgiven until it is
  // actually missed — D2 forgiveness; the "paused" UI arrives in phase 2).
  // Day-string comparison, not elapsed-hours, so DST cannot break a streak.
  function currentStreak(p, now) {
    const set = new Set(activeDays(p));
    if (!set.size) return 0;
    const tz = (p && p.meta && p.meta.tz) || localTimeZone();
    const today = localDayKey(now == null ? Date.now() : now, tz);
    let cursor = set.has(today) ? today : shiftDayKey(today, -1);
    let streak = 0;
    while (set.has(cursor)) {
      streak += 1;
      cursor = shiftDayKey(cursor, -1);
    }
    return streak;
  }
  // Forward-only timezone sync (D1/D3): if the device zone changed, newly
  // logged rows group by the new zone; past rows are never rewritten.
  function syncTimezone() {
    const u = readUsers();
    if (!u || !Array.isArray(u.users)) return;
    const tz = localTimeZone();
    let changed = false;
    u.users.forEach((usr) => {
      const p = readUser(usr.id);
      if (!p.meta || p.meta.tz !== tz) {
        p.meta = Object.assign({}, p.meta, { tz });
        writeUser(usr.id, p);
        changed = true;
      }
    });
    return changed;
  }

  // ---- age band (GAMIFICATION_BRIEF §5, D7/A3) -----------------------------
  // One helper, one source of truth. A profile with no declared band behaves
  // as the highest one, so no surface is ever hidden behind an age the player
  // never set (§5: "unset behaves as the highest band").
  const AGE_BANDS = ["5-7", "8-11", "12-16", "17+"];
  function band(user) {
    const b = user && user.ageBand;
    return AGE_BANDS.includes(b) ? b : "17+";
  }
  // Mastery as a 0–4 star readout for the youngest band: a progress indicator
  // that carries no percentage and no "not enough data" copy (§5, A3).
  function masteryStars(pct) {
    if (pct >= 90) return 4;
    if (pct >= 75) return 3;
    if (pct >= 50) return 2;
    if (pct > 0) return 1;
    return 0;
  }
  function starString(n) { return "★".repeat(n) + "☆".repeat(4 - n); }

  // ---- mastery level (GAMIFICATION_BRIEF §11 phase 2, D4) ------------------
  // Level advances on QUALITY, never volume. Every input is a signal the game
  // already records: an event is "mastered" at >=80% first-try accuracy (the
  // same bar the stats screen already uses for a week), a curriculum week at
  // >=80% with >=3 placements, and perfect runs (capped, so replaying a short
  // easy deck cannot carry a level on its own). There is deliberately no
  // total-XP counter: nothing here moves by volume alone, so grinding short
  // rounds earns nothing (D4).
  const MASTERY_LEVELS = [
    { at: 0, title: "Newcomer" },
    { at: 4, title: "Explorer" },
    { at: 10, title: "Apprentice Historian" },
    { at: 20, title: "Chronicler" },
    { at: 35, title: "Historian" },
    { at: 55, title: "Master Historian" },
    { at: 80, title: "Keeper of the Timeline" },
  ];
  // x3 marks each, so at most 15 — a farm of perfect runs cannot dominate a
  // score built mainly from distinct mastered events and mastered weeks.
  const PERFECT_RUN_CAP = 5;
  function eventMastered(s) {
    return !!s && s.placements > 0 && s.firstTry / s.placements >= 0.8;
  }
  // Distinct from the deck-scoped `eventById(deck, id)` helper above: this
  // resolves the deck by id first. Named apart on purpose — two declarations
  // of the same name in this scope would silently shadow each other.
  function deckEventById(deckId, id) {
    const dk = window.DECKS.find((x) => x.id === deckId);
    return (dk && dk.events.find((e) => e.id === id)) || null;
  }
  // A level is a property of the PLAYER, not of the deck open on the stats
  // screen, so this reads every deck. Weeks are keyed per deck as well as by
  // number — two decks both have a "Week 3", and merging them would invent a
  // week that no curriculum has.
  function masteryOf(p) {
    let masteredEvents = 0;
    let masteredWeeks = 0;
    let perfectRuns = 0;
    const decks = (p && p.decks) || {};
    Object.keys(decks).forEach((deckId) => {
      const d = decks[deckId] || {};
      const events = d.events || {};
      Object.keys(events).forEach((id) => {
        if (eventMastered(events[id])) masteredEvents += 1;
      });
      const weeks = {};
      Object.keys(events).forEach((id) => {
        const ev = deckEventById(deckId, id);
        if (!ev || !ev.week) return;
        const w = weeks[ev.week] || (weeks[ev.week] = { placements: 0, firstTry: 0 });
        w.placements += events[id].placements;
        w.firstTry += events[id].firstTry;
      });
      Object.keys(weeks).forEach((wk) => {
        const w = weeks[wk];
        if (w.placements >= 3 && w.firstTry / w.placements >= 0.8) masteredWeeks += 1;
      });
      perfectRuns += (d.totals && d.totals.perfectRuns) || 0;
    });
    const score = masteredEvents + masteredWeeks * 5 + Math.min(perfectRuns, PERFECT_RUN_CAP) * 3;
    let index = 0;
    for (let i = 0; i < MASTERY_LEVELS.length; i += 1) {
      if (score >= MASTERY_LEVELS[i].at) index = i;
    }
    const cur = MASTERY_LEVELS[index];
    const next = MASTERY_LEVELS[index + 1] || null;
    const pct = next ? Math.round(((score - cur.at) / (next.at - cur.at)) * 100) : 100;
    return {
      score,
      index,
      title: cur.title,
      next,
      pct,
      toNext: next ? next.at - score : 0,
      masteredEvents,
      masteredWeeks,
      perfectRuns,
    };
  }

  window.Gamify = {
    localDayKey,
    reviewLog: (userId) => readUser(userId || activeUser().id).reviewLog || [],
    activeDays: (userId) => activeDays(readUser(userId || activeUser().id)),
    currentStreak: (userId) => currentStreak(readUser(userId || activeUser().id)),
    mastery: (userId) => masteryOf(readUser(userId || activeUser().id)),
    band,
    timezone: localTimeZone,
    syncTimezone,
  };

  // ---- recency mastery (display) -------------------------------------------
  // The setup category bars and the mastery-by-week surfaces read the same
  // append-only reviewLog the scheduler uses (D3), but ask a different
  // question: how well does the player know this NOW? review-scheduler.js's
  // `masteryByEvent` gives a recency-weighted 0-100 per event; this wraps the
  // lookup and, for history that predates the log, falls back to the lifetime
  // counter so no progress disappears on upgrade.
  function reviewMasteryIndex(userId) {
    const log = window.Gamify.reviewLog(userId);
    const RS = window.ReviewScheduler;
    const mastery = (RS && typeof RS.masteryByEvent === "function") ? RS.masteryByEvent(log) : {};
    const attempts = {};
    (Array.isArray(log) ? log : []).forEach((r) => {
      if (r && r.eventId != null) attempts[r.eventId] = (attempts[r.eventId] || 0) + 1;
    });
    return { mastery, attempts };
  }

  // Per-week recency mastery: the mean of each practised event's recency mastery
  // (equal weight per event) plus the sample count, so the >=3 trust gate still
  // works. Falls back to the lifetime counter for events the log never saw.
  function weekMasteryRows(source, lookupEvent, index) {
    const weeks = {};
    Object.entries(source || {}).forEach(([id, s]) => {
      const ev = lookupEvent(id);
      if (!ev || !ev.week) return;
      let pct = index.mastery[id];
      let samples = index.attempts[id];
      if (pct === undefined) {
        if (!s || !s.placements) return;
        pct = Math.round((s.firstTry / s.placements) * 100);
        samples = s.placements;
      }
      const w = weeks[ev.week] || (weeks[ev.week] = { sum: 0, n: 0, attempts: 0 });
      w.sum += pct; w.n += 1; w.attempts += samples || 0;
    });
    return Object.entries(weeks).map(([wk, w]) => ({
      week: Number(wk),
      mastery: Math.round(w.sum / w.n),
      placements: w.attempts,
    }));
  }

  function mostPlayedDeckId(userId) {
    const p = readUser(userId);
    return Object.keys(p.decks)
      .filter((k) => p.decks[k].totals && p.decks[k].totals.runs > 0)
      .sort((a, b) => p.decks[b].totals.runs - p.decks[a].totals.runs)[0] || null;
  }
  const SOUND_KEY = "timeline.sound.v1";
  const MUSIC_ON_KEY = "timeline.music.on.v1";
  const MUSIC_VOL_KEY = "timeline.music.vol.v1";
  const GAME_MUSIC_VOL_KEY = "timeline.game-music.vol.v1";

  // ---- background music ------------------------------------------
  // Autoplay policy (MDN/Chrome): audible playback is blocked until the user
  // interacts with the page. Pattern: attempt play() on load; if blocked, start
  // on the first pointer/key gesture. Controls always reflect real state.
  let bgMusic = null;
  function getMusicOn() {
    try { return localStorage.getItem(MUSIC_ON_KEY) !== "off"; } catch (_) { return true; }
  }
  function setMusicOn(on) { try { localStorage.setItem(MUSIC_ON_KEY, on ? "on" : "off"); } catch (_) {} }
  function getMusicVol() {
    try {
      const v = parseFloat(localStorage.getItem(MUSIC_VOL_KEY));
      if (!isNaN(v)) return Math.min(1, Math.max(0, v));
    } catch (_) {}
    return 1;
  }
  function setMusicVol(v) { try { localStorage.setItem(MUSIC_VOL_KEY, String(v)); } catch (_) {} }
  // Game-music volume is stored separately from the main music volume and
  // defaults to 50% so narration stays audible.
  function getGameMusicVol() {
    try {
      const v = parseFloat(localStorage.getItem(GAME_MUSIC_VOL_KEY));
      if (!isNaN(v)) return Math.min(1, Math.max(0, v));
    } catch (_) {}
    return 0.5;
  }
  function setGameMusicVol(v) { try { localStorage.setItem(GAME_MUSIC_VOL_KEY, String(v)); } catch (_) {} }
  function ensureBgMusic() {
    if (bgMusic) return bgMusic;
    bgMusic = new Audio("assets/audio/alex-morgan-battle-boss-fight-game-music-583276.mp3");
    bgMusic.loop = true;
    bgMusic.preload = "auto";
    bgMusic.id = "bg-music";
    bgMusic.className = "bg-music"; // hidden via CSS
    bgMusic.volume = getMusicVol();
    document.body.appendChild(bgMusic);
    bgMusic.addEventListener("play", syncMusicControls);
    bgMusic.addEventListener("pause", syncMusicControls);
    // Belt-and-suspenders: `loop` already repeats forever, but if the track
    // ever fires `ended` (loop flag lost / browser quirk), restart it.
    bgMusic.addEventListener("ended", () => {
      if (getMusicOn() && bgMusic) {
        bgMusic.currentTime = 0;
        bgMusic.play().catch(() => {});
      }
    });
    return bgMusic;
  }
  // Game-mode music: a separate track that plays ONLY on the game screen.
  // The main bgMusic pauses while it plays and resumes when the player leaves
  // the game screen. Source: https://pixabay.com/music/orchestral-battle-cinematic-heroic-orchestra-586988/
  // Game-music volume is user-controllable via its own slider, defaulting to
  // 50% so narration stays audible (see getGameMusicVol / setGameMusicVol).
  // Set true on each NEW game so the game track starts from the top; cleared
  // once consumed. Mid-game screen hops (game -> elsewhere -> game) resume the
  // same loop instead of replaying the intro.
  let gameMusicRestart = false;
  let gameMusic = null;
  function ensureGameMusic() {
    if (gameMusic) return gameMusic;
    gameMusic = new Audio("assets/audio/music-game.mp3");
    gameMusic.loop = true;
    gameMusic.preload = "auto";
    gameMusic.id = "game-music";
    gameMusic.className = "bg-music"; // hidden via CSS
    gameMusic.volume = getGameMusicVol();
    document.body.appendChild(gameMusic);
    gameMusic.addEventListener("play", syncMusicControls);
    gameMusic.addEventListener("pause", syncMusicControls);
    gameMusic.addEventListener("ended", () => {
      if (currentScreen === "game" && getMusicOn() && gameMusic) {
        gameMusic.currentTime = 0;
        gameMusic.play().catch(() => {});
      }
    });
    return gameMusic;
  }
  // --- crossfade between tracks (Civ "folds over the next" / anti-pop) -----
  const MUSIC_FADE_MS = 150;
  let musicFadeRaf = null;
  let musicSwitchToken = 0;
  function fadeAudio(el, to, ms, done) {
    if (!el) { if (done) done(); return; }
    if (musicFadeRaf) { cancelAnimationFrame(musicFadeRaf); musicFadeRaf = null; }
    const from = el.volume;
    if (from === to) { el.volume = to; if (done) done(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      // easeOutCubic so the tail of the fade is quick and clean
      const v = from + (to - from) * (1 - Math.pow(1 - p, 3));
      el.volume = Math.max(0, Math.min(1, v));
      if (p < 1) {
        musicFadeRaf = requestAnimationFrame(step);
      } else {
        el.volume = to;
        musicFadeRaf = null;
        if (done) done();
      }
    };
    musicFadeRaf = requestAnimationFrame(step);
  }
  // Route music to the correct track for the current screen: game music on the
  // game screen, the main bgMusic everywhere else. The current track crossfades
  // out before the incoming one starts, so there is no pop on the switch.
  function syncGameMusic() {
    const inGame = currentScreen === "game";
    const on = getMusicOn();
    const token = ++musicSwitchToken; // invalidates any in-flight fade from a prior switch
    if (musicFadeRaf) { cancelAnimationFrame(musicFadeRaf); musicFadeRaf = null; }

    if (inGame) {
      const outgoing = bgMusic && !bgMusic.paused ? bgMusic : null;
      const startGameTrack = () => {
        if (token !== musicSwitchToken) return; // superseded by a newer switch
        if (on) {
          const gm = ensureGameMusic();
          if (gameMusicRestart) { gm.currentTime = 0; gameMusicRestart = false; }
          gm.volume = 0;
          gm.play().then(() => {
            if (token !== musicSwitchToken) return;
            fadeAudio(gm, getGameMusicVol(), MUSIC_FADE_MS);
          }).catch(() => {});
        } else if (gameMusic) {
          gameMusic.pause();
        }
      };
      if (outgoing) fadeAudio(outgoing, 0, MUSIC_FADE_MS, () => { outgoing.pause(); startGameTrack(); });
      else startGameTrack();
    } else {
      const outgoing = gameMusic && !gameMusic.paused ? gameMusic : null;
      const startMain = () => {
        if (token !== musicSwitchToken) return;
        if (on) {
          const m = ensureBgMusic();
          if (m.paused) {
            m.volume = 0;
            m.play().then(() => {
              if (token !== musicSwitchToken) return;
              fadeAudio(m, getMusicVol(), MUSIC_FADE_MS);
            }).catch(() => {});
          }
        } else if (bgMusic && !bgMusic.paused) {
          bgMusic.pause(); // toggle off outside game: silence the main track
        }
      };
      if (outgoing) fadeAudio(outgoing, 0, MUSIC_FADE_MS, () => { outgoing.pause(); startMain(); });
      else startMain();
    }
    syncMusicControls();
  }
  function syncMusicControls() {
    const active = currentScreen === "game" ? gameMusic : bgMusic;
    const playing = !!(active && !active.paused);
    document.querySelectorAll(".music-btn").forEach((b) => {
      b.textContent = playing ? "♫" : "♪";
      b.classList.toggle("off", !playing);
      b.setAttribute("aria-pressed", String(playing));
      b.title = playing ? "Pause music" : "Play music";
    });
  }
  function tryStartMusic() {
    if (!getMusicOn()) { syncMusicControls(); return; }
    ensureBgMusic().play().then(syncMusicControls).catch(syncMusicControls);
  }
  function getSound() {
    return localStorage.getItem(SOUND_KEY) !== "off";
  }
  function setSound(on) {
    try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch {}
  }

  // ---- sound effects ----------------------------------------------
  // Kenney CC0 SFX (assets/audio/*.mp3 — see assets/audio/LICENSE.txt).
  // HTMLAudioElement-based so playback works from file:// in every browser
  // (Web Audio buffer loading needs fetch(), which Chrome blocks on file://).
  // Best-practice rules baked in (see research):
  //  - variant pools with random-without-repeats (shuffled bag, not dice roll)
  //  - playbackRate jitter ±5-10% per play (anti-fatigue)
  //  - volume jitter ±~1dB
  //  - loudness ladder: frequent sounds quiet, rare sounds loud
  //  - streak escalation: +1 semitone (1.06x) per consecutive correct, cap 5
  //  - wrong answers layer a soft impact thud under the buzz
  //  - beep() (Web Audio synth) remains as a zero-asset fallback
  const SFX = {
    click:    { files: ["ui-click-1", "ui-click-2", "ui-click-3", "ui-click-4"], vol: 0.30, rate: [0.95, 1.05] },
    select:   { files: ["ui-select-1", "ui-select-2", "ui-select-3"], vol: 0.30, rate: [0.95, 1.05] },
    toggle:   { files: ["ui-toggle-1", "ui-toggle-2", "ui-toggle-3"], vol: 0.30, rate: [0.95, 1.05] },
    switch:   { files: ["ui-switch-1", "ui-switch-2", "ui-switch-3"], vol: 0.30, rate: [0.95, 1.05] },
    rollover: { files: ["ui-rollover-1", "ui-rollover-2"], vol: 0.20, rate: [0.95, 1.05] },
    open:     { files: ["ui-open-1"], vol: 0.30, rate: [0.95, 1.05] },
    close:    { files: ["ui-close-1"], vol: 0.30, rate: [0.95, 1.05] },
    glass:    { files: ["ui-glass-1", "ui-glass-2", "ui-glass-3"], vol: 0.30, rate: [0.95, 1.05] },
    glitch:   { files: ["ui-glitch-1", "ui-glitch-2"], vol: 0.30, rate: [0.95, 1.05] },
    tick:     { files: ["tick-1", "tick-2"], vol: 0.30, rate: [0.95, 1.05] },
    place:    { files: ["place-1", "place-2", "place-3"], vol: 0.35, rate: [0.95, 1.05], layer: { group: "wood", vol: 0.25 } },
    correct:  { files: ["correct-1", "correct-2", "correct-3", "correct-4"], vol: 0.40, rate: [0.95, 1.05], fallback: "correct" },
    pluck:    { files: ["correct-pluck-1", "correct-pluck-2"], vol: 0.40, rate: [0.95, 1.05] },
    wrong:    { files: ["wrong-1", "wrong-2", "wrong-3", "wrong-4"], vol: 0.45, rate: [0.95, 1.05], fallback: "wrong", layer: { group: "impact", vol: 0.30 } },
    impact:   { files: ["impact-soft-1", "impact-soft-2", "impact-soft-3"], vol: 0.30, rate: [0.9, 1.1] },
    wood:     { files: ["impact-wood-1", "impact-wood-2"], vol: 0.25, rate: [0.9, 1.1] },
    win:      { files: ["win-1"], vol: 0.60, rate: [0.98, 1.02], fallback: "finish" },
  };
  // Per-file Audio element pools (2 each) so rapid triggers can overlap.
  const audioPool = {};
  const poolIdx = {};
  // Random-without-repeats bags per group (shuffled, refilled when empty).
  const bags = {};
  const lastPlayed = {};
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pickVariant(group) {
    const def = SFX[group];
    if (!def || !def.files.length) return null;
    let bag = bags[group];
    if (!bag || !bag.length) {
      bag = def.files.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // Boundary guard: the file we are about to pop (the last element) must
      // not equal the one just played, or the shuffle degenerates into a
      // back-to-back repeat when the bag refills.
      if (lastPlayed[group] != null && bag[bag.length - 1] === lastPlayed[group] && bag.length > 1) {
        const k = Math.floor(Math.random() * (bag.length - 1));
        [bag[bag.length - 1], bag[k]] = [bag[k], bag[bag.length - 1]];
      }
      bags[group] = bag;
    }
    const file = bag.pop();
    lastPlayed[group] = file;
    return file;
  }
  function getAudioEl(file) {
    const pool = audioPool[file];
    if (!pool || !pool.length) return null;
    const i = (poolIdx[file] = ((poolIdx[file] || 0) + 1) % pool.length);
    return pool[i];
  }
  function preloadSfx() {
    Object.keys(SFX).forEach((group) => {
      SFX[group].files.forEach((f) => {
        if (!audioPool[f]) audioPool[f] = [];
        if (audioPool[f].length < 2) {
          const a = new Audio(`assets/audio/${f}.mp3`);
          a.preload = "auto";
          audioPool[f].push(a);
        }
      });
    });
  }
  function playSfx(name, opts = {}) {
    if (!getSound()) return;
    const def = SFX[name];
    if (!def) return;
    const file = pickVariant(name);
    const el = file && getAudioEl(file);
    if (!el || el.readyState === 0) {
      // File not loaded yet (or missing) — fall back to the synth beep.
      if (def.fallback) beep(def.fallback);
      return;
    }
    let rate = rand(def.rate[0], def.rate[1]);
    if (opts.streak && opts.streak > 1) rate *= Math.pow(1.06, Math.min(opts.streak - 1, 5));
    el.playbackRate = rate;
    el.volume = def.vol * rand(0.9, 1.1);
    el.currentTime = 0;
    el.play().catch(() => {});
    // Layered feedback (e.g. wrong = buzz + soft thud) for weight.
    if (def.layer) {
      const ldef = SFX[def.layer.group];
      const lfile = pickVariant(def.layer.group);
      const lel = lfile && getAudioEl(lfile);
      if (lel && lel.readyState !== 0) {
        lel.playbackRate = rand(ldef.rate[0], ldef.rate[1]);
        lel.volume = (def.layer.vol != null ? def.layer.vol : ldef.vol) * rand(0.9, 1.1);
        lel.currentTime = 0;
        lel.play().catch(() => {});
      }
    }
  }

  // ---- sound (synth fallback) -------------------------------------
  let audioCtx = null;
  function beep(kind) {
    if (!getSound()) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    const notes =
      kind === "wrong" ? [165, 130] :
      kind === "finish" ? [523, 659, 784, 1047] :
      [523, 784];
    notes.forEach((freq, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = kind === "wrong" ? "triangle" : "sine";
      o.frequency.value = freq;
      const t = audioCtx.currentTime + i * 0.075;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.18);
    });
  }

  // ---- DOM refs --------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $("home"),
    setup: $("setup"),
    game: $("game"),
    results: $("results"),
    browse: $("browse"),
    stats: $("stats"),
  };
  // Screen flow order drives curtain direction (Motion PageCurtain pattern):
  // destination further along the flow = forward (sweep right, top leans
  // right); earlier = backward (sweep left, top leans left).
  const SCREEN_ORDER = { home: 0, stats: 0, setup: 1, browse: 1, game: 2, results: 3 };
  const SCREEN_TITLES = {
    home: "DECKS", setup: "SETUP", game: "GAME START!",
    results: "RESULTS", browse: "LIBRARY", stats: "PROGRESS",
  };
  let currentScreen = "home";

  function show(name) {
    const prev = currentScreen;
    currentScreen = name;
    if (prev === "game" && name !== "game" && hoverDebounceTimer) {
      clearTimeout(hoverDebounceTimer);
      setCardHovered(false);
    }
    if (prev === "game" && name !== "game" && window.Narrator) {
      window.Narrator.stop(); // silence narration off the game screen
    }
    const swap = () => {
      Object.values(screens).forEach((s) => s.classList.add("hidden"));
      screens[name].classList.remove("hidden");
      // Lock the page scroll on the game screen: the timeline pane is the only
      // scroller, so the body must not scroll under it (a whole-page scroll
      // would cut off the top/bottom of the timeline). Restore elsewhere.
      document.body.classList.toggle("scroll-locked", name === "game");
      syncGameMusic(); // game screen swaps to game music; elsewhere resumes main
      initGlassOnScreen(); // glass newly-visible controls
      // Rail bounds need a visible screen (offsetTop is 0 while hidden).
      if (name === "game") {
        // Measure the sticky header now that the screen is visible, so the
        // grid fills exactly the space below it (prompt hidden in split).
        const gh = document.querySelector(".game-header");
        if (gh) document.documentElement.style.setProperty("--game-header-h", (gh.getBoundingClientRect().top + gh.getBoundingClientRect().height) + "px");
        const ctxs = splitCtx && splitCtx.length ? splitCtx : (gameCtx() ? [gameCtx()] : []);
        ctxs.forEach((ctx) => { updateRail(ctx); refreshFocusScale(ctx); drawRail(ctx); });
      }
      // Always: the rail lives on <body>, so it must be shown on the game screen
      // and hidden on every other one (drawRail sets railEl.hidden itself).
      if (name !== "game") {
        Object.keys(railEls).forEach((k) => { railEls[k].hidden = true; });
        // Leaving the game screen ends split layout: the shared globe dock
        // returns to full-width (centred) and #app back to its column.
        screens.game.classList.remove("split");
      }
      // Dock globe lives on setup/game/results only (its mode-setting calls
      // handle visibility); leaving those screens hides + pauses it. In split
      // there are two globes — hide both.
      if (name !== "setup" && name !== "game" && name !== "results") {
        if (window.GlobeDock) window.GlobeDock.hide();
        if (window.GlobeDockP2) window.GlobeDockP2.hide();
      }
    };
    // Same-screen renders (initial hub render) swap plainly — no curtain.
    if (name === prev || !window.FX) { swap(); return; }
    playSfx("glass"); // liquid-glass transition whoosh
    const direction = (SCREEN_ORDER[name] || 0) >= (SCREEN_ORDER[prev] || 0)
      ? "forward" : "backward";
    // Carry the destination name: setup carries the deck title, the game
    // screen announces itself.
    const title =
      name === "game" ? "Game Start!"
      : name === "setup" && ui.deck ? ui.deck.name
      : SCREEN_TITLES[name] || name;
    FX.curtain(swap, { title, direction }).then(() => {
      // Re-measure the header after the curtain settles (the swap-time
      // measurement can be a few px off mid-transition), so the grid fills
      // the viewport exactly.
      if (name === "game") {
        const gh = document.querySelector(".game-header");
        if (gh) document.documentElement.style.setProperty("--game-header-h", gh.getBoundingClientRect().top + gh.getBoundingClientRect().height + "px");
        // Globe sync was deferred at game start so the docks appear under the
        // curtain; run it now the reveal is done (skip if the player already
        // left the game screen mid-transition).
        if (deferGlobeSync && !screens.game.classList.contains("hidden")) {
          deferGlobeSync = false;
          const ctxs = splitCtx && splitCtx.length ? splitCtx : (gameCtx() ? [gameCtx()] : []);
          ctxs.forEach((ctx) => syncGlobe(ctx));
          // Keyboard: split gives BOTH players a cursor on their first gap;
          // single-player focuses the first gap so arrow keys work right away.
          if (splitCtx && splitCtx.length) {
            splitCtx.forEach((ctx) => renderSplitCursor(ctx));
          }
          const firstGap = $("pane-1").querySelector(".timeline .gap");
          if (firstGap) firstGap.focus();
        }
      }
    });
  }

  // ---- modal open/close with quick fade in/out ----
  function openModal(el) {
    if (!el) return;
    el.classList.remove("hidden", "closing");
    playSfx("open");
  }
  function closeModal(el) {
    if (!el || el.classList.contains("hidden")) return;
    el.classList.add("closing");
    playSfx("close");
    setTimeout(() => {
      el.classList.add("hidden");
      el.classList.remove("closing");
    }, 180); // matches the CSS fade duration
  }

  // ---- helpers ---------------------------------------------------
  function fmtYear(year, circa) {
    if (year == null) return "Prehistory"; // un-dated CC cards (Creation, the Flood)
    const v = Math.abs(year).toLocaleString("en-US");
    const label = year < 0 ? `${v} BCE` : v;
    return circa ? `c. ${label}` : label;
  }
  // Display marker for an event; renders a RANGE when the event spans eras
  // (e.g. the Seven Wonders, the Middle Ages). Display-only — placement and
  // scoring always follow sortYear/year, so a range never changes its place.
  function fmtYears(e) {
    if (e.year == null) return "Prehistory";
    if (e.yearEnd == null) return fmtYear(e.year, e.circa);
    if ((e.year < 0) !== (e.yearEnd < 0)) {
      return `${fmtYear(e.year, e.circa)} – ${fmtYear(e.yearEnd, e.circaEnd ?? e.circa)}`;
    }
    const unit = e.year < 0 ? " BCE" : "";
    return `${e.circa ? "c. " : ""}${Math.abs(e.year).toLocaleString("en-US")}–${Math.abs(e.yearEnd).toLocaleString("en-US")}${unit}`;
  }

  // ---- vis-timeline summary (stats + library) ---------------------
  // Vendored vis-timeline (MIT/Apache-2.0). Items are colored by the active
  // player's progress: green = first-try, amber = had slips, grey = not
  // attempted. Undated (Prehistory) events can't sit on a date axis and are
  // counted in a note instead.
  function yearToDate(y) {
    // Date.UTC maps years 0-99 to 1900+year — setFullYear avoids that trap
    // and handles negative (BCE) years correctly.
    const d = new Date(0);
    d.setUTCFullYear(y, 0, 1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  function visAxisFormat() {
    // vis-timeline (standalone build) passes moment objects to label fns.
    const yearOf = (d) => (typeof d.year === "function" ? d.year() : d.getUTCFullYear());
    const fmt = (d) => {
      const y = yearOf(d);
      return y < 0 ? `${Math.abs(y).toLocaleString("en-US")} BCE` : y.toLocaleString("en-US");
    };
    return { minorLabels: fmt, majorLabels: fmt };
  }
  function buildTlItems(scope, mode, groupStrategy) {
    const items = [];
    let undated = 0;
    scope.events.forEach((ev) => {
      if (ev.year == null) { undated += 1; return; }
      const prog = scope.progress(ev.id);
      const practiced = !!(prog && prog.placements > 0);
      if (mode === "practiced" && !practiced) return;
      let cls = "tl-unpracticed";
      if (practiced) {
        cls = prog.slips > 0 ? "tl-slipped" : "tl-clean";
      }
      const item = {
        id: ev.id,
        content: escapeHtml(ev.title),
        className: cls,
        type: ev.yearEnd != null ? "range" : "point",
        start: yearToDate(ev.year),
      };
      if (ev.yearEnd != null) item.end = yearToDate(ev.yearEnd);
      if (groupStrategy) {
        const g = groupStrategy.get(ev);
        if (g != null && g !== "") item.group = String(g);
      }
      items.push(item);
    });
    return { items, undated, groups: buildGroups(scope.events, groupStrategy) };
  }
  // Groups for the vis-timeline groups DataSet: { id, content, order }.
  // Only groups actually present on the items are returned, in the strategy's
  // declared order (groupOrder: "order" sorts by the `order` field).
  function buildGroups(events, groupStrategy) {
    if (!groupStrategy) return null;
    const present = new Set();
    events.forEach((ev) => {
      const g = groupStrategy.get(ev);
      if (g == null || g === "") return;
      present.add(String(g));
    });
    if (!present.size) return null;
    const order = groupStrategy.order || [];
    const labels = groupStrategy.labels || {};
    const groups = [];
    order.forEach((id, i) => {
      if (present.has(id)) groups.push({ id, content: labels[id] || id, order: i });
    });
    let extra = order.length;
    present.forEach((id) => {
      if (!order.includes(id)) groups.push({ id, content: labels[id] || id, order: extra++ });
    });
    return groups;
  }
  // Era background bands for the CC timeline. Boundaries match the ERAS
  // buckets so the colored bands line up with the age filters. Deliberately
  // GROUPLESS: per the docs, background items without a group spread over the
  // whole timeline — the era tint covers every group row and can never scroll
  // out of view (a dedicated "Ages" row did, once rows stacked deep).
  function buildAgesBands() {
    const bands = [
      { id: "age-ancient", start: -4004, end: 450, className: "age-band-ancient", label: "Ancient" },
      { id: "age-medieval", start: 450, end: 1500, className: "age-band-medieval", label: "Medieval" },
      { id: "age-early-modern", start: 1500, end: 1760, className: "age-band-early-modern", label: "Early Modern" },
      { id: "age-industrial", start: 1760, end: 1970, className: "age-band-industrial", label: "Industrial" },
      { id: "age-modern", start: 1970, end: 2100, className: "age-band-modern", label: "Modern" },
    ];
    return bands.map((b) => ({
      id: b.id,
      type: "background",
      content: b.label,
      start: yearToDate(b.start),
      end: yearToDate(b.end),
      className: b.className,
      align: "left", // label sits at the era's start, not clamped on-screen
    }));
  }
  function visTimelineOpts() {
    return {
      stack: true, // no height option: vis auto-sizes to the stack (basicUsage style)
      maxHeight: 500, // documented cap for the auto height
      showTooltips: false, // hover cards replace vis tooltips (documented kill switch)
      showCurrentTime: false,
      zoomable: true,
      selectable: true,
      zoomMin: 1000 * 60 * 60 * 24 * 365, // don't zoom IN below year granularity
      preferZoom: true, // keep zoom anchored while our custom handler pans horizontally
      horizontalScroll: true, // enable built-in horizontal scroll support
      format: visAxisFormat(),
    };
  }

  // ---- in-game style hover cards on timeline items ----------------
  // The card floats to the RIGHT of the pointer (flipping left near the
  // viewport edge) so it never covers the timeline.
  let tlHoverCard = null;
  let tlHoverHideTimer = null;
  let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
  function hideTlHoverCard() {
    clearTimeout(tlHoverHideTimer);
    if (tlHoverCard) { tlHoverCard.remove(); tlHoverCard = null; }
  }
  function showTlHoverCard(ev, x, y, panelEl) {
    hideTlHoverCard();
    const card = document.createElement("div");
    card.className = "fact-sheet tl-hover";
    card.innerHTML = `<div class="fs-title">${escapeHtml(ev.title)}</div>` + factSheetHtml(ev);
    document.body.appendChild(card);
    const mapDiv = card.querySelector(".fact-map");
    if (mapDiv) initFactMap(mapDiv);
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    // Preferred: to the RIGHT of the glass frame (clear of all timeline
    // items). Fallback: right of the pointer, flipping left at the edge.
    let left = null;
    if (panelEl) {
      const pr = panelEl.getBoundingClientRect();
      if (pr.right + 12 + w <= window.innerWidth - 8) left = pr.right + 12;
    }
    if (left == null) {
      left = x + 16;
      if (left + w > window.innerWidth - 8) left = x - w - 16;
    }
    if (left < 8) left = 8;
    const top = Math.min(Math.max(8, y - 24), Math.max(8, window.innerHeight - h - 8));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.addEventListener("mouseenter", () => clearTimeout(tlHoverHideTimer));
    card.addEventListener("mouseleave", hideTlHoverCard);
    tlHoverCard = card;
  }
  // Globe-dock marker clicks surface the SAME hover card as timeline items.
  // Both the shared globe and the split player-2 globe get the same callbacks
  // (the tooltip anchors at the pointer position, so it works for either).
  [window.GlobeDock, window.GlobeDockP2].forEach((g) => {
    if (!g) return;
    // Both click and hover anchor the card to the right of the main column
    // (#app) on desktop, exactly like timeline-item tooltips.
    const mainCol = () => document.getElementById("app");
    g.onMarkerClick = (ev, x, y) => showTlHoverCard(ev, x, y, mainCol());
    // Hover over a globe marker shows the same fact-sheet tooltip (with the
    // Leaflet map); hovering off hides it.
    g.onMarkerHover = (ev, x, y) => {
      if (ev) showTlHoverCard(ev, x, y, mainCol());
      else hideTlHoverCard();
    };
  });
  function attachTlHover(tl, lookupEvent, container) {
    const panelEl = container ? container.closest("#stats-body, .tl-glass-panel") : null;
    // vis-timeline emits lowercase event names
    tl.on("itemover", (props) => {
      clearTimeout(tlHoverHideTimer);
      const ev = lookupEvent(props.item);
      if (!ev) return;
      const pt = props.event && typeof props.event.clientX === "number"
        ? { x: props.event.clientX, y: props.event.clientY }
        : lastPointer;
      showTlHoverCard(ev, pt.x, pt.y, panelEl);
    });
    tl.on("itemout", () => {
      clearTimeout(tlHoverHideTimer);
      tlHoverHideTimer = setTimeout(hideTlHoverCard, 350);
    });
    tl.on("rangechange", hideTlHoverCard);
  }
  document.addEventListener("pointermove", (e) => { lastPointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  // A window resize can change what "fits": re-anchor any fact-sheet tooltip
  // that is currently visible so it never spills past the new edges.
  window.addEventListener("resize", () => {
    document.querySelectorAll(".tl-event .fact-sheet").forEach((s) => {
      if (getComputedStyle(s).display !== "none") positionFactSheet(s.closest(".tl-event"));
    });
    // The fixed rail's viewport-space curve must re-fit on resize. drawRail
    // needs a ctx (it reads ctx.root), so resolve the live one(s) like the
    // screen-swap does — a bare drawRail() threw on ctx.root.
    const ctxs = splitCtx && splitCtx.length ? splitCtx : (gameCtx() ? [gameCtx()] : []);
    ctxs.forEach((ctx) => drawRail(ctx));
  });
  function destroyTimeline(t) { if (t) { try { t.destroy(); } catch (_) {} } return null; }
  // Restrict panning to (slightly past) the first and last dates in the data.
  // Label space is handled precisely by fitTextSpace() after the first render.
  function clampTimelineRange(opts, items) {
    if (!items.length) return;
    let minY = Infinity;
    let maxY = -Infinity;
    items.forEach((it) => {
      const ys = it.start.getUTCFullYear();
      const ye = it.end ? it.end.getUTCFullYear() : ys;
      if (ys < minY) minY = ys;
      if (ye > maxY) maxY = ye;
    });
    const pad = Math.max(10, (maxY - minY) * 0.03);
    opts.min = yearToDate(minY - pad);
    opts.max = yearToDate(maxY + pad);
    // BISECT: no explicit start/end

  }

  // Generic timeline fit — works for ANY vis-timeline instance, agnostic of
  // which timeline or which events: everything is derived at runtime from the
  // instance's own DataSet and the rendered label widths.
  //   - caps vertical stacking at maxStack by setting zoomMax (the zoom-OUT
  //     limit) to the widest window at which no time point stacks deeper
  //   - sizes the window so the rightmost label fits
  //   - leaves height to vis (auto-fits the stack), capped by maxHeight
  const TL_FIT_DEFAULTS = { maxStack: 10, maxHeight: 500 };
  function fitTimeline(tl, container, opts = {}) {
    const maxStack = opts.maxStack || TL_FIT_DEFAULTS.maxStack;
    const maxHeight = opts.maxHeight || TL_FIT_DEFAULTS.maxHeight;
    let done = false;
    const fit = () => {
      if (done) return;
      try {
        const W = container.clientWidth;
        if (!W || !tl.itemsData) return;
        const items = tl.itemsData.get();
        if (!items.length) return;
        // widest rendered label (drives horizontal overlap when zooming out)
        let labelPx = 0;
        container.querySelectorAll(".vis-item").forEach((el) => {
          // skip dots (zero-width) and background bands (full-width — would
          // poison the label measurement used for the zoom fit)
          if (el.classList.contains("vis-dot") || el.classList.contains("vis-background") || !el.offsetParent) return;
          labelPx = Math.max(labelPx, el.getBoundingClientRect().width);
        });
        if (!labelPx) return; // items not rendered yet — next redraw retries
        done = true;
        tl.off("changed", fit);
        const win = tl.getWindow();
        const msPerYear = 31557600000;
        const startYear = win.start.getUTCFullYear();
        const toMs = (year) => win.start.getTime() + (year - startYear) * msPerYear;
        // intervals from the timeline's own items (points: [y, y]; ranges: [s, e])
        const intervals = items
          .filter((it) => it.type !== "background")
          .map((it) => {
            const s = it.start.getUTCFullYear();
            const e = it.end ? it.end.getUTCFullYear() : s;
            return { s, e };
          });
        const maxY = Math.max(...intervals.map((i) => i.e));
        const minY = Math.min(...intervals.map((i) => i.s));
        const span = Math.max(1, maxY - minY);
        // max time-overlap depth for a given label footprint eps (years):
        // depth is monotonically non-decreasing in eps -> binary search
        const depth = (eps) => {
          const evs = [];
          intervals.forEach(({ s, e }) => { evs.push([s, 1], [Math.max(e, s + eps), -1]); });
          evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          let cur = 0, max = 0;
          evs.forEach(([, d]) => { cur += d; if (cur > max) max = cur; });
          return max;
        };
        let lo = 0, hi = span * 3;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          if (depth(mid) <= maxStack) lo = mid; else hi = mid;
        }
        const epsMax = Math.max(lo, 1);
        const W_max_years = epsMax * W / labelPx;
        // window: right-aligned so the rightmost label fits inside
        const endYear = maxY + epsMax + 1;
        const startYearNew = endYear - W_max_years;
        const endMs = toMs(endYear);
        // zoomMax (the zoom-OUT limit) enforces the stack cap; max bounds panning
        tl.setOptions({ zoomMax: Math.max(1, W_max_years) * msPerYear, max: endMs, maxHeight });
        tl.setWindow(toMs(startYearNew), endMs);
        // vis sometimes skips the itemset repaint when the window is set from
        // outside its own event cycle — force one on the next frame.
        requestAnimationFrame(() => { try { tl.redraw(); } catch (_) {} });
      } catch (e) { console.error("timeline fit failed", e); }
    };
    // Defer out of vis's redraw cycle: setWindow inside the "changed" handler
    // leaves the itemset with stale positions (items off-screen).
    tl.on("changed", () => { if (!done) requestAnimationFrame(fit); });
    requestAnimationFrame(fit);
    // Re-fit on container resize (zoomMax depends on the measured width).
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { done = false; fit(); }, 200);
    });
  }

  // Make horizontal-scroll gestures pan the timeline instead of zooming.
  // Handles both:
  //   - native horizontal scroll (trackpad two-finger side scroll)
  //   - shift + mousewheel (vertical delta treated as horizontal pan)
  // Vertical scroll without shift is left for vis-timeline's default zoom.
  const PIXELS_PER_WHEEL_LINE = 40;
  const PIXELS_PER_WHEEL_PAGE = 800;
  function setupTimelinePan(tl, container) {
    container.addEventListener(
      "wheel",
      (e) => {
        if (!tl) return;
        const adx = Math.abs(e.deltaX);
        const ady = Math.abs(e.deltaY);
        if (adx <= ady) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        let panDx = e.deltaX;
        if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
          panDx *= PIXELS_PER_WHEEL_LINE;
        } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
          panDx *= PIXELS_PER_WHEEL_PAGE;
        }
        const win = tl.getWindow();
        const start = win.start.getTime();
        const end = win.end.getTime();
        const diff = (panDx / 120) * ((end - start) / 20);
        try { tl.setWindow(new Date(start + diff), new Date(end + diff), { animation: false }); } catch (_) {}
      },
      { passive: false, capture: true }
    );
  }

  // Make horizontal-scroll gestures pan the timeline instead of zooming.
  function tlToggleChips(host, current, onPick) {
    host.innerHTML = "";
    [["all", "All"], ["practiced", "Practiced"]].forEach(([m, label]) => {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "filter-chip" + (current === m ? " sel" : "");
      c.textContent = label;
      c.addEventListener("click", onPick);
      host.appendChild(c);
    });
  }
  // Chronological key for correctness + placement. The CC song order is the
  // authoritative chronology (not the raw year, which is non-monotonic for the
  // early cards), so prefer `sortYear` when present, else fall back to `year`.
  function sortYearOf(ev) {
    return typeof ev.sortYear === "number" ? ev.sortYear : (ev.year == null ? 0 : ev.year);
  }
  function currentEvent(state) {
    if (!state || state.roundIndex >= state.queue.length) return null;
    return eventById(ui.deck, state.queue[state.roundIndex]);
  }

  // ---- hover state: placed cards ↔ globe + prompt-card flash ----------------
  let hoverDebounceTimer = null;
  let isCardHovered = false;
  function setCardHovered(val) {
    if (isCardHovered === val) return;
    isCardHovered = val;
    updateHoverUI();
  }
  function updateHoverUI() {
    // The prompt lives inside pane 1 in both single-player and split.
    const promptCard = $("pane-1").querySelector(".prompt-card");
    if (!promptCard) return;
    const hasCurrent = !!currentEvent(game);
    if (isCardHovered) {
      promptCard.classList.remove("prompt-card--flash");
    } else {
      promptCard.classList.toggle("prompt-card--flash", hasCurrent);
    }
  }

  function correctIndexRange(ev, timelineEvents) {
    let before = 0, atOrBefore = 0;
    const y = sortYearOf(ev);
    timelineEvents.forEach((e) => {
      const ey = sortYearOf(e);
      if (ey < y) before++;
      if (ey <= y) atOrBefore++;
    });
    return [before, atOrBefore]; // inclusive correct range
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }
  function summarizeSelections(deck, sel) {
    const parts = [];
    for (const f of deck.filters || []) {
      const picked = (sel && sel[f.id]) || [];
      if (picked.length) {
        const labels = picked.map((v) => {
          const o = f.options.find((op) => op.value === v);
          return o ? o.label : String(v);
        });
        parts.push(`${f.label}: ${labels.join(", ")}`);
      }
    }
    return parts.length ? parts.join(" · ") : "Full deck";
  }

  // ==================================================================
  //  HUB — choose a deck + mode
  // ==================================================================
  function renderHub() {
    const grid = $("deck-grid");
    grid.innerHTML = "";
    window.DECKS.forEach((d) => {
      const card = document.createElement("button");
      card.className = "card deck-card";
      card.type = "button";
      card.innerHTML =
        `<span class="deck-emoji">${d.emoji || "🎴"}</span>` +
        `<span class="card-title">${escapeHtml(d.name)}</span>` +
        `<span class="card-sub">${escapeHtml(d.blurb)}</span>` +
        `<span class="deck-meta">${d.events.length} events${d.filters && d.filters.length ? " · " + d.filters.length + " filters" : ""}</span>`;
      card.addEventListener("click", () => openDeck(d));
      grid.appendChild(card);
    });

    // Active user + focus options (only once this user has finished a run).
    updateAppbarAvatars();
    renderFocusPanel();

    show("home");
  }

  // ==================================================================
  //  USERS — picker modal, per-user stats, focus panel
  // ==================================================================
  function openUsersModal() {
    renderUsersModal();
    openModal($("users-modal"));
    initGlassOnScreen();
  }

  function renderUsersModal() {
    const state = ensureUsers();
    const list = $("users-list");
    list.innerHTML = "";
    state.users.forEach((usr) => {
      const row = document.createElement("div");
      row.className = "user-row" + (usr.id === state.activeId ? " active" : "");
      const av = document.createElement("span");
      av.className = "user-avatar";
      av.style.background = letterColor(usr.name.trim()[0] || "P");
      av.textContent = (usr.name.trim()[0] || "?").toUpperCase();
      const nameBtn = document.createElement("button");
      nameBtn.className = "user-name";
      nameBtn.textContent = usr.name;
      nameBtn.title = "View progress";
      nameBtn.addEventListener("click", () => {
        closeModal($("users-modal"));
        openStats(usr.id);
      });
      const play = document.createElement("button");
      play.className = "mini-btn";
      play.textContent = usr.id === state.activeId ? "Playing" : "Play as";
      play.disabled = usr.id === state.activeId;
      play.addEventListener("click", () => {
        row.classList.add("selected");
        setTimeout(() => {
          closeModal($("users-modal"));
          state.activeId = usr.id;
          writeUsers(state);
          renderHub();
        }, 250);
      });
      row.append(av, nameBtn, play);
      list.appendChild(row);
    });
  }

  function openStats(userId) {
    statsUserId = userId;
    const p = readUser(userId);
    statsDeckId = mostPlayedDeckId(userId);
    renderStats();
    show("stats");
  }

  function renderStats() {
    const u = ensureUsers().users.find((x) => x.id === statsUserId);
    if (!u) return;
    // Age band (A3): the only input for §5's gating. "" = not set.
    const bandSel = $("stats-band");
    if (bandSel) bandSel.value = u.ageBand || "";
    $("stats-avatar").style.background = letterColor(u.name.trim()[0] || "P");
    $("stats-avatar").textContent = (u.name.trim()[0] || "?").toUpperCase();
    $("stats-name").textContent = u.name;
    const playas = $("stats-playas");
    playas.hidden = u.id === ensureUsers().activeId;
    playas.onclick = () => {
      const state = ensureUsers();
      state.activeId = u.id;
      writeUsers(state);
      renderStats();
      renderHub();
    };
    // deck chips — "All" combines every deck's stats (future-proof for more decks)
    const p = readUser(u.id);
    const chips = $("stats-decks");
    chips.innerHTML = "";
    const deckIds = Object.keys(p.decks).filter((k) => p.decks[k].totals && p.decks[k].totals.runs > 0);
    if (!statsDeckId || (statsDeckId !== "all" && !deckIds.includes(statsDeckId))) {
      statsDeckId = deckIds[0] || null;
    }
    if (deckIds.length >= 2) {
      const allChip = document.createElement("button");
      allChip.className = "filter-chip" + (statsDeckId === "all" ? " sel" : "");
      allChip.textContent = "All";
      allChip.addEventListener("click", () => { statsDeckId = "all"; renderStats(); });
      chips.appendChild(allChip);
    }
    deckIds.forEach((k) => {
      const deck = window.DECKS.find((x) => x.id === k);
      const chip = document.createElement("button");
      chip.className = "filter-chip" + (k === statsDeckId ? " sel" : "");
      chip.textContent = deck ? deck.name : k;
      chip.addEventListener("click", () => { statsDeckId = k; renderStats(); });
      chips.appendChild(chip);
    });
    const body = $("stats-body");
    body.innerHTML = "";
    if (!statsDeckId) {
      body.innerHTML = `<p class="stats-empty">No runs yet — play a round and your progress will appear here.</p>`;
      return;
    }
    // Resolve the view: one deck, or the "All" combination across decks.
    let totals, eventsMap, runs, lookupEvent;
    if (statsDeckId === "all") {
      totals = { runs: 0, totalScore: 0, totalMax: 0, perfectRuns: 0, totalPlacements: 0, totalSlips: 0 };
      eventsMap = {};
      runs = [];
      Object.values(p.decks).forEach((d) => {
        Object.entries(d.totals).forEach(([k, v]) => { totals[k] += v; });
        Object.entries(d.events).forEach(([id, s]) => {
          const e = eventsMap[id] || (eventsMap[id] = { placements: 0, slips: 0, firstTry: 0 });
          e.placements += s.placements;
          e.slips += s.slips;
          e.firstTry += s.firstTry;
        });
        runs.push(...d.runs);
      });
      runs.sort((a, b) => b.date - a.date);
      lookupEvent = (id) => {
        for (const k of Object.keys(p.decks)) {
          const dk = window.DECKS.find((x) => x.id === k);
          const ev = dk && dk.events.find((e) => e.id === id);
          if (ev) return ev;
        }
        return null;
      };
    } else {
      const d = p.decks[statsDeckId];
      totals = d.totals;
      eventsMap = d.events;
      runs = d.runs;
      const deck = window.DECKS.find((x) => x.id === statsDeckId);
      lookupEvent = (id) => deck.events.find((e) => e.id === id) || null;
    }
    const avgPct = totals.totalMax ? Math.round((totals.totalScore / totals.totalMax) * 100) : 0;

    // Mastery level (D4) — profile-wide, above the deck-scoped stats, because
    // a level describes the player rather than the open deck. Age-band copy
    // switch (A3): the youngest band gets the name and an encouraging line,
    // with no mastery score, percentage or progress bar at all (§5).
    const userBand = band(u);
    const mast = masteryOf(p);
    const lc = document.createElement("div");
    lc.className = "level-card";
    if (userBand === "5-7") {
      lc.innerHTML =
        `<span class="level-head"><span class="level-title">${escapeHtml(mast.title)}</span></span>` +
        `<span class="level-sub">Every timeline you finish makes you a better historian.</span>`;
    } else {
      const nextLine = mast.next
        ? (userBand === "8-11"
            ? `${mast.toNext} more to become ${escapeHtml(mast.next.title)}`
            : `${mast.toNext} mastery mark${mast.toNext === 1 ? "" : "s"} to ${escapeHtml(mast.next.title)} · across all decks`)
        : "Highest level reached";
      const detail = userBand === "8-11"
        ? `<span class="level-sub">${nextLine}</span>`
        : `<span class="level-sub">${nextLine} · ${mast.masteredEvents} event${mast.masteredEvents === 1 ? "" : "s"} mastered · ` +
          `${mast.masteredWeeks} week${mast.masteredWeeks === 1 ? "" : "s"} mastered · ${mast.perfectRuns} perfect run${mast.perfectRuns === 1 ? "" : "s"}</span>`;
      lc.innerHTML =
        `<span class="level-head"><span class="level-badge">Lv ${mast.index + 1}</span>` +
        `<span class="level-title">${escapeHtml(mast.title)}</span></span>` +
        `<span class="level-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" ` +
        `aria-valuenow="${mast.pct}" aria-label="Mastery progress to the next level"><span style="width:${mast.pct}%"></span></span>` +
        detail;
    }
    body.appendChild(lc);

    // Overview
    const ov = document.createElement("div");
    ov.className = "stats-overview";
    const stat = (label, value) => {
      const s = document.createElement("div");
      s.className = "stat";
      s.innerHTML = `<b>${value}</b><span>${label}</span>`;
      return s;
    };
    ov.append(
      stat("Runs", totals.runs),
      stat("Avg score", avgPct + "%"),
      stat("Perfect runs", totals.perfectRuns),
      stat("Placements", totals.totalPlacements),
      stat("Slips", totals.totalSlips)
    );
    body.appendChild(ov);

    // Timeline summary (vis-timeline): practiced green/amber, unpracticed grey.
    const tlSec = document.createElement("div");
    tlSec.className = "stats-section stats-timeline-section";
    const tlHead = document.createElement("div");
    tlHead.className = "tl-head";
    const tlTitle = document.createElement("h3");
    tlTitle.textContent = "Timeline summary";
    const tlToggle = document.createElement("div");
    tlToggle.className = "tl-toggle";
    tlHead.append(tlTitle, tlToggle);
    tlSec.appendChild(tlHead);
    const tlContainer = document.createElement("div");
    tlContainer.className = "tl-container";
    tlSec.appendChild(tlContainer);
    body.appendChild(tlSec);

    // Mastery by week (deck events carry week numbers), recency-weighted from
    // the review log so a good recent round moves the bar.
    const weekRows = weekMasteryRows(eventsMap, lookupEvent, reviewMasteryIndex(u.id))
      .sort((a, b) => a.mastery - b.mastery);
    if (weekRows.length) {
      const sec = document.createElement("div");
      sec.className = "stats-section";
      sec.innerHTML = `<h3>Mastery by week</h3>`;
      weekRows.forEach((w) => {
        const row = document.createElement("div");
        row.className = "mastery-row";
        const label = document.createElement("span");
        label.className = "mastery-label";
        label.textContent = `Week ${w.week}`;
        const bar = document.createElement("span");
        bar.className = "mastery-bar";
        bar.innerHTML = `<span style="width:${w.mastery}%"></span>`;
        const val = document.createElement("span");
        val.className = "mastery-val";
        if (userBand === "5-7") {
          // §5: hide the percentage and the "not enough data yet" copy; the
          // bar above stays as a non-numeric progress indicator.
          const stars = masteryStars(w.placements < 3 ? 0 : w.mastery);
          val.textContent = starString(stars);
          val.setAttribute("aria-label", `${stars} of 4 stars`);
        } else {
          val.textContent = w.placements < 3 ? "not enough data yet" : `Mastery ${w.mastery}%`;
        }
        row.append(label, bar, val);
        sec.appendChild(row);
      });
      body.appendChild(sec);
    }

    // Focus areas (informational — the game actions live on the home screen)
    const focus = Object.entries(eventsMap)
      .map(([id, s]) => {
        const ev = lookupEvent(id);
        return ev ? { ev, weakness: s.slips / s.placements, slips: s.slips, placements: s.placements } : null;
      })
      .filter((x) => x && x.placements > 0 && x.slips > 0)
      .sort((a, b) => b.weakness - a.weakness || b.slips - a.slips)
      .slice(0, 5);
    if (focus.length) {
      const sec = document.createElement("div");
      sec.className = "stats-section";
      sec.innerHTML = `<h3>Focus areas</h3>`;
      focus.forEach((f) => {
        const row = document.createElement("div");
        row.className = "focus-row";
        row.innerHTML = `<span>${escapeHtml(f.ev.title)}</span><span class="focus-meta">${f.slips} slip${f.slips === 1 ? "" : "s"} in ${f.placements} placement${f.placements === 1 ? "" : "s"}</span>`;
        sec.appendChild(row);
      });
      body.appendChild(sec);
    }

    // Recent runs
    if (runs.length) {
      const sec = document.createElement("div");
      sec.className = "stats-section";
      sec.innerHTML = `<h3>Recent runs</h3>`;
      runs.slice(0, 10).forEach((r) => {
        const pct = r.max ? Math.round((r.score / r.max) * 100) : 0;
        const row = document.createElement("div");
        row.className = "run-row";
        row.innerHTML =
          `<span class="run-date">${new Date(r.date).toLocaleDateString()}</span>` +
          `<span class="run-filters">${r.deck ? escapeHtml(r.deck) + " · " : ""}${escapeHtml(r.filters)}</span>` +
          `<span class="run-score">${r.score}/${r.max} · ${pct}%${r.perfect ? " ✨" : ""}</span>`;
        sec.appendChild(row);
      });
      body.appendChild(sec);
    }

    // Create/refresh the vis timeline (container is in the DOM now).
    statsTimeline = destroyTimeline(statsTimeline);
    let scopeEvents, progressFn;
    if (statsDeckId === "all") {
      const seen = new Set();
      scopeEvents = [];
      Object.keys(p.decks).forEach((k) => {
        const dk = window.DECKS.find((x) => x.id === k);
        if (!dk) return;
        dk.events.forEach((e) => {
          if (!seen.has(e.id)) { seen.add(e.id); scopeEvents.push(e); }
        });
      });
    } else {
      const deck = window.DECKS.find((x) => x.id === statsDeckId);
      scopeEvents = deck ? deck.events : [];
    }
    progressFn = (id) => eventsMap[id] || null;
    tlToggleChips(tlToggle, statsTlMode, () => {
      statsTlMode = statsTlMode === "all" ? "practiced" : "all";
      renderStats();
    });
    const built = buildTlItems({ events: scopeEvents, progress: progressFn }, statsTlMode);
    if (built.undated) {
      const note = document.createElement("p");
      note.className = "tl-note";
      note.textContent = `${built.undated} undated (Prehistory) event${built.undated === 1 ? "" : "s"} not shown.`;
      tlSec.appendChild(note);
    }
    try {
      const tlOpts = visTimelineOpts();
      clampTimelineRange(tlOpts, built.items);
      statsTimeline = new vis.Timeline(tlContainer, new vis.DataSet(built.items), tlOpts);
      attachTlHover(statsTimeline, lookupEvent, tlContainer);
      fitTimeline(statsTimeline, tlContainer);
      setupTimelinePan(statsTimeline, tlContainer);
      requestAnimationFrame(() => { try { statsTimeline.redraw(); } catch (_) {} });
    } catch (e) { console.error("timeline failed", e); }
  }

  function renderFocusPanel() {
    const host = $("focus-panel");
    if (!host) return;
    const u = activeUser();
    const deckId = u ? mostPlayedDeckId(u.id) : null;
    if (!u || !deckId) {
      host.classList.add("hidden");
      host.innerHTML = "";
      return;
    }
    const p = readUser(u.id);
    const d = p.decks[deckId];
    const deck = window.DECKS.find((x) => x.id === deckId);
    if (!d || !deck) { host.classList.add("hidden"); return; }
    // Weakest weeks (>= 3 samples for a trustworthy number), recency-weighted.
    const weekRows = weekMasteryRows(
      d.events,
      (id) => deck.events.find((e) => e.id === id) || null,
      reviewMasteryIndex(u.id)
    )
      .filter((w) => w.placements >= 3)
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 3);
    host.classList.remove("hidden");
    host.innerHTML = "";
    const head = document.createElement("p");
    head.className = "focus-head";
    head.textContent = `🎯 Focus for ${u.name} · ${deck.name}`;
    host.appendChild(head);
    // Reach-back review: how many previously-seen events the scheduler says are
    // due. Empty is a real state (J2), not a dead button — say so calmly.
    const due = reviewDueEvents(deckId, deck);
    if (!due.length) {
      const caught = document.createElement("div");
      caught.className = "focus-card caught-up";
      caught.innerHTML =
        `<span class="focus-title">🎉 All caught up</span>` +
        `<span class="focus-sub">No reviews due right now — finish another round and they'll come back.</span>`;
      host.appendChild(caught);
    } else {
      const rr = document.createElement("button");
      rr.className = "focus-card";
      rr.type = "button";
      rr.innerHTML =
        `<span class="focus-title">Review round</span>` +
        `<span class="focus-sub">${due.length} event${due.length === 1 ? "" : "s"} due for review</span>`;
      rr.addEventListener("click", () => startReviewRound());
      host.appendChild(rr);
    }
    // §5/A3: a 5–7 profile sees a 0–4 star readout here, never a mastery
    // percentage — the same gate the stats card applies (:1729–1733). The bar
    // (a non-numeric progress indicator) stays, as it does on the stats card.
    const focusBand = band(u);
    weekRows.forEach((w) => {
      const row = document.createElement("button");
      row.className = "focus-card week";
      row.type = "button";
      let sub;
      if (focusBand === "5-7") {
        const stars = masteryStars(w.placements < 3 ? 0 : w.mastery);
        sub = `${starString(stars)} · ${w.placements} placements`;
        row.setAttribute("aria-label", `Practice Week ${w.week}, ${stars} of 4 stars`);
      } else {
        sub = `Mastery ${w.mastery}% · ${w.placements} placements`;
      }
      row.innerHTML =
        `<span class="focus-title">Practice Week ${w.week}</span>` +
        `<span class="focus-sub">${sub}</span>` +
        `<span class="focus-bar"><span style="width:${w.mastery}%"></span></span>`;
      row.addEventListener("click", () => startWeekPractice(deckId, w.week));
      host.appendChild(row);
    });
  }

  function openDeck(deck) {
    ui.deck = deck;
    ui.selections = {};
    $("setup-title").textContent = deck.name;
    $("setup-blurb").textContent = deck.blurb;
    renderSetup();
    show("setup");
  }

  // ==================================================================
  //  SETUP — multi-select filter screens for the chosen deck
  // ==================================================================

  // Mastery split for a single filter option. Every deck event that belongs to
  // `value` is one equal slice, banded by its own first-try accuracy; the
  // slices are grouped into contiguous segments (best → worst). Returns
  // { segs: [{ cls, pct }], practised, total } or null when none practised.
  // Membership mirrors filterSubset (OR within a group).
  const MASTERY_BANDS = [
    { cls: "seg--max", min: 100 }, // mastered
    { cls: "seg--hi",  min: 70  }, // strong
    { cls: "seg--mid", min: 40  }, // developing
    { cls: "seg--lo",  min: 0   }, // needs work
  ];
  function optionMastery(deck, filter, value, index) {
    const u = activeUser();
    if (!u) return null;
    const d = readUser(u.id).decks[deck.id];
    const members = deck.events.filter((ev) => {
      const got = filter.get(ev);
      return (Array.isArray(got) ? got : [got]).includes(value);
    });
    if (!members.length) return null;
    const counts = MASTERY_BANDS.map(() => 0);
    let practised = 0;
    members.forEach((ev) => {
      // Recency first (review log); lifetime counter as the upgrade fallback.
      let pct = index.mastery[ev.id];
      if (pct === undefined) {
        const s = d && d.events && d.events[ev.id];
        if (!s || !s.placements) return;
        pct = Math.round((s.firstTry / s.placements) * 100);
      }
      practised += 1;
      counts[MASTERY_BANDS.findIndex((b) => pct >= b.min)] += 1;
    });
    if (!practised) return null;
    const segs = MASTERY_BANDS
      .map((b, i) => ({ cls: b.cls, pct: (counts[i] / members.length) * 100 }))
      .filter((s) => s.pct > 0);
    return { segs, practised, total: members.length };
  }

  function renderSetup() {
    const deck = ui.deck;
    const filters = deck.filters || [];
    const container = $("setup-filters");
    container.innerHTML = "";
    // One recency read per render (not per chip): reparsing the log 20x is waste.
    const setupUser = activeUser();
    const masteryIndex = setupUser ? reviewMasteryIndex(setupUser.id) : { mastery: {}, attempts: {} };

    if (!filters.length) {
      container.innerHTML = `<p class="setup-note">This deck plays as a single set — no filters. Hit Start!</p>`;
    }

    filters.forEach((f) => {
      const group = document.createElement("div");
      group.className = "filter-group";
      const picked = ui.selections[f.id] || [];

      const head = document.createElement("div");
      head.className = "filter-head";
      head.innerHTML = `<span class="filter-label">${escapeHtml(f.label)}</span>` +
        `<span class="filter-state">${picked.length ? picked.length + " selected" : "all"}</span>`;
      group.appendChild(head);

      const chips = document.createElement("div");
      chips.className = "filter-chips";
      f.options.forEach((opt) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "filter-chip" + (picked.includes(opt.value) ? " sel" : "");
        // Stacked mastery bar: one equal slice per category event, grouped by
        // colour band. No practised data → plain label, no bar.
        const m = optionMastery(ui.deck, f, opt.value, masteryIndex);
        if (m) {
          chip.innerHTML =
            `<span class="chip-fill" aria-hidden="true">` +
            m.segs.map((s) => `<span class="seg ${s.cls}" style="width:${s.pct}%"></span>`).join("") +
            `</span><span class="chip-label">${escapeHtml(opt.label)}</span>`;
        } else {
          chip.textContent = opt.label;
        }
        chip.addEventListener("click", () => {
          const arr = ui.selections[f.id] || [];
          const at = arr.indexOf(opt.value);
          if (at >= 0) arr.splice(at, 1);
          else arr.push(opt.value);
          ui.selections[f.id] = arr;
          chip.classList.toggle("sel");
          head.querySelector(".filter-state").textContent = arr.length ? arr.length + " selected" : "all";
          updateSetupSummary(); // recompute ui.subset so Start uses the filtered set
        });
        chips.appendChild(chip);
      });
      // "clear" affordance
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "filter-clear";
      clear.textContent = "Reset";
      clear.addEventListener("click", () => {
        delete ui.selections[f.id];
        chips.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("sel"));
        head.querySelector(".filter-state").textContent = "all";
        updateSetupSummary(); // recompute ui.subset
      });
      group.appendChild(chips);
      group.appendChild(clear);
      container.appendChild(group);
    });

    updateSetupSummary();

    // Versus toggle: reveal the handicap panel; sliders update their labels.
    const versus = $("setup-versus");
    const panel = $("handicap-panel");
    if (versus && panel) {
      const syncPanel = () => panel.classList.toggle("hidden", !versus.checked);
      versus.addEventListener("change", syncPanel);
      syncPanel();
      ["p1", "p2"].forEach((which) => {
        const slider = $("handicap-" + which);
        const val = $("handicap-" + which + "-val");
        if (slider && val) {
          const sync = () => { val.textContent = (parseInt(slider.value, 10) / 1000).toFixed(1) + "s"; };
          slider.addEventListener("input", sync);
          sync();
        }
      });
    }

    // Play count selector: reflect manual changes into ui.maxEvents
    const maxSel = $("setup-max");
    if (maxSel && !maxSel.dataset.wired) {
      maxSel.addEventListener("change", () => {
        ui.maxEvents = maxSel.value === "" ? null : parseInt(maxSel.value, 10);
        const note = $("setup-max-note");
        if (note) note.textContent = ui.maxEvents
          ? `You place ${ui.maxEvents} · ${ANCHOR_COUNT} pre-placed anchors`
          : `You place all ${Math.max(0, ui.subset.length - ANCHOR_COUNT)} · ${ANCHOR_COUNT} pre-placed anchors`;
      });
      maxSel.dataset.wired = "1";
    }
  }

  // Populate the "Play count" selector. The value is the number of events YOU
  // place (2 anchors are pre-placed on top). Offers a ladder (5, 10, 15, …
  // below the placeable size) plus "All (X)". Default is "All".
  function renderPlayCount(total) {
    const sel = $("setup-max");
    if (!sel) return;
    const maxPlaceable = Math.max(0, total - ANCHOR_COUNT);
    if (ui.maxEvents != null && ui.maxEvents > maxPlaceable) ui.maxEvents = null; // clamp
    const opts = [];
    opts.push({ value: "", label: `All (${total})` });
    const steps = [];
    for (let n = 5; n < maxPlaceable; n += 5) steps.push(n);
    [...new Set(steps)].sort((a, b) => b - a).forEach((n) => opts.push({ value: String(n), label: `${n} to place` }));
    sel.innerHTML = "";
    opts.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      if ((o.value === "" && ui.maxEvents == null) || o.value === String(ui.maxEvents)) opt.selected = true;
      sel.appendChild(opt);
    });
    const note = $("setup-max-note");
    if (note) note.textContent = ui.maxEvents
      ? `You place ${ui.maxEvents} · ${ANCHOR_COUNT} pre-placed anchors`
      : `You place all ${maxPlaceable} · ${ANCHOR_COUNT} pre-placed anchors`;
  }

  function updateSetupSummary() {
    const subset = filterSubset(ui.deck, ui.selections);
    ui.subset = subset;
    // Dock globe mirrors the filtered subset as ambient points.
    if (window.GlobeDockP2) window.GlobeDockP2.hide(); // setup is a shared screen
    if (window.GlobeDock) window.GlobeDock.setSetup(subset);
    const note = $("setup-count-note");
    if (subset.length === 0) {
      $("setup-summary").textContent = "No events match this combination.";
      note.textContent = "That filter combination is empty — deselect something.";
      $("setup-start").disabled = true;
      return;
    }
    $("setup-summary").textContent =
      `${subset.length} event${subset.length === 1 ? "" : "s"} selected · ${summarizeSelections(ui.deck, ui.selections)}`;
    // Need at least 2 anchors + MIN_PLACEMENTS to make a puzzle.
    const ok = subset.length >= ANCHOR_COUNT + MIN_PLACEMENTS;
    $("setup-start").disabled = !ok;
    note.textContent = ok
      ? ""
      : `Pick at least ${ANCHOR_COUNT + MIN_PLACEMENTS} events (a single week has 7 — choose a few weeks or a continent to play).`;
    // refresh the Play count selector for the new subset size
    renderPlayCount(subset.length);
  }

  // ==================================================================
  //  GAME
  // ==================================================================
  function buildPuzzle(events, seed, placements) {
    const pool = shuffled(events, seed);
    const chosen = [];
    const counts = {};
    ERAS.forEach((e) => (counts[e.name] = 0));
    // round-robin across eras for variety, then fill remaining
    let guard = 0;
    while (chosen.length < placements + ANCHOR_COUNT && guard < pool.length * 4) {
      const era = ERAS[chosen.length % ERAS.length];
      const next = pool.find((ev) => eraOf(ev.year) === era.name && !chosen.includes(ev));
      if (next) chosen.push(next);
      guard++;
    }
    for (const ev of pool) {
      if (chosen.length >= placements + ANCHOR_COUNT) break;
      if (!chosen.includes(ev)) chosen.push(ev);
    }

    const order = shuffled(chosen, seed + 2021);
    const first = order[0];
    const second = order.find((e) => e.id !== first.id && sortYearOf(e) !== sortYearOf(first)) || order[1];
    const anchors = [first, second].sort((a, b) => sortYearOf(a) - sortYearOf(b) || a.title.localeCompare(b.title));
    const anchorIds = new Set(anchors.map((e) => e.id));
    const queue = shuffled(
      chosen.filter((e) => !anchorIds.has(e.id)),
      seed + 7777
    ).slice(0, placements);
    return { anchors, queue };
  }

  function startGame(forcedPool) {
    const deck = ui.deck;
    // Unlock WebAudio inside this click gesture so narration is audible even
    // on a fresh session (autoplay policy suspends lazily-created contexts).
    if (window.Narrator) window.Narrator.unlock();
    const dateKey = utcDateKey(new Date());
    // Always recompute from the live selections — never trust a cached subset.
    let subset = filterSubset(deck, ui.selections);
    ui.subset = subset;
    // A forced pool (focus round) overrides the filtered subset entirely.
    const pool = forcedPool || subset;
    // "Play count" = number of events YOU place. The 2 anchors are extra and
    // pre-placed. "All" places every non-anchor event in the subset. Do NOT
    // slice the pool — buildPuzzle draws what it needs from the shuffled pool,
    // so slicing here would bias toward deck order.
    const need = ANCHOR_COUNT + MIN_PLACEMENTS;
    if (pool.length < need) return; // guard: too few to form a puzzle
    const placements = forcedPool
      ? Math.max(MIN_PLACEMENTS, Math.min(10, pool.length) - ANCHOR_COUNT)
      : Math.max(
      MIN_PLACEMENTS,
      ui.maxEvents && ui.maxEvents > 0
        ? Math.min(ui.maxEvents, pool.length - ANCHOR_COUNT)
        : pool.length - ANCHOR_COUNT
    );

    // Every run is a fresh random puzzle within the chosen deck/filters/count.
    const seed = (Date.now() >>> 0) ^ ((Math.random() * 1e9) >>> 0);
    const { anchors, queue } = buildPuzzle(pool, seed, placements);

    const revealedFacts = {};
    anchors.forEach((a) => { revealedFacts[a.id] = a.fact; });

    game = createGameState({
      mode: "free",
      userId: (activeUser() || {}).id || null, // attribution: who STARTED the run
      deck,
      dateKey,
      placements,
      anchors,
      queue,
      revealedFacts,
    });

    $("mode-tag").textContent =
      modeLabel(game);
    $("score-max").textContent = maxScore(game);
    $("result-score-max").textContent = maxScore(game);
    // Single-player renders into pane 1 (full width); pane 2 stays hidden.
    splitCtx = null;
    screens.game.classList.remove("split");
    $("pane-2").classList.add("hidden");
    $("pane-1").classList.remove("hidden");
    $("pane-1-name").textContent = (activeUser() || {}).name || "Player 1";
    // Measure the sticky header so the grid fills exactly the space below it.
    const gh = document.querySelector(".game-header");
    if (gh) document.documentElement.style.setProperty("--game-header-h", (gh.getBoundingClientRect().top + gh.getBoundingClientRect().height) + "px");
    deferGlobeSync = true; // docks appear after the curtain, not before it
    renderGame(makeCtx(game, $("pane-1")));
    gameMusicRestart = true; // fresh game -> game music starts from the top
    show("game");
  }

  // ---- split-screen (two players, same puzzle) -------------------
  // Both players get the SAME seed => identical anchors + queue, so scores are
  // directly comparable. Each player's state is independent; outcomes write to
  // their own profile (state.userId). P1 = W/S + A, P2 = arrows + Enter.
  function startSplit(deck, p1UserId, p2UserId, p1Handicap, p2Handicap) {
    if (window.Narrator) window.Narrator.unlock();
    const dateKey = utcDateKey(new Date());
    let subset = filterSubset(deck, ui.selections);
    ui.subset = subset;
    const pool = subset;
    const need = ANCHOR_COUNT + MIN_PLACEMENTS;
    if (pool.length < need) return;
    const placements = Math.max(
      MIN_PLACEMENTS,
      ui.maxEvents && ui.maxEvents > 0
        ? Math.min(ui.maxEvents, pool.length - ANCHOR_COUNT)
        : pool.length - ANCHOR_COUNT
    );
    // ONE seed for both players — same puzzle, fair comparison.
    const seed = (Date.now() >>> 0) ^ ((Math.random() * 1e9) >>> 0);
    const { anchors, queue } = buildPuzzle(pool, seed, placements);
    const revealedFacts = {};
    anchors.forEach((a) => { revealedFacts[a.id] = a.fact; });

    const mk = (userId, handicap) => createGameState({
      mode: "split",
      userId,
      deck,
      dateKey,
      placements,
      anchors,
      queue,
      revealedFacts,
      handicap: handicap || {},
    });

    const s1 = mk(p1UserId, p1Handicap);
    const s2 = mk(p2UserId, p2Handicap);
    game = null; // split mode: no single-player state
    splitCtx = [makeCtx(s1, $("pane-1")), makeCtx(s2, $("pane-2"))];

    // Show both panes; label with player names.
    screens.game.classList.add("split");
    $("pane-1").classList.remove("hidden");
    $("pane-2").classList.remove("hidden");
    const n1 = (p1UserId && readUser(p1UserId).name) || "Player 1";
    const n2 = (p2UserId && readUser(p2UserId).name) || "Player 2";
    $("pane-1-name").textContent = n1;
    $("pane-2-name").textContent = n2;
    $("mode-tag").textContent = "VERSUS";
    $("score-max").textContent = maxScore(s1);
    $("result-score-max").textContent = maxScore(s1);
    // Measure the header (appbar only; the prompt lives in each pane) for the grid.
    const gh = document.querySelector(".game-header");
    if (gh) document.documentElement.style.setProperty("--game-header-h", (gh.getBoundingClientRect().top + gh.getBoundingClientRect().height) + "px");

    deferGlobeSync = true; // docks appear after the curtain, not before it
    renderGame(splitCtx[0]);
    // Handicap: delayed start — the weaker player's first deal (and prompt)
    // appears after startDelayMs, so the stronger player begins first.
    const delay2 = (s2.handicap && s2.handicap.startDelayMs) || 0;
    if (delay2 > 0) {
      $("pane-2").classList.add("pane--waiting");
      setTimeout(() => {
        $("pane-2").classList.remove("pane--waiting");
        renderGame(splitCtx[1]);
      }, delay2);
    } else {
      renderGame(splitCtx[1]);
    }
    gameMusicRestart = true;
    show("game");
  }

  // ---- split-screen virtual cursors --------------------------------------
  // The browser has ONE document.activeElement, so two players can't each own
  // DOM focus. Instead each player's cursor is an index into their pane's gaps
  // (ctx.cursor), rendered with a per-player CSS class and kept in the tab
  // order for screen readers. Keys are handled document-level (see init), so
  // both players act simultaneously regardless of where focus sits.
  function renderSplitCursor(ctx) {
    const tl = ctx.root.querySelector(".timeline");
    if (!tl) return;
    const gaps = Array.from(tl.querySelectorAll(".gap"));
    if (!gaps.length) return;
    const pane = ctx.root.dataset.pane || "p1";
    gaps.forEach((g, i) => {
      g.classList.toggle("gap--cursor-" + pane, i === ctx.cursor);
      g.setAttribute("tabindex", i === ctx.cursor ? "0" : "-1");
    });
  }
  function setSplitCursor(ctx, index) {
    ctx.cursor = index;
    renderSplitCursor(ctx);
    const gaps = Array.from(ctx.root.querySelectorAll(".timeline .gap"));
    const gap = gaps[index];
    if (gap && !gap.classList.contains("gap--locked")) {
      gap.focus({ preventScroll: true });
      smoothCenterGap(gap, ctx.root);
    }
  }

  // Move a split player's cursor between gaps (dir = -1 up / +1 down).
  function splitMove(playerIdx, dir) {
    if (!splitCtx) return;
    const ctx = splitCtx[playerIdx];
    const tl = ctx.root.querySelector(".timeline");
    if (!tl) return;
    const gaps = Array.from(tl.querySelectorAll(".gap"));
    if (!gaps.length) return;
    if (ctx.cursor < 0 || ctx.cursor >= gaps.length) ctx.cursor = 0;
    let next = ctx.cursor + dir;
    while (next >= 0 && next < gaps.length && gaps[next].classList.contains("gap--locked")) next += dir;
    if (next < 0 || next >= gaps.length) return;
    setSplitCursor(ctx, next);
  }

  // Jump a split player's cursor to the first/last non-locked gap.
  function splitJump(playerIdx, toEnd) {
    if (!splitCtx) return;
    const ctx = splitCtx[playerIdx];
    const tl = ctx.root.querySelector(".timeline");
    if (!tl) return;
    const gaps = Array.from(tl.querySelectorAll(".gap"));
    if (!gaps.length) return;
    let next = toEnd ? gaps.length - 1 : 0;
    while (next >= 0 && next < gaps.length && gaps[next].classList.contains("gap--locked")) {
      next += toEnd ? -1 : 1;
    }
    if (next < 0 || next >= gaps.length) return;
    setSplitCursor(ctx, next);
  }

  // Place the current event for a split player at their cursor's gap.
  function splitPlace(playerIdx) {
    if (!splitCtx) return;
    const ctx = splitCtx[playerIdx];
    const tl = ctx.root.querySelector(".timeline");
    if (!tl) return;
    const gaps = Array.from(tl.querySelectorAll(".gap"));
    const gap = gaps[ctx.cursor];
    if (!gap || gap.classList.contains("gap--locked")) return;
    attemptPlace(ctx, parseInt(gap.dataset.index, 10));
  }

  // Build a fresh, independent game state. Split-screen calls this once per
  // player (same seed => same puzzle); single-player calls it once.
  function createGameState(opts) {
    const anchors = opts.anchors;
    const queue = opts.queue;
    return {
      mode: opts.mode || "free",
      userId: opts.userId || null,
      deckId: opts.deck.id,
      dateKey: opts.dateKey,
      placements: opts.placements,
      timeline: anchors.map((e) => e.id),
      queue: queue.map((e) => e.id),
      roundIndex: 0,
      lives: Infinity,
      outcomes: [],
      score: 0,
      wrongOnCurrent: 0,
      streak: 0, // consecutive correct placements (drives SFX pitch escalation)
      // Anchor cards by ID (styling must not depend on list position — cards
      // can be inserted before/between the anchors), plus per-card slips so
      // placed cards can show clean vs. needed-retries.
      anchorIds: new Set(anchors.map((e) => e.id)),
      cardSlips: {},
      // Frozen connection cue per card id (doc/CONNECTION_CUE_PLAN.md §4.2).
      // null/absent for clean cards and for decks with no usable edge.
      cardCue: {},
      status: "playing",
      // Active rescue (after RESCUE_AFTER misses): { lo, hi, id } — the correct
      // gap range and the card being revealed. Null when no rescue is showing.
      rescue: null,
      revealedFacts: opts.revealedFacts || {},
      handicap: opts.handicap || {},
    };
  }

  // Per-player rendering context: bundles a game state with the DOM root it
  // renders into. Single-player uses the #game screen; split-screen uses one
  // pane per player. All game functions take a ctx and read state/root from it.
  function makeCtx(state, root) {
    return { state, root, cursor: 0 };
  }

  // The active single-player ctx (or the first split pane). Used by global
  // hooks (show(), share) that aren't player-scoped.
  function gameCtx() {
    if (game) return makeCtx(game, $("pane-1"));
    if (splitCtx && splitCtx.length) return splitCtx[0];
    return null;
  }
  let splitCtx = null; // set by startSplit; null in single-player

  // ---- globe routing (split-screen: one globe per player) ----------------
  // Player 2 gets its own globe (window.GlobeDockP2) on wide screens; below
  // SPLIT_GLOBE_MIN both players share the single dock (today's behaviour).
  const SPLIT_GLOBE_MIN = 900;
  function globeFor(ctx) {
    if (!window.GlobeDock) return null;
    const pane = ctx && ctx.root ? ctx.root.dataset.pane : null;
    if (pane === "p2" && window.GlobeDockP2 && window.innerWidth >= SPLIT_GLOBE_MIN) return window.GlobeDockP2;
    return window.GlobeDock;
  }
  // eventEl() only has the player's state, not the ctx — match on it.
  function globeForState(state) {
    if (!window.GlobeDock) return null;
    if (splitCtx && splitCtx[1] && splitCtx[1].state === state && window.GlobeDockP2 && window.innerWidth >= SPLIT_GLOBE_MIN) return window.GlobeDockP2;
    return window.GlobeDock;
  }
  // Deferred at game start: the docks must not appear BEFORE the curtain
  // covers (they'd pop in on the setup screen). Set in startGame/startSplit,
  // cleared after the curtain reveal in show().
  let deferGlobeSync = false;
  function syncGlobe(ctx) {
    const state = ctx.state;
    const globe = globeFor(ctx);
    if (!globe) return;
    const timelineEvents = state.timeline.map((id) => eventById(ui.deck, id));
    globe.syncGame(
      timelineEvents.map((e) => ({ ev: e, kind: placedKindFor(state, e) })),
      currentEvent(state)
    );
  }

  // ---- direct starts (home focus panel) --------------------------
  // One-click practice: no Setup detour. ui.deck/selections are set, then
  // startGame recomputes the subset from them.
  function startDirect(deck, selections, maxEvents) {
    ui.deck = deck;
    ui.selections = selections || {};
    ui.maxEvents = maxEvents == null ? null : maxEvents;
    startGame();
  }

  function startWeekPractice(deckId, week) {
    const deck = window.DECKS.find((x) => x.id === deckId);
    if (!deck) return;
    startDirect(deck, { week: [week] }, null);
  }

  // Weakest practiced events for a user+deck, worst first.
  function weakestEvents(deckId, n) {
    const u = activeUser();
    if (!u) return [];
    const p = readUser(u.id);
    const d = p.decks[deckId];
    const deck = window.DECKS.find((x) => x.id === deckId);
    if (!d || !deck) return [];
    return Object.entries(d.events)
      .map(([id, s]) => ({ id, weakness: s.placements ? s.slips / s.placements : 0, slips: s.slips, placements: s.placements }))
      .filter((x) => x.placements > 0)
      .sort((a, b) => b.weakness - a.weakness || b.slips - a.slips)
      .slice(0, n)
      .map((x) => deck.events.find((e) => e.id === x.id))
      .filter(Boolean);
  }

  // The due set for a deck, from the pure scheduler (review-scheduler.js) over
  // the append-only reviewLog. Everything is re-derived on read (D3) — there is
  // no stored queue. The block the learner last worked in is the "current"
  // era/week the age gate compares against (A2/§20). Any failure yields an
  // empty set, so a scheduler problem can never break the Focus panel.
  function reviewDueEvents(deckId, deck) {
    const RS = window.ReviewScheduler;
    const u = activeUser();
    if (!u || !deck || !RS || typeof RS.replay !== "function" || typeof RS.dueSet !== "function") return [];
    try {
      const log = window.Gamify.reviewLog(u.id);
      const states = RS.replay(log);
      let currentEra = null;
      let currentWeek = null;
      for (let i = log.length - 1; i >= 0; i -= 1) {
        const r = log[i];
        if (!r || r.deck !== deckId) continue;
        const ev = deck.events.find((e) => e.id === r.eventId);
        if (ev) {
          currentEra = eraOf(ev.year);
          currentWeek = ev.week == null ? null : ev.week;
          break;
        }
      }
      const ids = RS.dueSet(states, deckId, band(u), {
        events: deck.events.map((e) => ({ id: e.id, era: eraOf(e.year), week: e.week })),
        cap: 10,
        recencyK: RS.K_MIN,
        eraOrder: ERAS.map((er) => er.name),
        currentEra,
        currentWeek,
      });
      const byId = new Map(deck.events.map((e) => [e.id, e]));
      return ids.map((id) => byId.get(id)).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  // The Review-round card's handler. Kept as a named entry point (the card is
  // "Review round", the pool logic below is shared).
  function startReviewRound() {
    startFocusRound();
  }

  function startFocusRound() {
    const u = activeUser();
    const deckId = u ? mostPlayedDeckId(u.id) : null;
    if (!deckId) return;
    const deck = window.DECKS.find((x) => x.id === deckId);
    if (!deck) return;
    const need = ANCHOR_COUNT + MIN_PLACEMENTS;
    // Reach-back first: the scheduler's due set. If too little is due to form a
    // puzzle, fail open to the old weakest-events logic so practice is never
    // blocked (FR6 / fail-open).
    let pool = reviewDueEvents(deckId, deck);
    if (pool.length < need) pool = weakestEvents(deckId, 10);
    if (pool.length < need) {
      // Pad with random deck events so a small focus set still forms a puzzle.
      const have = new Set(pool.map((e) => e.id));
      const rest = shuffled(deck.events.filter((e) => !have.has(e.id)), (Math.random() * 1e9) >>> 0);
      pool = pool.concat(rest.slice(0, need - pool.length));
    }
    if (pool.length < need) return;
    ui.deck = deck;
    ui.selections = {};
    ui.maxEvents = null;
    startGame(pool);
  }

  function modeLabel() {
    // Single mode: label is just the deck (plus active filters, if any).
    const f = summarizeSelections(ui.deck, ui.selections);
    return f === "Full deck" ? ui.deck.name : `${ui.deck.name} · ${f}`;
  }

  // Rail bounds: the timeline line spans exactly the first→last card nodes.
  // Measured from layout (offsetTop is unaffected by the deal/expand
  // animations), so it stays correct while cards animate in. When a card is
  // placed above or below the current span, the extension is animated by the
  // FX layer (anime.js); otherwise the bounds are set directly and the CSS
  // transition covers non-placement updates (screen entry, resize).
  function updateRail(ctx, animate) {
    const tl = ctx.root.querySelector(".timeline");
    if (!tl) return;
    const placed = tl.querySelectorAll(".tl-event");
    if (!placed.length) return;
    // Read phase: all geometry first (one layout pass), then write.
    const firstY = placed[0].offsetTop + placed[0].offsetHeight / 2;
    const lastY = placed[placed.length - 1].offsetTop + placed[placed.length - 1].offsetHeight / 2;
    const tlHeight = tl.offsetHeight;
    const newTop = firstY.toFixed(1) + "px";
    const newBottom = (tlHeight - lastY).toFixed(1) + "px";
    const oldTop = tl.style.getPropertyValue("--rail-top");
    const oldBottom = tl.style.getPropertyValue("--rail-bottom");
    // Write phase.
    if (animate && window.FX && window.FX.railExtend && oldTop && oldBottom &&
        (oldTop !== newTop || oldBottom !== newBottom)) {
      FX.railExtend(tl,
        { top: parseFloat(oldTop), bottom: parseFloat(oldBottom) },
        { top: parseFloat(newTop), bottom: parseFloat(newBottom) });
    } else {
      tl.style.setProperty("--rail-top", newTop);
      tl.style.setProperty("--rail-bottom", newBottom);
    }
  }

  // Scroll-linked focus scale: cards and placement slots nearest the viewport
  // centre render slightly larger (1.025x) and ease down to 0.975x at the
  // top/bottom threshold. Scale-only, so glyphs keep their shape and nothing
  // reflows; the .tl-card is transformed symmetrically about its centre
  // (leaving the rail, node dots, connectors and the fact-sheet popover
  // untouched) and the .gap slots scale with the same falloff. The reusable
  // controller lives in FX.focusScale — created lazily, then refreshed after
  // every rebuild and whenever the game screen becomes visible (measurement
  // needs a laid-out, visible list).
  let focusScaleCtl = null;
  // ---- bowed rail ---------------------------------------------------
  // The rail is a FIXED, full-viewport overlay (built here, inserted as the
  // list's first child). Its curve is drawn in VIEWPORT coordinates, so its
  // SHAPE is constant as you scroll — it cannot wobble; only the CSS mask
  // window over it slides (styles.css .tl-rail). The curve is a quadratic
  // Bézier, which is exactly a parabola: its control point sits 2x the bow
  // depth off the chord.
  let railEls = {}; // pane key -> rail element (one per player in split-screen)
  // Per-pane rail: each player's timeline gets its own fixed overlay scoped to
  // their half of the viewport, with a UNIQUE gradient id (duplicate SVG ids
  // resolve to the first instance — both rails would render with P1's gradient).
  function ensureRailEl(ctx) {
    const root = ctx.root;
    const key = root.dataset.pane || "single";
    const gradId = "tl-rail-grad-" + key;
    let railEl = railEls[key];
    if (!railEl) {
      railEl = document.createElement("div");
      railEl.className = "tl-rail";
      railEl.setAttribute("aria-hidden", "true");
      railEl.innerHTML =
        '<svg preserveAspectRatio="none"><defs>' +
        `<linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">` +
        '<stop offset="0" stop-color="#fff" stop-opacity="0.18"/>' +
        '<stop offset="1" stop-color="#fff" stop-opacity="0.55"/>' +
        '</linearGradient></defs><path pathLength="1"/></svg>';
      railEls[key] = railEl;
    }
    // Mounted on <body>, NOT inside #game: FX.shake() animates a transform on
    // #game, which would make it the containing block for this fixed overlay and
    // drag the rail to #game's box ("the line moves to the centre") for the
    // shake's duration. Outside the screen, no ancestor transform can touch it.
    if (railEl.parentNode !== document.body) document.body.prepend(railEl);
    // Scope the overlay to this player's pane (single-player = full width).
    if (key === "p1") { railEl.style.left = "0"; railEl.style.right = "50%"; }
    else if (key === "p2") { railEl.style.left = "50%"; railEl.style.right = "0"; }
    else { railEl.style.left = "0"; railEl.style.right = "0"; }
    // Point the path at this pane's gradient.
    const path = railEl.querySelector("path");
    path.style.stroke = `url(#${gradId})`;
  }

  // Must mirror the focus-scale range (peak/edge in FX.focusScale + the CSS
  // keyframes): the card's left edge swings +/-(peak-edge)/2 x width, so the
  // rail's full bow (sagitta) is (peak - edge) x width = 0.05 x width.
  const RAIL_PEAK = 1.05, RAIL_EDGE = 0.95;
  function drawRail(ctx) {
    const tl = ctx.root.querySelector(".timeline");
    const key = (ctx.root.dataset.pane) || "single";
    const railEl = railEls[key];
    if (!railEl) return;
    // The rail lives on <body>, so it must be hidden by hand off the game screen.
    const onGame = tl && !screens.game.classList.contains("hidden");
    railEl.hidden = !onGame;
    if (!onGame) return;
    const card = tl.querySelector(".tl-event > .tl-card");
    if (!card) return;
    // offsetWidth is the LAYOUT width (the card's rect is scaled by the focus
    // animation, so getBoundingClientRect would be wrong here).
    const W = card.offsetWidth;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const vh = window.innerHeight, vc = vh / 2;
    // Publish each card's height (for the height-independent view range) and
    // --d = 0.025 x card width (the x-shift the node/stub need at the profile's
    // extremes, consumed by the composited tl-node-shift animation).
    const dPx = (0.025 * W).toFixed(2) + "px";
    // Batch: read every card's height first (one layout pass), then write the
    // custom properties. Interleaving read/write per element would force one
    // synchronous reflow per card — the classic layout-thrash loop.
    const events = tl.querySelectorAll(".tl-event");
    const heights = [];
    for (let i = 0; i < events.length; i++) heights.push(events[i].offsetHeight);
    for (let i = 0; i < events.length; i++) {
      events[i].style.setProperty("--hc", heights[i] + "px");
      events[i].style.setProperty("--d", dPx);
    }
    // With the inset range the mapping is span = viewport height for EVERY card,
    // so the rail's parabola is the plain sphere arc: sagitta = 0.05 x width,
    // apex at the viewport centre. No reference-height factor.
    const bow = reduce ? 0 : 0.05 * W;
    // The node's containing block is the .tl-event box, so anchor the curve to
    // the MEASURED .tl-event left (not an assumed padding offset, which goes
    // stale when a scrollbar appears and shifts the layout).
    const li = tl.querySelector(".tl-event");
    const liLeft = li.getBoundingClientRect().left;
    // Reduced motion disables the scale (--fs stays 1), so the rail must sit at
    // the unscaled node position, not the peak-scale one.
    const refPeak = reduce ? 1 : RAIL_PEAK;
    const xCentre = liLeft + ((1 - refPeak) * W) / 2 - 20;
    const xEnd = xCentre + bow;
    const path = railEl.querySelector("path");
    path.setAttribute("d",
      "M " + xEnd.toFixed(1) + " 0 Q " + (xCentre - bow).toFixed(1) + " " +
      vc.toFixed(1) + " " + xEnd.toFixed(1) + " " + vh.toFixed(1));
  }

  function refreshFocusScale(ctx) {
    const tl = ctx.root.querySelector(".timeline");
    if (!tl || !window.FX || typeof window.FX.focusScale !== "function") return;
    if (!focusScaleCtl) {
      focusScaleCtl = window.FX.focusScale(tl, {
        selector: ".tl-event > .tl-card, .gap",
        peak: 1.05,              // scale at the viewport centre
        edge: 0.95,              // scale at the top/bottom threshold
        curve: "sphere",         // constant-curvature dome: a broad arc, not a highlight
        minOpacity: 0.65,        // edges dim to 65% — a fade you can actually see
        origin: "center center", // grow symmetrically
        scaleVar: "--fs",        // publishes the scale so the rail stub tracks the card
        disabledWhen: () => screens.game.classList.contains("hidden"),
      });
    } else {
      focusScaleCtl.refresh();
    }
  }

  // HUD-only update: prompt card, score, lives, narrator. Shared by the full
  // rebuild (renderGame) and the incremental placement path (commitPlacement)
  // so the hot path never rebuilds the timeline list.
  function updateGameHud(ctx) {
    const state = ctx.state;
    const root = ctx.root;
    const ev = currentEvent(state);
    // The prompt lives inside each pane (same in single-player and split), so
    // update it within this player's root.
    const emojiEl = root.querySelector(".prompt-emoji");
    const titleEl = root.querySelector(".prompt-title");
    if (ev) {
      emojiEl.textContent = ev.emoji || "❓";
      titleEl.textContent = ev.title;
      // Narration is single-player only: two voices would clash in split mode.
      if (window.Narrator && !splitCtx) {
        // Narration audio ships with the deck — tell the player which deck is
        // active so it can resolve each card's clip.
        window.Narrator.setDeck(ui.deck);
        // On the very first deal the voice would otherwise start over the
        // curtain; hold it until the game screen has transitioned in (~1s).
        const firstOfGame = state.roundIndex === 0 && state.status === "playing";
        window.Narrator.speakEvent(ev, { delay: firstOfGame ? 1000 : 0 });
        // Pre-warm the next few clips so their playback is instant.
        const upcoming = state.queue
          .slice(state.roundIndex + 1)
          .map((id) => eventById(ui.deck, id));
        window.Narrator.prefetch(upcoming);
      }
    } else {
      emojiEl.textContent = "✅";
      titleEl.textContent = "Timeline complete!";
    }

    // Count-up from the displayed value (0 on first render — no-op there).
    const scoreEl = root.querySelector(".score-num");
    if (scoreEl) {
      if (window.FX) FX.scoreCount(scoreEl, state.score);
      else scoreEl.textContent = state.score;
    }
    // Single mode: no lives — wrong placements bounce back (slips cost points).
    const livesEl = root.querySelector(".lives");
    if (livesEl) livesEl.textContent = "";
  }

  function renderGame(ctx) {
    const state = ctx.state;
    const root = ctx.root;
    // Cards are being rebuilt — clear any stale hover state.
    if (hoverDebounceTimer) clearTimeout(hoverDebounceTimer);
    setCardHovered(false);

    updateGameHud(ctx);

    const timelineEvents = state.timeline.map((id) => eventById(ui.deck, id));

    const tl = root.querySelector(".timeline");
    tl.innerHTML = "";
    ensureRailEl(ctx); // fixed overlay lives on <body>; just make sure it's mounted
    // First deal: stagger the cards in as the curtain reveals. CSS-driven —
    // the game screen becomes visible mid-curtain, which starts the animation.
    const firstDeal = state.roundIndex === 0 && state.status === "playing";
    timelineEvents.forEach((e, idx) => {
      const li = eventEl(state, e, idx);
      if (firstDeal) li.style.setProperty("--i", String(idx));
      tl.appendChild(gapEl(ctx, idx));
      tl.appendChild(li);
    });
    tl.appendChild(gapEl(ctx, timelineEvents.length));
    if (firstDeal) {
      tl.classList.add("timeline--dealing");
      setTimeout(() => tl.classList.remove("timeline--dealing"), 1600);
    }
    // Rail bounds: measurable only when the screen is visible — the first
    // render runs while hidden, so show()'s swap recomputes on reveal.
    // Animate the extension only when a card was just placed (roundIndex
    // advanced); the first deal draws in via the CSS rail-draw animation.
    if (!screens.game.classList.contains("hidden")) updateRail(ctx, state.roundIndex > 0);
    // (Re)fit the focus scale to the rebuilt list. No-op while the screen is
    // hidden (rects are 0); show() refreshes once it is laid out.
    refreshFocusScale(ctx);
    drawRail(ctx);
    // Roving tabindex: promote the first gap into the tab order.
    syncGapTabindex(tl, ctx);

    // Dock globe: placed markers coloured by outcome, current prompt on top.
    // Split-screen routes each player to their own globe. Deferred at game
    // start so the docks appear under the curtain, not before it.
    if (!deferGlobeSync) syncGlobe(ctx);
  }

  // Dock-globe marker colour for a placed card — mirrors placedClassFor().
  function placedKindFor(state, e) {
    if (state.anchorIds && state.anchorIds.has(e.id)) return "anchor";
    const slips = state.cardSlips ? state.cardSlips[e.id] : null;
    return slips === 0 ? "good" : "bad";
  }

  // Build a fact-sheet row; returns "" when the value is empty.
  function factRow(label, value) {
    if (value == null || String(value).trim() === "") return "";
    return (
      `<div class="fs-row"><span class="fs-label">${escapeHtml(label)}</span>` +
      `<span class="fs-val">${escapeHtml(value)}</span></div>`
    );
  }
  // Structured "fact sheet" table (Who / Where / Why it matters) + a mini map.
  // includeMap is skipped on the Browse list (which can be ~160 items) to avoid
  // spinning up that many Leaflet instances at once.
  // Optional post-placement "learn more" prose. Shown only where the fact
  // sheet is (all post-reveal surfaces), so a year here does not leak the
  // answer; it is never narrated. Absent on most events and on imported decks.
  function factSheetHtml(e, includeMap = true, whyOverride = null) {
    const summary = e.summary
      ? `<p class="fs-summary">${escapeHtml(e.summary)}</p>`
      : "";
    // A connection rationale may stand in for the significance line on a
    // slipped card (doc/CONNECTION_CUE_PLAN.md §4.5). Absent on every other
    // surface and for every band that may not see prose.
    const whyValue =
      whyOverride != null && String(whyOverride).trim() !== "" ? whyOverride : e.why;
    const rows =
      factRow("Who", e.who) +
      factRow("Where", e.where) +
      factRow("Why it matters", whyValue);
    let mapHtml = "";
    if (includeMap) {
      if (e.noMap) {
        mapHtml = `<div class="fact-nomap">🌕 Off Earth — no map</div>`;
      } else if (typeof e.lat === "number" && typeof e.lng === "number") {
        mapHtml =
          `<div class="fact-map" data-lat="${e.lat}" data-lng="${e.lng}" ` +
          `data-area="${e.area || ""}"></div>`;
      }
    }
    const body = summary + rows + mapHtml;
    return body ? `<div class="fs-rows">${body}</div>` : "";
  }

  // "Read the Story" opens a SEPARATE window, so it must not use a caret: a
  // caret signals "this element expands in place" (NN/g), and on a button it
  // signals "opens a menu". A labelled button with a trailing arrow is the
  // honest signifier for "open/go", and aria-haspopup tells AT it opens a
  // dialog. It is deliberately NOT placed inside a fact sheet — those are
  // role="tooltip", which must not contain interactive content. The accessible
  // name carries the event title so repeated controls on a list stay distinct.
  function learnBtnHtml(e) {
    if (!e || !e.story) return "";
    return (
      `<button type="button" class="fs-learn" data-story="${escapeHtml(e.id)}"` +
      ` aria-haspopup="dialog" aria-controls="story-modal"` +
      ` aria-label="Read the story: ${escapeHtml(e.title)}">` +
      `Read the Story <span class="fs-learn-arrow" aria-hidden="true">&#8594;</span></button>`
    );
  }

  // ---- story takeover (native <dialog>) --------------------------------
  // "Read the Story" opens the deep layer: the fact sheet stays put, with the
  // narrative and the deeper details revealed underneath. showModal() gives
  // focus containment, an inert background, Escape and top-layer stacking for
  // free; we add deliberate initial focus and a short fade.
  function findEventById(id) {
    const decks = window.DECKS || [];
    for (let i = 0; i < decks.length; i++) {
      const ev = (decks[i].events || []).find((x) => x.id === id);
      if (ev) return ev;
    }
    return null;
  }

  // One statement per story, made where the story is. It names the relationship
  // AND points at the evidence. (A panel-level badge proved redundant — the fact
  // sheet is not the story — and it mislabelled the factual sections above it.)
  const STORY_SOURCES = {
    retold: { title: "Retold from" },
    adapted: { title: "Adapted from" },
    abridged: { title: "Abridged from" },
    paraphrased: { title: "Paraphrased from" },
    summarised: { title: "Summarised from" },
    translated: { title: "Translated from" },
    quoted: { title: "Quoted from" },
    invented: { title: "An imagined story, based on", disclosure: true },
    original: { title: "Written for this game", standalone: true },
  };
  const STORY_SOURCE_DEFAULT = { title: "From" };

  // Rows: prefer the structured `sources[]`; fall back to a lone `source`.
  function storySources(e) {
    if (Array.isArray(e.sources) && e.sources.length) return e.sources;
    return e.source ? [e.source] : [];
  }

  function storyRelText(e) {
    const meta = STORY_SOURCES[e.storySource] || STORY_SOURCE_DEFAULT;
    if (meta.standalone) return meta.title;
    return storySources(e).length ? `${meta.title} the sources below` : "";
  }

  function sourceHref(s) {
    // Cite the exact revision we pinned where the source is versioned — a link the
    // reader can check and that can't drift.
    if (s.url && s.revision && s.url.includes("/wiki/")) {
      return s.url.replace("/wiki/", "/w/index.php?title=") + "&oldid=" + encodeURIComponent(s.revision);
    }
    return s.url || "";
  }

  // The citation cell: author, 'title', publisher · revision · licence (CC's TASL).
  function sourceCiteHtml(s) {
    const name = s.name || s.title || s.url || "source";
    const href = sourceHref(s);
    const title = s.title ? `'${escapeHtml(s.title)}'` : escapeHtml(name);
    const link = href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : title;
    const bits = [];
    if (s.author) bits.push(escapeHtml(s.author));
    bits.push(link);
    if (s.publisher) bits.push(escapeHtml(s.publisher));
    let out = bits.join(", ");
    const tail = [];
    if (s.revision) tail.push(`revision ${escapeHtml(s.revision)}`);
    if (s.license) tail.push(escapeHtml(s.license));
    if (tail.length) out += ` · ${tail.join(" · ")}`;
    return out;
  }

  // One table, two columns: Source | Used for. The title is neutral because these
  // sources back the whole panel (summary, story AND details) — the relationship
  // is stated with the story, where it belongs. The changes line closes the
  // attribution: it is a statement about the ADAPTATION, so it stays one line
  // however many sources the table lists (CC's "indicate if changes were made").
  function sourcesHtml(e) {
    const rows = storySources(e);
    if (!rows.length) return "";
    const body = rows
      .map(
        (s) =>
          `<tr><td class="src-cite">${sourceCiteHtml(s)}</td>` +
          `<td class="src-used">${escapeHtml(s.usedFor || s.note || "")}</td></tr>`,
      )
      .join("");
    return (
      `<section class="story-sources">` +
      `<h3 class="sources-title">Sources</h3>` +
      `<table><thead><tr><th>Source</th><th>Used for</th></tr></thead><tbody>${body}</tbody></table>` +
      `</section>`
    );
  }

  function storyHtml(e) {
    // The fact sheet itself stays in place — the same summary / who / where /
    // why (and map) that the tooltip shows …
    let html = factSheetHtml(e);
    // … with the deep layer appended beneath it. The story is set apart by a rule
    // down its left side and carries its own statement of what it is — a panel-level
    // badge would sit above the factual sections and mislabel them.
    html += `<div class="story-deep">`;
    if (e.story) {
      const meta = STORY_SOURCES[e.storySource] || STORY_SOURCE_DEFAULT;
      const rel = storyRelText(e);
      html += `<section class="story-block">`;
      html += `<h3 class="story-heading">The Story</h3>`;
      // The rule wraps the story CONTENT — the prose and its own disclosure — with
      // the section's labels sitting above it, unruled.
      html += `<div class="story-ruled">`;
      // The story is stored as one string; a blank line separates paragraphs, so it
      // renders as prose rather than a wall of text. Narrative paragraphing: a new
      // beat, speaker, actor, or shift in time/place starts a new paragraph.
      html += String(e.story)
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p class="story-text">${escapeHtml(p)}</p>`)
        .join("");
      html += `</div>`;
      // The disclosure is a BOX after the story, not prose inside it (2026-09-14).
      // Plain disclosure demonstrably fails to stop fiction leaking into memory as
      // fact (Green & Brock 2000; Marsh & Fazio 2006) — and where it goes is not
      // neutral: the only clean timing result favours disclosing AFTER exposure over
      // labelling before it (Brashier, PNAS 2021). Museum practice puts a terse
      // identity label adjacent to the object; children's fact/fiction hybrids put the
      // substantive note in back matter. Hence: one box, adjacent, after the prose,
      // assembled from fields — so it is written once and rendered identically every
      // time instead of being re-voiced in prose by each drafter.
      const disclosure = rel || e.storyNote || e.changed;
      if (disclosure) {
        html +=
          `<section class="story-disclosure">` +
          `<h3 class="disclosure-title">What's real in this story</h3>` +
          (rel ? `<p class="disclosure-line">${escapeHtml(rel)}</p>` : "") +
          (e.storyNote ? `<p class="disclosure-note">${escapeHtml(e.storyNote)}</p>` : "") +
          (e.changed ? `<p class="disclosure-changed">Changes: ${escapeHtml(e.changed)}</p>` : "") +
          `</section>`;
      }
      html += `</section>`;
    }
    if (e.details) {
      html +=
        `<section class="details-block"><h3 class="story-heading">More details</h3>` +
        `<p>${escapeHtml(e.details)}</p></section>`;
    }
    html += sourcesHtml(e);
    html += `</div>`;
    return html;
  }

  // ---- expansion motion -------------------------------------------------
  // The panel IS the window the tooltip was: it opens at the fact sheet's exact
  // rect and animates its LEFT/TOP/WIDTH/HEIGHT to full screen. Animating the
  // box (not transform / clip-path) is what makes the text reflow as the window
  // widens. A native <dialog> supplies focus containment, an inert background,
  // Escape and top-layer stacking for free.
  const STORY_MOTION = 340;
  let storyOriginEl = null;  // the tooltip window we grew out of
  let storyOriginBox = null; // its rect, captured at open (the element may detach)

  function prefersReduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function boxOf(r) {
    return r
      ? { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
      : null;
  }

  // The fact-sheet window the trigger belongs to — the thing that expands.
  function storyOriginSheetFor(el) {
    if (!el || !el.closest) return null;
    const floating = document.querySelector(".fact-sheet.tl-hover");
    if (floating && floating.isConnected) return floating;
    const scope = el.closest(".tl-event, .rt-info, li") || document;
    const sheet = scope.querySelector ? scope.querySelector(".fact-sheet, .fs-rows") : null;
    if (sheet) {
      const r = sheet.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return sheet;
    }
    return null;
  }

  function placeAtBox(dlg, box) {
    dlg.classList.add("is-morph");
    dlg.style.left = box.left + "px";
    dlg.style.top = box.top + "px";
    dlg.style.width = box.width + "px";
    dlg.style.height = box.height + "px";
  }

  function placeFull(dlg) {
    dlg.classList.remove("is-morph");
    dlg.style.left = "0px";
    dlg.style.top = "0px";
    dlg.style.width = "100vw";
    dlg.style.height = "100vh";
  }

  function openStory(e, triggerEl) {
    const dlg = $("story-modal");
    if (!dlg || typeof dlg.showModal !== "function" || !e) return;

    const sheet = storyOriginSheetFor(triggerEl);
    storyOriginEl = sheet;
    const box = boxOf(sheet ? sheet.getBoundingClientRect() : triggerEl && triggerEl.getBoundingClientRect());
    storyOriginBox = box;

    $("story-title").textContent = e.title || "Story";
    $("story-body").innerHTML = storyHtml(e);

    const animate = !!box && !prefersReduced();
    if (animate) {
      placeAtBox(dlg, box); // begin as the tooltip window
      if (sheet) sheet.style.visibility = "hidden"; // never two windows at once
    } else {
      placeFull(dlg);
    }

    dlg.showModal();
    initAllFactMaps(dlg); // the retained fact sheet carries its own mini-map
    // Deliberate initial focus: the heading, so the panel is read from the top
    // (never the close button, which is not even first in the tab order).
    const title = $("story-title");
    if (title) title.focus({ preventScroll: true });
    const scroller = $("story-scroll");
    if (scroller) scroller.scrollTop = 0;

    if (animate) {
      void dlg.offsetWidth; // flush the "start" geometry so the transition runs
      requestAnimationFrame(() => placeFull(dlg));
    }
  }

  function closeStory() {
    const dlg = $("story-modal");
    if (!dlg || !dlg.open) return;

    const finish = () => {
      if (storyOriginEl) storyOriginEl.style.visibility = "";
      storyOriginEl = null;
      storyOriginBox = null;
      if (dlg.open) dlg.close();
    };

    if (prefersReduced() || !storyOriginBox) { finish(); return; }

    // Shrink back to the tooltip window, then close.
    let done = false;
    const once = () => { if (!done) { done = true; finish(); } };
    dlg.addEventListener("transitionend", once, { once: true });
    setTimeout(once, STORY_MOTION + 120); // safety net
    placeAtBox(dlg, storyOriginBox);
  }

  // ---- mini map (Leaflet + a tile-free Natural Earth land outline) ----
  // Points (cities) render as a dot; regions/countries/continents render as an
  // area circle; "world" spans the globe; noMap (e.g. the Moon) shows nothing.
  // Basemap: NASA Blue Marble satellite tiles when mode=Satellite & online,
  // otherwise the offline vector outline. Tiles failing to load fall back too.
  const MAP_MODE_KEY = "timeline.mapMode";
  let mapMode = localStorage.getItem(MAP_MODE_KEY) || "satellite";

  function addVectorLand(map) {
    L.geoJSON(window.WORLD_LAND, {
      style: { fillColor: "#2a3f63", color: "#5b7bb0", weight: 0.6, fillOpacity: 0.9 },
      interactive: false,
    }).addTo(map);
  }

  // Leaflet captures its container's size at init, and adding layers to a map
  // whose container is still hidden (0×0) throws inside Leaflet's clip-path
  // math. The curtain defers the screen swap to cover-end, so maps created
  // while the destination screen is display:none end up broken or cropped
  // until a window resize re-measures them. Defer the whole init until the
  // container is actually laid out. (Check clientWidth/Height, not offsetParent
  // — offsetParent is null for the position:fixed hover card.)
  function whenRendered(el, fn, tries = 300) {
    if (el.clientWidth > 0 && el.clientHeight > 0) { fn(); return; }
    if (tries <= 0) return;
    requestAnimationFrame(() => whenRendered(el, fn, tries - 1));
  }

  function initFactMap(container) {
    if (!window.L || !window.WORLD_LAND || container._map || container._mapPending) return;
    container._mapPending = true;
    whenRendered(container, () => {
      container._mapPending = false;
      try {
        const lat = parseFloat(container.dataset.lat);
        const lng = parseFloat(container.dataset.lng);
        const area = container.dataset.area || "";
        const opts = {
          zoomControl: true, attributionControl: false,
          dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
          boxZoom: false, keyboard: false, touchZoom: true,
          minZoom: 1, maxZoom: 6,
        };
        const map = L.map(container, opts);
        container._map = map;
        container.style.background = "#0c1422";
        // Zoom must never move the event location off-center. Leaflet's wheel
        // and double-click zoom anchor on the cursor/click point, which drifts
        // the center; the zoom-control buttons already zoom around the center.
        // Disable the cursor-anchored handlers and zoom around the map center
        // instead (setZoomAround with the center point keeps the center fixed).
        let wheelAccum = 0;
        let wheelTimer = null;
        container.addEventListener("wheel", (e) => {
          e.preventDefault();
          wheelAccum += e.deltaY;
          if (wheelTimer) return;
          wheelTimer = setTimeout(() => {
            wheelTimer = null;
            // Negative deltaY (scroll up) zooms in, matching Leaflet's convention.
            const steps = Math.round(-wheelAccum / 60);
            wheelAccum = 0;
            if (steps) map.setZoomAround(map.getSize().divideBy(2), map.getZoom() + steps);
          }, 40);
        });
        map.on("dblclick", () => {
          map.setZoomAround(map.getSize().divideBy(2), map.getZoom() + 1);
        });
        const wantSat = mapMode !== "plain" && navigator.onLine !== false;
        if (wantSat) {
          const sat = L.tileLayer(
            "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2018-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
            { maxZoom: 8, attribution: "" }
          ).addTo(map);
          sat.on("tileerror", () => { if (!container._satFallback) { container._satFallback = true; addVectorLand(map); } });
          L.geoJSON(window.WORLD_LAND, {
            style: { fill: false, fillOpacity: 0, color: "#9fb3d0", weight: 0.5, opacity: 0.7 },
            interactive: false,
          }).addTo(map);
        } else {
          addVectorLand(map);
        }
        if (area === "world") {
          map.setView([20, 0], 1);
        } else if (area) {
          map.setView([lat, lng], 3); // establish projection before measuring bounds
          const circ = L.circle([lat, lng], {
            radius: parseFloat(area) * 1000,
            color: "#ffb74d", weight: 1.4, fillColor: "#ffb74d", fillOpacity: 0.28,
            interactive: false,
          }).addTo(map);
          map.fitBounds(circ.getBounds(), { padding: [8, 8], maxZoom: 3 });
        } else {
          // Set the view BEFORE adding the marker: a Path layer added to an
          // unloaded map creates the renderer with a deferred _layerAdd, so
          // the geoJSON outline (added during load) would render against an
          // uninitialized renderer and throw inside Leaflet's _clipPoints.
          map.setView([lat, lng], 3);
          L.circleMarker([lat, lng], {
            radius: 5, color: "#ffb74d", weight: 1.5, fillColor: "#ffd27f", fillOpacity: 1,
            interactive: false,
          }).addTo(map);
        }
        // Pinch zoom anchors on the gesture midpoint, which drifts the center;
        // re-center on zoomend so the location stays centered no matter how the
        // zoom happened. (Wheel/double-click/control zoom are already
        // center-anchored, so this is a no-op for them.)
        const anchor = map.getCenter();
        map.on("zoomend", () => {
          map.setView(anchor, map.getZoom());
        });
      } catch (e) {
        console.error("fact-map init failed", e);
      }
    });
  }
  function ensureFactMap(li) {
    const c = li.querySelector(".fact-map");
    if (!c) return;
    if (c._map) { try { c._map.invalidateSize(); } catch (_) {} }
    else initFactMap(c);
  }
  function initAllFactMaps(root) {
    if (!root) return;
    root.querySelectorAll(".fact-map").forEach(initFactMap);
  }

  // Placed-card state class, shared by the game timeline and the results page:
  // anchor | placed-clean (first try) | placed-slipped slip-N (escalating toward red).
  function placedClassFor(state, e) {
    if (state.anchorIds && state.anchorIds.has(e.id)) return "anchor";
    const slips = state.cardSlips ? state.cardSlips[e.id] : null;
    return slips === 0 ? "placed-clean" : "placed-slipped slip-" + Math.min(slips || 1, 3);
  }

  // Dismiss a tap-pinned fact sheet when the pointer goes down anywhere outside
  // it. Without this, `.open` (toggled by the ? button) was never cleared, so the
  // popover stayed up for the rest of the round — the "tooltip stuck open" bug.
  // Registered once, at load; a pointerdown inside the card (or its popover) is
  // left alone so interacting with the mini-map doesn't dismiss it.
  document.addEventListener("pointerdown", (ev) => {
    const openCards = document.querySelectorAll(".tl-event.open");
    if (!openCards.length) return;
    openCards.forEach((li) => {
      if (li.contains(ev.target)) return;
      li.classList.remove("open");
      const b = li.querySelector(".fact-toggle");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  });

  // Keep the fact-sheet tooltip inside the window. CSS anchors it to the right
  // of the event card (left: calc(100% + 12px)); a card near an edge would push
  // the tooltip off-screen, so measure it and clamp/flip both axes. Fixed
  // positioning makes left/top viewport-relative (no transformed ancestor sits
  // between the sheet and the viewport — only the inner .tl-card is scaled).
  function positionFactSheet(li) {
    const sheet = li && li.querySelector(".fact-sheet");
    if (!sheet) return;
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // The sheet may not be painted yet on the first frame it opens — force
    // layout (hidden) so offsetWidth/Height are real, then restore.
    const wasHidden = getComputedStyle(sheet).display === "none";
    if (wasHidden) { sheet.style.display = "block"; sheet.style.visibility = "hidden"; }
    const w = sheet.offsetWidth;
    const h = sheet.offsetHeight;
    const card = li.querySelector(".tl-card") || li;
    const cr = card.getBoundingClientRect();
    // Horizontal: prefer the right of the card, flip left when it would
    // overflow, and fall back to a clamped right edge when neither fits.
    let left = cr.right + 12;
    if (left + w > vw - pad) {
      const flipped = cr.left - 12 - w;
      left = flipped >= pad ? flipped : Math.max(pad, vw - pad - w);
    }
    // Vertical: align near the card top, then clamp so the whole sheet stays
    // in view; if it is taller than the window, pin to the top and scroll it.
    let top = cr.top + 8;
    if (top + h > vh - pad) top = vh - pad - h;
    if (top < pad) top = pad;
    if (h > vh - 2 * pad) {
      top = pad;
      sheet.style.maxHeight = (vh - 2 * pad) + "px";
      sheet.style.overflowY = "auto";
    } else {
      sheet.style.maxHeight = "";
      sheet.style.overflowY = "";
    }
    sheet.style.position = "fixed";
    sheet.style.left = left + "px";
    sheet.style.top = top + "px";
    if (wasHidden) { sheet.style.visibility = ""; sheet.style.display = ""; }
  }

  // ---- connection cue (doc/CONNECTION_CUE_PLAN.md) ----------------------
  // The authored connections[] graph, indexed once per deck object. Keyed on
  // the deck OBJECT so switching or importing a deck rebuilds it; nothing is
  // persisted (the index is derived from the deck alone — D3).
  let connIdxDeck = null;
  let connIdx = null;
  function connectionIndex() {
    const deck = ui.deck;
    if (!deck || !window.Connections || !Array.isArray(deck.events)) return null;
    if (connIdxDeck !== deck) {
      connIdx = window.Connections.indexEdges(deck.events);
      connIdxDeck = deck;
    }
    return connIdx;
  }

  // The one cue for this card, computed against the board as it stands NOW and
  // then frozen, so a later re-render can never change the story (the board
  // keeps moving as cards land — §2.3). Only a SLIPPED card carries one: it is
  // a slip surface, inherited from A8 (§8 Q3). Memoised per card id.
  function freezeCue(state, ev) {
    if (!state || !ev || typeof ev.id !== "string") return null;
    if (!state.cardCue) state.cardCue = {};
    if (Object.prototype.hasOwnProperty.call(state.cardCue, ev.id)) {
      return state.cardCue[ev.id];
    }
    let cue = null;
    if ((state.wrongOnCurrent || 0) > 0 && window.Connections) {
      const idx = connectionIndex();
      if (idx) cue = window.Connections.cueFor(ev, idx, new Set(state.timeline));
    }
    state.cardCue[ev.id] = cue;
    return cue;
  }

  function cueLineFor(state, id) {
    if (!window.Connections || !state.cardCue || !state.cardCue[id]) return "";
    return window.Connections.cueText(state.cardCue[id]);
  }

  // The band of the player a state belongs to (split-screen aware), never
  // re-derived from anywhere else (GAMIFICATION_BRIEF §5).
  function bandForState(state) {
    if (state && state.userId) {
      const u = ensureUsers().users.find((x) => x.id === state.userId);
      if (u) return band(u);
    }
    return band(activeUser());
  }

  function eventEl(state, e, idx) {
    const li = document.createElement("li");
    li.className = "tl-event " + placedClassFor(state, e);
    const revealed = state.revealedFacts[e.id];
    const sameYearNeighbor = state.timeline.some(
      (id, i) => id !== e.id && sortYearOf(eventById(ui.deck, id)) === sortYearOf(e)
    );
    const connText = cueLineFor(state, e.id);
    // The popover's generic "Why it matters" restates the card's significance;
    // on a slipped card with a usable edge, the connection's authored rationale
    // explains the placement instead (FR5). Prose is 12+ only (FR8), so younger
    // bands keep the significance line and simply get the phrase inline.
    const connRationale =
      state.cardCue && state.cardCue[e.id] && window.Connections
        ? window.Connections.rationaleFor(state.cardCue[e.id], bandForState(state))
        : null;
    const sheet = factSheetHtml(e, true, connRationale);
    // .tl-event is the untransformed layout box (rail node + connector + the
    // fact-sheet popover live here); the card skin and its contents are the
    // inner .tl-card, which is what FX.focusScale scales — so the rail and the
    // popover never move or resize with the scroll-linked focus effect.
    li.innerHTML =
      `<span class="tl-node" aria-hidden="true"></span>` +
      `<div class="tl-card">` +
      `<span class="tl-emoji">${e.emoji || "📌"}</span>` +
      `<div class="tl-info">` +
      `<span class="tl-title">${escapeHtml(e.title)}</span>` +
      (revealed
        ? (fmtYears(e) ? `<span class="tl-year">${fmtYears(e)}</span>` : "") +
          `<span class="tl-fact">${escapeHtml(revealed)}</span>` +
          (connText ? `<span class="tl-conn">${escapeHtml(connText)}</span>` : "") +
          (sheet
            ? `<button class="fact-toggle" type="button" aria-label="Show fact sheet" aria-expanded="false">❔</button>`
            : "") +
          (sameYearNeighbor ? `<span class="same-year-note">shares a year with a neighbor</span>` : "") +
          learnBtnHtml(e)
        : "") +
      `</div>` +
      `</div>` +
      (revealed && sheet ? `<div class="fact-sheet" role="tooltip">${sheet}</div>` : "");
    // Tap/click the ? to toggle the sheet (hover covers mouse users).
    const btn = li.querySelector(".fact-toggle");
    if (btn) {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const open = li.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
          positionFactSheet(li); // keep it inside the window once visible
          ensureFactMap(li); // build the mini-map lazily on first open
          const g = globeForState(state);
          if (g) g.focus(e); // aim this player's globe at this card
        }
      });
    }
    // Mouse users reveal the sheet on hover — init the map then too.
    li.addEventListener("mouseenter", () => {
      positionFactSheet(li); // anchor inside the window before the first paint
      ensureFactMap(li);
      if (hoverDebounceTimer) { clearTimeout(hoverDebounceTimer); hoverDebounceTimer = null; }
      setCardHovered(true);
      const g = globeForState(state);
      if (g) g.focus(e); // shift this player's globe to this card
    });
    // Keyboard users open it via :focus-within — same window-aware placement.
    li.addEventListener("focusin", () => positionFactSheet(li));
    li.addEventListener("mouseleave", () => {
      // On a hover-capable device the sheet is already shown by :hover while the
      // pointer is over the card AND its popover, so a click-pinned `.open` must
      // not outlive the hover — otherwise it looks permanently stuck. Touch
      // devices keep it (no hover) and it clears on an outside tap.
      if (window.matchMedia("(hover: hover)").matches) {
        li.classList.remove("open");
        if (btn) btn.setAttribute("aria-expanded", "false");
      }
      // Debounce: a fast move to another card cancels this (the new card's
      // mouseenter clears the timer), so the globe never jerks back to the
      // prompt event mid-transition. When it DOES fire (pointer has actually
      // left the cards — onto a gap, the prompt, or outside), return the
      // globe to the current "place this event" spot and let the prompt
      // card pulse again.
      if (hoverDebounceTimer) clearTimeout(hoverDebounceTimer);
      hoverDebounceTimer = setTimeout(() => {
        hoverDebounceTimer = null;
        setCardHovered(false);
        const g = globeForState(state);
        if (g) g.focus(currentEvent(state));
      }, 200);
    });
    return li;
  }

  function gapEl(ctx, index) {
    const state = ctx.state;
    const g = document.createElement("li");
    g.className = "gap";
    g.dataset.index = String(index);
    g.setAttribute("role", "button");
    // Roving tabindex: only the focused gap is in the tab order (tabindex="0");
    // the rest are reachable with arrow keys (tabindex="-1"). syncGapTabindex
    // promotes the active gap after every rebuild/insert.
    g.setAttribute("tabindex", "-1");
    g.textContent =
      index === 0 ? "＋ BEFORE" :
      index === state.timeline.length ? "＋ AFTER" :
      "＋ PLACE HERE";
    // Read the CURRENT data-index at interaction time, not the creation-time
    // closure value: insertPlacedEvent bumps data-index on subsequent gaps,
    // so a captured index would go stale and target the wrong position.
    const gapIndex = () => parseInt(g.dataset.index, 10);
    g.addEventListener("click", () => attemptPlace(ctx, gapIndex()));
    g.addEventListener("keydown", (e) => {
      if (splitCtx && splitCtx.length) return; // split: Enter is P2's key (document-level)
      // Both player schemes place in single-player: Enter/Space (P2) + A (P1).
      if (e.key === "Enter" || e.key === " " || e.key === "a" || e.key === "A") { e.preventDefault(); attemptPlace(ctx, gapIndex()); }
    });
    return g;
  }

  // Incremental insert: replace the gap at `index` with [event, gap] — O(1)
  // DOM work instead of rebuilding the whole timeline. Subsequent gaps get
  // their data-index bumped (attribute writes only — no layout cost), keeping
  // attemptPlace / rescue / keyboard targeting correct. Returns the new event
  // element so the caller can animate it.
  function insertPlacedEvent(ctx, index, ev) {
    const state = ctx.state;
    const tl = ctx.root.querySelector(".timeline");
    const oldGap = tl.querySelector(`.gap[data-index="${index}"]`);
    if (!oldGap) return null;
    // Snapshot the pre-existing gaps BEFORE the swap: the new gap created
    // below already carries index+1 and must NOT be bumped by the loop.
    const existingGaps = Array.from(tl.querySelectorAll(".gap[data-index]"));
    const newEvent = eventEl(state, ev, index);
    const newGap = gapEl(ctx, index + 1);
    // The old gap is KEPT — it becomes the slot before the new event — and
    // the event + a fresh gap are inserted after it. (Replacing the gap would
    // consume it and leave the timeline one slot short.)
    oldGap.insertAdjacentElement("afterend", newEvent);
    newEvent.insertAdjacentElement("afterend", newGap);
    // The kept gap can no longer be the trailing "＋ AFTER" slot (the new gap
    // owns that now); re-label it from its position.
    oldGap.textContent =
      index === 0 ? "＋ BEFORE" :
      index === state.timeline.length ? "＋ AFTER" :
      "＋ PLACE HERE";
    // Bump data-index on all subsequent pre-existing gaps (attribute writes —
    // no layout), keeping attemptPlace / rescue / keyboard targeting correct.
    existingGaps.forEach((g) => {
      const i = parseInt(g.dataset.index, 10);
      if (i > index) g.dataset.index = String(i + 1);
    });
    return newEvent;
  }

  // The full rebuild used to wipe rescue UI (callout + locked gaps) for free;
  // the incremental path must clear it explicitly. Restores each gap's label,
  // tabindex and aria state from its (already bumped) data-index.
  function clearRescueUI(ctx) {
    const state = ctx.state;
    const tl = ctx.root.querySelector(".timeline");
    if (!tl) return;
    tl.querySelectorAll(".gap-callout").forEach((c) => c.remove());
    tl.querySelectorAll(".gap").forEach((g) => {
      const i = Number(g.dataset.index);
      g.classList.remove("gap--rescue", "gap--locked");
      g.removeAttribute("aria-disabled");
      g.textContent =
        i === 0 ? "＋ BEFORE" :
        i === state.timeline.length ? "＋ AFTER" :
        "＋ PLACE HERE";
    });
    // Restore the roving tab order (one gap in the tab sequence).
    syncGapTabindex(tl, ctx);
  }

  // A correct placement is committed here so both the normal path and the
  // rescue safety-net (a stray tap while the answer is showing) share one body.
  function commitPlacement(ctx, index, ev) {
    const state = ctx.state;
    const root = ctx.root;
    // Freeze the connection cue against the board as it stands now — before
    // this card lands and before wrongOnCurrent is cleared — so the reveal and
    // any rescue callout agree, and a later re-render cannot change it.
    const cue = freezeCue(state, ev);
    // Capture BEFORE clearing: the incremental path must wipe the rescue
    // callout/locked gaps itself (the old full rebuild did it for free).
    // Clear BEFORE the splice: clearRescueUI re-labels gaps from their
    // data-index against state.timeline.length, so both must still be in the
    // pre-insert state (insertPlacedEvent bumps the indices afterwards).
    const hadRescue = !!state.rescue;
    state.rescue = null;
    const live = root.querySelector(".rescue-status");
    if (live) live.textContent = "";
    if (hadRescue) clearRescueUI(ctx);

    state.timeline.splice(index, 0, ev.id);
    state.revealedFacts[ev.id] = ev.fact;
    state.outcomes.push("correct");
    // Remember how many slips this card needed (0 = clean first try) so the
    // timeline can differentiate it visually.
    state.cardSlips[ev.id] = state.wrongOnCurrent;
    // Flat scoring: a card is worth POINTS_PER_CARD; each slip on it costs 1
    // (floor 0) so the final score reflects how cleanly the run was played.
    const value = Math.max(0, POINTS_PER_CARD - state.wrongOnCurrent);
    state.score += value;
    state.roundIndex += 1;
    state.wrongOnCurrent = 0;
    flashFeedback(value > 0 ? `✓ +${value}` : "✓ placed +0", true, root);
    // The reveal line also reaches the polite live region (FR9). Skipped on the
    // rescue path: the callout already announced the same cue, and repeating it
    // at commit would read the sentence twice.
    if (cue && !hadRescue && live && window.Connections) {
      live.textContent = window.Connections.cueAnnounce(cue);
    }
    state.streak += 1;
    playSfx("correct", { streak: state.streak });

    if (state.roundIndex >= state.queue.length) { finishGame(ctx, true); return; }
    // Hot path: update the HUD (next prompt/score) and insert just the one
    // card — no full timeline rebuild. The rescue callout/locked gaps are
    // wiped by the rebuild today, so clear them explicitly here.
    updateGameHud(ctx);
    const newEventEl = insertPlacedEvent(ctx, index, ev);
    // Roving tabindex: keep the focused gap promoted (it may have shifted).
    syncGapTabindex(root.querySelector(".timeline"), ctx);
    // Split: re-render the player's cursor highlight (gaps shifted on insert).
    if (splitCtx && splitCtx.length) renderSplitCursor(ctx);
    if (!screens.game.classList.contains("hidden")) updateRail(ctx, true);
    refreshFocusScale(ctx);
    drawRail(ctx);
    const globe = globeFor(ctx);
    if (globe) {
      globe.syncGame(
        state.timeline.map((id) => {
          const e = eventById(ui.deck, id);
          return { ev: e, kind: placedKindFor(state, e) };
        }),
        currentEvent(state)
      );
    }
    // Animate only the newly inserted event
    if (newEventEl && newEventEl.classList.contains("tl-event")) {
      newEventEl.classList.add("tl-event--entering");
      newEventEl.addEventListener("animationend", () => {
        newEventEl.classList.remove("tl-event--entering");
      }, { once: true });
      // Juice: lock-in burst + floating score + green vignette, tiered
      // by streak (heavy at 3+ consecutive corrects).
      juicePlace(newEventEl, value, state.streak);
    }
    // Rail pulse: the timeline line flashes as the card locks in.
    const tl = root.querySelector(".timeline");
    tl.classList.add("timeline--pulse");
    setTimeout(() => tl.classList.remove("timeline--pulse"), 500);
    // Rail glow: energy travels outward from the new node along the line
    // (up and down to the rail ends), fading as it goes. Slight delay so
    // it reads after the card's expand-in starts.
    if (newEventEl && window.FX && window.FX.railGlow) {
      FX.railGlow(tl, newEventEl, { delay: 60 });
    }
  }

  function attemptPlace(ctx, index) {
    const state = ctx.state;
    const root = ctx.root;
    if (state.status !== "playing") return;
    // Re-arm WebAudio inside this click gesture: browsers suspend the context
    // after tab switches, and resume() outside a gesture is rejected — which
    // made narration silently skip cards.
    if (window.Narrator) window.Narrator.unlock();
    const ev = currentEvent(state);
    if (!ev) return;

    const timelineEvents = state.timeline.map((id) => eventById(ui.deck, id));
    const [lo, hi] = correctIndexRange(ev, timelineEvents);
    // Handicap: extra tolerance widens the accepted range (a weaker player can
    // be a few years off and still count it). Applied as a gap-range extension.
    const tol = (state.handicap && state.handicap.toleranceYears) || 0;
    const lo2 = Math.max(0, lo - tol);
    const hi2 = Math.min(state.timeline.length, hi + tol);
    const correct = index >= lo2 && index <= hi2;

    if (correct) { commitPlacement(ctx, index, ev); return; }

    state.outcomes.push("wrong");
    state.wrongOnCurrent += 1;
    state.streak = 0;

    // Rescued already: the answer is on screen, so a stray tap just finishes
    // the placement instead of looping. While a rescue shows, only the correct
    // gap is a live target, so this is a safety net rather than the main path.
    if (state.rescue) { commitPlacement(ctx, state.rescue.lo, ev); return; }

    // Handicap: extra slips raise the rescue threshold (more misses before the
    // answer is revealed).
    const rescueAfter = RESCUE_AFTER + ((state.handicap && state.handicap.extraSlips) || 0);
    if (state.wrongOnCurrent >= rescueAfter) {
      // Third miss: stop testing and reveal. A soft "that was wrong" cue only —
      // no shake or juice, so the reveal reads as help, not rebuke.
      playSfx("wrong");
      const g = globeFor(ctx);
      if (g) g.markCurrent("bad");
      triggerRescue(ctx, lo, hi, ev);
      return;
    }

    // Strike 2 names the direction; strike 1 stays unaided and wordless — the
    // shake, gap flash and buzz already say "miss" (hints on demand; no
    // redundant text).
    if (state.wrongOnCurrent === rescueAfter - 1) {
      flashFeedback(
        index < lo ? "Too early — it comes later." : "Too late — it comes earlier.",
        false,
        root
      );
    }
    playSfx("wrong");
    juiceWrong();
    // Dock globe ring follows the good/bad scheme (this player's globe).
    const g = globeFor(ctx);
    if (g) g.markCurrent("bad");
    // Screen shake: same-frame punctuation alongside beep + gap flash.
    // Short/decaying/positional (4px, 200ms) — FX handles reduced motion.
    if (window.FX) FX.shake(screens.game, 4, 200);
    // Flash the clicked gap instead of rebuilding the timeline.
    const gapNode = root.querySelector(`.gap[data-index="${index}"]`);
    if (gapNode) {
      gapNode.classList.remove("gap--wrong");
      void gapNode.offsetWidth;
      gapNode.classList.add("gap--wrong");
      gapNode.addEventListener("animationend",
        () => gapNode.classList.remove("gap--wrong"), { once: true });
    }
  }

  // ---- rescue: reveal the answer after repeated misses --------------------
  // Scrolls to the correct gap, makes it the single obvious target, and anchors
  // an explanation beside it (co-located, never a detached toast). The player
  // still performs the placement; the callout persists until they do.
  function rescueOrderingText(state, lo, hi, ev) {
    const evs = state.timeline.map((id) => eventById(ui.deck, id));
    const before = lo > 0 ? evs[lo - 1] : null;
    const after = hi < evs.length ? evs[hi] : null;
    const plain = (e) => `${e.title} (${fmtYears(e)})`;
    const rich = (e) => `<b>${escapeHtml(e.title)}</b> (${escapeHtml(fmtYears(e))})`;
    let text, html;
    if (before && after) {
      text = `It goes between ${plain(before)} and ${plain(after)}.`;
      html = `It goes between ${rich(before)} and ${rich(after)}.`;
    } else if (after) {
      text = `It goes before ${plain(after)}.`;
      html = `It goes before ${rich(after)}.`;
    } else if (before) {
      text = `It goes after ${plain(before)}.`;
      html = `It goes after ${rich(before)}.`;
    } else {
      text = html = "It goes at the start of the timeline.";
    }
    if (lo < hi) {
      const same = " It shares its year with a neighbour — either side works.";
      text += same;
      html += same;
    }
    return { text, html };
  }

  function buildRescueCallout(state, lo, hi, ev) {
    const order = rescueOrderingText(state, lo, hi, ev);
    // The connection cue, from the SAME frozen selector as the reveal line, so
    // the two slip surfaces can never disagree (FR4).
    const cue = freezeCue(state, ev);
    const conn = cue && window.Connections ? window.Connections.cueText(cue) : "";
    // Prefer the authored significance line; `fact` is the fallback so the
    // moment is never empty even on decks without structured fields (§9).
    const why = ev.why || ev.fact || "";
    const li = document.createElement("li");
    li.className = "gap-callout";
    li.innerHTML =
      `<span class="gap-callout__arrow" aria-hidden="true"></span>` +
      `<p class="gap-callout__order">${order.html}</p>` +
      (conn ? `<p class="gap-callout__link">${escapeHtml(conn)}</p>` : "") +
      (why ? `<p class="gap-callout__why">${escapeHtml(why)}</p>` : "");
    li.dataset.announce = order.text + (conn ? " " + conn : "") + (why ? " " + why : "");
    return li;
  }

  function scrollToRescueGap(target) {
    // Reserve the sticky game header so the target never lands beneath it.
    // Measured here (not hardcoded) because the header height is responsive.
    const header = document.querySelector(".game-header");
    const h = header ? Math.round(header.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--game-header-h", h + "px");
    const rect = target.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top >= h && rect.bottom <= vh) return; // already visible — don't jump
    target.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: prefersReduced() ? "instant" : "smooth",
    });
  }

  function triggerRescue(ctx, lo, hi, ev) {
    const state = ctx.state;
    const root = ctx.root;
    if (state.status !== "playing" || state.rescue) return;
    state.rescue = { lo, hi, id: ev.id };

    const tl = root.querySelector(".timeline");
    if (!tl) return;
    const gapNodes = Array.from(tl.querySelectorAll(".gap"));

    // One unambiguous target: emphasise the correct gap(s), make every other
    // gap inert. Cues are redundant (solid border + label + ring), never colour
    // alone, and the larger target helps touch users.
    gapNodes.forEach((g) => {
      const i = Number(g.dataset.index);
      if (i >= lo && i <= hi) {
        g.classList.add("gap--rescue");
        g.textContent = "IT GOES HERE";
        g.setAttribute("aria-label", "Correct spot — place here");
      } else {
        g.classList.add("gap--locked");
        g.setAttribute("aria-disabled", "true");
        g.setAttribute("tabindex", "-1");
      }
    });

    // Anchor the explanation just below the correct range (next to, never on
    // top of, the target).
    const anchorGap = tl.querySelector(`.gap[data-index="${hi}"]`) || gapNodes[0];
    const callout = buildRescueCallout(state, lo, hi, ev);
    if (anchorGap) anchorGap.insertAdjacentElement("afterend", callout);

    // Announce once through the persistent polite live region.
    const live = root.querySelector(".rescue-status");
    if (live) live.textContent = callout.dataset.announce;

    const target = tl.querySelector(`.gap[data-index="${lo}"]`);
    if (!target) return;
    scrollToRescueGap(target);
    // Programmatic reveal must move focus to the revealed content (WCAG).
    // preventScroll keeps focus from fighting the (possibly smooth) scroll.
    try { target.focus({ preventScroll: true }); } catch (_) {}
  }

  let feedbackTimer = null;
  // Transient placement feedback in the fixed HUD line (never scrolls out of
  // view). Fade in fast, fade out slowly; the empty string is a no-op so a
  // wordless miss leaves no stale text. `root` scopes the feedback element to
  // a player's pane in split-screen; defaults to the shared #feedback line.
  function flashFeedback(msg, good, root) {
    const f = root ? root.querySelector(".feedback") : $("feedback");
    if (!f || !msg) return;
    f.textContent = msg;
    f.className = "feedback " + (good ? "good" : "bad") + " feedback--on";
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      f.classList.remove("feedback--on");
      feedbackTimer = setTimeout(() => { f.textContent = ""; f.className = "feedback"; }, 500);
    }, 2000);
  }

  // ---- juice (tiered feedback profiles) ---------------------------
  // Research (Kao et al. 2024, n=1699): juice OUTCOMES, not every action —
  // success-dependent amplification drives competence; undifferentiated juice
  // backfires. Tiers: medium (correct) vs heavy (3+ streak). Wrong answers
  // get only the red vignette (errors loud but short, never over-juiced).
  function cssVar(name) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || null; } catch (_) { return null; }
  }
  function juicePlace(el, value, streak) {
    if (!window.FX) return;
    const heavy = streak >= 3;
    FX.burst(el, { count: heavy ? 16 : 9 });
    FX.floatText(el, `+${value}`, { color: cssVar("--good") || "#4ade80" });
    FX.vignette("rgba(74, 222, 128, 0.30)");
    // Pop AFTER the expand-in layout animation (300ms) so the two transform
    // animations don't fight for the same property.
    setTimeout(() => FX.pop(el, heavy ? 1.2 : 1.15), 300);
  }
  function juiceWrong() {
    if (!window.FX) return;
    FX.vignette("rgba(248, 81, 73, 0.35)");
  }

  // ---- finish ----------------------------------------------------
  // Write the finished run to the player's OWN profile (state.userId — in
  // split-screen each player's outcomes go to their own mastery log): per-event
  // aggregates (placements / slips / first-try) power the Focus panel and
  // stats; the run log powers Recent runs.
  function recordRun(state) {
    const u = state.userId ? { id: state.userId } : activeUser();
    if (!u || !ui.deck || !state) return;
    const p = readUser(u.id);
    const d = p.decks[ui.deck.id] || (p.decks[ui.deck.id] = {
      totals: { runs: 0, totalScore: 0, totalMax: 0, perfectRuns: 0, totalPlacements: 0, totalSlips: 0 },
      runs: [], events: {},
    });
    const now = Date.now();
    // Raw, append-only review outcomes — one row per practiced (non-anchor)
    // card (GAMIFICATION_BRIEF §6). Streak/level/achievements derive from this.
    const reviewRows = [];
    state.timeline.forEach((id) => {
      if (state.anchorIds.has(id)) return; // anchors are given, not practiced
      const slips = state.cardSlips[id] || 0;
      const e = d.events[id] || (d.events[id] = { placements: 0, slips: 0, firstTry: 0 });
      e.placements += 1;
      e.slips += slips;
      if (slips === 0) e.firstTry += 1;
      const reviewRow = { ts: now, deck: ui.deck.id, eventId: id,
                          outcome: slips === 0 ? "firstTry" : "slip",
                          mode: state.mode };
      reviewRows.push(reviewRow);
    });
    appendReviewLog(p, reviewRows);
    const wrongs = state.outcomes.filter((o) => o === "wrong").length;
    d.runs.unshift({
      date: now,
      deck: ui.deck.name,
      filters: summarizeSelections(ui.deck, ui.selections),
      placements: state.placements,
      score: state.score,
      max: maxScore(state),
      perfect: wrongs === 0,
      wrongs,
    });
    if (d.runs.length > 50) d.runs.length = 50;
    d.totals.runs += 1;
    d.totals.totalScore += state.score;
    d.totals.totalMax += maxScore(state);
    if (wrongs === 0) d.totals.perfectRuns += 1;
    d.totals.totalPlacements += state.placements;
    d.totals.totalSlips += wrongs;
    writeUser(u.id, p);
  }

  function finishGame(ctx, won) {
    const state = ctx.state;
    state.status = won ? "complete" : "lost";
    playSfx(won ? "win" : "wrong");
    recordRun(state);
    // Split-screen: when both players have finished, show the head-to-head.
    if (splitCtx && splitCtx.length === 2) {
      const other = splitCtx[0] === ctx ? splitCtx[1] : splitCtx[0];
      if (other.state.status === "complete" || other.state.status === "lost") {
        showSplitResults();
      }
      return;
    }
    showResults(ctx, won);
  }

  // Head-to-head results: higher score wins (same puzzle => same max, so raw
  // score comparison is fair); ties broken by fewer slips, then by time.
  function showSplitResults() {
    const [c1, c2] = splitCtx;
    const [s1, s2] = [c1.state, c2.state];
    const w1 = s1.outcomes.filter((o) => o === "wrong").length;
    const w2 = s2.outcomes.filter((o) => o === "wrong").length;
    let winner = null;
    if (s1.score !== s2.score) winner = s1.score > s2.score ? 0 : 1;
    else if (w1 !== w2) winner = w1 < w2 ? 0 : 1;
    const n1 = $("pane-1-name").textContent;
    const n2 = $("pane-2-name").textContent;
    $("result-tag").textContent = "VERSUS";
    $("result-title").textContent = winner === null
      ? "It's a tie!"
      : (winner === 0 ? n1 : n2) + " wins!";
    $("result-blurb").textContent =
      `${n1}: ${s1.score} pts (${w1} slip${w1 === 1 ? "" : "s"}) · ` +
      `${n2}: ${s2.score} pts (${w2} slip${w2 === 1 ? "" : "s"})`;
    $("result-score-num").textContent = s1.score + " – " + s2.score;
    $("result-score-max").textContent = maxScore(s1);
    $("result-grid").innerHTML = "";
    $("result-timeline").innerHTML = "";
    $("share-text").classList.add("hidden");
    show("results");
    // Dock globe: one shared recap of BOTH players' runs, centred (leaving
    // the game screen removed the split class, so the dock is full-width).
    const recapItems = (s) => s.timeline.map((id) => {
      const e = eventById(ui.deck, id);
      return { ev: e, kind: placedKindFor(s, e) };
    });
    if (window.GlobeDockP2) window.GlobeDockP2.hide();
    if (window.GlobeDock) window.GlobeDock.showResults(recapItems(s1).concat(recapItems(s2)));
    if (window.FX) setTimeout(() => window.FX.confetti({ tier: "medium" }), 650);
  }

  function showResults(ctx, won) {
    const state = ctx.state;
    // state.outcomes is the full ATTEMPT log ("correct"/"wrong" per try), so the
    // real score is state.score (points) and "perfect" means zero wrong tries.
    const wrongs = state.outcomes.filter((o) => o === "wrong").length;
    const perfect = won && wrongs === 0;
    $("result-tag").textContent = modeLabel();
    $("result-title").textContent = won
      ? (perfect ? "Perfect timeline!" : "Timeline complete!")
      : "History got you this time.";
    $("result-blurb").textContent = won
      ? `${state.placements} placed · ` +
        summarizeSelections(ui.deck, ui.selections) +
        (wrongs ? ` · ${wrongs} slip${wrongs === 1 ? "" : "s"}` : "")
      : // Losses only occur in Endless (Daily bounces back), where the run
        // ends after ENDLESS_LIVES slips.
        `${{ 1: "One", 2: "Two", 3: "Three" }[ENDLESS_LIVES] || ENDLESS_LIVES} slips ended the run — but now you know something new.`;
    // Results score counts up as the curtain reveals (600ms, easeOutExpo).
    if (window.FX) FX.scoreCount($("result-score-num"), state.score);
    else $("result-score-num").textContent = state.score;
    // A previous run's share text must not bleed into these results.
    $("share-text").classList.add("hidden");

    const grid = $("result-grid");
    grid.innerHTML = "";
    state.outcomes.forEach((out) => {
      const cell = document.createElement("span");
      cell.className = "cell " + (out === "correct" ? "good" : "bad");
      grid.appendChild(cell);
    });

    const tl = $("result-timeline");
    tl.innerHTML = "";
    state.timeline.map((id) => eventById(ui.deck, id)).forEach((e) => {
      const li = document.createElement("li");
      // Same state coloring as the game timeline (anchors / clean / slipped).
      li.className = placedClassFor(state, e);
      // Micro-feedback: show the points this card earned (anchors are given).
      const ptsChip = state.anchorIds && state.anchorIds.has(e.id)
        ? ""
        : `<span class="rt-pts">+${Math.max(0, POINTS_PER_CARD - (state.cardSlips[e.id] || 0))}</span>`;
      li.innerHTML =
        (fmtYears(e) ? `<span class="yr">${fmtYears(e)}</span>` : "") +
        `<div class="rt-info"><span class="rt-title">${escapeHtml(e.title)}${ptsChip}</span>` +
         `<span class="rt-fact">${escapeHtml(e.fact || "")}</span>` +
        factSheetHtml(e) +
        learnBtnHtml(e) +
        `</div>`;
      tl.appendChild(li);
    });
    show("results");
    // Celebration confetti fires as the curtain reveal completes (600ms).
    // Graded: perfect run = full cannon, otherwise a modest burst. Never on
    // a loss (research: celebrations must match the achievement).
    if (won && window.FX) {
      setTimeout(() => window.FX.confetti({ tier: perfect ? "heavy" : "medium" }), 650);
    }
    initAllFactMaps(tl);
    // Dock globe becomes the geographic recap of the run — docked and
    // auto-rotating like setup; tapping it expands the full-screen view.
    // Single-player recap lives on the shared globe; hide the split one.
    if (window.GlobeDockP2) window.GlobeDockP2.hide();
    if (window.GlobeDock) {
      window.GlobeDock.showResults(
        state.timeline.map((id) => {
          const e = eventById(ui.deck, id);
          return { ev: e, kind: placedKindFor(state, e) };
        })
      );
    }
  }

  function shareText(state) {
    const wrongs = state.outcomes.filter((o) => o === "wrong").length;
    const grid = state.outcomes.map((o) => (o === "correct" ? "🟩" : "🟥")).join("");
    const head = `Timeline Game — ${ui.deck.name}`;
    const filterStr = summarizeSelections(ui.deck, ui.selections);
    const slips = wrongs ? ` · ${wrongs} slip${wrongs === 1 ? "" : "s"}` : "";
    return `${head}\n${grid}\n${state.score}/${maxScore(state)} points${slips}\n${filterStr}`;
  }

  // ---- browse ----------------------------------------------------
  function renderBrowse() {
    const deck = ui.deck || window.DECKS[0];
    const list = $("browse-list");
    list.innerHTML = "";
    const sorted = deck.events.slice().sort((a, b) => sortYearOf(a) - sortYearOf(b) || a.songOrder - b.songOrder);
    sorted.forEach((e) => {
      const li = document.createElement("li");
      const tags = [];
      if (e.week) tags.push(`W${e.week}`);
      if (e.continent) tags.push(e.continent);
      li.innerHTML = (fmtYears(e) ? `<span class="yr">${fmtYears(e)}</span>` : "") +
        `<div class="rt-info"><span>${escapeHtml(e.title)}</span>` +
         `<span class="rt-fact">${escapeHtml(e.fact || "")}</span>` +
        factSheetHtml(e, false) +
        learnBtnHtml(e) +
        `</div>` +
        `<span class="cat">${tags.join(" · ")}</span>`;
      list.appendChild(li);
    });
    $("browse-count").textContent = `${deck.events.length} events in ${deck.name}`;
    show("browse");
    renderBrowseTimeline();
    renderGroupedTimeline();
  }

  // Library timeline: the whole deck, colored by the active player's progress.
  function renderBrowseTimeline() {
    browseTimeline = destroyTimeline(browseTimeline);
    const host = $("browse-tl");
    const toggle = $("browse-tl-toggle");
    const note = $("browse-tl-note");
    if (!host || !ui.deck) return;
    const u = activeUser();
    const prog = u ? (readUser(u.id).decks[ui.deck.id] || { events: {} }).events : {};
    tlToggleChips(toggle, browseTlMode, () => {
      browseTlMode = browseTlMode === "all" ? "practiced" : "all";
      renderBrowseTimeline();
    });
    const built = buildTlItems({ events: ui.deck.events, progress: (id) => prog[id] || null }, browseTlMode);
    if (note) {
      note.textContent = built.undated
        ? `${built.undated} undated (Prehistory) event${built.undated === 1 ? "" : "s"} not shown.`
        : "";
    }
    try {
      const tlOpts = visTimelineOpts();
      clampTimelineRange(tlOpts, built.items);
      browseTimeline = new vis.Timeline(host, new vis.DataSet(built.items), tlOpts);
      attachTlHover(browseTimeline, (id) => ui.deck.events.find((e) => e.id === id) || null, host);
      fitTimeline(browseTimeline, host);
      setupTimelinePan(browseTimeline, host);
      requestAnimationFrame(() => { try { browseTimeline.redraw(); } catch (_) {} });
    } catch (e) { console.error("browse timeline failed", e); }
  }

  // Grouped timeline preview (library, below the flat one). Uses vis-timeline
  // groups per the documented API: new vis.Timeline(container, items, groups, options)
  // — items FIRST, groups SECOND. Decks without groupStrategies hide the panel.
  function renderGroupedTimeline() {
    groupedTimeline = destroyTimeline(groupedTimeline);
    const host = $("browse-tl-grouped");
    const chipsHost = $("browse-grouped-chips");
    const note = $("browse-tl-grouped-note");
    if (!host || !ui.deck) return;
    const deck = ui.deck;
    const panel = host.closest(".grouped-tl-panel");
    if (!deck.groupStrategies || !deck.groupStrategies.length) {
      if (panel) panel.hidden = true;
      return;
    }
    if (panel) panel.hidden = false;
    const u = activeUser();
    const prog = u ? (readUser(u.id).decks[deck.id] || { events: {} }).events : {};
    if (chipsHost) {
      chipsHost.innerHTML = "";
      deck.groupStrategies.forEach((gs) => {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "tl-group-chip" + (groupedStrategyId === gs.id ? " sel" : "");
        c.textContent = gs.label;
        c.addEventListener("click", () => { groupedStrategyId = gs.id; renderGroupedTimeline(); });
        chipsHost.appendChild(c);
      });
    }
    const strategy = deck.groupStrategies.find((gs) => gs.id === groupedStrategyId) || deck.groupStrategies[0];
    const built = buildTlItems({ events: deck.events, progress: (id) => prog[id] || null }, "all", strategy);
    const allItems = [...built.items];
    const groups = built.groups ? built.groups.map((g) => ({ ...g })) : [];
    // Era bands: groupless full-height backgrounds (CC only, grouped modes only)
    if (deck.id === "cc-timeline" && strategy.id !== "flat") {
      allItems.unshift(...buildAgesBands());
    }
    if (note) {
      note.textContent = built.undated
        ? `${built.undated} undated (Prehistory) event${built.undated === 1 ? "" : "s"} not shown.`
        : "";
    }
    try {
      const tlOpts = visTimelineOpts();
      tlOpts.align = "center"; // ranges: center content instead of clamping to the edge
      clampTimelineRange(tlOpts, allItems);
      const itemsDs = new vis.DataSet(allItems);
      if (groups.length) {
        tlOpts.groupOrder = "order";
        tlOpts.maxHeight = 720; // 6 rows need more room than the flat 500 cap
        const groupsDs = new vis.DataSet(groups);
        groupedTimeline = new vis.Timeline(host, itemsDs, groupsDs, tlOpts);
      } else {
        groupedTimeline = new vis.Timeline(host, itemsDs, tlOpts);
      }
      attachTlHover(groupedTimeline, (id) => deck.events.find((e) => e.id === id) || null, host);
      fitTimeline(groupedTimeline, host);
      setupTimelinePan(groupedTimeline, host);
      // Group-mode vis leaves out-of-window item DOM unpositioned (no transform)
      // at the itemset origin, and items anchored just off-screen left poke
      // their wide labels into the panel where they overlap into garble.
      // Sweep: hide top-level event items that are unpositioned OR anchored
      // left of the panel; re-show them when vis positions them on-screen.
      // Items vis hid itself (inline display:none) are never touched.
      const sweepUnpositioned = () => {
        try {
          host.querySelectorAll(".vis-item").forEach((el) => {
            if (el.classList.contains("vis-background")) return;
            const par = el.parentElement;
            if (!par || (!par.classList.contains("vis-group") && !par.classList.contains("vis-itemset"))) return; // skip nested dots
            const m = (el.getAttribute("style") || "").match(/translate\((-?[\d.]+)px/);
            const anchorX = m ? parseFloat(m[1]) : null;
            // Ranges render as bars that may legitimately start off-screen and
            // extend into view (vis clips them) — only points follow the
            // anchor rule. Unpositioned items of any type are hidden.
            const shouldHide = anchorX === null ? true : (!el.classList.contains("vis-range") && anchorX < -1);
            if (shouldHide && !el.dataset.tlSwept) {
              if (getComputedStyle(el).display !== "none") {
                el.dataset.tlSwept = "1";
                el.style.display = "none";
              }
            } else if (!shouldHide && el.dataset.tlSwept) {
              delete el.dataset.tlSwept;
              el.style.display = "";
            }
          });
        } catch (_) {}
      };
      groupedTimeline.on("rangechanged", sweepUnpositioned);
      groupedTimeline.on("changed", () => requestAnimationFrame(sweepUnpositioned));
      requestAnimationFrame(sweepUnpositioned);
      requestAnimationFrame(() => { try { groupedTimeline.redraw(); } catch (_) {} });
    } catch (e) { console.error("grouped timeline failed", e); }
  }

  // ---- SETTINGS --------------------------------------------------
  function renderSettings() {
    const toggle = $("map-mode-toggle");
    if (!toggle) return;
    toggle.querySelectorAll(".mode-btn").forEach((b) => {
      b.classList.toggle("sel", b.dataset.mode === mapMode);
    });
  }

  // ---- Tahoe glass: refraction on controls + mouse-tracked sheen ----
  // True lens refraction (vendored liquid-glass, MIT) upgrades controls on
  // Chromium; Safari/Firefox keep the CSS frosted layer automatically.
  function initGlassOnScreen() {
    if (!window.LiquidGlass || !window.LiquidGlass.isChromium) return;
    // Synchronous on purpose: createLiquidGlass is fully synchronous (canvas
    // maps are cached), so glass lands before first paint at load and before
    // the curtain reveals on transitions. The previous rAF deferral showed a
    // 1-frame flash of plain controls.
    document.querySelectorAll(".icon-btn, .btn, .mode-btn, .prompt-card, .modal-card").forEach((el) => {
      if (el.dataset.glassed || el.closest(".hidden") || !el.offsetWidth) return;
      el.dataset.glassed = "1";
      const radius = el.classList.contains("prompt-card") ? 18
        : el.classList.contains("modal-card") ? 24
        : Math.max(6, Math.round(el.getBoundingClientRect().height / 2));
      try {
        window.LiquidGlass.createLiquidGlass(el, {
          borderRadius: radius,
          scale: el.classList.contains("prompt-card") || el.classList.contains("modal-card") ? -36 : -60,
          aberration: [0, 6, 12],
          frost: 0, // keep the CSS glass tint — the script would otherwise overwrite it
          blur: 9,
          fallbackFilter: "blur(14px) saturate(160%)",
        });
      } catch (e) { console.error("glass init failed", el.className, e); }
    });
  }

  let lightRaf = 0;
  function initMouseLight() {
    document.addEventListener("pointermove", (e) => {
      const el = e.target && e.target.closest
        ? e.target.closest(".card, .deck-card, .tl-event, .result-timeline li, .settings-group, .filter-group, .appbar")
        : null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      cancelAnimationFrame(lightRaf);
      lightRaf = requestAnimationFrame(() => {
        el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
        el.style.setProperty("--my", `${e.clientY - rect.top}px`);
      });
    }, { passive: true });
  }

  // ---- wire up ---------------------------------------------------
  function init() {
    // Forward-only timezone sync so the derived streak groups by the current
    // device zone (GAMIFICATION_BRIEF §6).
    syncTimezone();
    // Keyboard navigation for the timeline gaps (roving tabindex + arrows).
    // Pane-scoped: each pane's listener only acts when focus is inside it, so
    // split players never steal each other's keys.
    initGapRoving($("pane-1"));
    initGapRoving($("pane-2"));
    // Split-screen keyboard: document-level keyMap so BOTH players' keys work
    // simultaneously, independent of DOM focus (each player's cursor is
    // tracked per-pane). Guards: split active, game screen visible, no modal,
    // and focus not on a UI control (buttons keep Enter/Space for themselves).
    document.addEventListener("keydown", (e) => {
      if (!splitCtx || !splitCtx.length) return;
      if (screens.game.classList.contains("hidden")) return;
      if (document.querySelector(".modal:not(.hidden)")) return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === "BUTTON" || ae.tagName === "A" || ae.tagName === "INPUT" ||
                 ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable)) return;
      switch (e.code) {
        // P1: W/S step, E/D jump (start/end), A place.
        case "KeyW": splitMove(0, -1); e.preventDefault(); break;
        case "KeyS": splitMove(0, 1); e.preventDefault(); break;
        case "KeyE": splitJump(0, false); e.preventDefault(); break;
        case "KeyD": splitJump(0, true); e.preventDefault(); break;
        case "KeyA": splitPlace(0); e.preventDefault(); break;
        // P2: ←/→ step, ↑/↓ jump (start/end), Enter place.
        case "ArrowLeft": splitMove(1, -1); e.preventDefault(); break;
        case "ArrowRight": splitMove(1, 1); e.preventDefault(); break;
        case "ArrowUp": splitJump(1, false); e.preventDefault(); break;
        case "ArrowDown": splitJump(1, true); e.preventDefault(); break;
        case "Enter": splitPlace(1); e.preventDefault(); break;
      }
    });
    // setup screen
    $("setup-back").addEventListener("click", () => renderHub());
    $("setup-start").addEventListener("click", () => {
      const versus = $("setup-versus") && $("setup-versus").checked;
      if (versus) {
        const users = readUsers();
        const list = (users && users.users) || [];
        const p1 = (activeUser() || {}).id || (list[0] && list[0].id) || null;
        const p2 = (list.find((u) => u.id !== p1) || list[0] || {}).id || null;
        const h1 = readHandicap("timeline", "p1");
        const h2 = readHandicap("timeline", "p2");
        startSplit(ui.deck, p1, p2, h1, h2);
      } else {
        startGame();
      }
    });
    $("setup-browse").addEventListener("click", () => renderBrowse());
    // game
    $("back-btn").addEventListener("click", () => openDeck(ui.deck));
    $("how-btn").addEventListener("click", () => {
      openModal($("how-modal"));
      initGlassOnScreen();
    });
    $("how-x").addEventListener("click", () => closeModal($("how-modal")));
    $("how-gotit").addEventListener("click", () => closeModal($("how-modal")));
    // story takeover (native <dialog>)
    $("story-back").addEventListener("click", closeStory);
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest && ev.target.closest(".fs-learn");
      if (!btn) return;
      ev.preventDefault();
      openStory(findEventById(btn.dataset.story), btn);
    });
    // results
    $("home-btn").addEventListener("click", () => renderHub());
    $("again-btn").addEventListener("click", () => startGame());
    $("share-btn").addEventListener("click", () => {
      const txt = shareText(game);
      const pre = $("share-text");
      pre.textContent = txt;
      pre.classList.toggle("hidden");
      if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
    });
    // browse
    $("browse-back").addEventListener("click", () => openDeck(ui.deck));
    // sound
    function syncAudioControls() {
      const sfxBtn = $("sfx-btn");
      if (sfxBtn) {
        sfxBtn.textContent = getSound() ? "🔊 On" : "🔇 Off";
        sfxBtn.setAttribute("aria-pressed", String(getSound()));
      }
      syncMusicControls();
      if (window.Narrator) window.Narrator.syncControls();
    }
    // SFX lives in the Settings modal now
    const sfxBtn = $("sfx-btn");
    if (sfxBtn) {
      sfxBtn.addEventListener("click", () => {
        setSound(!getSound());
        syncAudioControls();
        if (getSound()) playSfx("correct");
      });
    }

    // interface effects toggle (curtain / shake / score count-up)
    const fxBtn = $("fx-btn");
    function syncFxControls() {
      if (!fxBtn || !window.FX) return;
      fxBtn.textContent = FX.enabled ? "✨ On" : "✨ Off";
      fxBtn.setAttribute("aria-pressed", String(FX.enabled));
    }
    if (fxBtn) {
      fxBtn.addEventListener("click", () => {
        if (!window.FX) return;
        FX.setEnabled(!FX.enabled);
        syncFxControls();
      });
      syncFxControls();
    }

    // custom cursor set (Settings → Visual). The CSS applies the ornate set
    // by default; this toggle swaps every cursor back to its native keyword.
    const CURSOR_KEY = "timeline.cursor";
    function cursorsOff() {
      try { return localStorage.getItem(CURSOR_KEY) === "off"; } catch (_) { return false; }
    }
    function applyCursorPref() {
      document.documentElement.classList.toggle("cursors-off", cursorsOff());
    }
    const cursorBtn = $("cursor-btn");
    function syncCursorControls() {
      if (!cursorBtn) return;
      const on = !cursorsOff();
      cursorBtn.textContent = on ? "🖱️ On" : "🖱️ Off";
      cursorBtn.setAttribute("aria-pressed", String(on));
    }
    if (cursorBtn) {
      cursorBtn.addEventListener("click", () => {
        try { localStorage.setItem(CURSOR_KEY, cursorsOff() ? "on" : "off"); } catch (_) {}
        applyCursorPref();
        syncCursorControls();
      });
    }
    applyCursorPref();
    syncCursorControls();

    // background music: play/pause + volume next to the SFX control
    document.querySelectorAll(".music-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const shouldPlay = !getMusicOn(); // paused -> user wants play; playing -> pause
        setMusicOn(shouldPlay);
        syncGameMusic();
      })
    );
    document.querySelectorAll(".music-vol").forEach((s) => {
      s.value = String(Math.round(getMusicVol() * 100));
      s.addEventListener("input", () => {
        const v = Math.min(1, Math.max(0, s.value / 100));
        setMusicVol(v);
        if (bgMusic) bgMusic.volume = v;
      });
    });
    // Game-music volume is a separate slider from the main music volume so the
    // player can keep it low enough to hear narration.
    document.querySelectorAll(".game-music-vol").forEach((s) => {
      s.value = String(Math.round(getGameMusicVol() * 100));
      s.addEventListener("input", () => {
        const v = Math.min(1, Math.max(0, s.value / 100));
        setGameMusicVol(v);
        // Cancel any in-flight fade so a user drag isn't overridden by a stale
        // crossfade target, then apply immediately.
        if (musicFadeRaf) { cancelAnimationFrame(musicFadeRaf); musicFadeRaf = null; }
        if (gameMusic) gameMusic.volume = v;
      });
    });
    tryStartMusic();
    // First gesture anywhere starts the music (autoplay policy), except when
    // the gesture is on the music controls themselves — those own the intent.
    const musicKick = (ev) => {
      if (ev.target && ev.target.closest && ev.target.closest(".music-btn, .music-vol")) return;
      if (getMusicOn()) syncGameMusic();
      document.removeEventListener("pointerdown", musicKick);
      document.removeEventListener("keydown", musicKick);
    };
    document.addEventListener("pointerdown", musicKick);
    document.addEventListener("keydown", musicKick);

    // UI click sounds: delegated so every button gets tactile feedback, except
    // the SFX test button (plays its own sound) and music controls (own intent).
    document.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!t || !t.closest) return;
      const btn = t.closest("button");
      if (!btn) return;
      if (btn.closest(".sfx-btn, .music-btn")) return;
      playSfx("click");
    });
    preloadSfx();

    // settings modal (reachable from any screen via the gear)
    document.querySelectorAll(".gear-btn").forEach((b) =>
      b.addEventListener("click", () => {
        renderSettings();
        syncAudioControls();
        openModal($("settings-modal"));
        initGlassOnScreen();
      })
    );
    $("settings-x").addEventListener("click", () => closeModal($("settings-modal")));
    $("settings-done").addEventListener("click", () => closeModal($("settings-modal")));
    $("settings-modal").addEventListener("click", (e) => {
      if (e.target === $("settings-modal")) closeModal($("settings-modal")); // backdrop click
    });

    // settings tabs
    function switchSettingsTab(panelId) {
      const tabs = document.querySelectorAll(".settings-tab");
      const panels = document.querySelectorAll(".settings-tab-panel");
      tabs.forEach((tab) => {
        const selected = tab.getAttribute("aria-controls") === panelId;
        tab.setAttribute("aria-selected", String(selected));
        tab.classList.toggle("active", selected);
        tab.setAttribute("tabindex", selected ? "0" : "-1");
      });
      panels.forEach((panel) => {
        const active = panel.id === panelId;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
      });
    }
    document.querySelectorAll(".settings-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        switchSettingsTab(tab.getAttribute("aria-controls"));
      });
    });
    const tablist = document.querySelector(".settings-tablist");
    if (tablist) {
      tablist.addEventListener("keydown", (e) => {
        const tabs = Array.from(tablist.querySelectorAll(".settings-tab"));
        const current = tablist.querySelector(".settings-tab[aria-selected='true']");
        const index = tabs.indexOf(current);
        let newIndex = index;
        if (e.key === "ArrowRight") newIndex = (index + 1) % tabs.length;
        else if (e.key === "ArrowLeft") newIndex = (index - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") newIndex = 0;
        else if (e.key === "End") newIndex = tabs.length - 1;
        else return;
        e.preventDefault();
        const newTab = tabs[newIndex];
        newTab.focus();
        switchSettingsTab(newTab.getAttribute("aria-controls"));
      });
    }

    const decksStatus = $("decks-status");
    $("export-current-btn").addEventListener("click", () => {
      const deckId = (ui && ui.deck && ui.deck.id) || (window.DECKS[0] && window.DECKS[0].id);
      if (!deckId) {
        alert("Pick a deck first.");
        return;
      }
      window.exportDeck(deckId);
    });
    $("export-all-btn").addEventListener("click", () => {
      window.exportAllDecks();
    });
    const importFileInput = $("import-file-input");
    $("import-file-btn").addEventListener("click", () => {
      if (!importFileInput || !importFileInput.files || !importFileInput.files[0]) {
        alert("Choose a JSON file first.");
        return;
      }
      // Hourglass cursor while the JSON is parsed (touch devices: no-op).
      document.body.classList.add("busy");
      window.importDeckFromFile(importFileInput.files[0])
        .then(function () {
          if (decksStatus) decksStatus.textContent = "Import complete.";
          renderHub();
        })
        .catch(function (err) {
          if (decksStatus) decksStatus.textContent = "Import failed: " + err.message;
        })
        .finally(function () {
          document.body.classList.remove("busy");
          if (importFileInput) importFileInput.value = "";
        });
    });

    const mapToggle = $("map-mode-toggle");
    if (mapToggle) {
      mapToggle.querySelectorAll(".mode-btn").forEach((b) =>
        b.addEventListener("click", () => {
          mapMode = b.dataset.mode;
          try { localStorage.setItem(MAP_MODE_KEY, mapMode); } catch (_) {}
          renderSettings();
        })
      );
    }

    // users: picker modal + stats screen
    document.querySelectorAll(".user-btn").forEach((b) =>
      b.addEventListener("click", openUsersModal)
    );
    $("users-x").addEventListener("click", () => closeModal($("users-modal")));
    $("users-modal").addEventListener("click", (e) => {
      if (e.target === $("users-modal")) closeModal($("users-modal"));
    });
    $("user-create").addEventListener("click", () => {
      const inp = $("user-new-name");
      const name = (inp.value || "").trim() || `Player ${ensureUsers().users.length + 1}`;
      const state = ensureUsers();
      const usr = newUser(name);
      state.users.push(usr);
      state.activeId = usr.id;
      writeUsers(state);
      inp.value = "";
      renderUsersModal();
      renderHub();
    });
    $("stats-back").addEventListener("click", () => renderHub());
    $("stats-edit").addEventListener("click", () => {
      const state = ensureUsers();
      const u = state.users.find((x) => x.id === statsUserId);
      if (!u) return;
      const n = prompt("Rename player", u.name);
      if (n && n.trim()) {
        u.name = n.trim().slice(0, 24);
        u.hue = nameHue(u.name);
        writeUsers(state);
        renderStats();
        renderHub();
      }
    });
    $("stats-print").addEventListener("click", () => window.print());
    // Age band (A3) — optional, "Not set" by default (§5/§15.2). Clearing it
    // removes the field so the profile falls back to the highest band.
    const statsBand = $("stats-band");
    if (statsBand) {
      statsBand.addEventListener("change", () => {
        const state = ensureUsers();
        const u = state.users.find((x) => x.id === statsUserId);
        if (!u) return;
        if (statsBand.value) u.ageBand = statsBand.value;
        else delete u.ageBand;
        writeUsers(state);
        renderStats();
      });
    }
    $("stats-delete").addEventListener("click", () => {
      const state = ensureUsers();
      const u = state.users.find((x) => x.id === statsUserId);
      if (!u) return;
      const answer = prompt(
        `This permanently deletes ${u.name} and all their progress.\nType the player's name to confirm:`
      );
      if (answer == null) return; // cancelled
      if (answer.trim() !== u.name) {
        alert("The name doesn't match — nothing was deleted.");
        return;
      }
      try { localStorage.removeItem(userKey(u.id)); } catch (_) {}
      state.users = state.users.filter((x) => x.id !== u.id);
      if (!state.users.length) state.users.push(newUser("Player 1"));
      if (state.activeId === u.id || !state.users.some((x) => x.id === state.activeId)) {
        state.activeId = state.users[0].id;
      }
      writeUsers(state);
      statsUserId = null;
      statsDeckId = null;
      renderHub();
    });

    renderHub();
    initMouseLight();
    initGlassOnScreen();
  }

  // ---- deck sources -------------------------------------------------
  // Bundled decks are listed in decks/index.json / index.js, both GENERATED by
  // scripts/gen-deck-index.mjs and never hand-edited. The .js form (a classic
  // script exposing window.DECK_INDEX) is what the browser reads, because it
  // needs no fetch(); the .json is for the Node tooling. Each entry is either a
  // folder package (its JSON entry is fetched) or a legacy flat script. Sources
  // are isolated — one failure never blocks the rest — and there is no stale
  // hardcoded fallback list.
  function registerBundledDeckSource() {
    const bust = (entry) => (entry.revision ? "?v=" + entry.revision : "");

    const loadFlatDeck = (entry) =>
      new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "decks/" + entry.file + bust(entry);
        script.onload = resolve;
        script.onerror = () => {
          console.warn("deck script failed to load: " + entry.file);
          resolve();
        };
        document.head.appendChild(script);
      });

    const fetchJson = (url) =>
      fetch(url, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(url + " HTTP " + r.status);
        return r.json();
      });

    // Folder decks load via their GENERATED classic-script mirror, so they work
    // under file:// where fetch() is blocked (origin "null") — the same reason
    // the index has a .js form. The mirror self-registers and already carries
    // the package metadata. If no mirror exists, fall back to fetching the JSON.
    const loadFolderDeck = (entry) => {
      const dir = entry.dir;
      const jsonFile = entry.entry || "deck.json";
      const scriptName = entry.script || jsonFile.replace(/\.json$/, ".js");
      return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "decks/" + dir + "/" + scriptName + bust(entry);
        script.onload = resolve;
        script.onerror = () =>
          fetchJson("decks/" + dir + "/" + jsonFile + bust(entry)).then(
            (deck) => {
              if (entry.version != null) deck.version = entry.version;
              if (entry.license != null) deck.license = entry.license;
              if (entry.attribution != null) deck.attribution = entry.attribution;
              resolve(deck);
            },
            () => {
              console.warn("deck failed to load: " + dir);
              resolve(null);
            }
          );
        document.head.appendChild(script);
      });
    };

    // Prefer the script-loadable index (no fetch needed); fall back to fetch()
    // only when the script is missing — e.g. an older checkout.
    const loadIndex = () => {
      if (window.DECK_INDEX) return Promise.resolve(window.DECK_INDEX);
      return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "decks/index.js";
        script.onload = () => resolve(window.DECK_INDEX || null);
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
      }).then((index) => index || fetchJson("decks/index.json"));
    };

    window.registerDeckSource({
      id: "bundled",
      priority: 0,
      timeoutMs: 8000,
      load: () =>
        loadIndex().then((index) => {
          const list = Array.isArray(index) ? index : (index && index.decks) || [];
          const entries = list
            .map((d) => (typeof d === "string" ? { layout: "file", file: d } : d))
            .filter((d) => d && (d.layout === "folder" ? d.dir : d.file));
          // Both layouts self-register via window.registerDeck while their
          // script loads, so this source only ensures they all ran.
          const folders = entries.filter((e) => e.layout === "folder");
          const flats = entries.filter((e) => e.layout !== "folder");
          return Promise.all(flats.map(loadFlatDeck))
            .then(() => Promise.all(folders.map(loadFolderDeck)))
            .then(() => []);
        }),
    });
  }

  registerBundledDeckSource();

  window.gatherDeckSources().then((result) => {
    if (result && result.failed && result.failed.length) {
      console.warn(
        "deck source(s) failed: " +
          result.failed
            .map((f) => f.id + " (" + (f.error && f.error.message) + ")")
            .join(", ")
      );
    }
    if (typeof window.loadImportedDecks === "function") {
      window.loadImportedDecks();
    }
    if (!window.DECKS.length) {
      console.warn("No decks loaded — check decks/index.json.");
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  });
})();
