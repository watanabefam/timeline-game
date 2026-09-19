/* globe.js — docked 3D globe (globe.gl) for setup / game / results screens.
 *
 * A single shared WebGL globe lives in a body-level dock (#globe-dock)
 * OUTSIDE the screen <section>s, so it survives curtain transitions without
 * context churn. The library bundle (1.9MB) + textures load lazily on first
 * use — players who never reach setup/game/results never pay for them.
 *
 * Modes:
 *   setup   — auto-rotates, shows the filtered subset as points
 *   game    — aligned to the current "Place This Event" card; pulsing ring
 *             whose colour follows the existing good/bad scheme; hovering a
 *             placed card re-aims the globe at that event
 *   results — expanded recap of the finished run (marker colours = outcome)
 *
 * Interaction: tap (no drag) expands the dock to a 90vh globe centred on
 * screen (zoom is disabled — tap-to-expand is the zoom); drag rotates
 * (OrbitControls); hovering a marker surfaces the same fact-sheet tooltip
 * (with Leaflet map) used on timeline items; clicking fires onMarkerClick.
 * Setup starts with Europe at the top of the strip; in game mode the camera
 * aims south of the focused event so its marker sits in the visible strip.
 *
 * Motion: auto-rotate / ring pulse / camera tweens are gated on
 * prefers-reduced-motion (hard floor, read at call time) AND the in-game FX
 * toggle. WebGL failure degrades to a no-op — the game never breaks.
 */
(function () {
  "use strict";

  const DOCK_H = 96;          // visible strip height when docked (px)
  const MAX_S = 680;          // canvas edge when docked (px)
  const ALT_DOCKED = 1.8;     // camera altitude docked — sphere fills ~93% of
                              // the canvas so the strip shows more surface
  const ALT_EXPANDED = 1.8;   // camera altitude expanded (full globe, ~93%)
  const FOV_DEG = 45;         // assumed camera FOV for sphere-px math
  const ATMOS_PX = 5;         // atmosphere shell thickness (px) — thin so the
                              // surface (and markers) get the strip
  const CAP_OVERHANG = 35;    // sphere top sits this many px above the strip
                              // (raised 25px from 10 so more of the globe's
                              // front shows in the docked strip)
  const TILT_DEG = 3;         // extra forward tilt (deg) applied to the camera
                              // target so the focused marker tips toward the
                              // user instead of sitting at the strip middle
  // Setup starts with Europe visible at the TOP of the strip. The strip shows
  // the top cap of the sphere (the camera target sits BELOW it), so the camera
  // aims south of Europe. With the raised dock (CAP_OVERHANG 35), lat_t = -1
  // puts central Europe ~20% down the strip with the Mediterranean/North
  // Africa below it.
  const SETUP_POV = { lat: -1, lng: 10 };
  const COLORS = {
    good: "#3fb950",          // var(--good)
    bad: "#f85149",           // var(--bad)
    pending: "#7fb4ff",       // current prompt, pre-answer
    anchor: "#9fb3d0",        // pre-placed anchors
    setup: "#7fb4ff",
  };

  const dock = document.getElementById("globe-dock");
  const holder = document.getElementById("globe-dock-canvas");
  const closeBtn = document.getElementById("globe-dock-close");
  if (!dock || !holder) return; // markup missing — stay a no-op

  const state = {
    mode: null,        // null | "setup" | "game" | "results"
    expanded: false,
    globe: null,
    failed: false,
    points: [],
    currentId: null,
    focusedId: null,   // id of the marker the globe is currently centred on
                       // (hovered placed card, else the current prompt)
    ringColor: COLORS.pending,
    lastRingId: null,    // id of the marker the ring was last set on (to
                         // force-clear globe.gl's lingering ring objects)
    pulsePhase: 0,     // 0..1 brightness of the focused marker's pulse glow
    pulseRaf: null,    // rAF handle for the marker pulse loop
    lastPointer: { x: 0, y: 0 },
  };

  function $(id) { return document.getElementById(id); }

  // Motion gate: OS reduced-motion (hard floor, read at call time) + FX toggle.
  function motionOK() {
    const reduced = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fxOff = !!(window.FX && window.FX.enabled === false);
    return !reduced && !fxOff;
  }

  // ---- lazy library load (globe.gl UMD + textures) --------------------
  let libPromise = null;
  function loadLib() {
    if (window.Globe && window.EARTH_TEXTURES) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      let loaded = 0;
      const done = () => { if (++loaded === 2) resolve(); };
      [
        ["assets/vendor/globe.gl.min.js", () => typeof window.Globe === "function"],
        ["assets/earth-textures.js", () => !!window.EARTH_TEXTURES],
      ].forEach(([src, check]) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => { check() ? done() : reject(new Error("bad load: " + src)); };
        s.onerror = () => reject(new Error("failed: " + src));
        document.head.appendChild(s);
      });
    });
    return libPromise;
  }

  // ---- geometry --------------------------------------------------------
  function canvasSize() {
    if (state.expanded) {
      // Expanded = 90vh globe centred on screen; keep it square.
      const vh = Math.round(window.innerHeight * 0.9);
      return Math.max(320, Math.min(vh, window.innerWidth - 20));
    }
    return Math.max(320, Math.min(MAX_S, window.innerWidth - 20));
  }
  // Sphere diameter in px at a given camera altitude (FOV-scaled).
  function spherePx(size, alt) {
    return size * (2 * Math.asin(1 / (1 + alt))) / (FOV_DEG * Math.PI / 180);
  }
  // Atmosphere shell thickness in globe-radius units for a ~5px glow.
  function applyAtmosphere() {
    if (!state.globe) return;
    const s = canvasSize();
    const alt = state.expanded ? ALT_EXPANDED : ALT_DOCKED;
    const R = spherePx(s, alt) / 2;
    try { state.globe.atmosphereAltitude(ATMOS_PX / R); } catch (_) {}
  }
  function layout() {
    if (!state.globe) return;
    const s = canvasSize();
    state.globe.width(s).height(s);
    holder.style.width = s + "px";
    holder.style.height = s + "px";
    if (state.expanded) {
      // Full-screen dock: globe centred on the screen.
      holder.style.top = "50%";
      holder.style.transform = "translate(-50%, -50%)";
    } else {
      // Sphere top sits slightly above the strip so the cap fills it.
      const topOffset = s / 2 - spherePx(s, ALT_DOCKED) / 2;
      holder.style.top = -(topOffset + CAP_OVERHANG) + "px";
      holder.style.transform = "translateX(-50%)";
    }
    applyAtmosphere();
  }

  // ---- globe instance ----------------------------------------------------
  function ensureGlobe() {
    if (state.globe || state.failed) return Promise.resolve();
    return loadLib().then(() => {
      try {
        const g = new window.Globe(holder, { waitForGlobeReady: false, animateIn: false })
          .backgroundColor("rgba(0,0,0,0)")
          .globeImageUrl(window.EARTH_TEXTURES.day)
          .bumpImageUrl(window.EARTH_TEXTURES.topo)
          .showAtmosphere(true)
          .atmosphereColor("#7fb4ff")
          .pointAltitude((d) => (d.isCurrent || d.focused ? 0.06 : 0.02))
          .pointRadius((d) => (d.isCurrent || d.focused ? 0.7 : 0.45))
          .pointColor((d) => (d.focused ? brighten(d.color, state.pulsePhase) : d.color))
          .pointLabel((d) => d.title)
          .ringColor(() => state.ringColor)
          .ringAltitude(0.01)
          .onPointClick((d, ev) => {
            const x = ev && ev.clientX ? ev.clientX : state.lastPointer.x;
            const y = ev && ev.clientY ? ev.clientY : state.lastPointer.y;
            if (api.onMarkerClick) api.onMarkerClick(d.ev, x, y);
          })
          .onPointHover((d) => {
            // Hover surfaces the SAME fact-sheet tooltip (with Leaflet map)
            // that timeline items use; null = pointer left all markers.
            // Also flips the cursor to the hand while over a marker.
            holder.classList.toggle("marker-hover", !!d);
            if (!api.onMarkerHover) return;
            if (d) api.onMarkerHover(d.ev, state.lastPointer.x, state.lastPointer.y);
            else api.onMarkerHover(null);
          });
        g.pointOfView({ lat: SETUP_POV.lat, lng: SETUP_POV.lng, altitude: ALT_DOCKED }, 0);
        state.globe = g;
        layout();
        applyMotion();
        // Tap (no drag) toggles expand; drag rotates via OrbitControls.
        // While the pointer is down the canvas shows the grabbing cursor
        // (globe.gl's inline grab/grabbing is overridden in CSS; the class
        // is our own grab-state signal).
        let down = null;
        holder.addEventListener("pointerdown", (e) => {
          down = { x: e.clientX, y: e.clientY, t: Date.now() };
          state.lastPointer = { x: e.clientX, y: e.clientY };
          holder.classList.add("is-grabbing");
        });
        const endGrab = () => holder.classList.remove("is-grabbing");
        holder.addEventListener("pointerup", (e) => {
          endGrab();
          state.lastPointer = { x: e.clientX, y: e.clientY };
          if (!down) return;
          const dx = e.clientX - down.x, dy = e.clientY - down.y;
          const moved = Math.sqrt(dx * dx + dy * dy);
          if (moved < 6 && Date.now() - down.t < 500) toggleExpand();
          down = null;
        });
        holder.addEventListener("pointercancel", endGrab);
        holder.addEventListener("pointerleave", endGrab);
        // Safety: releasing the button off-canvas must also drop the pose.
        window.addEventListener("pointerup", endGrab);
        holder.addEventListener("pointermove", (e) => {
          state.lastPointer = { x: e.clientX, y: e.clientY };
        });
        document.addEventListener("visibilitychange", () => {
          if (!state.globe) return;
          try {
            if (document.hidden) state.globe.pauseAnimation();
            else if (state.mode) state.globe.resumeAnimation();
          } catch (_) {}
        });
        window.addEventListener("resize", () => {
          layout();
          // Re-aim after a resize: the canvas size (and thus the sphere's
          // pixel radius) changed, so without re-aiming the focused marker
          // drifts to a different strip height. Only game mode uses the
          // docked compensation; setup keeps its auto-rotating POV.
          if (state.mode === "game") {
            const focused = state.focusedId
              ? state.points.find((p) => p.ev && p.ev.id === state.focusedId)
              : null;
            const target = focused || state.points.find((p) => p.isCurrent);
            if (target) aimAt(target, 0);
          }
        });
        return true;
      } catch (err) {
        console.error("globe init failed — dock disabled", err);
        state.failed = true;
        dock.classList.add("hidden");
        document.body.classList.remove("dock-active");
        return false;
      }
    });
  }

  // ---- motion / data application -----------------------------------------
  function applyMotion() {
    if (!state.globe) return;
    const motion = motionOK();
    try {
      const c = state.globe.controls();
      c.enableZoom = false; // zoom disabled by design — tap-to-expand is the zoom
      c.autoRotate = motion && (state.mode === "setup" || state.mode === "results") && !state.expanded;
      c.autoRotateSpeed = 0.55;
      c.enableDamping = motion;
    } catch (_) {}
    // The pulsing ring follows the marker the globe is currently centred on:
    // the hovered placed card when one is hovered, else the current prompt.
    // Ring pulse is motion — reduced motion gets a static highlight instead.
    const current = state.points.find((p) => p.isCurrent);
    const focused = state.focusedId
      ? state.points.find((p) => p.ev && p.ev.id === state.focusedId)
      : null;
    const ringTarget = focused || current;
    const ringId = ringTarget && ringTarget.ev ? ringTarget.ev.id : null;
    const rings = motion && ringTarget && state.mode === "game" ? [ringTarget] : [];
    // globe.gl keeps unbound ring objects (and their ripple tweens) in the
    // scene for 30s — when the target changes, clear the old ring's ripples
    // so it stops immediately instead of lingering on the previous marker.
    if (ringId !== state.lastRingId) {
      state.lastRingId = ringId;
      clearRings();
    }
    state.globe.ringsData(rings);
  }

  // Remove all ripple lines from ring groups so a ring stops the instant the
  // focus moves away (globe.gl's own removal is delayed 30s).
  function clearRings() {
    if (!state.globe) return;
    try {
      const scene = state.globe.scene();
      scene.traverse((obj) => {
        if (obj.__globeObjType === "ring") {
          while (obj.children.length) {
            const child = obj.children[0];
            obj.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          }
        }
      });
    } catch (_) {}
  }

  function syncPoints() {
    if (!state.globe) return;
    state.globe.pointsData(state.points);
    applyMotion();
  }

  // ---- focused-marker pulse glow -----------------------------------------
  // The marker the globe is centred on brightens toward white in a sine
  // pulse (motion-gated like the ring). Reduced motion keeps the static
  // larger/raised marker instead.
  function brighten(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mix = (c) => Math.round(c + (255 - c) * t);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  }
  function startPulse() {
    if (state.pulseRaf || !state.globe || !state.focusedId) return;
    if (!motionOK()) return;
    const tick = () => {
      if (!state.globe || !state.focusedId || !motionOK()) {
        state.pulseRaf = null;
        state.pulsePhase = 0;
        return;
      }
      state.pulsePhase = (Math.sin(performance.now() / 180) + 1) / 2;
      try { state.globe.pointsData(state.points); } catch (_) {}
      state.pulseRaf = requestAnimationFrame(tick);
    };
    state.pulseRaf = requestAnimationFrame(tick);
  }
  function stopPulse() {
    if (state.pulseRaf) { cancelAnimationFrame(state.pulseRaf); state.pulseRaf = null; }
    state.pulsePhase = 0;
  }
  // Mark one point as focused (pulse glow + ring target); clears the rest.
  function setFocused(id) {
    state.focusedId = id || null;
    const hasMatch = state.points.some((p) => p.ev && p.ev.id === state.focusedId);
    state.points.forEach((p) => { p.focused = !!(p.ev && p.ev.id === state.focusedId); });
    syncPoints();
    if (hasMatch) startPulse(); else stopPulse();
  }

  function aimAt(p, ms) {
    if (!state.globe || !p) return;
    const alt = state.expanded ? ALT_EXPANDED : ALT_DOCKED;
    let lat = p.lat, lng = p.lng;
    if (!state.expanded && state.mode === "game") {
      // Docked strip shows only the top cap of the sphere — the camera target
      // (screen centre) sits BELOW the strip, so centering hides the marker.
      // Aim south of the event so its marker lands half-way up the visible
      // strip. The current marker floats at pointAltitude 0.06, which shifts
      // its dot ~0.06·R·sin(δ) higher on screen — compensate (×1.06) so the
      // DOT itself (not the surface point) sits at the strip middle.
      const R = spherePx(canvasSize(), ALT_DOCKED) / 2;
      const wantY = DOCK_H * 0.5; // marker dot half-way down the strip
      const sinD = Math.max(-1, Math.min(1, (R - CAP_OVERHANG - wantY) / (R * 1.06)));
      const d = Math.asin(sinD) * 180 / Math.PI;
      // TILT_DEG tips the camera target north of the pure centering point so
      // the marker sits slightly lower in the strip — more frontal, toward
      // the user — while staying comfortably inside the visible band.
      lat = Math.max(-90, Math.min(90, p.lat - d + TILT_DEG));
    }
    try { state.globe.pointOfView({ lat, lng, altitude: alt }, ms); } catch (_) {}
  }

  // ---- mode plumbing -------------------------------------------------------
  function setMode(mode) {
    if (state.failed) return;
    state.mode = mode;
    if (mode) {
      dock.classList.remove("hidden");
      document.body.classList.add("dock-active");
      if (state.globe) { try { state.globe.resumeAnimation(); } catch (_) {} }
    }
    // Mode changes always collapse an expanded dock.
    if (state.expanded) collapse();
    updateChrome();
  }

  function updateChrome() {
    dock.classList.toggle("expanded", state.expanded);
    closeBtn.classList.toggle("hidden", !state.expanded);
  }

  function toggleExpand() {
    if (state.expanded) collapse(); else expand();
  }
  function expand() {
    if (!state.globe || state.expanded) return;
    state.expanded = true;
    updateChrome();
    layout();
    applyMotion();
    const current = state.points.find((p) => p.isCurrent);
    if (current) aimAt(current, motionOK() ? 600 : 0);
  }
  function collapse() {
    if (!state.expanded) return;
    state.expanded = false;
    updateChrome();
    layout();
    applyMotion();
    // Back in the strip: re-aim at the current prompt so its marker is
    // visible again (the strip only shows the top cap).
    if (state.mode === "game") {
      const current = state.points.find((p) => p.isCurrent);
      if (current) aimAt(current, motionOK() ? 500 : 0);
    }
  }

  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); collapse(); });

  // Map {ev, kind} items (kind: "good" | "bad" | "anchor") to point data.
  function toPoint(item, isCurrent) {
    const e = item.ev;
    const color = isCurrent ? COLORS.pending
      : item.kind === "good" ? COLORS.good
      : item.kind === "bad" ? COLORS.bad
      : item.kind === "setup" ? COLORS.setup
      : COLORS.anchor;
    return { lat: e.lat, lng: e.lng, title: e.title, ev: e, color, isCurrent: !!isCurrent, focused: false };
  }
  function hasCoords(e) { return e && !e.noMap && typeof e.lat === "number" && typeof e.lng === "number"; }

  // ---- public API ------------------------------------------------------------
  const api = {
    // timeline.js assigns these:
    //   onMarkerClick: (ev, x, y) => show hover card (click)
    //   onMarkerHover: (ev, x, y) => show hover card, (null) => hide it
    onMarkerClick: null,
    onMarkerHover: null,

    // SETUP: filtered subset as ambient points, auto-rotating.
    setSetup(events) {
      setMode("setup");
      ensureGlobe().then(() => {
        if (!state.globe) return;
        state.points = events.filter(hasCoords)
          .map((e) => toPoint({ ev: e, kind: "setup" }));
        state.currentId = null;
        state.focusedId = null;
        state.points.forEach((p) => { p.focused = false; });
        stopPulse();
        syncPoints();
      });
    },

    // GAME: placed events (state-coloured) + the current prompt on top.
    // items: [{ev, kind}], current: raw event or null.
    syncGame(items, current) {
      setMode("game");
      ensureGlobe().then(() => {
        if (!state.globe) return;
        state.ringColor = COLORS.pending;
        state.points = items.filter((it) => hasCoords(it.ev))
          .map((it) => toPoint(it))
          .concat(current && hasCoords(current)
            ? [toPoint({ ev: current }, true)] : []);
        state.currentId = current ? current.id : null;
        setFocused(state.currentId); // ring + glow start on the current prompt
        aimAt(current, motionOK() ? 700 : 0);
      });
    },

    // Wrong attempt: ring flashes the bad colour until the next render.
    markCurrent(stateName) {
      state.ringColor = stateName === "bad" ? COLORS.bad : COLORS.good;
      applyMotion();
    },

    // Hover on a placed card re-aims the globe (debounced by the caller) and
    // moves the pulsing ring + marker glow onto that marker.
    focus(ev) {
      if (state.mode !== "game" || state.expanded) return;
      if (!ev || typeof ev.lat !== "number" || typeof ev.lng !== "number") return;
      setFocused(ev.id || null);
      aimAt(ev, motionOK() ? 500 : 0);
    },

    // Toggle a visual flash/glow on the dock while a placed card is hovered.
    // (Removed 2026-09: the dock is just the container — the marker itself
    // carries the pulse glow. Kept as a no-op so old callers stay safe.)
    flashHover() {},

    // RESULTS: full recap, docked like setup — auto-rotating in the strip,
    // only expanding (full-screen) when the user taps the globe.
    showResults(items) {
      setMode("results");
      ensureGlobe().then(() => {
        if (!state.globe) return;
        state.ringColor = COLORS.pending;
        state.points = items.filter((it) => hasCoords(it.ev))
          .map((it) => toPoint(it));
        state.currentId = null;
        state.focusedId = null;
        state.points.forEach((p) => { p.focused = false; });
        stopPulse();
        syncPoints();
        // Start at the same POV as setup so the recap opens on a familiar
        // view; auto-rotate (applyMotion) takes over from there.
        try {
          state.globe.pointOfView({ lat: SETUP_POV.lat, lng: SETUP_POV.lng, altitude: ALT_DOCKED }, 0);
        } catch (_) {}
      });
    },

    // Leaving dock screens (home/browse/stats).
    hide() {
      if (state.failed) return;
      state.mode = null;
      stopPulse();
      if (state.expanded) collapse();
      dock.classList.add("hidden");
      document.body.classList.remove("dock-active");
      if (state.globe) { try { state.globe.pauseAnimation(); } catch (_) {} }
    },
  };

  window.GlobeDock = api;
})();
