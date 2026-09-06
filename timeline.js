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
  // MIN_SUBSET removed: placements adapt to the selected scope, so a single
  // week (7 cards) or small continent can be played. The "Play count" selector
  // sets how many events YOU place; total cards = count + 2 pre-placed
  // anchors (>= MIN_PLACEMENTS). "All" places the whole filtered subset.

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

  function maxScore() {
    // Flat scoring: every placed card is worth POINTS_PER_CARD at its best.
    const n = (game && game.placements) || TOTAL_PLACEMENTS;
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
      const icon = btn.querySelector(".user-icon");
      const av = btn.querySelector(".appbar-avatar");
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
  function mostPlayedDeckId(userId) {
    const p = readUser(userId);
    return Object.keys(p.decks)
      .filter((k) => p.decks[k].totals && p.decks[k].totals.runs > 0)
      .sort((a, b) => p.decks[b].totals.runs - p.decks[a].totals.runs)[0] || null;
  }
  const SOUND_KEY = "timeline.sound.v1";
  const MUSIC_ON_KEY = "timeline.music.on.v1";
  const MUSIC_VOL_KEY = "timeline.music.vol.v1";

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
    return 0.35;
  }
  function setMusicVol(v) { try { localStorage.setItem(MUSIC_VOL_KEY, String(v)); } catch (_) {} }
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
  function syncMusicControls() {
    const playing = !!(bgMusic && !bgMusic.paused);
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

  // ---- sound -----------------------------------------------------
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
  function show(name) {
    Object.values(screens).forEach((s) => s.classList.add("hidden"));
    screens[name].classList.remove("hidden");
    initGlassOnScreen(); // glass newly-visible controls
  }

  // ---- modal open/close with quick fade in/out ----
  function openModal(el) {
    if (!el) return;
    el.classList.remove("hidden", "closing");
  }
  function closeModal(el) {
    if (!el || el.classList.contains("hidden")) return;
    el.classList.add("closing");
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
    card.innerHTML = factSheetHtml(ev);
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
  function currentEvent() {
    if (!game || game.roundIndex >= game.queue.length) return null;
    return eventById(ui.deck, game.queue[game.roundIndex]);
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
    const u = activeUser();
    $("playing-as").innerHTML = `Playing as <b>${escapeHtml(u.name)}</b>`;
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

    // Mastery by week (deck events carry week numbers)
    const weeks = {};
    Object.entries(eventsMap).forEach(([id, s]) => {
      const ev = lookupEvent(id);
      if (!ev || !ev.week) return;
      const w = weeks[ev.week] || (weeks[ev.week] = { placements: 0, firstTry: 0 });
      w.placements += s.placements;
      w.firstTry += s.firstTry;
    });
    const weekRows = Object.entries(weeks)
      .map(([wk, w]) => ({ week: Number(wk), placements: w.placements, mastery: Math.round((w.firstTry / w.placements) * 100) }))
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
        val.textContent = w.placements < 3 ? "not enough data yet" : `Mastery ${w.mastery}%`;
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
    // weakest weeks (>= 3 placements for a trustworthy number)
    const weeks = {};
    Object.entries(d.events).forEach(([id, s]) => {
      const ev = deck.events.find((e) => e.id === id);
      if (!ev || !ev.week) return;
      const w = weeks[ev.week] || (weeks[ev.week] = { placements: 0, firstTry: 0 });
      w.placements += s.placements;
      w.firstTry += s.firstTry;
    });
    const weekRows = Object.entries(weeks)
      .filter(([, w]) => w.placements >= 3)
      .map(([wk, w]) => ({ week: Number(wk), mastery: Math.round((w.firstTry / w.placements) * 100), placements: w.placements }))
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 3);
    const practiced = Object.values(d.events).filter((s) => s.placements > 0).length;
    host.classList.remove("hidden");
    host.innerHTML = "";
    const head = document.createElement("p");
    head.className = "focus-head";
    head.textContent = `🎯 Focus for ${u.name} · ${deck.name}`;
    host.appendChild(head);
    const fr = document.createElement("button");
    fr.className = "focus-card";
    fr.type = "button";
    fr.innerHTML =
      `<span class="focus-title">Focus round</span>` +
      `<span class="focus-sub">Practice your ${Math.min(10, practiced)} toughest events</span>`;
    fr.addEventListener("click", () => startFocusRound());
    host.appendChild(fr);
    weekRows.forEach((w) => {
      const row = document.createElement("button");
      row.className = "focus-card week";
      row.type = "button";
      row.innerHTML =
        `<span class="focus-title">Practice Week ${w.week}</span>` +
        `<span class="focus-sub">Mastery ${w.mastery}% · ${w.placements} placements</span>` +
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
  function renderSetup() {
    const deck = ui.deck;
    const filters = deck.filters || [];
    const container = $("setup-filters");
    container.innerHTML = "";

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
        chip.textContent = opt.label;
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

    game = {
      mode: "free",
      userId: (activeUser() || {}).id || null, // attribution: who STARTED the run
      deckId: deck.id,
      dateKey,
      placements,
      timeline: anchors.map((e) => e.id),
      queue: queue.map((e) => e.id),
      roundIndex: 0,
      lives: Infinity,
      outcomes: [],
      score: 0,
      wrongOnCurrent: 0,
      // Anchor cards by ID (styling must not depend on list position — cards
      // can be inserted before/between the anchors), plus per-card slips so
      // placed cards can show clean vs. needed-retries.
      anchorIds: new Set(anchors.map((e) => e.id)),
      cardSlips: {},
      status: "playing",
      revealedFacts,
    };

    $("mode-tag").textContent =
      modeLabel();
    $("score-max").textContent = maxScore();
    $("result-score-max").textContent = maxScore();
    renderGame();
    show("game");
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

  function startFocusRound() {
    const u = activeUser();
    const deckId = u ? mostPlayedDeckId(u.id) : null;
    if (!deckId) return;
    const deck = window.DECKS.find((x) => x.id === deckId);
    let pool = weakestEvents(deckId, 10);
    if (pool.length < ANCHOR_COUNT + MIN_PLACEMENTS) {
      // Pad with random deck events so a small focus set still forms a puzzle.
      const have = new Set(pool.map((e) => e.id));
      const rest = shuffled(deck.events.filter((e) => !have.has(e.id)), (Math.random() * 1e9) >>> 0);
      pool = pool.concat(rest.slice(0, ANCHOR_COUNT + MIN_PLACEMENTS - pool.length));
    }
    if (pool.length < ANCHOR_COUNT + MIN_PLACEMENTS) return;
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

  function renderGame() {
    const ev = currentEvent();
    const timelineEvents = game.timeline.map((id) => eventById(ui.deck, id));

    if (ev) {
      $("prompt-emoji").textContent = ev.emoji || "❓";
      $("prompt-title").textContent = ev.title;
    } else {
      $("prompt-emoji").textContent = "✅";
      $("prompt-title").textContent = "Timeline complete!";
    }

    $("score-num").textContent = game.score;
    // Single mode: no lives — wrong placements bounce back (slips cost points).
    $("lives").textContent = "";

    const tl = $("timeline");
    tl.innerHTML = "";
    timelineEvents.forEach((e, idx) => {
      tl.appendChild(gapEl(idx));
      tl.appendChild(eventEl(e, idx));
    });
    tl.appendChild(gapEl(timelineEvents.length));
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
  function factSheetHtml(e, includeMap = true) {
    const rows =
      factRow("Who", e.who) +
      factRow("Where", e.where) +
      factRow("Why it matters", e.why);
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
    const body = rows + mapHtml;
    return body ? `<div class="fs-rows">${body}</div>` : "";
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

  function initFactMap(container) {
    if (!window.L || !window.WORLD_LAND || container._map) return;
    try {
      const lat = parseFloat(container.dataset.lat);
      const lng = parseFloat(container.dataset.lng);
      const area = container.dataset.area || "";
      const opts = {
        zoomControl: false, attributionControl: false,
        dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        boxZoom: false, keyboard: false, touchZoom: false,
        minZoom: 1, maxZoom: 6,
      };
      const map = L.map(container, opts);
      container._map = map;
      container.style.background = "#0c1422";
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
        L.circleMarker([lat, lng], {
          radius: 5, color: "#ffb74d", weight: 1.5, fillColor: "#ffd27f", fillOpacity: 1,
          interactive: false,
        }).addTo(map);
        map.setView([lat, lng], 3);
      }
      requestAnimationFrame(() => { try { map.invalidateSize(); } catch (_) {} });
    } catch (e) {
      console.error("fact-map init failed", e);
    }
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
  function placedClassFor(e) {
    if (game.anchorIds && game.anchorIds.has(e.id)) return "anchor";
    const slips = game.cardSlips ? game.cardSlips[e.id] : null;
    return slips === 0 ? "placed-clean" : "placed-slipped slip-" + Math.min(slips || 1, 3);
  }

  function eventEl(e, idx) {
    const li = document.createElement("li");
    li.className = "tl-event " + placedClassFor(e);
    const revealed = game.revealedFacts[e.id];
    const sameYearNeighbor = game.timeline.some(
      (id, i) => id !== e.id && sortYearOf(eventById(ui.deck, id)) === sortYearOf(e)
    );
    const sheet = factSheetHtml(e);
    li.innerHTML =
      `<span class="tl-emoji">${e.emoji || "📌"}</span>` +
      `<div class="tl-info">` +
      `<span class="tl-title">${escapeHtml(e.title)}</span>` +
      (revealed
        ? (fmtYears(e) ? `<span class="tl-year">${fmtYears(e)}</span>` : "") +
          `<span class="tl-fact">${escapeHtml(revealed)}</span>` +
          (sheet
            ? `<button class="fact-toggle" type="button" aria-label="Show fact sheet" aria-expanded="false">❔</button>` +
              `<div class="fact-sheet" role="tooltip">${sheet}</div>`
            : "") +
          (sameYearNeighbor ? `<span class="same-year-note">shares a year with a neighbor</span>` : "")
        : "") +
      `</div>`;
    // Tap/click the ? to toggle the sheet (hover covers mouse users).
    const btn = li.querySelector(".fact-toggle");
    if (btn) {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const open = li.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) ensureFactMap(li); // build the mini-map lazily on first open
      });
    }
    // Mouse users reveal the sheet on hover — init the map then too.
    li.addEventListener("mouseenter", () => ensureFactMap(li));
    return li;
  }

  function gapEl(index) {
    const g = document.createElement("li");
    g.className = "gap";
    g.dataset.index = String(index);
    g.setAttribute("role", "button");
    g.setAttribute("tabindex", "0");
    g.textContent =
      index === 0 ? "＋ BEFORE" :
      index === game.timeline.length ? "＋ AFTER" :
      "＋ PLACE HERE";
    g.addEventListener("click", () => attemptPlace(index));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); attemptPlace(index); }
    });
    return g;
  }

  function attemptPlace(index) {
    if (game.status !== "playing") return;
    const ev = currentEvent();
    if (!ev) return;

    const timelineEvents = game.timeline.map((id) => eventById(ui.deck, id));
    const [lo, hi] = correctIndexRange(ev, timelineEvents);
    const correct = index >= lo && index <= hi;

    if (correct) {
      game.timeline.splice(index, 0, ev.id);
      game.revealedFacts[ev.id] = ev.fact;
      game.outcomes.push("correct");
      // Remember how many slips this card needed (0 = clean first try) so the
      // timeline can differentiate it visually.
      game.cardSlips[ev.id] = game.wrongOnCurrent;
      // Flat scoring: a card is worth POINTS_PER_CARD; each slip on it costs 1
      // (floor 0) so the final score reflects how cleanly the run was played.
      const value = Math.max(0, POINTS_PER_CARD - game.wrongOnCurrent);
      game.score += value;
      game.roundIndex += 1;
      game.wrongOnCurrent = 0;
      flashFeedback(value > 0 ? `✓ +${value}` : "✓ placed +0", true);
      beep("correct");

      if (game.roundIndex >= game.queue.length) finishGame(true);
      else {
        renderGame();
        // Animate only the newly inserted event
        const newGap = document.querySelector(`.gap[data-index="${index}"]`);
        const newEventEl = newGap && newGap.nextElementSibling;
        if (newEventEl && newEventEl.classList.contains("tl-event")) {
          newEventEl.classList.add("tl-event--entering");
          newEventEl.addEventListener("animationend", () => {
            newEventEl.classList.remove("tl-event--entering");
          }, { once: true });
        }
      }
    } else {
      game.outcomes.push("wrong");
      game.wrongOnCurrent += 1;
      // Immediate corrective feedback + retry: wrong placements bounce back and
      // never end the run (research-backed for learning; slips cost points).
      flashFeedback("✗ try again", false);
      beep("wrong");
      // Flash the clicked gap instead of rebuilding the timeline.
      const gapNode = document.querySelector(`.gap[data-index="${index}"]`);
      if (gapNode) {
        gapNode.classList.remove("gap--wrong");
        void gapNode.offsetWidth;
        gapNode.classList.add("gap--wrong");
        gapNode.addEventListener("animationend",
          () => gapNode.classList.remove("gap--wrong"), { once: true });
      }
    }
  }

  let feedbackTimer = null;
  function flashFeedback(msg, good) {
    const f = $("feedback");
    f.textContent = msg;
    f.className = "feedback " + (good ? "good" : "bad");
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { f.textContent = ""; f.className = "feedback"; }, 1600);
  }

  // ---- finish ----------------------------------------------------
  // Write the finished run to the STARTING user's profile: per-event
  // aggregates (placements / slips / first-try) power the Focus panel and
  // stats; the run log powers Recent runs.
  function recordRun() {
    const u = activeUser();
    if (!u || !ui.deck || !game) return;
    const p = readUser(u.id);
    const d = p.decks[ui.deck.id] || (p.decks[ui.deck.id] = {
      totals: { runs: 0, totalScore: 0, totalMax: 0, perfectRuns: 0, totalPlacements: 0, totalSlips: 0 },
      runs: [], events: {},
    });
    game.timeline.forEach((id) => {
      if (game.anchorIds.has(id)) return; // anchors are given, not practiced
      const slips = game.cardSlips[id] || 0;
      const e = d.events[id] || (d.events[id] = { placements: 0, slips: 0, firstTry: 0 });
      e.placements += 1;
      e.slips += slips;
      if (slips === 0) e.firstTry += 1;
    });
    const wrongs = game.outcomes.filter((o) => o === "wrong").length;
    d.runs.unshift({
      date: Date.now(),
      deck: ui.deck.name,
      filters: summarizeSelections(ui.deck, ui.selections),
      placements: game.placements,
      score: game.score,
      max: maxScore(),
      perfect: wrongs === 0,
      wrongs,
    });
    if (d.runs.length > 50) d.runs.length = 50;
    d.totals.runs += 1;
    d.totals.totalScore += game.score;
    d.totals.totalMax += maxScore();
    if (wrongs === 0) d.totals.perfectRuns += 1;
    d.totals.totalPlacements += game.placements;
    d.totals.totalSlips += wrongs;
    writeUser(u.id, p);
  }

  function finishGame(won) {
    game.status = won ? "complete" : "lost";
    beep(won ? "finish" : "wrong");
    recordRun();
    showResults(won);
  }

  function showResults(won) {
    // game.outcomes is the full ATTEMPT log ("correct"/"wrong" per try), so the
    // real score is game.score (points) and "perfect" means zero wrong tries.
    const wrongs = game.outcomes.filter((o) => o === "wrong").length;
    const perfect = won && wrongs === 0;
    $("result-tag").textContent = modeLabel();
    $("result-title").textContent = won
      ? (perfect ? "Perfect timeline!" : "Timeline complete!")
      : "History got you this time.";
    $("result-blurb").textContent = won
      ? `${game.placements} placed · ` +
        summarizeSelections(ui.deck, ui.selections) +
        (wrongs ? ` · ${wrongs} slip${wrongs === 1 ? "" : "s"}` : "")
      : // Losses only occur in Endless (Daily bounces back), where the run
        // ends after ENDLESS_LIVES slips.
        `${{ 1: "One", 2: "Two", 3: "Three" }[ENDLESS_LIVES] || ENDLESS_LIVES} slips ended the run — but now you know something new.`;
    $("result-score-num").textContent = game.score;
    // A previous run's share text must not bleed into these results.
    $("share-text").classList.add("hidden");

    const grid = $("result-grid");
    grid.innerHTML = "";
    game.outcomes.forEach((out) => {
      const cell = document.createElement("span");
      cell.className = "cell " + (out === "correct" ? "good" : "bad");
      grid.appendChild(cell);
    });

    const tl = $("result-timeline");
    tl.innerHTML = "";
    game.timeline.map((id) => eventById(ui.deck, id)).forEach((e) => {
      const li = document.createElement("li");
      // Same state coloring as the game timeline (anchors / clean / slipped).
      li.className = placedClassFor(e);
      // Micro-feedback: show the points this card earned (anchors are given).
      const ptsChip = game.anchorIds && game.anchorIds.has(e.id)
        ? ""
        : `<span class="rt-pts">+${Math.max(0, POINTS_PER_CARD - (game.cardSlips[e.id] || 0))}</span>`;
      li.innerHTML =
        (fmtYears(e) ? `<span class="yr">${fmtYears(e)}</span>` : "") +
        `<div class="rt-info"><span class="rt-title">${escapeHtml(e.title)}${ptsChip}</span>` +
         `<span class="rt-fact">${escapeHtml(e.fact || "")}</span>` +
        factSheetHtml(e) +
        `</div>`;
      tl.appendChild(li);
    });
    initAllFactMaps(tl);

    show("results");
  }

  function shareText() {
    const wrongs = game.outcomes.filter((o) => o === "wrong").length;
    const grid = game.outcomes.map((o) => (o === "correct" ? "🟩" : "🟥")).join("");
    const head = `Timeline Game — ${ui.deck.name}`;
    const filterStr = summarizeSelections(ui.deck, ui.selections);
    const slips = wrongs ? ` · ${wrongs} slip${wrongs === 1 ? "" : "s"}` : "";
    return `${head}\n${grid}\n${game.score}/${maxScore()} points${slips}\n${filterStr}`;
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
    requestAnimationFrame(() => {
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
    // setup screen
    $("setup-back").addEventListener("click", () => renderHub());
    $("setup-start").addEventListener("click", () => startGame());
    $("setup-browse").addEventListener("click", () => renderBrowse());
    // game
    $("back-btn").addEventListener("click", () => openDeck(ui.deck));
    $("how-btn").addEventListener("click", () => {
      openModal($("how-modal"));
      initGlassOnScreen();
    });
    $("how-x").addEventListener("click", () => closeModal($("how-modal")));
    $("how-gotit").addEventListener("click", () => closeModal($("how-modal")));
    // results
    $("home-btn").addEventListener("click", () => renderHub());
    $("again-btn").addEventListener("click", () => startGame());
    $("share-btn").addEventListener("click", () => {
      const txt = shareText();
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
    }
    // SFX lives in the Settings modal now
    const sfxBtn = $("sfx-btn");
    if (sfxBtn) {
      sfxBtn.addEventListener("click", () => {
        setSound(!getSound());
        syncAudioControls();
        if (getSound()) beep("correct");
      });
    }

    // background music: play/pause + volume next to the SFX control
    document.querySelectorAll(".music-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const m = ensureBgMusic();
        const shouldPlay = m.paused; // paused -> user wants play; playing -> pause
        setMusicOn(shouldPlay);
        if (shouldPlay) m.play().catch(() => {}); else m.pause();
        syncMusicControls();
      })
    );
    document.querySelectorAll(".music-vol").forEach((s) => {
      s.value = String(Math.round(getMusicVol() * 100));
      s.addEventListener("input", () => {
        const v = Math.min(1, Math.max(0, s.value / 100));
        setMusicVol(v);
        ensureBgMusic().volume = v;
      });
    });
    tryStartMusic();
    // First gesture anywhere starts the music (autoplay policy), except when
    // the gesture is on the music controls themselves — those own the intent.
    const musicKick = (ev) => {
      if (ev.target && ev.target.closest && ev.target.closest(".music-btn, .music-vol")) return;
      if (getMusicOn()) ensureBgMusic().play().catch(() => {});
      document.removeEventListener("pointerdown", musicKick);
      document.removeEventListener("keydown", musicKick);
    };
    document.addEventListener("pointerdown", musicKick);
    document.addEventListener("keydown", musicKick);

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

  // Auto-load deck files from decks/manifest.json via <script> tags.
  // Falls back to a hardcoded list when fetch fails (e.g. file:// protocol).
  function loadExternalDecks() {
    return new Promise((resolve) => {
      const DECK_FILES = [
        "world-history.js",
        "classical-conversations.js",
        "world-literature.js",
      ];
      const load = (files) => {
        if (!files.length) return resolve();
        let loaded = 0;
        const check = () => { if (++loaded >= files.length) resolve(); };
        for (const file of files) {
          const s = document.createElement("script");
          s.src = "decks/" + file;
          s.onload = check;
          s.onerror = check;
          document.head.appendChild(s);
        }
      };
      fetch("decks/manifest.json")
        .then((r) => (r.ok ? r.json() : DECK_FILES))
        .catch(() => DECK_FILES)
        .then(load);
    });
  }

  loadExternalDecks().then(() => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  });
})();
